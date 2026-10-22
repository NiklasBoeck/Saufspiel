// F*ck den Dealer: Die App ist der Stapel. Wer rät, tippt auf den Wert der obersten Karte (2 bis Ass),
// beim ersten Fehlversuch sagt die App „höher“ oder „niedriger“. Der Dealer wechselt nach 3 Fehlschlägen in Folge.
// Ein Handy: Beim Raten hält der Dealer das Handy und tippt die angesagten Tipps ein, danach sehen alle den Tisch.
// Jeder sein Handy: Der Dealer sieht immer die oberste Karte, alle anderen den Tisch.
(() => {
  const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "B", "D", "K", "A"];
  const NAMES = { 11: "Bube", 12: "Dame", 13: "König", 14: "Ass" };
  const STRIKES = 3;

  const label = (v) => RANKS[v - 2];
  const cardName = (v) => NAMES[v] ?? String(v);
  const name = (p) => `<b>${escapeHtml(p)}</b>`;

  function newDeck() {
    return shuffle(SUITS.flatMap((suit) => RANKS.map((rank, i) => ({ suit, rank, value: i + 2 }))));
  }

  // Nächster Spieler nach i, der nicht Dealer ist.
  function nextGuesser(s, i) {
    for (let k = 0; k < s.players.length; k++) {
      i = (i + 1) % s.players.length;
      if (i !== s.dealer) break;
    }
    return i;
  }

  function playedCount(s, v) {
    return s.played.filter((c) => c.value === v).length;
  }

  // --- Anzeige ---

  // Die gespielten Karten liegen sortiert auf dem Tisch, gleiche Werte leicht versetzt übereinander.
  function tableCardHtml(c, j, fresh) {
    const isNew = fresh && c.rank === fresh.rank && c.suit.name === fresh.suit.name;
    return `<div class="fd-card ${c.suit.red ? "red" : ""} ${isNew ? "new" : ""}" style="--j:${j}"><span>${c.rank}</span><span>${c.suit.symbol}</span></div>`;
  }

  // tap: { by, allowed(v) } macht die Stapel antippbar, damit die ratende Person direkt auf dem Tisch wählt.
  function boardHtml(s, fresh, tap) {
    const pile = (v) => {
      const cards = s.played.filter((c) => c.value === v);
      const pips = Array.from({ length: 4 }, (_, i) => `<i class="${i < cards.length ? "on" : ""}"></i>`).join("");
      let attrs = "";
      if (tap) {
        const ok = cards.length < 4 && tap.allowed(v);
        attrs = ok
          ? ` data-act='${JSON.stringify({ type: "guess", value: v })}' data-by="${escapeHtml(tap.by)}" role="button"`
          : ` data-off`;
      }
      return `<div class="fd-pile ${cards.length === 4 ? "full" : ""}"${attrs}>
        <div class="fd-stack"><div class="fd-spot">${label(v)}</div>${cards.map((c, j) => tableCardHtml(c, j, fresh)).join("")}</div>
        <div class="fd-pips" title="${cards.length} von 4">${pips}</div>
      </div>`;
    };
    const row = (from, to) => `<div class="fd-row">${Array.from({ length: to - from + 1 }, (_, i) => pile(from + i)).join("")}</div>`;
    return `<div class="fd-table">${row(2, 8)}${row(9, 14)}</div>`;
  }

  function statusHtml(s) {
    const dots = Array.from({ length: STRIKES }, (_, i) => `<i class="${i < s.strikes ? "on" : ""}"></i>`).join("");
    return `<div class="fd-status">
      <div class="fd-role"><span>🃏 Dealer</span>${name(s.players[s.dealer])}</div>
      <div class="fd-role"><span>Fehlschläge</span><div class="fd-dots" title="${s.strikes} von ${STRIKES}">${dots}</div></div>
      <div class="fd-role"><span>Stapel</span><b>${s.deck.length}</b></div>
    </div>`;
  }

  function topCardHtml(s) {
    return `<div class="pc-row">${playingCardHtml(s.deck[s.deck.length - 1], "pc-big")}</div>`;
  }

  function rankActions(s, guesser, allowed, sub) {
    return RANKS.map((rank, i) => {
      const v = i + 2;
      const gone = playedCount(s, v) === 4;
      return {
        label: rank,
        sub: gone ? "weg" : allowed(v) ? sub(v) : "",
        act: { type: "guess", value: v },
        by: guesser,
        disabled: gone || !allowed(v),
      };
    });
  }

  function dealerTagHtml(s, me) {
    const dealer = s.players[s.dealer];
    return `<p class="fd-dealer">🃏 Dealer: <b>${me === dealer ? "Du" : escapeHtml(dealer)}</b></p>`;
  }

  function guessActions(s) {
    const guesser = s.players[s.guesser];
    if (s.stage === "guess1") return rankActions(s, guesser, () => true, (v) => `🍺${v}`);
    const higher = s.hint === "hoeher";
    return rankActions(s, guesser, (v) => (higher ? v > s.first : v < s.first), (v) => `🍺${Math.abs(v - s.first)}`);
  }

  const hintText = (s) => (s.hint === "hoeher" ? "höher ⬆" : "niedriger ⬇");

  // Ein Handy: Erst sehen alle den Tisch, dann bekommt nur der Dealer das Handy.
  function tableView(s) {
    const guesser = s.players[s.guesser];
    const dealer = s.players[s.dealer];
    return {
      phase: `F*ck den Dealer · noch ${s.deck.length} Karten`,
      title: `${name(guesser)} ist dran mit Raten`,
      body: statusHtml(s) + boardHtml(s) + `<p class="bf-text fd-center">Schaut euch an, was schon weg ist. Dann bekommt ${name(dealer)} das Handy.</p>`,
      actions: [{ label: `📱 Handy an ${dealer} geben`, act: { type: "peek" } }],
    };
  }

  function dealerOnlyView(s) {
    const guesser = name(s.players[s.guesser]);
    const second = s.stage === "guess2";
    return {
      phase: `F*ck den Dealer · ${second ? "zweiter Versuch" : "erster Versuch"}`,
      title: second ? `Sag ${guesser}: <span class="fd-hint">${hintText(s)}</span>` : `${guesser}, sag deinen Tipp an!`,
      body:
        dealerTagHtml(s) +
        topCardHtml(s) +
        `<p class="bf-text fd-center">${
          second ? `Erster Tipp war ${label(s.first)}. Tipp den zweiten Tipp von ${guesser} ein.` : `Tipp ein, was ${guesser} sagt.`
        }</p>`,
      actions: guessActions(s),
      actionsClass: "fd-ranks",
    };
  }

  // Jeder sein Handy: Der Dealer sieht die oberste Karte, alle anderen den Tisch.
  function guessView(s, me) {
    const guesser = name(s.players[s.guesser]);
    const second = s.stage === "guess2";
    const isDealer = me === s.players[s.dealer];
    const title = second
      ? `Nicht ${cardName(s.first)}! Die Karte ist <span class="fd-hint">${hintText(s)}</span>`
      : `${guesser} rät die oberste Karte`;
    const guesserName = s.players[s.guesser];
    const tap = { by: guesserName, allowed: second ? (v) => (s.hint === "hoeher" ? v > s.first : v < s.first) : () => true };
    const myTurn = me ? me === guesserName : !isBot(guesserName); // ohne me: ein Handy, Dealer ist ein Bot
    const body = isDealer
      ? `${dealerTagHtml(s, me)}${topCardHtml(s)}${statusHtml(s)}`
      : statusHtml(s) +
        boardHtml(s, null, tap) +
        (myTurn ? `<p class="bf-text fd-center">👆 Tipp auf dem Tisch auf die Karte, die du rätst.</p>` : "");
    return {
      phase: `F*ck den Dealer · ${second ? "zweiter Versuch" : `noch ${s.deck.length} Karten`}`,
      title,
      body,
      actions: [],
      turn: guesserName,
    };
  }

  function resultView(s, me) {
    const r = s.result;
    const titles = {
      hit1: `🎯 Volltreffer! ${name(r.who)} trinkt ${sips(r.n)}.`,
      hit2: `✅ Im zweiten Versuch! ${name(r.who)} trinkt ${sips(r.n)}.`,
      miss: `❌ Daneben! ${name(r.who)} trinkt ${sips(r.n)}.`,
    };
    const how = {
      hit1: `${cardName(r.card.value)} ist ${r.card.value} wert.`,
      hit2: `Abstand von ${label(r.guesses[0])} zu ${label(r.guesses[1])}.`,
      miss: `Getippt ${label(r.guesses[0])} und ${label(r.guesses[1])}, es war ${label(r.card.value)}: Abstand ${r.n}.`,
    };
    let extra = "";
    if (r.newDealer) {
      extra = `<p class="fd-swap">🔄 ${name(r.oldDealer)} hat ${STRIKES} Mal in Folge gewonnen und gibt ab. Neuer Dealer: ${name(r.newDealer)}</p>`;
    } else if (r.kind === "miss") {
      extra = `<p class="bf-text fd-center">Fehlschlag ${s.strikes} von ${STRIKES} für den Dealer.</p>`;
    }
    const last = !s.deck.length;
    return {
      phase: `F*ck den Dealer · noch ${s.deck.length} Karten`,
      title: titles[r.kind],
      body: `${dealerTagHtml(s, me)}<div class="pc-row">${playingCardHtml(r.card, "pc-big pc-new")}</div><p class="bf-text fd-center">${how[r.kind]}</p>${extra}${boardHtml(s, r.card)}`,
      actions: [{ label: last ? "Zur Abrechnung" : "Nächste Karte", act: { type: "next" }, by: s.players[s.dealer] }],
    };
  }

  function endView(s) {
    const ranking = [...s.players].sort((a, b) => s.tally[b] - s.tally[a]);
    const rows = ranking
      .map((p, i) => `<li><span>${i === 0 ? "👑 " : ""}${name(p)}</span><b>${sips(s.tally[p])}</b></li>`)
      .join("");
    return {
      phase: "F*ck den Dealer · Stapel leer",
      title: "Alle Karten gespielt! 🎉",
      body: `${boardHtml(s)}<p class="bf-text fd-center">Wer hat am meisten getrunken?</p><ul class="fd-tally">${rows}</ul>`,
      actions: [
        { label: "Nochmal spielen", act: { type: "restart" } },
        { label: "Zum Menü", exit: true, ghost: true },
      ],
    };
  }

  // --- Spielablauf ---

  function resolve(s, kind, who, n, guesses) {
    const card = s.deck.pop();
    s.played.push(card);
    s.tally[who] += n;
    s.result = { kind, who, n, card, guesses };
    const items = [{ who, n, text: kind === "miss" ? "fürs Danebenraten" : `als Dealer, ${label(card.value)} wurde erraten` }];

    if (kind === "miss") s.strikes++;
    else s.strikes = 0;

    if (s.strikes === STRIKES && s.deck.length) {
      s.result.oldDealer = s.players[s.dealer];
      s.dealer = (s.dealer + 1) % s.players.length;
      s.result.newDealer = s.players[s.dealer];
      s.strikes = 0;
    }
    drink(s, items);
    s.stage = "result";
  }

  function guess(s, v) {
    const top = s.deck[s.deck.length - 1];
    const guesser = s.players[s.guesser];
    const dealer = s.players[s.dealer];
    if (!(v >= 2 && v <= 14) || playedCount(s, v) === 4) return;
    if (s.stage === "guess1") {
      if (v === top.value) return resolve(s, "hit1", dealer, v, [v]);
      s.first = v;
      s.hint = top.value > v ? "hoeher" : "tiefer";
      s.stage = "guess2";
      const up = s.hint === "hoeher";
      notice(s, {
        emoji: up ? "⬆️" : "⬇️",
        title: up ? "Höher!" : "Niedriger!",
        text: `${guesser} hat ${cardName(v)} getippt. Noch ein Versuch!`,
      });
    } else {
      if (s.hint === "hoeher" ? v <= s.first : v >= s.first) return;
      if (v === top.value) resolve(s, "hit2", dealer, Math.abs(v - s.first), [s.first, v]);
      else resolve(s, "miss", guesser, Math.abs(v - top.value), [s.first, v]);
    }
  }

  // Bot rät den Wert in der Mitte der Karten, die noch im Stapel sein können (so wird der Abstand klein).
  function botGuess(s) {
    let pool = [];
    for (let v = 2; v <= 14; v++) {
      if (s.stage === "guess2" && (s.hint === "hoeher" ? v <= s.first : v >= s.first)) continue;
      for (let k = playedCount(s, v); k < 4; k++) pool.push(v);
    }
    if (!pool.length) return null;
    let v = pool[Math.floor(pool.length / 2)];
    if (Math.random() < 0.35) v = pool[Math.floor(Math.random() * pool.length)]; // mittel: nicht immer perfekt
    return { type: "guess", value: v };
  }

  registerGame("dealer", {
    label: "F*ck den Dealer",
    emoji: "🎴",
    description: "Errate die oberste Karte, sonst trinkst du. Der Dealer trinkt, wenn du triffst.",
    color: "#dc2626",
    fit: true,
    privateAlerts: true,

    setup(players) {
      const dealer = Math.floor(Math.random() * players.length);
      const s = { players, deck: newDeck(), played: [], dealer, guesser: -1, strikes: 0, stage: "guess1", tally: {} };
      for (const p of players) s.tally[p] = 0;
      s.guesser = nextGuesser(s, -1);
      return s;
    },

    view(s, me) {
      switch (s.stage) {
        case "guess1":
        case "guess2":
          // Ist der Dealer ein Bot, braucht niemand die Karte zu sehen: alle raten am Tisch.
          if (me || isBot(s.players[s.dealer])) return guessView(s, me);
          return s.peek ? dealerOnlyView(s) : tableView(s);
        case "result": return resultView(s, me);
        default: return endView(s);
      }
    },

    bot(s, name, acts) {
      return s.stage === "guess1" || s.stage === "guess2" ? botGuess(s) : acts[0];
    },

    act(s, a) {
      if (s.stage === "guess1" && a.type === "peek") s.peek = true;
      else if ((s.stage === "guess1" || s.stage === "guess2") && a.type === "guess") guess(s, a.value);
      else if (s.stage === "result" && a.type === "next") {
        if (!s.deck.length) s.stage = "end";
        else {
          s.guesser = nextGuesser(s, s.guesser);
          s.stage = "guess1";
          s.peek = false;
        }
      }
    },
  });
})();
