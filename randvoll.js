// Randvoll: Auf dem Tisch steht ein Glas unter dem Zapfhahn. Jedes Glas hat eine unsichtbare Kante, an der es
// überläuft, keiner weiß, wo. Reihum hält jeder den Zapfhahn gedrückt und lässt los, wann er will. Nach dem
// Loslassen kommt noch ein bisschen Schaum nach. Läuft das Glas über, trinkt man so viele Schlucke, wie in
// dieses Glas gezapft wurde. Bleibt der Schaum knapp unter der Kante stehen (randvoll), verteilt man sie.
(() => {
  // Gläser: lo = bis hier ist es sicher (die Kante liegt irgendwo zwischen lo und 100),
  // speed = Prozent pro Sekunde beim Zapfen, foam = so viel Schaum kommt höchstens nach.
  const GLASSES = {
    mass: { label: "Maß", emoji: "🍺", lo: 55, speed: 17, foam: 6, weight: 4 },
    tulpe: { label: "Pils-Tulpe", emoji: "🍻", lo: 45, speed: 25, foam: 7, weight: 4 },
    stamperl: { label: "Schnapsglas", emoji: "🥃", lo: 30, speed: 38, foam: 4, weight: 2, shot: true },
  };
  const MIN_POUR = 4; // so viel kommt mindestens raus, auch bei ganz kurzem Tippen
  const FULL = 3; // randvoll: Schaum höchstens so viel unter der Kante

  const nm = (p) => `<b>${escapeHtml(p)}</b>`;
  const rnd = (a, b) => a + Math.random() * (b - a);

  function newGlass(s) {
    const keys = Object.keys(GLASSES);
    let r = Math.random() * keys.reduce((n, k) => n + GLASSES[k].weight, 0);
    let type = keys[0];
    for (const k of keys) {
      r -= GLASSES[k].weight;
      if (r < 0) {
        type = k;
        break;
      }
    }
    const g = GLASSES[type];
    s.n = (s.n ?? 0) + 1;
    s.glass = { type, level: 0, edge: Math.round(rnd(g.lo, 100) * 10) / 10, pours: 0, phase: Math.random() * 6 };
  }

  // Der Zapfhahn stottert ein bisschen: mal schneller, mal langsamer. Wie viel nach t Sekunden raus ist:
  function poured(g, phase, t) {
    // Geschwindigkeit speed * (1 + 0.35 sin(5t + phase)), aufsummiert
    return g.speed * (t + (0.35 / 5) * (Math.cos(phase) - Math.cos(5 * t + phase)));
  }

  // --- Ansicht ---

  function glassHtml(s, level, extra = "") {
    const G = s.glass;
    const g = GLASSES[G.type];
    const reveal = s.stage === "done";
    return `
      <div class="za-stage ${extra}">
        <div class="za-tap"><i></i><b></b></div>
        <div class="za-stream"></div>
        <div class="za-glass za-${G.type}"><div class="za-in">
          <div class="za-beer" style="height:${Math.min(level, 100)}%"></div>
          <div class="za-safe" style="height:${g.lo}%"><span>sicher</span></div>
          ${reveal ? `<div class="za-edge" style="bottom:${G.edge}%"><span>Kante</span></div>` : ""}
        </div></div>
      </div>`;
  }

  function tallyHtml(s) {
    const rows = [...s.players]
      .sort((a, b) => s.tally[b].sips - s.tally[a].sips)
      .map((p) => `<li><span>${escapeHtml(p)}</span><span><b>${s.tally[p].sips}</b> ${drinkEmoji(s)}${s.tally[p].full ? ` · ${s.tally[p].full}× 🎯` : ""}</span></li>`)
      .join("");
    return `<ul class="za-tally">${rows}</ul>`;
  }

  function pourView(s, me) {
    const p = s.players[s.cur];
    const G = s.glass;
    const g = GLASSES[G.type];
    const you = me === p;
    const mine = canPour(s, me);
    return {
      phase: `Glas ${s.n} · ${g.emoji} ${g.label} · ${G.pours === 1 ? "1-mal" : `${G.pours}-mal`} gezapft`,
      title: you ? "Du zapfst!" : `${nm(p)} zapft`,
      body: `${glassHtml(s, G.level, mine ? "mine" : "")}<p class="za-hint">${
        mine
          ? `Halt den Zapfhahn gedrückt, ${me ? "" : `${nm(p)}, `}und lass rechtzeitig los. Läuft's über: ${sips(Math.max(1, G.pours + 1))}.`
          : isBot(p)
            ? `${nm(p)} legt die Hand an den Hahn…`
            : `Gleich: ${sips(G.pours + 1)} fürs Überlaufen.`
      }</p>`,
      turn: p,
      actions: [],
    };
  }

  // Vor dem ersten Glas: kurz erklärt, mit Beispiel
  function introView(s) {
    const [a, b, c] = [s.players[0], s.players[1], s.players[2] ?? s.players[0]].map(escapeHtml);
    return {
      phase: "So geht Randvoll",
      title: "Ihr füllt zusammen ein Glas. Wer es überlaufen lässt, trinkt.",
      body: `<ol class="za-intro">
          <li>Wenn du dran bist: Finger aufs Glas und <b>gedrückt halten</b>, dann läuft Bier rein. Loslassen, wann du willst. Dann ist der Nächste dran.</li>
          <li>Wann das Glas überläuft, sieht keiner. Nur bis zur grünen Linie <b>„sicher“</b> passiert garantiert nichts.</li>
          <li>Läuft's bei dir über, trinkst du. Je öfter schon gezapft wurde, desto mehr Schlucke.</li>
          <li>Hörst du ganz knapp vorm Überlaufen auf, ist es <b>randvoll</b> 🎯 und du verteilst die Schlucke.</li>
        </ol>
        <p class="za-example">Beispiel: ${a} zapft bis zur grünen Linie, ${b} traut sich noch ein Stück, dann zapft ${c} und es läuft über. 3-mal gezapft, also trinkt ${c} 3 Schlucke.</p>`,
      actions: [{ label: "Verstanden, los geht's 🍺", act: { type: "go" } }],
    };
  }

  function doneView(s, me) {
    const r = s.result;
    const you = me === r.who;
    const g = GLASSES[s.glass.type];
    const title =
      r.kind === "over"
        ? `🌊 Übergelaufen! ${you ? "Du trinkst" : `${nm(r.who)} trinkt`} ${sips(r.n)}${g.shot ? " und einen Shot" : ""}.`
        : `🎯 Randvoll! ${you ? "Du verteilst" : `${nm(r.who)} verteilt`} ${sips(r.n)}${g.shot ? " und einen Shot" : ""}.`;
    return {
      phase: `Glas ${s.n} · ${g.emoji} ${g.label} · ${r.n}-mal gezapft`,
      title,
      body: `${glassHtml(s, s.glass.level, r.kind)}${tallyHtml(s)}`,
      actions: [{ label: "Neues Glas 🍺", by: r.who, act: { type: "next", n: s.n } }],
    };
  }

  // Darf dieses Handy gerade zapfen?
  function canPour(s, me) {
    if (s.stage !== "pour") return false;
    const p = s.players[s.cur];
    if (isBot(p)) return false;
    if (!me || me === p) return true;
    return typeof run !== "undefined" && run?.host && run.offline?.(p);
  }

  // --- Zapfen am Handy: gedrückt halten, loslassen ---
  // hold = { n, pours, start, from }, solange der Finger drauf ist. Das Bild wird jedes Mal neu gesucht,
  // falls die App zwischendurch neu zeichnet (z. B. ein anderes Handy meldet sich).
  let hold = null;
  let localPour = null; // eben selbst gezapft: Anstieg nicht nochmal abspielen
  const animated = new Set();

  function holdAmount(s, t) {
    return poured(GLASSES[s.glass.type], s.glass.phase, t);
  }

  function startHold(e) {
    if (hold || typeof run === "undefined" || !run || run.key !== "randvoll") return;
    const s = run.s;
    if (!canPour(s, run.me) || !document.getElementById("drink-alert").hidden) return;
    if (localPour && localPour.n === s.n && localPour.pours > s.glass.pours && Date.now() - localPour.t < 5000) return; // schon gezapft, wartet auf den Host
    e.preventDefault();
    hold = { n: s.n, pours: s.glass.pours, start: performance.now(), from: s.glass.level };
    document.querySelector(".za-stage")?.classList.add("pouring");
    vibrateShort();
    requestAnimationFrame(holdTick);
  }

  function holdTick() {
    if (!hold) return;
    const s = run.s;
    if (run.key !== "randvoll" || s.n !== hold.n || s.glass.pours !== hold.pours || s.stage !== "pour") {
      hold = null;
      return;
    }
    const amt = holdAmount(s, (performance.now() - hold.start) / 1000);
    const lvl = hold.from + amt;
    const stage = document.querySelector(".za-stage");
    stage?.classList.add("pouring");
    const beer = stage?.querySelector(".za-beer");
    if (beer) beer.style.height = `${Math.min(lvl, 100)}%`;
    if (lvl >= 100) return endHold();
    requestAnimationFrame(holdTick);
  }

  function endHold() {
    if (!hold) return;
    const h = hold;
    hold = null;
    const s = run.s;
    if (s.n !== h.n || s.glass.pours !== h.pours || s.stage !== "pour") return;
    const amt = Math.max(MIN_POUR, Math.round(holdAmount(s, (performance.now() - h.start) / 1000) * 10) / 10);
    document.querySelector(".za-stage")?.classList.remove("pouring");
    localPour = { n: h.n, pours: h.pours + 1, at: Math.min(100, h.from + amt), t: Date.now() };
    run.send({ type: "pour", n: h.n, pours: h.pours, amt });
  }

  function vibrateShort() {
    try {
      navigator.vibrate?.(30);
    } catch {
      // egal
    }
  }

  window.addEventListener("pointerup", endHold);
  window.addEventListener("pointercancel", endHold);
  window.addEventListener("blur", endHold);

  // Nach dem Zeichnen: neues Zapfen von unten nach oben abspielen (beim Bot und auf den anderen Handys),
  // auf dem eigenen Handy nur noch den Schaum. Gibt zurück, wie lange die Trink-Meldung warten soll.
  function afterRender(root, s) {
    const stage = root.querySelector(".za-stage");
    if (!stage) return 0;
    if (stage.classList.contains("mine")) {
      stage.addEventListener("pointerdown", startHold);
      stage.addEventListener("contextmenu", (e) => e.preventDefault());
    }
    const last = s.last;
    if (!last || animated.has(last.id)) return 0;
    animated.add(last.id);
    if (animated.size > 200) animated.delete(animated.values().next().value);
    const beer = stage.querySelector(".za-beer");
    const g = GLASSES[last.type];
    const top = Math.min(last.to, 100);
    const own = localPour && localPour.n === last.n && localPour.pours === last.pours;
    const start = own ? localPour.at : last.from;
    localPour = null;
    const ms = own ? 450 : Math.max(500, Math.min(4000, ((top - start) / g.speed) * 1000));
    const glass = stage.querySelector(".za-glass");
    const result = s.stage === "done" ? s.result.kind : null;
    glass.classList.remove("over", "full");
    stage.classList.remove("over", "full");
    beer.style.height = `${start}%`;
    if (!own) stage.classList.add("pouring");
    void beer.offsetHeight;
    beer.style.transition = `height ${ms}ms linear`;
    beer.style.height = `${top}%`;
    const edge = stage.querySelector(".za-edge");
    if (edge) edge.style.opacity = "0";
    setTimeout(() => {
      stage.classList.remove("pouring");
      beer.style.transition = "";
      if (result) stage.classList.add(result);
      if (edge) edge.style.opacity = "";
    }, ms);
    return result ? ms + 700 : 0;
  }

  // --- Spielablauf ---

  function pour(s, amt) {
    const G = s.glass;
    const g = GLASSES[G.type];
    const p = s.players[s.cur];
    const from = G.level;
    const foam = Math.round(rnd(0, g.foam) * 10) / 10;
    const to = Math.round((from + Math.max(MIN_POUR, amt) + foam) * 10) / 10;
    G.pours++;
    G.level = Math.min(to, 100);
    s.last = { id: Math.random().toString(36).slice(2), n: s.n, pours: G.pours, type: G.type, from, to };
    s.cur = (s.cur + 1) % s.players.length;
    const n = G.pours;
    if (to > G.edge) {
      s.stage = "done";
      s.result = { kind: "over", who: p, n };
      s.tally[p].sips += LEVELS[levelOf(s)].scale(n);
      s.tally[p].over++;
      const items = [{ who: p, n, text: `${n}-mal in ${g.label === "Maß" ? "die Maß" : g.label === "Pils-Tulpe" ? "die Tulpe" : "das Schnapsglas"} gezapft, übergelaufen` }];
      if (g.shot) items.push({ who: p, text: "🥃 1 Shot obendrauf" });
      drink(s, items);
    } else if (G.edge - to <= FULL) {
      s.stage = "done";
      s.result = { kind: "full", who: p, n };
      s.tally[p].full++;
      const items = [{ who: p, n, give: true, text: "Randvoll gezapft, ohne Überlaufen" }];
      if (g.shot) {
        if (isBot(p)) {
          const others = s.players.filter((x) => x !== p);
          items.push({ who: others[Math.floor(Math.random() * others.length)], text: `🥃 1 Shot von ${p}` });
        } else items.push({ who: p, give: true, text: "🥃 1 Shot verteilen" });
      }
      drink(s, items);
    }
  }

  // --- Bots ---
  // Der Bot kennt nur, was alle wissen: Bis „sicher“ passiert nichts, die Kante liegt irgendwo darüber.
  // Er wägt ab: Überlaufen kostet, randvoll bringt was, und je voller er das Glas weitergibt, desto
  // gefährlicher wird es für den Nächsten.
  function botPour(s) {
    const G = s.glass;
    const g = GLASSES[G.type];
    const L = G.level;
    const lo = Math.max(g.lo, L);
    const n = G.pours + 1;
    let best = { amt: MIN_POUR, u: -Infinity };
    for (let amt = MIN_POUR; amt <= 70; amt += 0.5) {
      let over = 0;
      let full = 0;
      const steps = 12;
      for (let i = 0; i < steps; i++) {
        const to = L + amt + ((i + 0.5) / steps) * g.foam;
        // Kante gleichverteilt zwischen lo und 100
        const pOver = Math.min(1, Math.max(0, (to - lo) / (100 - lo)));
        const pFull = Math.min(1, Math.max(0, (Math.min(100, to + FULL) - Math.max(lo, to)) / (100 - lo)));
        over += pOver / steps;
        full += pFull / steps;
      }
      const u = n * (full - over * 1.2) + 0.008 * amt;
      if (u > best.u) best = { amt, u };
    }
    // Zittrige Hand: je nach Stufe danebengezapft
    const shake = (Math.random() + Math.random() - 1) * 4 * botErr();
    const amt = Math.max(MIN_POUR, best.amt + shake);
    return { type: "pour", n: s.n, pours: G.pours, amt: Math.round(amt * 10) / 10 };
  }

  registerGame("randvoll", {
    label: "Randvoll",
    emoji: "🫗",
    description: "Halt den Zapfhahn gedrückt. Wer das Glas überlaufen lässt, trinkt.",
    color: "#ca8a04",
    fit: true,
    rules: [
      "Unter dem Zapfhahn steht ein Glas: mal eine Maß, mal eine Pils-Tulpe, mal ein Schnapsglas. Jedes Glas hat eine unsichtbare Kante, an der es überläuft. Keiner weiß, wo sie ist, nur der Streifen „sicher“ unten zeigt, bis wohin nichts passieren kann.",
      "Reihum zapft jeder einmal: Zapfhahn gedrückt halten und loslassen, wann du willst. Der Hahn stottert ein bisschen, und nach dem Loslassen kommt noch etwas Schaum nach. Kurz tippen zapft auch schon ein bisschen.",
      "Läuft das Glas über, trinkst du so viele Schlucke, wie in dieses Glas gezapft wurde (deins mitgezählt). Beim Schnapsglas kommt ein Shot dazu.",
      "Bleibt der Schaum knapp unter der Kante stehen, ist das Glas randvoll: Du verteilst so viele Schlucke, wie gezapft wurde (beim Schnapsglas auch einen Shot).",
      "Danach kommt ein neues Glas mit einer neuen Kante, und der Nächste fängt an.",
    ],

    setup(players) {
      const s = { players, cur: Math.floor(Math.random() * players.length), stage: "intro", last: null, result: null, tally: {} };
      for (const p of players) s.tally[p] = { sips: 0, over: 0, full: 0 };
      newGlass(s);
      return s;
    },

    view(s, me) {
      if (s.stage === "intro") return introView(s);
      return s.stage === "done" ? doneView(s, me) : pourView(s, me);
    },

    afterRender,

    bot(s, name, acts) {
      return s.stage === "pour" ? botPour(s) : acts[0];
    },

    act(s, a) {
      // n und pours: nur das Zapfen zählt, das zu diesem Glas und diesem Zug gehört (nicht doppelt)
      if (s.stage === "intro" && a.type === "go") s.stage = "pour";
      else if (s.stage === "pour" && a.type === "pour" && a.n === s.n && a.pours === s.glass.pours) {
        pour(s, Math.min(100, Math.max(0, Number(a.amt) || 0)));
      } else if (s.stage === "done" && a.type === "next" && a.n === s.n) {
        newGlass(s);
        s.stage = "pour";
        s.result = null;
        s.last = null;
      }
    },
  });
})();
