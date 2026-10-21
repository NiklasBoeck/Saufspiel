// Busfahrer: Fragerunde (4 Karten pro Spieler), Pyramide, dann die Busfahrt.
(() => {
  const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "B", "D", "K", "A"];
  const PYRAMID_ROWS = [4, 3, 2, 1]; // unterste Reihe zuerst, Schlucke = Reihennummer
  const BUS_LENGTH = 5;

  const QUESTIONS = [
    {
      text: "Rot oder Schwarz?",
      options: [["rot", "Rot"], ["schwarz", "Schwarz"]],
      check: (card, choice) => card.suit.red === (choice === "rot"),
    },
    {
      text: "Höher oder tiefer als deine erste Karte?",
      options: [["hoeher", "Höher"], ["tiefer", "Tiefer"]],
      check: (card, choice, hand) => compare(card, hand[0], choice),
    },
    {
      text: "Zwischen deinen Karten oder außerhalb?",
      options: [["innen", "Dazwischen"], ["aussen", "Außerhalb"]],
      check: (card, choice, hand) => {
        const lo = Math.min(hand[0].value, hand[1].value);
        const hi = Math.max(hand[0].value, hand[1].value);
        return choice === "innen"
          ? card.value > lo && card.value < hi
          : card.value < lo || card.value > hi;
      },
    },
    {
      text: "Welche Farbe?",
      options: SUITS.map((s) => [s.name, `${s.symbol} ${s.name}`]),
      check: (card, choice) => card.suit.name === choice,
    },
  ];

  // Gleiche Werte zählen immer als falsch.
  function compare(card, ref, choice) {
    return choice === "hoeher" ? card.value > ref.value : card.value < ref.value;
  }

  function newDeck() {
    return shuffle(
      SUITS.flatMap((suit) => RANKS.map((rank, i) => ({ suit, rank, value: i + 2 })))
    );
  }

  function rankName(rank) {
    return { B: "einen Buben", D: "eine Dame", K: "einen König", A: "ein Ass" }[rank] ?? `eine ${rank}`;
  }

  function sips(n) {
    return n === 1 ? "1 Schluck" : `${n} Schlucke`;
  }

  let root, ctx, s;

  function draw() {
    if (s.deck.length === 0) s.deck = newDeck();
    return s.deck.pop();
  }

  function render({ phase, title, body, actions }) {
    root.innerHTML = `
      <div class="bf">
        <p class="bf-phase">${phase}</p>
        <h2 class="bf-title">${title}</h2>
        <div class="bf-body">${body}</div>
        <div class="bf-actions"></div>
      </div>`;
    const box = root.querySelector(".bf-actions");
    for (const [label, fn, ghost] of actions) {
      const btn = document.createElement("button");
      btn.className = ghost ? "btn ghost" : "btn";
      btn.textContent = label;
      btn.onclick = fn;
      box.appendChild(btn);
    }
  }

  // --- Phase 1: Fragerunde ---

  function askQuestion() {
    const player = ctx.players[s.turn];
    const q = QUESTIONS[s.round];
    const hand = s.hands[player];
    render({
      phase: `Fragerunde · Karte ${s.round + 1} von 4`,
      title: `${escapeHtml(player)}: ${q.text}`,
      body: `<div class="pc-row">${hand.map((c) => playingCardHtml(c)).join("")}${playingCardHtml(null)}</div>`,
      actions: q.options.map(([value, label]) => [label, () => answer(value)]),
    });
  }

  function answer(choice) {
    const player = ctx.players[s.turn];
    const hand = s.hands[player];
    const card = draw();
    const right = QUESTIONS[s.round].check(card, choice, hand);
    hand.push(card);
    const n = s.round + 1;
    render({
      phase: `Fragerunde · Karte ${n} von 4`,
      title: right ? `Richtig! ${escapeHtml(player)} verteilt ${sips(n)}.` : `Falsch! ${escapeHtml(player)} trinkt ${sips(n)}.`,
      body: `<div class="pc-row">${hand.map((c, i) => playingCardHtml(c, i === hand.length - 1 ? "pc-new" : "")).join("")}</div>`,
      actions: [["Weiter", nextTurn]],
    });
  }

  function nextTurn() {
    s.turn++;
    if (s.turn === ctx.players.length) {
      s.turn = 0;
      s.round++;
    }
    if (s.round < QUESTIONS.length) askQuestion();
    else startPyramid();
  }

  // --- Phase 2: Pyramide ---

  function startPyramid() {
    s.pyramid = PYRAMID_ROWS.flatMap((count, row) =>
      Array.from({ length: count }, () => ({ card: draw(), row: row + 1, open: false }))
    );
    s.revealed = 0;
    showPyramid("Bei jeder aufgedeckten Karte verteilt, wer den gleichen Wert auf der Hand hat.");
  }

  function pyramidHtml() {
    let i = 0;
    const rows = PYRAMID_ROWS.map((count) => {
      const cells = s.pyramid.slice(i, (i += count));
      return `<div class="pc-row">${cells.map((p) => playingCardHtml(p.open ? p.card : null, "pc-small")).join("")}</div>`;
    });
    return `<div class="pyramid">${rows.reverse().join("")}</div>`;
  }

  function handsHtml(highlight = []) {
    return `<ul class="bf-hands">${ctx.players
      .map((p) => {
        const cards = s.hands[p].map((c) => playingCardHtml(c, "pc-tiny")).join("");
        const cls = highlight.includes(p) ? "hit" : "";
        return `<li class="${cls}"><span>${escapeHtml(p)}</span><div class="pc-row">${cards}</div></li>`;
      })
      .join("")}</ul>`;
  }

  function showPyramid(message, highlight = []) {
    const done = s.revealed === s.pyramid.length;
    render({
      phase: `Pyramide · ${s.revealed} von ${s.pyramid.length} aufgedeckt`,
      title: message,
      body: pyramidHtml() + handsHtml(highlight),
      actions: [done ? ["Wer fährt Bus?", pickDriver] : ["Nächste Karte aufdecken", revealNext]],
    });
  }

  function revealNext() {
    const slot = s.pyramid[s.revealed++];
    slot.open = true;
    const hits = [];
    for (const p of ctx.players) {
      const hand = s.hands[p];
      const matches = hand.filter((c) => c.rank === slot.card.rank).length;
      if (matches > 0) {
        s.hands[p] = hand.filter((c) => c.rank !== slot.card.rank);
        hits.push([p, matches * slot.row]);
      }
    }
    const message = hits.length
      ? hits.map(([p, n]) => `${escapeHtml(p)} verteilt ${sips(n)}.`).join(" ")
      : `Niemand hat ${rankName(slot.card.rank)}.`;
    showPyramid(message, hits.map(([p]) => p));
  }

  // --- Phase 3: Busfahrt ---

  function pickDriver() {
    const most = Math.max(...ctx.players.map((p) => s.hands[p].length));
    const candidates = ctx.players.filter((p) => s.hands[p].length === most);
    s.driver = shuffle(candidates)[0];
    s.tries = 0;
    render({
      phase: "Busfahrt",
      title: `🚌 ${escapeHtml(s.driver)} fährt Bus!`,
      body: `<p class="bf-text">${escapeHtml(s.driver)} hat mit ${most} Karten die meisten übrig. Jetzt immer „höher“ oder „tiefer“ raten, bis alle ${BUS_LENGTH} Karten geschafft sind. Bei einem Fehler wird getrunken und es geht von vorne los.</p>`,
      actions: [["Losfahren", startBusRow]],
    });
  }

  function startBusRow() {
    s.tries++;
    s.bus = Array.from({ length: BUS_LENGTH }, draw);
    s.pos = 0;
    showBus(`Versuch ${s.tries}: höher oder tiefer?`);
  }

  function busHtml(upTo) {
    return `<div class="pc-row">${s.bus.map((c, i) => playingCardHtml(i <= upTo ? c : null, i === upTo ? "pc-new" : "")).join("")}</div>`;
  }

  function showBus(title) {
    render({
      phase: `Busfahrt · ${escapeHtml(s.driver)}`,
      title,
      body: busHtml(s.pos),
      actions: [["Höher", () => guessBus("hoeher")], ["Tiefer", () => guessBus("tiefer")]],
    });
  }

  function guessBus(choice) {
    const right = compare(s.bus[s.pos + 1], s.bus[s.pos], choice);
    s.pos++;
    if (!right) {
      render({
        phase: `Busfahrt · ${escapeHtml(s.driver)}`,
        title: `Falsch! ${escapeHtml(s.driver)} trinkt ${sips(s.pos)} und fängt von vorne an.`,
        body: busHtml(s.pos),
        actions: [["Neue Reihe", startBusRow]],
      });
    } else if (s.pos === BUS_LENGTH - 1) {
      render({
        phase: "Busfahrt",
        title: `🎉 ${escapeHtml(s.driver)} ist angekommen!`,
        body: busHtml(s.pos) + `<p class="bf-text">Geschafft nach ${s.tries} ${s.tries === 1 ? "Versuch" : "Versuchen"}.</p>`,
        actions: s.busOnly
          ? [["Weiter", ctx.exit]]
          : [["Nochmal spielen", () => start(root, ctx)], ["Zum Menü", ctx.exit, true]],
      });
    } else {
      showBus("Richtig! Weiter: höher oder tiefer?");
    }
  }

  function start(rootEl, context) {
    root = rootEl;
    ctx = context;
    s = { deck: newDeck(), hands: {}, round: 0, turn: 0 };
    for (const p of ctx.players) s.hands[p] = [];
    askQuestion();
  }

  // Nur die Busfahrt, z. B. wenn bei Triade ein Bube gezogen wird.
  window.startBusfahrt = (rootEl, driver, onDone) => {
    root = rootEl;
    ctx = { exit: onDone };
    s = { deck: newDeck(), driver, tries: 0, busOnly: true };
    startBusRow();
  };

  registerGame("busfahrer", {
    label: "Busfahrer",
    emoji: "🚌",
    description: "Raten, Pyramide, und wer verliert, fährt Bus.",
    tag: "Kartenspiel",
    color: "#16a34a",
    start,
  });
})();
