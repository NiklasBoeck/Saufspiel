// Spiele-Register. Jedes Spiel liegt in einer eigenen Datei und meldet sich hier an.
//
// registerGame(key, {
//   label, emoji, description, tag, color,
//   cards: [...]          // Kartenspiel: zufällige Karten, {p}/{p2} = Spieler
//   start(root, ctx)      // eigenes Spiel nach der Namenseingabe; ctx = { players, exit }
//   open()                // eigenes Spiel ohne Namenseingabe (z. B. eigene Lobby)
// })
const GAMES = {};

function registerGame(key, def) {
  GAMES[key] = def;
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
