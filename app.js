const STORAGE_KEY = "saufspiel-state";

const state = load() ?? {
  players: [],
  categories: Object.keys(CATEGORIES),
};
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

// --- Setup ---

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
  updateStartButton();
}

function renderCategories() {
  const box = $("category-select");
  for (const [key, cat] of Object.entries(CATEGORIES)) {
    const label = document.createElement("label");
    const box_ = document.createElement("input");
    box_.type = "checkbox";
    box_.checked = state.categories.includes(key);
    box_.onchange = () => {
      state.categories = box_.checked
        ? [...state.categories, key]
        : state.categories.filter((c) => c !== key);
      save();
      updateStartButton();
    };
    label.append(box_, ` ${cat.label}`);
    box.appendChild(label);
  }
}

function updateStartButton() {
  $("start-btn").disabled = state.players.length < 2 || state.categories.length === 0;
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

function buildDeck() {
  const cards = state.categories.flatMap((key) =>
    CATEGORIES[key].cards.map((text) => ({ key, text }))
  );
  return shuffle(cards);
}

function fillPlayers(text) {
  const [p, p2] = shuffle([...state.players]);
  return text.replaceAll("{p}", p).replaceAll("{p2}", p2);
}

function nextCard() {
  if (deck.length === 0) deck = buildDeck();
  const { key, text } = deck.pop();
  const cat = CATEGORIES[key];
  round++;
  $("round-label").textContent = `Karte ${round}`;
  $("card-category").textContent = cat.label;
  $("card").style.setProperty("--accent", cat.color);
  $("card-text").textContent = fillPlayers(text);
}

$("start-btn").onclick = () => {
  deck = buildDeck();
  round = 0;
  nextCard();
  showScreen("game");
};
$("next-btn").onclick = nextCard;
$("card").onclick = nextCard;
$("back-btn").onclick = () => showScreen("setup");

renderPlayers();
renderCategories();
