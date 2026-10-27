const STORAGE_KEY = "saufspiel-state";

const state = load() ?? { players: [] };
let currentGame = null;
// Laufendes Spiel: { key, s, me, host, offline(name), send(action), exit(), back() }
// me = eigener Name, wenn jeder sein Handy hat (sonst null: dann darf man alles drücken).
let run = null;
let shownAlert = null;

const $ = (id) => document.getElementById(id);

function load() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Speichern ist nur Komfort, das Spiel läuft auch ohne.
  }
}

function showScreen(name) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  $(`screen-${name}`).classList.add("active");
  // Menü und Spiele passen genau auf den Bildschirm, nichts scrollt.
  if (name !== "game") document.documentElement.classList.toggle("fit", name === "menu");
  window.scrollTo(0, 0);
}

function setGame(key) {
  currentGame = key;
  document.documentElement.dataset.game = key; // für Layouts einzelner Spiele
  document.querySelectorAll(".game-title").forEach((el) => (el.textContent = GAMES[key].label));
}

function setConn(text) {
  document.querySelectorAll(".conn").forEach((el) => (el.textContent = text));
}

function vibrate(pattern) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // egal
  }
}

// --- Menü ---

// Reihenfolge im Menü. Spiele, die hier fehlen, kommen danach.
const MENU_ORDER = ["flunky", "hodenritter", "dealer", "fenster", "randvoll", "duell", "busfahrer", "niewieder", "triade"];

function renderGames() {
  const list = $("game-list");
  const rank = (key) => (MENU_ORDER.includes(key) ? MENU_ORDER.indexOf(key) : MENU_ORDER.length);
  const entries = Object.entries(GAMES).sort(([a], [b]) => rank(a) - rank(b));
  entries.forEach(([key, game], i) => {
    const tile = document.createElement("button");
    tile.className = "game-tile";
    tile.style.setProperty("--accent", game.color);
    tile.style.setProperty("--i", i);
    tile.innerHTML = `
      <span class="game-emoji">${game.emoji ?? "🎲"}</span>
      <span class="game-info">
        <span class="game-name">${escapeHtml(game.label)}</span>
        <span class="game-desc">${escapeHtml(game.description ?? "")}</span>
      </span>
      <span class="game-arrow" aria-hidden="true">›</span>`;
    tile.onclick = () => openGame(key);
    list.appendChild(tile);
  });
}

function openGame(key) {
  const game = GAMES[key];
  if (game.open) return game.open();
  setGame(key);
  showScreen("mode");
}

// --- Einstellungen ---

function renderSettingsBtn() {
  $("settings-btn").textContent = `${LEVELS[Settings.level].emoji} ⚙️`;
  $("settings-btn").title = `Stufe: ${LEVELS[Settings.level].label}`;
}

function renderLevels() {
  pickList($("level-list"), LEVELS, "level");
  pickList($("bot-level-list"), BOT_LEVELS, "bots");
}

// Kacheln zum Auswählen einer Einstellung (Settings[field])
function pickList(list, options, field) {
  list.innerHTML = "";
  for (const [key, l] of Object.entries(options)) {
    const tile = document.createElement("button");
    tile.className = `mode-tile level-tile ${key === Settings[field] ? "picked" : ""}`;
    tile.setAttribute("aria-pressed", key === Settings[field]);
    tile.innerHTML = `
      <span class="mode-emoji">${l.emoji}</span>
      <span class="game-info">
        <span class="game-name">${escapeHtml(l.label)}</span>
        <span class="game-desc">${escapeHtml(l.desc)}</span>
      </span>`;
    tile.onclick = () => {
      Settings[field] = key;
      renderLevels();
      renderSettingsBtn();
    };
    list.appendChild(tile);
  }
}

$("settings-btn").onclick = () => {
  renderLevels();
  showScreen("settings");
};
$("settings-back").onclick = () => showScreen("menu");

// --- Spielregeln: „?“ oben rechts in jedem Spiel ---

function showRules() {
  const game = GAMES[currentGame];
  $("rules-title").textContent = `So geht ${game.label}`;
  $("rules-list").replaceChildren(
    ...(game.rules ?? []).map((text) => {
      const li = document.createElement("li");
      li.textContent = text;
      return li;
    })
  );
  $("rules").hidden = false;
  $("rules-ok").focus();
}
$("rules-ok").onclick = () => ($("rules").hidden = true);
$("rules").onclick = (e) => e.target === $("rules") && ($("rules").hidden = true);

document.querySelectorAll(".screen:not(#screen-settings) .game-bar").forEach((bar) => {
  const btn = document.createElement("button");
  btn.className = "btn ghost small rules-btn";
  btn.textContent = "?";
  btn.setAttribute("aria-label", "Spielregeln");
  btn.onclick = showRules;
  bar.appendChild(btn);
});

