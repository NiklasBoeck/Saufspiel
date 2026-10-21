// Busfahrer: Fragerunde (4 Karten pro Spieler), Pyramide, dann die Busfahrt.
// Der ganze Spielstand steckt in einem Objekt, damit er auch an die anderen Handys gehen kann.
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

  function draw(s) {
    if (s.deck.length === 0) s.deck = newDeck();
    return s.deck.pop();
  }

  const name = (p) => escapeHtml(p);

  // --- Busfahrt, auch für Triade (Bube) ---

  function busRow(b) {
    b.tries++;
    b.cards = Array.from({ length: BUS_LENGTH }, () => draw(b));
    b.pos = 0;
    b.stage = "guess";
  }

  function busHtml(b) {
    return `<div class="pc-row">${b.cards
      .map((c, i) => playingCardHtml(i <= b.pos ? c : null, i === b.pos ? "pc-new" : ""))
      .join("")}</div>`;
  }

  window.Busfahrt = {
    start(driver) {
      const b = { driver, tries: 0, deck: newDeck() };
      busRow(b);
      return b;
    },

    // doneActions: was nach geschaffter Busfahrt angeboten wird
    view(b, doneActions) {
      const phase = `Busfahrt · ${name(b.driver)}`;
      if (b.stage === "fail") {
        return {
          phase,
          title: `Falsch! ${name(b.driver)} trinkt ${sips(b.pos)} und fängt von vorne an.`,
          body: busHtml(b),
          actions: [{ label: "Neue Reihe", act: { type: "row" }, by: b.driver }],
        };
      }
      if (b.stage === "done") {
        return {
          phase: "Busfahrt",
          title: `🎉 ${name(b.driver)} ist angekommen!`,
          body: busHtml(b) + `<p class="bf-text">Geschafft nach ${b.tries} ${b.tries === 1 ? "Versuch" : "Versuchen"}.</p>`,
          actions: doneActions,
        };
      }
      return {
        phase,
        title: b.pos === 0 ? `Versuch ${b.tries}: höher oder tiefer?` : "Richtig! Weiter: höher oder tiefer?",
        body: busHtml(b),
        actions: [
          { label: "Höher", act: { type: "bus", choice: "hoeher" }, by: b.driver },
          { label: "Tiefer", act: { type: "bus", choice: "tiefer" }, by: b.driver },
        ],
      };
    },

    act(s, b, a) {
      if (a.type === "row" && b.stage === "fail") return busRow(b);
      if (a.type !== "bus" || b.stage !== "guess") return;
      const right = compare(b.cards[b.pos + 1], b.cards[b.pos], a.choice);
      b.pos++;
      if (!right) {
        b.stage = "fail";
        drink(s, [{ who: b.driver, n: b.pos, text: "und fängt von vorne an" }]);
      } else if (b.pos === BUS_LENGTH - 1) {
        b.stage = "done";
      }
    },
  };

  // --- Phase 1: Fragerunde ---

  function handHtml(hand, open) {
    const cards = hand.map((c, i) => playingCardHtml(c, !open && i === hand.length - 1 ? "pc-new" : ""));
    return `<div class="pc-row">${cards.join("")}${open ? playingCardHtml(null) : ""}</div>`;
  }

  function askView(s) {
    const player = s.players[s.turn];
    const q = QUESTIONS[s.round];
    return {
      phase: `Fragerunde · Karte ${s.round + 1} von 4`,
      title: `${name(player)}: ${q.text}`,
      body: handHtml(s.hands[player], true),
      actions: q.options.map(([value, label]) => ({ label, act: { type: "answer", choice: value }, by: player })),
    };
  }

  function answeredView(s) {
    const player = s.players[s.turn];
    const n = s.round + 1;
    return {
      phase: `Fragerunde · Karte ${n} von 4`,
      title: s.right ? `Richtig! ${name(player)} verteilt ${sips(n)}.` : `Falsch! ${name(player)} trinkt ${sips(n)}.`,
      body: handHtml(s.hands[player], false),
      actions: [{ label: "Weiter", act: { type: "next" } }],
    };
  }

  function answer(s, choice) {
    const player = s.players[s.turn];
    const hand = s.hands[player];
    const card = draw(s);
    s.right = QUESTIONS[s.round].check(card, choice, hand);
    hand.push(card);
    s.stage = "answered";
    drink(s, [{ who: player, n: s.round + 1, give: s.right }]);
  }

  function nextTurn(s) {
    s.turn++;
    if (s.turn === s.players.length) {
      s.turn = 0;
      s.round++;
    }
    if (s.round < QUESTIONS.length) s.stage = "ask";
    else startPyramid(s);
  }

  // --- Phase 2: Pyramide ---

  function startPyramid(s) {
    s.stage = "pyramid";
    s.pyramid = PYRAMID_ROWS.flatMap((count, row) =>
      Array.from({ length: count }, () => ({ card: draw(s), row: row + 1, open: false }))
    );
    s.revealed = 0;
    s.hits = null;
  }

  function pyramidHtml(s) {
    let i = 0;
    const rows = PYRAMID_ROWS.map((count) => {
      const cells = s.pyramid.slice(i, (i += count));
      return `<div class="pc-row">${cells.map((p) => playingCardHtml(p.open ? p.card : null, "pc-small")).join("")}</div>`;
    });
    return `<div class="pyramid">${rows.reverse().join("")}</div>`;
  }

  function handsHtml(s, highlight) {
    return `<ul class="bf-hands">${s.players
      .map((p) => {
        const cards = s.hands[p].map((c) => playingCardHtml(c, "pc-tiny")).join("");
        const cls = highlight.includes(p) ? "hit" : "";
        return `<li class="${cls}"><span>${name(p)}</span><div class="pc-row">${cards}</div></li>`;
      })
      .join("")}</ul>`;
  }

  function pyramidView(s) {
    const done = s.revealed === s.pyramid.length;
    let title = "Bei jeder aufgedeckten Karte verteilt, wer den gleichen Wert auf der Hand hat.";
    if (s.hits) {
      title = s.hits.length
        ? s.hits.map(([p, n]) => `${name(p)} verteilt ${sips(n)}.`).join(" ")
        : `Niemand hat ${rankName(s.pyramid[s.revealed - 1].card.rank)}.`;
    }
    return {
      phase: `Pyramide · ${s.revealed} von ${s.pyramid.length} aufgedeckt`,
      title,
      body: pyramidHtml(s) + handsHtml(s, (s.hits ?? []).map(([p]) => p)),
      actions: [
        done
          ? { label: "Wer fährt Bus?", act: { type: "driver" } }
          : { label: "Nächste Karte aufdecken", act: { type: "reveal" } },
      ],
    };
  }

  function revealNext(s) {
    const slot = s.pyramid[s.revealed++];
    slot.open = true;
    s.hits = [];
    for (const p of s.players) {
      const hand = s.hands[p];
      const matches = hand.filter((c) => c.rank === slot.card.rank).length;
      if (matches > 0) {
        s.hands[p] = hand.filter((c) => c.rank !== slot.card.rank);
        s.hits.push([p, matches * slot.row]);
      }
    }
    if (s.hits.length) drink(s, s.hits.map(([p, n]) => ({ who: p, n, give: true })));
  }

  // --- Phase 3: Busfahrt ---

  function pickDriver(s) {
    const most = Math.max(...s.players.map((p) => s.hands[p].length));
    const candidates = s.players.filter((p) => s.hands[p].length === most);
    s.driver = shuffle(candidates)[0];
    s.most = most;
    s.stage = "driver";
  }

  function driverView(s) {
    return {
      phase: "Busfahrt",
      title: `🚌 ${name(s.driver)} fährt Bus!`,
      body: `<p class="bf-text">${name(s.driver)} hat mit ${s.most} Karten die meisten übrig. Jetzt immer „höher“ oder „tiefer“ raten, bis alle ${BUS_LENGTH} Karten geschafft sind. Bei einem Fehler wird getrunken und es geht von vorne los.</p>`,
      actions: [{ label: "Losfahren", act: { type: "go" }, by: s.driver }],
    };
  }

  registerGame("busfahrer", {
    label: "Busfahrer",
    emoji: "🚌",
    description: "Raten, Pyramide, und wer verliert, fährt Bus.",
    color: "#16a34a",

    setup(players) {
      const s = { players, deck: newDeck(), hands: {}, round: 0, turn: 0, stage: "ask" };
      for (const p of players) s.hands[p] = [];
      return s;
    },

    view(s) {
      switch (s.stage) {
        case "ask": return askView(s);
        case "answered": return answeredView(s);
        case "pyramid": return pyramidView(s);
        case "driver": return driverView(s);
        default:
          return Busfahrt.view(s.bus, [
            { label: "Nochmal spielen", act: { type: "restart" } },
            { label: "Zum Menü", exit: true, ghost: true },
          ]);
      }
    },

    act(s, a) {
      if (s.stage === "ask" && a.type === "answer") answer(s, a.choice);
      else if (s.stage === "answered" && a.type === "next") nextTurn(s);
      else if (s.stage === "pyramid" && a.type === "reveal" && s.revealed < s.pyramid.length) revealNext(s);
      else if (s.stage === "pyramid" && a.type === "driver" && s.revealed === s.pyramid.length) pickDriver(s);
      else if (s.stage === "driver" && a.type === "go") {
        s.bus = Busfahrt.start(s.driver);
        s.stage = "bus";
      } else if (s.stage === "bus") Busfahrt.act(s, s.bus, a);
    },
  });
})();
