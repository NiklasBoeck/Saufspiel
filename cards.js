// Kartendeck. {p} = zufälliger Spieler, {p2} = ein anderer zufälliger Spieler.
// Neue Karten einfach in die passende Kategorie eintragen.
const CATEGORIES = {
  niewieder: {
    label: "Ich hab noch nie",
    color: "#7c3aed",
    cards: [
      "Ich hab noch nie … verschlafen und es auf die Bahn geschoben. Wer schon, trinkt.",
      "Ich hab noch nie … jemandem aus Versehen eine Nachricht geschickt, die nicht für ihn war. Wer schon, trinkt.",
      "Ich hab noch nie … auf einer Party eingeschlafen. Wer schon, trinkt.",
      "Ich hab noch nie … meinen Namen gegoogelt. Wer schon, trinkt.",
      "Ich hab noch nie … ein Geschenk weiterverschenkt. Wer schon, trinkt.",
    ],
  },
  pflicht: {
    label: "Pflicht",
    color: "#db2777",
    cards: [
      "{p}, erzähl einen Witz. Wenn keiner lacht: 2 Schlucke.",
      "{p}, mach 10 Sekunden lang einen Tierlaut deiner Wahl, oder trink 3 Schlucke.",
      "{p} und {p2} tauschen für eine Runde die Plätze.",
      "{p}, verteil 3 Schlucke, wie du willst.",
      "{p}, sprich bis zu deiner nächsten Karte nur in Reimen. Jeder Fehler: 1 Schluck.",
    ],
  },
  gruppe: {
    label: "Alle",
    color: "#ea580c",
    cards: [
      "Alle, die heute schon Kaffee hatten, trinken 1 Schluck.",
      "Der/die Jüngste verteilt 2 Schlucke.",
      "Wasserfall! {p} fängt an.",
      "Alle zeigen auf die Person, die am ehesten zu spät kommt. Die trinkt 2 Schlucke.",
      "Kategorie-Runde: Automarken. {p} beginnt, wer nichts mehr weiß, trinkt.",
    ],
  },
  regel: {
    label: "Neue Regel",
    color: "#0891b2",
    cards: [
      "Neue Regel: Niemand darf mehr „trinken“ sagen. Wer’s tut, trinkt.",
      "Neue Regel: {p} ist Fragenmeister. Wer auf eine Frage von {p} antwortet, trinkt.",
      "Neue Regel: Vor jedem Schluck muss man „Prost“ sagen. Vergessen? Noch einer.",
    ],
  },
};
