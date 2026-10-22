// Kartenspiele. {p} = zufälliger Spieler, {p2} = ein anderer zufälliger Spieler.
// Neue Karten einfach ins passende Spiel eintragen. Eine Karte ist entweder nur Text oder
// { text, drink, alert }:
//   drink = Trinkregel, die groß unter der Karte steht (wenn die App nicht weiß, wen es trifft)
//   alert = { who, n, give }: sicheres Trinken, dafür kommt die Trink-Meldung
// note (beim Spiel) = Trinkregel, die für jede Karte gilt.
function registerCardGame(key, def) {
  const fill = (text, p, p2) => text.replaceAll("{p}", p).replaceAll("{p2}", p2);

  function nextCard(s) {
    if (s.deck.length === 0) s.deck = shuffle([...def.cards.keys()]);
    const raw = def.cards[s.deck.pop()];
    const card = typeof raw === "string" ? { text: raw } : raw;
    const [p, p2] = shuffle([...s.players]);
    s.round++;
    s.card = { text: fill(card.text, p, p2) };
    if (card.drink) s.card.drink = fill(card.drink, p, p2);
    if (card.alert) drink(s, [{ ...card.alert, who: fill(card.alert.who, p, p2) }]);
  }

  registerGame(key, {
    ...def,
    setup(players) {
      const s = { players, deck: [], round: 0, card: null };
      nextCard(s);
      return s;
    },
    view(s) {
      const note = s.card.drink ?? def.note;
      return {
        phase: `Karte ${s.round}`,
        title: "",
        body: `
          <article class="card" style="--accent: ${def.color}">
            <span class="card-category">${escapeHtml(def.label)}</span>
            <p class="card-text">${escapeHtml(s.card.text)}</p>
            ${note ? drinkNoteHtml(escapeHtml(note)) : ""}
          </article>`,
        actions: [{ label: "Nächste Karte", act: { type: "next" } }],
      };
    },
    act(s, a) {
      if (a.type === "next") nextCard(s);
    },
  });
}

registerCardGame("niewieder", {
  label: "Ich hab noch nie",
  emoji: "🙊",
  description: "Wer’s schon mal gemacht hat, trinkt.",
  color: "#7c3aed",
  note: "Wer’s schon mal gemacht hat, trinkt!",
  cards: [
    "Ich hab noch nie … verschlafen und es auf die Bahn geschoben.",
    "Ich hab noch nie … jemandem aus Versehen eine Nachricht geschickt, die nicht für ihn war.",
    "Ich hab noch nie … auf einer Party eingeschlafen.",
    "Ich hab noch nie … meinen Namen gegoogelt.",
    "Ich hab noch nie … ein Geschenk weiterverschenkt.",
  ],
});

registerCardGame("pflicht", {
  label: "Pflicht",
  emoji: "🎯",
  description: "Aufgabe erfüllen oder trinken.",
  color: "#db2777",
  cards: [
    { text: "{p}, erzähl einen Witz.", drink: "Wenn keiner lacht, trinkt {p} 2 Schlucke." },
    { text: "{p}, mach 10 Sekunden lang einen Tierlaut deiner Wahl.", drink: "Wenn nicht, trinkt {p} 3 Schlucke." },
    "{p} und {p2} tauschen für eine Runde die Plätze.",
    { text: "{p}, verteil 3 Schlucke, wie du willst.", alert: { who: "{p}", n: 3, give: true } },
    { text: "{p}, sprich bis zur nächsten Karte nur in Reimen.", drink: "Jeder Fehler: {p} trinkt 1 Schluck." },
  ],
});
