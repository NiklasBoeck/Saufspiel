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
//   privateAlerts         // true: große Trink-Meldung nur für alle, die trinken, die anderen sehen einen kleinen Hinweis
//   afterRender(root, s, me) // nach dem Zeichnen, z. B. Animation; gibt ms zurück, die die Meldung wartet
//   rules                 // Spielregeln zum Nachlesen (Liste von Sätzen), kommen hinter das „?“ oben rechts
//   fit                   // false: Seite darf scrollen (sonst passt jedes Spiel genau auf den Bildschirm, hoch und quer)
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

// --- Stufe: wie viel getrunken wird ---
// Wird beim Spielstart in den Spielstand geschrieben (s.level), damit alle Handys dasselbe sehen.
// Alkoholfrei: gleiche Schlucke, aber Limo, Wasser oder was man will.
const LEVELS = {
  alkoholfrei: { label: "Alkoholfrei", emoji: "🥤", desc: "Limo, Wasser, was ihr wollt. Gleiche Regeln, null Promille.", scale: (n) => n },
  mild: { label: "Mild", emoji: "🙂", desc: "Halb so viele Schlucke.", scale: (n) => Math.ceil(n / 2) },
  normal: { label: "Normal", emoji: "🍺", desc: "So wie die Regeln es sagen.", scale: (n) => n },
  hart: { label: "Hart", emoji: "🔥", desc: "Anderthalbmal so viele Schlucke. Nur mit genug Wasser daneben.", scale: (n) => Math.round(n * 1.5) },
};
// --- Bots: wie gut sie spielen ---
// err = wie viele Fehler im Vergleich zu Mittel (Streuung beim Werfen, falsche Wahl, verpatzte Aufgaben).
// Gilt auf dem Handy, das die Bots spielen lässt (ein Handy oder der Host).
const BOT_LEVELS = {
  leicht: { label: "Leicht", emoji: "🐣", desc: "Die Bots patzen oft. Gut zum Reinkommen.", err: 2.2 },
  mittel: { label: "Mittel", emoji: "🤖", desc: "Meistens klug, manchmal daneben.", err: 1 },
  schwer: { label: "Schwer", emoji: "😈", desc: "Die Bots treffen fast immer. Viel Glück.", err: 0.4 },
};
// --- Aussehen: neues Design oder das alte (klassisch) ---
// boot.js liest das schon vor dem ersten Bild aus und setzt <html class="neu">.
const DESIGNS = {
  neu: { label: "Neu", emoji: "✏️", desc: "Warme Kneipenfarben, gezeichnete Icons.", swatch: ["#17130f", "#efe3c8", "#f0b429"] },
  garten: { label: "Biergarten", emoji: "🥨", desc: "Flaschengrün, Brezel-Orange, runde Sticker und Kacheln.", swatch: ["#0f2620", "#f6a04d", "#d9483b"] },
  wiesn: { label: "Wiesn", emoji: "🥨", desc: "Weiß-blaue Rauten, Wimpel und ein Lebkuchenherz. O’zapft is!", swatch: ["#0d2a52", "#ffffff", "#c8102e"] },
  klassisch: { label: "Klassisch", emoji: "🟣", desc: "Das alte Lila mit Emojis.", swatch: ["#1b1033", "#7c3aed", "#f59e0b"] },
};
// „Biergarten“ und „Wiesn“ bauen auf „Neu“ auf: <html class="neu garten"> bzw. <html class="neu wiesn">
const DESIGN_BG = { neu: "#17130f", garten: "#0f2620", wiesn: "#0d2a52", klassisch: "#1b1033" };
function applyDesign(d) {
  document.documentElement.classList.toggle("neu", d !== "klassisch");
  document.documentElement.classList.toggle("garten", d === "garten");
  document.documentElement.classList.toggle("wiesn", d === "wiesn");
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", DESIGN_BG[d] ?? DESIGN_BG.neu);
}
const SETTINGS_KEY = "saufspiel-settings";

