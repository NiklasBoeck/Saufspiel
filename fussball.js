// Fußball-Quiz für 2 bis 8 Leute. Reihum bekommt jeder eine Frage (Multiple Choice oder offen).
// Richtig: 1 Punkt. Falsch: trinken. Dann dürfen die anderen ran: wer am schnellsten richtig antwortet,
// kriegt den Punkt und verteilt 1 Schluck. Wer da falsch antwortet, trinkt auch, man darf sich aber enthalten.
// Am Ende trinkt, wer die wenigsten Punkte hat. Fragen stehen in fussball-fragen.js.
(() => {
  const KEY = "fussball";
  const CATS = {
    all: { label: "Alles gemischt", emoji: "🎲" },
    bundesliga: { label: "Bundesliga", emoji: "🇩🇪" },
    turniere: { label: "WM & EM", emoji: "🏆" },
    europa: { label: "Champions League", emoji: "⭐" },
    stars: { label: "Stars & Legenden", emoji: "👟" },
    regeln: { label: "Regeln & Rekorde", emoji: "📏" },
  };
  // Leichte Fragen falsch = peinlich = mehr trinken
  const LVLS = {
    1: { label: "Leicht", emoji: "🟢", sips: 3 },
    2: { label: "Mittel", emoji: "🟡", sips: 2 },
    3: { label: "Schwer", emoji: "🔴", sips: 1 },
  };
  const LVL_OPTS = { 1: "🟢 Leicht", 2: "🟡 Mittel", 3: "🔴 Schwer", mix: "🎲 Gemischt" };
  const TYP_OPTS = { mc: "🔠 Multiple Choice", open: "💬 Offen", both: "🔀 Beides" };
  const ROUND_OPTS = { 3: "3 Runden", 5: "5 Runden", 10: "10 Runden" };
  const LOSER_SIPS = 5;
  const WINNER_GIVE = 3;
  const BOT_P = { 1: 0.85, 2: 0.6, 3: 0.4 }; // so oft weiß ein mittlerer Bot die Antwort

  if (!document.getElementById("fq-style")) {
    const css = document.createElement("style");
    css.id = "fq-style";
    css.textContent = `
      .bf-body:has(.fq) { display: flex; flex-direction: column; min-height: 0; }
      .fq { flex: 1; min-height: 0; min-width: 0; display: flex; flex-direction: column; gap: clamp(8px, 1.8dvh, 16px); }
      .fq-card { flex: none; display: flex; flex-direction: column; gap: 6px; padding: clamp(12px, 2.4dvh, 24px) 18px; border-radius: var(--radius, 18px);
        background: linear-gradient(135deg, #166534, #14532d 60%, #0f3d22); color: #f4f1e6; text-align: center; box-shadow: 0 8px 24px rgba(0,0,0,.3);
        background-image: repeating-linear-gradient(90deg, rgba(255,255,255,.05) 0 26px, transparent 26px 52px), linear-gradient(135deg, #166534, #0f3d22); position: relative; overflow: hidden; }
      .fq-card::after { content: ""; position: absolute; left: 50%; top: 50%; width: 9em; height: 9em; border: 2px solid rgba(255,255,255,.12); border-radius: 50%; transform: translate(-50%,-50%); pointer-events: none; }
      .fq-tag { font-size: clamp(.75rem, 1.8dvh, .9rem); opacity: .85; text-transform: uppercase; letter-spacing: .06em; }
      .fq-q { font-size: clamp(1.1rem, 3.2dvh, 1.8rem); font-weight: 800; line-height: 1.25; position: relative; z-index: 1; }
      .fq-a { margin-top: 4px; font-size: clamp(1rem, 2.8dvh, 1.5rem); font-weight: 800; color: #fde68a; position: relative; z-index: 1; }
      .fq-opts { display: grid; grid-template-columns: 1fr 1fr; gap: clamp(6px, 1.2dvh, 10px); min-height: 0; }
      .fq-opt { padding: clamp(10px, 2.2dvh, 18px) 10px; border: 2px solid transparent; border-radius: 14px; background: var(--surface, #26201a); color: var(--text, #f3e9d4);
        font: inherit; font-weight: 700; font-size: clamp(.9rem, 2.3dvh, 1.1rem); line-height: 1.2; overflow-wrap: anywhere; position: relative; }
      .fq-opt[data-act] { cursor: pointer; }
      .fq-opt[data-act]:active { border-color: var(--primary, #f0b429); }
      .fq-opt.ok { background: #166534; border-color: #4ade80; }
      .fq-opt.bad { background: #7f1d1d; border-color: #f87171; }
      .fq-opt.gone { opacity: .35; text-decoration: line-through; }
      .fq-opt small { display: block; font-weight: 400; font-size: .75rem; opacity: .85; margin-top: 3px; }
      .fq-hint { margin: 0; text-align: center; color: var(--muted, #a99d88); font-size: clamp(.85rem, 2dvh, 1rem); }
      .fq-rows { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; min-height: 0; overflow-y: auto; }
      .fq-rows li { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 6px; padding: 6px 8px 6px 12px; border-radius: 12px; background: var(--surface, #26201a); }
      .fq-rows .nm { flex: 1 1 9em; min-width: 0; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .fq-rows .nm small { display: block; white-space: normal; }
      .fq-rows .mk { display: flex; gap: 4px; margin-left: auto; }
      .fq-rows .nm small { font-weight: 400; color: var(--muted, #a99d88); }
      .fq-rows button { flex: none; border: 2px solid transparent; border-radius: 10px; padding: 6px 8px; background: rgba(255,255,255,.07); color: inherit; font: inherit; font-size: .85rem; cursor: pointer; }
      .fq-rows button.on { border-color: var(--primary, #f0b429); background: rgba(240,180,41,.18); }
      .fq-set { display: flex; flex-direction: column; gap: clamp(8px, 1.6dvh, 14px); min-height: 0; overflow-y: auto; }
      .fq-set h3 { margin: 0 0 4px; font-size: clamp(.8rem, 1.9dvh, .95rem); color: var(--muted, #a99d88); text-transform: uppercase; letter-spacing: .05em; }
      .fq-chips { display: flex; flex-wrap: wrap; gap: 6px; }
      .fq-chips button { border: 2px solid transparent; border-radius: 999px; padding: clamp(6px, 1.3dvh, 10px) 12px; background: var(--surface, #26201a); color: var(--text, #f3e9d4); font: inherit; font-size: clamp(.85rem, 2dvh, 1rem); cursor: pointer; }
      .fq-chips button.on { border-color: var(--primary, #f0b429); background: rgba(240,180,41,.18); font-weight: 700; }
      .fq-res { margin: 0; text-align: center; font-size: clamp(.95rem, 2.3dvh, 1.15rem); line-height: 1.4; }
      .fq-rank { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; min-height: 0; overflow-y: auto; }
      .fq-rank li { display: flex; justify-content: space-between; padding: 8px 14px; border-radius: 12px; background: var(--surface, #26201a); font-weight: 700; }
      .fq-rank li.top { box-shadow: 0 0 0 2px #4ade80 inset; }
      .fq-rank li.low { box-shadow: 0 0 0 2px #f87171 inset; }
      @media (min-aspect-ratio: 6/5) {
        .fq.split { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); align-items: center; }
        .fq.split > :not(.fq-card) { grid-column: 2; }
        .fq.split > .fq-card { grid-row: 1 / span 3; align-self: stretch; justify-content: center; }
      }
    `;
    document.head.appendChild(css);
  }

  const nm = (p) => `<b>${escapeHtml(p)}</b>`;
  const others = (s) => s.players.filter((p) => p !== s.cur.who);
  const qOf = (cur) => FUSSBALL_FRAGEN[cur.c][cur.l][cur.i];
  const answer = (cur) => qOf(cur)[1];
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  function botKnows(l) {
    return Math.random() > Math.min(0.95, (1 - BOT_P[l]) * botErr());
  }

  // --- Fragen ziehen ---

  function draw(s) {
    const cats = s.opt.cat === "all" ? Object.keys(FUSSBALL_FRAGEN) : [s.opt.cat];
    const lvls = s.opt.lvl === "mix" ? [1, 2, 3] : [Number(s.opt.lvl)];
    const ids = [];
    for (const c of cats) for (const l of lvls) FUSSBALL_FRAGEN[c][l].forEach((_, i) => ids.push(`${c}|${l}|${i}`));
    let free = ids.filter((id) => !s.used[id]);
    if (!free.length) {
      for (const id of ids) delete s.used[id]; // alle durch: von vorn
      free = ids;
    }
    const id = pick(free);
    s.used[id] = 1;
    const [c, l, i] = id.split("|");
    const q = FUSSBALL_FRAGEN[c][l][i];
    const open = s.opt.typ === "open" || (s.opt.typ === "both" && Math.random() < 0.5);
    s.k++;
    s.cur = { c, l: Number(l), i: Number(i), open, opts: open ? null : shuffle(q.slice(1)), who: s.players[s.turn], wrong: null };
    s.steal = null;
    s.res = null;
    s.stage = "ask";
  }

  function start(s) {
    s.round = 1;
    s.turn = 0;
    for (const p of s.players) s.pts[p] = 0;
    draw(s);
  }

  // --- Hauptfrage ---

  function mainAnswer(s, ok, wrongPick = null) {
    const { who, l } = s.cur;
    if (ok) {
      s.pts[who]++;
      s.res = { right: true };
      s.stage = "result";
      notice(s, { emoji: "✅", title: "Richtig!", text: `${who} +1 Punkt` });
      return;
    }
    s.cur.wrong = wrongPick;
    drink(s, [{ who, n: LVLS[l].sips, text: `falsch (${LVLS[l].label.toLowerCase()})` }]);
    startSteal(s);
  }

  // --- Die anderen dürfen ran ---

  function startSteal(s) {
    const { l, open } = s.cur;
    const left = open ? null : s.cur.opts.filter((o) => o !== s.cur.opts[s.cur.wrong]);
    const bots = [];
    for (const p of others(s)) {
      if (!isBot(p)) continue;
      if (botKnows(l)) bots.push({ who: p, at: 1.5 + Math.random() * 4, m: "right" });
      else if (Math.random() < 0.4) {
        // Bot rät: bei Multiple Choice kann er auch zufällig richtig liegen
        const g = left ? pick(left) : null;
        bots.push({ who: p, at: 2 + Math.random() * 4, m: g === answer(s.cur) ? "right" : "wrong", g });
      } else bots.push({ who: p, at: 3 + Math.random() * 3, m: "pass" });
    }
    bots.sort((a, b) => a.at - b.at);
    s.steal = { marks: {}, winner: null, bots, bi: 0 };
    // Mit mehreren Handys und Auswahl: jeder tippt selbst, der Schnellste gewinnt. Sonst wird reingerufen.
    s.stage = s.multi && !open ? "steal" : "call";
  }

  function stealMark(s, who, m) {
    const st = s.steal;
    if (st.winner || st.marks[who] || who === s.cur.who) return;
    st.marks[who] = m;
    if (m === "right") {
      st.winner = who;
      s.pts[who]++;
      drink(s, [{ who, n: 1, give: true, text: "am schnellsten richtig ⚡" }]);
    } else if (m === "wrong") {
      drink(s, [{ who, n: LVLS[s.cur.l].sips, text: "auch falsch" }]);
    }
    if (st.winner || others(s).every((p) => st.marks[p])) endSteal(s);
  }

  function endSteal(s) {
    const st = s.steal;
    for (const p of others(s)) st.marks[p] ??= "pass";
    s.res = { right: false };
    s.stage = "result";
  }

  // Reingerufen (ein Handy oder offene Frage): Antwort zeigen, dann markieren, wer was gesagt hat.
  function showCall(s) {
    const st = s.steal;
    const fast = st.bots.find((b) => b.m === "right");
    for (const b of st.bots) st.marks[b.who] = b.m === "right" ? (b === fast ? "first" : "late") : b.m;
    s.stage = "pick";
  }

  function finishPick(s) {
    const st = s.steal;
    const items = [];
    for (const p of others(s)) {
      const m = (st.marks[p] ??= "pass");
      if (m === "first") {
        st.winner = p;
        s.pts[p]++;
        items.push({ who: p, n: 1, give: true, text: "am schnellsten richtig ⚡" });
      } else if (m === "wrong") items.push({ who: p, n: LVLS[s.cur.l].sips, text: "auch falsch" });
    }
    s.res = { right: false };
    s.stage = "result";
    if (items.length) drink(s, items);
  }

  function next(s) {
    s.turn++;
    if (s.turn >= s.players.length) {
      s.turn = 0;
      s.round++;
    }
    if (s.round > s.opt.rounds) return end(s);
    draw(s);
  }

  function end(s) {
    s.stage = "end";
    const vals = s.players.map((p) => s.pts[p]);
    const max = Math.max(...vals);
    const min = Math.min(...vals);
    const items = [];
    if (max !== min) {
      for (const p of s.players) if (s.pts[p] === min) items.push({ who: p, n: LOSER_SIPS, text: "verloren, wenigste Punkte" });
      for (const p of s.players) if (s.pts[p] === max) items.push({ who: p, n: WINNER_GIVE, give: true, text: "gewonnen 🏆" });
      score(s, s.players.filter((p) => s.pts[p] === max), s.players.filter((p) => s.pts[p] === min));
    } else items.push({ who: ALL, n: 2, text: "alle gleich viele Punkte" });
    drink(s, items);
  }

  // --- Ansicht ---

  function phase(s) {
    const c = CATS[s.cur.c];
    return `Runde ${s.round}/${s.opt.rounds} · ${c.emoji} ${c.label} · ${LVLS[s.cur.l].emoji} ${LVLS[s.cur.l].label}`;
  }

  function cardHtml(s, showAnswer) {
    const cur = s.cur;
    return `<div class="fq-card"><span class="fq-tag">${cur.open ? "💬 Offene Frage" : "🔠 Multiple Choice"} · für ${escapeHtml(cur.who)}</span>
      <span class="fq-q">${escapeHtml(qOf(cur)[0])}</span>${showAnswer ? `<span class="fq-a">✅ ${escapeHtml(answer(cur))}</span>` : ""}</div>`;
  }

  // Antwortknöpfe. act(i) gibt die Aktion für Knopf i, by = wer drücken darf; reveal = richtig/falsch zeigen.
  function optsHtml(s, { act, by, reveal, notes = {} } = {}) {
    const cur = s.cur;
    return `<div class="fq-opts">${cur.opts
      .map((o, i) => {
        const cls = [reveal && o === answer(cur) ? "ok" : "", reveal && i === cur.wrong ? "bad" : "", !reveal && i === cur.wrong ? "gone" : ""].join(" ");
        const a = act && i !== cur.wrong ? ` data-act="${escapeHtml(JSON.stringify(act(i)))}"${by ? ` data-by="${escapeHtml(by)}"` : ""}` : "";
        return `<button class="fq-opt ${cls}"${a}>${escapeHtml(o)}${notes[i] ? `<small>${notes[i]}</small>` : ""}</button>`;
      })
      .join("")}</div>`;
  }

  function tallyHtml(s) {
    return `<ul class="za-tally">${[...s.players]
      .sort((a, b) => s.pts[b] - s.pts[a])
      .map((p) => `<li><span>${escapeHtml(p)}</span><span><b>${s.pts[p]}</b> ⚽</span></li>`)
      .join("")}</ul>`;
  }

  function askView(s, me) {
    const cur = s.cur;
    const p = cur.who;
    const mine = me === p;
    const title = me ? (mine ? "Du bist dran! Weißt du's?" : `${nm(p)} ist dran…`) : `⚽ ${nm(p)} ist dran!`;
    if (!cur.open) {
      return {
        phase: phase(s),
        title,
        body: `<div class="fq split">${cardHtml(s)}${optsHtml(s, { act: (i) => ({ type: "pick", k: s.k, i }), by: p })}</div>`,
        actions: [],
        turn: p,
      };
    }
    return {
      phase: phase(s),
      title,
      body: `<div class="fq split">${cardHtml(s)}<p class="fq-hint">${mine || !me ? "Antwort laut sagen, dann aufdecken. Ehrlich sein! 😇" : `${escapeHtml(p)} sagt gleich die Antwort laut.`}</p></div>`,
      actions: [{ label: "Antwort zeigen 👀", by: p, act: { type: "show", k: s.k } }],
    };
  }

  function judgeView(s, me) {
    const p = s.cur.who;
    return {
      phase: phase(s),
      title: me === p ? "Hattest du das?" : `Hatte ${nm(p)} das?`,
      body: `<div class="fq split">${cardHtml(s, true)}<p class="fq-hint">Ungefähr richtig zählt, wenn die Runde einverstanden ist.</p></div>`,
      actions: [
        { label: "✅ Richtig", by: p, act: { type: "judge", k: s.k, ok: true } },
        { label: "❌ Falsch", by: p, act: { type: "judge", k: s.k, ok: false } },
      ],
    };
  }

  // Mehrere Handys, Multiple Choice: alle anderen tippen gleichzeitig, der Schnellste gewinnt.
  function stealView(s, me) {
    const st = s.steal;
    const p = s.cur.who;
    const bot = st.bots[st.bi];
    const auto = bot ? { key: `fq-b-${s.k}-${st.bi}`, act: { type: "bot", k: s.k, n: st.bi }, ms: (bot.at - (st.bots[st.bi - 1]?.at ?? 0)) * 1000 } : null;
    const can = me && me !== p && !st.marks[me];
    const status = `<ul class="ww-status">${others(s)
      .map((o) => `<li class="${st.marks[o] ? "done" : ""}">${{ wrong: "❌", pass: "🤐", right: "⚡" }[st.marks[o]] ?? "⏳"} ${escapeHtml(o)}</li>`)
      .join("")}</ul>`;
    let title;
    if (me === p) title = "Falsch! Jetzt dürfen die anderen…";
    else if (st.marks[me] === "wrong") title = "Auch falsch! Warte auf die anderen…";
    else if (st.marks[me] === "pass") title = "Enthalten. Warte auf die anderen…";
    else title = `${nm(p)} lag falsch! Wer ist am schnellsten? ⚡`;
    const actions = [];
    if (can) actions.push({ label: "🤐 Enthalten", ghost: true, act: { type: "steal", k: s.k, who: me, m: "pass" } });
    if (me !== p) actions.push({ label: "Auflösen", ghost: true, act: { type: "endsteal", k: s.k } });
    return {
      phase: phase(s),
      title,
      body: `<div class="fq split">${cardHtml(s)}${optsHtml(s, { act: can ? (i) => ({ type: "steal", k: s.k, who: me, i }) : null, by: me })}${status}</div>`,
      actions,
      auto,
    };
  }

  function callView(s) {
    const allBots = others(s).every(isBot);
    return {
      phase: phase(s),
      title: `❌ ${nm(s.cur.who)} lag falsch! Wer weiß es?`,
      body: `<div class="fq split">${cardHtml(s)}${s.cur.open ? "" : optsHtml(s)}<p class="fq-hint">Die anderen rufen die Antwort rein, wer zuerst richtig ist, verteilt 1 Schluck. Wer falsch ruft, trinkt ${sips(LVLS[s.cur.l].sips)}. Keine Ahnung? Einfach still sein = enthalten.</p></div>`,
      actions: [{ label: "Antwort zeigen 👀", act: { type: "call", k: s.k } }],
      auto: allBots ? { key: `fq-c-${s.k}`, act: { type: "call", k: s.k }, ms: 3500 } : null,
    };
  }

  function pickView(s) {
    const st = s.steal;
    const allBots = others(s).every(isBot);
    const MARKS = [
      ["first", "⚡ Erster"],
      ["late", "✅ Auch"],
      ["wrong", "❌ Falsch"],
      ["pass", "🤐 Enthalten"],
    ];
    const rows = others(s)
      .map((p) => {
        const b = st.bots.find((x) => x.who === p);
        const info = b ? ` <small>${b.m === "pass" ? "enthält sich" : `ruft „${escapeHtml(b.m === "right" ? answer(s.cur) : b.g ?? "äh… keine Ahnung, Müller?")}“ nach ${b.at.toFixed(1).replace(".", ",")} s`}</small>` : "";
        const btns = MARKS.map(([m, label]) => `<button class="${(st.marks[p] ?? "pass") === m ? "on" : ""}" data-act="${escapeHtml(JSON.stringify({ type: "mark", k: s.k, who: p, m }))}">${label}</button>`).join("");
        return `<li><span class="nm">${escapeHtml(p)}${info}</span><span class="mk">${btns}</span></li>`;
      })
      .join("");
    return {
      phase: phase(s),
      title: "Wer hat was gerufen?",
      body: `<div class="fq split">${cardHtml(s, true)}<ul class="fq-rows">${rows}</ul></div>`,
      actions: [{ label: "Fertig ➡️", act: { type: "done", k: s.k } }],
      auto: allBots ? { key: `fq-p-${s.k}`, act: { type: "done", k: s.k }, ms: 3000 } : null,
    };
  }

  function resultView(s, me) {
    const cur = s.cur;
    const p = cur.who;
    const st = s.steal;
    const you = (x) => (me === x ? "Du" : nm(x));
    let title;
    let text = "";
    if (s.res.right) title = `✅ ${you(p)} ${me === p ? "hattest" : "hatte"} recht! +1 Punkt`;
    else {
      const w = st.winner;
      const wrong = others(s).filter((o) => st.marks[o] === "wrong");
      title = w ? `⚡ ${you(w)} ${me === w ? "warst" : "war"} am schnellsten! +1 Punkt und 1 Schluck verteilen` : `❌ Keiner wusste es!`;
      text = `${nm(p)} trinkt ${sips(LVLS[cur.l].sips)}${wrong.length ? `, ${wrong.map(nm).join(", ")} auch` : ""}.`;
    }
    const notes = {};
    if (!cur.open && st && s.multi) {
      // wer hat was getippt (nur mehrere Handys, da weiß die App es)
      for (const [who, m] of Object.entries(st.marks)) if (m === "right") notes[cur.opts.indexOf(answer(cur))] = `⚡ ${escapeHtml(who)}`;
    }
    const last = s.turn === s.players.length - 1 && s.round === s.opt.rounds;
    return {
      phase: phase(s),
      title,
      body: `<div class="fq split">${cardHtml(s, true)}${cur.open ? "" : optsHtml(s, { reveal: true, notes })}${text ? `<p class="fq-res">${text}</p>` : ""}${tallyHtml(s)}</div>`,
      actions: [{ label: last ? "Zum Ergebnis 🏆" : `Weiter: ${s.players[(s.turn + 1) % s.players.length]} ➡️`, act: { type: "next", k: s.k } }],
    };
  }

  function endView(s, me) {
    const sorted = [...s.players].sort((a, b) => s.pts[b] - s.pts[a]);
    const max = s.pts[sorted[0]];
    const min = s.pts[sorted[sorted.length - 1]];
    const winners = sorted.filter((p) => s.pts[p] === max);
    const title = max === min ? "🤝 Unentschieden! Alle trinken 2 Schlucke." : `🏆 ${winners.map((p) => (p === me ? "Du" : nm(p))).join(" und ")} ${winners.length > 1 || winners[0] === me ? "habt" : "hat"} gewonnen!`;
    const rows = sorted
      .map((p, i) => `<li class="${max !== min && s.pts[p] === max ? "top" : max !== min && s.pts[p] === min ? "low" : ""}"><span>${i + 1}. ${escapeHtml(p)}</span><span>${s.pts[p]} ⚽</span></li>`)
      .join("");
    return {
      phase: "Abpfiff!",
      title,
      body: `<div class="fq"><ul class="fq-rank">${rows}</ul>${max !== min ? `<p class="fq-hint">Wenigste Punkte: ${sips(LOSER_SIPS)} trinken. Sieger: ${sips(WINNER_GIVE)} verteilen.</p>` : ""}</div>`,
      actions: [
        { label: "Nochmal ⚽", act: { type: "again" } },
        { label: "Andere Fragen", ghost: true, act: { type: "setup" } },
      ],
    };
  }

  function introView(s) {
    const [a, b, c] = [...s.players, "Tom", "Paula", "Kalle"].map(escapeHtml);
    return {
      phase: "So geht das Fußball-Quiz",
      title: "Reihum kriegt jeder eine Frage. Falsch = trinken!",
      body: `<ol class="za-intro">
          <li>Ihr wählt Kategorie, Schwierigkeit und ob die Fragen <b>Multiple Choice</b>, <b>offen</b> oder beides sind.</li>
          <li>Richtig: <b>1 Punkt</b>. Falsch: trinken, bei leichten Fragen ${sips(3)}, mittel ${sips(2)}, schwer ${sips(1)}.</li>
          <li>Dann dürfen die anderen: wer <b>am schnellsten richtig</b> antwortet, kriegt den Punkt und <b>verteilt 1 Schluck</b>. Wer falsch antwortet, trinkt auch. Keine Ahnung? <b>Enthalten</b>.</li>
          <li>Nach den Runden trinkt, wer die <b>wenigsten Punkte</b> hat, ${sips(LOSER_SIPS)}. Der Sieger verteilt ${sips(WINNER_GIVE)}.</li>
        </ol>
        <p class="za-example">Beispiel: ${a} kriegt „Wer wurde 2014 Weltmeister?“ und tippt Brasilien. Falsch, ${a} trinkt ${sips(3)}. ${b} ruft sofort „Deutschland!“, kriegt den Punkt und verteilt 1 Schluck an ${a}. ${c} hat sich enthalten und trinkt nichts.</p>`,
      actions: [{ label: "Anstoß! ⚽", act: { type: "go" } }],
    };
  }

  function setupView(s) {
    const group = (title, key, opts) =>
      `<div><h3>${title}</h3><div class="fq-chips">${Object.entries(opts)
        .map(([v, label]) => `<button class="${String(s.opt[key]) === v ? "on" : ""}" data-act="${escapeHtml(JSON.stringify({ type: "opt", key, v }))}">${label}</button>`)
        .join("")}</div></div>`;
    const cats = Object.fromEntries(Object.entries(CATS).map(([k, c]) => [k, `${c.emoji} ${c.label}`]));
    return {
      phase: "Fußball-Quiz",
      title: "Welche Fragen wollt ihr?",
      body: `<div class="fq-set">${group("Kategorie", "cat", cats)}${group("Schwierigkeit", "lvl", LVL_OPTS)}${group("Art der Fragen", "typ", TYP_OPTS)}${group("Länge (jeder eine Frage pro Runde)", "rounds", ROUND_OPTS)}</div>`,
      actions: [{ label: "Los geht's ⚽", act: { type: "start" } }],
    };
  }

  registerGame(KEY, {
    label: "Fußball-Quiz",
    emoji: "⚽",
    description: "Bundesliga, WM, Champions League: Falsch geantwortet? Trinken!",
    color: "#15803d",
    fit: true,
    maxPlayers: 8,
    rules: [
      "Für 2 bis 8 Leute. Vorher wählt ihr die Kategorie (Bundesliga, WM & EM, Champions League, Stars & Legenden, Regeln & Rekorde oder alles), die Schwierigkeit (leicht, mittel, schwer oder gemischt), die Art der Fragen (Multiple Choice, offen oder beides) und wie viele Runden.",
      "Reihum bekommt jeder eine Frage. Bei Multiple Choice tippt man die Antwort an. Bei offenen Fragen sagt man die Antwort laut, deckt auf und sagt ehrlich, ob es stimmte.",
      "Richtig: 1 Punkt. Falsch: trinken, bei leichten Fragen 3 Schlucke, bei mittleren 2, bei schweren 1.",
      "Nach einer falschen Antwort dürfen die anderen ran. Wer am schnellsten richtig antwortet, kriegt den Punkt und verteilt 1 Schluck. Wer dabei falsch antwortet, trinkt genauso. Wer keine Ahnung hat, enthält sich und trinkt nichts.",
      "Mit mehreren Handys tippen die anderen gleichzeitig am eigenen Handy, der Schnellste gewinnt. Auf einem Handy oder bei offenen Fragen wird reingerufen, danach tippt ihr an, wer zuerst richtig war und wer falsch lag.",
      `Nach der letzten Runde trinkt, wer die wenigsten Punkte hat, ${LOSER_SIPS} Schlucke. Wer die meisten hat, verteilt ${WINNER_GIVE}.`,
      "Bots spielen mit: je schwerer die Frage, desto öfter liegen sie daneben. Beim Reinrufen enthalten sie sich manchmal oder raten.",
    ],

    setup(players) {
      return { players, stage: "intro", multi: false, opt: { cat: "all", lvl: "mix", typ: "both", rounds: 5 }, pts: {}, used: {}, k: 0, round: 1, turn: 0, cur: null, steal: null, res: null };
    },

    view(s, me) {
      switch (s.stage) {
        case "intro": return introView(s);
        case "setup": return setupView(s);
        case "ask": return askView(s, me);
        case "judge": return judgeView(s, me);
        case "steal": return stealView(s, me);
        case "call": return callView(s);
        case "pick": return pickView(s);
        case "result": return resultView(s, me);
        default: return endView(s, me);
      }
    },

    act(s, a, by) {
      if (a.type === "go" && s.stage === "intro") {
        s.multi = by != null; // mit mehreren Handys kommt jede Aktion mit Namen
        s.stage = "setup";
        return;
      }
      if (s.stage === "setup") {
        if (a.type === "opt") {
          const ok = { cat: CATS, lvl: LVL_OPTS, typ: TYP_OPTS, rounds: ROUND_OPTS }[a.key];
          if (ok && a.v in ok) s.opt[a.key] = a.key === "rounds" ? Number(a.v) : a.v;
        } else if (a.type === "start") start(s);
        return;
      }
      if (s.stage === "end") {
        if (a.type === "again") start(s);
        else if (a.type === "setup") s.stage = "setup";
        return;
      }
      if (a.k !== s.k) return; // alter Knopf von der vorigen Frage
      const cur = s.cur;
      switch (s.stage) {
        case "ask":
          if (a.type === "pick" && !cur.open && cur.opts[a.i] != null) mainAnswer(s, cur.opts[a.i] === answer(cur), a.i);
          else if (a.type === "show" && cur.open) s.stage = "judge";
          break;
        case "judge":
          if (a.type === "judge") mainAnswer(s, !!a.ok);
          break;
        case "steal":
          if (a.type === "steal" && s.players.includes(a.who) && !isBot(a.who)) {
            if (a.m === "pass") stealMark(s, a.who, "pass");
            else if (cur.opts[a.i] != null && a.i !== cur.wrong) stealMark(s, a.who, cur.opts[a.i] === answer(cur) ? "right" : "wrong");
          } else if (a.type === "bot" && a.n === s.steal.bi) {
            const b = s.steal.bots[s.steal.bi++];
            if (b) stealMark(s, b.who, b.m);
          } else if (a.type === "endsteal") endSteal(s);
          break;
        case "call":
          if (a.type === "call") showCall(s);
          break;
        case "pick":
          if (a.type === "mark" && others(s).includes(a.who) && ["first", "late", "wrong", "pass"].includes(a.m)) {
            if (a.m === "first") for (const p of others(s)) if (s.steal.marks[p] === "first") s.steal.marks[p] = "late";
            s.steal.marks[a.who] = a.m;
          } else if (a.type === "done") finishPick(s);
          break;
        case "result":
          if (a.type === "next") next(s);
          break;
      }
    },

    // Bot ist mit der Hauptfrage dran
    bot(s, name) {
      const cur = s.cur;
      if (!cur || cur.who !== name) return null;
      if (s.stage === "ask" && cur.open) return { type: "show", k: s.k };
      if (s.stage === "judge") return { type: "judge", k: s.k, ok: botKnows(cur.l) };
      if (s.stage === "ask") {
        const right = cur.opts.indexOf(answer(cur));
        if (botKnows(cur.l)) return { type: "pick", k: s.k, i: right };
        return { type: "pick", k: s.k, i: pick(cur.opts.map((_, i) => i).filter((i) => i !== right)) };
      }
      return null;
    },
  });
})();
