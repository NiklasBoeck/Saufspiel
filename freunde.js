// Freunde und Profil-Bildschirm (Charakter, eigene Statistik, Freundesliste).
//
// Es gibt (noch) keinen eigenen Server. Alles läuft wie die Räume über die öffentlichen MQTT-Broker:
//   saufspiel-freunde-v1/<id>/karte        (bleibt liegen) Name, Charakter, Statistik, online, aktueller Raum
//   saufspiel-freunde-v1/<id>/post/<von>   (bleibt liegen) Freundschaftsanfrage, Annahme, Entfernen
//   saufspiel-freunde-v1/<id>/live         (nur live)      Einladung in einen Raum
// Die Id ist dieselbe wie in den Räumen ("saufspiel-id"), der Freundescode ist diese Id.
// Grenzen: Die Statistik eines Freundes ist der Stand, den sein Handy zuletzt geschickt hat.
// Öffentliche Broker heben liegen gebliebene Nachrichten nicht ewig auf; eine Anfrage an jemanden, der
// lange nicht online war, kann verloren gehen. Mit eigenem Server wird das später zuverlässig.
const Freunde = (() => {
  const ROOT = "saufspiel-freunde-v1";
  const BROKERS = ["wss://broker.emqx.io:8084/mqtt", "wss://broker.hivemq.com:8884/mqtt"];
  const KEY = "saufspiel-freunde";
  const ID_KEY = "saufspiel-id";
  const ID_CHARS = "abcdefghijkmnopqrstuvwxyz23456789";
  const CARD_MS = 30000; // so oft schickt das Handy seine Karte, solange die App offen ist
  const ONLINE_MS = 75000; // so frisch muss eine Karte sein, damit der Freund als online gilt
  const INVITE_MS = 120000; // ältere Einladungen werden ignoriert

  const myId = (() => {
    try {
      let id = localStorage.getItem(ID_KEY);
      if (!id) {
        id = rnd(10);
        localStorage.setItem(ID_KEY, id);
      }
      return id;
    } catch {
      return rnd(10);
    }
  })();

  function rnd(n) {
    let s = "";
    for (let i = 0; i < n; i++) s += ID_CHARS[Math.floor(Math.random() * ID_CHARS.length)];
    return s;
  }

  // { list: [{ id, name, fig, stats, at, off, room, ok }], incoming: [{ id, name, fig, at }] }
  // ok = beide haben zugestimmt (sonst: Anfrage geschickt, wartet)
  let data = load();
  let room = null; // { game, code, page } solange dieses Handy in einem Raum ist
  let links = [];
  let started = false;
  const listeners = new Set();

  function load() {
    try {
      const d = JSON.parse(localStorage.getItem(KEY));
      if (d && Array.isArray(d.list)) return { list: d.list, incoming: d.incoming ?? [] };
    } catch {
      // neu anfangen
    }
    return { list: [], incoming: [] };
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch {
      // nur Komfort
    }
    listeners.forEach((f) => f());
  }

  const tr = (text, vars) => (typeof t === "function" ? t(text, vars) : text.replace(/\{(\w+)\}/g, (m, k) => (vars && k in vars ? vars[k] : m)));
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  const hasFigur = () => typeof Figur !== "undefined";

  function myName() {
    return (typeof Stats !== "undefined" && Stats.myName()) || tr("Spieler");
  }

  function myFig() {
    try {
      return hasFigur() && Figur.mine ? Figur.wire() : null;
    } catch {
      return null;
    }
  }

  function friend(id) {
    return data.list.find((f) => f.id === id) ?? null;
  }

  function isOnline(f) {
    return !!f && !f.off && Date.now() - (f.at || 0) < ONLINE_MS;
  }

  // Freundescode schön zum Abtippen: ABCD-EFGH-JK
  function pretty(id) {
    return id.toUpperCase().replace(/^(.{4})(.{4})(.*)$/, "$1-$2-$3");
  }
  function parseCode(text) {
    // 0 und 1 gibt es im Code nicht: wer O oder I als Ziffer abtippt, meint den Buchstaben
    const c = String(text || "").toLowerCase().replace(/[^a-z0-9]/g, "").replace(/0/g, "o").replace(/1/g, "i").replace(/l/g, "i");
    return c.length === 10 && [...c].every((ch) => ID_CHARS.includes(ch)) ? c : null;
  }

  function link() {
    const base = location.pathname.replace(/[^/]*$/, "");
    return `${location.origin}${base}?freund=${myId}&n=${encodeURIComponent(myName())}`;
  }

  // --- Verbindung ---

  function brokerUrls() {
    const b = new URLSearchParams(location.search).get("broker");
    return b ? b.split(",").filter(Boolean) : BROKERS;
  }

  const topic = (id, sub) => `${ROOT}/${id}/${sub}`;

  function start() {
    if (started || typeof mqtt === "undefined") return;
    started = true;
    links = brokerUrls().map((url) => {
      const l = { url, up: false, c: null };
      l.c = mqtt.connect(url, { clientId: `ssf_${myId}_${rnd(6)}`, clean: true, keepalive: 30, connectTimeout: 8000, reconnectPeriod: 5000 });
      l.c.on("connect", () => {
        l.up = true;
        l.c.subscribe([topic(myId, "post/+"), topic(myId, "live"), ...data.list.map((f) => topic(f.id, "karte"))], { qos: 1 });
        publishCard();
      });
      l.c.on("close", () => (l.up = false));
      l.c.on("error", () => {});
      l.c.on("message", onMessage);
      return l;
    });
    setInterval(() => document.visibilityState !== "hidden" && publishCard(), CARD_MS);
    document.addEventListener("visibilitychange", () => publishCard(document.visibilityState === "hidden"));
    window.addEventListener("pagehide", () => publishCard(true));
    window.addEventListener("stats-change", () => schedule());
    window.addEventListener("figur-change", () => schedule());
  }

  let cardTimer = null;
  function schedule() {
    clearTimeout(cardTimer);
    cardTimer = setTimeout(() => publishCard(), 1500);
  }

  function publish(t, msg, retain) {
    const text = msg == null ? "" : JSON.stringify(msg);
    for (const l of links) if (l.up) l.c.publish(t, text, { qos: 1, retain });
  }

  function subscribe(id) {
    for (const l of links) if (l.up) l.c.subscribe(topic(id, "karte"), { qos: 1 });
  }
  function unsubscribe(id) {
    for (const l of links) if (l.up) l.c.unsubscribe(topic(id, "karte"));
  }

  function card(off = false) {
    return { id: myId, name: myName(), fig: myFig(), stats: typeof Stats !== "undefined" ? Stats.summary() : null, at: Date.now(), off, room };
  }

  // Die eigene Karte nur, wenn man Freunde hat (sonst liegt nichts von einem auf dem Server).
  function publishCard(off = false) {
    if (!data.list.length) return;
    publish(topic(myId, "karte"), card(off), true);
  }

  function parse(text) {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  function onMessage(tp, payload) {
    const parts = tp.split("/");
    const msg = parse(payload.toString());
    if (parts[2] === "karte") return onCard(parts[1], msg);
    if (!msg || typeof msg.from !== "string" || msg.from === myId) return;
    if (parts[1] === myId && parts[2] === "post") return onPost(msg);
    if (parts[1] === myId && parts[2] === "live") return onLive(msg);
  }

  function clean(f, m) {
    if (typeof m.name === "string") f.name = m.name.slice(0, 20);
    if (m.fig && typeof m.fig === "object") f.fig = m.fig;
    if (m.stats && typeof m.stats === "object") f.stats = m.stats;
  }

  function onCard(id, m) {
    const f = friend(id);
    if (!f || !m || m.id !== id) return;
    if ((m.at || 0) <= (f.at || 0) && m.off === f.off) return;
    clean(f, m);
    f.at = m.at;
    f.off = !!m.off;
    f.room = m.room && typeof m.room.code === "string" ? m.room : null;
    save();
  }

  function onPost(m) {
    const f = friend(m.from);
    const clear = () => publish(topic(myId, `post/${m.from}`), null, true);
    if (m.type === "anfrage") {
      if (f) {
        // Haben wir den auch schon angefragt (oder sind schon Freunde)? Dann passt es.
        clean(f, m);
        f.ok = true;
        save();
        clear();
        sendPost(m.from, "ok");
        subscribe(m.from);
        publishCard();
      } else if (!data.incoming.some((x) => x.id === m.from)) {
        data.incoming.push({ id: m.from, name: String(m.name || "?").slice(0, 20), fig: m.fig ?? null, at: m.at || Date.now() });
        save();
        popRequest(data.incoming[data.incoming.length - 1]);
      }
      return; // bleibt liegen, bis man annimmt oder ablehnt
    }
    clear();
    if (m.type === "ok" && f) {
      clean(f, m);
      f.ok = true;
      save();
      publishCard();
      toast("🤝", tr("{name} ist jetzt dein Freund.", { name: f.name }));
    } else if ((m.type === "weg" || m.type === "nein") && f) {
      data.list = data.list.filter((x) => x !== f);
      unsubscribe(f.id);
      save();
    } else if (m.type === "weg") {
      data.incoming = data.incoming.filter((x) => x.id !== m.from);
      save();
    }
  }

  function sendPost(to, type) {
    publish(topic(to, `post/${myId}`), { type, from: myId, name: myName(), fig: myFig(), stats: typeof Stats !== "undefined" ? Stats.summary() : null, at: Date.now() }, true);
  }

  // --- Aktionen ---

  function add(id, name) {
    id = parseCode(id);
    if (!id) return tr("Der Freundescode hat 10 Zeichen.");
    if (id === myId) return tr("Das ist dein eigener Code.");
    if (friend(id)) return null;
    const inc = data.incoming.find((x) => x.id === id);
    if (inc) return accept(id);
    data.list.push({ id, name: String(name || pretty(id)).slice(0, 20), fig: null, stats: null, at: 0, off: true, room: null, ok: false });
    save();
    start();
    sendPost(id, "anfrage");
    subscribe(id);
    publishCard();
    return null;
  }

  function accept(id) {
    const inc = data.incoming.find((x) => x.id === id);
    if (!inc) return null;
    data.incoming = data.incoming.filter((x) => x !== inc);
    if (!friend(id)) data.list.push({ id, name: inc.name, fig: inc.fig, stats: null, at: 0, off: true, room: null, ok: true });
    save();
    publish(topic(myId, `post/${id}`), null, true);
    sendPost(id, "ok");
    subscribe(id);
    publishCard();
    return null;
  }

  function decline(id) {
    data.incoming = data.incoming.filter((x) => x.id !== id);
    save();
    publish(topic(myId, `post/${id}`), null, true);
    sendPost(id, "nein");
  }

  function remove(id) {
    data.list = data.list.filter((x) => x.id !== id);
    save();
    unsubscribe(id);
    publish(topic(myId, `post/${id}`), null, true);
    sendPost(id, "weg");
  }

  function invite(id, r = room) {
    if (!r) return;
    publish(topic(id, "live"), { type: "einladung", from: myId, name: myName(), fig: myFig(), game: r.game, code: r.code, page: r.page || "", mid: rnd(8), at: Date.now() }, false);
  }

  function setRoom(r) {
    room = r ? { game: r.game, code: r.code, page: r.page || "" } : null;
    publishCard();
  }

  // --- Anzeige: Einladung, Anfrage, Hinweise (laufen auf jeder Seite, auch bei Flunky Ball) ---

  const seenInvites = new Set();
  function onLive(m) {
    if (m.type !== "einladung" || seenInvites.has(m.mid)) return;
    seenInvites.add(m.mid);
    const f = friend(m.from);
    if (!f || Math.abs(Date.now() - (m.at || 0)) > INVITE_MS) return;
    if (room && room.code === m.code) return; // schon drin
    clean(f, m);
    const label = (typeof gameText === "function" && gameText(m.game, "label")) || (m.page === "flunky" ? "Flunky Ball" : m.game);
    vibrate([200, 80, 200]);
    sheet(`
      <div class="pf-pop-av">${avatar(f, "big")}</div>
      <h2>${esc(tr("{name} lädt dich ein!", { name: f.name }))}</h2>
      <p class="pf-muted">${esc(tr("{game} · Raum {code}", { game: label, code: m.code }))}</p>
      <button class="btn" data-k="join">${esc(tr("Beitreten"))}</button>
      <button class="btn ghost" data-k="close">${esc(tr("Nicht jetzt"))}</button>`, {
      join: () => joinRoom(m),
    });
  }

  function joinRoom(r) {
    const base = location.pathname.replace(/[^/]*$/, "");
    const b = new URLSearchParams(location.search).get("broker");
    const extra = b ? `&broker=${encodeURIComponent(b)}` : "";
    if (r.page === "flunky") location.href = `${base}flunky.html?raum=${encodeURIComponent(r.code)}${extra}`;
    else location.href = `${base}index.html?spiel=${encodeURIComponent(r.game)}&raum=${encodeURIComponent(r.code)}&los=1${extra}`;
  }

  function popRequest(inc) {
    sheet(`
      <div class="pf-pop-av">${avatar(inc, "big")}</div>
      <h2>${esc(tr("{name} will dein Freund sein", { name: inc.name }))}</h2>
      <p class="pf-muted">${esc(tr("Freunde sehen gegenseitig ihre Statistik und können sich in Räume einladen."))}</p>
      <button class="btn" data-k="ok">${esc(tr("Annehmen"))}</button>
      <button class="btn ghost" data-k="no">${esc(tr("Ablehnen"))}</button>
      <button class="btn ghost small" data-k="close">${esc(tr("Später"))}</button>`, {
      ok: () => accept(inc.id),
      no: () => decline(inc.id),
    });
  }

  // Einfaches Fenster über allem. actions: data-k → Funktion (close schließt nur)
  function sheet(html, actions = {}) {
    const el = document.createElement("div");
    el.className = "pf-sheet";
    el.innerHTML = `<div class="pf-box" role="dialog">${html}</div>`;
    const close = () => el.remove();
    el.onclick = (e) => {
      if (e.target === el) return close();
      const k = e.target.closest("[data-k]")?.dataset.k;
      if (!k) return;
      const keep = actions[k]?.(e, close);
      if (keep !== true) close();
    };
    document.body.appendChild(el);
    flunkyButtons(el);
    el.querySelector(".btn")?.focus({ preventScroll: true });
    return el;
  }

  // Auf der Flunky-Ball-Seite heißen die Knöpfe anders
  function flunkyButtons(el) {
    if (!document.querySelector('link[href="flunky.css"]')) return;
    el.querySelectorAll(".btn").forEach((b) => b.classList.add("fb-btn", ...(b.classList.contains("ghost") ? ["secondary"] : []), ...(b.classList.contains("small") ? ["small"] : [])));
  }

  function toast(emoji, text) {
    if (typeof showToast === "function") return showToast({ notice: { emoji, title: text } });
    const el = document.createElement("div");
    el.className = "pf-toast";
    el.textContent = `${emoji} ${text}`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 4000);
  }

  function vibrate(p) {
    try {
      navigator.vibrate?.(p);
    } catch {
      // egal
    }
  }

  function avatar(f, size = "") {
    try {
      if (hasFigur() && f?.fig) return Figur.avatarFor(f.fig, size);
    } catch {
      // ohne Charakter: Anfangsbuchstabe
    }
    return `<span class="pf-initial ${size}">${esc((f?.name || "?").trim().charAt(0).toUpperCase() || "?")}</span>`;
  }

  // --- Freunde-einladen-Fenster (Lobby) ---

  function inviteSheet(r = room) {
    if (!r) return;
    const sent = new Set();
    const render = () => {
      const list = [...data.list].filter((f) => f.ok).sort((a, b) => isOnline(b) - isOnline(a) || a.name.localeCompare(b.name));
      if (!list.length) {
        return `<h2>${esc(tr("Freunde einladen"))}</h2>
          <p class="pf-muted">${esc(tr("Du hast noch keine Freunde in der App. Füge sie im Profil hinzu oder hier mit dem ➕ neben ihrem Namen, wenn sie im Raum sind."))}</p>
          <button class="btn" data-k="close">${esc(tr("Alles klar"))}</button>`;
      }
      return `<h2>${esc(tr("Freunde einladen"))}</h2>
        <ul class="pf-friends">${list
          .map(
            (f) => `<li class="${isOnline(f) ? "on" : "off"}">
              ${avatar(f)}
              <span class="pf-fname"><b>${esc(f.name)}</b><small>${esc(statusText(f))}</small></span>
              <button class="btn small ${sent.has(f.id) ? "ghost" : ""}" data-k="inv" data-id="${esc(f.id)}" ${isOnline(f) && !sent.has(f.id) ? "" : "disabled"}>${esc(sent.has(f.id) ? tr("Eingeladen ✓") : tr("Einladen"))}</button>
            </li>`
          )
          .join("")}</ul>
        <p class="pf-muted small">${esc(tr("Einladen geht nur, wenn der Freund die App gerade offen hat. Sonst schick den Link."))}</p>
        <button class="btn ghost" data-k="close">${esc(tr("Fertig"))}</button>`;
    };
    const el = sheet(render(), {
      inv: (e) => {
        const id = e.target.closest("[data-id]").dataset.id;
        invite(id, r);
        sent.add(id);
        el.querySelector(".pf-box").innerHTML = render();
        flunkyButtons(el);
        return true;
      },
    });
    const update = () => {
      if (!el.isConnected) return listeners.delete(update);
      el.querySelector(".pf-box").innerHTML = render();
      flunkyButtons(el);
    };
    listeners.add(update);
  }

  function statusText(f) {
    if (!f.ok) return tr("Anfrage geschickt, wartet…");
    if (isOnline(f)) {
      if (f.room) {
        const g = (typeof gameText === "function" && gameText(f.room.game, "label")) || (f.room.page === "flunky" ? "Flunky Ball" : f.room.game);
        return tr("● online · spielt {game}", { game: g });
      }
      return tr("● online");
    }
    return f.at ? tr("zuletzt da: {when}", { when: ago(f.at) }) : tr("offline");
  }

  function ago(at) {
    const m = Math.round((Date.now() - at) / 60000);
    if (m < 2) return tr("gerade eben");
    if (m < 60) return tr("vor {n} Min.", { n: m });
    const h = Math.round(m / 60);
    if (h < 24) return tr("vor {n} Std.", { n: h });
    const d = Math.round(h / 24);
    return d === 1 ? tr("gestern") : tr("vor {n} Tagen", { n: d });
  }

  // Beim Laden: Freundes-Link (?freund=…&n=…) aus dem QR-Code
  function boot() {
    const params = new URLSearchParams(location.search);
    const id = parseCode(params.get("freund"));
    const name = (params.get("n") || "").slice(0, 20);
    if (params.has("freund")) {
      params.delete("freund");
      params.delete("n");
      const q = params.toString();
      history.replaceState(null, "", `${location.pathname}${q ? `?${q}` : ""}`);
    }
    if (navigator.onLine !== false) setTimeout(start, 400);
    if (!id || id === myId) return;
    if (friend(id)?.ok) return toast("🤝", tr("{name} ist schon dein Freund.", { name: friend(id).name }));
    sheet(`
      <div class="pf-pop-av">${avatar({ name })}</div>
      <h2>${esc(tr("{name} als Freund hinzufügen?", { name: name || pretty(id) }))}</h2>
      <p class="pf-muted">${esc(tr("Ihr seht dann gegenseitig eure Statistik und könnt euch in Räume einladen."))}</p>
      <button class="btn" data-k="ok">${esc(tr("Hinzufügen"))}</button>
      <button class="btn ghost" data-k="close">${esc(tr("Abbrechen"))}</button>`, {
      ok: () => {
        add(id, name);
        toast("📨", tr("Anfrage an {name} geschickt.", { name: name || pretty(id) }));
      },
    });
  }
  window.addEventListener("online", () => start());

  return {
    id: myId,
    get room() {
      return room;
    },
    get list() {
      return data.list;
    },
    get incoming() {
      return data.incoming;
    },
    friend,
    isOnline,
    pretty,
    parseCode,
    link,
    add,
    accept,
    decline,
    remove,
    invite,
    inviteSheet,
    setRoom,
    statusText,
    ago,
    avatar,
    sheet,
    joinRoom,
    boot,
    start,
    onChange: (f) => listeners.add(f),
    offChange: (f) => listeners.delete(f),
  };
})();
