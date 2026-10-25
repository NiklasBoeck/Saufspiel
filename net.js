// Verbindung für Räume mit mehreren Handys (room.js und Flunky Ball).
// Jedes Handy ist gleichzeitig mit zwei öffentlichen MQTT-Brokern verbunden. Fällt einer aus oder ist er
// für ein Handy nicht erreichbar, läuft alles über den anderen weiter. Wer online ist, merkt man an
// Lebenszeichen alle paar Sekunden. Kommt das Handy aus dem Hintergrund (Sperrbildschirm, WhatsApp),
// verbindet es sofort neu, statt auf eine tote Verbindung zu warten.
const RoomNet = (() => {
  const BROKERS = ["wss://broker.emqx.io:8084/mqtt", "wss://broker.hivemq.com:8884/mqtt"];
  const PING_MS = 4000; // so oft schickt jedes Handy ein Lebenszeichen
  const HOST_GONE_MS = 13000; // so lange ohne Lebenszeichen vom Host: „Host ist offline“
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

  // o: { root, code, id, host, prefix,
  //      onState(text)    Gast: Spielstand vom Host ("" = Raum geschlossen)
  //      onAction(a)      Host: Aktion eines Gasts (auch { type: "gone" }, wenn einer verschwindet)
  //      onUp()           eine Verbindung steht (Gast: hier beitreten)
  //      onChange()       Verbindungsanzeige neu zeichnen
  //      onFail(msg) }    keine Verbindung oder Raum nicht gefunden
  function open(o) {
    const urls = brokerUrls();
    const links = urls.map((url) => ({ url, c: null, up: false }));
    const seenActs = new Set(); // Host: Aktions-Ids (jede kommt über beide Broker)
    const lastSeen = new Map(); // Host: Gast-Id → wann zuletzt was kam
    const gone = new Set();
    let closed = false;
    let everUp = false;
    let gotState = false;
    let lastState = null; // Host: zuletzt verschickter Spielstand
    let lastHostSign = Date.now();
    let hostOnline = true;
    let pending = []; // Gast: Aktionen, solange keine Verbindung steht
    let hiddenAt = 0;
    const timers = [];

    const t = (sub) => `${o.root}/${o.code}/${sub}`;
    const isUp = () => links.some((l) => l.up);

    function publish(sub, text, retain = false) {
      for (const l of links) if (l.up) l.c.publish(t(sub), text, { qos: 1, retain });
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
        c.subscribe(o.host ? [t("act")] : [t("state"), t("ping")], { qos: 1 });
        if (o.host) {
          if (lastState != null) c.publish(t("state"), lastState, { qos: 1, retain: true });
          c.publish(t("ping"), "1", { qos: 0 });
        } else {
          const queued = pending;
          pending = [];
          queued.forEach((text) => publish("act", text));
          if (!gotState) {
            clearTimeout(timers.notFound);
            timers.notFound = setTimeout(() => !closed && !gotState && o.onFail(`Raum ${o.code} gibt es nicht (mehr).`), NOT_FOUND_MS);
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
      c.on("message", (topic, payload) => {
        if (closed || l.c !== c) return;
        const text = payload.toString();
        if (o.host) {
          if (topic !== t("act")) return;
          let a;
          try {
            a = JSON.parse(text);
          } catch {
            return;
          }
          if (!a || typeof a.from !== "string" || a.from === o.id) return;
          if (a.aid) {
            if (seenActs.has(a.aid)) return;
            seenActs.add(a.aid);
            if (seenActs.size > 500) seenActs.delete(seenActs.values().next().value);
          }
          lastSeen.set(a.from, Date.now());
          gone.delete(a.from);
          o.onAction(a);
          return;
        }
        if (topic === t("ping") || topic === t("state")) hostSign();
        if (topic === t("state")) {
          if (text) {
            gotState = true;
            clearTimeout(timers.notFound);
          }
          o.onState(text);
        }
      });
    }

    function hostSign() {
      lastHostSign = Date.now();
      if (!hostOnline) {
        hostOnline = true;
        o.onUp(); // Host ist zurück: nochmal melden, falls er uns verpasst hat
        o.onChange();
      }
    }

    // Lebenszeichen schicken und prüfen, wer noch da ist
    function tick() {
      if (closed) return;
      const now = Date.now();
      if (o.host) {
        publish("ping", "1");
        for (const [id, at] of lastSeen) {
          if (now - at > PLAYER_GONE_MS && !gone.has(id)) {
            gone.add(id);
            o.onAction({ type: "gone", from: id });
          }
        }
      } else {
        if (isUp()) publish("act", JSON.stringify({ type: "hb", from: o.id }));
        if (hostOnline && now - lastHostSign > HOST_GONE_MS) {
          hostOnline = false;
          o.onChange();
        }
      }
    }

    function restart() {
      if (closed) return;
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
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", restart);
    window.addEventListener("pageshow", onPageShow);
    function onPageShow(e) {
      if (e.persisted) restart();
    }

    links.forEach(startLink);
    timers.tick = setInterval(tick, PING_MS);
    timers.first = setTimeout(() => !closed && !everUp && o.onFail("Keine Verbindung zum Spielserver. Ist das Internet an?"), FIRST_CONNECT_MS);

    return {
      get connected() {
        return isUp();
      },
      get hostOnline() {
        return o.host || hostOnline;
      },
      // Gast: Aktion an den Host schicken
      send(a) {
        const text = JSON.stringify({ ...a, from: o.id, aid: randomString("abcdefghijkmnopqrstuvwxyz0123456789", 10) });
        if (isUp()) publish("act", text);
        else if (pending.length < 30) pending.push(text);
      },
      // Host: Spielstand an alle (bleibt für Nachzügler liegen)
      publishState(text) {
        lastState = text;
        publish("state", text, true);
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
        if (closeRoom) publish("state", "", true);
        setTimeout(() => links.forEach((l) => l.c && l.c.end(false)), closeRoom ? 400 : 0);
      },
    };
  }

  return { open, randomString };
})();
