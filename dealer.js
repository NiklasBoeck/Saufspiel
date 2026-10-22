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
    return `<div class="fd-card ${c.suit.red ? "red" : ""} ${isNew ? "new" : ""} ${isNew && fresh.right ? "right" : ""}" style="--j:${j}"><span>${c.rank}</span><span>${c.suit.symbol}</span></div>`;
  }

  // tap: { by, allowed(v) } macht die Stapel antippbar, damit die ratende Person direkt auf dem Tisch wählt.
  // marks: { wert: "x" } zeigt rote Kreuze für die falschen Tipps dieser Runde.
  // banner: „Höher ⬆“ / „Niedriger ⬇“ oben im grünen Tisch, sobald der Dealer es gesagt hat.
  // gold: Der Dealer sieht die oberste Karte golden an ihrem Platz auf dem Tisch liegen.
  // Ein Zeichen poppt nur beim ersten Erscheinen auf und liegt danach still, auch wenn neu gezeichnet wird.
  const markSeen = new Map();
  function since(key) {
    if (!markSeen.has(key)) markSeen.set(key, Date.now());
    return (Date.now() - markSeen.get(key)) / 1000;
  }

  function bangHtml(round, v, picked) {
    if (picked !== v) return "";
    const t = since(`${round}-${v}-!`);
    if (t > 2) return "";
    return `<span class="fd-mark bang" style="animation-delay: ${-t}s, ${1.7 - t}s">!</span>`;
  }

  // Das Kreuz auf der gerade getippten Zahl (late) kommt erst nach dem „!“.
  function markHtml(round, v, mark, late) {
    if (!mark) return "";
    const d = (late ? 2 : 0) - since(`${round}-${v}-x`);
    const anim = d < -0.5 ? "still" : "";
    return `<span class="fd-mark ${mark} ${anim}" style="animation-delay: ${d}s">✗</span>`;
  }

  // Sind alle 4 Karten eines Werts gelegt, liegen sie umgedreht da. In der Runde, in der das passiert,
  // drehen sie sich nach der Landung der Karte nacheinander um.
  const FLIP_AT = 2.1;
  function stackHtml(s, round, v, cards, fresh) {
    const backs = cards.map((c, j) => `<div class="fd-card back" style="--j:${j}"></div>`).join("");
    if (cards.length < 4) return cards.map((c, j) => tableCardHtml(c, j, fresh)).join("");
    const completing = s.stage === "result" && s.result?.completed === v;
    if (!completing) return backs;
    const t = since(`${round}-${v}-flip`);
    if (t > FLIP_AT + 1.5) return backs;
    return cards
      .map((c, j) => {
        const at = FLIP_AT + j * 0.15 - t;
        return tableCardHtml(c, j, fresh).replace('class="fd-card', 'class="flip-out fd-card').replace(`style="--j:${j}"`, `style="--j:${j};--fd:${at}s"`) +
          `<div class="fd-card back flip-in" style="--j:${j};--fd:${at + 0.3}s"></div>`;
      })
      .join("");
  }

  // picked: gerade getippter Wert, 2 Sekunden lang mit „!“ markiert, erst danach kommt dort das Kreuz.
  function boardHtml(s, fresh, tap, marks = {}, banner = "", gold = null, picked = null) {
    const round = s.stage === "result" || s.stage === "end" ? s.played.length - 1 : s.played.length;
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
        <div class="fd-stack"><div class="fd-spot">${label(v)}</div>${stackHtml(s, round, v, cards, fresh)}${
          gold && gold.value === v
            ? `<div class="fd-card gold ${gold.suit.red ? "red" : ""}" style="--j:${cards.length}"><span>${gold.rank}</span><span>${gold.suit.symbol}</span></div>`
            : ""
        }</div>
        <div class="fd-pips" title="${cards.length} von 4">${pips}</div>
        ${bangHtml(round, v, picked)}${markHtml(round, v, marks[v], picked === v)}
      </div>`;
    };
    const row = (from, to) => `<div class="fd-row">${Array.from({ length: to - from + 1 }, (_, i) => pile(from + i)).join("")}</div>`;
    return `<div class="fd-table ${banner ? "has-banner" : ""}">${
      banner ? `<div class="fd-banner">${banner}</div>` : ""
    }${row(2, 8)}${row(9, 14)}</div>`;
  }

  // Kreuze je nach dem, was die Person schon wissen darf: firstKnown = erster Fehlversuch ist bekannt,
  // tip = gerade geprüfter Tipp (nur der Dealer kennt das Ergebnis schon).
  function marksFor(s, firstKnown, tip) {
    const m = {};
    if (firstKnown && s.first) m[s.first] = s.stage === "check" ? "x old" : "x"; // nach dem 2. Tipp etwas blasser
    if (tip && s.deck[s.deck.length - 1].value !== tip) m[tip] = "x";
    return m;
  }

  // Ampel mit den Fehlschlägen und Stapel; ohne Dealer-Kasten, wo der Dealer schon oben steht.
  function statusHtml(s, withDealer = true) {
    const dots = Array.from({ length: STRIKES }, (_, i) => `<i class="${i < s.strikes ? "on" : ""}"></i>`).join("");
    return `<div class="fd-status ${withDealer ? "" : "short"}">
      ${withDealer ? `<div class="fd-role"><span>🃏 Dealer</span>${name(s.players[s.dealer])}</div>` : ""}
      <div class="fd-role"><span>Fehlschläge</span><div class="fd-dots" title="${s.strikes} von ${STRIKES}">${dots}</div></div>
      <div class="fd-role"><span>Stapel</span><b>${s.deck.length}</b></div>
    </div>`;
  }

  const topCard = (s) => s.deck[s.deck.length - 1];

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

  const bannerText = (s) => (s.hint === "hoeher" ? "Höher ⬆" : "Niedriger ⬇");
  const hintText = (s) => (s.hint === "hoeher" ? "höher ⬆" : "niedriger ⬇");

  // Ein Handy: Erst sehen alle den Tisch, dann bekommt nur der Dealer das Handy.
  function tableView(s) {
    const guesser = s.players[s.guesser];
    const dealer = s.players[s.dealer];
    return {
      phase: "",
      title: `${name(guesser)} ist dran mit Raten`,
      body: statusHtml(s) + boardHtml(s) + `<p class="bf-text fd-center">Schaut euch an, was schon weg ist. Dann bekommt ${name(dealer)} das Handy.</p>`,
      actions: [{ label: `📱 Handy an ${dealer} geben`, act: { type: "peek" } }],
    };
  }

  function dealerOnlyView(s) {
    const guesser = name(s.players[s.guesser]);
    const second = s.stage === "guess2";
    if (s.stage === "hint") {
      return {
        phase: "Erster Versuch",
        title: `${guesser} tippt ${cardName(s.first)}`,
        body: dealerTagHtml(s) + topCardHtml(s) + `<p class="bf-text fd-center">Drück den Knopf und sag ${guesser}, ob die Karte höher oder niedriger ist.</p>`,
        actions: [sayAction(s)],
      };
    }
    return {
      phase: second ? "Zweiter Versuch" : "Erster Versuch",
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
  // Nach dem ersten Fehlversuch: Der Dealer sagt mit dem Knopf an, ob die Karte höher oder niedriger ist.
  function sayAction(s) {
    return { label: s.hint === "hoeher" ? "Höher ⬆" : "Niedriger ⬇", act: { type: "say" }, by: s.players[s.dealer] };
  }

  function confirmAction(s) {
    const right = s.pending.kind !== "miss";
    return { label: right ? "Richtig ✅" : "Falsch ❌", act: { type: "confirm" }, by: s.players[s.dealer] };
  }

  function checkView(s, me) {
    const guesser = name(s.players[s.guesser]);
    const tip = s.pending.guesses[s.pending.guesses.length - 1];
    const isDealer = me ? me === s.players[s.dealer] : s.peek;
    const two = s.pending.guesses.length === 2;
    return {
      phase: two ? "Zweiter Versuch" : "Erster Versuch",
      title: isDealer ? "" : `${guesser} tippt ${cardName(tip)}`,
      body: isDealer
        ? `${dealerTagHtml(s, me)}${topCardHtml(s)}${statusHtml(s, false)}${boardHtml(s, null, null, marksFor(s, two, tip), two ? bannerText(s) : "", topCard(s), tip)}`
        : statusHtml(s) + boardHtml(s, null, null, marksFor(s, two), two ? bannerText(s) : "", null, tip),
      actions: [confirmAction(s)],
    };
  }

  function guessView(s, me) {
    const guesser = name(s.players[s.guesser]);
    const second = s.stage === "guess2";
    const hint = s.stage === "hint";
    const isDealer = me === s.players[s.dealer];
    const title = second
      ? `${guesser} rät nochmal`
      : hint
        ? isDealer
          ? ""
          : `${guesser} tippt ${cardName(s.first)}`
        : `${guesser} rät die oberste Karte`;
    const banner = second ? bannerText(s) : "";
    const guesserName = s.players[s.guesser];
    const tap = hint ? null : { by: guesserName, allowed: second ? (v) => (s.hint === "hoeher" ? v > s.first : v < s.first) : () => true };
    const body = isDealer
      ? `${dealerTagHtml(s, me)}${topCardHtml(s)}${statusHtml(s, false)}${boardHtml(s, null, null, marksFor(s, hint || second), banner, topCard(s), hint ? s.first : null)}`
      : statusHtml(s) +
        boardHtml(s, null, tap, marksFor(s, second), banner, null, hint ? s.first : null);
    return {
      phase: second ? "Zweiter Versuch" : "Erster Versuch",
      title,
      body,
      actions: hint ? [sayAction(s)] : [],
      turn: hint ? undefined : guesserName,
    };
  }

  function resultMarks(r) {
    const m = {};
    if (r.guesses.length === 2) m[r.guesses[0]] = "x old";
    if (r.kind === "miss") m[r.guesses[1]] = "x";
    return m;
  }

  function resultView(s, me) {
    const r = s.result;
    const titles = {
      hit1: `🎯 Volltreffer! ${name(r.who)} trinkt ${sips(r.n)}.`,
      hit2: `✅ Im zweiten Versuch! ${name(r.who)} trinkt ${sips(r.n)}.`,
      miss: `❌ Daneben! ${name(r.who)} trinkt ${sips(r.n)}.`,
    };
    const extra = r.newDealer
      ? `<p class="fd-swap">🔄 ${name(r.oldDealer)} hat ${STRIKES} Mal in Folge gewonnen und gibt ab. Neuer Dealer: ${name(r.newDealer)}</p>`
      : statusHtml(s, false);
    const last = !s.deck.length;
    return {
      phase: "",
      title: titles[r.kind],
      body: `${dealerTagHtml(s, me)}${extra}${boardHtml(s, { ...r.card, right: r.kind !== "miss" }, null, resultMarks(r))}`,
      actions: [{ label: last ? "Zur Abrechnung" : "Nächste Karte", act: { type: "next" }, by: s.players[s.dealer] }],
    };
  }

  function endView(s) {
    const ranking = [...s.players].sort((a, b) => s.tally[b] - s.tally[a]);
    const rows = ranking
      .map((p, i) => `<li><span>${i === 0 ? "👑 " : ""}${name(p)}</span><b>${sips(s.tally[p])}</b></li>`)
      .join("");
    return {
      phase: "",
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
    s.result = { id: Math.random().toString(36).slice(2), kind, who, n, card, guesses };
    const items = [{ who, n, text: kind === "miss" ? "fürs Danebenraten" : `als Dealer, ${label(card.value)} wurde erraten` }];
    if (playedCount(s, card.value) === 4) {
      // Alle 4 Karten eines Werts liegen: Die Karten werden umgedreht und alle trinken einen.
      s.result.completed = card.value;
      for (const p of s.players) s.tally[p] += 1;
      items.push({ who: ALL, n: 1, text: `Alle ${{ 11: "Buben", 12: "Damen", 13: "Könige", 14: "Asse" }[card.value] || card.value + "er"} sind durch!` });
    }

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
      if (v === top.value) return check(s, "hit1", dealer, v, [v]);
      s.first = v;
      s.hint = top.value > v ? "hoeher" : "tiefer";
      s.stage = "hint";
    } else {
      if (s.hint === "hoeher" ? v <= s.first : v >= s.first) return;
      if (v === top.value) check(s, "hit2", dealer, Math.abs(v - s.first), [s.first, v]);
      else check(s, "miss", guesser, Math.abs(v - top.value), [s.first, v]);
    }
  }

  // Erst schaut der Dealer nach und drückt „Richtig“ oder „Falsch“, dann wird aufgelöst.
  function check(s, kind, who, n, guesses) {
    s.pending = { kind, who, n, guesses };
    s.stage = "check";
  }

  // Bot rät den Wert in der Mitte der Karten, die noch im Stapel sein können (so wird der Abstand klein).
  function botGuess(s) {
    let pool = [];
    for (let v = 2; v <= 14; v++) {
      if (s.stage === "guess2" && (s.hint === "hoeher" ? v <= s.first : v >= s.first)) continue;
      for (let k = playedCount(s, v); k < 4; k++) pool.push(v);
    }
    if (!pool.length) return null;
    // Eher aus der Mitte der möglichen Karten, aber jedes Mal anders (Mittel aus zwei Zufallszahlen).
    const v = pool[Math.floor(((Math.random() + Math.random()) / 2) * pool.length)];
    return { type: "guess", value: v };
  }

  // Die aufgedeckte Karte erscheint groß in der Tischmitte und wandert langsam auf ihren Stapel.
  // Gibt zurück, wie lange die Trink-Meldung warten soll.
  const FLY_MS = 2000;
  let flying = null; // { id, end }

  function flyCard(root, s) {
    if (s.stage !== "result" || !s.result) return 0;
    const target = root.querySelector(".fd-card.new");
    const table = root.querySelector(".fd-table");
    if (!target || !table) return 0;
    const now = Date.now();
    if (flying && flying.id === s.result.id) {
      // Neu gezeichnet während des Flugs: Platz auf dem Tisch frei halten bis zur Landung.
      if (now < flying.end) {
        target.style.visibility = "hidden";
        return flying.end - now;
      }
      return 0;
    }
    const total = FLY_MS + (s.result.completed ? 1300 : 0); // erst umdrehen, dann Meldung
    flying = { id: s.result.id, end: now + total };
    target.style.visibility = "hidden";
    const tr = target.getBoundingClientRect();
    const br = table.getBoundingClientRect();
    const h = Math.min(br.height * 0.7, 190);
    const w = h * (110 / 158);
    const el = document.createElement("div");
    const right = s.result.kind !== "miss"; // erratene Karte wird grün umrandet hingelegt
    el.className = `pc fd-fly ${s.result.card.suit.red ? "pc-red" : ""} ${right ? "right" : ""}`;
    el.innerHTML = `<span>${s.result.card.rank}</span><span>${s.result.card.suit.symbol}</span>`;
    Object.assign(el.style, {
      left: `${br.left + br.width / 2 - w / 2}px`,
      top: `${br.top + br.height / 2 - h / 2}px`,
      width: `${w}px`,
      height: `${h}px`,
      fontSize: `${h * 0.22}px`,
    });
    document.body.appendChild(el);
    const dx = tr.left - (br.left + br.width / 2 - w / 2);
    const dy = tr.top - (br.top + br.height / 2 - h / 2);
    const sc = tr.width / w;
    const anim = el.animate(
      [
        { transform: `translate(${w * 0.35}px, ${h * 0.35}px) scale(0.3) rotateY(90deg)`, opacity: 0 },
        { transform: "translate(0, 0) scale(1) rotateY(0deg)", opacity: 1, offset: 0.2 },
        { transform: "translate(0, 0) scale(1)", offset: 0.45 },
        { transform: `translate(${dx}px, ${dy}px) scale(${sc})`, opacity: 1 },
      ],
      { duration: FLY_MS, easing: "ease-in-out", fill: "forwards" }
    );
    anim.onfinish = () => {
      el.remove();
      const landed = document.querySelector("#game-root .fd-card.new");
      if (landed) {
        landed.style.visibility = "";
        landed.classList.add("landed");
        if (right) landed.classList.add("right");
      }
    };
    return total;
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
        case "hint":
        case "guess2":
          // Ist der Dealer ein Bot, braucht niemand die Karte zu sehen: alle raten am Tisch.
          if (me || isBot(s.players[s.dealer])) return guessView(s, me);
          return s.peek ? dealerOnlyView(s) : tableView(s);
        case "check":
          return checkView(s, me);
        case "result": return resultView(s, me);
        default: return endView(s);
      }
    },

    afterRender(root, s) {
      return flyCard(root, s);
    },

    bot(s, name, acts) {
      return s.stage === "guess1" || s.stage === "guess2" ? botGuess(s) : acts[0];
    },

    act(s, a) {
      if (s.stage === "guess1" && a.type === "peek") s.peek = true;
      else if ((s.stage === "guess1" || s.stage === "guess2") && a.type === "guess") guess(s, a.value);
      else if (s.stage === "hint" && a.type === "say") {
        s.stage = "guess2";
      }
      else if (s.stage === "check" && a.type === "confirm") {
        const p = s.pending;
        s.pending = null;
        resolve(s, p.kind, p.who, p.n, p.guesses);
      }
      else if (s.stage === "result" && a.type === "next") {
        if (!s.deck.length) s.stage = "end";
        else {
          s.guesser = nextGuesser(s, s.guesser);
          s.stage = "guess1";
          s.peek = false;
          s.first = null;
        }
      }
    },
  });
})();
