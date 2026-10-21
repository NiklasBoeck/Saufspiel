// Triade: reihum eine Karte ziehen, jeder Wert hat eine Bedeutung. Gespielt wird mit 32 Karten (7 bis Ass).
(() => {
  const RULES = {
    A: {
      name: "Ass",
      title: "Wasserfall!",
      text: "Alle setzen an. {p} fängt an, und erst wenn {p} aufhört, darf die nächste Person aufhören, und so weiter.",
    },
    K: { name: "König", title: "10 Schlucke verteilen", text: "{p} verteilt 10 Schlucke, wie es gefällt." },
    D: { name: "Dame", title: "Neue Regel", text: "{p} legt eine Regel fest, die ab jetzt für alle gilt." },
    B: { name: "Bube", title: "Busfahrer!", text: "{p} muss Bus fahren.", bus: true },
    10: {
      name: "10",
      title: "Kategorie",
      text: "{p} nennt eine Kategorie (z. B. Automarken). Reihum nennt jeder etwas dazu. Wer nichts mehr weiß oder etwas doppelt sagt, trinkt.",
    },
    9: { name: "9", title: "9 Schlucke verteilen", text: "{p} verteilt 9 Schlucke, wie es gefällt." },
    8: {
      name: "8",
      title: "Klokarte",
      text: "{p} darf einmal aufs Klo gehen. Ohne Klokarte geht niemand aufs Klo! Die Karte kann man auch tauschen oder verschenken.",
    },
    7: {
      name: "7",
      title: "7er-Reihe",
      text: "{p} fängt an zu zählen, reihum geht es weiter. Bei jeder Zahl mit einer 7, die durch 7 teilbar ist oder deren Quersumme 7 ist, wird „Plopp“ gesagt. Wer sich vertut, trinkt.",
    },
  };
  const RANKS = ["7", "8", "9", "10", "B", "D", "K", "A"];

  let root, ctx, s;

  function newDeck() {
    return shuffle(SUITS.flatMap((suit) => RANKS.map((rank) => ({ suit, rank }))));
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

  function legend() {
    return `<ul class="tr-legend">${RANKS.slice()
      .reverse()
      .map((r) => `<li><b>${RULES[r].name}</b> ${RULES[r].title}</li>`)
      .join("")}</ul>`;
  }

  function showTurn() {
    if (s.deck.length === 0) return showEnd();
    const player = ctx.players[s.turn];
    render({
      phase: `Triade · noch ${s.deck.length} Karten`,
      title: `${escapeHtml(player)} zieht`,
      body: `<div class="pc-row">${playingCardHtml(null, "pc-big")}</div>${legend()}`,
      actions: [["Karte ziehen", drawCard]],
    });
  }

  function drawCard() {
    const player = ctx.players[s.turn];
    const card = s.deck.pop();
    const rule = RULES[card.rank];
    const text = escapeHtml(rule.text).replaceAll("{p}", `<b>${escapeHtml(player)}</b>`);
    s.turn = (s.turn + 1) % ctx.players.length;
    render({
      phase: `Triade · noch ${s.deck.length} Karten`,
      title: rule.title,
      body: `<div class="pc-row">${playingCardHtml(card, "pc-big pc-new")}</div><p class="tr-text">${text}</p>`,
      actions: rule.bus
        ? [["Busfahrt starten", () => startBusfahrt(root, player, showTurn)]]
        : [["Weiter", showTurn]],
    });
  }

  function showEnd() {
    render({
      phase: "Triade",
      title: "Alle Karten gezogen! 🎉",
      body: `<p class="bf-text">Das Deck ist leer. Nochmal mischen?</p>`,
      actions: [["Nochmal spielen", () => start(root, ctx)], ["Zum Menü", ctx.exit, true]],
    });
  }

  function start(rootEl, context) {
    root = rootEl;
    ctx = context;
    s = { deck: newDeck(), turn: 0 };
    showTurn();
  }

  registerGame("triade", {
    label: "Triade",
    emoji: "🃏",
    description: "Reihum Karten ziehen, jede Karte hat ihre Aufgabe.",
    tag: "Kartenspiel",
    color: "#ea580c",
    start,
  });
})();
