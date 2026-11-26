// Pferderennen: Die vier Asse sind die Pferde. Jeder setzt Schlucke auf ein Pferd (eine Farbe).
// Dann wird Karte für Karte vom Stapel umgedreht, das Ass mit derselben Farbe rückt ein Feld vor.
// Neben der Bahn liegen verdeckte Seitenkarten, eine pro Reihe. Haben alle Pferde eine Reihe erreicht,
// wird die Seitenkarte dieser Reihe umgedreht und das Pferd mit ihrer Farbe muss ein Feld zurück.
// Wer zuerst durchs Ziel geht, gewinnt: Wer darauf gesetzt hat, verteilt das Doppelte, alle anderen trinken ihren Einsatz.
// Ein Handy: reihum setzen. Mehrere Handys: jeder setzt am eigenen. Bots setzen selbst.
(() => {
  const KEY = "pferde";
  const SIDE = 6; // Seitenkarten (Reihen 1 bis 6)
  const GOAL = SIDE + 1; // Ziel ist Reihe 7
  const BETS = [1, 2, 3, 4, 5];
  const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "B", "D", "K"]; // ohne Ass, die Asse laufen
  const NAMES = { B: "Bube", D: "Dame", K: "König", A: "Ass" };

  const nm = (p) => `<b>${escapeHtml(p)}</b>`;
  const humans = (s) => s.players.filter((p) => !isBot(p));
  const suitName = (i) => t(SUITS[i].name);
  const ace = (i) => ({ suit: SUITS[i], rank: "A" });
  const cardName = (c) => `${t(c.suit.name)} ${t(NAMES[c.rank] ?? c.rank)}`;
  const suitIdx = (c) => SUITS.findIndex((x) => x.symbol === c.suit.symbol);
  const allBet = (s) => s.players.every((p) => s.bets[p]);

  // CSS kommt aus dieser Datei (Präfix pr-)
  if (!document.getElementById("pr-style")) {
    const css = document.createElement("style");
    css.id = "pr-style";
    css.textContent = `
      .bf-body:has(.pr-track) { display: flex; flex-direction: column; gap: clamp(4px, 1dvh, 10px); overflow: hidden; }
      .pr-track { position: relative; flex: 1; min-height: 120px; container: pr / size; border-radius: 14px; overflow: hidden;
        background: radial-gradient(120% 90% at 50% 40%, #3f7a3a 0%, #2c5e2a 60%, #214a20 100%); box-shadow: inset 0 0 0 3px rgba(255,255,255,.08), inset 0 0 40px rgba(0,0,0,.35); }
      /* Senkrecht: 6 Bahnen nebeneinander (Seitenkarten, 4 Pferde, Stapel), 8 Reihen von unten (Start) nach oben (Ziel) */
      .pr-x { position: absolute; --ch: min(calc(100cqh / 8 * .88), calc(100cqw / 6 * .9 * 1.448));
        left: calc((var(--lane) + .5) * 100cqw / 6); top: calc((7 - var(--row) + .5) * 100cqh / 8); transform: translate(-50%, -50%);
        width: calc(var(--ch) / 1.448); height: var(--ch); }
      .pr-in { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); display: flex; align-items: center; justify-content: center; }
      .pr-lane { position: absolute; left: calc(var(--lane) * 100cqw / 6); width: calc(100cqw / 6); top: 0; bottom: 0;
        background: repeating-linear-gradient(180deg, rgba(160,110,60,.55) 0 3px, rgba(140,95,50,.5) 3px 7px); border-left: 2px solid rgba(255,255,255,.55); }
      .pr-lane.l4 { border-right: 2px solid rgba(255,255,255,.55); }
      .pr-goal { position: absolute; left: calc(100cqw / 6); width: calc(400cqw / 6); top: calc(100cqh / 8 - 5px); height: 10px;
        background: conic-gradient(#fff 25%, #111 0 50%, #fff 0 75%, #111 0) 0 0 / 10px 10px; box-shadow: 0 0 6px rgba(0,0,0,.5); }
      .pr-start { position: absolute; left: calc(100cqw / 6); width: calc(400cqw / 6); top: calc(700cqh / 8 - 1px); height: 2px; background: rgba(255,255,255,.8); }
      .pr-row { position: absolute; left: 0; width: calc(100cqw / 6); top: calc((7 - var(--row)) * 100cqh / 8); height: calc(100cqh / 8); border-top: 1px dashed rgba(255,255,255,.15); }
      .pr-trophy { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); font-size: calc(var(--ch) * .42); filter: drop-shadow(0 2px 3px rgba(0,0,0,.5)); }
      html.fit .pr-track .pc { position: relative; margin: 0; height: var(--ch); width: calc(var(--ch) / 1.448); font-size: calc(var(--ch) * .3); aspect-ratio: auto; box-shadow: 0 3px 6px rgba(0,0,0,.4); }
      .pr-horse { transition: left .55s cubic-bezier(.3,1.3,.5,1), top .55s cubic-bezier(.3,1.3,.5,1); z-index: 3; }
      .pr-horse .pr-tag { position: absolute; z-index: 2; right: -18%; top: -14%; font-size: calc(var(--ch) * .34); line-height: 1; filter: drop-shadow(0 1px 2px rgba(0,0,0,.6)); }
      html.fit .pr-horse.lead .pc { box-shadow: 0 0 0 3px #f0b429, 0 3px 10px rgba(0,0,0,.5); }
      html.fit .pr-horse.win .pc { box-shadow: 0 0 0 4px #f0b429, 0 0 24px #f0b429; }
      .pr-horse.back .pr-tag { animation: pr-shake .5s ease-in-out .5s; }
      @keyframes pr-shake { 0%,100% { transform: none; } 25% { transform: rotate(-8deg); } 75% { transform: rotate(8deg); } }
      .pr-side.open .pc { filter: saturate(.85) brightness(.95); }
      html.fit .pr-side.next .pc-back { box-shadow: 0 0 0 3px #f0b429, 0 0 16px #f0b429; animation: pr-pulse 1s ease-in-out infinite alternate; }
      @keyframes pr-pulse { to { box-shadow: 0 0 0 3px #f0b429, 0 0 4px #f0b429; } }
      .pr-pile { border: 0; padding: 0; background: none; cursor: pointer; -webkit-tap-highlight-color: transparent; }
      .pr-pile .pc-back { box-shadow: 2px 2px 0 rgba(0,0,0,.3), 4px 4px 0 rgba(0,0,0,.2) !important; }
      .pr-pile:active { filter: brightness(.9); }
      .pr-count { position: absolute; z-index: 2; left: 50%; bottom: -.7em; transform: translateX(-50%); padding: 1px 7px; border-radius: 99px; background: #f0b429; color: #1b140c; font-weight: 800; font-size: calc(var(--ch) * .2); white-space: nowrap; }
      .pr-cur { --ch: min(calc(100cqh / 8 * 1.25), calc(100cqw / 6 * .92 * 1.448)); }
      .pr-flip .pc { animation: pr-flip .4s ease-out; }
      @keyframes pr-flip { from { transform: rotateY(90deg) scale(.9); } to { transform: none; } }
      .pr-cur-empty { flex: none; height: var(--ch); width: calc(var(--ch) / 1.448); border: 2px dashed rgba(255,255,255,.35); border-radius: 8px; }
      /* Quer (breiter als hoch): Bahnen liegen untereinander, die Pferde laufen nach rechts, Karten liegen quer */
      @container pr (min-aspect-ratio: 1/1) {
        .pr-x { --ch: min(calc(100cqw / 8 * .9), calc(100cqh / 6 * .9 * 1.448)); left: calc((var(--row) + .5) * 100cqw / 8); top: calc((var(--lane) + .5) * 100cqh / 6);
          width: var(--ch); height: calc(var(--ch) / 1.448); }
        .pr-in { transform: translate(-50%, -50%) rotate(90deg); }
        .pr-horse .pr-tag { right: -10%; top: -30%; transform: scaleX(-1); }
        .pr-count { bottom: auto; top: 50%; left: 100%; transform: translate(6px, -50%); }
        .pr-lane { top: calc(var(--lane) * 100cqh / 6); height: calc(100cqh / 6); left: 0; right: 0; width: auto; bottom: auto;
          background: repeating-linear-gradient(90deg, rgba(160,110,60,.55) 0 3px, rgba(140,95,50,.5) 3px 7px); border-left: 0; border-top: 2px solid rgba(255,255,255,.55); }
        .pr-lane.l4 { border-right: 0; border-bottom: 2px solid rgba(255,255,255,.55); }
        .pr-goal { top: calc(100cqh / 6); height: calc(400cqh / 6); left: calc(700cqw / 8 - 5px); width: 10px; }
        .pr-start { top: calc(100cqh / 6); height: calc(400cqh / 6); left: calc(100cqw / 8 - 1px); width: 2px; }
        .pr-row { top: 0; height: calc(100cqh / 6); left: calc(var(--row) * 100cqw / 8); width: calc(100cqw / 8); border-top: 0; border-left: 1px dashed rgba(255,255,255,.15); }
        .pr-cur { --ch: min(calc(100cqw / 8 * 1.3), calc(100cqh / 6 * .95 * 1.448)); }
      }
      .pr-bets { flex: none; display: flex; flex-wrap: wrap; justify-content: center; gap: 4px 6px; margin: 0; padding: 0; list-style: none; font-size: clamp(.72rem, 1.8dvh, .95rem); }
      .pr-bets li { padding: 2px 9px; border-radius: 99px; background: var(--surface, rgba(255,255,255,.08)); white-space: nowrap; }
      .pr-bets li.win { background: #f0b429; color: #1b140c; }
      .pr-bets .r { color: #e5484d; }
      .pr-bets li.win .r { color: #9b1c1c; }
      /* Wetten */
      .pr-picks { display: grid; grid-template-columns: repeat(4, 1fr); gap: clamp(6px, 2vw, 16px); align-items: start; }
      .pr-pick { border: 0; padding: 0; background: none; display: flex; flex-direction: column; align-items: center; gap: 4px; color: inherit; font: inherit; cursor: pointer; -webkit-tap-highlight-color: transparent; }
      html.fit .pr-pick .pc { margin: 0; width: min(21vw, 15dvh, 130px); height: auto; aspect-ratio: 58 / 84; font-size: min(6vw, 4.4dvh, 2.4rem); transition: transform .15s; }
      .pr-pick.on .pc { box-shadow: 0 0 0 4px #f0b429, 0 0 18px #f0b429; transform: translateY(-4px); }
      .pr-pick small { font-size: clamp(.7rem, 1.7dvh, .9rem); opacity: .8; text-align: center; line-height: 1.25; min-height: 1.25em; }
      .pr-sips { display: flex; justify-content: center; gap: clamp(6px, 2vw, 12px); flex-wrap: wrap; }
      .pr-sips .btn { min-width: 0; width: clamp(48px, 15vw, 76px); padding: clamp(8px, 1.6dvh, 14px) 0; font-size: clamp(1.1rem, 3dvh, 1.5rem); display: flex; flex-direction: column; align-items: center; line-height: 1.1; }
      .pr-sips .btn small { font-size: .55em; opacity: .8; font-weight: 600; }
      .pr-hint { margin: 0; text-align: center; opacity: .8; font-size: clamp(.85rem, 2dvh, 1.05rem); }
      .pr-status { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px; list-style: none; margin: 0; padding: 0; }
      .pr-status li { padding: 3px 10px; border-radius: 99px; background: var(--surface, rgba(255,255,255,.08)); opacity: .6; }
      .pr-status li.done { opacity: 1; }
      @media (min-aspect-ratio: 6/5) and (max-height: 520px) {
        html.fit .pr-pick .pc { width: min(12vw, 26dvh, 120px); font-size: min(3.6vw, 7.6dvh, 2.2rem); }
        .pr-picks { max-width: 640px; margin: 0 auto; }
      }
    `;
    document.head.appendChild(css);
  }

  // --- Spielablauf ---

  function newRace(s) {
    s.round++;
    s.stage = "bet";
    s.bets = {};
    s.pick = {};
    s.better = 0; // ein Handy: wer gerade setzt (Index in humans)
    const deck = shuffle(SUITS.flatMap((suit) => RANKS.map((rank) => ({ suit, rank }))));
    s.side = deck.splice(0, SIDE);
    s.deck = deck;
    s.pos = [0, 0, 0, 0];
    s.sideOpen = 0; // so viele Seitenkarten sind umgedreht
    s.sidePending = false; // alle Pferde sind über die nächste Reihe, Seitenkarte ist dran
    s.last = null; // zuletzt umgedrehte Karte vom Stapel
    s.moved = null; // { suit, dir } für die Animation
    s.flips = 0;
    s.winner = null;
  }

  function startRace(s) {
    s.stage = "race";
  }

  function finish(s, w) {
    s.winner = w;
    s.stage = "result";
    const items = [];
    const win = [];
    const lose = [];
    for (const p of s.players) {
      const b = s.bets[p];
      if (!b) continue;
      if (b.suit === w) {
        items.push({ who: p, n: b.n * 2, give: true, text: t("auf {suit} gesetzt, doppelter Einsatz", { suit: suitName(w) }) });
        s.tally[p].give += LEVELS[levelOf(s)].scale(b.n * 2);
        win.push(p);
      } else {
        items.push({ who: p, n: b.n, text: t("auf {suit} gesetzt", { suit: suitName(b.suit) }) });
        s.tally[p].drank += LEVELS[levelOf(s)].scale(b.n);
        lose.push(p);
      }
    }
    score(s, win, lose);
    if (items.length) drink(s, items);
  }

  function flip(s) {
    if (s.sidePending) {
      const c = s.side[s.sideOpen];
      const i = suitIdx(c);
      s.sideOpen++;
      s.sidePending = false;
      s.moved = null;
      if (s.pos[i] > 0) {
        s.pos[i]--;
        s.moved = { suit: i, dir: -1 };
      }
      notice(s, { emoji: "↩️", title: t("{suit} muss zurück!", { suit: suitName(i) }), text: t("Seitenkarte {card}", { card: cardName(c) }) });
      checkSide(s);
      return;
    }
    if (!s.deck.length) {
      // Kommt praktisch nie vor: Stapel leer, dann gewinnt das Pferd vorne (bei Gleichstand das erste).
      const max = Math.max(...s.pos);
      return finish(s, s.pos.indexOf(max));
    }
    const c = s.deck.pop();
    const i = suitIdx(c);
    s.last = c;
    s.flips++;
    s.pos[i]++;
    s.moved = { suit: i, dir: 1 };
    if (s.pos[i] >= GOAL) return finish(s, i);
    checkSide(s);
  }

  function checkSide(s) {
    if (s.sideOpen < SIDE && Math.min(...s.pos) > s.sideOpen) s.sidePending = true;
  }

  // Bot-Einsatz: irgendein Pferd, meistens 1 bis 3 Schlucke
  function botBet() {
    const r = Math.random();
    return { suit: Math.floor(Math.random() * 4), n: r < 0.3 ? 1 : r < 0.6 ? 2 : r < 0.82 ? 3 : r < 0.94 ? 4 : 5 };
  }

  // --- Ansicht ---

  function betsHtml(s, winner = null) {
    const groups = [0, 1, 2, 3]
      .map((i) => {
        const who = s.players.filter((p) => s.bets[p]?.suit === i);
        if (!who.length) return "";
        const sym = SUITS[i].red ? `<span class="r">${SUITS[i].symbol}</span>` : SUITS[i].symbol;
        return `<li class="${winner === i ? "win" : ""}">${sym} ${who.map((p) => `${escapeHtml(p)} ${s.bets[p].n}`).join(", ")}</li>`;
      })
      .join("");
    return groups ? `<ul class="pr-bets">${groups}</ul>` : "";
  }

  function trackHtml(s) {
    const cell = (lane, row, cls, inner, outer = "", extra = "") => `<div class="pr-x ${cls}" style="--lane:${lane};--row:${row}" ${extra}><div class="pr-in">${inner}</div>${outer}</div>`;
    let h = "";
    for (let l = 1; l <= 4; l++) h += `<div class="pr-lane l${l}" style="--lane:${l}"></div>`;
    for (let r = 1; r <= SIDE; r++) h += `<div class="pr-row" style="--row:${r}"></div>`;
    h += `<div class="pr-start"></div><div class="pr-goal"></div>`;
    h += cell(0, GOAL, "", "", `<span class="pr-trophy">🏆</span>`);
    // Seitenkarten
    for (let r = 1; r <= SIDE; r++) {
      const open = r <= s.sideOpen;
      const next = s.sidePending && r === s.sideOpen + 1;
      h += cell(0, r, `pr-side ${open ? "open" : ""} ${next ? "next" : ""}`, playingCardHtml(open ? s.side[r - 1] : null));
    }
    // Pferde
    const max = Math.max(...s.pos);
    for (let i = 0; i < 4; i++) {
      const lead = s.stage === "race" && max > 0 && s.pos[i] === max;
      const win = s.winner === i;
      const back = s.moved?.suit === i && s.moved.dir < 0;
      h += cell(i + 1, s.pos[i], `pr-horse ${lead ? "lead" : ""} ${win ? "win" : ""} ${back ? "back" : ""}`, playingCardHtml(ace(i)), `<span class="pr-tag">${win ? "🏆" : "🐎"}</span>`, `data-horse="${i}"`);
    }
    // Stapel und zuletzt umgedrehte Karte
    const canFlip = s.stage === "race";
    const pile = s.deck.length
      ? canFlip
        ? `<button class="pr-pile" data-act='${JSON.stringify(flipAct(s))}' aria-label="${escapeHtml(t("Karte umdrehen"))}">${playingCardHtml(null)}</button>`
        : playingCardHtml(null)
      : `<div class="pr-cur-empty"></div>`;
    h += cell(5, 0.12, "pr-deck", pile, s.deck.length ? `<span class="pr-count">${s.deck.length}</span>` : "");
    h += cell(5, 1.75, `pr-cur ${s.last ? "pr-flip" : ""}`, s.last ? playingCardHtml(s.last) : `<div class="pr-cur-empty"></div>`, "", `data-flips="${s.flips}"`);
    return `<div class="pr-track">${h}</div>`;
  }

  function flipAct(s) {
    return { type: "flip", round: s.round, n: s.flips, side: s.sideOpen, pending: s.sidePending };
  }

  function introView(s) {
    const [a, b, c] = [...new Set([...humans(s), "Tom", "Paula", "Kalle"])].map(escapeHtml);
    return {
      phase: t("So geht Pferderennen"),
      title: t("Setzt auf ein Ass und feuert es an!"),
      body: `<ol class="za-intro">
          <li>${t("Die vier <b>Asse</b> sind die Pferde. Jeder setzt <b>1 bis 5 Schlucke</b> auf eins.")}</li>
          <li>${t("Karte für Karte wird der Stapel umgedreht. Das Ass mit <b>derselben Farbe</b> rückt ein Feld vor.")}</li>
          <li>${t("Neben der Bahn liegen {n} verdeckte Karten. Haben <b>alle Pferde</b> eine Reihe erreicht, wird ihre Karte umgedreht und das Pferd mit dieser Farbe muss <b>ein Feld zurück</b>.", { n: SIDE })}</li>
          <li>${t("Wer aufs Siegerpferd gesetzt hat, <b>verteilt das Doppelte</b>. Alle anderen trinken ihren Einsatz.")}</li>
        </ol>
        <p class="za-example">${t("Beispiel: {a} setzt 3 auf Herz, {b} 2 auf Pik, {c} 1 auf Herz. Herz gewinnt: {a} verteilt 6 Schlucke, {c} verteilt 2, {b} trinkt 2.", { a, b, c })}</p>`,
      actions: [{ label: t("Verstanden, Einsätze machen 🏇"), act: { type: "go" } }],
    };
  }

  function betHtml(s, who) {
    const pick = s.pick[who];
    const picks = [0, 1, 2, 3]
      .map((i) => {
        const on = pick === i;
        const others = s.players.filter((p) => s.bets[p]?.suit === i).map((p) => `${escapeHtml(p)} ${s.bets[p].n}`);
        return `<button class="pr-pick ${on ? "on" : ""}" data-act='${escapeHtml(JSON.stringify({ type: "pick", round: s.round, who, suit: i }))}' data-by="${escapeHtml(who)}">${playingCardHtml(ace(i))}<small>${escapeHtml(suitName(i))}${others.length ? `<br>${others.join("<br>")}` : ""}</small></button>`;
      })
      .join("");
    const sipsBtns =
      pick == null
        ? `<p class="pr-hint">${t("Tipp auf ein Pferd.")}</p>`
        : `<p class="pr-hint">${t("Wie viele Schlucke auf {suit}?", { suit: escapeHtml(suitName(pick)) })}</p><div class="pr-sips">${BETS.map(
            (n) => `<button class="btn" data-act='${escapeHtml(JSON.stringify({ type: "bet", round: s.round, who, n }))}' data-by="${escapeHtml(who)}">${n}<small>${n === 1 ? t("Schluck") : t("Schlucke")}</small></button>`,
          ).join("")}</div>`;
    return `<div class="pr-picks">${picks}</div>${sipsBtns}`;
  }

  function statusHtml(s) {
    return `<ul class="pr-status">${s.players.map((p) => `<li class="${s.bets[p] ? "done" : ""}">${s.bets[p] ? "✅" : "⏳"} ${escapeHtml(p)}</li>`).join("")}</ul>`;
  }

  function betView(s, me) {
    const phase = `${t("Rennen {n}", { n: s.round })} · ${t("Einsätze")}`;
    const auto = s.players.some((p) => isBot(p) && !s.bets[p]) ? { key: `pr-bots-${s.round}`, act: { type: "bots", round: s.round }, ms: 1400 + Math.random() * 1200 } : null;
    if (me) {
      const done = !!s.bets[me];
      const missing = s.players.filter((p) => !s.bets[p]);
      const given = s.players.length - missing.length;
      const actions = done && given >= 1 && missing.length && missing.every((p) => !isBot(p)) ? [{ label: t("Ohne die anderen starten"), sub: missing.join(", "), ghost: true, act: { type: "start", round: s.round } }] : [];
      return {
        phase,
        title: done ? t("Du setzt {n} auf {suit}. Warte auf die anderen…", { n: s.bets[me].n, suit: escapeHtml(suitName(s.bets[me].suit)) }) : t("Auf welches Pferd setzt du?"),
        body: done ? statusHtml(s) : betHtml(s, me),
        actions,
        auto,
      };
    }
    const hs = humans(s);
    const who = hs[s.better];
    if (!who) return { phase, title: t("Die Bots setzen noch…"), body: statusHtml(s), actions: [], auto };
    return { phase, title: t("{name}, auf welches Pferd setzt du?", { name: nm(who) }), body: betHtml(s, who), actions: [], turn: who, auto };
  }

  function raceView(s) {
    const phase = `${t("Rennen {n}", { n: s.round })} · ${t("noch {n} Karten", { n: s.deck.length })}`;
    let title;
    if (s.sidePending) title = t("Alle Pferde sind über Reihe {n}! Seitenkarte umdrehen.", { n: s.sideOpen + 1 });
    else if (s.moved?.dir < 0) title = t("↩️ {suit} muss ein Feld zurück!", { suit: escapeHtml(suitName(s.moved.suit)) });
    else if (s.last) title = t("{card}: {suit} rückt vor!", { card: escapeHtml(cardName(s.last)), suit: escapeHtml(suitName(suitIdx(s.last))) });
    else title = t("Und los! Tippt auf den Stapel.");
    const auto = s.autoRun ? { key: `pr-run-${s.round}-${s.flips}-${s.sideOpen}`, act: flipAct(s), ms: s.sidePending ? 1500 : 1000 } : null;
    return {
      phase,
      title,
      body: `${trackHtml(s)}${betsHtml(s)}`,
      actions: [
        { label: s.sidePending ? t("Seitenkarte ↩️") : t("Karte umdrehen"), act: flipAct(s) },
        { label: s.autoRun ? t("⏸ Anhalten") : t("▶️ Automatisch"), act: { type: "auto", round: s.round, on: !s.autoRun }, ghost: true },
      ],
      auto,
    };
  }

  function resultView(s, me) {
    const w = s.winner;
    const winners = s.players.filter((p) => s.bets[p]?.suit === w);
    const youWon = me && winners.includes(me);
    const title = `🏆 ${t("{suit} gewinnt!", { suit: escapeHtml(suitName(w)) })} ${
      !winners.length ? t("Keiner hat drauf gesetzt, alle trinken.") : me ? (youWon ? t("Du verteilst!") : t("Du trinkst.")) : t(winners.length === 1 ? "{names} verteilt." : "{names} verteilen.", { names: winners.map(nm).join(", ") })
    }`;
    const tally = [...s.players]
      .sort((a, b) => s.tally[b].drank - s.tally[a].drank)
      .map((p) => `<li><span>${escapeHtml(p)}</span><span><b>${s.tally[p].drank}</b> ${drinkEmoji(s)} · ${s.tally[p].give} ${t("verteilt")}</span></li>`)
      .join("");
    return {
      phase: `${t("Rennen {n}", { n: s.round })} · ${t("Ziel!")}`,
      title,
      body: `${trackHtml(s)}${betsHtml(s, w)}${s.round > 1 ? `<ul class="za-tally">${tally}</ul>` : ""}`,
      actions: [
        { label: t("Nächstes Rennen 🏇"), act: { type: "next", round: s.round } },
        { label: t("Zum Menü"), exit: true, ghost: true },
      ],
    };
  }

  // Pferde gleiten vom alten Feld aufs neue (das Spiel zeichnet jedes Mal alles neu)
  let prev = null;
  function animate(root, s) {
    const same = prev && prev.gid === s.gid && prev.round === s.round;
    let ms = 0;
    root.querySelectorAll(".pr-horse").forEach((el) => {
      const i = +el.dataset.horse;
      const from = same ? prev.pos[i] : s.pos[i];
      if (from === s.pos[i]) return;
      el.style.transition = "none";
      el.style.setProperty("--row", from);
      void el.offsetWidth;
      el.style.transition = "";
      el.style.setProperty("--row", s.pos[i]);
      ms = 650;
    });
    if (same && prev.flips === s.flips) root.querySelector(".pr-cur")?.classList.remove("pr-flip");
    prev = { gid: s.gid, round: s.round, pos: [...(s.pos ?? [])], flips: s.flips };
    return ms;
  }

  registerGame(KEY, {
    label: "Pferderennen",
    emoji: "🏇",
    description: "Die vier Asse laufen um die Wette. Setzt Schlucke auf euer Pferd.",
    color: "#16a34a",
    fit: true,
    rules: [
      "Die vier Asse sind die Pferde und stehen am Start. Neben der Bahn liegen 6 verdeckte Seitenkarten, eine pro Reihe.",
      "Vor dem Rennen setzt jeder 1 bis 5 Schlucke auf ein Pferd (eine Farbe). Auf einem Handy reihum, mit mehreren Handys jeder am eigenen.",
      "Dann wird Karte für Karte vom Stapel umgedreht. Das Ass mit derselben Farbe rückt ein Feld vor.",
      "Haben alle vier Pferde eine Reihe erreicht, wird die Seitenkarte dieser Reihe umgedreht. Das Pferd mit ihrer Farbe muss ein Feld zurück.",
      "Wer zuerst durchs Ziel (nach Reihe 6) läuft, gewinnt. Wer auf dieses Pferd gesetzt hat, verteilt das Doppelte seines Einsatzes. Alle anderen trinken ihren Einsatz.",
      "Mit „Automatisch“ dreht die App die Karten alleine um, ihr müsst nur noch anfeuern.",
      "Bots setzen selbst, irgendwo zwischen 1 und 5 Schlucken.",
    ],

    setup(players) {
      const s = { players, stage: "intro", round: 0, bets: {}, pick: {}, pos: [0, 0, 0, 0], deck: [], side: [], sideOpen: 0, flips: 0, tally: {}, autoRun: false };
      for (const p of players) s.tally[p] = { drank: 0, give: 0 };
      return s;
    },

    view(s, me) {
      if (s.stage === "intro") return introView(s);
      if (s.stage === "bet") return betView(s, me);
      if (s.stage === "race") return raceView(s);
      return resultView(s, me);
    },

    afterRender(root, s) {
      return animate(root, s);
    },

    // Bots haben keine eigenen Knöpfe, sie setzen über „bots“ (auto)
    bot(s, name, acts) {
      return acts[0];
    },

    act(s, a, by) {
      if (s.stage === "intro" && a.type === "go") return newRace(s);
      if (a.round !== s.round) return;
      if (s.stage === "bet") {
        const ok = (p) => s.players.includes(p) && !isBot(p) && !s.bets[p];
        if (a.type === "pick" && ok(a.who) && a.suit >= 0 && a.suit < 4) s.pick[a.who] = a.suit;
        else if (a.type === "bet" && ok(a.who) && s.pick[a.who] != null && BETS.includes(a.n)) {
          s.bets[a.who] = { suit: s.pick[a.who], n: a.n };
          const hs = humans(s);
          while (s.better < hs.length && s.bets[hs[s.better]]) s.better++;
        } else if (a.type === "bots") {
          for (const p of s.players) if (isBot(p) && !s.bets[p]) s.bets[p] = botBet();
        } else if (a.type === "start" && Object.keys(s.bets).length) {
          return startRace(s);
        } else return;
        if (allBet(s)) startRace(s);
      } else if (s.stage === "race") {
        if (a.type === "flip" && a.n === s.flips && a.side === s.sideOpen && !!a.pending === s.sidePending) flip(s);
        else if (a.type === "auto") s.autoRun = !!a.on;
      } else if (s.stage === "result" && a.type === "next") {
        newRace(s);
      }
    },
  });
})();
