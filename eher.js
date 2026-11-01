// Wer würde eher…? Die App stellt eine Frage („Wer würde eher nackt baden gehen?“), alle stimmen geheim ab,
// wer zur Frage passt. Wer die meisten Stimmen kriegt, trinkt so viele Schlucke, wie er Stimmen hat.
// Mit mehreren Handys stimmen alle gleichzeitig am eigenen Handy ab, auf einem Handy geht es reihum.
// Bots stimmen von selbst ab (meistens mit der Mehrheit, manchmal quer).
(() => {
  const CATS = {
    normal: {
      label: "Normal",
      emoji: "🙂",
      description: "Alltag, Peinliches, zum Warmwerden",
      q: [
        "die eigene Hochzeit verschlafen",
        "sich in der eigenen Stadt verlaufen",
        "bei einem Disney-Film weinen",
        "beim Italiener Pommes bestellen",
        "von einer Gans verfolgt werden",
        "bei einer Beerdigung loslachen",
        "den Geburtstag der eigenen Mutter vergessen",
        "am längsten auf einer einsamen Insel überleben",
        "im Horrorfilm als Erstes erwischt werden",
        "heute das Handy verlieren",
        "mit dem Navi diskutieren",
        "eine Million gewinnen und nach einem Jahr pleite sein",
        "mit seinem Haustier Influencer werden",
        "etwas essen, das schon auf dem Boden lag",
        "zum eigenen Geburtstag zu spät kommen",
        "beim Karaoke ungefragt drei Lieder singen",
        "etwas völlig Sinnloses im Teleshopping kaufen",
        "beim Schwarzfahren erwischt werden",
        "mit Pflanzen reden",
        "den Urlaub bis auf die Minute durchplanen",
        "im Schlafanzug einkaufen gehen",
        "beim Nudelkochen die Küche abfackeln",
        "1000 ungelesene Nachrichten haben",
        "mal Bürgermeister werden",
        "das ganze Gehalt für Klamotten ausgeben",
        "spontan ins Ausland ziehen",
        "an einer Kasse mit der Verkäuferin Freundschaft schließen",
        "einen Streit mit einem Kleinkind verlieren",
        "bei Wer wird Millionär an der ersten Frage scheitern",
        "aus Versehen eine Reply-All-Mail an die ganze Firma schicken",
      ],
    },
    party: {
      label: "Party",
      emoji: "🍻",
      description: "Rund ums Feiern und Trinken",
      q: [
        "heute auf dem Tisch tanzen",
        "heute als Erstes einschlafen",
        "heute als Erstes kotzen",
        "eine Runde Kurze für alle bestellen",
        "nachts um vier anfangen zu philosophieren",
        "heute noch bei McDonald's landen",
        "auf dem Heimweg einen Schuh verlieren",
        "Bier ins Kino schmuggeln",
        "morgen woanders aufwachen",
        "morgen alles von heute vergessen",
        "heute Nacht noch Mama anrufen",
        "als Letzter das Licht ausmachen",
        "heute ein Geheimnis ausplaudern",
        "„Ich trink heute nichts“ sagen und am Ende am meisten trinken",
        "sich mit dem Türsteher anlegen",
        "ein Glas aus der Bar mitgehen lassen",
        "eine Polonaise starten",
        "in der Badewanne schlafen",
        "heute etwas posten, das morgen gelöscht wird",
        "um zwei Uhr nachts Döner für alle holen",
        "dem Ex um drei Uhr nachts schreiben",
        "auf einer fremden Hochzeit mitfeiern",
      ],
    },
    spicy: {
      label: "Spicy",
      emoji: "🌶️",
      description: "Flirten, Dates und ein bisschen frech",
      q: [
        "heute noch jemanden küssen",
        "das schlimmste erste Date erleben",
        "mit dem Barkeeper für Freigetränke flirten",
        "zwei Leute gleichzeitig daten",
        "sich im Urlaub verlieben",
        "aus Versehen ein Foto an die falsche Person schicken",
        "die peinlichste Dating-App-Bio haben",
        "nackt baden gehen",
        "spontan in Las Vegas heiraten",
        "wieder mit dem Ex zusammenkommen",
        "einen geheimen Schwarm in dieser Runde haben",
        "beim Flirten den ersten Schritt machen",
        "den Schwarm auf Instagram bis 2015 zurück stalken",
        "aus Versehen ein uraltes Foto liken",
        "sich am schnellsten um den Finger wickeln lassen",
        "die kitschigsten Liebesnachrichten schreiben",
        "jemanden aus dieser Runde daten",
        "für Geld ein Date mit einem Promi machen",
      ],
    },
    crazy: {
      label: "Crazy",
      emoji: "🤪",
      description: "Wild, absurd und völlig drüber",
      q: [
        "im Gefängnis landen",
        "von Aliens entführt werden und nicht zurückwollen",
        "eine Sekte gründen",
        "eine Zombie-Apokalypse überleben",
        "in einer Doku über seltsame Hobbys auftauchen",
        "sich ein Pferd kaufen und es in der Wohnung halten",
        "für eine Wette durch den Ärmelkanal schwimmen",
        "seine Seele für einen Döner verkaufen",
        "aus Versehen berühmt werden",
        "bei einer Datingshow im Fernsehen mitmachen",
        "ein ganzes Glas Senf auf Ex essen",
        "in den Wald ziehen und von Beeren leben",
        "betrunken zum Vorstellungsgespräch gehen",
        "sich für einen Kasten Bier die Haare pink färben",
        "ein geheimes Doppelleben führen",
        "von einer Möwe ausgeraubt werden",
        "nachts auf ein Baugerüst klettern",
        "aus einem Schuh trinken",
      ],
    },
  };
  const BONUS = 2; // alle einig (mindestens 3 Stimmen): noch 2 extra

  const nm = (p) => `<b>${escapeHtml(p)}</b>`;
  const humans = (s) => s.players.filter((p) => !isBot(p));
  const allVoted = (s) => s.players.every((p) => s.votes[p] != null);

  function pool(cat) {
    return cat === "all" ? Object.values(CATS).flatMap((c) => c.q) : CATS[cat].q;
  }

  function newQuestion(s) {
    const qs = pool(s.cat);
    if (!s.deck?.length) s.deck = shuffle(qs.map((_, i) => i));
    s.q = qs[s.deck.pop()];
    s.round++;
    s.votes = {};
    s.voter = 0; // ein Handy: wer gerade geheim abstimmt (Index in humans)
    s.stage = "vote";
    s.result = null;
  }

  // --- Auszählen ---

  function resolve(s) {
    const count = {};
    for (const p of s.players) count[p] = 0;
    for (const t of Object.values(s.votes)) if (t in count) count[t]++;
    const given = Object.values(s.votes).filter((t) => t in count).length;
    const max = Math.max(...Object.values(count));
    const top = s.players.filter((p) => count[p] === max && max > 0);
    const items = [];
    const all = top.length === 1 && max === given && given >= 3;
    for (const p of top) {
      const n = max + (all ? BONUS : 0);
      items.push({ who: p, n, text: all ? `alle einig! ${max} Stimmen + ${BONUS}` : `${max === 1 ? "1 Stimme" : `${max} Stimmen`}${top.length > 1 ? ", Gleichstand" : ""}` });
      s.tally[p] += LEVELS[levelOf(s)].scale(n);
    }
    s.result = { count, top, all, max };
    s.stage = "result";
    if (items.length) drink(s, items);
  }

  // Bot-Stimme: meistens dahin, wo schon die meisten Stimmen sind, sonst irgendwer (nicht er selbst).
  function botVote(s, bot) {
    const others = s.players.filter((p) => p !== bot);
    const count = {};
    for (const t of Object.values(s.votes)) count[t] = (count[t] ?? 0) + 1;
    const lead = Object.entries(count).sort((a, b) => b[1] - a[1])[0]?.[0];
    const smart = lead && lead !== bot && Math.random() < 0.55 ? lead : others[Math.floor(Math.random() * others.length)];
    return botPick(smart, others, 0.2);
  }

  // --- Ansicht ---

  function questionHtml(s) {
    return `<div class="ww-card"><span class="ww-pre">Wer würde eher …</span><span class="ww-q">${escapeHtml(s.q)}?</span></div>`;
  }

  function pickHtml(s, voter) {
    const btns = s.players
      .map((p) => {
        const act = escapeHtml(JSON.stringify({ type: "vote", round: s.round, who: voter, for: p }));
        return `<button class="ww-pick ${isBot(p) ? "bot" : ""}" data-act="${act}" data-by="${escapeHtml(voter)}">${escapeHtml(p)}${p === voter ? " <small>(ich)</small>" : ""}</button>`;
      })
      .join("");
    return `<div class="ww-picks n${Math.min(s.players.length, 9)}">${btns}</div>`;
  }

  function statusHtml(s) {
    return `<ul class="ww-status">${s.players.map((p) => `<li class="${s.votes[p] != null ? "done" : ""}">${s.votes[p] != null ? "✅" : "⏳"} ${escapeHtml(p)}</li>`).join("")}</ul>`;
  }

  function voteView(s, me) {
    const phase = `Frage ${s.round} · ${CATS[s.cat]?.emoji ?? "🎲"} ${CATS[s.cat]?.label ?? "Alles gemischt"}`;
    const auto = s.players.some((p) => isBot(p) && s.votes[p] == null) ? { key: `ww-bots-${s.round}`, act: { type: "bots", round: s.round }, ms: 1800 + Math.random() * 1500 } : null;
    const missing = s.players.filter((p) => s.votes[p] == null);
    // Mit mehreren Handys: jeder stimmt am eigenen ab. Fehlt jemand (kein Netz), darf man ohne ihn auszählen.
    if (me) {
      const done = s.votes[me] != null;
      const given = s.players.length - missing.length;
      const actions = given >= 2 && missing.length && missing.every((p) => !isBot(p)) ? [{ label: "Ohne die anderen auszählen", sub: missing.join(", "), ghost: true, act: { type: "count", round: s.round } }] : [];
      return {
        phase,
        title: done ? `Du hast für ${nm(s.votes[me])} gestimmt. Warte auf die anderen…` : "Stimm geheim ab!",
        body: `${questionHtml(s)}${done ? statusHtml(s) : pickHtml(s, me)}`,
        actions: done ? actions : [],
        auto,
      };
    }
    // Ein Handy: reihum, jeder tippt geheim, die anderen gucken weg.
    const hs = humans(s);
    const voter = hs[s.voter];
    if (!voter) return { phase, title: "Die Bots überlegen noch…", body: `${questionHtml(s)}${statusHtml(s)}`, actions: [], auto };
    return {
      phase,
      title: `📱 ${nm(voter)} stimmt geheim ab, die anderen gucken weg!`,
      body: `${questionHtml(s)}${pickHtml(s, voter)}`,
      actions: [],
      turn: voter,
      auto,
    };
  }

  function resultView(s, me) {
    const r = s.result;
    const you = (p) => (me === p ? "Du" : nm(p));
    let title;
    if (!r.top.length) title = "Keiner hat abgestimmt. Nächste Frage!";
    else if (r.all) title = `🎯 Alle einig: ${you(r.top[0])}! Trinkt ${sips(r.max + BONUS)}.`;
    else if (r.top.length > 1) title = `⚖️ Gleichstand: ${r.top.map((p) => nm(p)).join(" und ")} trinken je ${sips(r.max)}.`;
    else title = `🍺 ${you(r.top[0])} ${me === r.top[0] ? "würdest" : "würde"} eher ${escapeHtml(s.q)}! ${sips(r.max)}.`;
    const max = Math.max(1, r.max);
    const rows = [...s.players]
      .sort((a, b) => r.count[b] - r.count[a])
      .map((p) => {
        const from = Object.entries(s.votes)
          .filter(([, t]) => t === p)
          .map(([v]) => escapeHtml(v))
          .join(", ");
        return `<li class="${r.top.includes(p) ? "top" : ""}"><span class="ww-name">${escapeHtml(p)}</span><span class="ww-bar"><i style="width:${(r.count[p] / max) * 100}%"></i></span><span class="ww-n">${r.count[p]}</span>${from ? `<span class="ww-from">von ${from}</span>` : ""}</li>`;
      })
      .join("");
    const tally = [...s.players]
      .sort((a, b) => s.tally[b] - s.tally[a])
      .map((p) => `<li><span>${escapeHtml(p)}</span><span><b>${s.tally[p]}</b> ${drinkEmoji(s)}</span></li>`)
      .join("");
    return {
      phase: `Frage ${s.round}`,
      title,
      body: `${questionHtml(s)}<ul class="ww-result">${rows}</ul><ul class="za-tally">${tally}</ul>`,
      actions: [
        { label: "Nächste Frage ➡️", act: { type: "next", round: s.round } },
        { label: "Kategorie wechseln", ghost: true, act: { type: "cats", round: s.round } },
      ],
    };
  }

  function introView(s) {
    const [a, b, c] = [...s.players, "Tom", "Paula", "Kalle"].map(escapeHtml);
    return {
      phase: "So geht Wer würde eher…?",
      title: "Stimmt ab, wer am besten zur Frage passt.",
      body: `<ol class="za-intro">
          <li>Die App fragt z. B. <b>„Wer würde eher nackt baden gehen?“</b></li>
          <li>Alle stimmen <b>geheim</b> ab. Mit mehreren Handys jeder an seinem, auf einem Handy reihum (die anderen gucken weg).</li>
          <li>Wer die <b>meisten Stimmen</b> kriegt, trinkt so viele Schlucke, wie er Stimmen hat. Gleichstand: alle trinken.</li>
          <li>Sind sich alle einig, gibt's ${sips(BONUS)} extra. Danach sieht jeder, wer für wen gestimmt hat. 😏</li>
        </ol>
        <p class="za-example">Beispiel: ${a} und ${c} stimmen für ${b}, ${b} stimmt für ${a}. ${b} hat 2 Stimmen und trinkt ${sips(2)}.</p>`,
      actions: [{ label: "Verstanden, weiter 🫵", act: { type: "go" } }],
    };
  }

  function catButtons() {
    const btn = (key, c) =>
      `<button class="ww-cat" data-act="${escapeHtml(JSON.stringify({ type: "cat", cat: key }))}"><span class="ww-cat-e">${c.emoji}</span><span><b>${c.label}</b><small>${c.description}</small></span></button>`;
    return Object.entries(CATS).map(([k, c]) => btn(k, c)).join("") + btn("all", { emoji: "🎲", label: "Alles gemischt", description: "Von allem etwas" });
  }

  function catsView(s) {
    return { phase: "Kategorie", title: s.round ? "Welche Fragen als Nächstes?" : "Welche Fragen wollt ihr?", body: `<div class="ww-cats">${catButtons()}</div>`, actions: [] };
  }

  registerGame("eher", {
    label: "Wer würde eher…?",
    emoji: "🫵",
    description: "Alle stimmen geheim ab, wer am besten passt. Die meisten Stimmen trinken.",
    color: "#0891b2",
    fit: true,
    rules: [
      "Die App stellt eine Frage, z. B. „Wer würde eher nackt baden gehen?“.",
      "Alle stimmen geheim ab, wer am besten passt. Mit mehreren Handys jeder am eigenen, gleichzeitig. Auf einem Handy geht es reihum, die anderen gucken weg. Für sich selbst stimmen ist erlaubt.",
      "Wer die meisten Stimmen kriegt, trinkt so viele Schlucke, wie er Stimmen hat. Bei Gleichstand trinken alle mit den meisten Stimmen.",
      `Sind sich alle einig (mindestens 3 Stimmen), gibt es ${sips(BONUS)} extra.`,
      "Danach sieht jeder, wer für wen gestimmt hat. Rechtfertigen ausdrücklich erwünscht.",
      "Bots stimmen selbst ab, meistens mit der Mehrheit.",
    ],

    setup(players) {
      const s = { players, stage: "intro", round: 0, cat: "normal", votes: {}, tally: {} };
      for (const p of players) s.tally[p] = 0;
      return s;
    },

    view(s, me) {
      if (s.stage === "intro") return introView(s);
      if (s.stage === "cats") return catsView(s);
      return s.stage === "result" ? resultView(s, me) : voteView(s, me);
    },

    act(s, a, by) {
      if (s.stage === "intro" && a.type === "go") {
        s.stage = "cats";
      } else if (s.stage === "cats" && a.type === "cat" && (CATS[a.cat] || a.cat === "all")) {
        if (s.cat !== a.cat) s.deck = null;
        s.cat = a.cat;
        newQuestion(s);
      } else if (s.stage === "vote" && a.round === s.round) {
        if (a.type === "vote" && s.players.includes(a.who) && s.players.includes(a.for) && s.votes[a.who] == null && !isBot(a.who)) {
          s.votes[a.who] = a.for;
          const hs = humans(s);
          while (s.voter < hs.length && s.votes[hs[s.voter]] != null) s.voter++;
        } else if (a.type === "bots") {
          for (const p of s.players) if (isBot(p) && s.votes[p] == null) s.votes[p] = botVote(s, p);
        } else if (a.type === "count") {
          return resolve(s);
        } else return;
        if (allVoted(s)) resolve(s);
      } else if (s.stage === "result" && a.round === s.round) {
        if (a.type === "next") newQuestion(s);
        else if (a.type === "cats") s.stage = "cats";
      }
    },
  });
})();
