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
  const HAND_BODY = `<path d="M72 214 C76 260 70 290 64 306 L144 306 C138 290 134 260 146 210 Z" fill="url(#fhs)"/> <path d="M50 300 C80 292 130 292 162 300 L163 312 C130 304 82 304 49 312 Z" fill="#f4f1ea"/> <g class="fh-thumb"> <path d="M66 178 C48 170 30 150 22 128 C17 114 28 104 40 112 C52 122 62 138 76 150 Z" fill="url(#fhf)"/> <path d="M24 122 C24 113 33 110 38 116 C41 121 37 127 31 128 C27 128 24 126 24 122 Z" fill="#f6d9c4" opacity="0.9"/> </g> <g class="fh-fingers"> <g class="fh-f1" transform="rotate(-5 72 126)"><rect x="60" y="34" width="25" height="92" rx="12.5" fill="url(#fhf)"/><rect x="64.5" y="38" width="16" height="18" rx="7" fill="#f7dccb"/><path d="M63 80 q9 4 19 0" stroke="#a8724d" stroke-width="1.6" fill="none" opacity="0.55"/></g> <g class="fh-f2" transform="rotate(-1 100 124)"><rect x="87" y="18" width="26" height="106" rx="13" fill="url(#fhf)"/><rect x="92" y="22" width="16" height="19" rx="7" fill="#f7dccb"/><path d="M90 70 q10 4 20 0" stroke="#a8724d" stroke-width="1.6" fill="none" opacity="0.55"/></g> <g class="fh-f3" transform="rotate(3 127 124)"><rect x="115" y="26" width="24" height="98" rx="12" fill="url(#fhf)"/><rect x="119" y="30" width="16" height="18" rx="7" fill="#f7dccb"/><path d="M118 76 q9 4 18 0" stroke="#a8724d" stroke-width="1.6" fill="none" opacity="0.55"/></g> <g class="fh-f4" transform="rotate(8 151 130)"><rect x="141" y="50" width="21" height="80" rx="10.5" fill="url(#fhf)"/><rect x="144.5" y="53" width="14" height="15" rx="6" fill="#f7dccb"/><path d="M144 92 q8 3 15 0" stroke="#a8724d" stroke-width="1.6" fill="none" opacity="0.55"/></g> </g> <path d="M60 120 C60 106 74 102 100 102 C130 102 156 106 161 124 C164 150 160 178 150 205 C144 222 132 234 106 236 C84 236 72 226 66 208 C60 188 58 150 60 120 Z" fill="url(#fhs)"/> <path d="M60 120 C60 106 74 102 100 102 C130 102 156 106 161 124 C164 150 160 178 150 205 C144 222 132 234 106 236 C84 236 72 226 66 208 C60 188 58 150 60 120 Z" fill="url(#fhb)"/> <g fill="#fff" opacity="0.18"><ellipse cx="74" cy="121" rx="6" ry="3.5"/><ellipse cx="100" cy="117" rx="6" ry="3.5"/><ellipse cx="126" cy="120" rx="6" ry="3.5"/><ellipse cx="150" cy="128" rx="5" ry="3"/></g> <g stroke="#a8724d" stroke-width="1.2" fill="none" opacity="0.18"><path d="M74 132 C80 170 88 200 96 226"/><path d="M100 128 C102 170 104 200 106 228"/><path d="M127 131 C124 170 120 200 116 226"/></g>`;
  // Rücken mit Sakko, Kragen, Nacken und Hinterkopf; Nacken bei (0,0), Einheiten wie die Hand
  const DEALER_BODY = `<path d="M-430 90 C-420 -20 -300 -64 -200 -66 L200 -66 C300 -64 420 -20 430 90 L460 2400 L-460 2400 Z" fill="url(#fdj)"/> <path d="M0 0 L0 2400" stroke="#081020" stroke-width="6" opacity="0.6"/> <path d="M-74 -46 C-40 -14 40 -14 74 -46 L64 -78 C30 -54 -30 -54 -64 -78 Z" fill="#f4f1ea"/> <ellipse cx="0" cy="-84" rx="56" ry="34" fill="#d9a179"/> <ellipse cx="-90" cy="-150" rx="17" ry="27" fill="#e2a982"/> <ellipse cx="90" cy="-150" rx="17" ry="27" fill="#e2a982"/> <ellipse cx="0" cy="-158" rx="92" ry="106" fill="url(#fdh)"/> <ellipse cx="-24" cy="-190" rx="40" ry="30" fill="#fff" opacity="0.08"/>`;
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
    const L1 = 370 * k; // Oberarm
    const L2 = 340 * k; // Unterarm
    const PALM = 136 * k; // Handgelenk bis Handflächenmitte
    const REACH = L1 + L2 + PALM;

    // Zeitplan: reinkommen, von links nach rechts abräumen, von rechts nach links neu legen, wieder raus
    const IN = 300;
    const START = 450;
    const SWEEP = 400 + n * 160;
    const DEAL = START + SWEEP + 100;
    const STEP = 200;
    const back = [...cells].reverse();
    const HOME = DEAL + STEP * (n + 1) + 150;
    const END = HOME + 300;
    const rest = { x: vw * 0.62, y: vh + REACH * 0.15 };
    const keys = [
      { t: 0, ...rest },
      { t: START, x: cells[0].r.left - W * 0.3, y: mid(cells[0]).y },
      ...cells.map((c, j) => ({ t: START + (SWEEP * (j + 1)) / (n + 1), x: c.r.left + W * 0.25, y: mid(c).y })),
      { t: START + SWEEP, x: vw + W * 0.4, y: mid(cells[n - 1]).y - H * 0.3 },
      ...back.map((c, j) => ({ t: DEAL + STEP * (j + 1), x: mid(c).x, y: c.r.top + H * 0.35 })),
      { t: HOME, ...rest },
    ];
    const ease = (u) => (u + u * u * (3 - 2 * u)) / 2;
    const palmAt = (t) => {
      if (t <= keys[0].t) return keys[0];
      for (let j = 1; j < keys.length; j++) {
        if (t <= keys[j].t) {
          const a = keys[j - 1];
          const b = keys[j];
          const u = ease((t - a.t) / (b.t - a.t));
          return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
        }
      }
      return keys[keys.length - 1];
    };
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

    const rig = document.createElementNS(SVG_NS, "svg");
    rig.setAttribute("class", "fe-rig");
    rig.setAttribute("viewBox", `0 0 ${vw} ${vh}`);
    rig.innerHTML = `<defs>${HAND_DEFS}</defs>
      <g class="fd-body">${DEALER_BODY}</g>
      <g fill="none" stroke-linecap="round">
        <line class="fd-shadow" stroke="rgb(0 0 0 / 0.28)" stroke-width="${130 * k}"/>
        <line class="fd-upper" stroke="#16233f" stroke-width="${140 * k}"/>
        <line class="fd-upper2" stroke="#23365c" stroke-width="${60 * k}"/>
        <circle class="fd-shoulder" r="${84 * k}" fill="#1b2a4a" stroke="none"/>
        <line class="fd-fore" stroke="#182644" stroke-width="${118 * k}" stroke-linecap="butt"/>
        <line class="fd-fore2" stroke="#26395f" stroke-width="${50 * k}" stroke-linecap="butt"/>
        <circle class="fd-elbow" r="${62 * k}" fill="#1a2846" stroke="none"/>
      </g>
      <g class="fd-hand">${HAND_BODY}</g>`;
    document.body.appendChild(rig);
    const $ = (c) => rig.querySelector(c);
    const line = (el, a, b) => {
      el.setAttribute("x1", a.x);
      el.setAttribute("y1", a.y);
      el.setAttribute("x2", b.x);
      el.setAttribute("y2", b.y);
    };

    function draw(t) {
      const Q = palmAt(t);
      // Schulter folgt der Hand am unteren Rand; reicht der Arm nicht, kommt der Dealer etwas näher
      let S = { x: clamp(Q.x + REACH * 0.4, vw * 0.3, vw * 0.97), y: vh - REACH * 0.04 };
      const far = Math.hypot(Q.x - S.x, Q.y - S.y);
      const max = REACH * 0.92;
      if (far > max) S = { x: Q.x + ((S.x - Q.x) * max) / far, y: Math.max(vh * 0.66, Q.y + ((S.y - Q.y) * max) / far) };
      const inOut = t < IN ? t / IN : t > HOME ? Math.max(0, 1 - (t - HOME) / (END - HOME)) : 1;
      S.y += (1 - ease(clamp(inOut, 0, 1))) * REACH * 0.9;
      const dq = Math.hypot(Q.x - S.x, Q.y - S.y) || 1;
      const P = { x: Q.x - ((Q.x - S.x) / dq) * PALM, y: Q.y - ((Q.y - S.y) / dq) * PALM };
      // Ellbogen: Kosinussatz, Gelenk zeigt nach außen (vom Kopf weg)
      const d = clamp(Math.hypot(P.x - S.x, P.y - S.y), Math.abs(L1 - L2) + 1, L1 + L2 - 0.5);
      const base = Math.atan2(P.y - S.y, P.x - S.x);
      const bend = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
      const E = { x: S.x + L1 * Math.cos(base + bend), y: S.y + L1 * Math.sin(base + bend) };
      const N = { x: S.x - 200 * k, y: S.y + 20 * k };
      $(".fd-body").setAttribute("transform", `translate(${N.x} ${N.y}) scale(${k * 0.87})`);
      line($(".fd-upper"), S, E);
      line($(".fd-upper2"), S, E);
      line($(".fd-fore"), E, P);
      line($(".fd-fore2"), E, P);
      line($(".fd-shadow"), { x: E.x - 10 * k, y: E.y + 26 * k }, { x: P.x - 10 * k, y: P.y + 26 * k });
      for (const c of [".fd-shoulder", ".fd-elbow"]) {
        const p = c === ".fd-shoulder" ? S : E;
        $(c).setAttribute("cx", p.x);
        $(c).setAttribute("cy", p.y);
      }
      const rot = (Math.atan2(P.y - E.y, P.x - E.x) * 180) / Math.PI + 90;
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
      const hit = keys[k2 + 2].t - 60;
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

    // Jede neue Karte rutscht unter der Hand hervor, sobald die Hand über ihrem Platz ist
    back.forEach((c, j) => {
      c.el.animate(
        [
          { transform: `translate(${W * 0.15}px, ${-H * 0.25}px) rotate(-6deg) scale(1.04)`, opacity: 0 },
          { transform: `translate(${W * 0.08}px, ${-H * 0.12}px) rotate(-3deg)`, opacity: 1, offset: 0.3 },
          { transform: "none", opacity: 1 },
        ],
        { duration: 260, delay: DEAL + STEP * (j + 1) - 60, easing: "ease-out", fill: "backwards" }
      );
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
