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

  // --- Spielfeld in 3D: Die Kamera steht hinter der eigenen Linie und schaut auf die Flasche ---

  const canvas = $("fb-field");
  const ctx = canvas.getContext("2d");
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

  // Weltpunkt (x quer, y längs, z Höhe) → Bildschirm. null, wenn er hinter der Kamera liegt.
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

  function polygon(points, fill) {
    const pts = points.map(([x, y, z]) => project(x, y, z ?? 0));
    if (pts.some((p) => !p)) return;
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }

  function groundEllipse(x, y, rx, ry, fill) {
    const pts = [];
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      pts.push([x + Math.cos(a) * rx, y + Math.sin(a) * ry, 0]);
    }
    polygon(pts, fill);
  }

  // Grasbüschel und Wolken einmal zufällig verteilen, damit sie nicht flackern.
  const TUFTS = Array.from({ length: 700 }, () => ({
    x: Math.random() * 1.6 - 0.3,
    y: Math.random() * (FIELD_L + 0.6) - 0.3,
    shade: Math.random() < 0.5 ? "#2f6f27" : "#7cc35a",
  }));
  const CLOUDS = Array.from({ length: 5 }, (_, i) => ({ x: i / 5 + Math.random() * 0.1, y: 0.15 + Math.random() * 0.45, s: 0.7 + Math.random() * 0.6 }));

  function drawGrass() {
    ctx.lineWidth = 1.2;
    for (const t of TUFTS) {
      const g = project(t.x, t.y, 0);
      if (!g || g.y > view.h + 10 || g.x < -10 || g.x > view.w + 10) continue;
      const hgt = Math.min(9, 0.012 * g.k);
      if (hgt < 1.2) continue;
      ctx.strokeStyle = t.shade;
      ctx.beginPath();
      for (const dx of [-0.6, 0, 0.6]) {
        ctx.moveTo(g.x + dx * hgt * 0.5, g.y);
        ctx.lineTo(g.x + dx * hgt, g.y - hgt);
      }
      ctx.stroke();
    }
  }

  function drawSkyDecor(horizon, now) {
    const { w } = view;
    // Sonne
    const sx = w * 0.82;
    const sy = horizon * 0.42;
    const glow = ctx.createRadialGradient(sx, sy, 4, sx, sy, 70);
    glow.addColorStop(0, "rgba(255,248,200,0.9)");
    glow.addColorStop(1, "rgba(255,248,200,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(sx - 70, sy - 70, 140, 140);
    ctx.fillStyle = "#fff7c2";
    ctx.beginPath();
    ctx.arc(sx, sy, 20, 0, Math.PI * 2);
    ctx.fill();
    // Wolken ziehen langsam
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    for (const c of CLOUDS) {
      const cx = ((c.x + now / 120000) % 1.2) * (w + 160) - 80;
      const cy = c.y * horizon;
      const r = 14 * c.s;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.arc(cx + r * 1.1, cy - r * 0.5, r * 1.2, 0, Math.PI * 2);
      ctx.arc(cx + r * 2.3, cy, r, 0, Math.PI * 2);
      ctx.rect(cx, cy - r * 0.2, r * 2.3, r * 1.1);
      ctx.fill();
    }
    // Baumreihe am Horizont
    ctx.fillStyle = "#2d5a27";
    ctx.beginPath();
    ctx.moveTo(0, horizon + 1);
    for (let x = 0; x <= w + 12; x += 12) {
      const hgt = 10 + 8 * Math.sin(x * 0.07) + 6 * Math.sin(x * 0.23 + 1);
      ctx.quadraticCurveTo(x - 6, horizon - hgt - 6, x, horizon - hgt * 0.6);
    }
    ctx.lineTo(w, horizon + 1);
    ctx.closePath();
    ctx.fill();
  }

  function groundRing(x, y, r, color) {
    const pts = [];
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * Math.PI * 2;
      pts.push(project(x + Math.cos(a) * r, y + Math.sin(a) * r, 0));
    }
    if (pts.some((p) => !p)) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    ctx.stroke();
  }

  function draw(now) {
    layout();
    const { w, h } = view;
    ctx.clearRect(0, 0, w, h);

    // Himmel mit Sonne, Wolken und Bäumen am Horizont
    const horizon = view.cy - Math.tan(CAM_PITCH) * view.focal;
    const sky = ctx.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, "#2f80ed");
    sky.addColorStop(0.7, "#7cc2ff");
    sky.addColorStop(1, "#d6eeff");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, horizon + 1);
    drawSkyDecor(horizon, now);

    // Rasen außerhalb des Felds
    const ground = ctx.createLinearGradient(0, horizon, 0, h);
    ground.addColorStop(0, "#3d8a33");
    ground.addColorStop(1, "#47943a");
    ctx.fillStyle = ground;
    ctx.fillRect(0, horizon, w, h - horizon);

    // Spielfeld mit Mähstreifen
    const stripes = 12;
    for (let i = 0; i < stripes; i++) {
      const y0 = (i * FIELD_L) / stripes;
      const y1 = ((i + 1) * FIELD_L) / stripes;
      polygon([[0, y0], [1, y0], [1, y1], [0, y1]], i % 2 ? "#4c9a3c" : "#58a844");
    }
    drawGrass();
    for (const t of [0, 1]) {
      const y = LINE_Y[t];
      polygon([[0, y - 0.006], [1, y - 0.006], [1, y + 0.006], [0, y + 0.006]], TEAM_COLORS[t]);
    }
    groundRing(BOTTLE.x, BOTTLE.y, 0.12, "rgba(255,255,255,0.55)");

    const shot = S.shot;
    let u = null;
    if (shot && ["flying", "drink", "stop"].includes(S.phase)) u = Math.min(shot.uEnd, msToU(now - shotT0));
    const flyingHitDone = S.phase === "flying" && shot?.hit && u >= shot.uEnd;
    const bottleDown = (S.bottleDown && S.phase === "drink") || flyingHitDone;

    // Bierpfütze
    if (S.phase === "drink" && shot) {
      const grow = Math.min(1, (now - drinkTaskAt) / 4000);
      const tip = { x: BOTTLE.x + shot.dx * BOTTLE_H, y: BOTTLE.y + shot.dy * BOTTLE_H };
      groundEllipse(tip.x, tip.y, 0.02 + 0.05 * grow, 0.02 + 0.05 * grow, "rgba(250, 204, 21, 0.5)");
    }

    // Alles mit Tiefe sammeln und von hinten nach vorne zeichnen.
    const sprites = [];
    const bp = project(BOTTLE.x, BOTTLE.y, 0);
    if (bp) sprites.push({ depth: bp.depth, draw: () => drawBottle(bottleDown, shot) });

    for (const p of S.players) {
      if (p.team == null) continue;
      let spot = playerSpot(p);
      if (S.phase === "drink" && p.id === S.runnerId && S.runStage === "aufstellen") {
        spot = { x: BOTTLE.x + 0.08, y: BOTTLE.y };
      }
      const pp = project(spot.x, spot.y, 0);
      if (!pp || pp.depth < 0.4) continue; // wer direkt neben der Kamera steht, verdeckt nur die Sicht
      sprites.push({ depth: pp.depth, draw: () => drawPerson(p, spot, now) });
    }

    const thrower = S.players.find((p) => p.id === S.throwerId);
    if (S.phase === "aim" && thrower) {
      const st = ballStart(thrower);
      const bp2 = project(st.x, st.y, HOLD_H);
      // Sichtbare Figuren halten den Ball selbst hoch.
      const figure = project(playerSpot(thrower).x, playerSpot(thrower).y, 0);
      const heldByFigure = thrower.id !== session.id && figure && figure.depth >= 0.4;
      if (bp2 && !heldByFigure) {
        const mine = aim && S.throwerId === session.id;
        sprites.push({
          depth: bp2.depth - 0.001,
          draw: () => {
            if (mine) drawAim(st, bp2);
            const off = mine ? pullVector() : { x: 0, y: 0 };
            drawBallAt(bp2.x + off.x, bp2.y + off.y, BALL_R * bp2.k, null);
          },
        });
      }
    } else if (u != null && (S.phase === "flying" || !shot.hit)) {
      const b = ballAt(shot, u);
      const bp3 = project(b.x, b.y, b.h + BALL_R);
      const sh = project(b.x, b.y, 0);
      if (bp3) sprites.push({ depth: bp3.depth - 0.001, draw: () => drawBallAt(bp3.x, bp3.y, BALL_R * bp3.k, sh) });
    }

    sprites.sort((a, b) => b.depth - a.depth).forEach((sp) => sp.draw());

    drawWind();

    if (S.phase === "drink" && now - drinkTaskAt > 8000) {
      newDrinkTask();
      if (!$("fb-drink").hidden) $("fb-drink-task").textContent = drinkTask;
    }
  }

  function drawBottle(down, shot) {
    if (down && shot) {
      // liegt in Wurfrichtung
      const a = project(BOTTLE.x, BOTTLE.y, BOTTLE_R);
      const mid = project(BOTTLE.x + shot.dx * BOTTLE_H * 0.62, BOTTLE.y + shot.dy * BOTTLE_H * 0.62, BOTTLE_R);
      const tip = project(BOTTLE.x + shot.dx * BOTTLE_H, BOTTLE.y + shot.dy * BOTTLE_H, BOTTLE_R * 0.6);
      if (!a || !mid || !tip) return;
      ctx.lineCap = "round";
      ctx.strokeStyle = "#14532d";
      ctx.lineWidth = BOTTLE_R * 2 * a.k;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(mid.x, mid.y);
      ctx.stroke();
      ctx.lineWidth = BOTTLE_R * 0.9 * mid.k;
      ctx.beginPath();
      ctx.moveTo(mid.x, mid.y);
      ctx.lineTo(tip.x, tip.y);
      ctx.stroke();
      ctx.lineCap = "butt";
      return;
    }
    groundEllipse(BOTTLE.x + 0.01, BOTTLE.y + (view.team === 0 ? -0.01 : 0.01), BOTTLE_R * 1.3, BOTTLE_R * 1.3, "rgba(0,0,0,0.3)");
    const base = project(BOTTLE.x, BOTTLE.y, 0);
    const top = project(BOTTLE.x, BOTTLE.y, BOTTLE_H);
    if (!base || !top) return;
    const r = BOTTLE_R * base.k;
    const H = base.y - top.y;
    const x = base.x;
    const g = ctx.createLinearGradient(x - r, 0, x + r, 0);
    g.addColorStop(0, "#14532d");
    g.addColorStop(0.35, "#22c55e");
    g.addColorStop(1, "#14532d");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x - r, base.y);
    ctx.lineTo(x - r, base.y - H * 0.55);
    ctx.quadraticCurveTo(x - r, base.y - H * 0.72, x - r * 0.4, base.y - H * 0.8);
    ctx.lineTo(x - r * 0.4, top.y);
    ctx.lineTo(x + r * 0.4, top.y);
    ctx.lineTo(x + r * 0.4, base.y - H * 0.8);
    ctx.quadraticCurveTo(x + r, base.y - H * 0.72, x + r, base.y - H * 0.55);
    ctx.lineTo(x + r, base.y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#f5f0ff";
    ctx.fillRect(x - r, base.y - H * 0.42, r * 2, H * 0.18);
    ctx.fillStyle = "#facc15";
    ctx.fillRect(x - r * 0.45, top.y - H * 0.05, r * 0.9, H * 0.06);
  }

  const SKINS = ["#f6d3b3", "#e8b48f", "#c68863", "#8d5a3b", "#f2c9a0"];
  const HAIRS = ["#2b1d14", "#5a3a22", "#d9a441", "#1a1a1a", "#a0522d", "#e6e0d4"];

  function looks(id) {
    let hsh = 0;
    for (const c of id) hsh = (hsh * 31 + c.charCodeAt(0)) >>> 0;
    return { skin: SKINS[hsh % SKINS.length], hair: HAIRS[(hsh >>> 4) % HAIRS.length], long: (hsh >>> 8) % 3 === 0 };
  }

  function limb(x1, y1, x2, y2, width, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  // Kleine Figur, die zur Kamera schaut: Beine, Shirt in Teamfarbe, Arme, Kopf mit Haaren, Bier in der Hand.
  function drawPerson(p, spot, now) {
    const feet = project(spot.x, spot.y, 0);
    if (!feet) return;
    const H = PERSON_H * feet.k;
    const runner = S.phase === "drink" && p.id === S.runnerId;
    const thrower = S.phase === "aim" && p.id === S.throwerId;
    const look = looks(p.id);
    const shirt = p.done ? "#6b7280" : TEAM_COLORS[p.team];
    const swing = runner ? Math.sin(now / 80) : 0;
    const bob = runner ? Math.abs(swing) * 0.04 * H : 0;
    const x = feet.x;
    const hip = feet.y - 0.46 * H - bob;
    const shoulder = feet.y - 0.78 * H - bob;
    const headR = 0.095 * H;
    const headY = shoulder - headR * 1.05;

    ctx.globalAlpha = p.online ? 1 : 0.45;
    groundEllipse(spot.x, spot.y, 0.03, 0.018, "rgba(0,0,0,0.3)");
    ctx.lineCap = "round";

    // Beine und Schuhe
    const legW = 0.075 * H;
    for (const side of [-1, 1]) {
      const fx = x + side * 0.07 * H + side * swing * 0.06 * H;
      limb(x + side * 0.05 * H, hip, fx, feet.y - legW * 0.6, legW, "#1f2a44");
      limb(fx - 0.02 * H, feet.y - legW * 0.3, fx + 0.03 * H * side, feet.y - legW * 0.3, legW * 0.8, "#111");
    }

    // Arme hinter dem Körper ansetzen
    const armW = 0.06 * H;
    const handL = { x: x - 0.17 * H - swing * 0.05 * H, y: hip - 0.02 * H };
    const handR = thrower ? { x: x + 0.15 * H, y: headY - headR * 1.6 } : { x: x + 0.17 * H + swing * 0.05 * H, y: hip - 0.02 * H };
    limb(x - 0.12 * H, shoulder + armW * 0.5, handL.x, handL.y, armW, shirt);
    limb(x + 0.12 * H, shoulder + armW * 0.5, handR.x, handR.y, armW, shirt);

    // Oberkörper
    ctx.fillStyle = shirt;
    ctx.beginPath();
    ctx.moveTo(x - 0.13 * H, shoulder);
    ctx.lineTo(x + 0.13 * H, shoulder);
    ctx.lineTo(x + 0.1 * H, hip + 0.02 * H);
    ctx.lineTo(x - 0.1 * H, hip + 0.02 * H);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,0.15)";
    ctx.fillRect(x - 0.1 * H, hip - 0.03 * H, 0.2 * H, 0.05 * H);

    // Hände, links mit Bierflasche (außer wer fertig ist)
    ctx.fillStyle = look.skin;
    for (const hd of [handL, handR]) {
      ctx.beginPath();
      ctx.arc(hd.x, hd.y, armW * 0.55, 0, Math.PI * 2);
      ctx.fill();
    }
    if (!p.done) {
      ctx.fillStyle = "#7c4a12";
      ctx.fillRect(handL.x - 0.025 * H, handL.y - 0.11 * H, 0.05 * H, 0.13 * H);
      ctx.fillRect(handL.x - 0.012 * H, handL.y - 0.16 * H, 0.024 * H, 0.06 * H);
    }
    if (thrower) {
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(handR.x, handR.y - armW * 0.6, armW * 0.75, 0, Math.PI * 2);
      ctx.fill();
    }

    // Hals, Kopf, Haare, Augen
    limb(x, shoulder, x, headY + headR * 0.5, headR * 0.7, look.skin);
    if (look.long) {
      ctx.fillStyle = look.hair;
      ctx.fillRect(x - headR * 1.05, headY - headR * 0.2, headR * 2.1, headR * 1.6);
    }
    ctx.fillStyle = look.skin;
    ctx.beginPath();
    ctx.arc(x, headY, headR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = look.hair;
    ctx.beginPath();
    ctx.arc(x, headY - headR * 0.1, headR * 1.03, Math.PI * 1.05, Math.PI * 1.95);
    ctx.fill();
    if (headR > 4) {
      ctx.fillStyle = "#222";
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(x + side * headR * 0.38, headY + headR * 0.1, Math.max(0.8, headR * 0.12), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.lineCap = "butt";

    if (thrower || runner) {
      ctx.strokeStyle = "#facc15";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(x, feet.y, 0.22 * H, 0.07 * H, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.font = `700 ${Math.max(10, Math.min(16, Math.round(headR * 1.2)))}px system-ui, sans-serif`;
    ctx.shadowColor = "rgba(0,0,0,0.8)";
    ctx.shadowBlur = 3;
    const name = p.name.length > 9 ? p.name.slice(0, 8) + "…" : p.name;
    ctx.fillText(p.done ? `✓ ${name}` : name, x, headY - headR * 1.3);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }

  function drawBallAt(x, y, r, shadow) {
    if (shadow) {
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.beginPath();
      ctx.ellipse(shadow.x, shadow.y, BALL_R * shadow.k, BALL_R * shadow.k * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
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
    if (S && $("fb-game").classList.contains("active")) draw(now);
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
