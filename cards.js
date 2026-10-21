// Kartenspiele. {p} = zufälliger Spieler, {p2} = ein anderer zufälliger Spieler.
// Neue Karten einfach ins passende Spiel eintragen.
registerGame("niewieder", {
  label: "Ich hab noch nie",
  emoji: "🙊",
  description: "Wer’s schon mal gemacht hat, trinkt.",
  tag: "Karten",
  color: "#7c3aed",
  cards: [
    "Ich hab noch nie … verschlafen und es auf die Bahn geschoben. Wer schon, trinkt.",
    "Ich hab noch nie … jemandem aus Versehen eine Nachricht geschickt, die nicht für ihn war. Wer schon, trinkt.",
    "Ich hab noch nie … auf einer Party eingeschlafen. Wer schon, trinkt.",
    "Ich hab noch nie … meinen Namen gegoogelt. Wer schon, trinkt.",
    "Ich hab noch nie … ein Geschenk weiterverschenkt. Wer schon, trinkt.",
  ],
});

registerGame("pflicht", {
  label: "Pflicht",
  emoji: "🎯",
  description: "Aufgabe erfüllen oder trinken.",
  tag: "Karten",
  color: "#db2777",
  cards: [
    "{p}, erzähl einen Witz. Wenn keiner lacht: 2 Schlucke.",
    "{p}, mach 10 Sekunden lang einen Tierlaut deiner Wahl, oder trink 3 Schlucke.",
    "{p} und {p2} tauschen für eine Runde die Plätze.",
    "{p}, verteil 3 Schlucke, wie du willst.",
    "{p}, sprich bis zu deiner nächsten Karte nur in Reimen. Jeder Fehler: 1 Schluck.",
  ],
});

registerGame("regel", {
  label: "Neue Regel",
  emoji: "📜",
  description: "Regeln, die bis zum Ende gelten.",
  tag: "Karten",
  color: "#0891b2",
  cards: [
    "Neue Regel: Niemand darf mehr „trinken“ sagen. Wer’s tut, trinkt.",
    "Neue Regel: {p} ist Fragenmeister. Wer auf eine Frage von {p} antwortet, trinkt.",
    "Neue Regel: Vor jedem Schluck muss man „Prost“ sagen. Vergessen? Noch einer.",
  ],
});
