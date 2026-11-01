// Flaschendrehen in 3D: Alle sitzen um einen runden Kneipentisch, in der Mitte liegt eine Bierflasche.
// Wer dran ist, wischt über die Flasche, sie dreht sich und bleibt irgendwann stehen.
// Der Hals zeigt auf, wer eine Aufgabe bekommt (trinken, verteilen, Wahrheit, Pflicht …),
// der Boden zeigt auf, wer bei manchen Aufgaben mitmacht. Wer getroffen wurde, dreht als Nächstes.
// Die 3D-Szene (three.js) wird erst geladen, wenn das Spiel startet.
(() => {
  const TAU = Math.PI * 2;
  const VMIN = 5; // Anfangstempo der Flasche (rad/s), langsamster und schnellster Dreh
  const VMAX = 14;
  const REFUSE = 3; // so viele Schlucke, wer eine Aufgabe nicht macht

  const nm = (p) => `<b>${escapeHtml(p)}</b>`;
  const rid = () => Math.random().toString(36).slice(2, 10);
  const norm = (a) => ((a % TAU) + TAU) % TAU;

  // --- Der Dreh: Anfangstempo v (rad/s) -> wie lange und wie weit. Gleiche Rechnung auf jedem Handy ---
  function plan(v) {
    v = Math.min(VMAX, Math.max(VMIN, Math.abs(v)));
    const T = 2.2 + v * 0.25; // Sekunden
    return { v, T, turn: (v * T) / 3 }; // ausrollen mit 1-(1-u)^3, also Anfangstempo = 3·Weg/Zeit
  }
  function angleAt(spin, ms) {
    const u = Math.min(1, Math.max(0, ms / 1000 / spin.T));
    return spin.a0 + spin.dir * spin.turn * (1 - (1 - u) ** 3);
  }

  // Plätze rund um den Tisch: Platz 0 unten (zum Betrachter), dann im Uhrzeigersinn
  function seatAngle(i, n) {
    return Math.PI / 2 + (i * TAU) / n;
  }
  function seatAt(a, n) {
    let best = 0;
    let bd = Infinity;
    for (let i = 0; i < n; i++) {
      const d = Math.abs(norm(a - seatAngle(i, n) + Math.PI) - Math.PI);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  }

  // --- Aufgaben. {A} = auf wen der Hals zeigt, {B} = auf wen der Boden zeigt ---
  // type: drink (A trinkt n), give (A verteilt n), pair (A und B trinken n), all (alle n), neighbors (Nachbarn von A je n),
  //       truth / dare (machen oder REFUSE trinken), rule (A stellt eine Regel auf)
  const TASKS = [
    { type: "drink", n: 2, e: "🍺", title: "Trink 2", text: "Die Flasche hat entschieden. Prost!" },
    { type: "drink", n: 3, e: "🍺", title: "Trink 3", text: "Pech gehabt, die Flasche mag dich." },
    { type: "drink", n: 1, e: "🍺", title: "Trink 1", text: "Nur ein kleiner Schluck zum Aufwärmen." },
    { type: "give", n: 3, e: "🫵", title: "Verteile 3", text: "Du darfst 3 Schlucke verteilen, an wen du willst." },
    { type: "give", n: 2, e: "🫵", title: "Verteile 2", text: "Such dir aus, wer 2 Schlucke trinkt." },
    { type: "pair", n: 2, e: "🥂", title: "Anstoßen!", text: "{A} und {B} (der Boden der Flasche) stoßen an und trinken beide 2." },
    { type: "pair", n: 1, e: "🤝", title: "Bruderschaft", text: "{A} und {B} trinken 1 Schluck mit verschränkten Armen." },
    { type: "all", n: 1, e: "🍻", title: "Runde!", text: "Alle trinken 1 Schluck." },
    { type: "neighbors", n: 1, e: "👐", title: "Nachbarn", text: "Deine beiden Nachbarn trinken je 1. Du nicht." },
    { type: "truth", e: "🗣️", title: "Wahrheit", text: "{B} stellt dir eine Frage. Du musst ehrlich antworten." },
    { type: "truth", e: "🗣️", title: "Wahrheit", text: "Was war dein peinlichster Moment im Suff?" },
    { type: "truth", e: "🗣️", title: "Wahrheit", text: "Wen hier würdest du auf eine einsame Insel mitnehmen, und warum?" },
    { type: "truth", e: "🗣️", title: "Wahrheit", text: "Was ist die dümmste Ausrede, die du je benutzt hast?" },
    { type: "truth", e: "🗣️", title: "Wahrheit", text: "Wann hast du zuletzt gelogen, und worüber?" },
    { type: "truth", e: "🗣️", title: "Wahrheit", text: "Was war dein schlimmstes Date?" },
    { type: "truth", e: "🗣️", title: "Wahrheit", text: "Welche App auf deinem Handy ist dir am peinlichsten?" },
    { type: "truth", e: "🗣️", title: "Wahrheit", text: "Was denkst du wirklich über {B}? Ein ehrlicher Satz." },
    { type: "dare", e: "💪", title: "Pflicht", text: "Mach 10 Kniebeugen. Jetzt." },
    { type: "dare", e: "🎭", title: "Pflicht", text: "Mach {B} 30 Sekunden lang nach. Alle anderen raten mit." },
    { type: "dare", e: "🎤", title: "Pflicht", text: "Sing den Refrain von einem Lied, das {B} aussucht." },
    { type: "dare", e: "🗺️", title: "Pflicht", text: "Sprich bis zu deinem nächsten Dreh mit Akzent." },
    { type: "dare", e: "👀", title: "Pflicht", text: "Halt 20 Sekunden lang Blickkontakt mit {B}, ohne zu lachen." },
    { type: "dare", e: "🐒", title: "Pflicht", text: "Mach deine beste Tierstimme. {B} muss das Tier erraten." },
    { type: "dare", e: "📸", title: "Pflicht", text: "Zeig allen das letzte Foto in deiner Galerie." },
    { type: "dare", e: "😂", title: "Pflicht", text: "Erzähl einen Witz. Lacht keiner, gilt es als nicht gemacht." },
    { type: "dare", e: "💃", title: "Pflicht", text: "Tanz 15 Sekunden lang, {B} summt die Musik dazu." },
    { type: "rule", e: "📜", title: "Neue Regel", text: "Du stellst eine Regel auf, die bis zum Spielende gilt. Wer sie bricht, trinkt 1." },
    { type: "rule", e: "👍", title: "Daumen-Chef", text: "Legst du ab jetzt heimlich den Daumen auf den Tisch, müssen alle nachmachen. Wer zuletzt merkt, trinkt 1." },
  ];

  // Gemischter Stapel, damit sich nichts zu schnell wiederholt
  // Bots können weder Fragen beantworten noch Pflichten machen: sie bekommen nur Trink-Aufgaben,
  // und Aufgaben, bei denen der Boden (B) etwas aussucht oder fragt, gehen nicht an einen Bot als B.
  function fits(t, A, B) {
    const active = t.type === "truth" || t.type === "dare" || t.type === "rule";
    if (active && isBot(A)) return false;
    if (active && isBot(B) && t.text.includes("{B}")) return false;
    return true;
  }
  function nextTask(s, A, B) {
    for (let i = 0; i < TASKS.length * 2; i++) {
      if (!s.deck?.length) s.deck = shuffle(TASKS.map((_, k) => k));
      const ti = s.deck.pop();
      if (fits(TASKS[ti], A, B)) return ti;
      s.deck.unshift(ti); // bleibt im Stapel für später
    }
    return 0;
  }

  function fill(text, a, b) {
    return escapeHtml(text).replaceAll("{A}", `<b>${escapeHtml(a)}</b>`).replaceAll("{B}", `<b>${escapeHtml(b)}</b>`);
  }

  function newTurn(s, who) {
    s.cur = who;
    s.turn = { id: rid() };
    s.stage = "spin";
    s.spin = null;
    s.task = null;
  }

  function startSpin(s, a0, v) {
    const p = plan(v);
    const spin = { id: s.turn.id, by: s.players[s.cur], a0: Number.isFinite(a0) ? a0 % TAU : s.angle, dir: v < 0 ? -1 : 1, v: p.v, T: p.T, turn: p.turn };
    spin.end = angleAt(spin, spin.T * 1000);
    s.spin = spin;
    s.stage = "spinning";
    s.round++;
  }

  // Flasche steht: wer wurde getroffen?
  function stop(s) {
    const spin = s.spin;
    const n = s.players.length;
    s.angle = norm(spin.end);
    const ai = seatAt(spin.end, n);
    const bi = seatAt(spin.end + Math.PI, n);
    const A = s.players[ai];
    const B = s.players[bi === ai ? (ai + 1) % n : bi];
    s.tally[A].hits++;
    if (ai === s.cur) {
      // Zeigt auf einen selbst: 1 trinken, nochmal drehen
      s.tally[A].sips += LEVELS[levelOf(s)].scale(1);
      drink(s, [{ who: A, n: 1, text: "Die Flasche zeigt auf dich selbst. Nochmal drehen!" }]);
      s.self = { id: rid(), who: A };
      newTurn(s, ai);
      return;
    }
    s.self = null;
    const ti = nextTask(s, A, B);
    const t = TASKS[ti];
    s.task = { id: rid(), ti, A, B, ai, bi };
    s.stage = "task";
    const add = (who, k) => (s.tally[who].sips += LEVELS[levelOf(s)].scale(k));
    if (t.type === "drink") {
      add(A, t.n);
      drink(s, [{ who: A, n: t.n, text: "🍾 Die Flasche hat entschieden" }]);
    } else if (t.type === "give") drink(s, [{ who: A, n: t.n, give: true, text: "🍾 Die Flasche hat entschieden" }]);
    else if (t.type === "pair") {
      add(A, t.n);
      add(B, t.n);
      drink(s, [
        { who: A, n: t.n, text: t.title },
        { who: B, n: t.n, text: `${t.title} (Boden der Flasche)` },
      ]);
    } else if (t.type === "all") {
      for (const p of s.players) add(p, t.n);
      drink(s, [{ who: ALL, n: t.n, text: "🍻 Die Flasche gibt eine Runde aus" }]);
    } else if (t.type === "neighbors") {
      const nb = [...new Set([s.players[(ai + n - 1) % n], s.players[(ai + 1) % n]])].filter((p) => p !== A);
      for (const p of nb) add(p, t.n);
      drink(s, nb.map((p) => ({ who: p, n: t.n, text: `Nachbar von ${A}` })));
    }
  }

  // --- Ansicht ---

  function introView(s, me) {
    const [a, b, c] = s.players.map(escapeHtml);
    return {
      phase: "So geht Flaschendrehen",
      title: "Dreh die Flasche. Auf wen sie zeigt, der ist dran.",
      body: `<ol class="za-intro">
          <li>Alle sitzen um den Tisch, in der Mitte liegt die Flasche. Wenn du dran bist, <b>wischst du über die Flasche</b>, je schneller, desto länger dreht sie.</li>
          <li>Auf wen der <b>Hals</b> zeigt, bekommt eine Aufgabe: trinken, verteilen, Wahrheit, Pflicht oder eine Regel. Manchmal macht mit, auf wen der <b>Boden</b> zeigt.</li>
          <li>Wahrheit oder Pflicht nicht gemacht? Dann ${sips(REFUSE)}. Zeigt die Flasche auf dich selbst, trinkst du 1 und drehst nochmal.</li>
          <li>Wer getroffen wurde, dreht als Nächstes.</li>
        </ol>
        <p class="za-example">Beispiel: ${a} dreht, der Hals zeigt auf ${b}, der Boden auf ${c ?? a}. Aufgabe „Pflicht: Sing den Refrain von einem Lied, das ${c ?? a} aussucht“. ${b} singt (oder trinkt ${REFUSE}), dann dreht ${b}.</p>
        ${!me ? `<p class="za-example">Tipp: Handy in die Tischmitte legen und in der Reihenfolge der Namen drum herum sitzen.</p>` : ""}`,
      actions: [{ label: "Verstanden, los geht's 🍾", act: { type: "go" } }],
    };
  }

  function canSpin(s, me) {
    if (s.stage !== "spin") return false;
    const p = s.players[s.cur];
    if (isBot(p)) return false;
    if (!me || me === p) return true;
    return typeof run !== "undefined" && run?.host && run.offline?.(p);
  }

  function scene() {
    return `<div class="fl-view"><div class="fl-mount"></div></div>`;
  }

  function view(s, me) {
    if (s.stage === "intro") return introView(s, me);
    const p = s.players[s.cur];
    const phase = `Flaschendrehen · Runde ${Math.max(1, s.round)}`;
    if (s.stage === "spinning") {
      return {
        phase,
        title: me === s.spin.by ? "Die Flasche dreht sich…" : `${nm(s.spin.by)} hat gedreht…`,
        body: `${scene()}<p class="fl-hint">🍾 Auf wen zeigt sie gleich?</p>`,
        actions: [],
        auto: { key: `fl-${s.spin.id}`, act: { type: "stop", id: s.spin.id }, ms: s.spin.T * 1000 + 500 },
      };
    }
    if (s.stage === "task") {
      const k = s.task;
      const t = TASKS[k.ti];
      const you = me === k.A;
      const body = `${scene()}<div class="fl-card">
          <div class="fl-card-e">${t.e}</div>
          <div class="fl-card-t"><b>${escapeHtml(t.title)}</b></div>
          <p>${fill(t.text, k.A, k.B)}</p>
          ${t.type === "truth" || t.type === "dare" ? `<small>Nicht gemacht? ${sips(REFUSE)}.</small>` : ""}
        </div>`;
      let actions;
      if (t.type === "truth" || t.type === "dare") {
        actions = [
          { label: "Gemacht ✅", by: k.A, act: { type: "done", id: k.id } },
          { label: `Lieber trinken (${REFUSE}) ${drinkEmoji(s)}`, by: k.A, ghost: true, act: { type: "refuse", id: k.id } },
        ];
      } else if (t.type === "rule") {
        actions = [{ label: "Regel steht, weiter 🍾", by: k.A, act: { type: "done", id: k.id } }];
      } else {
        actions = [{ label: you ? "Weiter, du drehst 🍾" : `Weiter, ${k.A} dreht 🍾`, by: k.A, act: { type: "done", id: k.id } }];
      }
      return {
        phase,
        title: `🍾 Die Flasche zeigt auf ${you ? "dich" : nm(k.A)}!`,
        body,
        actions,
      };
    }
    // Drehen
    const mine = canSpin(s, me);
    return {
      phase,
      title: me === p ? "Du drehst!" : `${nm(p)} dreht`,
      body: `${scene()}<p class="fl-hint">${
        mine ? `👆 Wisch schnell über die Flasche${me ? "" : `, ${nm(p)}`}, dann dreht sie sich.` : isBot(p) ? `${nm(p)} holt Schwung…` : `Gleich: ${nm(p)} dreht die Flasche.`
      }</p>`,
      turn: p,
      actions: [],
    };
  }

  // --- Wischen: Flasche anschubsen (nur das Handy, das dran ist) ---
  // Die Flasche folgt dem Finger, beim Loslassen zählt, wie schnell er sich um die Tischmitte gedreht hat.
  const t0 = new Map(); // ab wann dieses Handy einen Dreh zeigt (ms), pro Dreh
  let drag = null;
  let sentTurn = null;

  function spinTime(id, start) {
    if (start != null) t0.set(id, start);
    if (t0.size > 30) t0.delete(t0.keys().next().value);
    return t0.has(id) ? performance.now() - t0.get(id) : Infinity;
  }

  function centre(view) {
    const c = window.Flasche3D?.centre?.();
    if (c) return c;
    const r = view.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  function ready(s) {
    return typeof run !== "undefined" && run?.key === "flasche" && canSpin(s, run.me) && document.getElementById("drink-alert").hidden && sentTurn !== s.turn.id;
  }

  function onDown(e) {
    if (typeof run === "undefined" || !run) return;
    const s = run.s;
    if (!ready(s)) return;
    e.preventDefault();
    const view = e.currentTarget;
    const c = centre(view);
    const a = Math.atan2(e.clientY - c.y, e.clientX - c.x);
    drag = { id: s.turn.id, view, c, pid: e.pointerId, last: a, base: window.Flasche3D?.angle?.() ?? s.angle, sum: 0, pts: [{ a: 0, x: e.clientX, y: e.clientY, t: performance.now() }] };
    try {
      view.setPointerCapture(e.pointerId);
    } catch {
      // egal
    }
  }

  function onMove(e) {
    if (!drag || e.pointerId !== drag.pid) return;
    const a = Math.atan2(e.clientY - drag.c.y, e.clientX - drag.c.x);
    let d = a - drag.last;
    if (d > Math.PI) d -= TAU;
    if (d < -Math.PI) d += TAU;
    // Nah an der Mitte springt der Winkel wild: dort zählt nur wenig
    const r = Math.hypot(e.clientX - drag.c.x, e.clientY - drag.c.y);
    if (r < 24) d *= r / 24;
    drag.last = a;
    drag.sum += d;
    const now = performance.now();
    drag.pts.push({ a: drag.sum, x: e.clientX, y: e.clientY, t: now });
    while (drag.pts.length > 2 && now - drag.pts[0].t > 120) drag.pts.shift();
    window.Flasche3D?.hold(drag.id, drag.base + drag.sum);
  }

  function onUp(e) {
    if (!drag || e.pointerId !== drag.pid) return;
    const d = drag;
    drag = null;
    const s = run?.s;
    if (!s || !ready(s) || s.turn.id !== d.id) return window.Flasche3D?.hold(null);
    const now = performance.now();
    const pts = d.pts.filter((p) => now - p.t < 140);
    const first = pts[0] ?? d.pts[d.pts.length - 1];
    const lastP = d.pts[d.pts.length - 1];
    const dt = Math.max(16, lastP.t - first.t) / 1000;
    let w = (lastP.a - first.a) / dt; // Drehtempo um die Mitte (rad/s)
    // Gerader Wisch an der Flasche vorbei: auch das schubst sie an
    const speed = Math.hypot(lastP.x - first.x, lastP.y - first.y) / dt;
    if (Math.abs(w) < speed / 220) {
      const cross = (first.x - d.c.x) * (lastP.y - first.y) - (first.y - d.c.y) * (lastP.x - first.x);
      w = (cross < 0 ? -1 : 1) * (speed / 220);
    }
    if (Math.abs(w) < 2.5 || pts.length < 2) {
      window.Flasche3D?.hold(null);
      window.Flasche3D?.nudge?.();
      return;
    }
    const v = Math.sign(w) * Math.min(VMAX, Math.max(VMIN, 2 + Math.abs(w) * 0.55));
    const a0 = norm(d.base + d.sum);
    sentTurn = d.id;
    spinTime(d.id, performance.now());
    window.Flasche3D?.spinLocal({ id: d.id, a0, dir: Math.sign(v), ...plan(v) });
    try {
      navigator.vibrate?.(20);
    } catch {
      // egal
    }
    run.send({ type: "spin", id: d.id, a0, v });
  }

  // --- 3D laden und einhängen ---
  let loading = false;
  function afterRender(root, s, me) {
    const view = root.querySelector(".fl-view");
    if (!view) return 0;
    view.addEventListener("pointerdown", onDown);
    view.addEventListener("pointermove", onMove);
    view.addEventListener("pointerup", onUp);
    view.addEventListener("pointercancel", onUp);
    if (s.stage === "spinning" && !t0.has(s.spin.id)) spinTime(s.spin.id, performance.now());
    const left = s.stage === "task" && s.spin && t0.has(s.spin.id) ? Math.max(0, s.spin.T * 1000 - spinTime(s.spin.id)) : 0;
    if (window.Flasche3D) {
      window.Flasche3D.mount(root, s, me);
      return left ? left + 300 : 0;
    }
    if (!loading) {
      loading = true;
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "flasche.css";
      if (!document.querySelector('link[href="flasche.css"]')) document.head.appendChild(link);
      const add = (src, next) => {
        const el = document.createElement("script");
        el.src = src;
        el.onload = next;
        el.onerror = () => (loading = false);
        document.head.appendChild(el);
      };
      const go = () => add("flasche-3d.js", () => typeof run !== "undefined" && run?.key === "flasche" && window.Flasche3D.mount(document.getElementById("game-root"), run.s, run.me));
      if (window.THREE) go();
      else add("vendor/three.min.js", go);
    }
    return left ? left + 300 : 0;
  }

  // Die Spielregeln-CSS gleich mitladen, damit schon die Erklärung passt
  if (!document.querySelector('link[href="flasche.css"]')) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "flasche.css";
    document.head.appendChild(link);
  }

  registerGame("flasche", {
    label: "Flaschendrehen",
    emoji: "🍾",
    description: "Wisch die Flasche an. Auf wen sie zeigt, der ist dran.",
    color: "#0d9488",
    fit: true,
    privateAlerts: true,
    rules: [
      "Alle sitzen um den Tisch, in der Mitte liegt eine Bierflasche. Wer dran ist, wischt über die Flasche. Je schneller der Wisch, desto länger dreht sie.",
      "Auf wen der Hals zeigt, bekommt eine Aufgabe: trinken, Schlucke verteilen, Wahrheit, Pflicht, eine neue Regel aufstellen oder eine Runde für alle.",
      "Bei manchen Aufgaben macht auch mit, auf wen der Boden der Flasche zeigt, zum Beispiel beim Anstoßen oder wenn er die Frage stellt.",
      `Wahrheit oder Pflicht nicht gemacht: ${sips(REFUSE)}. Zeigt die Flasche auf dich selbst, trinkst du 1 und drehst nochmal.`,
      "Wer getroffen wurde, dreht als Nächstes. Mit einem Handy legt ihr es am besten in die Mitte und setzt euch in der Reihenfolge der Namen drum herum.",
    ],

    setup(players) {
      const s = { players, cur: Math.floor(Math.random() * players.length), stage: "intro", angle: Math.random() * TAU, round: 0, tally: {} };
      for (const p of players) s.tally[p] = { sips: 0, hits: 0 };
      newTurn(s, s.cur);
      s.stage = "intro";
      return s;
    },

    view,
    afterRender,

    bot(s, name, acts) {
      if (s.stage === "spin") {
        const v = (Math.random() < 0.5 ? -1 : 1) * (VMIN + Math.random() * (VMAX - VMIN));
        return { type: "spin", id: s.turn.id, a0: s.angle, v };
      }
      if (s.stage === "task") {
        const t = TASKS[s.task.ti];
        if (t.type === "truth" || t.type === "dare") return acts[Math.random() < 0.5 ? 0 : 1] ?? acts[0];
      }
      return acts[0];
    },

    act(s, a) {
      if (s.stage === "intro" && a.type === "go") newTurn(s, s.cur);
      else if (s.stage === "spin" && a.type === "spin" && a.id === s.turn.id && Number.isFinite(+a.v) && +a.v !== 0) startSpin(s, +a.a0, +a.v);
      else if (s.stage === "spinning" && a.type === "stop" && a.id === s.spin.id) stop(s);
      else if (s.stage === "task" && a.id === s.task.id && (a.type === "done" || a.type === "refuse")) {
        const A = s.task.A;
        if (a.type === "refuse") {
          s.tally[A].sips += LEVELS[levelOf(s)].scale(REFUSE);
          drink(s, [{ who: A, n: REFUSE, text: `${TASKS[s.task.ti].title} nicht gemacht` }]);
        }
        newTurn(s, s.task.ai);
      }
    },
  });

  window.Flasche = { TAU, plan, angleAt, seatAngle, seatAt, spinTime };
})();
