// Prost-Duell: Zwei treten gegeneinander an wie im Western. Nach ein paar Sekunden erscheint „PROST!“,
// wer zuerst tippt, gewinnt, der andere trinkt. Vorher blinken Fallen auf („POST!“, „PROBE!“…):
// Wer zu früh oder auf eine Falle tippt, trinkt sofort. Der Sieger bleibt drin, der Nächste fordert ihn heraus.
// Die Reaktionszeit misst jedes Handy selbst (ab dem Moment, in dem es PROST zeigt), so ist es auch übers Netz fair.
(() => {
  const FAKES = ["POST!", "PROBE!", "PROTZ!", "PROSA!", "TROST!", "FROST!", "PRO…", "PRESTO!"];
  const LOSE = 2; // langsamer: 2 Schlucke
  const EARLY = 3; // zu früh oder auf eine Falle: 3 Schlucke
  const SLOW = 2500; // so lange nach PROST, dann zählt es als verpennt
  const STREAK = 3; // so viele Siege in Folge: Revolverheld, verteilt STREAK Schlucke

  const nm = (p) => `<b>${escapeHtml(p)}</b>`;

  // --- Duell anlegen ---

  function newDuel(s, a, b) {
    const delay = Math.round(2200 + Math.random() * 4000);
    const fakes = [];
    const nf = Math.random() < 0.25 ? 0 : Math.random() < 0.6 ? 1 : 2;
    for (let i = 0; i < nf; i++) {
      const t = Math.round(700 + Math.random() * (delay - 1500));
      if (fakes.every((f) => Math.abs(f.t - t) > 900)) fakes.push({ t, w: FAKES[Math.floor(Math.random() * FAKES.length)] });
    }
    fakes.sort((x, y) => x.t - y.t);
    s.round = (s.round ?? 0) + 1;
    s.duel = { id: Math.random().toString(36).slice(2), a, b, delay, fakes, res: {} };
    s.stage = "duel";
    s.result = null;
  }

  // Wer fordert als Nächstes heraus: reihum alle außer dem Sieger.
  function challenger(s, champ) {
    for (let i = 0; i < s.players.length; i++) {
      s.next = (s.next + 1) % s.players.length;
      if (s.players[s.next] !== champ) return s.players[s.next];
    }
    return s.players.find((p) => p !== champ);
  }

  // --- Ergebnis ---

  function resolve(s) {
    const d = s.duel;
    const ra = d.res[d.a];
    const rb = d.res[d.b];
    const early = [d.a, d.b].find((p) => d.res[p]?.early);
    let win;
    let lose;
    const items = [];
    if (early) {
      lose = early;
      win = lose === d.a ? d.b : d.a;
      const r = d.res[lose];
      items.push({ who: lose, n: EARLY, text: r.fake ? `auf „${r.fake}“ reingefallen` : "zu früh getippt" });
      s.result = { win, lose, kind: "early", fake: r.fake };
    } else {
      if (!ra || !rb) return;
      if (ra.rt >= SLOW && rb.rt >= SLOW) {
        // Beide verpennt: beide trinken, keiner gewinnt
        items.push({ who: d.a, n: 1, text: "verpennt" }, { who: d.b, n: 1, text: "verpennt" });
        s.result = { kind: "sleep" };
        s.streak = { who: null, n: 0 };
        s.tally[d.a].sips += LEVELS[levelOf(s)].scale(1);
        s.tally[d.b].sips += LEVELS[levelOf(s)].scale(1);
        s.stage = "result";
        drink(s, items);
        return;
      }
      win = ra.rt <= rb.rt ? d.a : d.b;
      lose = win === d.a ? d.b : d.a;
      items.push({ who: lose, n: LOSE, text: `${d.res[lose].rt >= SLOW ? "verpennt" : `${d.res[lose].rt} ms`} gegen ${d.res[win].rt} ms` });
      s.result = { win, lose, kind: "fast" };
    }
    s.tally[lose].sips += LEVELS[levelOf(s)].scale(items[0].n);
    s.tally[win].wins++;
    s.streak = s.streak.who === win ? { who: win, n: s.streak.n + 1 } : { who: win, n: 1 };
    if (s.streak.n >= STREAK) {
      items.push({ who: win, n: STREAK, give: true, text: `🤠 Revolverheld: ${STREAK} Duelle in Folge gewonnen` });
      s.result.hero = true;
    }
    s.stage = "result";
    drink(s, items);
  }

  // Nach dem Duell: Sieger bleibt drin. Revolverheld (3 in Folge) macht Platz für zwei neue.
  function nextDuel(s) {
    const r = s.result;
    if (r.win && !r.hero) return newDuel(s, r.win, challenger(s, r.win));
    if (r.hero) s.streak = { who: null, n: 0 };
    const a = challenger(s, null);
    newDuel(s, a, challenger(s, a));
  }

  // --- Ansicht ---

  const canTapFor = (s, me, p) => s.stage === "duel" && !isBot(p) && (!me || me === p);

  function zoneHtml(s, p, cls, me) {
    const d = s.duel;
    const r = d?.res[p];
    const mine = canTapFor(s, me, p) && !r;
    let status = mine ? "Tipp hier bei PROST!" : isBot(p) ? "lauert…" : "wartet…";
    if (r) status = r.early ? (r.fake ? `auf „${escapeHtml(r.fake)}“ reingefallen!` : "zu früh!") : r.rt >= SLOW ? "verpennt" : `${r.rt} ms`;
    const streak = s.streak.who === p && s.streak.n ? ` <span class="pd-streak">${"🔥".repeat(s.streak.n)}</span>` : "";
    return `<button class="pd-zone ${cls} ${mine ? "mine" : ""} ${r ? (r.early ? "bad" : "done") : ""}" data-who="${escapeHtml(p)}" ${mine ? "" : "disabled"}>
      <span class="pd-name">${escapeHtml(p)}${streak}</span><span class="pd-status">${status}</span></button>`;
  }

  function duelView(s, me) {
    const d = s.duel;
    const inDuel = me === d.a || me === d.b;
    // Ein Handy: beide Felder (oben gedreht für den gegenüber). Eigenes Handy: nur das eigene Feld groß.
    let body;
    if (me && inDuel) {
      body = `<div class="pd-arena solo"><div class="pd-signal"></div>${zoneHtml(s, me, "pd-b", me)}</div>`;
    } else {
      body = `<div class="pd-arena ${me ? "watch" : "two"}">${zoneHtml(s, d.a, "pd-a", me)}<div class="pd-signal"></div>${zoneHtml(s, d.b, "pd-b", me)}</div>`;
    }
    return {
      phase: `Duell ${s.round}${s.streak.n ? ` · ${escapeHtml(s.streak.who)} hat ${s.streak.n} in Folge` : ""}`,
      title: me && !inDuel ? `${nm(d.a)} gegen ${nm(d.b)}: zuschauen!` : `${nm(d.a)} gegen ${nm(d.b)}`,
      body,
      actions: [],
    };
  }

  function resultView(s, me) {
    const r = s.result;
    const d = s.duel;
    const you = (p) => (me === p ? "Du" : nm(p));
    let title;
    if (r.kind === "sleep") title = "😴 Beide verpennt! Beide trinken.";
    else if (r.kind === "early") title = `💥 ${you(r.lose)} ${me === r.lose ? "hast" : "hat"} ${r.fake ? `auf „${escapeHtml(r.fake)}“ getippt` : "zu früh getippt"}. ${you(r.win)} ${me === r.win ? "gewinnst" : "gewinnt"}.`;
    else title = `🍺 ${you(r.win)} ${me === r.win ? "warst" : "war"} schneller!`;
    if (r.hero) title += ` 🤠 Revolverheld!`;
    const rows = [...s.players]
      .sort((a, b) => s.tally[b].wins - s.tally[a].wins || s.tally[a].sips - s.tally[b].sips)
      .map((p) => `<li><span>${escapeHtml(p)}</span><span>🏆 ${s.tally[p].wins} · <b>${s.tally[p].sips}</b> ${drinkEmoji(s)}</span></li>`)
      .join("");
    return {
      phase: `Duell ${s.round}`,
      title,
      body: `<div class="pd-arena two over">${zoneHtml(s, d.a, "pd-a", me)}<div class="pd-signal"></div>${zoneHtml(s, d.b, "pd-b", me)}</div><ul class="za-tally">${rows}</ul>`,
      actions: [{ label: "Nächstes Duell ⚔️", by: r.win ?? undefined, act: { type: "next", round: s.round } }],
    };
  }

  function introView(s) {
    const [a, b] = s.players.map(escapeHtml);
    return {
      phase: "So geht das Prost-Duell",
      title: "Wer bei PROST zuerst tippt, gewinnt.",
      body: `<ol class="za-intro">
          <li>Zwei treten gegeneinander an. Auf einem Handy hat jeder seine Hälfte, sonst tippt jeder auf seinem eigenen.</li>
          <li>Ein paar Sekunden passiert nichts. Dann steht da <b>🍺 PROST!</b> Wer zuerst tippt, gewinnt, der andere trinkt ${sips(LOSE)}.</li>
          <li>Vorher blinken <b>Fallen</b> auf, z. B. „POST!“ oder „PROBE!“. Wer zu früh oder auf eine Falle tippt, trinkt ${sips(EARLY)}.</li>
          <li>Der Sieger bleibt drin, der Nächste fordert ihn heraus. Wer ${STREAK}-mal in Folge gewinnt, ist <b>Revolverheld</b> 🤠 und verteilt ${sips(STREAK)}.</li>
        </ol>
        <p class="za-example">Beispiel: Bei „POST!“ zuckt ${b} und tippt: ${b} trinkt ${sips(EARLY)}. Nächstes Duell: Bei PROST tippt ${a} nach 290 ms, ${b} nach 350 ms, also trinkt ${b} ${sips(LOSE)}.</p>`,
      actions: [{ label: "Verstanden, los geht's ⚔️", act: { type: "go" } }],
    };
  }

  // --- Am Handy: Zeichen zeigen, Tippen messen ---
  // t0 = wann dieses Handy das Duell zum ersten Mal gezeigt hat. Alles wird ab da gemessen.
  const t0 = new Map();
  const sent = new Set();
  let timers = [];

  const live = () => typeof run !== "undefined" && run && run.key === "duell" && document.getElementById("screen-game").classList.contains("active");

  function signalAt(d, el) {
    // Was gerade gezeigt wird: Warten, Falle oder PROST
    if (el >= d.delay) return { cls: "go", text: "🍺 PROST!" };
    const f = d.fakes.find((x) => el >= x.t && el < x.t + 650);
    if (f) return { cls: "fake", text: f.w, fake: f.w };
    return { cls: "wait", text: "Achtung…" };
  }

  function paint() {
    if (!live()) return;
    const s = run.s;
    const el = document.querySelector(".pd-signal");
    if (!el || !s.duel) return;
    if (s.stage !== "duel") {
      el.className = "pd-signal go";
      el.textContent = "🍺 PROST!";
      return;
    }
    const sig = signalAt(s.duel, performance.now() - (t0.get(s.duel.id) ?? performance.now()));
    el.className = `pd-signal ${sig.cls}`;
    el.textContent = sig.text;
    document.querySelector(".pd-arena")?.classList.toggle("go", sig.cls === "go");
  }

  function tap(p) {
    if (!live()) return;
    const s = run.s;
    const d = s.duel;
    if (s.stage !== "duel" || !d || d.res[p] || sent.has(`${d.id}:${p}`)) return;
    const el = performance.now() - (t0.get(d.id) ?? performance.now());
    const sig = signalAt(d, el);
    sent.add(`${d.id}:${p}`);
    const zone = [...document.querySelectorAll(".pd-zone")].find((z) => z.dataset.who === p);
    if (zone) {
      zone.disabled = true;
      zone.classList.remove("mine");
      zone.classList.add(sig.cls === "go" ? "done" : "bad");
      zone.querySelector(".pd-status").textContent = sig.cls === "go" ? `${Math.round(el - d.delay)} ms` : "zu früh!";
    }
    try {
      navigator.vibrate?.(sig.cls === "go" ? 20 : [80, 40, 80]);
    } catch {
      // egal
    }
    if (sig.cls === "go") run.send({ type: "tap", id: d.id, who: p, rt: Math.round(el - d.delay) });
    else run.send({ type: "tap", id: d.id, who: p, early: true, fake: sig.fake ?? null });
  }

  function afterRender(root, s, me) {
    timers.forEach(clearTimeout);
    timers = [];
    root.querySelectorAll(".pd-zone.mine").forEach((z) => {
      z.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        tap(z.dataset.who);
      });
      z.addEventListener("contextmenu", (e) => e.preventDefault());
    });
    if (s.stage !== "duel") return paint();
    const d = s.duel;
    if (!t0.has(d.id)) t0.set(d.id, performance.now());
    if (t0.size > 50) t0.delete(t0.keys().next().value);
    const el = performance.now() - t0.get(d.id);
    // Zeichen umschalten (nur ein paar Timer, keine Dauer-Animation)
    const marks = [d.delay, ...d.fakes.flatMap((f) => [f.t, f.t + 650])].filter((t) => t > el);
    for (const t of marks) timers.push(setTimeout(paint, t - el));
    paint();
    // Verpennt: eigene Spieler nach SLOW selbst melden. Wer den Spielstand hält, meldet auch Bots und
    // Spieler ohne Verbindung (etwas später, damit deren Handy zuerst darf).
    const holder = !me || run.host;
    for (const p of [d.a, d.b]) {
      if (d.res[p]) continue;
      if (isBot(p) && holder) {
        const b = botTap(d);
        timers.push(setTimeout(() => sendFor(d, p, b), Math.max(0, b.at - el)));
      } else if (canTapFor(s, me, p)) {
        timers.push(setTimeout(() => sendFor(d, p, { rt: SLOW }), Math.max(0, d.delay + SLOW - el)));
      } else if (holder) {
        timers.push(setTimeout(() => sendFor(d, p, { rt: SLOW }), Math.max(0, d.delay + SLOW + 4000 - el)));
      }
    }
    return 0;
  }

  function sendFor(d, p, r) {
    if (!live() || run.s.duel?.id !== d.id || run.s.duel.res[p] || sent.has(`${d.id}:${p}`)) return;
    sent.add(`${d.id}:${p}`);
    run.send({ type: "tap", id: d.id, who: p, ...r });
  }

  // Bot: reagiert je nach Stufe schneller oder langsamer, fällt manchmal auf eine Falle rein.
  function botTap(d) {
    const err = botErr();
    for (const f of d.fakes) if (Math.random() < 0.07 * err) return { at: f.t + 180 + Math.random() * 200, early: true, fake: f.w };
    if (Math.random() < 0.02 * err) return { at: d.delay - 150 - Math.random() * 300, early: true, fake: null };
    const mean = { leicht: 520, mittel: 380, schwer: 275 }[Settings.bots] ?? 380;
    const rt = Math.round(Math.max(170, mean + (Math.random() + Math.random() + Math.random() - 1.5) * 90));
    return { at: d.delay + rt, rt };
  }

  registerGame("duell", {
    label: "Prost-Duell",
    emoji: "🤠",
    description: "Wer bei PROST zuerst tippt, gewinnt. Zu früh getippt? Trinken.",
    color: "#dc2626",
    fit: true,
    rules: [
      "Zwei treten gegeneinander an. Auf einem Handy hat jeder seine Hälfte (die obere steht auf dem Kopf, für den gegenüber), mit mehreren Handys tippt jeder auf seinem eigenen.",
      `Ein paar Sekunden passiert nichts, dann erscheint 🍺 PROST! Wer zuerst tippt, gewinnt, der andere trinkt ${sips(LOSE)}. Jedes Handy misst die Zeit selbst, das ist auch übers Netz fair.`,
      `Vorher blinken Fallen auf wie „POST!“ oder „PROBE!“. Wer zu früh oder auf eine Falle tippt, trinkt sofort ${sips(EARLY)} und hat verloren.`,
      `Wer gar nicht tippt, ist nach 2,5 Sekunden raus. Verpennen beide, trinken beide 1 Schluck.`,
      `Der Sieger bleibt drin, der Nächste fordert ihn heraus. Wer ${STREAK}-mal in Folge gewinnt, ist Revolverheld, verteilt ${sips(STREAK)} und macht Platz für zwei neue.`,
    ],

    setup(players) {
      const s = { players, stage: "intro", round: 0, next: Math.floor(Math.random() * players.length), streak: { who: null, n: 0 }, tally: {} };
      for (const p of players) s.tally[p] = { wins: 0, sips: 0 };
      return s;
    },

    view(s, me) {
      if (s.stage === "intro") return introView(s);
      return s.stage === "result" ? resultView(s, me) : duelView(s, me);
    },

    afterRender,

    bot(s, name, acts) {
      return acts[0];
    },

    act(s, a) {
      if (s.stage === "intro" && a.type === "go") {
        const p = s.players[s.next];
        newDuel(s, p, challenger(s, p));
      } else if (s.stage === "duel" && a.type === "tap" && a.id === s.duel.id && [s.duel.a, s.duel.b].includes(a.who) && !s.duel.res[a.who]) {
        s.duel.res[a.who] = a.early ? { early: true, fake: a.fake ? String(a.fake).slice(0, 12) : null } : { rt: Math.max(0, Math.min(SLOW, Math.round(Number(a.rt) || 0))) };
        resolve(s);
      } else if (s.stage === "result" && a.type === "next" && a.round === s.round) {
        nextDuel(s);
      }
    },
  });
})();