$("mode-back").onclick = () => showScreen("menu");
$("mode-one").onclick = () => {
  renderPlayers();
  showScreen("players");
};
$("mode-multi").onclick = () => {
  // Ohne Internet geht nur ein Handy, die Räume laufen über einen Server.
  if (!navigator.onLine) return showToast({ notice: { emoji: "📵", title: "Kein Internet.", text: "Ohne Netz geht nur „Ein Handy“." } });
  Room.open(currentGame);
};

// --- Spieler (ein Handy) ---

function renderPlayers() {
  const list = $("player-list");
  list.innerHTML = "";
  state.players.forEach((name, i) => {
    const li = document.createElement("li");
    li.textContent = name;
    li.classList.toggle("bot", isBot(name));
    const remove = document.createElement("button");
    remove.textContent = "✕";
    remove.className = "remove";
    remove.setAttribute("aria-label", `${name} entfernen`);
    remove.onclick = () => {
      state.players.splice(i, 1);
      save();
      renderPlayers();
    };
    li.appendChild(remove);
    list.appendChild(li);
  });
  $("start-btn").disabled = state.players.length < 2;
  $("bot-btn").disabled = state.players.length >= 16;
  renderBotSeg($("bot-level"), state.players.some(isBot));
}

// Schalter Leicht / Mittel / Schwer, sobald Bots mitspielen
function renderBotSeg(el, show) {
  el.hidden = !show;
  if (!show) return;
  el.replaceChildren(
    ...Object.entries(BOT_LEVELS).map(([key, l]) => {
      const b = document.createElement("button");
      b.className = key === Settings.bots ? "picked" : "";
      b.setAttribute("aria-pressed", key === Settings.bots);
      b.textContent = `${l.emoji} ${l.label}`;
      b.onclick = () => {
        Settings.bots = key;
        renderBotSeg(el, true);
      };
      return b;
    })
  );
}

$("bot-btn").onclick = () => {
  state.players.push(newBotName(state.players));
  save();
  renderPlayers();
};

$("player-form").onsubmit = (e) => {
  e.preventDefault();
  const input = $("player-input");
  const name = input.value.trim();
  if (name && !state.players.includes(name)) {
    state.players.push(name);
    save();
    renderPlayers();
  }
  input.value = "";
  input.focus();
};

$("players-back").onclick = () => showScreen("mode");

$("start-btn").onclick = () => {
  const key = currentGame;
  const local = {
    key,
    s: newGame(key, [...state.players]),
    me: null,
    send(action) {
      local.s = applyAction(key, local.s, action, null);
      playGame(local);
    },
    exit: () => showScreen("menu"),
    back: () => showScreen("players"),
  };
  shownAlert = null;
  setConn("");
  playGame(local);
};

// --- Spiel läuft ---

// Eine Aktion auf den Spielstand anwenden. Beim Mehr-Handy-Spiel macht das nur der Host.
function applyAction(key, s, action, by) {
  const game = GAMES[key];
  if (action.type === "restart") return newGame(key, s.players, s.level);
  s.alert = null;
  game.act(s, action, by);
  return s;
}

function canPress(a) {
  if (a.by && isBot(a.by)) return false; // drückt der Bot selbst
  if (!run.me || !a.by || a.by === run.me) return true;
  return run.host && run.offline(a.by); // der Host springt für Spieler ohne Verbindung ein
}

