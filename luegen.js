// Lügendetektor: Reihum ist jemand Kandidat. Die App sagt ihm heimlich, ob er lügen oder die Wahrheit
// sagen muss. Er beantwortet eine Frage laut, die anderen wetten: Lüge oder Wahrheit? Dann legt er den
// Daumen auf den „Sensor“, die Maschine misst und urteilt (liegt meistens richtig, aber nicht immer).
// Zum Schluss kommt raus, was wirklich war: Wer falsch gewettet hat, trinkt.
(() => {
  const KEY = "luegen";
  const WRONG = 1; // falsch gewettet
  const CAUGHT = 2; // Lügner durchschaut (Mehrheit lag richtig)
  const FOOLED = 2; // Lügner kommt durch (Mehrheit lag falsch): verteilt
  const TRICKED = 1; // Detektor lag falsch: Kandidat verteilt
  const HOLD = 2500; // so lange den Daumen auflegen
  const ACCURACY = 0.7; // so oft liegt die Maschine richtig
  const REVEAL = 2600; // so lange „misst“ die Maschine, bevor das Urteil kommt

  const QUESTIONS = [
    "Hast du schon mal bei einer Prüfung geschummelt?",
    "Hast du schon mal jemandem einen Korb gegeben und es danach bereut?",
    "Hast du schon mal eine Nachricht an die falsche Person geschickt?",
    "Hast du schon mal im Schwimmbad ins Becken gepinkelt?",
    "Hast du schon mal ein Geschenk weiterverschenkt?",
    "Hast du schon mal so getan, als wärst du krank, um nicht arbeiten oder zur Schule zu müssen?",
    "Hast du schon mal den Ex von jemandem aus dieser Runde geküsst?",
    "Hast du schon mal etwas aus einem Hotel mitgehen lassen?",
    "Hast du schon mal in einer Bar die Rechnung geprellt?",
    "Hast du schon mal einen Film geweint, den alle anderen lustig fanden?",
    "Hast du schon mal jemanden heimlich auf Social Media gestalkt, mit dem du Schluss gemacht hast?",
    "Hast du schon mal ein Date wegen jemand anderem abgesagt?",
    "Hast du schon mal etwas vom Boden gegessen, das länger als fünf Sekunden da lag?",
    "Hast du schon mal betrunken jemanden angerufen, den du nicht hättest anrufen sollen?",
    "Hast du schon mal deinen eigenen Geburtstag vergessen?",
    "Hast du schon mal ein Tattoo oder Piercing bereut?",
    "Hast du schon mal im Club jemandem eine falsche Nummer gegeben?",
    "Hast du schon mal auf einer Party jemanden geküsst, dessen Namen du nicht wusstest?",
    "Hast du schon mal gelogen, um früher von einer Party wegzukommen?",
    "Hast du schon mal etwas über jemanden in dieser Runde gelästert?",
    "Hast du schon mal deine Eltern beim Knutschen erwischt?",
    "Hast du schon mal eine Pflanze sterben lassen und sie heimlich ersetzt?",
    "Hast du schon mal in einem fremden Bett aufgewacht und nicht gewusst, wo du bist?",
    "Hast du schon mal ein Selfie mit über 20 Versuchen gemacht?",
    "Hast du schon mal Essen aus dem Kühlschrank von Mitbewohnern geklaut?",
    "Hast du schon mal einen Liebesbrief geschrieben?",
    "Hast du schon mal im Urlaub was mit einem Einheimischen angefangen?",
    "Hast du schon mal eine Wette verloren und den Einsatz nie bezahlt?",
    "Hast du schon mal im Auto lauthals gesungen und wurdest dabei gesehen?",
    "Hast du schon mal jemandem eine Sprachnachricht geschickt und sie sofort wieder gelöscht?",
    "Hast du schon mal so getan, als ob du ein Buch gelesen hast, obwohl du es nie gelesen hast?",
    "Hast du schon mal deinem Chef oder Lehrer ins Gesicht gelogen?",
    "Hast du schon mal ein Kompliment bekommen und gedacht, es war ernst gemeint, obwohl es ein Witz war?",
    "Hast du schon mal in einer Umkleide etwas anprobiert und es kaputt gemacht?",
    "Hast du schon mal einen Drink über jemanden geschüttet?",
    "Hast du schon mal in der Öffentlichkeit die Hose gerissen?",
    "Hast du schon mal ein Tinder-Date nur wegen des Essens gehabt?",
    "Hast du schon mal deine Zahnbürste mit jemandem geteilt?",
    "Hast du schon mal einen Streit absichtlich angefangen, nur aus Langeweile?",
    "Hast du schon mal an einem Feueralarm schuld gehabt?",
    "Hast du schon mal jemandem in dieser Runde ein Geheimnis weitererzählt?",
    "Hast du schon mal den Schlüssel von innen in der Wohnung stecken lassen?",
    "Hast du schon mal nackt gebadet?",
    "Hast du schon mal deinen Partner oder deine Partnerin mit einem falschen Namen angesprochen?",
    "Hast du schon mal so getan, als würdest du jemanden nicht sehen, um nicht grüßen zu müssen?",
    "Hast du schon mal eine Hausarbeit oder Präsentation komplett in der letzten Nacht gemacht?",
    "Hast du schon mal bei einem Spiel absichtlich verloren, um jemanden glücklich zu machen?",
    "Hast du schon mal die Polizei angelogen?",
    "Hast du schon mal ein Haustier für ein anderes ausgegeben?",
    "Hast du schon mal einen Kater mit noch mehr Alkohol bekämpft?",
    "Hast du schon mal ein Gerät kaputt gemacht und es jemand anderem in die Schuhe geschoben?",
    "Hast du schon mal auf einer Hochzeit zu viel getrunken?",
    "Hast du schon mal heimlich das Handy von jemand anderem durchgeschaut?",
    "Hast du schon mal in jemanden aus dieser Runde verknallt gewesen?",
    "Hast du schon mal eine Party geschmissen, ohne dass deine Eltern es wussten?",
    "Hast du schon mal einen Pickel eines anderen ausgedrückt?",
    "Hast du schon mal ein komplettes Wochenende im Bett verbracht?",
    "Hast du schon mal etwas im Internet bestellt, nur um es nach einem Mal Tragen zurückzuschicken?",
    "Hast du schon mal behauptet, dass dein Akku leer war, um nicht ranzugehen?",
    "Hast du schon mal Dreck unter den Teppich gekehrt, ganz wörtlich?",
  ];
  const BOT_SAYS = ["Ja, schon mal.", "Nein, nie im Leben!", "Ähm… ja, einmal.", "Natürlich nicht!", "Klar, mehr als einmal.", "Nee, so was mach ich nicht."];

  const nm = (p) => `<b>${escapeHtml(p)}</b>`;
  const bettors = (s) => s.players.filter((p) => p !== s.round.k);

  // --- Runde anlegen ---

  function newRound(s) {
    if (!s.deck.length) s.deck = shuffle(QUESTIONS.map((_, i) => i));
    const k = s.players[s.next % s.players.length];
    s.next = (s.next + 1) % s.players.length;
    s.n++;
    const lie = Math.random() < 0.5;
    s.round = { id: Math.random().toString(36).slice(2), n: s.n, k, q: s.deck.pop(), lie, bets: {}, say: isBot(k) ? BOT_SAYS[Math.floor(Math.random() * BOT_SAYS.length)] : null };
    s.stage = isBot(k) ? "bets" : "secret";
  }

  // Die Maschine urteilt: meistens richtig. Dazu eine „Messkurve“ (bei Lüge-Urteil zackiger).
  function measure(s) {
    const r = s.round;
    const right = Math.random() < ACCURACY;
    r.verdict = right ? r.lie : !r.lie;
    const amp = r.verdict ? 1 : 0.35;
    r.wave = Array.from({ length: 28 }, (_, i) => {
      const base = Math.sin(i * 0.9) * 0.25;
      const spike = i > 12 && Math.random() < 0.45 * amp ? (Math.random() - 0.5) * 1.6 * amp : 0;
      return Math.round(Math.max(-1, Math.min(1, base + spike + (Math.random() - 0.5) * 0.3)) * 100) / 100;
    });
    resolve(s);
  }

  function resolve(s) {
    const r = s.round;
    const ps = bettors(s).filter((p) => r.bets[p]);
    const right = ps.filter((p) => (r.bets[p] === "luege") === r.lie);
    const wrong = ps.filter((p) => !right.includes(p));
    const items = wrong.map((p) => ({ who: p, n: WRONG, text: `auf ${r.bets[p] === "luege" ? "Lüge" : "Wahrheit"} gewettet` }));
    r.outcome = null;
    score(s, right, wrong);
    if (r.lie && ps.length && right.length * 2 > ps.length) {
      items.push({ who: r.k, n: CAUGHT, text: "Lüge durchschaut" });
      r.outcome = "caught";
    } else if (r.lie && ps.length && wrong.length * 2 > ps.length) {
      items.push({ who: r.k, n: FOOLED, give: true, text: "alle reingelegt" });
      r.outcome = "fooled";
    }
    if (r.verdict !== r.lie) items.push({ who: r.k, n: TRICKED, give: true, text: "den Detektor ausgetrickst" });
    const scale = LEVELS[levelOf(s)].scale;
    for (const it of items) if (!it.give) s.tally[it.who].sips += scale(it.n);
    if (r.lie && r.outcome === "fooled") s.tally[r.k].fooled++;
    s.stage = "result";
    if (items.length) drink(s, items);
    else notice(s, { emoji: "😇", title: "Alle lagen richtig.", text: "Keiner trinkt." });
  }

  // --- Ansicht ---

  function introView(s) {
    const [a, b, c] = [...s.players.map(escapeHtml), "Kim", "Max"];
    return {
      phase: "So geht der Lügendetektor",
      title: "Lügen oder Wahrheit? Die Maschine weiß es (meistens).",
      body: `<ol class="za-intro">
          <li>Reihum ist einer <b>Kandidat</b>. Nur er sieht heimlich: <b>Lüg!</b> oder <b>Sag die Wahrheit!</b></li>
          <li>Er beantwortet die Frage laut mit Ja oder Nein und erzählt kurz dazu. Die anderen wetten: <b>Lüge oder Wahrheit?</b></li>
          <li>Dann legt er den Daumen auf den Sensor und die Maschine urteilt. Danach kommt raus, was wirklich war.</li>
          <li>Wer falsch gewettet hat, trinkt ${sips(WRONG)}. Durchschaute Lügner trinken ${sips(CAUGHT)}, wer alle reinlegt, verteilt ${sips(FOOLED)}. Liegt die Maschine daneben, verteilt der Kandidat noch ${sips(TRICKED)}.</li>
        </ol>
        <p class="za-example">Beispiel: ${a} soll lügen und sagt „Ja, ich hab schon mal im Schwimmbad ins Becken gepinkelt.“ ${b} wettet Lüge, ${c} Wahrheit. Die Maschine sagt Wahrheit. Aufgelöst: Lüge! ${c} trinkt ${sips(WRONG)}, und ${a} verteilt ${sips(TRICKED)}, weil die Maschine reingefallen ist.</p>`,
      actions: [{ label: "Verstanden, los geht's 🕵️", act: { type: "go" } }],
    };
  }

  function questionHtml(s) {
    return `<div class="lg-q"><span class="lg-k">${escapeHtml(s.round.k)} wird befragt</span>${escapeHtml(QUESTIONS[s.round.q])}</div>`;
  }

  function secretView(s, me) {
    const r = s.round;
    const mine = !me || me === r.k;
    const body = mine
      ? `${questionHtml(s)}
         <button class="lg-secret" type="button"><span class="lg-cover">🤫 Gedrückt halten,<br>nur ${escapeHtml(r.k)} guckt!</span>
           <span class="lg-order ${r.lie ? "lie" : "truth"}">${r.lie ? "🤥 LÜG!" : "😇 Sag die Wahrheit!"}</span></button>`
      : `${questionHtml(s)}<div class="lg-wait">🤫 ${escapeHtml(r.k)} bekommt gerade seine geheime Anweisung…</div>`;
    return {
      phase: `Runde ${r.n} · geheime Anweisung`,
      title: !me ? `Gib das Handy ${nm(r.k)}. Alle anderen weggucken!` : mine ? "Nur du siehst das. Halte gedrückt." : `Warte auf ${nm(r.k)}…`,
      body,
      actions: [{ label: "Gemerkt 👍", by: r.k, act: { type: "seen", n: r.n } }],
    };
  }

  function betsView(s, me) {
    const r = s.round;
    const ps = bettors(s);
    const amK = me === r.k;
    let hint = isBot(r.k) ? `<div class="lg-say">${escapeHtml(r.k)} sagt: „${escapeHtml(r.say)}“</div>` : `<div class="lg-hint">${amK ? `Antworte laut mit Ja oder Nein und erzähl kurz dazu. Denk dran: ${r.lie ? "<b>lügen</b> 🤥" : "<b>Wahrheit</b> 😇"}` : `${escapeHtml(r.k)} antwortet laut. Glaubst du das?`}</div>`;
    const row = (p) => {
      const bet = r.bets[p];
      const can = !isBot(p) && !bet && (!me || me === p);
      const btns = can
        ? `<span class="lg-btns"><button class="btn lg-b-lie" data-by="${escapeHtml(p)}" data-act="${escapeHtml(JSON.stringify({ type: "bet", n: r.n, who: p, v: "luege" }))}">🤥 Lüge</button><button class="btn lg-b-truth" data-by="${escapeHtml(p)}" data-act="${escapeHtml(JSON.stringify({ type: "bet", n: r.n, who: p, v: "wahr" }))}">😇 Wahrheit</button></span>`
        : `<span class="lg-st">${bet ? (me === p ? (bet === "luege" ? "🤥 Lüge" : "😇 Wahrheit") : "✓ gewettet") : isBot(p) ? "grübelt…" : "überlegt…"}</span>`;
      return `<li class="${bet ? "done" : ""} ${me === p ? "me" : ""}"><span class="lg-name">${escapeHtml(p)}</span>${btns}</li>`;
    };
    const order = me && !amK ? [me, ...ps.filter((p) => p !== me)] : ps;
    const missing = ps.filter((p) => !r.bets[p]);
    const humansMissing = missing.filter((p) => !isBot(p));
    const someBet = ps.some((p) => r.bets[p]);
    return {
      phase: `Runde ${r.n} · Wetten`,
      title: amK ? "Jetzt antworten!" : "Lüge oder Wahrheit?",
      body: `${questionHtml(s)}${hint}<ul class="lg-bets">${order.map(row).join("")}</ul>`,
      // Wenn jemand nicht mehr wettet (z. B. ohne Verbindung), kann man ohne ihn weiter.
      actions: me && someBet && humansMissing.length && !humansMissing.includes(me) ? [{ label: "Ohne die restlichen Wetten weiter", ghost: true, act: { type: "skip", n: r.n } }] : [],
    };
  }

  function scanView(s, me) {
    const r = s.round;
    const mine = !me || me === r.k;
    return {
      phase: `Runde ${r.n} · Messung`,
      title: mine ? `${nm(r.k)}, Daumen auf den Sensor und halten!` : `${nm(r.k)} legt den Daumen auf…`,
      body: `${questionHtml(s)}${
        mine && !isBot(r.k)
          ? `<button class="lg-pad" type="button" style="--p:0"><span class="lg-print">☝️</span><span class="lg-pad-t">Gedrückt halten</span></button>`
          : `<div class="lg-pad lg-pad-idle"><span class="lg-print">☝️</span><span class="lg-pad-t">${isBot(r.k) ? "🤖 Daumen liegt auf…" : "wird gemessen…"}</span></div>`
      }`,
      actions: [],
      turn: r.k,
    };
  }

  function waveSvg(w, lie) {
    const pts = w.map((y, i) => `${(i / (w.length - 1)) * 100},${50 - y * 40}`).join(" ");
    return `<svg class="lg-wave ${lie ? "lie" : ""}" viewBox="0 0 100 100" preserveAspectRatio="none"><polyline points="${pts}"/></svg>`;
  }

  function resultView(s, me) {
    const r = s.round;
    const ps = bettors(s);
    const you = (p) => (me === p ? "Du" : nm(p));
    const truth = r.lie ? `🤥 ${you(r.k)} ${me === r.k ? "hast" : "hat"} gelogen!` : `😇 ${you(r.k)} ${me === r.k ? "hast" : "hat"} die Wahrheit gesagt!`;
    let extra = "";
    if (r.outcome === "caught") extra = "Durchschaut!";
    else if (r.outcome === "fooled") extra = "Alle reingelegt!";
    if (r.verdict !== r.lie) extra += `${extra ? " " : ""}Und die Maschine ist reingefallen.`;
    const bets = ps
      .map((p) => {
        const b = r.bets[p];
        const ok = b && (b === "luege") === r.lie;
        return `<li class="${b ? (ok ? "ok" : "bad") : ""}"><span>${escapeHtml(p)}</span><span>${b ? (b === "luege" ? "🤥 Lüge" : "😇 Wahrheit") : "–"} ${b ? (ok ? "✓" : "✗") : ""}</span></li>`;
      })
      .join("");
    const rows = [...s.players]
      .sort((a, b) => s.tally[a].sips - s.tally[b].sips)
      .map((p) => `<li><span>${escapeHtml(p)}</span><span><b>${s.tally[p].sips}</b> ${drinkEmoji(s)}${s.tally[p].fooled ? ` · 🎭 ${s.tally[p].fooled}` : ""}</span></li>`)
      .join("");
    return {
      phase: `Runde ${r.n} · Ergebnis`,
      title: `Die Maschine sagt…`,
      body: `<div class="lg-result" data-n="${r.n}">
          <div class="lg-meter">${waveSvg(r.wave, r.verdict)}<span class="lg-stamp ${r.verdict ? "lie" : "truth"}">${r.verdict ? "LÜGE!" : "WAHRHEIT"}</span></div>
          <div class="lg-reveal"><b>${truth}</b>${extra ? `<span>${extra}</span>` : ""}</div>
          <ul class="lg-list">${bets}</ul>
        </div>
        <ul class="za-tally lg-tally">${rows}</ul>`,
      actions: [{ label: "Nächste Runde 🕵️", act: { type: "next", n: r.n } }],
    };
  }

  // --- Am Handy: geheim halten, Daumen halten, Animation ---

  const sent = new Set();
  const revealed = new Set();
  let timers = [];

  const live = () => typeof run !== "undefined" && run && run.key === KEY && document.getElementById("screen-game").classList.contains("active");

  function sendOnce(tag, act) {
    if (!live() || sent.has(tag)) return;
    sent.add(tag);
    if (sent.size > 200) sent.delete(sent.values().next().value);
    run.send(act);
  }

  function afterRender(root, s, me) {
    timers.forEach(clearTimeout);
    timers = [];
    const r = s.round;
    // Geheime Anweisung: nur solange gedrückt sichtbar
    const sec = root.querySelector(".lg-secret");
    if (sec) {
      const on = (e) => {
        e.preventDefault();
        sec.classList.add("show");
      };
      const off = () => sec.classList.remove("show");
      sec.addEventListener("pointerdown", on);
      ["pointerup", "pointercancel", "pointerleave"].forEach((t) => sec.addEventListener(t, off));
      sec.addEventListener("contextmenu", (e) => e.preventDefault());
    }
    // Daumen-Sensor: HOLD ms halten, Loslassen fängt von vorne an
    const pad = root.querySelector("button.lg-pad");
    if (pad) {
      let start = 0;
      let raf = 0;
      const step = () => {
        const p = Math.min(1, (performance.now() - start) / HOLD);
        pad.style.setProperty("--p", p.toFixed(3));
        if (p >= 1) {
          pad.classList.add("full");
          try {
            navigator.vibrate?.([40, 30, 40]);
          } catch {
            // egal
          }
          return sendOnce(`scan:${r.id}`, { type: "scan", n: r.n });
        }
        raf = requestAnimationFrame(step);
      };
      pad.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        pad.setPointerCapture?.(e.pointerId);
        start = performance.now();
        pad.classList.add("on");
        try {
          navigator.vibrate?.(15);
        } catch {
          // egal
        }
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(step);
      });
      const stop = () => {
        if (pad.classList.contains("full")) return;
        cancelAnimationFrame(raf);
        pad.classList.remove("on");
        pad.style.setProperty("--p", 0);
      };
      ["pointerup", "pointercancel", "lostpointercapture"].forEach((t) => pad.addEventListener(t, stop));
      pad.addEventListener("contextmenu", (e) => e.preventDefault());
    }
    // Bots wetten selbst (wer den Spielstand hält: ein Handy oder der Host), nacheinander
    const holder = !me || run.host;
    if (s.stage === "bets" && holder) {
      let t = 900;
      for (const p of bettors(s)) {
        if (!isBot(p) || r.bets[p]) continue;
        t += 700 + Math.random() * 1300;
        timers.push(setTimeout(() => sendOnce(`bet:${r.id}:${p}`, { type: "bet", n: r.n, who: p, v: botBet(r) }), t));
      }
    }
    // Urteil: erst messen, dann Stempel. Nur beim ersten Zeigen, sonst gleich fertig.
    const res = root.querySelector(".lg-result");
    if (res) {
      if (revealed.has(r.id)) {
        res.classList.add("seen");
        return 0;
      }
      revealed.add(r.id);
      return REVEAL + 700;
    }
    return 0;
  }

  // Bot wettet: meistens geraten, auf Schwer mit etwas Menschenkenntnis.
  function botBet(r) {
    const smart = r.lie ? "luege" : "wahr";
    const dumb = r.lie ? "wahr" : "luege";
    const hit = 0.5 + 0.12 / botErr();
    return Math.random() < Math.min(0.85, hit) ? smart : dumb;
  }

  // CSS bringt das Spiel selbst mit (hält style.css frei von Konflikten)
  const css = `
.lg-q { flex: none; padding: clamp(10px, 2.2dvh, 22px) 16px; border-radius: 18px; background: linear-gradient(135deg, #164e63, #0f172a); border: 1px solid #0891b2; text-align: center; font-weight: 800; line-height: 1.3; font-size: clamp(1.05rem, 3dvh, 1.6rem); }
.lg-k { display: block; font-size: 0.6em; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #67e8f9; margin-bottom: 4px; }
.lg-hint, .lg-say, .lg-wait { flex: none; text-align: center; color: var(--muted); font-size: clamp(0.9rem, 2.2dvh, 1.05rem); line-height: 1.4; }
.lg-say { color: #fff; font-size: clamp(1rem, 2.8dvh, 1.3rem); font-style: italic; }
.lg-hint b { color: #fcd34d; }
.lg-wait { flex: 1; display: grid; place-items: center; font-size: clamp(1rem, 3dvh, 1.4rem); }
.lg-secret { flex: 1; min-height: 120px; position: relative; display: grid; place-items: center; border: 2px dashed #0891b2; border-radius: 22px; background: rgb(8 145 178 / 0.12); color: #fff; font: inherit; font-weight: 800; font-size: clamp(1.1rem, 3.4dvh, 1.6rem); line-height: 1.35; cursor: pointer; touch-action: none; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
.lg-secret .lg-order { display: none; font-size: clamp(1.8rem, 8dvh, 3.6rem); }
.lg-secret.show .lg-cover { display: none; }
.lg-secret.show .lg-order { display: block; }
.lg-secret.show { border-style: solid; }
.lg-order.lie { color: #f87171; }
.lg-order.truth { color: #4ade80; }
.lg-bets, .lg-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; min-height: 0; overflow-y: auto; }
.lg-bets { flex: 1; }
.lg-bets li, .lg-list li { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 6px 8px 6px 14px; border-radius: 14px; background: var(--surface); }
.lg-bets li.done { opacity: 0.75; }
.lg-bets li.me { outline: 2px solid #0891b2; }
.lg-name { font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lg-btns { display: flex; gap: 6px; flex: none; }
.lg-btns .btn { width: auto; min-height: 0; padding: 10px 12px; font-size: 0.95rem; }
.lg-btns .lg-b-lie { background: #dc2626; }
.lg-btns .lg-b-truth { background: #16a34a; }
.lg-st { color: var(--muted); font-size: 0.9rem; flex: none; }
.lg-pad { --p: 0; flex: 1; min-height: 150px; position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; border: none; border-radius: 24px; color: #fff; font: inherit; cursor: pointer; touch-action: none; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none;
  background: radial-gradient(circle, rgb(34 211 238 / calc(0.15 + var(--p) * 0.45)) 0 calc(var(--p) * 70%), rgb(15 23 42) calc(var(--p) * 70% + 1%)); box-shadow: inset 0 0 0 2px #0891b2; }
.lg-pad.on { box-shadow: inset 0 0 0 3px #22d3ee, 0 0 30px rgb(34 211 238 / 0.4); }
.lg-pad.on .lg-print { animation: lg-beat 0.5s ease-in-out infinite; }
.lg-pad.full { box-shadow: inset 0 0 0 3px #4ade80; }
.lg-pad-idle { cursor: default; }
.lg-pad-idle .lg-print { animation: lg-beat 0.8s ease-in-out 4; }
.lg-print { font-size: clamp(3rem, 14dvh, 6.5rem); line-height: 1; }
.lg-pad-t { font-weight: 700; color: #67e8f9; }
@keyframes lg-beat { 50% { transform: scale(1.12); } }
.lg-result { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: clamp(6px, 1.2dvh, 12px); }
.lg-meter { flex: 1; min-height: 90px; position: relative; border-radius: 18px; background: #0b1120; overflow: hidden; box-shadow: inset 0 0 0 1px #164e63;
  background-image: linear-gradient(rgb(34 211 238 / 0.08) 1px, transparent 1px), linear-gradient(90deg, rgb(34 211 238 / 0.08) 1px, transparent 1px); background-size: 20px 20px; }
.lg-wave { position: absolute; inset: 8% 4%; width: 92%; height: 84%; }
.lg-wave { clip-path: inset(0 100% 0 0); animation: lg-draw ${REVEAL}ms linear forwards; }
.lg-wave polyline { fill: none; stroke: #22d3ee; stroke-width: 2.5; vector-effect: non-scaling-stroke; stroke-linejoin: round; }
.lg-wave.lie polyline { animation: lg-red 0.2s linear ${REVEAL}ms forwards; }
@keyframes lg-draw { to { clip-path: inset(0 0 0 0); } }
@keyframes lg-red { to { stroke: #f87171; } }
.lg-stamp { position: absolute; left: 50%; top: 50%; padding: 4px 18px; border: 5px solid currentColor; border-radius: 12px; font-weight: 900; letter-spacing: 0.06em; font-size: clamp(1.8rem, 8dvh, 3.6rem); background: rgb(11 17 32 / 0.75);
  transform: translate(-50%, -50%) rotate(-8deg); opacity: 0; animation: lg-stamp 0.35s cubic-bezier(.2,1.6,.4,1) ${REVEAL}ms forwards; }
.lg-stamp.lie { color: #f87171; }
.lg-stamp.truth { color: #4ade80; }
@keyframes lg-stamp { from { opacity: 0; transform: translate(-50%, -50%) rotate(-8deg) scale(2.2); } to { opacity: 1; transform: translate(-50%, -50%) rotate(-8deg) scale(1); } }
.lg-reveal, .lg-list { opacity: 0; animation: lg-in 0.4s ease ${REVEAL + 500}ms forwards; }
.lg-reveal { flex: none; display: flex; flex-direction: column; align-items: center; gap: 2px; text-align: center; font-size: clamp(1rem, 2.8dvh, 1.35rem); }
.lg-reveal span { color: #fcd34d; font-size: 0.85em; }
.lg-list { flex: none; flex-direction: row; flex-wrap: wrap; justify-content: center; }
.lg-list li { padding: 4px 12px; font-size: 0.85rem; }
.lg-list li.ok { box-shadow: inset 0 0 0 2px #16a34a; }
.lg-list li.bad { box-shadow: inset 0 0 0 2px #dc2626; }
@keyframes lg-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
.lg-result.seen * { animation-duration: 0s !important; animation-delay: 0s !important; }
html.fit[data-game="${KEY}"] .bf-body { overflow: hidden; gap: clamp(6px, 1.2dvh, 12px); }
html.fit[data-game="${KEY}"] .bf-title { font-size: clamp(1rem, 2.8dvh, 1.4rem); }
html[data-game="${KEY}"] .bf-actions:empty { display: none; }
`;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  registerGame(KEY, {
    label: "Lügendetektor",
    emoji: "🕵️",
    description: "Lügen oder Wahrheit? Wettet, dann misst die Maschine per Daumen.",
    color: "#0891b2",
    fit: true,
    rules: [
      "Reihum ist einer Kandidat. Die App sagt nur ihm heimlich, ob er lügen oder die Wahrheit sagen muss (auf einem Handy: Handy geben, die anderen gucken weg, gedrückt halten).",
      "Der Kandidat beantwortet die Frage laut mit Ja oder Nein und erzählt kurz dazu, damit es glaubwürdig klingt.",
      "Alle anderen wetten: Lüge oder Wahrheit? Mit mehreren Handys wettet jeder auf seinem eigenen.",
      `Dann legt der Kandidat den Daumen auf den Sensor, bis er voll ist. Die Maschine misst und urteilt. Sie liegt meistens richtig, aber nicht immer.`,
      `Aufgelöst: Wer falsch gewettet hat, trinkt ${sips(WRONG)}. Hat der Kandidat gelogen und die meisten haben es gemerkt, trinkt er ${sips(CAUGHT)}. Hat er die meisten reingelegt, verteilt er ${sips(FOOLED)}.`,
      `Liegt die Maschine daneben, hat der Kandidat sie ausgetrickst und verteilt noch ${sips(TRICKED)}.`,
    ],

    setup(players) {
      const s = { players, stage: "intro", n: 0, next: Math.floor(Math.random() * players.length), deck: [], round: null, tally: {} };
      for (const p of players) s.tally[p] = { sips: 0, fooled: 0 };
      return s;
    },

    view(s, me) {
      if (s.stage === "intro") return introView(s);
      if (s.stage === "secret") return secretView(s, me);
      if (s.stage === "bets") return betsView(s, me);
      if (s.stage === "scan") return scanView(s, me);
      return resultView(s, me);
    },

    afterRender,

    // Bot als Kandidat: Daumen auflegen
    bot(s, name, acts) {
      if (s.stage === "scan") return { type: "scan", n: s.round.n };
      return acts[0];
    },

    act(s, a) {
      const r = s.round;
      if (s.stage === "intro" && a.type === "go") return newRound(s);
      if (!r || a.n !== r.n) return;
      if (s.stage === "secret" && a.type === "seen") s.stage = "bets";
      else if (s.stage === "bets" && a.type === "bet" && bettors(s).includes(a.who) && !r.bets[a.who] && (a.v === "luege" || a.v === "wahr")) {
        r.bets[a.who] = a.v;
        if (bettors(s).every((p) => r.bets[p])) s.stage = "scan";
      } else if (s.stage === "bets" && a.type === "skip" && bettors(s).some((p) => r.bets[p])) s.stage = "scan";
      else if (s.stage === "scan" && a.type === "scan") measure(s);
      else if (s.stage === "result" && a.type === "next") newRound(s);
    },
  });
})();
