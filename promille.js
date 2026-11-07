// Promille-Rechner: Profil (Gewicht, Größe, Alter, Körperbau), Getränke-Tagebuch, geschätzte Promille über die Zeit.
// Rechnung: Widmark mit Körperwasser nach Watson, 10 % Resorptionsdefizit, jedes Getränk geht über 30 Minuten
// ins Blut, Abbau 0,15 ‰ pro Stunde. Alles bleibt auf dem Handy (localStorage).
// Nur eine grobe Schätzung. Das steht auch groß im Bildschirm.
const Promille = (() => {
  const KEY = "saufspiel-promille";
  const MIN = 60 * 1000;
  const HOUR = 60 * MIN;
  const ABSORB = 30 * MIN; // so lange braucht ein Getränk ungefähr, bis es im Blut ist
  const ELIM = 0.15 / HOUR; // Abbau in ‰ pro ms
  const DEFICIT = 0.1; // Resorptionsdefizit
  const KEEP = 48 * HOUR; // ältere Einträge fliegen raus
  const STEP = MIN;

  // Getränke zum Antippen: ml, Volumenprozent und wie lange man ungefähr dran trinkt (Minuten).
  // Die eingetragene Zeit ist, wann das Glas leer war; getrunken wurde in den dur Minuten davor.
  const PRESETS = [
    { id: "bier5", name: "Bier 0,5 l", emoji: "🍺", ml: 500, pct: 5, dur: 15 },
    { id: "bier33", name: "Bier 0,33 l", emoji: "🍺", ml: 330, pct: 5, dur: 10 },
    { id: "mass", name: "Maß 1 l", emoji: "🍻", ml: 1000, pct: 5.8, dur: 30 },
    { id: "radler", name: "Radler 0,5 l", emoji: "🍋", ml: 500, pct: 2.5, dur: 15 },
    { id: "wein", name: "Wein 0,2 l", emoji: "🍷", ml: 200, pct: 12, dur: 20 },
    { id: "sekt", name: "Sekt 0,1 l", emoji: "🥂", ml: 100, pct: 11, dur: 10 },
    { id: "schnaps", name: "Schnaps 2 cl", emoji: "🥃", ml: 20, pct: 40, dur: 0 },
    { id: "longdrink", name: "Longdrink (4 cl)", emoji: "🧉", ml: 300, pct: 5.3, dur: 15 },
    { id: "cocktail", name: "Cocktail", emoji: "🍹", ml: 300, pct: 10, dur: 15 },
  ];

  const $ = (id) => document.getElementById(id);
  const esc = escapeHtml;

  let data = load();
  let pick = PRESETS[0].id;
  let when = 0; // Minuten zurück, null = eigene Uhrzeit
  let customTime = "";
  let editing = null; // id des Eintrags, dessen Uhrzeit gerade geändert wird
  let editProfile = false;
  let timer = null;
  let openNight = null; // aufgeklappter Abend im Archiv

  function load() {
    try {
      const d = JSON.parse(localStorage.getItem(KEY));
      if (d && typeof d === "object")
        return {
          profile: d.profile || null,
          drinks: Array.isArray(d.drinks) ? d.drinks : [],
          mine: Array.isArray(d.mine) ? d.mine : [],
          nights: Array.isArray(d.nights) ? d.nights : [],
        };
    } catch {
      // kaputt oder nicht erlaubt, dann leer
    }
    return { profile: null, drinks: [], mine: [], nights: [] };
  }
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch {
      // ohne Speicher geht es trotzdem, nur nicht nach dem Neuladen
    }
  }

  // --- Rechnung ---

  // Körperwasser in Litern nach Watson
  function bodyWater(p) {
    if (p.sex === "w") return -2.097 + 0.1069 * p.height + 0.2466 * p.weight;
    return 2.447 - 0.09516 * p.age + 0.1074 * p.height + 0.3362 * p.weight;
  }
  // Trinkdauer schätzen, wenn keine da ist: Shots sofort, sonst etwa 15 Minuten pro halben Liter
  const durFor = (ml) => (ml <= 50 ? 0 : Math.max(5, Math.min(45, Math.round((ml / 500) * 15))));
  const durOf = (d) => (Number.isFinite(d.dur) ? d.dur : durFor(d.ml));
  const grams = (d) => d.ml * (d.pct / 100) * 0.789;
  // So viel ‰ bringt ein Getränk, wenn es ganz im Blut ist
  const peakOf = (d, tbw) => (grams(d) * (1 - DEFICIT) * 0.8) / (1.055 * tbw);

  // Verlauf von der ersten Getränkezeit bis wieder 0 (oder mindestens bis jetzt)
  function simulate(now, list = data.drinks, p = data.profile) {
    const drinks = list.slice().sort((a, b) => a.t - b.t);
    if (!p || !drinks.length) return null;
    const tbw = Math.max(bodyWater(p), 10);
    const peaks = drinks.map((d) => peakOf(d, tbw));
    // Jedes Getränk in Minuten-Schlucke über die Trinkdauer aufteilen
    const sips = drinks.map((d) => {
      const n = Math.max(1, Math.round(durOf(d)));
      const from = d.t - durOf(d) * MIN;
      return durOf(d) > 0 ? Array.from({ length: n }, (_, k) => from + ((k + 0.5) / n) * (d.t - from)) : [d.t];
    });
    const first = Math.min(...sips.map((x) => x[0]));
    const start = Math.floor(first / STEP) * STEP;
    const lastIn = Math.max(...drinks.map((d) => d.t)) + ABSORB;
    const pts = [];
    let bac = 0;
    let before = 0;
    for (let t = start; ; t += STEP) {
      let absorbed = 0;
      for (let i = 0; i < drinks.length; i++) {
        let sum = 0;
        for (const at of sips[i]) {
          const f = (t - at) / ABSORB;
          if (f > 0) sum += Math.min(1, f);
        }
        absorbed += (peaks[i] * sum) / sips[i].length;
      }
      bac = Math.max(0, bac + absorbed - before - ELIM * STEP);
      before = absorbed;
      pts.push([t, bac]);
      if (t >= now && t >= lastIn && bac <= 0) break;
      if (pts.length > 4 * 24 * 60) break; // Sicherung
    }
    return { pts, tbw };
  }

  // Den letzten „Abend“ heraussuchen: ab dem letzten Mal, wo es vor einem Getränk wieder 0 war
  function episode(sim) {
    const pts = sim.pts;
    let from = 0;
    for (let i = 1; i < pts.length; i++) if (pts[i - 1][1] <= 0 && pts[i][1] > 0) from = i - 1;
    return pts.slice(from);
  }

  function valueAt(pts, now) {
    if (!pts.length || now < pts[0][0]) return 0;
    const i = Math.min(pts.length - 1, Math.round((now - pts[0][0]) / STEP));
    return pts[i][1];
  }

  // --- Anzeige-Helfer ---

  const locale = () => (typeof LANG !== "undefined" && LANG === "en" ? "en-GB" : "de-DE");
  const fmt = (v, digits = 2) => v.toLocaleString(locale(), { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const clock = (ms) => new Date(ms).toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" });
  const dayLabel = (ms) => {
    const d = new Date(ms);
    const today = new Date();
    const y = new Date(today);
    y.setDate(today.getDate() - 1);
    const tm = new Date(today);
    tm.setDate(today.getDate() + 1);
    if (d.toDateString() === today.toDateString()) return "";
    if (d.toDateString() === y.toDateString()) return t("gestern");
    if (d.toDateString() === tm.toDateString()) return t("morgen");
    return d.toLocaleDateString(locale(), { weekday: "short" });
  };
  const timeLabel = (ms) => [dayLabel(ms), clock(ms)].filter(Boolean).join(" ");

  function status(v) {
    if (v <= 0.005) return { cls: "ok", text: t("Laut Schätzung nüchtern.") };
    if (v < 0.3) return { cls: "low", text: t("Leicht angetrunken. Schon jetzt reagierst du langsamer.") };
    if (v < 0.8) return { cls: "mid", text: t("Angetrunken. Reaktion und Urteil sind deutlich schlechter.") };
    if (v < 1.5) return { cls: "high", text: t("Betrunken. Zeit für Wasser und eine Pause.") };
    if (v < 2.5) return { cls: "high", text: t("Stark betrunken. Hör auf zu trinken und trink Wasser.") };
    return { cls: "danger", text: t("Gefährlich viel. Hör sofort auf und lass jemanden bei dir bleiben. Notfall: 112.") };
  }

  // Zeit aus „vor X Minuten“ oder eigener Uhrzeit. Liegt die Uhrzeit in der Zukunft, war es gestern.
  function timeFromInput(minsAgo, hhmm, base = Date.now()) {
    if (minsAgo !== null) return base - minsAgo * MIN;
    const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || "");
    if (!m) return base;
    const d = new Date(base);
    d.setHours(+m[1], +m[2], 0, 0);
    if (d.getTime() > base + MIN) d.setDate(d.getDate() - 1);
    return d.getTime();
  }
  const hhmmOf = (ms) => {
    const d = new Date(ms);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  // --- Bildschirm ---

  const screen = document.createElement("section");
  screen.id = "screen-promille";
  screen.className = "screen";
  screen.innerHTML = `
    <header class="game-bar">
      <button id="pm-back" class="btn ghost small" aria-label="Zurück">←</button>
      <span class="game-name pm-title"></span>
      <span class="bar-spacer"></span>
    </header>
    <div id="pm-root" class="pm-root"></div>`;
  $("app").appendChild(screen);
  screen.querySelector("#pm-back").onclick = () => {
    stopTimer();
    showScreen("menu");
  };

  function open() {
    data = load();
    prune();
    editProfile = !data.profile;
    editing = null;
    if (typeof setGame === "function") setGame("promille"); // damit „?“ die Erklärung zeigt
    render();
    showScreen("promille");
    stopTimer();
    timer = setInterval(() => {
      if (!screen.classList.contains("active")) return stopTimer();
      // Nicht neu zeichnen, während jemand gerade etwas eintippt
      if (screen.contains(document.activeElement) && document.activeElement.matches("input, select")) return;
      render();
    }, 30 * 1000);
  }
  function stopTimer() {
    clearInterval(timer);
    timer = null;
  }

  // --- Vergangene Abende ---

  // Zusammenfassung eines Abends, wird mit den Getränken gespeichert
  function makeNight(drinks) {
    const list = drinks.slice().sort((a, b) => a.t - b.t);
    const sim = simulate(0, list);
    let peak = 0;
    let peakAt = list[0].t;
    for (const [tm, v] of sim ? sim.pts : []) if (v > peak) [peak, peakAt] = [v, tm];
    const pts = sim ? sim.pts : [];
    return {
      id: `n${list[0].t.toString(36)}`,
      start: pts.length ? pts[0][0] : list[0].t,
      end: pts.length ? pts[pts.length - 1][0] : list[list.length - 1].t,
      peak,
      peakAt,
      grams: list.reduce((g, d) => g + grams(d), 0),
      profile: { ...data.profile },
      drinks: list,
    };
  }

  function archive(drinks, name = "") {
    if (!drinks.length || !data.profile) return;
    const ids = new Set(drinks.map((d) => d.id));
    data.drinks = data.drinks.filter((d) => !ids.has(d.id));
    const n = { ...makeNight(drinks), name };
    data.nights = [n, ...data.nights.filter((x) => x.id !== n.id)].sort((a, b) => b.start - a.start).slice(0, 300);
  }

  // Abende, die vorbei sind (seit über 3 Stunden wieder 0 ‰), landen von selbst im Archiv
  function autoArchive() {
    const now = Date.now();
    const sim = simulate(now);
    if (!sim) return;
    const pts = sim.pts;
    const drinks = data.drinks.slice().sort((a, b) => a.t - b.t);
    const zeros = [];
    for (let i = 1; i < pts.length; i++) if (pts[i - 1][1] > 0 && pts[i][1] <= 0) zeros.push(pts[i][0]);
    const startOf = (d) => d.t - durOf(d) * MIN;
    let group = [];
    let changed = false;
    const close = (end) => {
      if (group.length && end < now - 3 * HOUR) {
        archive(group);
        changed = true;
      }
      group = [];
    };
    for (const d of drinks) {
      const last = group[group.length - 1];
      if (last) {
        const z = zeros.find((x) => x > last.t);
        if (z && z <= startOf(d) - 3 * HOUR) close(z);
        else if (z && z <= startOf(d)) {
          // kurz bei 0, dann weiter: gehört noch zum selben Abend
        }
      }
      group.push(d);
    }
    const last = group[group.length - 1];
    const z = last && zeros.find((x) => x > last.t);
    if (z) close(z);
    if (changed) save();
  }

  function prune() {
    autoArchive();
    // Sicherung: was ohne Profil liegen bleibt, fliegt nach 48 Stunden raus
    const now = Date.now();
    const before = data.drinks.length;
    data.drinks = data.drinks.filter((d) => now - d.t < KEEP || data.profile);
    if (data.drinks.length !== before) save();
  }

  function render() {
    screen.querySelector(".pm-title").textContent = t("Promille-Rechner");
    screen.querySelector("#pm-back").setAttribute("aria-label", t("Zurück"));
    const root = $("pm-root");
    root.innerHTML = editProfile ? profileHtml() : mainHtml();
    if (editProfile) bindProfile(root);
    else bindMain(root);
  }

  const disclaimer = () =>
    `<p class="pm-warn"><b>${esc(t("Nur eine grobe Schätzung."))}</b> ${esc(t("Der echte Wert kann deutlich höher sein (Essen, Medikamente, Müdigkeit). Entscheide danach nie, ob du fährst: Wer getrunken hat, fährt nicht."))}</p>`;

  function profileHtml() {
    const p = data.profile || { weight: "", height: "", age: "", sex: "" };
    const sexBtn = (v, label) => `<button type="button" class="pm-seg-btn ${p.sex === v ? "picked" : ""}" data-sex="${v}" aria-pressed="${p.sex === v}">${esc(t(label))}</button>`;
    return `
      <div class="pm-card">
        <h2 class="pm-h">${esc(t(data.profile ? "Deine Angaben" : "Erst ein paar Angaben"))}</h2>
        <p class="pm-muted">${esc(t("Damit die Rechnung ungefähr passt. Bleibt nur auf diesem Handy."))}</p>
        <form id="pm-profile" class="pm-form" autocomplete="off" novalidate>
          <label class="pm-field"><span>${esc(t("Gewicht"))}</span><span class="pm-unit"><input name="weight" type="number" inputmode="decimal" min="35" max="250" step="0.5" value="${esc(String(p.weight))}" required><i>kg</i></span></label>
          <label class="pm-field"><span>${esc(t("Größe"))}</span><span class="pm-unit"><input name="height" type="number" inputmode="numeric" min="120" max="230" value="${esc(String(p.height))}" required><i>cm</i></span></label>
          <label class="pm-field"><span>${esc(t("Alter"))}</span><span class="pm-unit"><input name="age" type="number" inputmode="numeric" min="16" max="110" value="${esc(String(p.age))}" required><i>${esc(t("Jahre"))}</i></span></label>
          <div class="pm-field"><span>${esc(t("Körperbau"))}</span>
            <div class="pm-seg" role="group">${sexBtn("m", "männlich")}${sexBtn("w", "weiblich")}</div>
          </div>
          <p class="pm-muted small-text">${esc(t("Männer und Frauen haben im Schnitt unterschiedlich viel Körperwasser, deshalb fragt die Formel danach."))}</p>
          <p id="pm-perr" class="error" hidden></p>
          <button class="btn" type="submit">${esc(t(data.profile ? "Speichern" : "Weiter"))}</button>
          ${data.profile ? `<button class="btn ghost" type="button" id="pm-pcancel">${esc(t("Abbrechen"))}</button>` : ""}
        </form>
      </div>
      ${disclaimer()}`;
  }

  function bindProfile(root) {
    const form = root.querySelector("#pm-profile");
    let sex = data.profile?.sex || "";
    form.querySelectorAll("[data-sex]").forEach(
      (b) =>
        (b.onclick = () => {
          sex = b.dataset.sex;
          form.querySelectorAll("[data-sex]").forEach((x) => {
            x.classList.toggle("picked", x === b);
            x.setAttribute("aria-pressed", x === b);
          });
        }),
    );
    const cancel = root.querySelector("#pm-pcancel");
    if (cancel) cancel.onclick = () => ((editProfile = false), render());
    form.onsubmit = (e) => {
      e.preventDefault();
      const num = (n) => parseFloat(String(form.elements[n].value).replace(",", "."));
      const weight = num("weight");
      const height = num("height");
      const age = num("age");
      const err = root.querySelector("#pm-perr");
      let msg = "";
      if (!(weight >= 35 && weight <= 250)) msg = t("Bitte ein Gewicht zwischen 35 und 250 kg eintragen.");
      else if (!(height >= 120 && height <= 230)) msg = t("Bitte eine Größe zwischen 120 und 230 cm eintragen.");
      else if (!(age >= 16 && age <= 110)) msg = t("Bitte dein Alter eintragen.");
      else if (!sex) msg = t("Bitte männlich oder weiblich wählen.");
      if (msg) {
        err.textContent = msg;
        err.hidden = false;
        return;
      }
      data.profile = { weight, height, age: Math.round(age), sex };
      save();
      editProfile = false;
      render();
    };
  }

  function chartSvg(pts, now, drinks = data.drinks, showNow = true) {
    const W = 340;
    const H = 150;
    const L = 30;
    const R = 8;
    const T = 10;
    const B = 22;
    const t0 = pts[0][0];
    const t1 = Math.max(pts[pts.length - 1][0], now, t0 + HOUR);
    const top = Math.max(0.5, Math.ceil(Math.max(...pts.map((p) => p[1])) * 2 + 0.2) / 2);
    const x = (tm) => L + ((tm - t0) / (t1 - t0)) * (W - L - R);
    const y = (v) => T + (1 - v / top) * (H - T - B);
    // nicht jeden Minutenpunkt zeichnen
    const every = Math.max(1, Math.floor(pts.length / 160));
    const line = pts.filter((_, i) => i % every === 0 || i === pts.length - 1).map((p) => `${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`);
    const past = pts.filter((p) => p[0] <= now);
    const pastLine = past.filter((_, i) => i % every === 0 || i === past.length - 1).map((p) => `${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`);
    if (past.length) pastLine.push(`${x(now).toFixed(1)},${y(valueAt(pts, now)).toFixed(1)}`);
    // Stunden-Striche
    const ticks = [];
    const span = t1 - t0;
    const stepH = span > 12 * HOUR ? 4 : span > 6 * HOUR ? 2 : 1;
    const first = new Date(t0);
    first.setMinutes(0, 0, 0);
    for (let tm = first.getTime() + HOUR; tm < t1; tm += HOUR) {
      if (new Date(tm).getHours() % stepH) continue;
      ticks.push(`<line x1="${x(tm)}" x2="${x(tm)}" y1="${T}" y2="${H - B}" class="pm-grid"/><text x="${x(tm)}" y="${H - 6}" text-anchor="middle">${clock(tm).replace(/:00$/, "")}</text>`);
    }
    const ys = [];
    for (let v = 0; v <= top + 1e-9; v += top > 2 ? 1 : 0.5) ys.push(`<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="pm-grid"/><text x="${L - 5}" y="${y(v) + 3.5}" text-anchor="end">${fmt(v, 1)}</text>`);
    const nowV = valueAt(pts, now);
    return `<svg class="pm-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t("Promille über die Zeit"))}">
      ${ys.join("")}${ticks.join("")}
      <polygon class="pm-area" points="${x(t0)},${y(0)} ${line.join(" ")} ${x(pts[pts.length - 1][0])},${y(0)}"/>
      <polyline class="pm-future" points="${line.join(" ")}"/>
      ${pastLine.length > 1 ? `<polyline class="pm-line" points="${pastLine.join(" ")}"/>` : ""}
      ${drinks.filter((d) => d.t >= t0).map((d) => `<circle class="pm-dot" cx="${x(d.t)}" cy="${H - B}" r="3"/>`).join("")}
      ${showNow && now <= t1 ? `<line class="pm-now" x1="${x(now)}" x2="${x(now)}" y1="${T}" y2="${H - B}"/><circle class="pm-nowdot" cx="${x(now)}" cy="${y(nowV)}" r="4.5"/>` : ""}
    </svg>`;
  }

  function drinkOptions() {
    const all = [...PRESETS, ...data.mine.map((d) => ({ ...d, emoji: "⭐" }))];
    if (!all.some((d) => d.id === pick) && pick !== "custom") pick = PRESETS[0].id;
    return (
      all
        .map(
          (d) => `<button type="button" class="pm-drink ${pick === d.id ? "picked" : ""}" data-pick="${esc(d.id)}" aria-pressed="${pick === d.id}">
            <span class="pm-de">${d.emoji}</span><span class="pm-dn">${esc(PRESETS.includes(d) ? t(d.name) : d.name)}</span><small>${esc(fmt(d.ml >= 1000 ? d.ml / 1000 : d.ml, d.ml >= 1000 ? 1 : 0))} ${d.ml >= 1000 ? "l" : "ml"} · ${esc(fmt(d.pct, d.pct % 1 ? 1 : 0))} %</small><small class="pm-ddur">${esc(durOf(d) ? t("ca. {m} Min", { m: durOf(d) }) : t("auf ex"))}</small>
          </button>`,
        )
        .join("") +
      `<button type="button" class="pm-drink ${pick === "custom" ? "picked" : ""}" data-pick="custom" aria-pressed="${pick === "custom"}"><span class="pm-de">✏️</span><span class="pm-dn">${esc(t("Eigenes"))}</span><small>${esc(t("Menge und %"))}</small></button>`
    );
  }

  function mainHtml() {
    const now = Date.now();
    const sim = simulate(now);
    const pts = sim ? episode(sim) : [];
    const v = pts.length ? valueAt(pts, now) : 0;
    const st = status(v);
    const peakPt = pts.reduce((m, p) => (p[1] > m[1] ? p : m), [now, 0]);
    const sober = pts.length && pts[pts.length - 1][1] <= 0 ? pts[pts.length - 1][0] : null;
    const shown = pts.length ? data.drinks.filter((d) => d.t >= pts[0][0] - MIN).sort((a, b) => b.t - a.t) : [];
    const older = data.drinks.length - shown.length;
    const p = data.profile;
    const whenBtn = (m, label) => `<button type="button" class="pm-chip ${when === m ? "picked" : ""}" data-when="${m}">${esc(t(label))}</button>`;

    const rising = peakPt[1] > 0.005 && peakPt[0] > now + MIN;

    return `
      <div class="pm-now-card pm-${st.cls}">
        <div class="pm-big"><b>${fmt(v)}</b><span>‰</span></div>
        <p class="pm-status">${esc(st.text)}</p>
        ${rising ? `<p class="pm-sub">${esc(t("Steigt noch bis ca. {v} ‰ um {time}.", { v: fmt(peakPt[1]), time: clock(peakPt[0]) }))}</p>` : ""}
        ${(v > 0.005 || rising) && sober ? `<p class="pm-sub">${esc(t("Wieder bei 0 ‰: ca. {time}", { time: timeLabel(sober) }))}</p>` : ""}
        ${pts.length > 1 ? chartSvg(pts, now) : `<p class="pm-muted">${esc(t("Trag unten ein, was du trinkst. Dann siehst du hier die Kurve."))}</p>`}
        <p class="pm-warn-short">⚠️ ${esc(t("Nur eine Schätzung. Nicht fahren!"))}</p>
      </div>

      <div class="pm-card pm-add">
        <h2 class="pm-h">${esc(t("Was hast du getrunken?"))}</h2>
        <div class="pm-drinks">${drinkOptions()}</div>
        <div class="pm-custom" ${pick === "custom" ? "" : "hidden"}>
          <label class="pm-field"><span>${esc(t("Name"))}</span><input id="pm-cname" type="text" maxlength="24" placeholder="${esc(t("z. B. Aperol Spritz"))}"></label>
          <div class="pm-row">
            <label class="pm-field"><span>${esc(t("Menge"))}</span><span class="pm-unit"><input id="pm-cml" type="number" inputmode="numeric" min="1" max="3000" placeholder="200"><i>ml</i></span></label>
            <label class="pm-field"><span>${esc(t("Alkohol"))}</span><span class="pm-unit"><input id="pm-cpct" type="text" inputmode="decimal" placeholder="8"><i>%</i></span></label>
          </div>
          <label class="pm-field"><span>${esc(t("Wie lange hast du daran getrunken?"))}</span><span class="pm-unit"><input id="pm-cdur" type="number" inputmode="numeric" min="0" max="180" placeholder="${esc(t("automatisch"))}"><i>Min</i></span></label>
        </div>
        <h3 class="pm-h3">${esc(t("Wann war das Glas leer?"))}</h3>
        <p class="pm-muted small-text">${esc(t("Wie lange du daran getrunken hast, rechnet die App mit (zum Beispiel ein Bier 0,5 l ca. 15 Minuten)."))}</p>
        <div class="pm-when">
          ${whenBtn(0, "Gerade ausgetrunken")}${whenBtn(15, "vor 15 Min")}${whenBtn(30, "vor 30 Min")}${whenBtn(60, "vor 1 Std")}
          <label class="pm-chip pm-timechip ${when === null ? "picked" : ""}"><span>${esc(t("Uhrzeit"))}</span><input id="pm-time" type="time" value="${esc(customTime || hhmmOf(now))}"></label>
        </div>
        <p id="pm-err" class="error" hidden></p>
        <button id="pm-add" class="btn">${esc(t("Eintragen"))}</button>
      </div>

      ${
        shown.length
          ? `<div class="pm-card">
        <h2 class="pm-h">${esc(t("Getrunken"))} <small>${shown.length}</small></h2>
        <ul class="pm-list">${shown.map((d) => entryHtml(d)).join("")}</ul>
        ${older > 0 ? `<p class="pm-muted small-text">${esc(older === 1 ? t("Dazu ein älterer Eintrag, der nicht mehr zählt.") : t("Dazu {n} ältere Einträge, die nicht mehr zählen.", { n: older }))}</p>` : ""}
        <button id="pm-clear" class="btn ghost small">💾 ${esc(t("Abend speichern und neu anfangen"))}</button>
      </div>`
          : ""
      }

      ${nightsHtml()}

      <div class="pm-card pm-me">
        <span>${esc(`${fmt(p.weight, p.weight % 1 ? 1 : 0)} kg · ${p.height} cm · ${p.age} ${t("Jahre")} · ${t(p.sex === "w" ? "weiblich" : "männlich")}`)}</span>
        <button id="pm-editp" class="btn ghost small">${esc(t("Ändern"))}</button>
      </div>
      ${disclaimer()}`;
  }

  const dateLabel = (ms) => new Date(ms).toLocaleDateString(locale(), { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });

  function nightsHtml() {
    if (!data.nights.length) return "";
    const row = (n) => {
      const isOpen = openNight === n.id;
      const head = `<button class="pm-night-head" data-night="${esc(n.id)}" aria-expanded="${isOpen}">
          <span class="pm-en"><b>${esc(n.name || dateLabel(n.start))}</b><small>${esc(`${n.name ? `${dateLabel(n.start)} · ` : ""}${t("{n} Getränke", { n: n.drinks.length })}`)}</small></span>
          <span class="pm-night-peak">${esc(fmt(n.peak))} ‰</span><span class="pm-night-arrow" aria-hidden="true">${isOpen ? "▾" : "▸"}</span>
        </button>`;
      if (!isOpen) return `<li class="pm-night">${head}</li>`;
      const sim = simulate(0, n.drinks, n.profile);
      const rows = n.drinks
        .slice()
        .sort((a, b) => a.t - b.t)
        .map(
          (d) => `<tr><td>${esc(clock(d.t))}</td><td>${esc(d.name)}</td><td>${esc(fmt(d.ml, 0))} ml</td><td>${esc(fmt(d.pct, d.pct % 1 ? 1 : 0))} %</td><td>${esc(fmt(grams(d), 0))} g</td></tr>`,
        )
        .join("");
      return `<li class="pm-night open">${head}
        <div class="pm-night-body">
          ${sim && sim.pts.length > 1 ? chartSvg(sim.pts, sim.pts[sim.pts.length - 1][0], n.drinks, false) : ""}
          <div class="pm-counts">${counts(n.drinks)}</div>
          <div class="pm-facts">
            <p><span>${esc(t("Getränke"))}</span><b>${n.drinks.length}</b></p>
            <p><span>${esc(t("Zeit"))}</span><b>${esc(`${clock(n.start)} – ${timeLabelFrom(n.end, n.start)}`)}</b></p>
            <p><span>${esc(t("Höchster Wert"))}</span><b>${esc(fmt(n.peak))} ‰ ${esc(t("um {time}", { time: clock(n.peakAt) }))}</b></p>
            <p><span>${esc(t("Alkohol gesamt"))}</span><b>${esc(fmt(n.grams, 0))} g</b></p>
          </div>
          <div class="pm-table-wrap"><table class="pm-table">
            <thead><tr><th>${esc(t("Leer um"))}</th><th>${esc(t("Getränk"))}</th><th>${esc(t("Menge"))}</th><th>%</th><th>${esc(t("Alkohol"))}</th></tr></thead>
            <tbody>${rows}</tbody>
          </table></div>
          <div class="pm-night-btns">
            <button class="btn ghost small" data-rename="${esc(n.id)}">✏️ ${esc(t("Umbenennen"))}</button>
            <button class="btn ghost small pm-night-del" data-del="${esc(n.id)}">${esc(t("Abend löschen"))}</button>
          </div>
        </div>
      </li>`;
    };
    const total = data.nights.length;
    return `<div class="pm-card pm-nights">
        <h2 class="pm-h">${esc(t("Vergangene Abende"))} <small>${total}</small></h2>
        <ul class="pm-night-list">${data.nights.map(row).join("")}</ul>
      </div>`;
  }

  // „3× Bier 0,5 l“ usw.
  function counts(drinks) {
    const m = new Map();
    for (const d of drinks) m.set(d.name, (m.get(d.name) || 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]).map(([name, c]) => `<span class="pm-count"><b>${c}×</b> ${esc(name)}</span>`).join("");
  }

  // Uhrzeit, mit „nächster Tag“, wenn der Abend über Mitternacht ging
  function timeLabelFrom(ms, from) {
    const next = new Date(ms).toDateString() !== new Date(from).toDateString();
    return next ? `${clock(ms)} (${t("am nächsten Tag")})` : clock(ms);
  }

  function entryHtml(d) {
    const g = grams(d);
    if (editing === d.id)
      return `<li class="pm-entry editing" data-id="${esc(d.id)}">
        <span class="pm-en"><b>${esc(d.name)}</b><small>${esc(t("Wann war das?"))}</small></span>
        <input class="pm-etime" type="time" value="${hhmmOf(d.t)}" aria-label="${esc(t("Uhrzeit"))}">
        <button class="btn small pm-esave">${esc(t("OK"))}</button>
      </li>`;
    return `<li class="pm-entry" data-id="${esc(d.id)}">
      <button class="pm-etime-btn" title="${esc(t("Uhrzeit ändern"))}">${esc(timeLabel(d.t))}</button>
      <span class="pm-en"><b>${esc(d.name)}</b><small>${esc(fmt(g, 0))} g ${esc(t("Alkohol"))}${durOf(d) ? ` · ${esc(t("{m} Min getrunken", { m: durOf(d) }))}` : ""}</small></span>
      <button class="pm-del" aria-label="${esc(t("Löschen"))}">×</button>
    </li>`;
  }

  function bindMain(root) {
    root.querySelectorAll("[data-pick]").forEach(
      (b) =>
        (b.onclick = () => {
          pick = b.dataset.pick;
          root.querySelectorAll("[data-pick]").forEach((x) => {
            x.classList.toggle("picked", x === b);
            x.setAttribute("aria-pressed", x === b);
          });
          root.querySelector(".pm-custom").hidden = pick !== "custom";
          if (pick === "custom") root.querySelector("#pm-cname").focus();
        }),
    );
    const timeChip = root.querySelector(".pm-timechip");
    const setWhen = (m) => {
      when = m;
      root.querySelectorAll("[data-when]").forEach((x) => x.classList.toggle("picked", +x.dataset.when === m));
      timeChip.classList.toggle("picked", m === null);
    };
    root.querySelectorAll("[data-when]").forEach((b) => (b.onclick = () => setWhen(+b.dataset.when)));
    const timeIn = root.querySelector("#pm-time");
    const useTime = () => {
      customTime = timeIn.value;
      setWhen(null);
    };
    timeIn.onfocus = useTime;
    timeIn.oninput = useTime;
    timeIn.onchange = useTime;

    root.querySelector("#pm-add").onclick = () => addDrink(root);
    root.querySelectorAll("[data-night]").forEach(
      (b) =>
        (b.onclick = () => {
          openNight = openNight === b.dataset.night ? null : b.dataset.night;
          render();
        }),
    );
    root.querySelectorAll("[data-rename]").forEach(
      (b) =>
        (b.onclick = () => {
          const n = data.nights.find((x) => x.id === b.dataset.rename);
          const name = n && prompt(t("Neuer Name für den Abend:"), n.name || "");
          if (name === null || !n) return;
          n.name = name.trim().slice(0, 40);
          save();
          render();
        }),
    );
    root.querySelectorAll("[data-del]").forEach(
      (b) =>
        (b.onclick = () => {
          if (!confirm(t("Diesen Abend wirklich löschen?"))) return;
          data.nights = data.nights.filter((n) => n.id !== b.dataset.del);
          save();
          render();
        }),
    );
    root.querySelector("#pm-editp").onclick = () => ((editProfile = true), render());
    const clear = root.querySelector("#pm-clear");
    if (clear)
      clear.onclick = () => {
        const name = prompt(t("Wie soll der Abend heißen? (z. B. Kneipentour mit Tim)"), "");
        if (name === null) return;
        const now = Date.now();
        const sim = simulate(now);
        const from = sim ? episode(sim)[0][0] - MIN : 0;
        archive(
          data.drinks.filter((d) => d.t >= from),
          name.trim().slice(0, 40),
        );
        openNight = data.nights[0]?.id ?? null;
        save();
        render();
        $("pm-root").querySelector(".pm-nights")?.scrollIntoView({ behavior: "smooth", block: "start" });
      };

    root.querySelectorAll(".pm-entry").forEach((li) => {
      const id = li.dataset.id;
      const d = data.drinks.find((x) => x.id === id);
      if (!d) return;
      li.querySelector(".pm-del")?.addEventListener("click", () => {
        data.drinks = data.drinks.filter((x) => x.id !== id);
        save();
        render();
      });
      li.querySelector(".pm-etime-btn")?.addEventListener("click", () => {
        editing = id;
        render();
        $("pm-root").querySelector(".pm-etime")?.focus();
      });
      li.querySelector(".pm-esave")?.addEventListener("click", () => {
        const val = li.querySelector(".pm-etime").value;
        // Das letzte Mal, dass es diese Uhrzeit war (also nie in der Zukunft)
        if (val) d.t = timeFromInput(null, val);
        editing = null;
        save();
        render();
      });
    });
  }

  function addDrink(root) {
    const err = root.querySelector("#pm-err");
    const fail = (msg) => {
      err.textContent = msg;
      err.hidden = false;
    };
    let drink;
    if (pick === "custom") {
      const name = root.querySelector("#pm-cname").value.trim() || t("Eigenes Getränk");
      const ml = parseFloat(String(root.querySelector("#pm-cml").value).replace(",", "."));
      const pct = parseFloat(String(root.querySelector("#pm-cpct").value).replace(",", "."));
      if (!(ml > 0 && ml <= 3000)) return fail(t("Bitte die Menge in ml eintragen."));
      if (!(pct >= 0 && pct <= 96)) return fail(t("Bitte den Alkoholgehalt in % eintragen."));
      const durIn = String(root.querySelector("#pm-cdur").value).trim();
      const dur = durIn === "" ? durFor(ml) : Math.round(parseFloat(durIn.replace(",", ".")));
      if (!(dur >= 0 && dur <= 180)) return fail(t("Bitte die Trinkdauer in Minuten eintragen (0 bis 180)."));
      drink = { name, ml, pct, dur };
      // Eigene Getränke merken (die letzten sechs)
      const id = `mine-${name.toLowerCase()}-${ml}-${pct}`;
      data.mine = [{ id, name, ml, pct, dur }, ...data.mine.filter((m) => m.id !== id)].slice(0, 6);
      pick = id;
    } else {
      const pr = PRESETS.find((d) => d.id === pick) || data.mine.find((d) => d.id === pick);
      if (!pr) return fail(t("Bitte ein Getränk wählen."));
      drink = { name: PRESETS.includes(pr) ? t(pr.name) : pr.name, ml: pr.ml, pct: pr.pct, dur: durOf(pr) };
    }
    const now = Date.now();
    const tm = Math.min(now, timeFromInput(when, customTime, now));
    data.drinks.push({ id: `${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`, ...drink, t: tm });
    save();
    when = 0;
    customTime = "";
    render();
    const box = $("pm-root").querySelector(".pm-now-card");
    box?.classList.add("bump");
    if (typeof vibrate === "function") vibrate(30);
  }

  return { open, simulate, bodyWater, timeFromInput, _data: () => data };
})();

registerGame("promille", {
  label: "Promille-Rechner",
  emoji: "🧮",
  description: "Trag ein, was du trinkst, und sieh, wie viel Promille du ungefähr hast.",
  color: "#4fa3a5",
  rules: [
    "Trag einmal Gewicht, Größe, Alter und Körperbau ein. Das bleibt nur auf diesem Handy.",
    "Tipp auf „Eintragen“, wenn das Glas leer ist. Wie lange du daran getrunken hast, rechnet die App mit (Bier 0,5 l ca. 15 Min). Vergessen? Dann „vor 30 Min“ oder die Uhrzeit wählen. Die Uhrzeit in der Liste lässt sich auch später noch antippen und ändern.",
    "Gerechnet wird mit der Widmark-Formel und dem Körperwasser nach Watson. Jedes Getränk braucht etwa 30 Minuten, bis es im Blut ist, abgebaut werden ungefähr 0,15 ‰ pro Stunde.",
    "Am Ende vom Abend auf „Abend speichern“ tippen und einen Namen geben. Vergessene Abende landen von selbst unter „Vergangene Abende“, mit Tabelle aller Getränke.",
    "Das ist nur eine Schätzung. Essen, Medikamente, Müdigkeit und dein Körper können den echten Wert stark verändern. Entscheide danach nie, ob du Auto fährst.",
  ],
  open() {
    Promille.open();
  },
});