function playGame(r) {
  run = r;
  playLevel = r.s.level ?? null; // Stufe kommt vom Host, damit alle dasselbe sehen
  setGame(r.key);
  // fit: Spiel passt immer genau auf den Bildschirm, nichts scrollt.
  document.documentElement.classList.toggle("fit", GAMES[r.key].fit !== false);
  const v = GAMES[r.key].view(r.s, r.me);
  const actions = v.actions.filter(canPress);
  // v.turn: wer dran ist, wenn das Spiel ohne Knöpfe gesteuert wird (Tippen im Spielfeld)
  const myTurn = r.me && (v.turn === r.me || v.actions.some((a) => a.by === r.me));
  const waitFor = v.actions.find((a) => a.by)?.by ?? v.turn;

  const root = $("game-root");
  root.innerHTML = `
    <div class="bf">
      ${v.phase ? `<p class="bf-phase">${v.phase}</p>` : ""}
      ${myTurn ? `<p class="your-turn">Du bist dran!</p>` : ""}
      ${v.title ? `<h2 class="bf-title">${v.title}</h2>` : ""}
      <div class="bf-body">${v.body}</div>
      <div class="bf-actions ${v.actionsClass ?? ""}"></div>
    </div>`;
  const box = root.querySelector(".bf-actions");
  for (const a of actions) {
    const btn = document.createElement("button");
    btn.className = a.ghost ? "btn ghost" : "btn";
    btn.textContent = a.label;
    if (a.sub) btn.insertAdjacentHTML("beforeend", `<small>${escapeHtml(a.sub)}</small>`);
    btn.disabled = !!a.disabled;
    btn.onclick = () => (a.exit ? run.exit() : run.send(a.act));
    box.appendChild(btn);
  }
  // Elemente im Spielfeld mit data-act sind antippbar (data-by: wer darf)
  root.querySelectorAll("[data-act]").forEach((el) => {
    if (!canPress({ by: el.dataset.by })) return el.removeAttribute("data-act");
    el.onclick = () => run.send(JSON.parse(el.dataset.act));
  });
  // Auf einem Handy wartet man bei v.turn nur auf Bots, alle anderen tippen ja hier.
  if (!actions.length && (v.actions.length || (v.turn && (r.me || isBot(v.turn)))) && !myTurn) {
    const wait = document.createElement("p");
    wait.className = "wait";
    wait.textContent = waitFor ? `Warte auf ${waitFor}…` : "Warte…";
    box.appendChild(wait);
  }

  if (!$("screen-game").classList.contains("active")) showScreen("game");
  // afterRender: Spiel kann nach dem Zeichnen animieren und gibt zurück, wie lange die Meldung warten soll.
  const delay = GAMES[r.key].afterRender?.(root, r.s, r.me) || 0;
  if (delay) {
    const btns = [...box.querySelectorAll("button")].filter((b) => !b.disabled);
    btns.forEach((b) => (b.disabled = true)); // erst weiter, wenn die Animation durch ist
    setTimeout(() => {
      btns.forEach((b) => (b.disabled = false));
      if (run === r) checkAlert(r.s);
    }, delay);
  }
  else checkAlert(r.s);
  scheduleBot(r, v);
  scheduleAuto(r, v);
}

// v.auto = { key, act, ms }: das Spiel macht nach kurzer Pause selbst weiter (nur wer den Spielstand hält).
// Gleicher key beim Neuzeichnen: die Pause läuft einfach weiter.
let autoTimer = null;
let autoKey = null;

function scheduleAuto(r, v) {
  const want = v.auto && (!r.me || r.host) ? v.auto.key : null;
  if (want === autoKey) return;
  clearTimeout(autoTimer);
  autoKey = want;
  if (!want) return;
  autoTimer = setTimeout(() => {
    autoKey = null;
    if (run.key === r.key && $("screen-game").classList.contains("active")) run.send(v.auto.act);
  }, v.auto.ms);
}

// --- Bots ---
// Ist ein Bot dran, drückt er nach einer kurzen Pause. Auf einem Handy wartet er, bis die
// Trink-Meldung weg ist, beim Mehr-Handy-Spiel (nur der Host lässt Bots spielen) höchstens ein paar Sekunden.

let botTimer = null;

function scheduleBot(r, v) {
  clearTimeout(botTimer);
  if (r.me && !r.host) return;
  const choices = v.actions.filter((a) => a.by && isBot(a.by) && !a.disabled && a.act);
  // Ohne Knöpfe (Tippen im Spielfeld, v.turn) sagt bot() allein, was der Bot macht.
  const name = choices[0]?.by ?? (isBot(v.turn) ? v.turn : null);
  if (!name) return;
  const mine = choices.filter((a) => a.by === name);
  const s = r.s;
  const start = Date.now();
  const tick = () => {
    if (run !== r || !$("screen-game").classList.contains("active")) return;
    const waiting = !$("drink-alert").hidden && (!r.me || Date.now() - start < 4000);
    if (waiting) {
      botTimer = setTimeout(tick, 300);
      return;
    }
    const act = GAMES[r.key].bot?.(s, name, mine.map((a) => a.act)) ?? mine[Math.floor(Math.random() * mine.length)]?.act;
    if (act) r.send(act);
  };
  botTimer = setTimeout(tick, 2900 + Math.random() * 700); // Bots lassen sich gut 3 Sekunden Zeit
}

$("game-back").onclick = () => run.back();

// --- Trink-Meldung ---

function checkAlert(s) {
  const alert = s.alert;
  if (!alert || alert.id === shownAlert) return;
  shownAlert = alert.id;
  // Meldungen ohne Trinken (z. B. „Höher!“) kommen immer nur klein, ohne Knopf.
  if (alert.notice) return showToast(alert);
  // privateAlerts: Mit mehreren Handys bekommt nur, wer trinkt, die große Meldung, alle anderen einen kleinen Hinweis.
  if (run.me && GAMES[run.key].privateAlerts && !alert.items.some((it) => it.who === run.me || it.who === ALL)) {
    return showToast(alert);
  }
  showDrinkAlert(alert.items, LEVELS[alert.level] ? alert.level : "normal");
}

