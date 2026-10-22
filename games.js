// Spiele-Register. Jedes Spiel liegt in einer eigenen Datei und meldet sich hier an.
//
// registerGame(key, {
//   label, emoji, description, tag, color,
//   setup(players)        // neuer Spielstand (reines JSON, damit er an andere Handys geht)
//   view(s, me)           // was gerade zu sehen ist: { phase, title, body, actions, actionsClass, turn }
//                         //   turn = wer dran ist, wenn im body mit data-act/data-by getippt wird
//                         //   me = eigener Name bei jeder sein Handy (sonst null)
//                         //   actions: [{ label, sub, act, by, ghost, exit, disabled }]
//                         //   by = Spieler, der drücken darf (fehlt: jeder), exit = zurück zum Menü
//   act(s, action, by)    // Aktion auf den Spielstand anwenden, by = wer gedrückt hat
//   fit                   // true: Spiel passt immer auf den Bildschirm, ohne Scrollen
//   open()                // eigenes Spiel auf eigener Seite (z. B. Flunky Ball)
//   bot(s, name, actions) // was ein Bot drückt (eine act aus actions); fehlt: zufälliger Knopf
// })
//
// Bots sind ganz normale Spieler, ihr Name fängt mit BOT an. Ist ein Knopf für einen Bot (by),
// drückt ihn die App nach kurzer Pause selbst (beim Mehr-Handy-Spiel das Handy des Hosts).
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
// Darf ein Bot verteilen, verteilt er gleich selbst, zufällig an die anderen.
function drink(s, items) {
  const out = [];
  for (const it of items) {
    out.push(it);
    if (it.give && it.n && isBot(it.who)) {
      const others = (s.players ?? []).filter((p) => p !== it.who);
      const got = {};
      for (let i = 0; i < it.n && others.length; i++) {
        const p = others[Math.floor(Math.random() * others.length)];
        got[p] = (got[p] ?? 0) + 1;
      }
      for (const [who, n] of Object.entries(got)) out.push({ who, n, text: `von ${it.who}` });
    }
  }
  s.alert = { id: Math.random().toString(36).slice(2), items: out };
}

// --- Bots ---

const BOT = "🤖 ";
const BOT_NAMES = ["Robo-Rudi", "Bot-Bärbel", "Chip-Charlie", "Byte-Brigitte", "Turbo-Tom", "Pixel-Paula", "Kalle Klon", "Data-Dörte"];

function isBot(name) {
  return typeof name === "string" && name.startsWith(BOT);
}

// Name für einen neuen Bot, der noch nicht in names vorkommt.
function newBotName(names) {
  const free = BOT_NAMES.map((n) => BOT + n).filter((n) => !names.includes(n));
  if (free.length) return free[Math.floor(Math.random() * free.length)];
  for (let i = 2; ; i++) if (!names.includes(`${BOT}Bot ${i}`)) return `${BOT}Bot ${i}`;
}

// Mittlere Schwierigkeit: meistens die kluge Wahl, manchmal einfach irgendwas.
function botPick(smart, options, slip = 0.2) {
  return Math.random() < slip ? options[Math.floor(Math.random() * options.length)] : smart;
}

// Meldung ohne Trinken auf allen Handys, z. B. { emoji: "⬆️", title: "Höher!", text }
function notice(s, n) {
  s.alert = { id: Math.random().toString(36).slice(2), items: [], notice: n };
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
