// Saufkalender: Jeden Abend ab 17 Uhr geht ein neues Türchen auf. Dahinter steht eine Überraschungsregel,
// die die ganze Nacht gilt, auch in allen anderen Spielen. Wer sie bricht und erwischt wird, trinkt.
// Die Regel hängt nur vom Datum ab, also hat jede Runde am selben Abend dieselbe Regel.
// {p} = ein Spieler aus der Runde (wird beim Öffnen ausgelost).
(() => {
  const SWITCH = 17; // ab dieser Uhrzeit gibt es die neue Regel, bis dahin gilt die von gestern Abend
  const KEY = "saufkalender";

  // Neue Regeln einfach unten anhängen. n = Schlucke für den, der erwischt wird.
  const RULES = [
    { emoji: "📱", text: "Wer „Handy“ sagt, trinkt.", n: 2 },
    { emoji: "🙊", text: "Namen sind verboten. Wer jemanden beim Namen nennt, trinkt.", n: 2 },
    { emoji: "🤚", text: "Getrunken wird nur mit links. Wer mit rechts trinkt, trinkt gleich nochmal.", n: 2 },
    { emoji: "❓", text: "{p} ist Fragenmeister. Wer auf eine Frage von {p} antwortet, trinkt.", n: 1 },
    { emoji: "🚫", text: "„Ja“ und „Nein“ sind verboten. Wer es trotzdem sagt, trinkt.", n: 1 },
    { emoji: "👍", text: "{p} legt irgendwann still den Daumen auf den Tisch. Wer als Letzter mitmacht, trinkt.", n: 2 },
    { emoji: "🤬", text: "Wer flucht, trinkt.", n: 1 },
    { emoji: "🥂", text: "Vor jedem Schluck sagt man „Prost, {p}!“. Wer es vergisst, trinkt noch einen.", n: 1 },
    { emoji: "🚽", text: "Wer aufs Klo geht, macht vorher jemandem ein Kompliment. Sonst trinkt er.", n: 1 },
    { emoji: "👉", text: "Zeigen ist verboten. Wer mit dem Finger auf etwas zeigt, trinkt.", n: 2 },
    { emoji: "🏴‍☠️", text: "Piratenabend: Jeder Satz endet mit „Arrr“. Wer’s vergisst, trinkt.", n: 1 },
    { emoji: "🇩🇪", text: "Englisch ist verboten. Wer „okay“, „cool“, „sorry“ oder sonst was Englisches sagt, trinkt.", n: 1 },
    { emoji: "🤐", text: "Wer „trinken“ oder „Schluck“ sagt, trinkt.", n: 2 },
    { emoji: "🫖", text: "Das Glas hält man nur mit abgespreiztem kleinen Finger. Wer’s vergisst, trinkt.", n: 1 },
    { emoji: "👀", text: "Wer außerhalb vom Spiel aufs Handy schaut, trinkt.", n: 2 },
    { emoji: "🎩", text: "Heute wird gesiezt. Wer jemanden duzt, trinkt.", n: 1 },
    { emoji: "😶", text: "Wer „ähm“ sagt, trinkt.", n: 1 },
    { emoji: "🐍", text: "{p} ist die Schlange. Wer {p} in die Augen schaut, trinkt.", n: 1 },
    { emoji: "🙅", text: "Wer die Arme verschränkt, trinkt.", n: 1 },
    { emoji: "🌀", text: "Bevor man sich hinsetzt, dreht man sich einmal im Kreis. Sonst: trinken.", n: 1 },
    { emoji: "🪪", text: "Wer seinen eigenen Namen sagt, trinkt.", n: 1 },
    { emoji: "🤫", text: "Wenn {p} flüstert, flüstern alle. Wer laut weiterredet, trinkt.", n: 1 },
    { emoji: "🔢", text: "Zahlen sind verboten. Wer eine Zahl ausspricht, trinkt.", n: 1 },
    { emoji: "👑", text: "{p} hat heute immer recht. Wer {p} widerspricht, trinkt.", n: 2 },
    { emoji: "🗣️", text: "Alle reden heute mit einem Akzent ihrer Wahl. Wer rausfällt, trinkt.", n: 1 },
    { emoji: "🥱", text: "Wer gähnt, trinkt.", n: 1 },
    { emoji: "💪", text: "Ellbogen auf dem Tisch sind verboten. Wer erwischt wird, trinkt.", n: 1 },
    { emoji: "🍻", text: "Ruft jemand „Prost!“, stoßen alle an. Wer als Letzter dabei ist, trinkt.", n: 1 },
    { emoji: "💼", text: "{p} ist heute der Chef und wird nur noch „Chef“ genannt. Wer anders redet, trinkt.", n: 1 },
    { emoji: "🫳", text: "Wer etwas fallen lässt, trinkt.", n: 2 },
    { emoji: "✅", text: "Wer „genau“ sagt, trinkt.", n: 1 },
    { emoji: "🤔", text: "Wer „eigentlich“ sagt, trinkt.", n: 1 },
    { emoji: "🧊", text: "Wer sein Glas ohne Untersetzer abstellt, trinkt.", n: 1 },
    { emoji: "👋", text: "Wer reinkommt oder geht, winkt allen zu. Wer’s vergisst, trinkt.", n: 1 },
    { emoji: "🦆", text: "Statt zu lachen, quakt man. Wer normal lacht, trinkt.", n: 1 },
    { emoji: "🤝", text: "Vor jedem Spiel geben sich alle die Hand. Wer’s vergisst, trinkt.", n: 1 },
  ];

  // --- Datum: Welcher Abend ist gerade? ---
  // Abend-Nummer = Tage seit 1970 für das Datum von „jetzt minus 17 Stunden“.
  function eveningNow() {
    const t = new Date(Date.now() - SWITCH * 3600e3);
    return Math.round(Date.UTC(t.getFullYear(), t.getMonth(), t.getDate()) / 864e5);
  }
  const dateOf = (day) => new Date(day * 864e5);
  const fmt = (day, opts) => dateOf(day).toLocaleDateString("de-DE", { timeZone: "UTC", ...opts });

  // Feste Reihenfolge der Regeln (immer gleich gemischt), damit sich nichts zu schnell wiederholt.
  const ORDER = (() => {
    const idx = RULES.map((_, i) => i);
    let seed = 20261101;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [idx[i], idx[j]] = [idx[j], idx[i]];
    }
    return idx;
  })();
  const ruleOf = (day) => RULES[ORDER[((day % RULES.length) + RULES.length) % RULES.length]];
  const fill = (text, p) => text.replaceAll("{p}", p);
  const ruleText = (s) => fill(ruleOf(s.day).text, s.p);

  // --- Gespeichert auf diesem Handy: die Regel von heute Abend, damit sie in den anderen Spielen oben steht ---
  function remember(s) {
    try {
      localStorage.setItem(KEY, JSON.stringify({ day: s.day, emoji: ruleOf(s.day).emoji, text: ruleText(s) }));
    } catch {
      // egal
    }
    // Menü-Kachel gleich mitändern
    document.querySelectorAll(".game-tile").forEach((t) => {
      if (t.querySelector(".game-name")?.textContent === "Saufkalender") t.querySelector(".game-desc").textContent = GAMES[KEY].description;
    });
  }
  function tonight() {
    try {
      const r = JSON.parse(localStorage.getItem(KEY));
      return r && r.day === eveningNow() ? r : null;
    } catch {
      return null;
    }
  }

  // --- Ansicht ---

  const nm = (p) => `<b>${escapeHtml(p)}</b>`;

  function doorsHtml(s) {
    // Drei offene von den letzten Abenden, das von heute, morgen noch zu
    const doors = [];
    for (let d = s.day - 3; d <= s.day + 1; d++) {
      const day = fmt(d, { day: "numeric" });
      const wd = fmt(d, { weekday: "short" });
      if (d < s.day) doors.push(`<div class="sk-door sk-past" title="${escapeHtml(fill(ruleOf(d).text, "…"))}"><span>${ruleOf(d).emoji}</span><small>${wd} ${day}.</small></div>`);
      else if (d === s.day)
        doors.push(
          s.stage === "door"
            ? `<div class="sk-door sk-today" data-act='{"type":"open"}'><b>${day}</b><small>heute</small></div>`
            : `<div class="sk-door sk-today sk-opened"><span>${ruleOf(d).emoji}</span><small>heute</small></div>`,
        );
      else doors.push(`<div class="sk-door sk-locked"><span>🔒</span><small>${SWITCH} Uhr</small></div>`);
    }
    return `<div class="sk-doors">${doors.join("")}</div>`;
  }

  function tallyHtml(s) {
    const rows = s.players
      .filter((p) => s.caught[p])
      .sort((a, b) => s.caught[b] - s.caught[a])
      .map((p) => `<li>${escapeHtml(p)} <b>${s.caught[p]}×</b></li>`)
      .join("");
    return rows ? `<ul class="za-tally">${rows}</ul>` : `<p class="hint small-text sk-none">Noch keiner erwischt.</p>`;
  }

  function doorView(s) {
    const ex = s.players.map(escapeHtml);
    return {
      phase: `Saufkalender · ${fmt(s.day, { weekday: "long", day: "numeric", month: "long" })}`,
      title: "Hinter dem Türchen wartet die Regel für heute Abend.",
      body: `${doorsHtml(s)}
        <ol class="za-intro">
          <li>Jeden Abend ab <b>${SWITCH} Uhr</b> geht ein neues Türchen auf. Alle Runden haben am selben Abend dieselbe Regel.</li>
          <li>Die Regel gilt <b>die ganze Nacht</b>, auch während ihr andere Spiele spielt. Oben im Spiel steht dann 📅, da könnt ihr sie nachlesen.</li>
          <li>Wer sie bricht und erwischt wird, trinkt. Tippt dafür auf <b>🚨 Erwischt!</b> und wählt aus, wen es trifft.</li>
        </ol>
        <p class="za-example">Beispiel: Die Regel ist „Wer ‚Handy‘ sagt, trinkt.“ Eine Stunde später fragt ${ex[0]}: „Wo ist mein Handy?“ ${ex[1] ?? "Jemand"} tippt auf Erwischt, ${ex[0]} trinkt 2 Schlucke.</p>`,
      actions: [{ label: "Türchen öffnen 🚪", act: { type: "open" } }],
    };
  }

  function ruleView(s) {
    const r = ruleOf(s.day);
    return {
      phase: `Regel des Abends · ${fmt(s.day, { weekday: "long", day: "numeric", month: "long" })}`,
      title: "",
      body: `${doorsHtml(s)}
        <div class="sk-rule"><span class="sk-emoji">${r.emoji}</span><p>${escapeHtml(ruleText(s))}</p><small>Erwischt: ${sips(LEVELS[levelOf(s)].scale(r.n))}</small></div>
        ${tallyHtml(s)}`,
      actions: [
        { label: "🚨 Erwischt!", sub: "Jemand hat die Regel gebrochen", act: { type: "catch" } },
        { label: "Regel merken, anderes Spiel spielen", exit: true, ghost: true },
      ],
      // Bots vergessen die Regel auch mal. Wie oft: je nach Bot-Stufe.
      auto: s.players.some(isBot) ? { key: `sk-bot-${s.n}`, act: { type: "bot", n: s.n }, ms: (25000 + Math.random() * 35000) / botErr() } : undefined,
    };
  }

  function catchView(s) {
    return {
      phase: "Erwischt!",
      title: "Wer hat die Regel gebrochen?",
      body: `<p class="sk-small">${ruleOf(s.day).emoji} ${escapeHtml(ruleText(s))}</p>`,
      actionsClass: "sk-pick",
      actions: [...s.players.map((p) => ({ label: p, act: { type: "who", who: p, n: s.n } })), { label: "Doch nicht", ghost: true, act: { type: "cancel" } }],
    };
  }

  // Türchen geht auf: nur beim ersten Zeichnen auf diesem Handy
  let shownDay = null;
  function afterRender(root, s) {
    if (s.stage === "door") return 0;
    remember(s);
    if (s.stage !== "rule" || shownDay === s.day + ":" + s.p) return 0;
    shownDay = s.day + ":" + s.p;
    root.querySelector(".sk-rule")?.classList.add("sk-reveal");
    return 0;
  }

  // --- 📅 oben in allen anderen Spielen ---
  function chip() {
    const bar = document.querySelector("#screen-game .game-bar");
    if (!bar) return;
    let btn = bar.querySelector(".sk-chip");
    const r = tonight();
    const show = r && document.documentElement.dataset.game !== KEY;
    if (!show) return btn?.remove();
    if (!btn) {
      btn = document.createElement("button");
      btn.className = "btn ghost small sk-chip";
      btn.textContent = "📅";
      btn.setAttribute("aria-label", "Regel des Abends");
      btn.onclick = () => {
        const t = tonight();
        if (t) showToast({ notice: { emoji: t.emoji, title: "Regel des Abends:", text: t.text } });
      };
      bar.insertBefore(btn, bar.querySelector(".rules-btn"));
    }
  }
  document.addEventListener("DOMContentLoaded", () => {
    const game = document.getElementById("screen-game");
    if (!game) return;
    new MutationObserver(chip).observe(game, { attributes: true, attributeFilter: ["class"] });
    new MutationObserver(chip).observe(document.documentElement, { attributes: true, attributeFilter: ["data-game"] });
  });

  registerGame(KEY, {
    label: "Saufkalender",
    emoji: "📅",
    color: "#f59e0b",
    // Im Menü steht die Regel von heute Abend, sobald das Türchen auf diesem Handy offen war.
    get description() {
      const r = tonight();
      return r ? `Heute Abend: ${r.text}` : `Jeden Abend ab ${SWITCH} Uhr ein neues Türchen mit einer Überraschungsregel für die ganze Nacht.`;
    },
    rules: [
      `Jeden Abend ab ${SWITCH} Uhr geht ein neues Türchen auf. Dahinter steht eine Überraschungsregel. Bis zum nächsten Tag um ${SWITCH} Uhr gilt sie weiter.`,
      "Die Regel gilt die ganze Nacht, auch in allen anderen Spielen. Dort steht oben 📅, ein Tipp darauf zeigt die Regel.",
      "Wer die Regel bricht und erwischt wird, trinkt. Tippt auf 🚨 Erwischt! und wählt, wen es trifft. Die Liste zeigt, wer wie oft erwischt wurde.",
      "Bots vergessen die Regel auch mal, dann trinken sie von selbst.",
      "Die Regel hängt nur vom Datum ab: Alle Runden haben am selben Abend dieselbe Regel.",
    ],

    setup(players) {
      return { players, day: eveningNow(), p: players[Math.floor(Math.random() * players.length)], stage: "door", n: 0, caught: {} };
    },

    view(s) {
      if (s.stage === "door") return doorView(s);
      return s.stage === "catch" ? catchView(s) : ruleView(s);
    },

    afterRender,

    act(s, a) {
      if (s.stage === "door" && a.type === "open") {
        s.stage = "rule";
      } else if (s.stage === "rule" && a.type === "catch") {
        s.stage = "catch";
      } else if (s.stage === "catch" && a.type === "cancel") {
        s.stage = "rule";
      } else if (s.stage === "catch" && a.type === "who" && a.n === s.n && s.players.includes(a.who)) {
        s.stage = "rule";
        s.n++;
        s.caught[a.who] = (s.caught[a.who] ?? 0) + 1;
        drink(s, [{ who: a.who, n: ruleOf(s.day).n, text: "hat die Regel gebrochen" }]);
      } else if (s.stage === "rule" && a.type === "bot" && a.n === s.n) {
        const bots = s.players.filter(isBot);
        if (!bots.length) return;
        const who = bots[Math.floor(Math.random() * bots.length)];
        s.n++;
        s.caught[who] = (s.caught[who] ?? 0) + 1;
        drink(s, [{ who, n: ruleOf(s.day).n, text: "hat die Regel vergessen" }]);
      }
    },
  });
})();