let toastTimer = null;
function showToast(alert) {
  const n = alert.notice;
  const text = n
    ? `${n.emoji ?? ""} ${n.title} ${n.text ?? ""}`
    : `${alert.level === "alkoholfrei" ? "🥤" : "🍺"} ` + alert.items.map((it) => `${it.who === ALL ? "Alle" : it.who} ${it.give ? "verteilt" : it.who === ALL ? "trinken" : "trinkt"}${it.n ? ` ${sips(it.n)}` : ""}`).join(", ");
  const el = $("toast");
  el.textContent = text.trim();
  el.hidden = false;
  el.classList.remove("show");
  void el.offsetWidth; // Animation neu starten
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 4500);
}

function showDrinkAlert(items, level) {
  $("toast").hidden = true;
  const me = run.me;
  const mine = (it) => !!me && (it.who === me || it.who === ALL);
  const drinks = items.some((it) => !it.give);
  const meDrinks = items.some((it) => !it.give && mine(it));
  const meGives = items.some((it) => it.give && mine(it));

  // Beim Trinken stoßen zwei Biergläser an, danach erscheint die Zahl der Schlucke.
  const glass = level === "alkoholfrei" ? "🥤" : "🍺";
  if (drinks) {
    $("da-emoji").innerHTML = `<span class="cheers"><i><b>${glass}</b></i><i>${glass}</i><s>✨</s></span>`;
  } else {
    $("da-emoji").textContent = "🫵";
  }
  const own = items.filter((it) => !it.give && it.n && (meDrinks ? mine(it) : !me));
  const count = own.length === 1 ? own[0].n : 0;
  $("da-count").textContent = count ? sips(count) : "";
  $("da-count").hidden = !count;
  $("da-title").textContent = meDrinks
    ? "Du musst trinken!"
    : meGives
      ? "Du darfst verteilen!"
      : drinks
        ? "Trinken!"
        : "Verteilen!";

  $("da-list").replaceChildren(
    ...items.map((it) => {
      const all = it.who === ALL;
      const you = mine(it) && !all;
      const who = all ? "Alle" : you ? "Du" : it.who;
      const verb = all ? "trinken" : it.give ? (you ? "verteilst" : "verteilt") : you ? "trinkst" : "trinkt";
      const li = document.createElement("li");
      li.className = `${it.give ? "give" : ""} ${mine(it) ? "me" : ""}`;
      li.innerHTML = `<span><b>${escapeHtml(who)}</b> ${verb}${it.n ? ` <b class="da-n">${sips(it.n)}</b>` : ""}</span>${
        it.text ? `<small>${escapeHtml(it.text)}</small>` : ""
      }`;
      return li;
    })
  );
  // Bei einer anderen Stufe als Normal steht klein dabei, was gilt.
  $("da-level").textContent = level === "normal" ? "" : `${LEVELS[level].emoji} ${LEVELS[level].label}${level === "alkoholfrei" ? ": Limo, Wasser, was ihr wollt" : ""}`;
  $("da-level").hidden = level === "normal";
  $("da-ok").textContent = level === "alkoholfrei" ? "Prost! 🥤" : "Prost! 🍻";
  $("drink-alert").hidden = false;
  $("da-ok").focus();
  vibrate(meDrinks || !me ? [300, 100, 300] : 120);
}

function hideDrinkAlert() {
  $("drink-alert").hidden = true;
}
$("da-ok").onclick = hideDrinkAlert;
$("drink-alert").onclick = (e) => e.target === $("drink-alert") && hideDrinkAlert();

// --- Bildschirmgröße ---
// Beim Drehen oder Auf-/Zuklappen (Klapphandy) passt sich alles per CSS an. Ändert sich das Format
// deutlich (hoch ↔ quer, klein ↔ groß), blendet der Bildschirm kurz sanft über, statt zu springen.
let screenShape = null;
let reflowTimer = null;

function shapeOf() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  return `${w > h * 1.2 ? "quer" : "hoch"}-${Math.min(w, h) >= 600 ? "gross" : "klein"}`;
}

function onScreenSize() {
  const shape = shapeOf();
  if (screenShape && shape !== screenShape) {
    const html = document.documentElement;
    html.classList.remove("reflow");
    void html.offsetWidth; // Animation neu starten
    html.classList.add("reflow");
    clearTimeout(reflowTimer);
    reflowTimer = setTimeout(() => html.classList.remove("reflow"), 450);
  }
  screenShape = shape;
}

screenShape = shapeOf();
window.addEventListener("resize", onScreenSize);
screen.orientation?.addEventListener?.("change", onScreenSize);

renderGames();
renderSettingsBtn();
Room.boot();
