// Verbindung für Räume mit mehreren Handys (room.js und Flunky Ball).
// Jedes Handy ist gleichzeitig mit zwei öffentlichen MQTT-Brokern verbunden. Fällt einer aus oder ist er
// für ein Handy nicht erreichbar, läuft alles über den anderen weiter. Wer online ist, merkt man an
// Lebenszeichen alle paar Sekunden. Kommt das Handy aus dem Hintergrund (Sperrbildschirm, WhatsApp),
// verbindet es sofort neu, statt auf eine tote Verbindung zu warten.
//
// Host-Übernahme: Ist der Host zu lange weg, übernimmt ein anderes Handy mit dem letzten Spielstand.
// Jeder Spielstand trägt dafür eine Amtszeit (epoch): Wer übernimmt, zählt sie hoch. Kommt der alte
// Host zurück, sieht er den Spielstand mit der höheren Amtszeit und wird ganz normal Gast.
const RoomNet = (() => {
  const BROKERS = ["wss://broker.emqx.io:8084/mqtt", "wss://broker.hivemq.com:8884/mqtt"];
  const PING_MS = 4000; // so oft schickt jedes Handy ein Lebenszeichen
  const HOST_GONE_MS = 13000; // so lange ohne Lebenszeichen vom Host: „Host ist offline“
  const TAKEOVER_MS = 20000; // so lange ohne Host: der erste Gast übernimmt …
  const TAKEOVER_STEP_MS = 6000; // … ist der auch weg, nach dieser Zeit der nächste
  const PLAYER_GONE_MS = 16000; // so lange ohne Lebenszeichen von einem Spieler: offline
  const FIRST_CONNECT_MS = 15000; // so lange darf die allererste Verbindung dauern
  const NOT_FOUND_MS = 10000; // so lange wartet ein Gast nach dem Verbinden auf den Raum

  function randomString(chars, n) {
    let s = "";
    for (let i = 0; i < n; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  }

  // Für Tests: ?broker=ws://localhost:8888 (mehrere mit Komma getrennt)
  function brokerUrls() {
    const b = new URLSearchParams(location.search).get("broker");
    return b ? b.split(",").filter(Boolean) : BROKERS;
  }

  // Spielstände brauchen: { hostId, epoch, seq, players: [{ id, online, bot }] }
  // o: { root, code, id, host, prefix, state (Host: aktueller Spielstand),
  //      onState(S)       Gast: neuer Spielstand vom Host; null = Raum geschlossen
  //      onAction(a)      Host: Aktion eines Gasts (auch { type: "gone" }, wenn einer verschwindet)
  //      onTakeover()     dieses Handy ist jetzt Host (Spielstand anpassen und verschicken)
  //      onDemote(S)      dieses Handy ist nicht mehr Host, S ist der Spielstand des neuen Hosts
  //      onUp()           eine Verbindung steht (Gast: hier beitreten)
  //      onChange()       Verbindungsanzeige neu zeichnen
  //      onFail(msg) }    keine Verbindung oder Raum nicht gefunden
  function open(o) {
    const urls = brokerUrls();
    const links = urls.map((url) => ({ url, c: null, up: false }));
    const seenActs = new Set(); // Host: Aktions-Ids (jede kommt über beide Broker)
    const lastSeen = new Map(); // Host: Gast-Id → wann zuletzt was kam
    const gone = new Set();
    let host = o.host;
    let closed = false;
    let everUp = false;
    let cur = o.state || null; // letzter Spielstand (Host: eigener, Gast: vom Host)
    let lastHostSign = Date.now();
    let hostOnline = true;
    let pending = []; // Gast: Aktionen, solange keine Verbindung steht
    let hiddenAt = 0;
    const timers = {};

    let K = null; // { topic, key } aus Raumcode (secure.js): Topic verrät den Code nicht, Inhalt ist verschlüsselt
    const t = (sub) => `${o.root}/${K.topic}/${sub}`;
    let outQ = Promise.resolve(); // Reihenfolge beim Verschlüsseln behalten
    const isUp = () => links.some((l) => l.up);
    const epoch = (s) => s?.epoch || 0;

    // Leerer Text bleibt leer (löscht den liegengebliebenen Spielstand), alles andere wird verschlüsselt.
    function sealed(text) {
      const p = outQ.then(() => (text === "" ? "" : Secure.seal(K.key, text)));
      outQ = p.catch(() => {});
      return p;
    }
    function publish(sub, text, retain = false) {
      if (!K) return;
      sealed(text).then((ct) => {
        for (const l of links) if (l.up) l.c.publish(t(sub), ct, { qos: 1, retain });
      });
    }
    function publishTo(l, sub, text, retain = false) {
      if (K) sealed(text).then((ct) => l.up && l.c.publish(t(sub), ct, { qos: 1, retain }));
    }

    function startLink(l) {
      if (l.c) l.c.end(true);
      l.up = false;
      const c = mqtt.connect(l.url, {
        clientId: `${o.prefix}_${o.id}_${randomString("abcdef0123456789", 6)}`,
        clean: true,
        keepalive: 15,
        connectTimeout: 8000,
        reconnectPeriod: 2500,
      });
      l.c = c;
      c.on("connect", () => {
        if (closed || l.c !== c) return;
        l.up = true;
        everUp = true;
        // Alle hören alles: Gäste müssen auch Host werden können, Hosts merken, wenn sie abgelöst wurden.
        c.subscribe([t("act"), t("state"), t("ping")], { qos: 1 });
        if (host) {
          if (cur) publishTo(l, "state", JSON.stringify(cur), true);
          ping();
        } else {
          const queued = pending;
          pending = [];
          queued.forEach((text) => publish("act", text));
          if (!cur) {
            clearTimeout(timers.notFound);
            timers.notFound = setTimeout(() => !closed && !cur && o.onFail(`Raum ${o.code} gibt es nicht (mehr).`), NOT_FOUND_MS);
          }
        }
        o.onUp();
        o.onChange();
      });
      c.on("close", () => {
        if (l.c !== c || !l.up) return;
        l.up = false;
        o.onChange();
      });
      c.on("error", () => {}); // mqtt.js verbindet selbst neu
      // Entschlüsseln ist asynchron: pro Verbindung eine Warteschlange, damit die Reihenfolge bleibt.
      let inQ = Promise.resolve();
      c.on("message", (topic, payload) => {
        if (closed || l.c !== c || payload.length > Secure.MAX_BYTES) return;
        inQ = inQ
          .then(async () => {
            const text = payload.length ? await Secure.open(K.key, payload) : "";
            if (text === null || closed || l.c !== c) return; // gefälscht, kaputt oder falscher Raum
            if (topic === t("act")) onAct(text);
            else if (topic === t("state")) onStateText(text);
            else if (topic === t("ping")) onPing(text);
          })
          .catch(() => {});
      });
    }

    function parse(text) {
      try {
        return JSON.parse(text);
      } catch {
        return null;
      }
    }

    function onAct(text) {
      if (!host) return;
      const a = parse(text);
      if (!a || typeof a.from !== "string" || a.from === o.id) return;
      if (a.aid) {
        if (seenActs.has(a.aid)) return;
        seenActs.add(a.aid);
        if (seenActs.size > 500) seenActs.delete(seenActs.values().next().value);
      }
      lastSeen.set(a.from, Date.now());
      gone.delete(a.from);
      o.onAction(a);
    }

    function onStateText(text) {
      if (!text) {
        if (!host && cur) o.onState(null); // Host hat den Raum geschlossen
        return;
      }
      const next = parse(text);
      if (!next || typeof next.hostId !== "string") return;
      if (host) {
        if (next.hostId === o.id) return; // eigenes Echo
        // Ein anderer Host: Wer die höhere Amtszeit hat, bleibt (bei Gleichstand die kleinere Id).
        if (epoch(next) > epoch(cur) || (epoch(next) === epoch(cur) && next.hostId < o.id)) {
          host = false;
          cur = next;
          hostSign();
          o.onDemote(next);
        } else if (cur) {
          publish("state", JSON.stringify(cur), true); // der veraltete Stand soll nicht liegen bleiben
        }
        return;
      }
      if (cur && (epoch(next) < epoch(cur) || (epoch(next) === epoch(cur) && next.hostId === cur.hostId && next.seq <= cur.seq))) return;
      cur = next;
      clearTimeout(timers.notFound);
      hostSign();
      o.onState(next);
    }

    function onPing(text) {
      if (host || !cur) return;
      const p = parse(text);
      if (p && p.h === cur.hostId && p.e === epoch(cur)) hostSign();
    }

    function ping() {
      if (cur) publish("ping", JSON.stringify({ h: o.id, e: epoch(cur) }));
    }

    function hostSign() {
      lastHostSign = Date.now();
      if (!hostOnline) {
        hostOnline = true;
        o.onUp(); // Host ist zurück: nochmal melden, falls er uns verpasst hat
        o.onChange();
      }
    }

    // Bin ich dran, den Host zu übernehmen? Reihenfolge: Gäste, die online sind, in Beitritts-Reihenfolge.
    function maybeTakeover(silent) {
      if (!cur || !isUp() || document.visibilityState === "hidden") return;
      const candidates = cur.players.filter((p) => !p.bot && p.online && p.id !== cur.hostId);
      const rank = candidates.findIndex((p) => p.id === o.id);
      if (rank < 0 || silent < TAKEOVER_MS + rank * TAKEOVER_STEP_MS) return;
      host = true;
      hostOnline = true;
      lastSeen.clear();
      gone.clear();
      const now = Date.now();
      cur.players.forEach((p) => !p.bot && p.id !== o.id && lastSeen.set(p.id, now));
      o.onTakeover();
      o.onChange();
    }

    // Lebenszeichen schicken und prüfen, wer noch da ist
    function tick() {
      if (closed) return;
      const now = Date.now();
      if (host) {
        ping();
        for (const [id, at] of lastSeen) {
          if (now - at > PLAYER_GONE_MS && !gone.has(id)) {
            gone.add(id);
            o.onAction({ type: "gone", from: id });
          }
        }
        return;
      }
      if (isUp()) publish("act", JSON.stringify({ type: "hb", from: o.id }));
      const silent = now - lastHostSign;
      if (hostOnline && silent > HOST_GONE_MS) {
        hostOnline = false;
        o.onChange();
      }
      maybeTakeover(silent);
    }

    function restart() {
      if (closed || !K) return;
      lastHostSign = Date.now(); // dem Host nach dem Neuverbinden kurz Zeit geben
      links.forEach(startLink);
      o.onChange();
    }

    // Aus dem Hintergrund zurück: alte Verbindungen sind oft tot, ohne es zu wissen.
    function onVisible() {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }
      if (hiddenAt && Date.now() - hiddenAt > 1500) restart();
      else tick();
      hiddenAt = 0;
    }
    function onPageShow(e) {
      if (e.persisted) restart();
    }
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", restart);
    window.addEventListener("pageshow", onPageShow);

    if (!Secure.available()) {
      setTimeout(() => o.onFail("Dieser Browser kann keine sichere Verbindung aufbauen."), 0);
    } else {
      Secure.room(o.root, o.code).then((k) => {
        if (closed) return;
        K = k;
        links.forEach(startLink);
      });
    }
    timers.tick = setInterval(tick, PING_MS);
    timers.first = setTimeout(() => !closed && !everUp && o.onFail("Keine Verbindung zum Spielserver. Ist das Internet an?"), FIRST_CONNECT_MS);

    return {
      get connected() {
        return isUp();
      },
      get hostOnline() {
        return host || hostOnline;
      },
      // Gast: Aktion an den Host schicken
      send(a) {
        const text = JSON.stringify({ ...a, from: o.id, aid: randomString("abcdefghijkmnopqrstuvwxyz0123456789", 10) });
        if (isUp()) publish("act", text);
        else if (pending.length < 30) pending.push(text);
      },
      // Host: Spielstand an alle (bleibt für Nachzügler liegen)
      publishState(S) {
        cur = S;
        publish("state", JSON.stringify(S), true);
      },
      // Verbindung beenden; Host mit closeRoom: Raum für alle schließen
      close(closeRoom) {
        if (closed) return;
        closed = true;
        clearInterval(timers.tick);
        clearTimeout(timers.first);
        clearTimeout(timers.notFound);
        document.removeEventListener("visibilitychange", onVisible);
        window.removeEventListener("online", restart);
        window.removeEventListener("pageshow", onPageShow);
        if (closeRoom && host) publish("state", "", true);
        setTimeout(() => links.forEach((l) => l.c && l.c.end(false)), closeRoom ? 400 : 0);
      },
    };
  }

  return { open, randomString };
})();
