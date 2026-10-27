// Fenster: 21 verdeckte Karten liegen als Fenster auf dem Tisch. Oben und unten je 5 Karten, links und rechts
// dazwischen je 3, in der Mitte ein Kreuz, das die mittleren Karten der Seiten verbindet. Die 4 Ecken liegen offen.
// Wer dran ist, deckt Karten neben offenen Karten auf und sagt vorher höher oder tiefer (zwischen zwei offenen
// Karten: dazwischen oder außerhalb). Falsch: Man trinkt so viele Schlucke, wie Karten offen mit ihr verbunden sind,
// die werden wieder umgedreht (Ecken bekommen eine neue offene Karte) und man spielt weiter. Ab 2 richtigen darf man abgeben und verteilen.
(() => {
  const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "B", "D", "K", "A"];
  const NAMES = { 11: "Bube", 12: "Dame", 13: "König", 14: "Ass" };
  const MIN_CARDS = 2;

  // Plätze auf einem 5x5-Raster: Rahmen (16) und Kreuz (5). Benachbart = direkt daneben auf dem Raster,
  // so laufen die Linien waagerecht, senkrecht und um die Ecken des Rahmens.
  const CELLS = [];
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      if (r === 0 || r === 4 || c === 0 || c === 4 || r === 2 || c === 2) CELLS.push([r, c]);
    }
  }
  const at = (r, c) => CELLS.findIndex(([a, b]) => a === r && b === c);
  const MID = at(2, 2);
  const CORNERS = [at(0, 0), at(0, 4), at(4, 0), at(4, 4)];
  const NEIGHBORS = CELLS.map(([r, c]) =>
    [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].map(([a, b]) => at(a, b)).filter((i) => i >= 0)
  );

  const cardName = (v) => NAMES[v] ?? String(v);
  const name = (p) => `<b>${escapeHtml(p)}</b>`;

  function newDeck() {
    return shuffle(SUITS.flatMap((suit) => RANKS.map((rank, i) => ({ suit, rank, value: i + 2 }))));
  }

  const isOpen = (s, i) => s.board[i].open;
  const openCount = (s) => s.board.filter((b) => b.open).length;

  // Verdeckte Karte neben mindestens einer offenen.
  function playable(s, i) {
    return !isOpen(s, i) && NEIGHBORS[i].some((n) => isOpen(s, n));
  }

  // Woran geraten wird: eine offene Nachbarkarte (höher/tiefer) oder zwei (dazwischen/außerhalb).
  // Bei zwei liegen sie lieber in einer Linie, sonst über die Ecke.
  function refsOf(s, i) {
    const open = NEIGHBORS[i].filter((n) => isOpen(s, n));
    if (open.length < 2) return open;
    const [r, c] = CELLS[i];
    const line = (a, b) => CELLS[a][0] + CELLS[b][0] === 2 * r && CELLS[a][1] + CELLS[b][1] === 2 * c;
    for (let a = 0; a < open.length; a++) {
      for (let b = a + 1; b < open.length; b++) if (line(open[a], open[b])) return [open[a], open[b]];
    }
    return open.slice(0, 2);
  }

  // Die möglichen Tipps für Platz i, mit den Werten der offenen Karten daneben.
  function optionsOf(s, i) {
    const refs = refsOf(s, i);
    const vals = refs.map((n) => s.board[n].card.value);
    if (vals.length === 1) {
      const v = vals[0];
      return [
        { dir: "hoch", label: `Höher als ${cardName(v)} ⬆`, ok: (x) => x > v, can: v < 14 },
        { dir: "tief", label: `Tiefer als ${cardName(v)} ⬇`, ok: (x) => x < v, can: v > 2 },
      ];
    }
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    return [
      { dir: "rein", label: `Dazwischen ↔`, sub: `${cardName(lo)} bis ${cardName(hi)}`, ok: (x) => x > lo && x < hi, can: hi - lo > 1 },
      { dir: "raus", label: `Außerhalb ⇹`, sub: `unter ${cardName(lo)}, über ${cardName(hi)}`, ok: (x) => x < lo || x > hi, can: lo > 2 || hi < 14 },
      // Gleich: richtig, wenn die Karte denselben Wert hat wie eine der beiden (Zahl oder Bild)
      { dir: "gleich", label: `Gleich =`, sub: lo === hi ? cardName(lo) : `${cardName(lo)} oder ${cardName(hi)}`, ok: (x) => x === lo || x === hi, can: true },
    ];
  }

  // Alle offenen Karten, die über Linien mit Platz i verbunden sind (i selbst mitgezählt).
  function groupOf(s, i) {
    const seen = new Set([i]);
    const todo = [i];
    while (todo.length) {
      for (const n of NEIGHBORS[todo.pop()]) {
        if (!seen.has(n) && isOpen(s, n)) {
          seen.add(n);
          todo.push(n);
        }
      }
    }
    return [...seen];
  }

  // --- Anzeige ---

  // Eine Animation läuft nur beim ersten Erscheinen, danach liegt die Karte still, auch wenn neu gezeichnet wird.
  const seen = new Map();
  function since(key) {
    if (!seen.has(key)) seen.set(key, Date.now());
    return (Date.now() - seen.get(key)) / 1000;
  }

  function cardHtml(s, i, tap) {
    const b = s.board[i];
    const cls = ["fe-card"];
    let style = "";
    let attrs = "";
    if (i === MID) cls.push("mid");
    if (s.sel === i) cls.push("sel");
    if (s.stage === "guess" && s.sel != null && refsOf(s, s.sel).includes(i)) cls.push("ref");
    if (s.stage === "wrong" && s.wrong.group.includes(i)) cls.push("bad");
    if (s.last && s.last.i === i && b.open) {
      const t = since(s.last.id);
      if (t < 1.2) {
        cls.push("flip");
        style = ` style="animation-delay: ${-t}s"`;
      }
      if (s.stage !== "wrong") cls.push(s.last.ok ? "right" : "bad");
    }
    if (tap && playable(s, i)) {
      cls.push("can");
      attrs = ` data-act='${JSON.stringify({ type: "pick", i })}' data-by="${escapeHtml(tap)}" role="button"`;
    }
    attrs += ` data-i="${i}"`;
    if (!b.open) {
      cls.push("back");
      return `<div class="${cls.join(" ")}"${attrs}>${i === MID ? "<span>🥃</span>" : ""}</div>`;
    }
    if (b.card.suit.red) cls.push("red");
    return `<div class="${cls.join(" ")}"${style}${attrs}><span>${b.card.rank}</span><span>${b.card.suit.symbol}</span></div>`;
  }

  function boardHtml(s, tap = null) {
    const cells = [];
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        const i = at(r, c);
        cells.push(i < 0 ? `<div class="fe-gap"></div>` : cardHtml(s, i, tap));
      }
    }
    return `<div class="fe-table"><div class="fe-grid">${cells.join("")}</div></div>`;
  }

  // Kleine Zeile oben: Runde, wer dran ist, wie viele Karten richtig. Der Platz gehört dem Tisch.
  function infoLine(s, me) {
    const p = s.players[s.cur];
    const who = me === p ? "Du bist" : `${escapeHtml(p)} ist`;
    const got = s.count >= MIN_CARDS ? `${s.count} richtig` : `${s.count} von ${MIN_CARDS}`;
    return `Runde ${s.round} · ${who} dran · ${got}${s.mid ? " · 🥃" : ""}`;
  }

  // Kleiner Knopf. Vor der 2. richtigen Karte leuchtet er beim Drücken nur rot auf (siehe afterRender).
  const STOP = "Aufhören";
  function stopAction(s) {
    return { label: STOP, act: { type: "stop" }, by: s.players[s.cur], ghost: true };
  }

  function pickView(s, me) {
    const p = s.players[s.cur];
    const mine = me === p;
    return {
      phase: infoLine(s, me),
      title: mine || !me ? "" : `${name(p)} sucht sich eine Karte aus`,
      body: boardHtml(s, p),
      actions: [stopAction(s)],
      actionsClass: "fe-actions",
      turn: p,
    };
  }

  function guessView(s, me) {
    const p = s.players[s.cur];
    const opts = optionsOf(s, s.sel);
    const two = opts[0].dir === "rein";
    return {
      phase: infoLine(s, me),
      title: two ? "Dazwischen, außerhalb oder gleich?" : "Höher oder tiefer?",
      body: boardHtml(s, p),
      actions: [
        ...opts.map((o) => ({ label: o.label, sub: o.sub, act: { type: "guess", dir: o.dir }, by: p, disabled: !o.can })),
        stopAction(s),
      ],
      actionsClass: `fe-actions fe-n${opts.length}`,
      turn: p,
    };
  }

  function wrongView(s, me) {
    const w = s.wrong;
    const p = s.players[s.cur];
    return {
      phase: infoLine(s, me),
      title: `❌ ${cardName(w.value)}! ${name(p)} trinkt ${sips(w.n)}${w.shot ? " und einen Shot 🥃" : ""}.`,
      body: boardHtml(s),
      actions: [{ label: "Umdrehen und weiter", sub: `${me === p ? "Du spielst" : `${p} spielt`} weiter, bis ${MIN_CARDS} richtig sind`, act: { type: "next" }, by: p }],
    };
  }

  function endView(s) {
    const ranking = [...s.players].sort((a, b) => s.tally[b].sips - s.tally[a].sips);
    const rows = ranking
      .map((p) => `<li><span>${name(p)}</span><b>${sips(s.tally[p].sips)}${s.tally[p].shots ? ` + ${s.tally[p].shots} 🥃` : ""}</b></li>`)
      .join("");
    return {
      phase: "",
      title: `🪟 Fenster komplett! ${name(s.winner)} hat die letzte Karte aufgedeckt.`,
      body: `${boardHtml(s)}<p class="bf-text fd-center">Getrunken in dieser Runde</p><ul class="fd-tally fe-tally">${rows}</ul>`,
      actions: [
        { label: "Nochmal spielen", act: { type: "restart" } },
        { label: "Zum Menü", exit: true, ghost: true },
      ],
    };
  }

  // --- Spielablauf ---

  function deal(s, i) {
    s.board[i] = { open: true, card: s.deck.pop() };
  }

  function guess(s, i, dir) {
    if (!playable(s, i)) return;
    const opt = optionsOf(s, i).find((o) => o.dir === dir);
    if (!opt || !opt.can) return;
    const p = s.players[s.cur];
    deal(s, i);
    const card = s.board[i].card;
    s.sel = null;
    s.last = { i, ok: opt.ok(card.value), id: Math.random().toString(36).slice(2) };
    s.swept = null;
    if (s.last.ok) {
      s.count++;
      if (i === MID) s.mid = true;
      if (openCount(s) === CELLS.length) return finish(s, p);
      s.stage = "pick";
      return;
    }
    // Falsch: alle offenen Karten, die mit ihr verbunden sind, zählen. Hängt die Mitte dran, kommt ein Shot dazu.
    const group = groupOf(s, i);
    const shot = group.includes(MID);
    const level = LEVELS[levelOf(s)];
    s.tally[p].sips += level.scale(group.length);
    if (shot) s.tally[p].shots++;
    s.wrong = { group, n: group.length, shot, value: card.value };
    const items = [{ who: p, n: group.length, text: `${cardName(card.value)} daneben – ${group.length} ${group.length === 1 ? "Karte hängt" : "Karten hängen"} zusammen` }];
    if (shot) items.push({ who: p, text: "🥃 1 Shot, die Mitte war dabei" });
    drink(s, items);
    s.stage = "wrong";
  }

  // Aufhören: die aufgedeckten Karten als Schlucke verteilen, mit der Mitte noch einen Shot.
  function give(s, p) {
    const items = [{ who: p, n: s.count, give: true, text: `${s.count} ${s.count === 1 ? "Karte" : "Karten"} aufgedeckt` }];
    if (s.mid) {
      if (isBot(p)) {
        const others = s.players.filter((x) => x !== p);
        const to = others[Math.floor(Math.random() * others.length)];
        items.push({ who: to, text: `🥃 1 Shot von ${p}` });
        s.tally[to].shots++;
      }
      else items.push({ who: p, give: true, text: "🥃 1 Shot verteilen, du hast die Mitte aufgedeckt" });
    }
    drink(s, items);
  }

  function finish(s, p) {
    give(s, p);
    s.winner = p;
    s.stage = "end";
  }

  function nextTurn(s) {
    s.cur = (s.cur + 1) % s.players.length;
    if (s.cur === s.start) s.round++;
    s.count = 0;
    s.mid = false;
    s.sel = null;
    s.wrong = null;
    s.stage = "pick";
  }

  // Nach dem Fehler: die verbundenen Karten werden umgedreht, kommen zurück in den Stapel, und der wird gemischt.
  // Die Ecken werden dabei ausgetauscht und liegen gleich wieder offen. Wer falsch lag, spielt weiter und fängt beim Zählen wieder bei 0 an.
  function flipBack(s) {
    s.swept = { id: Math.random().toString(36).slice(2), cards: s.wrong.group.map((i) => ({ i, card: s.board[i].card })) };
    for (const i of s.wrong.group) {
      s.deck.push(s.board[i].card);
      s.board[i] = { open: false, card: null };
    }
    shuffle(s.deck);
    // Ecken, die dranhingen, bekommen eine neue Karte, die gleich wieder offen liegt.
    for (const i of s.wrong.group) if (CORNERS.includes(i)) deal(s, i);
    s.last = null;
    s.count = 0;
    s.mid = false;
    s.sel = null;
    s.wrong = null;
    s.stage = "pick";
  }

  // --- Animationen nach dem Zeichnen ---

  // Rechte Hand von oben gesehen, mit Ärmel. Die kleine-Finger-Seite schiebt die Karten nach rechts.
  const HAND_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 380"> <defs> <linearGradient id="fhs" x1="0" x2="1" y1="0" y2="0"> <stop offset="0" stop-color="#c98d64"/><stop offset="0.35" stop-color="#f0c39c"/><stop offset="0.7" stop-color="#e9b48a"/><stop offset="1" stop-color="#b97a52"/> </linearGradient> <linearGradient id="fhf" x1="0" x2="1"> <stop offset="0" stop-color="#cf946a"/><stop offset="0.45" stop-color="#f3caa4"/><stop offset="1" stop-color="#c4875e"/> </linearGradient> <radialGradient id="fhb" cx="0.5" cy="0.35" r="0.6"> <stop offset="0" stop-color="#fff" stop-opacity="0.28"/><stop offset="1" stop-color="#fff" stop-opacity="0"/> </radialGradient> <linearGradient id="fhc" x1="0" x2="1"> <stop offset="0" stop-color="#14213d"/><stop offset="0.5" stop-color="#26385f"/><stop offset="1" stop-color="#101a30"/> </linearGradient> </defs> <path d="M72 214 C76 260 70 300 62 320 L146 320 C138 300 134 260 146 210 Z" fill="url(#fhs)"/> <path d="M50 300 C80 292 130 292 162 300 L180 6000 L32 6000 Z" fill="url(#fhc)"/> <path d="M50 300 C80 292 130 292 162 300 L163 312 C130 304 82 304 49 312 Z" fill="#f4f1ea"/> <path d="M70 340 C90 360 92 420 84 520 M140 330 C126 380 128 460 136 560" stroke="#0b1428" stroke-width="5" fill="none" opacity="0.5"/> <g class="fh-thumb"> <path d="M66 178 C48 170 30 150 22 128 C17 114 28 104 40 112 C52 122 62 138 76 150 Z" fill="url(#fhf)"/> <path d="M24 122 C24 113 33 110 38 116 C41 121 37 127 31 128 C27 128 24 126 24 122 Z" fill="#f6d9c4" opacity="0.9"/> </g> <g class="fh-fingers"> <g class="fh-f1" transform="rotate(-5 72 126)"><rect x="60" y="34" width="25" height="92" rx="12.5" fill="url(#fhf)"/><rect x="64.5" y="38" width="16" height="18" rx="7" fill="#f7dccb"/><path d="M63 80 q9 4 19 0" stroke="#a8724d" stroke-width="1.6" fill="none" opacity="0.55"/></g> <g class="fh-f2" transform="rotate(-1 100 124)"><rect x="87" y="18" width="26" height="106" rx="13" fill="url(#fhf)"/><rect x="92" y="22" width="16" height="19" rx="7" fill="#f7dccb"/><path d="M90 70 q10 4 20 0" stroke="#a8724d" stroke-width="1.6" fill="none" opacity="0.55"/></g> <g class="fh-f3" transform="rotate(3 127 124)"><rect x="115" y="26" width="24" height="98" rx="12" fill="url(#fhf)"/><rect x="119" y="30" width="16" height="18" rx="7" fill="#f7dccb"/><path d="M118 76 q9 4 18 0" stroke="#a8724d" stroke-width="1.6" fill="none" opacity="0.55"/></g> <g class="fh-f4" transform="rotate(8 151 130)"><rect x="141" y="50" width="21" height="80" rx="10.5" fill="url(#fhf)"/><rect x="144.5" y="53" width="14" height="15" rx="6" fill="#f7dccb"/><path d="M144 92 q8 3 15 0" stroke="#a8724d" stroke-width="1.6" fill="none" opacity="0.55"/></g> </g> <path d="M60 120 C60 106 74 102 100 102 C130 102 156 106 161 124 C164 150 160 178 150 205 C144 222 132 234 106 236 C84 236 72 226 66 208 C60 188 58 150 60 120 Z" fill="url(#fhs)"/> <path d="M60 120 C60 106 74 102 100 102 C130 102 156 106 161 124 C164 150 160 178 150 205 C144 222 132 234 106 236 C84 236 72 226 66 208 C60 188 58 150 60 120 Z" fill="url(#fhb)"/> <g fill="#fff" opacity="0.18"><ellipse cx="74" cy="121" rx="6" ry="3.5"/><ellipse cx="100" cy="117" rx="6" ry="3.5"/><ellipse cx="126" cy="120" rx="6" ry="3.5"/><ellipse cx="150" cy="128" rx="5" ry="3"/></g> <g stroke="#a8724d" stroke-width="1.2" fill="none" opacity="0.18"><path d="M74 132 C80 170 88 200 96 226"/><path d="M100 128 C102 170 104 200 106 228"/><path d="M127 131 C124 170 120 200 116 226"/></g> </svg>`;

  // Nach einem Fehler schiebt eine Hand die verbundenen Karten vom Tisch, dann werden neue vom Stapel hingelegt.
  // Läuft auf jedem Handy einmal pro Fehler. Gibt zurück, wie lange es dauert.
  const sweptSeen = new Set();
  function sweepAnim(root, s) {
    const sw = s.swept;
    if (!sw || sweptSeen.has(sw.id)) return 0;
    sweptSeen.add(sw.id);
    const table = root.querySelector(".fe-table");
    const cells = sw.cards
      .map((c) => ({ ...c, el: root.querySelector(`.fe-card[data-i="${c.i}"]`) }))
      .filter((c) => c.el)
      .map((c) => ({ ...c, r: c.el.getBoundingClientRect() }))
      .sort((a, b) => a.r.left - b.r.left || a.r.top - b.r.top);
    if (!cells.length || !table) return 0;
    const tr = table.getBoundingClientRect();
    const H = cells[0].r.height;
    const W = cells[0].r.width;
    const START = 250;
    const SWEEP = 500 + cells.length * 160;

    // Hand fährt von links über alle Karten nach rechts aus dem Bild und wackelt dabei leicht
    const hand = document.createElement("div");
    hand.className = "fe-hand";
    hand.innerHTML = HAND_SVG;
    const hw = Math.min(W, H) * 1.7;
    const hh = hw * 1.9;
    Object.assign(hand.style, { width: `${hw}px`, height: `${hh}px`, left: "0px", top: "0px" });
    document.body.appendChild(hand);
    const at = (x, cy) => ({ x: x - hw * 0.8, y: cy - hh * 0.42 });
    const pts = [
      at(tr.left - hw * 0.3, cells[0].r.top + H / 2),
      ...cells.map((c) => at(c.r.left + W * 0.12, c.r.top + H / 2)),
      at(window.innerWidth + hw * 1.2, cells[cells.length - 1].r.top + H / 2 - H * 0.3),
    ];
    const frames = pts.map((p, k) => ({
      transform: `translate(${p.x}px, ${p.y}px) rotate(${k === 0 ? -3 : k === pts.length - 1 ? 2 : k % 2 ? 1 : -1}deg)`,
      offset: k / (pts.length - 1),
    }));
    hand.animate(frames, { duration: SWEEP, delay: START, easing: "ease-in-out", fill: "both" }).onfinish = () => hand.remove();

    // Die alten Karten liegen noch kurz da und werden weggeschoben, sobald die Hand sie erreicht
    cells.forEach((c, k) => {
      const ghost = document.createElement("div");
      ghost.className = `fe-ghost ${c.card.suit.red ? "red" : ""}`;
      ghost.innerHTML = `<span>${c.card.rank}</span><span>${c.card.suit.symbol}</span>`;
      Object.assign(ghost.style, {
        left: `${c.r.left}px`,
        top: `${c.r.top}px`,
        width: `${W}px`,
        height: `${H}px`,
        fontSize: `${Math.min(W, H) * 0.3}px`,
        borderRadius: `${Math.min(W, H) * 0.12}px`,
      });
      document.body.appendChild(ghost);
      const hit = START + SWEEP * ((k + 1) / (pts.length - 1)) - 60;
      const off = window.innerWidth - c.r.left + 40;
      ghost.animate(
        [
          { transform: "none", opacity: 1 },
          { transform: `translate(${W * 0.3}px, -4px) rotate(6deg)`, opacity: 1, offset: 0.25 },
          { transform: `translate(${off}px, ${-H * 0.4}px) rotate(${20 + k * 4}deg)`, opacity: 0.9 },
        ],
        { duration: Math.max(380, SWEEP - (hit - START)), delay: hit, easing: "ease-in", fill: "both" }
      ).onfinish = () => ghost.remove();
    });

    // Dieselbe Hand kommt von rechts zurück und legt zügig neue Karten hin, eine nach der anderen
    const DEAL = START + SWEEP + 120;
    const STEP = 200;
    const back = [...cells].reverse();
    const dealer = document.createElement("div");
    dealer.className = "fe-hand";
    dealer.innerHTML = HAND_SVG;
    Object.assign(dealer.style, { width: `${hw}px`, height: `${hh}px`, left: "0px", top: "0px" });
    document.body.appendChild(dealer);
    // Handfläche über der Kartenmitte
    const over = (c) => ({ x: c.r.left + W / 2 - hw * 0.55, y: c.r.top + H * 0.3 - hh * 0.42 });
    const dpts = [{ x: window.innerWidth + hw, y: back[0].r.top - hh * 0.2 }, ...back.map(over), { x: over(back[back.length - 1]).x - hw * 0.3, y: window.innerHeight + hh * 0.2 }];
    const DUR = STEP * (dpts.length - 1);
    dealer.animate(
      dpts.map((p, k) => ({ transform: `translate(${p.x}px, ${p.y}px) rotate(${k % 2 ? 1 : -1}deg)`, offset: k / (dpts.length - 1) })),
      { duration: DUR, delay: DEAL, easing: "ease-in-out", fill: "both" }
    ).onfinish = () => dealer.remove();
    // Jede neue Karte rutscht unter der Hand hervor, sobald die Hand über ihrem Platz ist
    back.forEach((c, k) => {
      c.el.animate(
        [
          { transform: `translate(${W * 0.15}px, ${-H * 0.25}px) rotate(-6deg) scale(1.04)`, opacity: 0 },
          { transform: `translate(${W * 0.08}px, ${-H * 0.12}px) rotate(-3deg)`, opacity: 1, offset: 0.3 },
          { transform: "none", opacity: 1 },
        ],
        { duration: 260, delay: DEAL + STEP * (k + 1) - 60, easing: "ease-out", fill: "backwards" }
      );
    });
    return DEAL + DUR + 100;
  }

  // „Aufhören“ vor der 2. richtigen Karte: nichts passiert, der Knopf leuchtet nur kurz rot auf.
  function guardStop(root, s) {
    if (s.count >= MIN_CARDS) return;
    const btn = [...root.querySelectorAll(".bf-actions .btn")].find((b) => b.textContent.trim() === STOP);
    if (!btn) return;
    btn.classList.add("fe-stop");
    btn.onclick = () => {
      btn.classList.remove("nope");
      void btn.offsetWidth;
      btn.classList.add("nope");
    };
  }

  // --- Bots ---

  // Wahrscheinlichkeit für einen Tipp, gezählt über alle Karten, die der Bot nicht offen sieht.
  function chance(s, opt) {
    const left = {};
    for (let v = 2; v <= 14; v++) left[v] = 4;
    for (const b of s.board) if (b.open) left[b.card.value]--;
    let all = 0;
    let good = 0;
    for (let v = 2; v <= 14; v++) {
      all += left[v];
      if (opt.ok(v)) good += left[v];
    }
    return all ? good / all : 0;
  }

  function botMove(s) {
    const moves = [];
    s.board.forEach((b, i) => {
      if (!playable(s, i)) return;
      for (const o of optionsOf(s, i)) if (o.can) moves.push({ i, dir: o.dir, p: chance(s, o) });
    });
    moves.sort((a, b) => b.p - a.p);
    const best = moves[0];
    // Ab 2 Karten hört der Bot auf, wenn es eng wird (je mehr Karten, desto vorsichtiger).
    if (s.count >= MIN_CARDS && (!best || best.p < 0.6 + s.count * 0.04)) {
      if (!best) return { type: "stop" };
      return botPick({ type: "stop" }, [{ type: "stop" }, { type: "guess", i: best?.i, dir: best?.dir }], 0.1);
    }
    const pick = botPick(best, moves, 0.25);
    return { type: "guess", i: pick.i, dir: pick.dir };
  }

  registerGame("fenster", {
    label: "Fenster",
    emoji: "🪟",
    description: "Deck das Fenster auf: höher, tiefer, dazwischen. Falsch? Trink alles, was dranhängt.",
    color: "#0891b2",
    fit: true,
    rules: [
      "21 Karten (2 bis Ass, Ass zählt 14) liegen verdeckt als Fenster: oben und unten je 5, links und rechts je 3 dazwischen, in der Mitte ein Kreuz. Die 4 Ecken liegen offen.",
      "Wer dran ist, tippt eine verdeckte Karte neben einer offenen an und sagt höher oder tiefer. Liegen auf beiden Seiten offene Karten (gerade oder über die Ecke), heißt es dazwischen, außerhalb oder gleich. Gleich ist richtig, wenn die Karte denselben Wert hat wie eine der beiden (Zahl oder Bild). Kommt sonst ein gleicher Wert, ist es immer falsch.",
      "Falsch: Du trinkst so viele Schlucke, wie offene Karten mit der neuen Karte verbunden sind (sie selbst und die Ecken mitgezählt). Diese Karten werden umgedreht und neu gemischt. Hängt eine Ecke dran, kommt dort eine neue Karte hin, die gleich wieder offen liegt.",
      "Nach einem Fehler spielst du weiter und fängst wieder bei 0 an. Abgeben darfst du erst, wenn du selbst 2 Karten richtig aufgedeckt hast. Dann verteilst du so viele Schlucke, wie du Karten richtig hast.",
      "Hast du die Mitte aufgedeckt und hörst auf, verteilst du zusätzlich einen Shot. Hängt die Mitte an deiner falschen Karte, trinkst du den Shot selbst.",
      "Wer die letzte Karte aufdeckt, macht das Fenster zu und verteilt seine Karten.",
    ],

    setup(players) {
      const s = { players, deck: newDeck(), board: CELLS.map(() => ({ open: false, card: null })), cur: 0, count: 0, mid: false, sel: null, last: null, wrong: null, stage: "pick", tally: {} };
      for (const p of players) s.tally[p] = { sips: 0, shots: 0 };
      for (const i of CORNERS) deal(s, i);
      s.cur = Math.floor(Math.random() * players.length);
      s.start = s.cur;
      s.round = 1;
      return s;
    },

    view(s, me) {
      switch (s.stage) {
        case "pick": return pickView(s, me);
        case "guess": return guessView(s, me);
        case "wrong": return wrongView(s, me);
        default: return endView(s);
      }
    },

    afterRender(root, s) {
      const stop = [...root.querySelectorAll(".bf-actions .btn")].find((b) => b.textContent.trim() === STOP);
      if (stop) stop.classList.add("fe-stop");
      guardStop(root, s);
      return sweepAnim(root, s);
    },

    bot(s, name, acts) {
      return s.stage === "pick" || s.stage === "guess" ? botMove(s) : acts[0];
    },

    act(s, a) {
      const p = s.players[s.cur];
      if ((s.stage === "pick" || s.stage === "guess") && a.type === "pick" && playable(s, a.i)) {
        s.sel = a.i;
        s.stage = "guess";
      }
      else if ((s.stage === "pick" || s.stage === "guess") && a.type === "guess") {
        const i = a.i ?? s.sel;
        if (i != null) guess(s, i, a.dir);
      }
      else if ((s.stage === "pick" || s.stage === "guess") && a.type === "stop" && s.count >= MIN_CARDS) {
        give(s, p);
        nextTurn(s);
      }
      else if (s.stage === "wrong" && a.type === "next") {
        flipBack(s);
      }
    },
  });
})();
