// Triade: reihum eine Karte ziehen, jeder Wert hat eine Bedeutung. Gespielt wird mit 32 Karten (7 bis Ass).
(() => {
  // alert: wer sicher trinkt (Trink-Meldung), drink: Trinkregel, bei der die App nicht weiß, wen es trifft.
  const RULES = {
    A: {
      name: "Ass",
      title: "Wasserfall!",
      text: "Alle setzen an. {p} fängt an, und erst wenn {p} aufhört, darf die nächste Person aufhören, und so weiter.",
      alert: (p) => [{ who: ALL, text: `Wasserfall! ${p} fängt an.` }],
    },
    K: {
      name: "König",
      title: "10 Schlucke verteilen",
      text: "{p} verteilt 10 Schlucke, wie es gefällt.",
      alert: (p) => [{ who: p, n: 10, give: true }],
    },
    D: { name: "Dame", title: "Neue Regel", text: "{p} legt eine Regel fest, die ab jetzt für alle gilt." },
    B: { name: "Bube", title: "Busfahrer!", text: "{p} muss Bus fahren.", bus: true },
    10: {
      name: "10",
      title: "Kategorie",
      text: "{p} nennt eine Kategorie (z. B. Automarken). Reihum nennt jeder etwas dazu.",
      drink: "Wer nichts mehr weiß oder etwas doppelt sagt, trinkt.",
    },
    9: {
      name: "9",
      title: "9 Schlucke verteilen",
      text: "{p} verteilt 9 Schlucke, wie es gefällt.",
      alert: (p) => [{ who: p, n: 9, give: true }],
    },
    8: {
      name: "8",
      title: "Klokarte",
      text: "{p} darf einmal aufs Klo gehen. Ohne Klokarte geht niemand aufs Klo! Die Karte kann man auch tauschen oder verschenken.",
    },
    7: {
      name: "7",
      title: "7er-Reihe",
      text: "{p} fängt an zu zählen, reihum geht es weiter. Bei jeder Zahl mit einer 7, die durch 7 teilbar ist oder deren Quersumme 7 ist, wird „Plopp“ gesagt.",
      drink: "Wer sich vertut, trinkt.",
    },
  };
  const RANKS = ["7", "8", "9", "10", "B", "D", "K", "A"];

  // Zieht ein Bot Dame oder 10, sucht er sich selbst etwas aus.
  const BOT_PICKS = {
    D: [
      "Wer flucht, trinkt.",
      "Vor jedem Schluck „Prost, Bot!“ sagen.",
      "Niemand darf mehr auf sein Handy schauen, außer wenn er dran ist.",
      "Wer lacht, trinkt.",
      "Nur noch mit der linken Hand trinken.",
      "Keine Vornamen mehr sagen.",
    ],
    10: ["Automarken", "Biersorten", "Fußballvereine", "Länder in Europa", "Tiere im Zoo", "Pizzabeläge", "Disney-Filme", "Dinge im Kühlschrank"],
  };

  function newDeck() {
    return shuffle(SUITS.flatMap((suit) => RANKS.map((rank) => ({ suit, rank }))));
  }

  function legend() {
    return `<ul class="tr-legend">${RANKS.slice()
      .reverse()
      .map((r) => `<li><b>${RULES[r].name}</b> ${RULES[r].title}</li>`)
      .join("")}</ul>`;
  }

  function turnView(s) {
    if (s.deck.length === 0) {
      return {
        phase: "Triade",
        title: "Alle Karten gezogen! 🎉",
        body: `<p class="bf-text">Das Deck ist leer. Nochmal mischen?</p>`,
        actions: [
          { label: "Nochmal spielen", act: { type: "restart" } },
          { label: "Zum Menü", exit: true, ghost: true },
        ],
      };
    }
    const player = s.players[s.turn];
    return {
      phase: `Triade · noch ${s.deck.length} Karten`,
      title: `${escapeHtml(player)} zieht`,
      body: `<div class="pc-row">${playingCardHtml(null, "pc-big")}</div>${legend()}`,
      actions: [{ label: "Karte ziehen", act: { type: "draw" }, by: player }],
    };
  }

  function cardView(s) {
    const rule = RULES[s.card.rank];
    const text = escapeHtml(rule.text).replaceAll("{p}", `<b>${escapeHtml(s.drawer)}</b>`);
    return {
      phase: `Triade · noch ${s.deck.length} Karten`,
      title: rule.title,
      body: `<div class="pc-row">${playingCardHtml(s.card, "pc-big pc-new")}</div><p class="tr-text">${text}</p>${
        rule.drink ? drinkNoteHtml(rule.drink) : ""
      }${s.botPick ? `<p class="bot-line">${escapeHtml(s.drawer)}: „${escapeHtml(s.botPick)}“</p>` : ""}`,
      actions: rule.bus
        ? [{ label: "Busfahrt starten", act: { type: "bus-start" }, by: s.drawer }]
        : [{ label: "Weiter", act: { type: "next" } }],
    };
  }

  registerGame("triade", {
    label: "Triade",
    emoji: "🃏",
    description: "Reihum Karten ziehen, jede Karte hat ihre Aufgabe.",
    color: "#ea580c",

    setup(players) {
      return { players, deck: newDeck(), turn: 0, stage: "turn" };
    },

    view(s) {
      if (s.stage === "card") return cardView(s);
      if (s.stage === "bus") return Busfahrt.view(s.bus, [{ label: "Weiter", act: { type: "next" } }]);
      return turnView(s);
    },

    bot(s, name, acts) {
      if (s.stage === "bus") return Busfahrt.bot(s.bus, acts);
      return acts[0];
    },

    act(s, a) {
      if (s.stage === "turn" && a.type === "draw" && s.deck.length) {
        s.drawer = s.players[s.turn];
        s.card = s.deck.pop();
        const picks = isBot(s.drawer) && BOT_PICKS[s.card.rank];
        s.botPick = picks ? picks[Math.floor(Math.random() * picks.length)] : null;
        s.turn = (s.turn + 1) % s.players.length;
        s.stage = "card";
        const rule = RULES[s.card.rank];
        if (rule.alert) drink(s, rule.alert(s.drawer));
      } else if (s.stage === "card" && a.type === "bus-start" && RULES[s.card.rank].bus) {
        s.bus = Busfahrt.start(s.drawer);
        s.stage = "bus";
      } else if (s.stage === "card" && a.type === "next") {
        s.stage = "turn";
      } else if (s.stage === "bus") {
        if (a.type === "next" && s.bus.stage === "done") s.stage = "turn";
        else Busfahrt.act(s, s.bus, a);
      }
    },
  });
})();
