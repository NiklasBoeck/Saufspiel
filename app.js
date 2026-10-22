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
  if (name !== "game") document.documentElement.classList.remove("fit");
  window.scrollTo(0, 0);
}

function setGame(key) {
  currentGame = key;
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
const MENU_ORDER = ["flunky", "dealer", "busfahrer", "niewieder", "triade"];

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

$("mode-back").onclick = () => showScreen("menu");
$("mode-one").onclick = () => {
  renderPlayers();
  showScreen("players");
};
$("mode-multi").onclick = () => Room.open(currentGame);

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
    s: GAMES[key].setup([...state.players]),
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
  if (action.type === "restart") return game.setup(s.players);
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
  setGame(r.key);
  // fit: Spiel passt immer genau auf den Bildschirm, nichts scrollt.
  document.documentElement.classList.toggle("fit", !!GAMES[r.key].fit);
  const v = GAMES[r.key].view(r.s, r.me);
  const actions = v.actions.filter(canPress);
  // v.turn: wer dran ist, wenn das Spiel ohne Knöpfe gesteuert wird (Tippen im Spielfeld)
  const myTurn = r.me && (v.turn === r.me || v.actions.some((a) => a.by === r.me));
  const waitFor = v.actions.find((a) => a.by)?.by ?? v.turn;

  const root = $("game-root");
  root.innerHTML = `
    <div class="bf">
      <p class="bf-phase">${v.phase}</p>
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
  checkAlert(r.s);
  scheduleBot(r, v);
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
  showDrinkAlert(alert.items);
}

let toastTimer = null;
function showToast(alert) {
  const n = alert.notice;
  const text = n
    ? `${n.emoji ?? ""} ${n.title} ${n.text ?? ""}`
    : "🍺 " + alert.items.map((it) => `${it.who === ALL ? "Alle" : it.who} ${it.give ? "verteilt" : it.who === ALL ? "trinken" : "trinkt"}${it.n ? ` ${sips(it.n)}` : ""}`).join(", ");
  const el = $("toast");
  el.textContent = text.trim();
  el.hidden = false;
  el.classList.remove("show");
  void el.offsetWidth; // Animation neu starten
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 4500);
}

function showDrinkAlert(items) {
  $("toast").hidden = true;
  const me = run.me;
  const mine = (it) => !!me && (it.who === me || it.who === ALL);
  const drinks = items.some((it) => !it.give);
  const meDrinks = items.some((it) => !it.give && mine(it));
  const meGives = items.some((it) => it.give && mine(it));

  // Beim Trinken stoßen zwei Biergläser an, danach erscheint die Zahl der Schlucke.
  if (drinks) {
    $("da-emoji").innerHTML = `<span class="cheers"><i><b>🍺</b></i><i>🍺</i><s>✨</s></span>`;
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
  $("da-ok").textContent = "Prost! 🍻";
  $("drink-alert").hidden = false;
  $("da-ok").focus();
  vibrate(meDrinks || !me ? [300, 100, 300] : 120);
}

function hideDrinkAlert() {
  $("drink-alert").hidden = true;
}
$("da-ok").onclick = hideDrinkAlert;
$("drink-alert").onclick = (e) => e.target === $("drink-alert") && hideDrinkAlert();

renderGames();
Room.boot();