const Settings = (() => {
  let data = {};
  try {
    data = JSON.parse(localStorage.getItem(SETTINGS_KEY)) ?? {};
  } catch {
    // ohne Speicher gilt einfach Normal
  }
  const save = () => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(data));
    } catch {
      // egal
    }
  };
  return {
    get level() {
      return LEVELS[data.level] ? data.level : "normal";
    },
    set level(v) {
      data.level = v;
      save();
    },
    get bots() {
      return BOT_LEVELS[data.bots] ? data.bots : "mittel";
    },
    set bots(v) {
      data.bots = v;
      save();
    },
    get lang() {
      return LANGUAGES[data.lang] ? data.lang : "de";
    },
    set lang(v) {
      data.lang = v;
      save();
      setLang(v);
    },
    get design() {
      return DESIGNS[data.design] ? data.design : "neu";
    },
    set design(v) {
      data.design = v;
      save();
      applyDesign(v);
    },
  };
})();

// Stufe des laufenden Spiels (app.js setzt sie beim Zeichnen), sonst die eigene Einstellung.
let playLevel = null;
function levelOf(s) {
  const l = s?.level ?? playLevel ?? Settings.level;
  return LEVELS[l] ? l : "normal";
}

// Neues Spiel mit der eingestellten Stufe (nur wer den Spielstand hält: ein Handy oder der Host).
function newGame(key, players, level = Settings.level) {
  playLevel = level; // setup() kann schon die erste Trink-Meldung auslösen
  const s = GAMES[key].setup(players);
  s.level = level;
  s.gid ??= Math.random().toString(36).slice(2); // für die Statistik: jedes Spiel zählt einmal
  return s;
}

// Ergebnis für die Statistik (stats.js): wer hat diese Runde / dieses Duell / dieses Spiel gewonnen, wer verloren.
// Jedes Ergebnis zählt auf jedem Handy genau einmal.
function score(s, win = [], lose = []) {
  s.score = { id: Math.random().toString(36).slice(2), win: win.filter(Boolean), lose: lose.filter(Boolean) };
}

function drinkEmoji(s) {
  return levelOf(s) === "alkoholfrei" ? "🥤" : "🍺";
}

// Trink-Meldung auslösen. items: [{ who, n, give, text }]
//   who = Spielername oder ALL, n = Schlucke, give = verteilt statt trinkt, text = Zusatz
// Die Schlucke werden an die Stufe angepasst (Mild halbiert, Hart mal 1,5).
// Darf ein Bot verteilen, verteilt er gleich selbst, zufällig an die anderen.
function drink(s, items) {
  const level = levelOf(s);
  const scale = LEVELS[level].scale;
  items = items.map((it) => (it.n ? { ...it, n: scale(it.n) } : it));
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
  s.alert = { id: Math.random().toString(36).slice(2), items: out, level };
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

// Wie viele Fehler die Bots machen (1 = mittel, mehr = leichter, weniger = schwerer)
function botErr() {
  return BOT_LEVELS[Settings.bots].err;
}

// Meistens die kluge Wahl, manchmal einfach irgendwas (wie oft: je nach Bot-Stufe).
function botPick(smart, options, slip = 0.2) {
  return Math.random() < Math.min(0.9, slip * botErr()) ? options[Math.floor(Math.random() * options.length)] : smart;
}

// Kleine Meldung ohne Trinken (ohne Knopf, verschwindet von selbst), z. B. { emoji: "⬆️", title: "Höher!", text }
function notice(s, n) {
  s.alert = { id: Math.random().toString(36).slice(2), items: [], notice: n };
}

function sips(n) {
  return n === 1 ? t("1 Schluck") : t("{n} Schlucke", { n });
}

// Hinweis für Trinkregeln, bei denen die App nicht weiß, wen es trifft.
function drinkNoteHtml(text) {
  return `<p class="drink-note">${drinkEmoji()} ${text}</p>`;
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
