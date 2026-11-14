// Kartenstapel: ein gemischter Stapel, man deckt immer die oberste Karte auf, bis er leer ist.
// Regeln gibt es keine, die macht die Runde selbst. Stapel: 2 bis Ass (52) oder 7 bis Ass (32).
(() => {
  const KEY = "stapel";
  const DECKS = {
    52: { label: "2 bis Ass", ranks: ["2", "3", "4", "5", "6", "7", "8", "9", "10", "B", "D", "K", "A"] },
    32: { label: "7 bis Ass", ranks: ["7", "8", "9", "10", "B", "D", "K", "A"] },
  };
  const NAMES = { B: "Bube", D: "Dame", K: "König", A: "Ass" };
  const SHOW_LAST = 8; // so viele aufgedeckte Karten liegen klein unten

  // CSS kommt aus dieser Datei, damit style.css nicht angefasst werden muss.
  if (!document.getElementById("st-style")) {
    const css = document.createElement("style");
    css.id = "st-style";
    css.textContent = `
      .st-table { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; gap: clamp(14px, 6vw, 48px); }
      .st-pile { position: relative; border: 0; padding: 0; background: none; cursor: pointer; -webkit-tap-highlight-color: transparent; }
      .st-pile .pc { margin: 0; }
      .st-pile .pc-back { box-shadow: 3px 3px 0 rgba(0,0,0,.25), 6px 6px 0 rgba(0,0,0,.18), 9px 9px 0 rgba(0,0,0,.12); }
      .st-pile.thin .pc-back { box-shadow: 2px 2px 0 rgba(0,0,0,.25); }
      .st-pile.empty .pc-back { opacity: .25; box-shadow: none; }
      .st-pile:active .pc-back { transform: translateY(2px); }
      .st-count { position: absolute; left: 50%; bottom: -0.9em; transform: translateX(-50%); padding: 2px 10px; border-radius: 99px; background: var(--primary, #f0b429); color: #1b140c; font-weight: 800; font-size: clamp(.8rem, 2dvh, 1rem); white-space: nowrap; }
      html.fit .st-table .pc-big { height: clamp(110px, min(36dvh, 56vw), 360px); font-size: clamp(2rem, min(9dvh, 14vw), 4.4rem); }
      .st-slot { display: flex; align-items: center; justify-content: center; }
      .st-slot .pc { margin: 0; }
      .st-empty-slot { border: 2px dashed currentColor; opacity: .3; border-radius: 12px; }
      .st-flip { animation: st-flip .32s ease-out; }
      @keyframes st-flip { from { transform: translateX(-40%) rotateY(90deg) scale(.9); opacity: .4; } to { transform: none; opacity: 1; } }
      .st-last { display: flex; justify-content: center; gap: 4px; flex-wrap: nowrap; overflow: hidden; min-height: 0; }
      .st-last .pc { margin: 0; }
      .st-hint { margin: 0; text-align: center; opacity: .75; font-size: clamp(.85rem, 2dvh, 1rem); }
      .st-done { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; text-align: center; }
      .st-choice { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; }
      .st-choice button { min-width: 9em; }
      .st-choice button.on { outline: 3px solid var(--primary, #f0b429); outline-offset: 2px; }
      .bf-body:has(.st-table) { display: flex; flex-direction: column; gap: clamp(8px, 2dvh, 18px); }
    `;
    document.head.appendChild(css);
  }

  function newDeck(size) {
    return shuffle(SUITS.flatMap((suit) => DECKS[size].ranks.map((rank) => ({ suit, rank }))));
  }

  function cardName(c) {
    return `${c.suit.name} ${NAMES[c.rank] ?? c.rank}`;
  }

  function deal(s, size) {
    s.size = size;
    s.deck = newDeck(size);
    s.shown = [];
    s.round = (s.round ?? 0) + 1;
    s.stage = "play";
  }

  function choiceHtml(s) {
    return `<div class="st-choice">${[52, 32]
      .map(
        (n) =>
          `<button class="btn ghost ${n === s.size ? "on" : ""}" data-act='${JSON.stringify({ type: "size", size: n })}'>${escapeHtml(t(DECKS[n].label))} · ${n} ${escapeHtml(t("Karten"))}</button>`,
      )
      .join("")}</div>`;
  }

  function introView(s) {
    return {
      phase: t("So geht der Kartenstapel"),
      title: t("Oberste Karte aufdecken, eure Regeln."),
      body: `<ol class="za-intro">
          <li>${t("Ein gemischter Stapel: <b>2 bis Ass</b>, jede Karte 4-mal (52 Karten). Oder der kurze Stapel <b>7 bis Ass</b> (32 Karten).")}</li>
          <li>${t("Tippt auf den Stapel, dann wird die oberste Karte aufgedeckt. Immer weiter, bis der Stapel leer ist.")}</li>
          <li>${t("Regeln gibt es keine. Ihr legt selbst fest, was welche Karte bedeutet.")}</li>
        </ol>
        <p class="za-example">${t("Beispiel: Rot trinkt, Schwarz verteilt. Bei einem Ass trinken alle, bei einer 7 wird eine neue Regel gemacht.")}</p>
        <p class="st-hint">${t("Welcher Stapel?")}</p>
        ${choiceHtml(s)}`,
      actions: [{ label: t("Stapel mischen, los geht's 🃏"), act: { type: "go" } }],
    };
  }

  function playView(s) {
    const left = s.deck.length;
    const total = s.size;
    const cur = s.shown[s.shown.length - 1];
    const next = s.players[s.shown.length % s.players.length];
    const pile = left
      ? `<button class="st-pile ${left < 4 ? "thin" : ""}" data-act='${JSON.stringify({ type: "draw", n: s.shown.length, round: s.round })}' aria-label="${escapeHtml(t("Karte aufdecken"))}">${playingCardHtml(null, "pc-big")}<span class="st-count">${left}</span></button>`
      : `<div class="st-pile empty">${playingCardHtml(null, "pc-big")}<span class="st-count">0</span></div>`;
    const slot = cur
      ? `<div class="st-slot">${playingCardHtml(cur, `pc-big st-flip`)}</div>`
      : `<div class="st-slot"><div class="pc pc-big st-empty-slot"></div></div>`;
    const last = s.shown
      .slice(-SHOW_LAST - 1, -1)
      .map((c) => playingCardHtml(c, "pc-small"))
      .join("");
    const players = s.players.length > 1 ? ` · ${t("als Nächstes: {name}", { name: escapeHtml(next) })}` : "";
    return {
      phase: `${t("Kartenstapel")} · ${t("noch {n} von {total}", { n: left, total })}${left ? players : ""}`,
      title: cur ? escapeHtml(t(cardName(cur))) : t("Tippt auf den Stapel"),
      body: `<div class="st-table">${pile}${slot}</div>${
        left ? (last ? `<div class="st-last">${last}</div>` : "") : `<p class="st-hint">${t("Stapel leer! 🎉 Neu mischen oder den anderen Stapel nehmen.")}</p>${choiceHtml(s)}`
      }`,
      actions: left
        ? [
            { label: t("Karte aufdecken"), act: { type: "draw", n: s.shown.length, round: s.round } },
            { label: t("Neu mischen"), act: { type: "shuffle" }, ghost: true },
          ]
        : [
            { label: t("Neu mischen 🔀"), act: { type: "shuffle" } },
            { label: t("Zum Menü"), exit: true, ghost: true },
          ],
    };
  }

  registerGame(KEY, {
    label: "Kartenstapel",
    emoji: "🃏",
    description: "Ein gemischter Stapel, die oberste Karte aufdecken. Die Regeln macht ihr selbst.",
    color: "#dc2626",
    fit: true,
    rules: [
      "Ein gemischter Stapel: 2 bis Ass, jede Karte 4-mal (52 Karten). Am Anfang (und wenn der Stapel leer ist) kann man auch den kurzen Stapel 7 bis Ass (32 Karten) wählen.",
      "Tippt auf den Stapel, dann wird die oberste Karte aufgedeckt. Eine nach der anderen, bis der Stapel leer ist.",
      "Regeln gibt es keine. Ihr legt selbst fest, was jede Karte bedeutet, z. B. Rot trinkt, Schwarz verteilt.",
      "Ist der Stapel leer, mischt ihr neu oder nehmt den anderen Stapel.",
    ],

    setup(players) {
      return { players, stage: "intro", size: 52, deck: [], shown: [], round: 0 };
    },

    view(s) {
      return s.stage === "intro" ? introView(s) : playView(s);
    },

    // Bots haben hier nichts zu drücken: Es gibt keine Knöpfe nur für einen Spieler.
    bot(s, name, acts) {
      return acts[0];
    },

    act(s, a) {
      if (a.type === "size" && DECKS[a.size]) {
        if (s.stage === "intro") s.size = a.size;
        else if (!s.deck.length) deal(s, a.size);
      } else if (s.stage === "intro" && a.type === "go") {
        deal(s, s.size);
      } else if (s.stage === "play" && a.type === "draw" && a.round === s.round && a.n === s.shown.length && s.deck.length) {
        s.shown.push(s.deck.pop());
      } else if (s.stage === "play" && a.type === "shuffle") {
        deal(s, s.size);
      }
    },
  });
})();
