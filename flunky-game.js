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
  const HIT_R = 0.045; // so nah muss der Ball an die Flasche
  const LOW_FROM = 0.8; // ab hier (Anteil der Flugbahn) ist der Ball tief genug für einen Treffer
  const ROLL = 0.15; // nach der Landung rollt der Ball noch so weit
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
    S.phase = "aim";
  }

  function doThrow(a) {
    let dx = Number(a.dx);
    let dy = Number(a.dy);
    const len = Math.hypot(dx, dy);
    if (!len || !isFinite(len)) return;
    const thrower = S.players.find((p) => p.id === S.throwerId);
    // Ein bisschen Zufall, wie in echt.
    const angle = Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.07;
    const power = Math.min(1, Math.max(0.05, Number(a.power) || 0)) * (1 + (Math.random() - 0.5) * 0.08);
    dx = Math.cos(angle);
    dy = Math.sin(angle);
    const start = ballStart(thrower);
    const range = power * RANGE;
    const sim = simulate(start.x, start.y, dx, dy, range);
    S.shot = {
      id: `${S.seq}-${randomString("abc123", 4)}`,
      team: thrower.team,
      x0: start.x,
      y0: start.y,
      dx,
      dy,
      range,
      power,
      hit: sim.hit,
      uEnd: sim.uEnd,
    };
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
  function simulate(x0, y0, dx, dy, range) {
    const bx = BOTTLE.x - x0;
    const by = BOTTLE.y - y0;
    const along = (bx * dx + by * dy) / range;
    const perp = Math.abs(bx * dy - by * dx);
    if (perp < HIT_R) {
      const half = Math.sqrt(HIT_R * HIT_R - perp * perp) / range;
      const entry = along - half;
      const exit = along + half;
      if (exit >= LOW_FROM && entry <= 1 + ROLL) return { hit: true, uEnd: Math.max(LOW_FROM, entry) };
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
    return {
      x: shot.x0 + shot.dx * shot.range * u,
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

  // --- Spielfeld zeichnen ---

  const canvas = $("fb-field");
  const ctx = canvas.getContext("2d");
  let view = { s: 1, ox: 0, oy: 0, flip: false, w: 0, h: 0 };
  let aim = null; // { x, y } Fingerposition beim Zielen relativ zum Startpunkt

  function layout() {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const top = 58;
    const bottom = 84;
    const availW = w - 16;
    const availH = h - top - bottom;
    const s = Math.max(50, Math.min(availW, availH / FIELD_L));
    const m = me();
    view = { s, ox: (w - s) / 2, oy: top + (availH - s * FIELD_L) / 2, flip: m?.team === 1, w, h };
  }

  function toScreen(x, y) {
    const vx = view.flip ? 1 - x : x;
    const vy = view.flip ? FIELD_L - y : y;
    return [view.ox + vx * view.s, view.oy + vy * view.s];
  }

  function draw(now) {
    layout();
    const { s, ox, oy, w, h } = view;
    ctx.clearRect(0, 0, w, h);

    // Rasen mit Streifen
    const stripes = 10;
    for (let i = 0; i < stripes; i++) {
      ctx.fillStyle = i % 2 ? "#2f7a3a" : "#348a41";
      ctx.fillRect(ox, oy + (i * s * FIELD_L) / stripes, s, (s * FIELD_L) / stripes + 1);
    }
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 2;
    ctx.strokeRect(ox, oy, s, s * FIELD_L);
    const [bxs, bys] = toScreen(BOTTLE.x, BOTTLE.y);
    ctx.beginPath();
    ctx.arc(bxs, bys, s * 0.12, 0, Math.PI * 2);
    ctx.stroke();

    // Teamlinien
    for (const t of [0, 1]) {
      const [x1, y1] = toScreen(0, LINE_Y[t]);
      const [x2] = toScreen(1, LINE_Y[t]);
      ctx.strokeStyle = TEAM_COLORS[t];
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y1);
      ctx.stroke();
    }

    const shot = S.shot;
    let u = null;
    if (shot && ["flying", "drink", "stop"].includes(S.phase)) u = Math.min(shot.uEnd, msToU(now - shotT0));
    const flyingHitDone = S.phase === "flying" && shot?.hit && u >= shot.uEnd;
    const bottleDown = (S.bottleDown && S.phase === "drink") || flyingHitDone;

    // Bierpfütze
    if (S.phase === "drink" && shot) {
      const grow = Math.min(1, (now - drinkTaskAt) / 4000);
      ctx.fillStyle = "rgba(250, 204, 21, 0.45)";
      ctx.beginPath();
      ctx.ellipse(bxs, bys, s * (0.04 + 0.06 * grow), s * (0.03 + 0.04 * grow), 0.4, 0, Math.PI * 2);
      ctx.fill();
    }

    drawBottle(bxs, bys, bottleDown, shot);

    // Spieler
    for (const p of S.players) {
      if (p.team == null) continue;
      let spot = playerSpot(p);
      if (S.phase === "drink" && p.id === S.runnerId && S.runStage === "aufstellen") {
        spot = { x: BOTTLE.x + 0.07, y: BOTTLE.y + (p.team === 0 ? 0.04 : -0.04) };
      }
      drawPlayer(p, spot, now);
    }

    // Ball
    const thrower = S.players.find((p) => p.id === S.throwerId);
    if (S.phase === "aim" && thrower) {
      const st = ballStart(thrower);
      let [x, y] = toScreen(st.x, st.y);
      if (aim && S.throwerId === session.id) drawAim(x, y);
      if (aim && S.throwerId === session.id) [x, y] = pulledBall(x, y);
      drawBall(x, y, 0);
    } else if (u != null && (S.phase === "flying" || !shot.hit)) {
      const b = ballAt(shot, u);
      const [x, y] = toScreen(b.x, b.y);
      drawBall(x, y, b.h);
    }

    if (S.phase === "drink" && now - drinkTaskAt > 8000) {
      newDrinkTask();
      if (!$("fb-drink").hidden) $("fb-drink-task").textContent = drinkTask;
    }
  }

  function drawBottle(x, y, down, shot) {
    const s = view.s;
    ctx.save();
    ctx.translate(x, y);
    if (down) {
      let ang = shot ? Math.atan2(shot.dy, shot.dx) : 0;
      if (view.flip) ang += Math.PI;
      ctx.rotate(ang);
      ctx.fillStyle = "#166534";
      roundRect(-s * 0.02, -s * 0.024, s * 0.075, s * 0.048, s * 0.015);
      ctx.fill();
      ctx.fillRect(s * 0.05, -s * 0.011, s * 0.045, s * 0.022);
      ctx.fillStyle = "#facc15";
      ctx.fillRect(s * 0.09, -s * 0.013, s * 0.012, s * 0.026);
    } else {
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.beginPath();
      ctx.arc(s * 0.006, s * 0.008, s * 0.03, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#166534";
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.03, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#22c55e";
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.019, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#facc15";
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.011, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawPlayer(p, spot, now) {
    const s = view.s;
    const [x, y] = toScreen(spot.x, spot.y);
    const r = Math.max(13, s * 0.042);
    const active = (S.phase === "aim" && p.id === S.throwerId) || (S.phase === "drink" && p.id === S.runnerId);
    ctx.globalAlpha = p.online ? 1 : 0.45;
    if (active) {
      ctx.strokeStyle = "#facc15";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, r + 4 + Math.sin(now / 150) * 2, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = p.done ? "#6b7280" : TEAM_COLORS[p.team];
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    if (p.id === session.id) {
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `700 ${Math.round(r * 0.95)}px system-ui, sans-serif`;
    ctx.fillText(p.done ? "✓" : p.name.slice(0, 1).toUpperCase(), x, y + 1);
    ctx.font = `600 ${Math.max(10, Math.round(r * 0.62))}px system-ui, sans-serif`;
    const below = y > view.oy + (view.s * FIELD_L) / 2;
    ctx.fillText(p.name.length > 9 ? p.name.slice(0, 8) + "…" : p.name, x, below ? y + r + 10 : y - r - 10);
    ctx.globalAlpha = 1;
  }

  function drawBall(x, y, h) {
    const s = view.s;
    const r = s * 0.018 * (1 + h * 1.5);
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.ellipse(x, y, s * 0.018, s * 0.012, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(x, y - h * s * 0.5, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#f97316";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function maxPull() {
    return view.s * 0.5;
  }

  function pullVector() {
    const len = Math.hypot(aim.x, aim.y);
    const k = len > maxPull() ? maxPull() / len : 1;
    return { x: aim.x * k, y: aim.y * k, power: Math.min(1, len / maxPull()), len };
  }

  function pulledBall(x, y) {
    const v = pullVector();
    return [x + v.x, y + v.y];
  }

  function drawAim(x, y) {
    const v = pullVector();
    if (v.len < 4) return;
    const [px, py] = [x + v.x, y + v.y];
    // Gummiband
    ctx.strokeStyle = "rgba(255,255,255,0.8)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x - 14, y);
    ctx.lineTo(px, py);
    ctx.lineTo(x + 14, y);
    ctx.stroke();
    // Richtung (ohne Weite zu verraten)
    const ux = -v.x / v.len;
    const uy = -v.y / v.len;
    const L = view.s * (0.08 + 0.18 * v.power);
    ctx.strokeStyle = `hsl(${120 - 120 * v.power}, 90%, 60%)`;
    ctx.setLineDash([8, 6]);
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + ux * L, y + uy * L);
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
    if (e.type !== "pointerup" || v.power < 0.08 || !canThrow()) return;
    let dx = -v.x / v.len;
    let dy = -v.y / v.len;
    if (view.flip) {
      dx = -dx;
      dy = -dy;
    }
    pendingThrowSeq = S.seq;
    send({ type: "throw", dx, dy, power: v.power });
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
  const FEET_NEEDED = 14;

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
    const wind = 1.3 * Math.sin(1.3 * B.t) + 0.9 * Math.sin(2.9 * B.t + 1.7);
    const push = B.finger == null ? 0 : Math.max(-1, Math.min(1, (B.finger - w / 2) / (w * 0.35)));
    const alpha = 4 * Math.sin(B.theta) + wind + 8 * push - 1.8 * B.omega;
    B.omega += alpha * dt;
    B.theta += B.omega * dt;
    if (Math.abs(B.theta) < 0.25) B.progress = Math.min(1, B.progress + dt / 2.5);
    else B.progress = Math.max(0, B.progress - dt * 0.15);
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
    bctx.arc(bx, by, h - 40, -Math.PI / 2 - 0.25, -Math.PI / 2 + 0.25);
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
  if (params.has("debug")) window.fbDebug = { state: () => S, balance: () => B, view: () => view, toScreen, ballStart, BOTTLE, RANGE };
})();
