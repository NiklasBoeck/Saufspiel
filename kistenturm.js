// Kistenturm: Im Biergarten wird ein Turm aus Bierkisten gestapelt, in 3D. Über dem Turm schwingt die nächste
// Kiste hin und her (mal links-rechts, mal vor-zurück). Wer dran ist, tippt, und sie fällt genau da runter.
// Steht der Schwerpunkt der Kisten oben drüber nicht mehr über der Kiste darunter, kippt der Turm ab da:
// Wer zuletzt gestapelt hat, trinkt so viele Schlucke, wie Kisten runterfallen (höchstens 10).
// Die 3D-Szene (three.js) wird erst geladen, wenn das Spiel startet.
(() => {
  const W = 1; // Kiste: Breite (x), Tiefe (z), Höhe
  const D = 0.72;
  const H = 0.7;
  const MAX_SIPS = 10;
  const PERFECT = 0.04; // so genau (Anteil der Kistenbreite) ist „perfekt“
  const COLORS = 5;

  const nm = (p) => `<b>${escapeHtml(p)}</b>`;
  const rid = () => Math.random().toString(36).slice(2, 10);

  // --- Schwingen: wo die Kiste gerade ist. t = ms seit das Handy den Zug zum ersten Mal zeigt ---
  function size(axis) {
    return axis === "x" ? W : D;
  }
  function period(n) {
    return Math.max(950, 2300 - n * 75);
  }
  function swing(turn, t) {
    const u = t / turn.period + turn.phase;
    const tri = 1 - 4 * Math.abs((((u + 0.25) % 1) + 1) % 1 - 0.5); // Dreieck -1..1, gleichmäßige Geschwindigkeit
    return turn.center + tri * 1.2 * size(turn.axis);
  }

  // --- Turm prüfen: ab welcher Kiste kippt es? ---
  // Für jede Kiste k: Schwerpunkt aller Kisten darüber muss über ihr liegen, und die nächste muss überhaupt aufliegen.
  // Gibt k zurück (alles über k fällt) oder -1.
  function weakAt(tower) {
    for (let k = 0; k < tower.length - 1; k++) {
      const s = tower[k];
      const up = tower[k + 1];
      if (Math.abs(up.x - s.x) >= W || Math.abs(up.z - s.z) >= D) return k;
      let cx = 0;
      let cz = 0;
      const above = tower.length - k - 1;
      for (let i = k + 1; i < tower.length; i++) {
        cx += tower[i].x;
        cz += tower[i].z;
      }
      cx /= above;
      cz /= above;
      if (Math.abs(cx - s.x) > W / 2 || Math.abs(cz - s.z) > D / 2) return k;
    }
    return -1;
  }

  // Wie knapp es ist: kleinster Abstand des Schwerpunkts zur Kante (in Kistenbreiten), für Bots
  function margin(tower) {
    let m = Infinity;
    for (let k = 0; k < tower.length - 1; k++) {
      const s = tower[k];
      let cx = 0;
      let cz = 0;
      const above = tower.length - k - 1;
      for (let i = k + 1; i < tower.length; i++) {
        cx += tower[i].x;
        cz += tower[i].z;
      }
      m = Math.min(m, (W / 2 - Math.abs(cx / above - s.x)) / W, (D / 2 - Math.abs(cz / above - s.z)) / D);
    }
    return m;
  }

  function newTower(s) {
    s.tower = [{ id: rid(), x: 0, z: 0, c: Math.floor(Math.random() * COLORS) }];
    s.towers = (s.towers ?? 0) + 1;
    newTurn(s);
  }

  function newTurn(s) {
    const n = s.tower.length;
    const top = s.tower[n - 1];
    const axis = n % 2 ? "x" : "z";
    s.turn = { id: rid(), axis, center: top[axis], period: period(n), phase: Math.random(), c: Math.floor(Math.random() * COLORS) };
    s.stage = "place";
    s.fall = null;
  }

  function drop(s, o) {
    const p = s.players[s.cur];
    const t = s.turn;
    const top = s.tower[s.tower.length - 1];
    const crate = { id: t.id, x: top.x, z: top.z, c: t.c, by: p };
    crate[t.axis] = Math.round(o * 1000) / 1000;
    s.tower.push(crate);
    s.cur = (s.cur + 1) % s.players.length;
    const k = weakAt(s.tower);
    if (k >= 0) {
      const fell = s.tower.length - 1 - k;
      const n = Math.min(MAX_SIPS, fell);
      s.stage = "fall";
      s.fall = { id: rid(), k, who: p, n, fell, height: s.tower.length - 1 };
      s.tally[p].sips += LEVELS[levelOf(s)].scale(n);
      s.tally[p].fell++;
      drink(s, [{ who: p, n, text: `${fell === 1 ? "1 Kiste" : `${fell} Kisten`} runtergefallen` }]);
      return;
    }
    const h = s.tower.length;
    s.best = Math.max(s.best ?? 0, h);
    const items = [];
    const perfect = Math.abs(o - t.center) < PERFECT * size(t.axis);
    if (perfect) {
      s.tally[p].perfect++;
      items.push({ who: p, n: 1, give: true, text: "🎯 Perfekt gestapelt" });
    }
    if (h % 10 === 0) items.push({ who: ALL, n: 1, text: `🍻 ${h} Kisten hoch! Prost auf den Turm` });
    if (items.length) drink(s, items);
    else notice(s, { emoji: "📦", title: `${h} Kisten.`, text: "Steht!" });
    newTurn(s);
  }

  // --- Ansicht ---

  function introView(s) {
    const [a, b] = s.players.map(escapeHtml);
    return {
      phase: "So geht der Kistenturm",
      title: "Stapelt Bierkisten. Wer den Turm umwirft, trinkt.",
      body: `<ol class="za-intro">
          <li>Über dem Turm schwingt die nächste Kiste hin und her. Wenn du dran bist, <b>tippst du auf den Bildschirm</b>, und sie fällt genau da runter.</li>
          <li>Je weiter daneben, desto schiefer wird der Turm. Hängt zu viel über, <b>kippt er</b>, auch wenn deine Kiste selbst noch aufliegt.</li>
          <li>Kippt er bei dir, trinkst du so viele Schlucke, wie Kisten runterfallen (höchstens ${MAX_SIPS}). Dann wird neu gestapelt.</li>
          <li>Ganz genau drauf: <b>perfekt</b> 🎯, du verteilst 1 Schluck. Alle 10 Kisten trinken alle 1 auf den Turm.</li>
        </ol>
        <p class="za-example">Beispiel: ${a} stapelt etwas zu weit links, der Turm steht noch schief. ${b} setzt die nächste Kiste noch weiter links drauf, 4 Kisten kippen runter: ${b} trinkt 4 Schlucke.</p>`,
      actions: [{ label: "Verstanden, los geht's 📦", act: { type: "go" } }],
    };
  }

  function canDrop(s, me) {
    if (s.stage !== "place") return false;
    const p = s.players[s.cur];
    if (isBot(p)) return false;
    if (!me || me === p) return true;
    return typeof run !== "undefined" && run?.host && run.offline?.(p);
  }

  function view(s, me) {
    if (s.stage === "intro") return introView(s);
    const h = s.tower.length;
    const phase = `Turm ${s.towers} · ${h === 1 ? "1 Kiste" : `${h} Kisten`}${s.best > 1 ? ` · Rekord ${s.best}` : ""}`;
    const scene = `<div class="kt-view"><div class="kt-mount"></div></div>`;
    if (s.stage === "fall") {
      const f = s.fall;
      const rows = [...s.players]
        .sort((a, b) => s.tally[b].sips - s.tally[a].sips)
        .map((p) => `<li><span>${escapeHtml(p)}</span><span><b>${s.tally[p].sips}</b> ${drinkEmoji(s)}${s.tally[p].perfect ? ` · ${s.tally[p].perfect}× 🎯` : ""}</span></li>`)
        .join("");
      return {
        phase: `Turm ${s.towers} · ${f.height} ${f.height === 1 ? "Kiste" : "Kisten"} hoch`,
        title: `💥 Umgekippt! ${me === f.who ? "Du trinkst" : `${nm(f.who)} trinkt`} ${sips(f.n)}.`,
        body: `${scene}<ul class="za-tally kt-tally">${rows}</ul>`,
        actions: [{ label: "Neuer Turm 📦", by: f.who, act: { type: "next", id: f.id } }],
      };
    }
    const p = s.players[s.cur];
    const mine = canDrop(s, me);
    return {
      phase,
      title: me === p ? "Du stapelst!" : `${nm(p)} stapelt`,
      body: `${scene}<p class="kt-hint">${
        mine ? `👆 Tipp auf den Bildschirm${me ? "" : `, ${nm(p)}`}, wenn die Kiste über dem Turm ist.` : isBot(p) ? `${nm(p)} zielt…` : `Gleich: ${nm(p)} lässt die Kiste fallen.`
      }</p>`,
      turn: p,
      actions: [],
    };
  }

  // --- Tippen: Kiste fallen lassen (nur das Handy, das dran ist) ---
  const t0 = new Map();
  let sentTurn = null;

  function turnTime(turn) {
    if (!t0.has(turn.id)) t0.set(turn.id, performance.now());
    if (t0.size > 30) t0.delete(t0.keys().next().value);
    return performance.now() - t0.get(turn.id);
  }

  function onTap(e) {
    if (typeof run === "undefined" || !run || run.key !== "kistenturm") return;
    const s = run.s;
    if (!canDrop(s, run.me) || !document.getElementById("drink-alert").hidden) return;
    if (sentTurn === s.turn.id) return;
    e.preventDefault();
    sentTurn = s.turn.id;
    const o = swing(s.turn, turnTime(s.turn));
    window.Kistenturm3D?.dropLocal(s.turn, o);
    try {
      navigator.vibrate?.(25);
    } catch {
      // egal
    }
    run.send({ type: "drop", id: s.turn.id, o });
  }

  // --- Bots: suchen die Stelle, an der der Turm am sichersten steht, und zittern je nach Stufe ---
  function botDrop(s) {
    const t = s.turn;
    const top = s.tower[s.tower.length - 1];
    let best = { o: t.center, m: -Infinity };
    for (let i = -20; i <= 20; i++) {
      const o = t.center + (i / 20) * 0.6 * size(t.axis);
      const c = { x: top.x, z: top.z };
      c[t.axis] = o;
      const m = margin([...s.tower, c]) - Math.abs(i) * 0.002;
      if (m > best.m) best = { o, m };
    }
    const shake = (Math.random() + Math.random() + Math.random() - 1.5) * 0.36 * botErr() * (1 + s.tower.length * 0.06) * size(t.axis);
    const lo = t.center - 1.2 * size(t.axis);
    const hi = t.center + 1.2 * size(t.axis);
    return { type: "drop", id: t.id, o: Math.min(hi, Math.max(lo, best.o + shake)) };
  }

  // --- 3D laden und einhängen ---
  let loading = false;
  function afterRender(root, s, me) {
    const view = root.querySelector(".kt-view");
    if (!view) return 0;
    view.addEventListener("pointerdown", onTap);
    if (s.stage === "place") turnTime(s.turn);
    if (window.Kistenturm3D) return window.Kistenturm3D.mount(root, s, me) || 0;
    if (!loading) {
      loading = true;
      const add = (src, next) => {
        const el = document.createElement("script");
        el.src = src;
        el.onload = next;
        el.onerror = () => (loading = false);
        document.head.appendChild(el);
      };
      const go = () => add("kistenturm-3d.js", () => typeof run !== "undefined" && run?.key === "kistenturm" && window.Kistenturm3D.mount(document.getElementById("game-root"), run.s, run.me));
      if (window.THREE) go();
      else add("vendor/three.min.js", go);
    }
    return 0;
  }

  registerGame("kistenturm", {
    label: "Kistenturm",
    emoji: "📦",
    description: "Bierkisten stapeln in 3D. Wer den Turm umwirft, trinkt.",
    color: "#16a34a",
    fit: true,
    privateAlerts: true,
    rules: [
      "Im Biergarten wird ein Turm aus Bierkisten gestapelt. Über dem Turm schwingt die nächste Kiste hin und her, mal links-rechts, mal vor-zurück, und je höher der Turm, desto schneller.",
      "Wenn du dran bist, tippst du auf den Bildschirm. Die Kiste fällt genau da runter, wo sie gerade ist.",
      "Hängt zu viel über, kippt der Turm: Liegt der Schwerpunkt der Kisten oben drüber nicht mehr über der Kiste darunter, fällt alles ab da runter. Liegt deine Kiste gar nicht auf, fällt sie allein.",
      `Wer den Turm umwirft, trinkt so viele Schlucke, wie Kisten runterfallen (höchstens ${MAX_SIPS}). Dann fängt ein neuer Turm an.`,
      "Ganz genau auf die Kiste darunter: perfekt, du verteilst 1 Schluck. Alle 10 Kisten trinken alle 1 Schluck auf den Turm.",
    ],

    setup(players) {
      const s = { players, cur: Math.floor(Math.random() * players.length), stage: "intro", best: 0, tally: {} };
      for (const p of players) s.tally[p] = { sips: 0, fell: 0, perfect: 0 };
      newTower(s);
      s.stage = "intro";
      return s;
    },

    view,
    afterRender,

    bot(s, name, acts) {
      return s.stage === "place" ? botDrop(s) : acts[0];
    },

    act(s, a) {
      if (s.stage === "intro" && a.type === "go") newTurn(s);
      else if (s.stage === "place" && a.type === "drop" && a.id === s.turn.id && Number.isFinite(+a.o)) {
        const t = s.turn;
        const r = 1.2 * size(t.axis) + 0.01;
        drop(s, Math.min(t.center + r, Math.max(t.center - r, +a.o)));
      } else if (s.stage === "fall" && a.type === "next" && a.id === s.fall.id) newTower(s);
    },
  });

  window.Kistenturm = { W, D, H, COLORS, swing, turnTime, weakAt, margin };
})();
