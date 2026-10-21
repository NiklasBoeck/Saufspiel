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

function renderGames() {
  const list = $("game-list");
  Object.entries(GAMES).forEach(([key, game], i) => {
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
}

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
  if (!run.me || !a.by || a.by === run.me) return true;
  return run.host && run.offline(a.by); // der Host springt für Spieler ohne Verbindung ein
}

function playGame(r) {
  run = r;
  setGame(r.key);
  const v = GAMES[r.key].view(r.s);
  const actions = v.actions.filter(canPress);
  const myTurn = r.me && v.actions.some((a) => a.by === r.me);
  const waitFor = v.actions.find((a) => a.by)?.by;

  const root = $("game-root");
  root.innerHTML = `
    <div class="bf">
      <p class="bf-phase">${v.phase}</p>
      ${myTurn ? `<p class="your-turn">Du bist dran!</p>` : ""}
      ${v.title ? `<h2 class="bf-title">${v.title}</h2>` : ""}
      <div class="bf-body">${v.body}</div>
      <div class="bf-actions"></div>
    </div>`;
  const box = root.querySelector(".bf-actions");
  for (const a of actions) {
    const btn = document.createElement("button");
    btn.className = a.ghost ? "btn ghost" : "btn";
    btn.textContent = a.label;
    btn.onclick = () => (a.exit ? run.exit() : run.send(a.act));
    box.appendChild(btn);
  }
  if (!actions.length && v.actions.length) {
    const wait = document.createElement("p");
    wait.className = "wait";
    wait.textContent = waitFor ? `Warte auf ${waitFor}…` : "Warte…";
    box.appendChild(wait);
  }

  if (!$("screen-game").classList.contains("active")) showScreen("game");
  checkAlert(r.s);
}

$("game-back").onclick = () => run.back();

// --- Trink-Meldung ---

function checkAlert(s) {
  const alert = s.alert;
  if (!alert || alert.id === shownAlert) return;
  shownAlert = alert.id;
  showDrinkAlert(alert.items);
}

function showDrinkAlert(items) {
  const me = run.me;
  const mine = (it) => !!me && (it.who === me || it.who === ALL);
  const drinks = items.some((it) => !it.give);
  const meDrinks = items.some((it) => !it.give && mine(it));
  const meGives = items.some((it) => it.give && mine(it));

  $("da-emoji").textContent = drinks ? "🍺" : "🫵";
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
