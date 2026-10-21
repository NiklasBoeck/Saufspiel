const STORAGE_KEY = "saufspiel-state";

const state = load() ?? { players: [] };
let currentGame = null;
let deck = [];
let round = 0;

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
}

// --- Menü ---

function renderGames() {
  const list = $("game-list");
  for (const [key, game] of Object.entries(GAMES)) {
    const tile = document.createElement("button");
    tile.className = "game-tile";
    tile.style.setProperty("--accent", game.color);
    tile.textContent = game.label;
    tile.onclick = () => openGame(key);
    list.appendChild(tile);
  }
}

function openGame(key) {
  currentGame = key;
  $("players-title").textContent = GAMES[key].label;
  renderPlayers();
  showScreen("players");
}

// --- Spieler ---

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

// --- Spiel ---

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function fillPlayers(text) {
  const [p, p2] = shuffle([...state.players]);
  return text.replaceAll("{p}", p).replaceAll("{p2}", p2);
}

function nextCard() {
  const game = GAMES[currentGame];
  if (deck.length === 0) deck = shuffle([...game.cards]);
  round++;
  $("round-label").textContent = `Karte ${round}`;
  $("card-category").textContent = game.label;
  $("card").style.setProperty("--accent", game.color);
  $("card-text").textContent = fillPlayers(deck.pop());
}

$("start-btn").onclick = () => {
  deck = [];
  round = 0;
  nextCard();
  showScreen("game");
};
$("next-btn").onclick = nextCard;
$("card").onclick = nextCard;
document.querySelectorAll(".back-btn").forEach((btn) => {
  btn.onclick = () => showScreen(btn.closest("#screen-game") ? "players" : "menu");
});

renderGames();
