// Spiele-Register. Jedes Spiel liegt in einer eigenen Datei und meldet sich hier an.
//
// registerGame(key, {
//   label, emoji, description, tag, color,
//   setup(players)        // neuer Spielstand (reines JSON, damit er an andere Handys geht)
//   view(s)               // was gerade zu sehen ist: { phase, title, body, actions }
//                         //   actions: [{ label, act, by, ghost, exit }]
//                         //   by = Spieler, der drücken darf (fehlt: jeder), exit = zurück zum Menü
//   act(s, action, by)    // Aktion auf den Spielstand anwenden, by = wer gedrückt hat
//   open()                // eigenes Spiel auf eigener Seite (z. B. Flunky Ball)
// })
//
// Jedes Spiel mit setup/view/act läuft automatisch auf einem Handy oder mit jedem am eigenen Handy.
// Muss jemand trinken, ruft act() drink(s, [...]) auf, dann kommt auf allen Handys die Trink-Meldung.
const GAMES = {};

function registerGame(key, def) {
  GAMES[key] = def;
}

// Für Trink-Meldungen: alle trinken.
const ALL = "*";

// Trink-Meldung auslösen. items: [{ who, n, give, text }]
//   who = Spielername oder ALL, n = Schlucke, give = verteilt statt trinkt, text = Zusatz
function drink(s, items) {
  s.alert = { id: Math.random().toString(36).slice(2), items };
}

function sips(n) {
  return n === 1 ? "1 Schluck" : `${n} Schlucke`;
}

// Hinweis für Trinkregeln, bei denen die App nicht weiß, wen es trifft.
function drinkNoteHtml(text) {
  return `<p class="drink-note">🍺 ${text}</p>`;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

// Spielkarten, gemeinsam für Busfahrer und Triade.
const SUITS = [
  { symbol: "♠", name: "Pik", red: false },
  { symbol: "♥", name: "Herz", red: true },
  { symbol: "♦", name: "Karo", red: true },
  { symbol: "♣", name: "Kreuz", red: false },
];

function playingCardHtml(card, size = "") {
  if (!card) return `<div class="pc pc-back ${size}"></div>`;
  const color = card.suit.red ? "pc-red" : "";
  return `<div class="pc ${color} ${size}"><span>${card.rank}</span><span>${card.suit.symbol}</span></div>`;
}
