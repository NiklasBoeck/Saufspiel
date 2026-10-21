// F*ck den Dealer: Die App ist der Stapel. Wer rät, tippt auf den Wert der obersten Karte (2 bis Ass),
// beim ersten Fehlversuch sagt die App „höher“ oder „niedriger“. Der Dealer wechselt nach 3 Fehlschlägen in Folge.
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

  // Die gespielten Karten liegen sortiert in der Mitte, gleiche Werte übereinander.
  function boardHtml(s, fresh) {
    const piles = RANKS.map((rank, i) => {
      const cards = s.played.filter((c) => c.value === i + 2);
      const stack = cards
        .map((c, j) => `<div class="fd-slot" style="--j:${j}">${playingCardHtml(c, `pc-tiny ${fresh && c.rank === fresh.rank && c.suit.name === fresh.suit.name ? "pc-new" : ""}`)}</div>`)
        .join("");
      return `<div class="fd-pile ${cards.length === 4 ? "full" : ""}"><div class="fd-stack">${stack}</div><span>${rank}<small>${cards.length}/4</small></span></div>`;
    });
    return `<div class="fd-board">${piles.join("")}</div>`;
  }

  function statusHtml(s) {
    const dots = Array.from({ length: STRIKES }, (_, i) => `<i class="${i < s.strikes ? "on" : ""}"></i>`).join("");
    return `<div class="fd-status">
      <div class="fd-role"><span>🃏 Dealer</span>${name(s.players[s.dealer])}</div>
      <div class="fd-role"><span>Fehlschläge</span><div class="fd-dots" title="${s.strikes} von ${STRIKES}">${dots}</div></div>
      <div class="fd-role"><span>Stapel</span><b>${s.deck.length}</b></div>
    </div>`;
  }

  function peekHtml(s, me) {
    if (!me || me !== s.players[s.dealer] || !s.deck.length) return "";
    return `<div class="fd-peek">${playingCardHtml(s.deck[s.deck.length - 1], "pc-small")}<p>🤫 Nur du als Dealer siehst die oberste Karte.</p></div>`;
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

  function guess1View(s, me) {
    const guesser = s.players[s.guesser];
    const dealer = s.players[s.dealer];
    return {
      phase: `F*ck den Dealer · noch ${s.deck.length} Karten`,
      title: `${name(guesser)} rät die oberste Karte`,
      body:
        statusHtml(s) +
        peekHtml(s, me) +
        boardHtml(s) +
        drinkNoteHtml(`Sofort richtig: ${name(dealer)} trinkt so viele Schlucke wie die Karte wert ist (Bube 11, Dame 12, König 13, Ass 14).`),
      actions: rankActions(s, guesser, () => true, (v) => `🍺${v}`),
      actionsClass: "fd-ranks",
    };
  }

  function guess2View(s, me) {
    const guesser = s.players[s.guesser];
    const dealer = s.players[s.dealer];
    const higher = s.hint === "hoeher";
    return {
      phase: `F*ck den Dealer · zweiter Versuch`,
      title: `Nicht ${cardName(s.first)}! Die Karte ist <span class="fd-hint">${higher ? "höher ⬆" : "niedriger ⬇"}</span>`,
      body:
        statusHtml(s) +
        peekHtml(s, me) +
        boardHtml(s) +
        drinkNoteHtml(
          `Richtig: ${name(dealer)} trinkt den Abstand zu deinem ersten Tipp (${label(s.first)}). Falsch: ${name(guesser)} trinkt den Abstand zur echten Karte.`
        ),
      actions: rankActions(
        s,
        guesser,
        (v) => (higher ? v > s.first : v < s.first),
        (v) => `🍺${Math.abs(v - s.first)}`
      ),
      actionsClass: "fd-ranks",
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
      body: `<div class="pc-row">${playingCardHtml(r.card, "pc-big pc-new")}</div><p class="bf-text fd-center">${how[r.kind]}</p>${extra}${boardHtml(s, r.card)}`,
      actions: [{ label: last ? "Zur Abrechnung" : "Nächste Karte", act: { type: "next" } }],
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
    } else {
      if (s.hint === "hoeher" ? v <= s.first : v >= s.first) return;
      if (v === top.value) resolve(s, "hit2", dealer, Math.abs(v - s.first), [s.first, v]);
      else resolve(s, "miss", guesser, Math.abs(v - top.value), [s.first, v]);
    }
  }

  registerGame("dealer", {
    label: "F*ck den Dealer",
    emoji: "🎴",
    description: "Errate die oberste Karte, sonst trinkst du. Der Dealer trinkt, wenn du triffst.",
    color: "#dc2626",

    setup(players) {
      const dealer = Math.floor(Math.random() * players.length);
      const s = { players, deck: newDeck(), played: [], dealer, guesser: -1, strikes: 0, stage: "guess1", tally: {} };
      for (const p of players) s.tally[p] = 0;
      s.guesser = nextGuesser(s, -1);
      return s;
    },

    view(s, me) {
      switch (s.stage) {
        case "guess1": return guess1View(s, me);
        case "guess2": return guess2View(s, me);
        case "result": return resultView(s, me);
        default: return endView(s);
      }
    },

    act(s, a) {
      if ((s.stage === "guess1" || s.stage === "guess2") && a.type === "guess") guess(s, a.value);
      else if (s.stage === "result" && a.type === "next") {
        if (!s.deck.length) s.stage = "end";
        else {
          s.guesser = nextGuesser(s, s.guesser);
          s.stage = "guess1";
        }
      }
    },
  });
})();
