// Kartenspiele. {p} = zufälliger Spieler, {p2} = ein anderer zufälliger Spieler.
// Neue Karten einfach ins passende Spiel eintragen. Eine Karte ist entweder nur Text oder
// { text, drink, alert }:
//   drink = Trinkregel, die groß unter der Karte steht (wenn die App nicht weiß, wen es trifft)
//   alert = { who, n, give }: sicheres Trinken, dafür kommt die Trink-Meldung
//   fail = Schlucke, wenn ein Bot als {p} die Aufgabe nicht schafft (passiert in der Hälfte der Fälle)
// note (beim Spiel) = Trinkregel, die für jede Karte gilt.
// botChance (beim Spiel) = so oft „trifft“ die Regel einen Bot, dann trinkt er botSips Schlucke (botText),
//   botNone = was dasteht, wenn es keinen Bot trifft.
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
    const items = card.alert ? [{ ...card.alert, who: fill(card.alert.who, p, p2) }] : [];
    // Bots spielen mit: Sie haben’s auch mal gemacht oder schaffen ihre Aufgabe nicht.
    if (card.fail && isBot(p)) {
      if (Math.random() < 0.5) items.push({ who: p, n: card.fail, text: "hat’s nicht geschafft" });
      else s.card.bot = `${p} hat’s geschafft!`;
    }
    if (def.botChance) {
      const hit = s.players.filter((x) => isBot(x) && Math.random() < def.botChance);
      items.push(...hit.map((who) => ({ who, n: def.botSips, text: def.botText })));
      if (s.players.some(isBot) && !hit.length) s.card.bot = def.botNone;
    }
    if (items.length) drink(s, items);
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
            ${s.card.bot ? `<p class="bot-line">${escapeHtml(s.card.bot)}</p>` : ""}
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
  botChance: 0.4,
  botSips: 1,
  botText: "hat’s schon mal gemacht",
  botNone: "Die Bots haben das noch nie gemacht.",
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
    { text: "{p}, erzähl einen Witz.", drink: "Wenn keiner lacht, trinkt {p} 2 Schlucke.", fail: 2 },
    { text: "{p}, mach 10 Sekunden lang einen Tierlaut deiner Wahl.", drink: "Wenn nicht, trinkt {p} 3 Schlucke.", fail: 3 },
    "{p} und {p2} tauschen für eine Runde die Plätze.",
    { text: "{p}, verteil 3 Schlucke, wie du willst.", alert: { who: "{p}", n: 3, give: true } },
    { text: "{p}, sprich bis zur nächsten Karte nur in Reimen.", drink: "Jeder Fehler: {p} trinkt 1 Schluck.", fail: 1 },
  ],
});

registerCardGame("regel", {
  label: "Neue Regel",
  emoji: "📜",
  description: "Regeln, die bis zum Ende gelten.",
  botChance: 0.25,
  botSips: 1,
  botText: "hat gegen eine Regel verstoßen",
  botNone: "Die Bots halten sich an alle Regeln.",
  color: "#0891b2",
  cards: [
    { text: "Neue Regel: Niemand darf mehr „trinken“ sagen.", drink: "Wer’s trotzdem sagt, trinkt." },
    { text: "Neue Regel: {p} ist Fragenmeister.", drink: "Wer auf eine Frage von {p} antwortet, trinkt." },
    { text: "Neue Regel: Vor jedem Schluck muss man „Prost“ sagen.", drink: "Vergessen? Noch ein Schluck." },
  ],
});
