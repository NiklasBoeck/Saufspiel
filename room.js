// Jeder sein Handy: Ein Handy macht einen Raum auf und ist damit Host. Es hält den Spielstand und
// schickt ihn über einen öffentlichen MQTT-Broker an alle anderen, wie bei Flunky Ball.
// Die anderen Handys schicken nur ihre Aktionen. Funktioniert mit jedem Spiel mit setup/view/act.
const Room = (() => {
  const TOPIC_ROOT = "saufspiel-room-v1";
  const SESSION_KEY = "saufspiel-room";
  const NAME_KEY = "saufspiel-name";
  const ID_KEY = "saufspiel-id";
  const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // ohne 0/O und 1/I
  const MIN_PLAYERS = 2;
  const MAX_PLAYERS = 16;

  const $ = (id) => document.getElementById(id);

  const myId = loadId();
  let gameKey = null;
  let session = null; // { code, id, name, host, game }
  // Raum: beim Host die Wahrheit, bei Gästen die letzte Kopie.
  // { code, game, hostId, phase: "lobby" | "play", players: [{ id, name, online }], seq, gseq, g }
  // g = Spielstand des Spiels, gseq zählt nur Spielzüge (gegen doppelt gedrückte Knöpfe).
  let S = null;
  let net = null;
  let freshJoin = false; // erster Spielstand nach dem Beitreten: alte Trink-Meldung nicht nochmal zeigen

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
      else localStorage.setItem(key, value);
    } catch {
      // nur Komfort
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
    store(SESSION_KEY, JSON.stringify({ ...session, state: session.host ? S : null }));
  }

  function parseSaved() {
    try {
      const s = JSON.parse(read(SESSION_KEY));
      return s && s.code && s.id === myId && GAMES[s.game]?.setup ? s : null;
    } catch {
      return null;
    }
  }

  function cleanName(name) {
    return String(name || "").trim().slice(0, 20) || "Spieler";
  }

  // --- Verbindung (net.js) ---

  function brokerParam() {
    const b = new URLSearchParams(location.search).get("broker");
    return b ? `&broker=${encodeURIComponent(b)}` : "";
  }

  function connect() {
    setConn("Verbinde…");
    net = RoomNet.open({
      root: TOPIC_ROOT,
      code: session.code,
      id: session.id,
      host: session.host,
      state: session.host ? S : null,
      prefix: "ssr",
      onUp() {
        if (session.host) publishState();
        else sendJoin();
      },
      onChange: updateConn,
      onFail: (msg) => leaveToStart(msg),
      onAction: handle,
      onState: onHostState,
      onTakeover: takeover,
      onDemote(next) {
        session.host = false;
        onHostState(next);
      },
    });
  }

  // Gast: neuer Spielstand vom Host (net.js hat Doppeltes und Veraltetes schon aussortiert)
  function onHostState(next) {
    if (!session) return;
    if (!next) {
      if (S) leaveToStart("Der Host hat den Raum geschlossen.");
      return;
    }
    if (next.game !== session.game) session.game = next.game;
    S = next;
    saveSession();
    // Fehlen wir (z. B. weil der Host unser Beitreten verpasst hat)? Dann nochmal melden.
    const mine = me();
    if (!mine || !mine.online) sendJoin();
    onState();
  }

  // Der Host ist weg und dieses Handy übernimmt mit dem letzten Spielstand.
  function takeover() {
    const old = S.players.find((p) => p.id === S.hostId);
    if (old) old.online = false;
    session.host = true;
    S.hostId = session.id;
    S.epoch = (S.epoch || 0) + 1;
    const mine = me();
    if (mine) mine.online = true;
    showToast({ notice: { emoji: "👑", title: "Du bist jetzt Host,", text: `${old?.name ?? "der Host"} ist weg.` } });
    publishState();
  }

  function send(action) {
    action.from = session.id;
    if (session.host) return handle(action);
    net?.send(action);
  }

  let lastJoin = 0;
  function sendJoin() {
    if (Date.now() - lastJoin < 1500) return;
    lastJoin = Date.now();
    send({ type: "join", name: session.name });
  }

  function updateConn() {
    if (!session || !net) return;
    const connected = net.connected;
    const ok = connected && net.hostOnline;
    setConn(!connected ? "Verbindung weg, verbinde neu…" : ok ? `● verbunden · Raum ${session.code}` : "Host ist offline, warte…");
    document.querySelectorAll(".conn").forEach((el) => el.classList.toggle("bad", !ok));
  }

  function disconnect(closeRoom) {
    net?.close(closeRoom);
    net = null;
  }

  // --- Host ---

  function newState() {
    return {
      code: session.code,
      game: session.game,
      hostId: session.id,
      phase: "lobby",
      players: [{ id: session.id, name: session.name, online: true }],
      seq: 0,
      gseq: 0,
      g: null,
    };
  }

  function publishState() {
    S.seq++;
    saveSession();
    net?.publishState(S);
    onState();
  }

  function uniqueName(name, id) {
    let n = name;
    for (let i = 2; S.players.some((p) => p.id !== id && p.name === n); i++) n = `${name} ${i}`;
    return n;
  }

  function handle(a) {
    const p = S.players.find((x) => x.id === a.from);
    switch (a.type) {
      case "join":
        if (p) {
          p.online = true;
          if (S.phase === "lobby") p.name = uniqueName(cleanName(a.name), p.id);
        } else if (S.players.length < MAX_PLAYERS) {
          S.players.push({ id: a.from, name: uniqueName(cleanName(a.name), a.from), online: true });
        } else return;
        break;
      case "leave":
        if (!p) return;
        if (S.phase === "lobby") S.players = S.players.filter((x) => x !== p);
        else p.online = false;
        break;
      case "gone":
        if (!p || !p.online) return;
        p.online = false;
        break;
      case "hb":
        if (!p || p.online) return; // Lebenszeichen: nur wer als offline galt, ist wieder da
        p.online = true;
        break;
      case "bot-add":
        if (a.from !== S.hostId || S.phase !== "lobby" || S.players.length >= MAX_PLAYERS) return;
        S.players.push({ id: `bot-${randomString("abcdefghijkmnopqrstuvwxyz23456789", 8)}`, name: newBotName(S.players.map((x) => x.name)), online: true, bot: true });
        break;
      case "bot-remove":
        if (a.from !== S.hostId || S.phase !== "lobby") return;
        S.players = S.players.filter((x) => !(x.bot && x.id === a.id));
        break;
      case "start":
        if (a.from !== S.hostId || S.phase !== "lobby" || S.players.length < MIN_PLAYERS) return;
        S.phase = "play";
        S.g = newGame(S.game, S.players.map((x) => x.name));
        S.gseq++;
        break;
      case "play":
        if (S.phase !== "play" || a.gseq !== S.gseq || !a.a) return;
        S.g = applyAction(S.game, S.g, a.a, p?.name ?? null);
        S.gseq++;
        break;
      default:
        return;
    }
    publishState();
  }

  // --- Anzeige ---

  function me() {
    return S?.players.find((p) => p.id === session.id) ?? null;
  }

  function onState() {
    if (!S || !session) return;
    if (S.phase === "lobby") {
      freshJoin = false;
      renderLobby();
      if (!$("screen-lobby").classList.contains("active")) showScreen("lobby");
      return;
    }
    if (freshJoin) shownAlert = S.g.alert?.id ?? null;
    freshJoin = false;
    playGame({
      key: S.game,
      s: S.g,
      me: me()?.name ?? session.name,
      host: session.host,
      offline: (name) => !S.players.find((p) => p.name === name)?.online,
      send: (a) => send({ type: "play", gseq: S.gseq, a }),
      exit: leave,
      back: leave,
    });
    keepAwake();
  }

  function renderLobby() {
    setGame(S.game);
    $("lobby-code").textContent = S.code;
    renderQr();
    $("lobby-players").replaceChildren(
      ...S.players.map((p) => {
        const li = document.createElement("li");
        li.textContent = `${p.id === S.hostId ? "👑 " : ""}${p.name}`;
        li.classList.toggle("me", p.id === session.id);
        li.classList.toggle("off", !p.online);
        li.classList.toggle("bot", !!p.bot);
        if (p.bot && session.host) {
          const remove = document.createElement("button");
          remove.textContent = "✕";
          remove.className = "remove";
          remove.setAttribute("aria-label", `${p.name} entfernen`);
          remove.onclick = () => send({ type: "bot-remove", id: p.id });
          li.appendChild(remove);
        }
        return li;
      })
    );
    const enough = S.players.length >= MIN_PLAYERS;
    $("lobby-start").hidden = !session.host;
    $("lobby-bot").hidden = !session.host;
    $("lobby-bot").disabled = S.players.length >= MAX_PLAYERS;
    $("lobby-start").disabled = !enough;
    let hint;
    if (!me()) hint = "Du wirst gleich hinzugefügt…";
    else if (session.host) hint = enough ? `${S.players.length} Spieler da. Alle drin? Dann los!` : "Warte auf Mitspieler: Code eingeben, QR-Code scannen oder einen Bot dazunehmen.";
    else hint = "Du bist drin! Warte, bis der Host startet.";
    $("lobby-hint").textContent = hint;
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
      $("lobby-qr").innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0 });
    } catch {
      $("lobby-qr").textContent = "";
    }
  }

  function joinLink() {
    return `${location.origin}${location.pathname}?spiel=${session.game}&raum=${session.code}`;
  }

  // Bildschirm anlassen, solange gespielt wird.
  let wakeLock = null;
  async function keepAwake() {
    if (wakeLock || !navigator.wakeLock) return;
    try {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", () => (wakeLock = null));
    } catch {
      // nicht schlimm
    }
  }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && session && S?.phase === "play") keepAwake();
  });

  // --- Ablauf ---

  function startSession(s, state) {
    disconnect(false);
    session = s;
    S = state;
    freshJoin = true;
    lastJoin = 0;
    qrFor = null;
    store(NAME_KEY, s.name);
    saveSession();
    history.replaceState(null, "", `${location.pathname}?spiel=${s.game}&raum=${s.code}${brokerParam()}`);
    setGame(s.game);
    if (S) onState();
    else {
      $("lobby-code").textContent = s.code;
      renderQr();
      $("lobby-players").replaceChildren();
      $("lobby-hint").textContent = "Suche Raum…";
      $("lobby-start").hidden = true;
      $("lobby-bot").hidden = true;
      showScreen("lobby");
    }
    connect();
  }

  function endSession() {
    disconnect(false);
    session = null;
    S = null;
    store(SESSION_KEY, null);
    history.replaceState(null, "", `${location.pathname}${brokerParam().replace("&", "?")}`);
    setConn("");
    hideDrinkAlert();
  }

  function leaveToStart(error) {
    endSession();
    showStart(error);
  }

  function leave() {
    const host = session?.host;
    if (!confirm(host ? "Raum schließen? Das Spiel endet dann für alle." : "Raum verlassen?")) return;
    if (!host) send({ type: "leave" });
    disconnect(host);
    endSession();
    showScreen("menu");
  }

  function showStart(error) {
    setGame(gameKey);
    const err = $("room-error");
    err.hidden = !error;
    err.textContent = error || "";
    if (!$("room-name").value) $("room-name").value = read(NAME_KEY) || "";
    const saved = parseSaved();
    const resume = saved && saved.game === gameKey;
    $("room-resume").hidden = !resume;
    if (resume) $("room-resume").textContent = `Zurück in Raum ${saved.code}`;
    showScreen("room");
  }

  function nameOrError() {
    const name = $("room-name").value.trim();
    if (!name) {
      showStart("Gib zuerst deinen Namen ein.");
      $("room-name").focus();
      return null;
    }
    return cleanName(name);
  }

  function resume(saved) {
    const { state, ...s } = saved;
    gameKey = s.game;
    if (s.host && state) state.players.forEach((p) => (p.online = p.bot || p.id === s.id));
    startSession(s, s.host ? state : null);
  }

  $("room-back").onclick = () => showScreen("mode");
  $("lobby-back").onclick = leave;
  $("lobby-start").onclick = () => send({ type: "start" });
  $("lobby-bot").onclick = () => send({ type: "bot-add" });

  $("room-create").onclick = () => {
    const name = nameOrError();
    if (!name) return;
    session = { code: randomString(CODE_CHARS, 4), id: myId, name, host: true, game: gameKey };
    startSession(session, newState());
  };

  $("room-join").onclick = () => {
    const name = nameOrError();
    if (!name) return;
    const code = $("room-code").value.trim().toUpperCase();
    if (code.length !== 4) return showStart("Der Raumcode hat 4 Zeichen.");
    startSession({ code, id: myId, name, host: false, game: gameKey }, null);
  };
  $("room-code").addEventListener("keydown", (e) => e.key === "Enter" && $("room-join").click());

  $("room-resume").onclick = () => {
    const saved = parseSaved();
    if (saved) resume(saved);
    else showStart();
  };

  $("lobby-share").onclick = async () => {
    const link = joinLink();
    const label = GAMES[session.game].label;
    try {
      if (navigator.share) return await navigator.share({ title: label, text: `Komm in meinen ${label}-Raum ${session.code}!`, url: link });
    } catch {
      return;
    }
    try {
      await navigator.clipboard.writeText(link);
      $("lobby-share").textContent = "Link kopiert ✓";
    } catch {
      prompt("Link zum Beitreten:", link);
    }
  };

  return {
    open(key) {
      gameKey = key;
      showStart();
    },

    // Beim Laden: Beitritts-Link (?spiel=…&raum=…) oder nach Neuladen zurück in den Raum.
    boot() {
      const params = new URLSearchParams(location.search);
      const key = params.get("spiel");
      const code = (params.get("raum") || "").toUpperCase().slice(0, 4);
      if (!GAMES[key]?.setup || !code) return;
      const saved = parseSaved();
      if (saved && saved.code === code) return resume(saved);
      gameKey = key;
      $("room-code").value = code;
      showStart();
      setTimeout(() => ($("room-name").value ? $("room-join") : $("room-name")).focus(), 50);
    },

    // Für automatische Tests
    debug: () => ({ session, S }),
  };
})();
