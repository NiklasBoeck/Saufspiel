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
  // Der Dealer, von hinten/oben gesehen: Hinterkopf und rechte Schulter schauen unten ins Bild,
  // der Arm hat Ober- und Unterarm mit Ellbogengelenk (zwei Knochen, Winkel per Kosinussatz).
  const HAND_DEFS = `<linearGradient id="fhs" x1="0" x2="1" y1="0" y2="0"> <stop offset="0" stop-color="#c98d64"/><stop offset="0.35" stop-color="#f0c39c"/><stop offset="0.7" stop-color="#e9b48a"/><stop offset="1" stop-color="#b97a52"/> </linearGradient> <linearGradient id="fhf" x1="0" x2="1"> <stop offset="0" stop-color="#cf946a"/><stop offset="0.45" stop-color="#f3caa4"/><stop offset="1" stop-color="#c4875e"/> </linearGradient> <radialGradient id="fhb" cx="0.5" cy="0.35" r="0.6"> <stop offset="0" stop-color="#fff" stop-opacity="0.28"/><stop offset="1" stop-color="#fff" stop-opacity="0"/> </radialGradient> <linearGradient id="fhc" x1="0" x2="1"> <stop offset="0" stop-color="#14213d"/><stop offset="0.5" stop-color="#26385f"/><stop offset="1" stop-color="#101a30"/> </linearGradient> <radialGradient id="fdh" cx="0.45" cy="0.4" r="0.65"><stop offset="0" stop-color="#6b4429"/><stop offset="1" stop-color="#24150b"/></radialGradient> <linearGradient id="fdj" x1="0" x2="1"><stop offset="0" stop-color="#0c1426"/><stop offset="0.5" stop-color="#22345a"/><stop offset="1" stop-color="#0c1426"/></linearGradient>`;
  const HAND_BODY = `<path d="M72 214 C76 260 70 290 64 306 L144 306 C138 290 134 260 146 210 Z" fill="url(#fhs)"/> <path d="M58 300 C84 293 126 293 152 300 L153 311 C126 304 84 304 57 311 Z" fill="#f4f1ea"/> <g class="fh-thumb"> <path d="M66 178 C48 170 30 150 22 128 C17 114 28 104 40 112 C52 122 62 138 76 150 Z" fill="url(#fhf)"/> <path d="M24 122 C24 113 33 110 38 116 C41 121 37 127 31 128 C27 128 24 126 24 122 Z" fill="#f6d9c4" opacity="0.9"/> </g> <g class="fh-fingers"> <g class="fh-f1" transform="rotate(-5 72 126)"><rect x="60" y="34" width="25" height="92" rx="12.5" fill="url(#fhf)"/><rect x="64.5" y="38" width="16" height="18" rx="7" fill="#f7dccb"/><path d="M63 80 q9 4 19 0" stroke="#a8724d" stroke-width="1.6" fill="none" opacity="0.55"/></g> <g class="fh-f2" transform="rotate(-1 100 124)"><rect x="87" y="18" width="26" height="106" rx="13" fill="url(#fhf)"/><rect x="92" y="22" width="16" height="19" rx="7" fill="#f7dccb"/><path d="M90 70 q10 4 20 0" stroke="#a8724d" stroke-width="1.6" fill="none" opacity="0.55"/></g> <g class="fh-f3" transform="rotate(3 127 124)"><rect x="115" y="26" width="24" height="98" rx="12" fill="url(#fhf)"/><rect x="119" y="30" width="16" height="18" rx="7" fill="#f7dccb"/><path d="M118 76 q9 4 18 0" stroke="#a8724d" stroke-width="1.6" fill="none" opacity="0.55"/></g> <g class="fh-f4" transform="rotate(8 151 130)"><rect x="141" y="50" width="21" height="80" rx="10.5" fill="url(#fhf)"/><rect x="144.5" y="53" width="14" height="15" rx="6" fill="#f7dccb"/><path d="M144 92 q8 3 15 0" stroke="#a8724d" stroke-width="1.6" fill="none" opacity="0.55"/></g> </g> <path d="M60 120 C60 106 74 102 100 102 C130 102 156 106 161 124 C164 150 160 178 150 205 C144 222 132 234 106 236 C84 236 72 226 66 208 C60 188 58 150 60 120 Z" fill="url(#fhs)"/> <path d="M60 120 C60 106 74 102 100 102 C130 102 156 106 161 124 C164 150 160 178 150 205 C144 222 132 234 106 236 C84 236 72 226 66 208 C60 188 58 150 60 120 Z" fill="url(#fhb)"/> <g fill="#fff" opacity="0.18"><ellipse cx="74" cy="121" rx="6" ry="3.5"/><ellipse cx="100" cy="117" rx="6" ry="3.5"/><ellipse cx="126" cy="120" rx="6" ry="3.5"/><ellipse cx="150" cy="128" rx="5" ry="3"/></g> <g stroke="#a8724d" stroke-width="1.2" fill="none" opacity="0.18"><path d="M74 132 C80 170 88 200 96 226"/><path d="M100 128 C102 170 104 200 106 228"/><path d="M127 131 C124 170 120 200 116 226"/></g>`;
  // Rücken mit Sakko, Kragen, Nacken und Hinterkopf; Nacken bei (0,0), Einheiten wie die Hand
  const DEALER_BODY = `<path d="M-320 80 C-312 -18 -236 -62 -160 -66 L160 -66 C236 -62 312 -18 320 80 L340 2400 L-340 2400 Z" fill="url(#fdj)"/> <path d="M0 0 L0 2400" stroke="#081020" stroke-width="6" opacity="0.6"/>`;
  // Rücken, Kopf, Nacken und Kragen kommen zuletzt: der Arm liegt vor der Brust und geht immer darunter durch
  const DEALER_HEAD = `<path d="M-74 -46 C-40 -14 40 -14 74 -46 L64 -78 C30 -54 -30 -54 -64 -78 Z" fill="#f4f1ea"/> <ellipse cx="0" cy="-84" rx="56" ry="34" fill="#d9a179"/> <ellipse cx="-90" cy="-150" rx="17" ry="27" fill="#e2a982"/> <ellipse cx="90" cy="-150" rx="17" ry="27" fill="#e2a982"/> <ellipse cx="0" cy="-158" rx="92" ry="106" fill="url(#fdh)"/> <ellipse cx="-24" cy="-190" rx="40" ry="30" fill="#fff" opacity="0.08"/>`;
  const SVG_NS = "http://www.w3.org/2000/svg";

  const sweptSeen = new Set();
  function sweepAnim(root, s) {
    const sw = s.swept;
    if (!sw || sweptSeen.has(sw.id)) return 0;
    sweptSeen.add(sw.id);
    const cells = sw.cards
      .map((c) => ({ ...c, el: root.querySelector(`.fe-card[data-i="${c.i}"]`) }))
      .filter((c) => c.el)
      .map((c) => ({ ...c, r: c.el.getBoundingClientRect() }))
      .sort((a, b) => a.r.left - b.r.left || a.r.top - b.r.top);
    if (!cells.length) return 0;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const H = cells[0].r.height;
    const W = cells[0].r.width;
    const n = cells.length;
    const mid = (c) => ({ x: c.r.left + W / 2, y: c.r.top + H / 2 });

    // Maße in Hand-Einheiten (Hand von Handgelenk bis Fingerspitze ≈ 290)
    const k = Math.min(W, H) * 0.0095;
    const L1 = 430 * k; // Oberarm
    const L2 = 380 * k; // Unterarm
    const PALM = 136 * k; // Handgelenk bis Handflächenmitte
    // Die Schulter ist über dem Tisch, die Hand liegt auf ihm: von oben wirkt der Arm dadurch verkürzt
    const Z = (L1 + L2) * 0.42;
    const REACH = Math.sqrt((L1 + L2) ** 2 * 0.93 - Z * Z) + PALM;
    const BODY = k * 0.8;

    // Zeitplan: reinkommen, von links nach rechts abräumen, Stapel holen, Karten einzeln werfen, wieder raus
    const IN = 300;
    const START = 450;
    const SWEEP = 500 + n * 220;
    const DEAL = START + SWEEP + 150;
    const STEP = 230;
    const back = [...cells].reverse();
    const grid = (root.querySelector(".fe-grid") || root).getBoundingClientRect();
    const D = { x: grid.left + grid.width * 0.6, y: grid.top + grid.height * 0.62 };
    const THROW = (j) => DEAL + 260 + STEP * j;
    // Wurf: Hand holt zum Körper hin aus und schnippt dann Richtung Ziel
    const toward = (c, f) => {
      const m = mid(c);
      const l = Math.hypot(m.x - D.x, m.y - D.y) || 1;
      return { x: D.x + ((m.x - D.x) / l) * W * f, y: D.y + ((m.y - D.y) / l) * W * f };
    };
    const HOME = THROW(n - 1) + 180;
    const END = HOME + 450;
    const last = cells[n - 1];
    const keys = [
      { t: START, x: cells[0].r.left - W * 0.3, y: mid(cells[0]).y },
      ...cells.map((c, j) => ({ t: START + (SWEEP * (j + 1)) / (n + 1), x: c.r.left + W * 0.25, y: mid(c).y })),
      { t: START + SWEEP, x: Math.min(last.r.right + W * 0.6, vw - W * 0.3), y: mid(last).y - H * 0.3, deal: false },
      { t: DEAL + 150, ...D, deal: true },
      ...back.flatMap((c, j) => [
        { t: THROW(j) - 90, ...toward(c, -0.3), deal: true },
        { t: THROW(j), ...toward(c, 0.5), deal: true },
      ]),
      { t: HOME, ...D, deal: true },
    ];
    const ease = (u) => u * u * (3 - 2 * u);
    // Weiche Kurve durch alle Punkte (Catmull-Rom), damit die Hand fließt statt an jeder Karte zu stoppen
    const cr = (a, b, c, d, u) => 0.5 * (2 * b + (c - a) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (3 * b - a - 3 * c + d) * u * u * u);
    const curve = (list, t, f) => {
      if (t <= list[0].t) return f(list[0]);
      for (let j = 1; j < list.length; j++) {
        if (t <= list[j].t) {
          const u = (t - list[j - 1].t) / (list[j].t - list[j - 1].t || 1);
          const at = (i) => f(list[clamp(i, 0, list.length - 1)]);
          return cr(at(j - 2), at(j - 1), at(j), at(j + 1), u);
        }
      }
      return f(list[list.length - 1]);
    };
    const palmAt = (t) => ({ x: curve(keys, t, (q) => q.x), y: curve(keys, t, (q) => q.y) });
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const lerp = (a, b, u) => ({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u });
    const rot2 = (v, th) => ({ x: v.x * Math.cos(th) - v.y * Math.sin(th), y: v.x * Math.sin(th) + v.y * Math.cos(th) });

    // Der Dealer läuft rund um den Tisch (abgerundetes Rechteck knapp außerhalb des Bildschirms).
    // Jeder Punkt hat die Lage des Nackens und die Drehung, mit der er zum Tisch schaut.
    const edge = 20 * BODY;
    const Rc = Math.min(vw, vh) * 0.22;
    const ring = [];
    const add = (x, y, phi) => ring.push({ x, y, th: phi - Math.PI / 2 });
    const side = (x0, y0, x1, y1, phi) => {
      const steps = Math.max(4, Math.round(Math.hypot(x1 - x0, y1 - y0) / (W * 0.4)));
      for (let i = 0; i < steps; i++) add(x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps, phi);
    };
    const corner = (cx, cy, from, to) => {
      for (let i = 0; i < 10; i++) {
        const phi = from + ((to - from) * i) / 10;
        add(cx + Rc * Math.cos(phi), cy + Rc * Math.sin(phi), phi);
      }
    };
    const L0 = -edge;
    const R0 = vw + edge;
    const T0 = -edge;
    const B0 = vh + edge;
    side(L0, T0 + Rc, L0, B0 - Rc, Math.PI);
    corner(L0 + Rc, B0 - Rc, Math.PI, Math.PI / 2);
    side(L0 + Rc, B0, R0 - Rc, B0, Math.PI / 2);
    corner(R0 - Rc, B0 - Rc, Math.PI / 2, 0);
    side(R0, B0 - Rc, R0, T0 + Rc, 0);
    corner(R0 - Rc, T0 + Rc, 0, -Math.PI / 2);
    side(R0 - Rc, T0, L0 + Rc, T0, -Math.PI / 2);
    corner(L0 + Rc, T0 + Rc, -Math.PI / 2, -Math.PI);
    const RL = ring.length;
    const ringDist = (i, j) => Math.min(Math.abs(i - j), RL - Math.abs(i - j));
    const shoulderOf = (b) => {
      const o = rot2({ x: 260 * BODY, y: -30 * BODY }, b.th);
      return { x: b.x + o.x, y: b.y + o.y };
    };
    // Bester Standplatz: Ziel bequem vor der rechten Schulter, nicht unnötig weit vom letzten Platz weg
    const COMFY = REACH * 0.4;
    const stationFor = (T, prev) => {
      let best = prev;
      let cost = Infinity;
      ring.forEach((b, i) => {
        const S = shoulderOf(b);
        const f = rot2({ x: 0, y: -1 }, b.th);
        const dx = T.x - S.x;
        const dy = T.y - S.y;
        const dist = Math.hypot(dx, dy);
        const ahead = dx * f.x + dy * f.y;
        // nicht zu dicht ran und nie mit dem Kopf über dem Ziel
        const hd = rot2({ x: 0, y: -158 * BODY }, b.th);
        const head = Math.hypot(T.x - b.x - hd.x, T.y - b.y - hd.y);
        const c =
          Math.abs(dist - COMFY) +
          (ahead < dist * 0.2 ? 1e4 : 0) +
          (dist < COMFY * 0.7 ? 5e3 : 0) +
          (head < 170 * BODY ? 5e3 : 0) + (prev == null ? 0 : ringDist(i, prev) * W * 0.05);
        if (c < cost) {
          cost = c;
          best = i;
        }
      });
      return best;
    };
    let prevSt = null;
    const dealSt = stationFor(D, null);
    const stations = keys.map((q) => (prevSt = q.deal ? dealSt : stationFor(q, prevSt)));
    // Um die Ecke ist kein Sprung: Standplätze werden fortlaufend gezählt (Ring abgewickelt)
    stations.forEach((v, i) => {
      if (i) stations[i] = v + RL * Math.round((stations[i - 1] - v) / RL);
    });
    // Der Körper läuft etwas voraus, damit er schon steht, wenn die Hand ankommt
    const bodyAt = (t) => {
      const list = keys.map((q, i) => ({ t: q.t - 160, i: stations[i] }));
      const f = curve(list, t, (q) => q.i);
      const i0 = Math.floor(f);
      const u = f - i0;
      const b0 = ring[((i0 % RL) + RL) % RL];
      const b1 = ring[(((i0 + 1) % RL) + RL) % RL];
      let dth = b1.th - b0.th;
      dth -= Math.PI * 2 * Math.round(dth / (Math.PI * 2));
      return { x: b0.x + (b1.x - b0.x) * u, y: b0.y + (b1.y - b0.y) * u, th: b0.th + dth * u };
    };
    // Rein und raus geht die Hand nur am Arm entlang Richtung Schulter, nie quer über den Kopf
    const pull = (Q, S) => lerp(Q, S, 0.3);
    // Handgelenk beim Werfen: erst zurückgeklappt, dann schnippen
    const wrist = (t) => {
      for (let j = 0; j < n; j++) {
        const d = t - THROW(j);
        if (d > -160 && d <= -70) return -22 * ((d + 160) / 90);
        if (d > -70 && d <= 0) return -22 + 42 * ((d + 70) / 70);
        if (d > 0 && d < 140) return 20 * (1 - d / 140);
      }
      return 0;
    };

    const rig = document.createElementNS(SVG_NS, "svg");
    rig.setAttribute("class", "fe-rig");
    rig.setAttribute("viewBox", `0 0 ${vw} ${vh}`);
    const grad = (id) =>
      `<linearGradient id="${id}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#0a1222"/><stop offset="0.28" stop-color="#2c4371"/><stop offset="0.55" stop-color="#1c2d50"/><stop offset="1" stop-color="#080f1d"/></linearGradient>`;
    // Der Stapel liegt unter der Handfläche, Karten längs zu den Fingern
    const cw = Math.min(W, H) / k;
    const ch = Math.max(W, H) / k;
    const deck = [8, 4, 0]
      .map((o) => `<rect x="${106 - cw / 2 + o}" y="${165 - ch / 2 + o}" width="${cw}" height="${ch}" rx="${cw * 0.1}" fill="#0f5a3a" stroke="#f4f1ea" stroke-width="${cw * 0.05}"/>`)
      .join("");
    rig.innerHTML = `<defs>${HAND_DEFS}${grad("fdu")}${grad("fdf")}</defs>
      <path class="fd-shadow" fill="rgb(0 0 0 / 0.22)"/>
      <path class="fd-upper" fill="url(#fdu)"/>
      <path class="fd-fore" fill="url(#fdf)"/>
      <path class="fd-folds" fill="none" stroke="#060c18" stroke-width="${5 * k}" stroke-linecap="round" opacity="0.55"/>
      <g class="fd-hand"><g class="fd-deck">${deck}</g>${HAND_BODY}</g>
      <g class="fd-body">${DEALER_BODY}</g>
      <g class="fd-head">${DEALER_HEAD}</g>`;
    document.body.appendChild(rig);
    const $ = (c) => rig.querySelector(c);
    const pt = (p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
    // Ärmel mit Muskelform: halbe Breiten (Hand-Einheiten) entlang des Glieds, getrennt für beide Seiten.
    // Oberarm: Schulter, schmaler unterm Deltamuskel, Bizeps-/Trizepswölbung, schmaler Ellbogen.
    // Unterarm: kräftig direkt unterm Ellbogen, dann bis zum Handgelenk schmal zulaufend.
    const UPPER = { s: [0, 0.22, 0.52, 0.78, 1], a: [68, 60, 69, 58, 47], b: [68, 58, 61, 54, 47] };
    const FORE = { s: [0, 0.22, 0.5, 0.8, 1], a: [49, 58, 52, 44, 42], b: [49, 54, 47, 42, 42] };
    const half = (prof, side, x) => {
      const w = prof[side];
      let j = 1;
      while (j < prof.s.length - 1 && x > prof.s[j]) j++;
      const u = (x - prof.s[j - 1]) / (prof.s[j] - prof.s[j - 1]);
      return cr(w[Math.max(0, j - 2)], w[j - 1], w[j], w[Math.min(w.length - 1, j + 1)], u);
    };
    function limb(a, b, prof, flip, capB, gradId) {
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const dx = (b.x - a.x) / len;
      const dy = (b.y - a.y) / len;
      const nx = -dy * flip;
      const ny = dx * flip;
      const at = (x, side) => {
        const h = half(prof, side < 0 ? "b" : "a", x) * k * side;
        return { x: a.x + dx * len * x + nx * h, y: a.y + dy * len * x + ny * h };
      };
      const g = $(`#${gradId}`);
      const g1 = at(0.5, -1);
      const g2 = at(0.5, 1);
      g.setAttribute("x1", g1.x);
      g.setAttribute("y1", g1.y);
      g.setAttribute("x2", g2.x);
      g.setAttribute("y2", g2.y);
      const N = 12;
      const sideA = [];
      const sideB = [];
      for (let i = 0; i <= N; i++) {
        sideA.push(pt(at(i / N, 1)));
        sideB.push(pt(at(1 - i / N, -1)));
      }
      const ra = prof.a[0] * k;
      const rb = prof.a[prof.a.length - 1] * k;
      const sw = flip > 0 ? 0 : 1;
      const endB = capB ? `A ${rb} ${rb} 0 0 ${sw} ${sideB[0]}` : `L ${sideB[0]}`;
      return `M ${sideA[0]} L ${sideA.join(" L ")} ${endB} L ${sideB.join(" L ")} A ${ra} ${ra} 0 0 ${sw} ${sideA[0]} Z`;
    }

    function pose(t) {
      let body;
      let Q;
      let drop = 0;
      if (t < START) {
        body = bodyAt(START);
        Q = lerp(pull(keys[0], shoulderOf(body)), keys[0], ease(clamp(t / START, 0, 1)));
        drop = (1 - ease(clamp(t / IN, 0, 1))) * REACH * 0.9;
      } else if (t > HOME) {
        const u = clamp((t - HOME) / (END - HOME), 0, 1);
        body = bodyAt(HOME);
        const end = keys[keys.length - 1];
        Q = lerp(end, pull(end, shoulderOf(body)), ease(Math.min(1, u * 1.7)));
        drop = ease(u) * REACH * 0.9;
      } else {
        body = bodyAt(t);
        Q = palmAt(t);
      }
      const backDir = rot2({ x: 0, y: 1 }, body.th);
      const N = { x: body.x + backDir.x * drop, y: body.y + backDir.y * drop };
      const S = shoulderOf({ ...body, ...N });
      Q = { x: Q.x + backDir.x * drop, y: Q.y + backDir.y * drop };
      const dq = Math.hypot(Q.x - S.x, Q.y - S.y) || 1;
      const P = { x: Q.x - ((Q.x - S.x) / dq) * PALM, y: Q.y - ((Q.y - S.y) / dq) * PALM };
      // Ellbogen in 3D: Schulter in Höhe Z, Hand auf dem Tisch; das Gelenk hängt nach unten, etwas nach außen
      // und beim Heranziehen nach hinten. Gezeichnet wird die Draufsicht, so wird der Arm verkürzt statt abzuknicken.
      const ax = P.x - S.x;
      const ay = P.y - S.y;
      const d = clamp(Math.hypot(ax, ay, Z), Math.abs(L1 - L2) + 1, L1 + L2 - 0.5);
      const u = [ax / d, ay / d, -Z / d];
      const along = (L1 * L1 - L2 * L2 + d * d) / (2 * d);
      const rad = Math.sqrt(Math.max(0, L1 * L1 - along * along));
      const flat = Math.hypot(ax, ay) || 1;
      const pole = [(-ay / flat) * 0.6 + backDir.x * 0.5, (ax / flat) * 0.6 + backDir.y * 0.5, -1];
      const pu = pole[0] * u[0] + pole[1] * u[1] + pole[2] * u[2];
      const v = pole.map((x, i) => x - pu * u[i]);
      const vl = Math.hypot(...v) || 1;
      const E = { x: S.x + along * u[0] + (rad * v[0]) / vl, y: S.y + along * u[1] + (rad * v[1]) / vl };
      // Hand zeigt in Richtung Unterarm; ist der von oben kaum zu sehen, in Richtung Schulter→Hand
      const fl = Math.hypot(P.x - E.x, P.y - E.y) || 1;
      const fx = (P.x - E.x) / fl;
      const fy = (P.y - E.y) / fl;
      const w = clamp(fl / (L2 * 0.6), 0, 1);
      const rot = (Math.atan2(fy * w + (ay / flat) * (1 - w), fx * w + (ax / flat) * (1 - w)) * 180) / Math.PI + 90 + wrist(t);
      return { N, th: body.th, S, E, P, Q, fl, fx, fy, rot };
    }

    function draw(t) {
      const { N, th, S, E, P, fl, fx, fy, rot } = pose(t);
      const bodyT = `translate(${N.x} ${N.y}) rotate(${(th * 180) / Math.PI}) scale(${BODY})`;
      $(".fd-body").setAttribute("transform", bodyT);
      $(".fd-head").setAttribute("transform", bodyT);
      // Bizeps und Unterarmmuskel liegen auf der Innenseite des Arms (zur Körpermitte)
      const inner = (S.x - N.x) * (E.y - S.y) - (S.y - N.y) * (E.x - S.x) > 0 ? 1 : -1;
      const up = limb(S, E, UPPER, inner, true, "fdu");
      const fore = limb(E, P, FORE, inner, false, "fdf");
      $(".fd-upper").setAttribute("d", up);
      $(".fd-fore").setAttribute("d", fore);
      $(".fd-shadow").setAttribute("d", up + fore);
      $(".fd-shadow").setAttribute("transform", `translate(${-8 * k} ${24 * k})`);
      // Stofffalten in der Armbeuge
      let folds = "";
      for (const [s0, w0] of [[0.1, 0.42], [0.2, 0.36], [0.62, 0.3]]) {
        const c = { x: E.x + fx * fl * s0, y: E.y + fy * fl * s0 };
        const o = 52 * k * w0 * 2;
        folds += `M ${pt({ x: c.x - fy * o, y: c.y + fx * o })} Q ${pt({ x: c.x + fx * 14 * k, y: c.y + fy * 14 * k })} ${pt({ x: c.x + fy * o * 0.4, y: c.y - fx * o * 0.4 })} `;
      }
      $(".fd-folds").setAttribute("d", folds);
      // Stapel in der Hand: wird mit jeder geworfenen Karte kleiner
      const thrown = back.filter((c, j) => t >= THROW(j)).length;
      const left = t > START + SWEEP + 80 ? n - thrown : 0;
      rig.querySelectorAll(".fd-deck rect").forEach((r, i, all) => {
        r.style.display = all.length - i <= left ? "" : "none";
      });
      $(".fd-hand").setAttribute("transform", `translate(${P.x} ${P.y}) rotate(${rot}) scale(${k}) translate(-106 -306)`);
    }
    const t0 = performance.now();
    const loop = (now) => {
      if (rig._frozen || !rig.isConnected) return;
      const t = now - t0;
      draw(t);
      if (t < END) requestAnimationFrame(loop);
      else rig.remove();
    };
    rig._draw = draw; // für Screenshot-Tests: Zeitpunkt direkt zeichnen
    rig._keys = keys;
    rig._end = END;
    draw(0);
    requestAnimationFrame(loop);

    // Die alten Karten liegen noch kurz da und werden weggeschoben, sobald die Hand sie erreicht
    cells.forEach((c, k2) => {
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
      const hit = keys[k2 + 1].t - 60;
      const off = vw - c.r.left + 40;
      ghost.animate(
        [
          { transform: "none", opacity: 1 },
          { transform: `translate(${W * 0.3}px, -4px) rotate(6deg)`, opacity: 1, offset: 0.25 },
          { transform: `translate(${off}px, ${-H * 0.4}px) rotate(${20 + k2 * 4}deg)`, opacity: 0.9 },
        ],
        { duration: Math.max(380, START + SWEEP - hit), delay: hit, easing: "ease-in", fill: "both" }
      ).onfinish = () => ghost.remove();
    });

    // Jede neue Karte verlässt die Hand genau beim Schnippen, dreht sich einmal und gleitet über den Filz aus
    back.forEach((c, j) => {
      const at = pose(THROW(j));
      const m = mid(c);
      const dx = at.Q.x - m.x;
      const dy = at.Q.y - m.y;
      let a0 = (at.rot + (W > H ? 90 : 0)) % 180;
      if (a0 > 90) a0 -= 180;
      if (a0 < -90) a0 += 180;
      const spin = a0 + (dx > 0 ? -360 : 360);
      c.el.animate(
        [
          { transform: `translate(${dx}px, ${dy}px) rotate(${spin}deg) scale(0.96)`, opacity: 1 },
          { transform: `translate(${dx * 0.22}px, ${dy * 0.22}px) rotate(${spin * 0.12}deg) scale(1.03)`, offset: 0.45 },
          { transform: `translate(${dx * 0.04}px, ${dy * 0.04}px) rotate(${spin * 0.015}deg)`, offset: 0.8 },
          { transform: "none", opacity: 1 },
        ],
        { duration: 600, delay: THROW(j), easing: "cubic-bezier(0.15, 0.75, 0.3, 1)", fill: "backwards" }
      );
      // bis zum Wurf ist der Platz leer
      c.el.animate([{ opacity: 0 }, { opacity: 0 }], { duration: THROW(j), fill: "none" });
    });
    return END;
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
