// Flunky Ball: jeder Spieler am eigenen Handy.
// Das Handy, das den Raum erstellt, ist der Host: Es hält den Spielstand und schickt ihn
// über einen öffentlichen MQTT-Broker an alle anderen. Die anderen schicken nur Aktionen.
(() => {
  "use strict";

  const BROKERS = ["wss://broker.hivemq.com:8884/mqtt", "wss://broker.emqx.io:8084/mqtt"];
  const TOPIC_ROOT = "saufspiel-flunky-v1";
  const SESSION_KEY = "flunky-session";
  const NAME_KEY = "flunky-name";
  const ID_KEY = "flunky-id";
  const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // ohne 0/O und 1/I
  const MIN_PLAYERS = 2;
  const MAX_PLAYERS = 16;

  // Spielfeld in Feldeinheiten: 1 breit, FIELD_L lang. Team 0 (Rot) unten, Team 1 (Blau) oben.
  const FIELD_L = 1.6;
  const LINE_Y = [FIELD_L - 0.15, 0.15];
  const BOTTLE = { x: 0.5, y: FIELD_L / 2 };
  const RANGE = 1.3; // Wurfweite bei voller Spannung
  const HIT_R = 0.032; // so nah muss der Ball an die Flasche
  const LOW_FROM = 0.86; // ab hier (Anteil der Flugbahn) ist der Ball tief genug für einen Treffer
  const ROLL = 0.1; // nach der Landung rollt der Ball noch so weit
  const WIND_DRIFT = 0.09; // seitliche Abdrift bei vollem Wind
  const SPREAD_ANGLE = 0.09; // Streuung der Wurfrichtung (rad, gesamt)
  const SPREAD_POWER = 0.12; // Streuung der Wurfkraft (Anteil, gesamt)
  const FLIGHT_MS = 900;
  const ROLL_MS = 500;
  const STOP_MS = 2500;

  const TEAM_NAMES = ["Team Rot", "Team Blau"];
  const TEAM_COLORS = ["#ef4444", "#3b82f6"];
  const TEAM_EMOJI = ["🔴", "🔵"];

  const DRINK_TASKS = [
    "Trink, so schnell du kannst!",
    "Trink mit deiner schwachen Hand.",
    "Trink auf einem Bein.",
    "Trink und schau dabei einem Gegner in die Augen.",
    "Trink in der Hocke.",
    "Trink mit ausgestrecktem kleinen Finger.",
    "Trink und halt die andere Hand hinter den Rücken.",
    "Trink mit geschlossenen Augen.",
    "Trink und feuer dabei dein Team an (irgendwie).",
    "Trink und dreh dich einmal im Kreis.",
    "Trink mit der Flasche in beiden Händen.",
    "Trink, ohne abzusetzen!",
  ];

  const $ = (id) => document.getElementById(id);

  // --- Zustand dieses Handys ---

  const myId = loadId();
  let session = null; // { code, id, name, host }
  let S = null; // Spielstand: beim Host die Wahrheit, bei Gästen die letzte Kopie
  let client = null;
  let connected = false;
  let hostOnline = true;
  let notFoundTimer = null;
  const hostTimers = [];

  function loadId() {
    try {
      let id = localStorage.getItem(ID_KEY);
      if (!id) {
        id = randomString("abcdefghijkmnopqrstuvwxyz23456789", 10);
        localStorage.setItem(ID_KEY, id);
      }
      return id;
    } catch {
      return randomString("abcdefghijkmnopqrstuvwxyz23456789", 10);
    }
  }

  function randomString(chars, n) {
    let s = "";
    for (let i = 0; i < n; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  }

  function store(key, value) {
    try {
      if (value == null) localStorage.removeItem(key);
      else localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
    } catch {
      // Speichern ist nur Komfort.
    }
  }

  function read(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function saveSession() {
    if (!session) return store(SESSION_KEY, null);
    store(SESSION_KEY, { ...session, state: session.host ? S : undefined });
  }

  function cleanName(name) {
    return String(name ?? "").replace(/\s+/g, " ").trim().slice(0, 16) || "Spieler";
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function show(id) {
    document.querySelectorAll(".fb-screen").forEach((s) => s.classList.toggle("active", s.id === id));
  }

  // --- Verbindung ---

  function topic(sub) {
    return `${TOPIC_ROOT}/${session.code}/${sub}`;
  }

  function connect() {
    const override = new URLSearchParams(location.search).get("broker");
    const urls = override ? [override] : BROKERS;
    let i = 0;
    setConn("Verbinde…");

    const tryNext = () => {
      if (i >= urls.length) {
        leaveToStart("Keine Verbindung zum Spielserver. Ist das Internet an?");
        return;
      }
      const url = urls[i++];
      const will = session.host
        ? { topic: topic("host"), payload: "offline", qos: 1, retain: true }
        : { topic: topic("act"), payload: JSON.stringify({ type: "gone", from: session.id }), qos: 1, retain: false };
      const c = mqtt.connect(url, {
        clientId: `sfb_${session.id}_${randomString("abcdef0123456789", 6)}`,
        clean: true,
        keepalive: 20,
        connectTimeout: 6000,
        reconnectPeriod: 0, // erst nach der ersten Verbindung automatisch neu verbinden
        will,
      });
      let ok = false;
      const fail = () => {
        if (ok || client !== c) return;
        c.end(true);
        client = null;
        tryNext();
      };
      client = c;
      c.on("error", fail);
      c.on("close", () => {
        if (!ok) return fail();
        connected = false;
        updateConn();
      });
      c.on("connect", () => {
        ok = true;
        c.options.reconnectPeriod = 2000;
        connected = true;
        onConnected();
      });
      c.on("message", onMessage);
    };
    tryNext();
  }

  function onConnected() {
    updateConn();
    if (session.host) {
      client.subscribe(topic("act"), { qos: 1 });
      client.publish(topic("host"), "online", { qos: 1, retain: true });
      publishState();
    } else {
      client.subscribe([topic("state"), topic("host")], { qos: 1 });
      sendJoin();
      if (!S) {
        clearTimeout(notFoundTimer);
        notFoundTimer = setTimeout(() => {
          if (!S) leaveToStart(`Raum ${session.code} gibt es nicht (mehr).`);
        }, 6000);
      }
    }
  }

  function onMessage(t, payload) {
    const text = payload.toString();
    if (t === topic("host")) {
      const wasOnline = hostOnline;
      hostOnline = text !== "offline";
      if (hostOnline && !wasOnline) sendJoin();
      updateConn();
      return;
    }
    if (t === topic("state")) {
      if (!text) {
        if (S) leaveToStart("Der Host hat den Raum geschlossen.");
        return;
      }
      try {
        const next = JSON.parse(text);
        if (S && next.seq < S.seq && next.hostId === S.hostId) return; // veraltet
        S = next;
      } catch {
        return;
      }
      clearTimeout(notFoundTimer);
      onState();
      return;
    }
    if (t === topic("act") && session.host) {
      try {
        handleAction(JSON.parse(text));
      } catch {
        // kaputte Nachricht ignorieren
      }
    }
  }

  function send(action) {
    action.from = session.id;
    if (session.host) return handleAction(action);
    if (client && connected) client.publish(topic("act"), JSON.stringify(action), { qos: 1 });
  }

  function sendJoin() {
    send({ type: "join", name: session.name });
  }

  function setConn(text) {
    $("fb-conn").textContent = text;
  }

  function updateConn() {
    const ok = connected && (session?.host || hostOnline);
    setConn(!connected ? "Verbindung weg, verbinde neu…" : ok ? "● verbunden" : "Host ist offline…");
    $("fb-conn2").classList.toggle("bad", !ok);
    if (S) renderStatus();
  }

  function disconnect() {
    clearTimeout(notFoundTimer);
    hostTimers.forEach(clearTimeout);
    hostTimers.length = 0;
    if (client) {
      const c = client;
      client = null;
      c.end(false);
    }
    connected = false;
  }

  // --- Host: Spielregeln ---

  function newState(max) {
    return {
      v: 1,
      seq: 0,
      code: session.code,
      hostId: session.id,
      phase: "lobby", // lobby, teams, aim, flying, drink, stop, over
      max,
      players: [{ id: session.id, name: session.name, team: null, done: false, online: true }],
      turnTeam: 0,
      wind: 0,
      rot: [0, 0],
      throwerId: null,
      shot: null,
      bottleDown: false,
      drinkTeam: null,
      runnerId: null,
      runStage: null,
      winner: null,
    };
  }

  function publishState() {
    S.seq++;
    saveSession();
    if (client && connected) client.publish(topic("state"), JSON.stringify(S), { qos: 1, retain: true });
    onState();
  }

  function teamPlayers(team) {
    return S.players.filter((p) => p.team === team);
  }

  function handleAction(a) {
    if (!S || !a || typeof a.from !== "string") return;
    const p = S.players.find((x) => x.id === a.from);
    const fromHost = a.from === S.hostId;
    const running = ["aim", "flying", "drink", "stop"].includes(S.phase);

    switch (a.type) {
      case "join":
        if (p) {
          p.online = true;
          if (S.phase === "lobby") p.name = cleanName(a.name);
        } else if (S.phase === "lobby" && S.players.length < S.max) {
          S.players.push({ id: a.from, name: cleanName(a.name), team: null, done: false, online: true });
        } else {
          return; // voll oder Spiel läuft: schaut nur zu
        }
        break;
      case "gone":
        if (!p) return;
        p.online = false;
        break;
      case "leave":
        if (!p) return;
        if (S.phase === "lobby" || S.phase === "teams") {
          S.players = S.players.filter((x) => x !== p);
          S.players.forEach((x) => (x.team = null));
          S.phase = "lobby";
        } else {
          p.online = false;
        }
        break;
      case "max":
        if (!fromHost || S.phase !== "lobby") return;
        S.max = Math.max(MIN_PLAYERS, S.players.length, Math.min(MAX_PLAYERS, Number(a.max) || 0));
        break;
      case "draw":
        if (!fromHost || !["lobby", "teams"].includes(S.phase) || S.players.length < MIN_PLAYERS) return;
        shuffle(S.players).forEach((x, i) => (x.team = i % 2));
        S.phase = "teams";
        break;
      case "start":
        if (!fromHost || S.phase !== "teams") return;
        startGame();
        break;
      case "throw":
        if (S.phase !== "aim" || a.from !== S.throwerId) return;
        doThrow(a);
        break;
      case "upright":
        if (S.phase !== "drink" || a.from !== S.runnerId || S.runStage !== "aufstellen") return;
        S.runStage = "zurueck";
        S.bottleDown = false;
        break;
      case "back":
        if (S.phase !== "drink" || a.from !== S.runnerId || S.runStage !== "zurueck") return;
        endDrink();
        break;
      case "skip":
        if (!fromHost) return;
        if (S.phase === "aim") pickThrower();
        else if (S.phase === "drink") endDrink();
        else return;
        break;
      case "done":
        if (!p || p.done || p.team == null || !running) return;
        p.done = true;
        if (checkWinner()) break;
        if (S.phase === "aim" && S.throwerId === p.id) pickThrower();
        break;
      case "again":
        if (!fromHost || S.phase !== "over") return;
        S.players.forEach((x) => (x.done = false));
        S.phase = "teams";
        S.winner = null;
        S.shot = null;
        S.bottleDown = false;
        break;
      default:
        return;
    }
    publishState();
  }

  function startGame() {
    S.turnTeam = Math.random() < 0.5 ? 0 : 1;
    S.rot = [0, 0];
    S.shot = null;
    S.bottleDown = false;
    S.winner = null;
    S.phase = "aim";
    pickThrower();
  }

  function pickThrower() {
    const team = S.turnTeam;
    const list = teamPlayers(team).filter((p) => !p.done);
    if (!list.length) return checkWinner();
    // Wer offline ist, wird übersprungen, solange jemand anderes da ist.
    for (let tries = 0; tries < list.length; tries++) {
      const cand = list[S.rot[team]++ % list.length];
      if (cand.online || tries === list.length - 1) {
        S.throwerId = cand.id;
        break;
      }
    }
    S.wind = Math.round((Math.random() * 2 - 1) * 3) / 3; // -1 … 1 in Dritteln
    S.phase = "aim";
  }

  function doThrow(a) {
    let dx = Number(a.dx);
    let dy = Number(a.dy);
    const len = Math.hypot(dx, dy);
    if (!len || !isFinite(len)) return;
    const thrower = S.players.find((p) => p.id === S.throwerId);
    // Ein bisschen Zufall, wie in echt.
    const angle = Math.atan2(dy, dx) + (Math.random() - 0.5) * SPREAD_ANGLE;
    const power = Math.min(1, Math.max(0.05, Number(a.power) || 0)) * (1 + (Math.random() - 0.5) * SPREAD_POWER);
    dx = Math.cos(angle);
    dy = Math.sin(angle);
    const start = ballStart(thrower);
    const range = power * RANGE;
    S.shot = {
      id: `${S.seq}-${randomString("abc123", 4)}`,
      team: thrower.team,
      x0: start.x,
      y0: start.y,
      dx,
      dy,
      range,
      power,
      wind: S.wind || 0,
    };
    const sim = simulate(S.shot);
    S.shot.hit = sim.hit;
    S.shot.uEnd = sim.uEnd;
    S.phase = "flying";
    later(resolveShot, uToMs(sim.uEnd) + 800);
  }

  function later(fn, ms) {
    hostTimers.push(setTimeout(fn, ms));
  }

  function resolveShot() {
    if (S.phase !== "flying") return;
    if (S.shot.hit) {
      S.phase = "drink";
      S.bottleDown = true;
      S.drinkTeam = S.turnTeam;
      const others = teamPlayers(1 - S.drinkTeam);
      const pool = others.filter((p) => p.online && !p.done);
      const pick = (pool.length ? pool : others)[Math.floor(Math.random() * (pool.length || others.length))];
      S.runnerId = pick?.id ?? null;
      S.runStage = "aufstellen";
      if (!pick) return endDrink();
    } else {
      S.turnTeam = 1 - S.turnTeam;
      pickThrower();
    }
    publishState();
  }

  function endDrink() {
    S.bottleDown = false;
    S.phase = "stop";
    S.runnerId = null;
    S.runStage = null;
    const shotId = S.shot?.id;
    later(() => {
      if (S.phase !== "stop" || S.shot?.id !== shotId) return;
      S.turnTeam = 1 - S.drinkTeam;
      pickThrower();
      publishState();
    }, STOP_MS);
    publishState();
  }

  function checkWinner() {
    for (const t of [0, 1]) {
      const team = teamPlayers(t);
      if (team.length && team.every((p) => p.done)) {
        S.phase = "over";
        S.winner = t;
        return true;
      }
    }
    return false;
  }

  // --- Wurf-Physik (Host und Gäste rechnen gleich) ---

  function playerSpot(p) {
    const team = teamPlayers(p.team);
    const i = team.indexOf(p);
    return { x: (i + 1) / (team.length + 1), y: LINE_Y[p.team] + (p.team === 0 ? 0.07 : -0.07) };
  }

  function ballStart(p) {
    const spot = playerSpot(p);
    return { x: spot.x, y: LINE_Y[p.team] };
  }

  // Der Ball läuft entlang u: 0 = Abwurf, 1 = Landung, 1 + ROLL = liegt.
  // Getroffen ist, wenn er im tiefen Teil der Flugbahn oder beim Rollen die Flasche berührt.
  function simulate(shot) {
    for (let u = LOW_FROM; u <= 1 + ROLL + 1e-9; u += 0.002) {
      const b = ballAt(shot, u);
      if (Math.hypot(b.x - BOTTLE.x, b.y - BOTTLE.y) < HIT_R) return { hit: true, uEnd: u };
    }
    return { hit: false, uEnd: 1 + ROLL };
  }

  function uToMs(u) {
    if (u <= 1) return u * FLIGHT_MS;
    return FLIGHT_MS + ROLL_MS * (1 - Math.sqrt(Math.max(0, 1 - (u - 1) / ROLL)));
  }

  function msToU(t) {
    if (t <= FLIGHT_MS) return t / FLIGHT_MS;
    const k = Math.min(1, (t - FLIGHT_MS) / ROLL_MS);
    return 1 + ROLL * (1 - (1 - k) * (1 - k));
  }

  function ballAt(shot, u) {
    const drift = (shot.wind || 0) * WIND_DRIFT * Math.min(u, 1) ** 2; // Wind wirkt nur in der Luft
    return {
      x: shot.x0 + shot.dx * shot.range * u + drift,
      y: shot.y0 + shot.dy * shot.range * u,
      h: u < 1 ? Math.sin(Math.PI * u) * (0.12 + 0.25 * shot.power) : 0,
    };
  }

  // --- Anzeige ---

  let lastPhase = null;
  let shotSeenId = null;
  let shotT0 = 0;
  let drinkTask = "";
  let drinkTaskAt = 0;
  let pendingThrowSeq = null;

  function me() {
    return S?.players.find((p) => p.id === session.id) ?? null;
  }

  function playerName(id) {
    return S.players.find((p) => p.id === id)?.name ?? "?";
  }

  function onState() {
    if (!S) return;
    if (S.shot && S.shot.id !== shotSeenId) {
      shotSeenId = S.shot.id;
      shotT0 = S.phase === "flying" ? performance.now() : -1e9;
    }
    const m = me();
    if (S.phase !== lastPhase) {
      if (S.phase === "drink" && m && m.team === S.drinkTeam && !m.done) vibrate([300, 100, 300]);
      if (S.phase === "aim" && S.throwerId === session.id) vibrate(120);
      if (S.phase === "drink") newDrinkTask();
      lastPhase = S.phase;
    }
    if (S.phase === "lobby" || S.phase === "teams") {
      show("fb-lobby");
      renderLobby();
    } else {
      show("fb-game");
      keepAwake();
      renderGame();
    }
  }

  function vibrate(pattern) {
    try {
      navigator.vibrate?.(pattern);
    } catch {
      // egal
    }
  }

  function renderLobby() {
    const m = me();
    const isHost = session.host;
    $("fb-room").textContent = S.code;
    renderQr();

    const teamsPhase = S.phase === "teams";
    $("fb-waiting").hidden = teamsPhase;
    $("fb-teams").hidden = !teamsPhase;

    const list = $("fb-players");
    list.replaceChildren(...S.players.map(playerChip));
    $("fb-count").textContent = `${S.players.length} von ${S.max} Spielern`;
    $("fb-host-max").hidden = !isHost || teamsPhase;
    $("fb-lmax").textContent = S.max;

    if (teamsPhase) {
      $("fb-team0").replaceChildren(...teamPlayers(0).map(playerChip));
      $("fb-team1").replaceChildren(...teamPlayers(1).map(playerChip));
    }

    const full = S.players.length >= S.max;
    $("fb-draw").hidden = !isHost;
    $("fb-draw").textContent = teamsPhase ? "Neu losen" : "Teams auslosen";
    $("fb-draw").disabled = !teamsPhase && !(full && S.players.length >= MIN_PLAYERS);
    $("fb-draw").classList.toggle("secondary", teamsPhase);
    $("fb-start-game").hidden = !isHost || !teamsPhase;

    let hint;
    if (!m) hint = full ? "Der Raum ist leider voll." : "Du wirst gleich hinzugefügt…";
    else if (isHost) hint = teamsPhase ? "Passt? Dann los!" : full ? "Alle da! Teams auslosen." : "Warte, bis alle beigetreten sind.";
    else hint = teamsPhase ? "Gleich geht’s los…" : "Warte, bis der Host die Teams auslost.";
    $("fb-lobby-hint").textContent = hint;
  }

  function playerChip(p) {
    const li = document.createElement("li");
    li.textContent = `${p.id === S.hostId ? "👑 " : ""}${p.name}`;
    li.classList.toggle("me", p.id === session.id);
    li.classList.toggle("off", !p.online);
    return li;
  }

  let qrFor = null;
  function renderQr() {
    const link = joinLink();
    if (qrFor === link) return;
    qrFor = link;
    try {
      const qr = qrcode(0, "M");
      qr.addData(link);
      qr.make();
      $("fb-qr").innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0 });
    } catch {
      $("fb-qr").textContent = "";
    }
  }

  function joinLink() {
    return `${location.origin}${location.pathname}?raum=${session.code}`;
  }

  function renderGame() {
    const m = me();
    renderStatus();

    const drinker = m && S.phase === "drink" && m.team === S.drinkTeam && !m.done;
    const runner = S.phase === "drink" && S.runnerId === session.id;
    $("fb-drink").hidden = !drinker;
    if (drinker) {
      $("fb-drink-task").textContent = drinkTask;
      $("fb-drink-sub").textContent =
        S.runStage === "zurueck"
          ? `Weiter! ${playerName(S.runnerId)} rennt zurück hinter die Linie…`
          : `So lange, bis ${playerName(S.runnerId)} die Flasche aufgestellt hat und zurück ist.`;
    }

    $("fb-run").hidden = !runner;
    if (runner) {
      $("fb-run-balance").hidden = S.runStage !== "aufstellen";
      $("fb-run-back").hidden = S.runStage !== "zurueck";
      startRunner();
    }

    $("fb-stop").hidden = !(S.phase === "stop" && m && m.team === S.drinkTeam);

    $("fb-over").hidden = S.phase !== "over";
    if (S.phase === "over") {
      const won = m && m.team === S.winner;
      $("fb-over-title").textContent = `${TEAM_EMOJI[S.winner]} ${TEAM_NAMES[S.winner]} gewinnt!`;
      $("fb-over-sub").textContent = !m || m.team == null ? "Alle Biere leer." : won ? "Alle Biere leer. Ihr habt gewonnen! 🏆" : "Die anderen waren schneller. Austrinken!";
      $("fb-again").hidden = !session.host;
    }

    const done = $("fb-done");
    done.hidden = !m || m.team == null || S.phase === "over";
    if (m) {
      done.disabled = m.done;
      done.classList.toggle("is-done", m.done);
      done.textContent = m.done ? "✓ Fertig" : "Fertig 🍺";
    }

    const actor = S.phase === "aim" ? S.throwerId : S.phase === "drink" ? S.runnerId : null;
    const actorP = S.players.find((p) => p.id === actor);
    $("fb-skip").hidden = !session.host || !actorP || actorP.online;

    $("fb-score").replaceChildren(
      ...[0, 1].map((t) => {
        const team = teamPlayers(t);
        const open = team.filter((p) => !p.done).length;
        const div = document.createElement("div");
        div.textContent = `${TEAM_EMOJI[t]} ${open}/${team.length} Bier offen`;
        return div;
      })
    );
  }

  function renderStatus() {
    if (!S || S.phase === "lobby" || S.phase === "teams") return;
    const el = $("fb-status");
    if (connected && !session.host && !hostOnline) return (el.textContent = "Host ist offline, warte…");
    if (!connected) return (el.textContent = "Verbindung weg, verbinde neu…");
    const m = me();
    const teamOf = (id) => S.players.find((p) => p.id === id)?.team;
    let text = "";
    switch (S.phase) {
      case "aim":
        text =
          S.throwerId === session.id
            ? "Dein Wurf! Zieh nach hinten und lass los."
            : `${TEAM_EMOJI[teamOf(S.throwerId)]} ${playerName(S.throwerId)} wirft…`;
        break;
      case "flying":
        text = "Der Ball fliegt…";
        break;
      case "drink":
        text =
          S.runStage === "aufstellen"
            ? `TREFFER! ${playerName(S.runnerId)} rennt zur Flasche!`
            : `${playerName(S.runnerId)} rennt zurück!`;
        if (m && m.team === 1 - S.drinkTeam && S.runnerId !== session.id) text += " Feuert an!";
        break;
      case "stop":
        text = "✋ Flasche steht. Stopp, nicht mehr trinken!";
        break;
      case "over":
        text = `${TEAM_NAMES[S.winner]} gewinnt!`;
        break;
    }
    el.textContent = text;
  }

  function newDrinkTask() {
    let next;
    do next = DRINK_TASKS[Math.floor(Math.random() * DRINK_TASKS.length)];
    while (next === drinkTask);
    drinkTask = next;
    drinkTaskAt = performance.now();
  }

  // Bildschirm anlassen, solange gespielt wird.
  let wakeLock = null;
  async function keepAwake() {
    if (wakeLock || !("wakeLock" in navigator) || document.visibilityState !== "visible") return;
    try {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", () => (wakeLock = null));
    } catch {
      wakeLock = null;
    }
  }

  // --- Spielfeld in echtem 3D (three.js / WebGL) ---
  // Die Kamera steht hinter der eigenen Linie und schaut auf die Flasche. Darüber liegt ein
  // durchsichtiges 2D-Canvas für Zielhilfe, Namen und Wind; es nimmt auch die Finger entgegen.
  // Koordinaten: Spielfeld x (quer), y (längs) → three.js x, z; Höhe → three.js y.

  const canvas = $("fb-field");
  const ctx = canvas.getContext("2d");
  const glCanvas = $("fb-3d");
  const CAM_BACK = 0.32; // so weit hinter der Linie steht die Kamera
  const CAM_H = 0.34; // Kamerahöhe
  const CAM_PITCH = 0.45; // Blick schräg nach unten
  const BOTTLE_H = 0.1;
  const BOTTLE_R = 0.02;
  const BALL_R = 0.014;
  const PERSON_H = 0.17;
  const HOLD_H = 0.1; // Höhe des Balls in der Hand
  let view = { w: 0, h: 0, team: 0, camX: 0.5, camY: 0, focal: 1, cx: 0, cy: 0 };
  let camX = 0.5;
  let aim = null; // { sx, sy, x, y } Finger beim Zielen relativ zum Startpunkt
  let lastFrame = 0;

  function layout() {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const team = me()?.team ?? 0;
    // Wirft jemand aus dem eigenen Team, steht die Kamera hinter ihm.
    const thrower = S.players.find((p) => p.id === S.throwerId);
    const targetX = S.phase === "aim" && thrower?.team === team ? ballStart(thrower).x : 0.5;
    camX += (targetX - camX) * 0.08;
    view = {
      w,
      h,
      team,
      camX,
      camY: LINE_Y[team] + (team === 0 ? CAM_BACK : -CAM_BACK),
      focal: Math.min(w * 1.0, h * 0.6),
      cx: w / 2,
      cy: h * 0.46,
    };
  }

  // Weltpunkt (x quer, y längs, z Höhe) → Bildschirm. Gleiche Lochkamera wie die three.js-Kamera.
  function project(x, y, z) {
    const fwd = view.team === 0 ? view.camY - y : y - view.camY;
    const right = view.team === 0 ? x - view.camX : view.camX - x;
    const up = z - CAM_H;
    const c = Math.cos(CAM_PITCH);
    const sn = Math.sin(CAM_PITCH);
    const depth = fwd * c - up * sn;
    if (depth < 0.03) return null;
    const k = view.focal / depth;
    return { x: view.cx + right * k, y: view.cy - (fwd * sn + up * c) * k, k, depth };
  }

  // Kleiner fester Zufall, damit Bäume und Gras bei allen gleich aussehen.
  function seeded(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function canvasTexture(w, h, paint) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    paint(c.getContext("2d"), w, h);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  function paintGrass(g, w, h, rnd, base) {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    const greens = ["#3f8a2e", "#5aa83f", "#6dbb4a", "#4c9a37", "#82c95a", "#356f27"];
    for (let i = 0; i < (w * h) / 40; i++) {
      const x = rnd() * w;
      const y = rnd() * h;
      g.strokeStyle = greens[Math.floor(rnd() * greens.length)];
      g.globalAlpha = 0.35 + rnd() * 0.4;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + (rnd() - 0.5) * 3, y - 2 - rnd() * 4);
      g.stroke();
    }
    g.globalAlpha = 1;
  }

  const SKINS = ["#f6d3b3", "#e8b48f", "#c68863", "#8d5a3b", "#f2c9a0"];
  const HAIRS = ["#2b1d14", "#5a3a22", "#d9a441", "#1a1a1a", "#a0522d", "#e6e0d4"];
  const PANTS = ["#1f2a44", "#2d3a2a", "#3b3b3b", "#4a3426", "#24476b"];

  function looks(id) {
    let hsh = 0;
    for (const c of id) hsh = (hsh * 31 + c.charCodeAt(0)) >>> 0;
    return {
      skin: SKINS[hsh % SKINS.length],
      hair: HAIRS[(hsh >>> 4) % HAIRS.length],
      pants: PANTS[(hsh >>> 12) % PANTS.length],
      long: (hsh >>> 8) % 3 === 0,
    };
  }

  let G = null; // alles, was three.js braucht
  let glFailed = false;

  function init3D() {
    if (G || glFailed) return G;
    try {
      const renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true, powerPreference: "high-performance" });
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.1;

      const scene = new THREE.Scene();
      scene.background = canvasTexture(4, 256, (g, w, h) => {
        const sky = g.createLinearGradient(0, 0, 0, h);
        sky.addColorStop(0, "#1f6fe0");
        sky.addColorStop(0.55, "#62b2ff");
        sky.addColorStop(1, "#dff1ff");
        g.fillStyle = sky;
        g.fillRect(0, 0, w, h);
      });
      scene.fog = new THREE.Fog(0xcfe9ff, 2.5, 9);

      const camera = new THREE.PerspectiveCamera(60, 1, 0.01, 60);

      scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x3d6b2a, 1.1));
      const sun = new THREE.DirectionalLight(0xfff0d0, 2.6);
      sun.position.set(1.8, 2.6, -0.6);
      sun.target.position.set(0.5, 0, FIELD_L / 2);
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      Object.assign(sun.shadow.camera, { left: -1.3, right: 1.3, top: 1.3, bottom: -1.3, near: 0.5, far: 6 });
      sun.shadow.bias = -0.0005;
      sun.shadow.normalBias = 0.01;
      scene.add(sun, sun.target);

      const rnd = seeded(42);
      const maxAniso = renderer.capabilities.getMaxAnisotropy();

      // Wiese rundherum
      const grassTex = canvasTexture(256, 256, (g, w, h) => paintGrass(g, w, h, rnd, "#4b9636"));
      grassTex.wrapS = grassTex.wrapT = THREE.RepeatWrapping;
      grassTex.repeat.set(140, 140);
      grassTex.anisotropy = maxAniso;
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshStandardMaterial({ map: grassTex, roughness: 0.95 }));
      ground.rotation.x = -Math.PI / 2;
      ground.position.set(0.5, -0.001, FIELD_L / 2);
      ground.receiveShadow = true;
      scene.add(ground);

      // Spielfeld: hellere Mähstreifen als durchsichtige Schicht über der feinen Wiese
      const fieldTex = canvasTexture(4, 24, (g, w, h) => {
        for (let i = 0; i < 12; i++) {
          g.fillStyle = i % 2 ? "rgba(190,255,150,0.22)" : "rgba(150,230,110,0.12)";
          g.fillRect(0, (i * h) / 12, w, h / 12);
        }
      });
      fieldTex.magFilter = THREE.NearestFilter;
      const field = new THREE.Mesh(
        new THREE.PlaneGeometry(1, FIELD_L),
        new THREE.MeshStandardMaterial({ map: fieldTex, transparent: true, roughness: 0.9, depthWrite: false })
      );
      field.rotation.x = -Math.PI / 2;
      field.position.set(0.5, 0.0005, FIELD_L / 2);
      field.receiveShadow = true;
      scene.add(field);

      for (const t of [0, 1]) {
        const line = new THREE.Mesh(
          new THREE.BoxGeometry(1.1, 0.002, 0.012),
          new THREE.MeshStandardMaterial({ color: TEAM_COLORS[t], emissive: TEAM_COLORS[t], emissiveIntensity: 0.35 })
        );
        line.position.set(0.5, 0.001, LINE_Y[t]);
        line.receiveShadow = true;
        scene.add(line);
      }
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.115, 0.122, 72),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(BOTTLE.x, 0.0015, BOTTLE.y);
      scene.add(ring);

      addScenery(scene, rnd);

      // Flasche: gedrehtes Profil aus grünem Glas, Etikett und Kronkorken
      const bottle = new THREE.Group();
      const profile = [
        [0, 0], [0.98, 0], [1, 0.04], [1, 0.55], [0.93, 0.66], [0.55, 0.78], [0.42, 0.86], [0.4, 0.97], [0.45, 1], [0, 1],
      ].map(([r, y]) => new THREE.Vector2(r * BOTTLE_R, y * BOTTLE_H));
      const glass = new THREE.Mesh(
        new THREE.LatheGeometry(profile, 32),
        new THREE.MeshPhysicalMaterial({ color: 0x1e8a3c, roughness: 0.12, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, transparent: true, opacity: 0.88 })
      );
      glass.castShadow = true;
      const labelTex = canvasTexture(128, 64, (g, w, h) => {
        g.fillStyle = "#f8f3e6";
        g.fillRect(0, 0, w, h);
        g.fillStyle = "#c81e1e";
        g.fillRect(0, h * 0.3, w, h * 0.4);
        g.fillStyle = "#f5c518";
        g.font = "bold 20px sans-serif";
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText("PILS", w / 4, h / 2);
        g.fillText("PILS", (3 * w) / 4, h / 2);
      });
      const label = new THREE.Mesh(
        new THREE.CylinderGeometry(BOTTLE_R * 1.01, BOTTLE_R * 1.01, BOTTLE_H * 0.22, 32, 1, true),
        new THREE.MeshStandardMaterial({ map: labelTex, roughness: 0.6 })
      );
      label.position.y = BOTTLE_H * 0.32;
      const cap = new THREE.Mesh(
        new THREE.CylinderGeometry(BOTTLE_R * 0.47, BOTTLE_R * 0.47, BOTTLE_H * 0.05, 20),
        new THREE.MeshStandardMaterial({ color: 0xf5c518, metalness: 0.8, roughness: 0.3 })
      );
      cap.position.y = BOTTLE_H * 1.0;
      bottle.add(glass, label, cap);
      bottle.position.set(BOTTLE.x, 0, BOTTLE.y);
      scene.add(bottle);

      const puddle = new THREE.Mesh(
        new THREE.CircleGeometry(1, 40),
        new THREE.MeshStandardMaterial({ color: 0xf2b72a, transparent: true, opacity: 0.6, roughness: 0.1 })
      );
      puddle.rotation.x = -Math.PI / 2;
      puddle.visible = false;
      scene.add(puddle);

      // Ball mit orangem Streifen
      const ballTex = canvasTexture(128, 64, (g, w, h) => {
        g.fillStyle = "#ffffff";
        g.fillRect(0, 0, w, h);
        g.fillStyle = "#f97316";
        g.fillRect(0, h * 0.42, w, h * 0.16);
        g.fillRect(w * 0.22, 0, w * 0.06, h);
        g.fillRect(w * 0.72, 0, w * 0.06, h);
      });
      const ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 28, 18), new THREE.MeshStandardMaterial({ map: ballTex, roughness: 0.45 }));
      ball.castShadow = true;
      scene.add(ball);

      G = { renderer, scene, camera, bottle, puddle, ball, people: new Map(), fall: 0, size: "" };
    } catch (err) {
      console.error(err);
      glFailed = true;
      G = null;
    }
    return G;
  }

  // Bäume, Hügel, Bierkisten in Teamfarben und Fähnchen rund ums Feld
  function addScenery(scene, rnd) {
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.9 });
    const leafColors = [0x2f7d32, 0x3c9a3f, 0x4caf50, 0x26663a, 0x6bb33e];
    const leafGeo = new THREE.IcosahedronGeometry(1, 1);
    const trunkGeo = new THREE.CylinderGeometry(0.6, 0.8, 1, 8);
    for (let i = 0; i < 70; i++) {
      const a = rnd() * Math.PI * 2;
      const r = 2.2 + rnd() * 4;
      const x = 0.5 + Math.cos(a) * r * 0.9;
      const z = FIELD_L / 2 + Math.sin(a) * r;
      const s = 0.12 + rnd() * 0.14;
      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.scale.set(s * 0.12, s * 0.9, s * 0.12);
      trunk.position.y = s * 0.45;
      const leaves = new THREE.Mesh(leafGeo, new THREE.MeshStandardMaterial({ color: leafColors[Math.floor(rnd() * leafColors.length)], roughness: 0.8, flatShading: true }));
      leaves.scale.set(s * 0.55, s * 0.7, s * 0.55);
      leaves.position.y = s * 1.15;
      tree.add(trunk, leaves);
      tree.position.set(x, 0, z);
      tree.traverse((o) => (o.castShadow = true));
      scene.add(tree);
    }
    // Wolken
    const cloudTex = canvasTexture(128, 64, (g, w, h) => {
      for (const [x, y, r] of [[40, 38, 22], [64, 28, 26], [90, 38, 20], [64, 42, 22]]) {
        const grad = g.createRadialGradient(x, y, 2, x, y, r);
        grad.addColorStop(0, "rgba(255,255,255,1)");
        grad.addColorStop(1, "rgba(255,255,255,0)");
        g.fillStyle = grad;
        g.fillRect(0, 0, w, h);
      }
    });
    for (let i = 0; i < 14; i++) {
      const a = rnd() * Math.PI * 2;
      const cloud = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, fog: false, transparent: true, opacity: 0.9, depthWrite: false }));
      const s = 2 + rnd() * 2;
      cloud.scale.set(s, s / 2, 1);
      cloud.position.set(0.5 + Math.cos(a) * 12, 1.4 + rnd() * 1.8, FIELD_L / 2 + Math.sin(a) * 12);
      scene.add(cloud);
    }
    const hillMat = new THREE.MeshStandardMaterial({ color: 0x5f9e45, roughness: 1 });
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + rnd() * 0.3;
      const hill = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12), hillMat);
      hill.scale.set(1.5 + rnd(), 0.35 + rnd() * 0.3, 1.5 + rnd());
      hill.position.set(0.5 + Math.cos(a) * 8, -0.1, FIELD_L / 2 + Math.sin(a) * 8);
      scene.add(hill);
    }
    // Bierkisten hinter den Linien
    for (const t of [0, 1]) {
      const mat = new THREE.MeshStandardMaterial({ color: TEAM_COLORS[t], roughness: 0.6 });
      const behind = t === 0 ? 1 : -1;
      for (let i = 0; i < 3; i++) {
        const crate = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.045, 0.05), mat);
        const side = i === 2 ? 0.03 : 0;
        crate.position.set(1.12 + (i % 2) * 0.08 - side, 0.0225 + (i === 2 ? 0.045 : 0), LINE_Y[t] + behind * 0.12);
        crate.castShadow = crate.receiveShadow = true;
        scene.add(crate);
      }
    }
    // Wimpelkette quer hinter dem Feld
    const flagColors = [0xef4444, 0xf59e0b, 0xfacc15, 0x22c55e, 0x3b82f6, 0xa855f7, 0xec4899];
    for (const t of [0, 1]) {
      const z = t === 0 ? FIELD_L + 0.35 : -0.35;
      for (let i = 0; i < 18; i++) {
        const x = -0.2 + (i / 17) * 1.4;
        const sag = 0.06 * Math.sin((i / 17) * Math.PI);
        const flag = new THREE.Mesh(
          new THREE.ConeGeometry(0.018, 0.04, 3),
          new THREE.MeshStandardMaterial({ color: flagColors[i % flagColors.length], emissive: flagColors[i % flagColors.length], emissiveIntensity: 0.45, roughness: 0.7 })
        );
        flag.rotation.x = Math.PI;
        flag.position.set(x, 0.32 - sag, z);
        scene.add(flag);
      }
      for (const x of [-0.22, 1.22]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.34, 8), trunkMat);
        pole.position.set(x, 0.17, z);
        pole.castShadow = true;
        scene.add(pole);
      }
    }
  }

  function capsule(r, len, mat) {
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 6, 12), mat);
    m.castShadow = true;
    return m;
  }

  // Figur aus Kapseln: Beine, Oberkörper, Arme, Kopf mit Haaren und ein Bier in der Hand.
  function makePerson(p) {
    const look = looks(p.id);
    const shirtMat = new THREE.MeshStandardMaterial({ color: TEAM_COLORS[p.team], roughness: 0.7, transparent: true });
    const pantsMat = new THREE.MeshStandardMaterial({ color: look.pants, roughness: 0.8, transparent: true });
    const skinMat = new THREE.MeshStandardMaterial({ color: look.skin, roughness: 0.6, transparent: true });
    const hairMat = new THREE.MeshStandardMaterial({ color: look.hair, roughness: 0.9, transparent: true });
    const shoeMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5, transparent: true });
    const beerMat = new THREE.MeshStandardMaterial({ color: 0x8a4b0f, roughness: 0.2, transparent: true });
    const mats = [shirtMat, pantsMat, skinMat, hairMat, shoeMat, beerMat];

    const body = new THREE.Group();
    const legs = [];
    for (const side of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(side * 0.012, 0.075, 0);
      const leg = capsule(0.01, 0.055, pantsMat);
      leg.position.y = -0.037;
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.01, 0.028), shoeMat);
      shoe.position.set(0, -0.07, 0.006);
      shoe.castShadow = true;
      hip.add(leg, shoe);
      body.add(hip);
      legs.push(hip);
    }
    const torso = capsule(0.024, 0.035, shirtMat);
    torso.scale.set(1.1, 1, 0.75);
    torso.position.y = 0.105;
    body.add(torso);
    const arms = [];
    for (const side of [-1, 1]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * 0.032, 0.128, 0);
      const arm = capsule(0.0075, 0.042, shirtMat);
      arm.position.y = -0.025;
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.008, 12, 8), skinMat);
      hand.position.y = -0.052;
      shoulder.add(arm, hand);
      shoulder.rotation.z = side * 0.12;
      body.add(shoulder);
      arms.push({ shoulder, hand });
    }
    const beer = new THREE.Mesh(new THREE.CylinderGeometry(0.0065, 0.0065, 0.032, 12), beerMat);
    beer.position.set(0, -0.058, 0.008);
    beer.castShadow = true;
    arms[0].shoulder.add(beer);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.007, 0.01, 10), skinMat);
    neck.position.y = 0.142;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.017, 20, 14), skinMat);
    head.position.y = 0.158;
    head.castShadow = true;
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.0182, 20, 10, 0, Math.PI * 2, 0, Math.PI * (look.long ? 0.62 : 0.48)), hairMat);
    hair.position.y = 0.16;
    hair.rotation.x = -0.25;
    body.add(neck, head, hair);
    if (look.long) {
      const tail = capsule(0.012, 0.02, hairMat);
      tail.position.set(0, 0.145, -0.012);
      body.add(tail);
    }
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x222222 });
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.0025, 8, 6), eyeMat);
      eye.position.set(side * 0.0065, 0.161, 0.0155);
      body.add(eye);
    }
    const marker = new THREE.Mesh(
      new THREE.RingGeometry(0.03, 0.037, 40),
      new THREE.MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.9 })
    );
    marker.rotation.x = -Math.PI / 2;
    marker.position.y = 0.002;
    const root = new THREE.Group();
    root.add(body, marker);
    return { root, body, legs, arms, beer, marker, mats, shirtMat, team: p.team, pos: null, run: 0 };
  }

  function draw(now) {
    layout();
    const dt = Math.min(0.05, (now - (lastFrame || now)) / 1000);
    lastFrame = now;
    const g = init3D();
    ctx.clearRect(0, 0, view.w, view.h);
    if (!g) {
      ctx.fillStyle = "#fff";
      ctx.font = "600 16px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("3D wird auf diesem Gerät nicht unterstützt.", view.w / 2, view.h / 2);
      return;
    }

    // Größe und Kamera passend zur Lochkamera in project()
    const size = `${view.w}x${view.h}`;
    if (g.size !== size) {
      g.renderer.setSize(view.w, view.h, false);
      g.size = size;
    }
    const cam = g.camera;
    cam.aspect = view.w / view.h;
    cam.fov = (2 * Math.atan(view.h / 2 / view.focal) * 180) / Math.PI;
    cam.setViewOffset(view.w, view.h, 0, view.h / 2 - view.cy, view.w, view.h);
    cam.updateProjectionMatrix();
    const fwd = view.team === 0 ? -1 : 1;
    cam.position.set(view.camX, CAM_H, view.camY);
    cam.lookAt(view.camX, CAM_H - Math.sin(CAM_PITCH), view.camY + fwd * Math.cos(CAM_PITCH));

    const shot = S.shot;
    let u = null;
    if (shot && ["flying", "drink", "stop"].includes(S.phase)) u = Math.min(shot.uEnd, msToU(now - shotT0));
    const flyingHitDone = S.phase === "flying" && shot?.hit && u >= shot.uEnd;
    const bottleDown = (S.bottleDown && S.phase === "drink") || flyingHitDone;

    // Flasche kippt weich um und wird wieder aufgestellt
    g.fall += ((bottleDown ? 1 : 0) - g.fall) * Math.min(1, dt * (bottleDown ? 14 : 6));
    const dir = shot ? new THREE.Vector3(shot.dx, 0, shot.dy).normalize() : new THREE.Vector3(0, 0, 1);
    const lying = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    g.bottle.quaternion.slerpQuaternions(new THREE.Quaternion(), lying, g.fall);
    g.bottle.position.y = BOTTLE_R * g.fall;

    // Bierpfütze
    g.puddle.visible = S.phase === "drink" && !!shot;
    if (g.puddle.visible) {
      const grow = Math.min(1, (now - drinkTaskAt) / 4000);
      const r = 0.02 + 0.05 * grow;
      g.puddle.scale.set(r, r * 0.8, 1);
      g.puddle.position.set(BOTTLE.x + shot.dx * BOTTLE_H, 0.0012, BOTTLE.y + shot.dy * BOTTLE_H);
    }

    const names = [];
    updatePeople(g, now, dt, names);

    // Ball
    const thrower = S.players.find((p) => p.id === S.throwerId);
    let overlayBall = null;
    g.ball.visible = false;
    if (S.phase === "aim" && thrower) {
      const st = ballStart(thrower);
      const person = g.people.get(thrower.id);
      if (thrower.id === session.id) {
        const rest = project(st.x, st.y, HOLD_H);
        if (aim && rest) overlayBall = { st, rest };
        else if (rest) {
          g.ball.visible = true;
          g.ball.position.set(st.x, HOLD_H, st.y);
        }
      } else if (person?.root.visible) {
        g.ball.visible = true;
        person.arms[1].hand.getWorldPosition(g.ball.position);
        g.ball.position.y += BALL_R;
      } else {
        g.ball.visible = true;
        g.ball.position.set(st.x, HOLD_H, st.y);
      }
    } else if (u != null && (S.phase === "flying" || !shot.hit)) {
      const b = ballAt(shot, u);
      g.ball.visible = true;
      g.ball.position.set(b.x, b.h + BALL_R, b.y);
      g.ball.rotation.x = u * 25 * fwd;
    }

    g.renderer.render(g.scene, cam);

    // 2D-Overlay: Namen, Zielhilfe, Wind
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.shadowColor = "rgba(0,0,0,0.8)";
    ctx.shadowBlur = 4;
    for (const n of names) {
      ctx.font = `700 ${n.size}px system-ui, sans-serif`;
      ctx.fillStyle = "#fff";
      ctx.fillText(n.text, n.x, n.y);
    }
    ctx.shadowBlur = 0;
    if (overlayBall) {
      drawAim(overlayBall.st, overlayBall.rest);
      const off = pullVector();
      drawBallAt(overlayBall.rest.x + off.x, overlayBall.rest.y + off.y, BALL_R * overlayBall.rest.k);
    }
    drawWind();

    if (S.phase === "drink" && now - drinkTaskAt > 8000) {
      newDrinkTask();
      if (!$("fb-drink").hidden) $("fb-drink-task").textContent = drinkTask;
    }
  }

  function updatePeople(g, now, dt, names) {
    const seen = new Set();
    for (const p of S.players) {
      if (p.team == null) continue;
      seen.add(p.id);
      let person = g.people.get(p.id);
      if (!person || person.team !== p.team) {
        if (person) g.scene.remove(person.root);
        person = makePerson(p);
        g.people.set(p.id, person);
        g.scene.add(person.root);
      }
      const runner = S.phase === "drink" && p.id === S.runnerId;
      const thrower = S.phase === "aim" && p.id === S.throwerId;
      const target = runner && S.runStage === "aufstellen" ? { x: BOTTLE.x + 0.08, y: BOTTLE.y } : playerSpot(p);
      if (!person.pos) person.pos = { ...target };
      // weich zum Ziel laufen
      const dx = target.x - person.pos.x;
      const dy = target.y - person.pos.y;
      const dist = Math.hypot(dx, dy);
      const step = Math.min(dist, dt * 0.9);
      if (dist > 0.0005) {
        person.pos.x += (dx / dist) * step;
        person.pos.y += (dy / dist) * step;
      }
      const moving = dist > 0.01;
      person.root.position.set(person.pos.x, 0, person.pos.y);

      const pp = project(person.pos.x, person.pos.y, 0);
      person.root.visible = !!pp && pp.depth >= 0.4; // direkt neben der Kamera nur im Weg
      if (!person.root.visible) continue;

      // Läufer schaut in Laufrichtung, sonst zur Kamera
      const face = moving ? Math.atan2(dx, dy) : Math.atan2(view.camX - person.pos.x, view.camY - person.pos.y);
      person.root.rotation.y = face;

      person.run = moving || (runner && S.runStage === "zurueck") ? person.run + dt * 14 : 0;
      const swing = Math.sin(person.run) * (moving ? 0.7 : 0.25);
      person.legs[0].rotation.x = swing;
      person.legs[1].rotation.x = -swing;
      person.body.position.y = moving ? Math.abs(Math.sin(person.run)) * 0.006 : 0;
      person.arms[0].shoulder.rotation.x = -swing * 0.8;
      if (thrower) {
        person.arms[1].shoulder.rotation.set(0, 0, 2.6 + Math.sin(now / 300) * 0.08);
      } else {
        person.arms[1].shoulder.rotation.set(swing * 0.8, 0, 0.12);
      }
      person.beer.visible = !p.done;
      person.shirtMat.color.set(p.done ? "#6b7280" : TEAM_COLORS[p.team]);
      const alpha = p.online ? 1 : 0.45;
      person.mats.forEach((m) => (m.opacity = alpha));
      person.marker.visible = thrower || runner;
      person.marker.scale.setScalar(1 + Math.sin(now / 150) * 0.08);

      const head = project(person.pos.x, person.pos.y, PERSON_H + 0.03);
      if (head) {
        const name = p.name.length > 9 ? p.name.slice(0, 8) + "…" : p.name;
        names.push({ text: p.done ? `✓ ${name}` : name, x: head.x, y: head.y, size: Math.max(11, Math.min(16, Math.round(0.02 * head.k))) });
      }
    }
    for (const [id, person] of g.people) {
      if (!seen.has(id)) {
        g.scene.remove(person.root);
        g.people.delete(id);
      }
    }
  }

  function drawBallAt(x, y, r) {
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(x, y, Math.max(2, r), 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#f97316";
    ctx.lineWidth = Math.max(1, r * 0.25);
    ctx.stroke();
  }

  function drawWind() {
    const wind = S.phase === "aim" ? S.wind || 0 : S.phase === "flying" ? S.shot?.wind || 0 : null;
    if (wind == null) return;
    const strength = Math.round(Math.abs(wind) * 3);
    const toRight = (wind > 0) === (view.team === 0);
    const text = strength ? `💨 Wind ${(toRight ? "→" : "←").repeat(strength)}` : "💨 Windstill";
    ctx.font = "700 16px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const tw = ctx.measureText(text).width + 24;
    const y = 92;
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.beginPath();
    ctx.roundRect?.(view.w / 2 - tw / 2, y - 15, tw, 30, 15);
    if (!ctx.roundRect) ctx.rect(view.w / 2 - tw / 2, y - 15, tw, 30);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.fillText(text, view.w / 2, y);
  }

  function maxPull() {
    return view.h * 0.3;
  }

  function pullVector() {
    const len = Math.hypot(aim.x, aim.y);
    const k = len > maxPull() ? maxPull() / len : 1;
    return { x: aim.x * k, y: aim.y * k, power: Math.min(1, len / maxPull()), len };
  }

  // Zug nach unten = Kraft, seitlich ziehen lenkt in die Gegenrichtung (wie eine Schleuder).
  function aimDirection(v) {
    if (v.y <= 0) return null;
    const a = Math.max(-1, Math.min(1, Math.atan2(-v.x * 0.5, v.y)));
    const fwd = view.team === 0 ? -1 : 1;
    return { dx: Math.sin(a) * -fwd, dy: Math.cos(a) * fwd };
  }

  function drawAim(st, rest) {
    const v = pullVector();
    if (v.len < 4) return;
    const px = rest.x + v.x;
    const py = rest.y + v.y;
    const arm = BALL_R * rest.k * 2.5;
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(rest.x - arm, rest.y);
    ctx.lineTo(px, py);
    ctx.lineTo(rest.x + arm, rest.y);
    ctx.stroke();
    // nur die Richtung am Boden, nicht die Weite
    const dir = aimDirection(v);
    if (!dir) return;
    const a = project(st.x, st.y, 0);
    const b = project(st.x + dir.dx * 0.22, st.y + dir.dy * 0.22, 0);
    if (!a || !b) return;
    ctx.strokeStyle = "rgba(255,255,255,0.6)";
    ctx.setLineDash([6, 6]);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function canThrow() {
    return S && S.phase === "aim" && S.throwerId === session.id && pendingThrowSeq !== S.seq && connected;
  }

  canvas.addEventListener("pointerdown", (e) => {
    if (!canThrow()) return;
    canvas.setPointerCapture(e.pointerId);
    aim = { sx: e.clientX, sy: e.clientY, x: 0, y: 0 };
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!aim) return;
    aim.x = e.clientX - aim.sx;
    aim.y = e.clientY - aim.sy;
  });
  const release = (e) => {
    if (!aim) return;
    const v = pullVector();
    aim = null;
    const dir = aimDirection(v);
    if (e.type !== "pointerup" || !dir || v.power < 0.08 || !canThrow()) return;
    pendingThrowSeq = S.seq;
    send({ type: "throw", dx: dir.dx, dy: dir.dy, power: v.power });
  };
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);

  function loop(now) {
    requestAnimationFrame(loop);
    // Während die Läufer-Aufgabe den Bildschirm verdeckt, braucht es kein 3D.
    if (S && $("fb-game").classList.contains("active") && $("fb-run").hidden) draw(now);
    if (runnerActive) runnerFrame(now);
  }
  requestAnimationFrame(loop);

  // --- Läufer: Flasche ausbalancieren, dann zurückrennen ---

  const bal = $("fb-balance");
  const bctx = bal.getContext("2d");
  let runnerActive = false;
  let runKey = null;
  let B = null; // Balance-Zustand
  let feet = { count: 0, next: "l" };
  const FEET_NEEDED = 18;

  function startRunner() {
    const key = `${S.shot?.id}-${S.runStage}`;
    runnerActive = S.runStage === "aufstellen";
    if (key === runKey) return;
    runKey = key;
    if (S.runStage === "aufstellen") {
      B = { theta: (Math.random() < 0.5 ? -1 : 1) * 0.6, omega: 0, progress: 0, t: 0, last: null, finger: null, sent: false, fell: 0 };
    } else {
      feet = { count: 0, next: "l", sent: false };
      renderFeet();
    }
  }

  function runnerFrame(now) {
    if (!S || S.phase !== "drink" || S.runnerId !== session.id || S.runStage !== "aufstellen") {
      runnerActive = false;
      return;
    }
    const dt = B.last == null ? 0 : Math.min(0.033, (now - B.last) / 1000);
    B.last = now;
    B.t += dt;
    const w = bal.clientWidth;
    const wind = 1.7 * Math.sin(1.4 * B.t) + 1.2 * Math.sin(3.1 * B.t + 1.7);
    const push = B.finger == null ? 0 : Math.max(-1, Math.min(1, (B.finger - w / 2) / (w * 0.35)));
    const alpha = 4.5 * Math.sin(B.theta) + wind + 8 * push - 1.5 * B.omega;
    B.omega += alpha * dt;
    B.theta += B.omega * dt;
    if (Math.abs(B.theta) < 0.2) B.progress = Math.min(1, B.progress + dt / 3.5);
    else B.progress = Math.max(0, B.progress - dt * 0.25);
    if (Math.abs(B.theta) > 1.25) {
      B.theta = Math.sign(B.theta) * 0.5;
      B.omega = 0;
      B.progress = Math.max(0, B.progress - 0.3);
      B.fell = now;
      vibrate(80);
    }
    $("fb-balance-bar").style.width = `${B.progress * 100}%`;
    drawBalance(now);
    if (B.progress >= 1 && !B.sent) {
      B.sent = true;
      send({ type: "upright" });
    }
  }

  function drawBalance(now) {
    const dpr = window.devicePixelRatio || 1;
    const w = bal.clientWidth;
    const h = bal.clientHeight;
    if (bal.width !== Math.round(w * dpr)) {
      bal.width = Math.round(w * dpr);
      bal.height = Math.round(h * dpr);
    }
    bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    bctx.clearRect(0, 0, w, h);
    const bx = w / 2;
    const by = h - 24;
    // Zielbereich
    bctx.fillStyle = "rgba(34,197,94,0.18)";
    bctx.beginPath();
    bctx.moveTo(bx, by);
    bctx.arc(bx, by, h - 40, -Math.PI / 2 - 0.2, -Math.PI / 2 + 0.2);
    bctx.closePath();
    bctx.fill();
    // Boden
    bctx.fillStyle = "#348a41";
    bctx.fillRect(0, by, w, h - by);
    // Flasche
    bctx.save();
    bctx.translate(bx, by);
    bctx.rotate(B.theta);
    bctx.fillStyle = "#166534";
    bctx.beginPath();
    bctx.moveTo(-24, 0);
    bctx.lineTo(-24, -110);
    bctx.quadraticCurveTo(-24, -140, -9, -158);
    bctx.lineTo(-9, -190);
    bctx.lineTo(9, -190);
    bctx.lineTo(9, -158);
    bctx.quadraticCurveTo(24, -140, 24, -110);
    bctx.lineTo(24, 0);
    bctx.closePath();
    bctx.fill();
    bctx.fillStyle = "#f5f0ff";
    bctx.fillRect(-20, -90, 40, 40);
    bctx.fillStyle = "#facc15";
    bctx.fillRect(-10, -198, 20, 9);
    bctx.restore();
    if (now - B.fell < 700) {
      bctx.fillStyle = "#fca5a5";
      bctx.font = "700 22px system-ui, sans-serif";
      bctx.textAlign = "center";
      bctx.fillText("Umgefallen!", bx, 30);
    }
  }

  const balFinger = (e) => {
    const r = bal.getBoundingClientRect();
    if (B) B.finger = e.clientX - r.left;
  };
  bal.addEventListener("pointerdown", (e) => {
    bal.setPointerCapture(e.pointerId);
    balFinger(e);
  });
  bal.addEventListener("pointermove", (e) => {
    if (B && B.finger != null) balFinger(e);
  });
  const balUp = () => B && (B.finger = null);
  bal.addEventListener("pointerup", balUp);
  bal.addEventListener("pointercancel", balUp);

  function step(foot) {
    if (!S || S.runStage !== "zurueck" || feet.sent) return;
    if (foot === feet.next) {
      feet.count++;
      feet.next = foot === "l" ? "r" : "l";
    }
    renderFeet();
    if (feet.count >= FEET_NEEDED) {
      feet.sent = true;
      send({ type: "back" });
    }
  }

  function renderFeet() {
    $("fb-foot-l").classList.toggle("next", feet.next === "l");
    $("fb-foot-r").classList.toggle("next", feet.next === "r");
    $("fb-run-bar").style.width = `${(feet.count / FEET_NEEDED) * 100}%`;
  }

  $("fb-foot-l").addEventListener("pointerdown", () => step("l"));
  $("fb-foot-r").addEventListener("pointerdown", () => step("r"));

  // --- Start, Lobby, Buttons ---

  let createMax = 4;

  function startSession(s, state) {
    session = s;
    S = state;
    hostOnline = true;
    lastPhase = null;
    shotSeenId = null;
    pendingThrowSeq = null;
    store(NAME_KEY, s.name);
    saveSession();
    history.replaceState(null, "", `${location.pathname}?raum=${s.code}${brokerParam()}`);
    $("fb-room").textContent = s.code;
    renderQr();
    if (S) onState();
    else {
      show("fb-lobby");
      $("fb-players").replaceChildren();
      $("fb-count").textContent = "";
      $("fb-lobby-hint").textContent = "Suche Raum…";
      ["fb-draw", "fb-start-game", "fb-host-max", "fb-teams"].forEach((id) => ($(id).hidden = true));
    }
    connect();
    if (session.host) resumeHostTimers();
  }

  function brokerParam() {
    const b = new URLSearchParams(location.search).get("broker");
    return b ? `&broker=${encodeURIComponent(b)}` : "";
  }

  // Nach einem Neuladen des Hosts hängen gebliebene Phasen weiterführen.
  function resumeHostTimers() {
    if (S.phase === "flying") later(resolveShot, 300);
    if (S.phase === "stop") {
      later(() => {
        if (S.phase !== "stop") return;
        S.turnTeam = 1 - S.drinkTeam;
        pickThrower();
        publishState();
      }, 1000);
    }
  }

  function leaveToStart(error) {
    disconnect();
    session = null;
    S = null;
    store(SESSION_KEY, null);
    history.replaceState(null, "", `${location.pathname}${brokerParam().replace("&", "?")}`);
    showStart(error);
  }

  function showStart(error) {
    show("fb-start");
    const err = $("fb-start-error");
    err.hidden = !error;
    err.textContent = error || "";
    $("fb-max").textContent = createMax;
    const saved = parseSaved();
    $("fb-resume").hidden = !saved;
    if (saved) $("fb-resume").textContent = `Zurück in Raum ${saved.code}`;
  }

  function parseSaved() {
    try {
      const s = JSON.parse(read(SESSION_KEY));
      return s && s.code && s.id === myId ? s : null;
    } catch {
      return null;
    }
  }

  function nameOrError() {
    const name = $("fb-name").value.trim();
    if (!name) {
      showStart("Gib zuerst deinen Namen ein.");
      $("fb-name").focus();
      return null;
    }
    return cleanName(name);
  }

  $("fb-max-minus").onclick = () => {
    createMax = Math.max(MIN_PLAYERS, createMax - 1);
    $("fb-max").textContent = createMax;
  };
  $("fb-max-plus").onclick = () => {
    createMax = Math.min(MAX_PLAYERS, createMax + 1);
    $("fb-max").textContent = createMax;
  };

  $("fb-create").onclick = () => {
    const name = nameOrError();
    if (!name) return;
    const s = { code: randomString(CODE_CHARS, 4), id: myId, name, host: true };
    session = s;
    startSession(s, newState(createMax));
  };

  $("fb-join").onclick = () => {
    const name = nameOrError();
    if (!name) return;
    const code = $("fb-code").value.trim().toUpperCase();
    if (code.length !== 4) return showStart("Der Raumcode hat 4 Zeichen.");
    startSession({ code, id: myId, name, host: false }, null);
  };
  $("fb-code").addEventListener("keydown", (e) => e.key === "Enter" && $("fb-join").click());

  $("fb-resume").onclick = () => {
    const saved = parseSaved();
    if (!saved) return showStart();
    const { state, ...s } = saved;
    if (s.host && state) state.players.forEach((p) => (p.online = p.id === s.id));
    startSession(s, s.host ? state : null);
  };

  $("fb-lmax-minus").onclick = () => send({ type: "max", max: S.max - 1 });
  $("fb-lmax-plus").onclick = () => send({ type: "max", max: S.max + 1 });
  $("fb-draw").onclick = () => send({ type: "draw" });
  $("fb-start-game").onclick = () => send({ type: "start" });
  $("fb-again").onclick = () => send({ type: "again" });
  $("fb-skip").onclick = () => send({ type: "skip" });

  $("fb-done").onclick = () => {
    if (confirm("Ist dein Bier wirklich leer?")) send({ type: "done" });
  };

  $("fb-share").onclick = async () => {
    const link = joinLink();
    try {
      if (navigator.share) return await navigator.share({ title: "Flunky Ball", text: `Komm in meinen Flunky-Ball-Raum ${session.code}!`, url: link });
    } catch {
      return;
    }
    try {
      await navigator.clipboard.writeText(link);
      $("fb-share").textContent = "Link kopiert ✓";
    } catch {
      prompt("Link zum Beitreten:", link);
    }
  };

  function leave() {
    const host = session?.host;
    if (!confirm(host ? "Raum schließen? Das Spiel endet dann für alle." : "Spiel verlassen?")) return;
    if (client && connected) {
      if (host) {
        client.publish(topic("state"), "", { qos: 1, retain: true });
        client.publish(topic("host"), "", { qos: 1, retain: true });
      } else {
        send({ type: "leave" });
      }
    }
    setTimeout(() => leaveToStart(), 300);
  }
  $("fb-lobby-leave").onclick = leave;
  $("fb-game-leave").onclick = leave;

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && S && $("fb-game").classList.contains("active")) keepAwake();
  });

  // Einstieg
  const params = new URLSearchParams(location.search);
  $("fb-name").value = read(NAME_KEY) || "";
  const urlCode = (params.get("raum") || "").toUpperCase().slice(0, 4);
  if (urlCode) $("fb-code").value = urlCode;
  showStart();
  if (urlCode && !parseSaved()) setTimeout(() => ($("fb-name").value ? $("fb-join") : $("fb-name")).focus(), 50);

  // Für automatische Tests: flunky.html?debug
  if (params.has("debug")) window.fbDebug = { state: () => S, balance: () => B, view: () => view, project, ballStart, send, BOTTLE, RANGE };
})();
