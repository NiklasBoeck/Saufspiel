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
  const flipAt = () => landMs() / 1000 + 0.1; // kurz nachdem die 4. Karte liegt
  function stackHtml(s, round, v, cards, fresh) {
    const backs = cards.map((c, j) => `<div class="fd-card back" style="--j:${j}"></div>`).join("");
    if (cards.length < 4) return cards.map((c, j) => tableCardHtml(c, j, fresh)).join("");
    const completing = s.stage === "result" && s.result?.completed === v;
    if (!completing) return backs;
    const t = since(`${round}-${v}-flip`);
    if (t > flipAt() + 1.5) return backs;
    return cards
      .map((c, j) => {
        const at = flipAt() + j * 0.15 - t;
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

  // Alles außer dem Tisch: im Hochformat untereinander, im Querformat als eine Zeile über dem Tisch.
  const top = (html) => `<div class="fd-top">${html}</div>`;

  const topCard = (s) => s.deck[s.deck.length - 1];

  function topCardHtml(s) {
    return `<div class="pc-row">${playingCardHtml(s.deck[s.deck.length - 1], "pc-big")}</div>`;
  }

  function dealerTagHtml(s, me) {
    const dealer = s.players[s.dealer];
    return `<p class="fd-dealer">🃏 Dealer: <b>${me === dealer ? "Du" : escapeHtml(dealer)}</b></p>`;
  }

  const bannerText = (s) => (s.hint === "hoeher" ? "Höher ⬆" : "Niedriger ⬇");

  // Ein Handy: Alle sehen nur den Tisch, die ratende Person tippt dort. Die Ansagen vom Dealer
  // (höher/niedriger, richtig/falsch) macht die App selbst, sobald das „!“ durch ist.
  const AUTO_MS = 2400;
  const autoKey = (s) => `${s.played.length}-${s.stage}-${s.first}`;

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
    const isDealer = me === s.players[s.dealer];
    const two = s.pending.guesses.length === 2;
    return {
      phase: two ? "Zweiter Versuch" : "Erster Versuch",
      title: isDealer ? "" : `${guesser} tippt ${cardName(tip)}`,
      body: isDealer
        ? `${top(dealerTagHtml(s, me) + topCardHtml(s) + statusHtml(s, false))}${boardHtml(s, null, null, marksFor(s, two, tip), two ? bannerText(s) : "", topCard(s), tip)}`
        : top(statusHtml(s)) + boardHtml(s, null, null, marksFor(s, two), two ? bannerText(s) : "", null, tip),
      actions: me ? [confirmAction(s)] : [],
      auto: me ? undefined : { key: autoKey(s), act: { type: "confirm" }, ms: AUTO_MS },
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
      ? `${top(dealerTagHtml(s, me) + topCardHtml(s) + statusHtml(s, false))}${boardHtml(s, null, null, marksFor(s, hint || second), banner, topCard(s), hint ? s.first : null)}`
      : top(statusHtml(s)) +
        boardHtml(s, null, tap, marksFor(s, second), banner, null, hint ? s.first : null);
    return {
      phase: second ? "Zweiter Versuch" : "Erster Versuch",
      title,
      body,
      actions: hint && me ? [sayAction(s)] : [],
      auto: hint && !me ? { key: autoKey(s), act: { type: "say" }, ms: AUTO_MS } : undefined,
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
      body: `${top(dealerTagHtml(s, me) + extra)}${boardHtml(s, { ...r.card, right: r.kind !== "miss" }, null, resultMarks(r))}`,
      actions: [{ label: last ? "Zur Abrechnung" : "Nächste Karte", act: { type: "next" }, by: s.players[s.dealer] }],
    };
  }

  function endView(s) {
    const ranking = [...s.players].sort((a, b) => s.tally[b] - s.tally[a]);
    const rows = ranking
      .map((p) => `<li><span>${name(p)}</span><b>${sips(s.tally[p])}</b></li>`)
      .join("");
    return {
      phase: "",
      title: "Alle Karten gespielt! 🎉",
      body: `${boardHtml(s)}${top(`<p class="bf-text fd-center">Schlucke in dieser Runde</p><ul class="fd-tally">${rows}</ul>`)}`,
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
    s.tally[who] += LEVELS[levelOf(s)].scale(n); // so viele, wie die Trink-Meldung sagt
    s.result = { id: Math.random().toString(36).slice(2), kind, who, n, card, guesses };
    const items = [{ who, n, text: kind === "miss" ? "fürs Danebenraten" : `als Dealer, ${label(card.value)} wurde erraten` }];
    if (playedCount(s, card.value) === 4) {
      // Alle 4 Karten eines Werts liegen: Die Karten werden umgedreht und alle trinken einen.
      s.result.completed = card.value;
      for (const p of s.players) s.tally[p] += LEVELS[levelOf(s)].scale(1);
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
    // Leicht: irgendeine; schwer: fast genau die Mitte.
    const e = botErr();
    const r = e > 1.5 ? Math.random() : e < 0.5 ? 0.5 + (Math.random() - 0.5) * 0.2 : (Math.random() + Math.random()) / 2;
    const v = pool[Math.floor(r * pool.length)];
    return { type: "guess", value: v };
  }

  // --- Dealer-Animation (wie bei Fenster): Einstellung pro Handy, am Spiel ändert sich nichts ---
  // Mit Dealer kommt er unten an den Tisch, nimmt die oberste Karte vom Stapel in seiner linken Hand,
  // dreht sie über dem Tisch um, zeigt sie kurz und legt sie auf ihren Platz. Ohne fliegt die Karte allein.
  const DEALER_KEY = "fd-dealer";
  function dealerOn() {
    try {
      return localStorage.getItem(DEALER_KEY) !== "aus" && !!window.DEALER_ART;
    } catch {
      return !!window.DEALER_ART;
    }
  }
  function dealerToggle(root) {
    const phase = root.querySelector(".bf-phase");
    if (!phase || phase.querySelector(".fe-dealer-tg")) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "fe-dealer-tg";
    const label = () => {
      btn.textContent = dealerOn() ? "🤵 Dealer an" : "🤵 Dealer aus";
      btn.classList.toggle("off", !dealerOn());
    };
    label();
    btn.onclick = () => {
      try {
        localStorage.setItem(DEALER_KEY, dealerOn() ? "aus" : "an");
      } catch {}
      label();
    };
    phase.append(" ", btn);
  }

  // Zeitplan der Dealer-Hand (ms): reinkommen, Karte nehmen, umdrehen, zeigen, hinlegen, raus
  const R_IN = 350;
  const R_TAKE = 700;
  const R_FLIP = [950, 1350];
  const R_SHOW = 1350;
  const R_HOLD = 2000;
  const R_LAND = 2600;
  const R_HOME = 2900;
  const R_END = 3350;
  const landMs = () => (dealerOn() ? R_LAND : FLY_MS);

  function dealerReveal(target, table, s, right) {
    const A = window.DEALER_ART;
    const SVG_NS = "http://www.w3.org/2000/svg";
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const tr = target.getBoundingClientRect();
    const br = table.getBoundingClientRect();
    const W = tr.width;
    const H = tr.height;
    const card = s.result.card;

    const k = Math.max(0.34, Math.min(0.75, W * 0.0105));
    const L1 = 430 * k;
    const L2 = 380 * k;
    const PALM = 136 * k;
    const Z = (L1 + L2) * 0.42;
    const REACH = Math.sqrt((L1 + L2) ** 2 * 0.93 - Z * Z) + PALM;
    const MAXR = REACH * 0.58;
    const BODY = k * 0.8;

    const ease = (u) => u * u * (3 - 2 * u);
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const lerp = (a, b, u) => ({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u });
    const rot2 = (v, th) => ({ x: v.x * Math.cos(th) - v.y * Math.sin(th), y: v.x * Math.sin(th) + v.y * Math.cos(th) });
    const local = (b, x, y) => {
      const o = rot2({ x: x * BODY, y: y * BODY }, b.th);
      return { x: b.x + o.x, y: b.y + o.y };
    };
    const cr = (a, b, c, d, u) => 0.5 * (2 * b + (c - a) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (3 * b - a - 3 * c + d) * u * u * u);
    const curve = (list, t, f) => {
      if (t <= list[0].t) return f(list[0]);
      for (let j = 1; j < list.length; j++) {
        if (t <= list[j].t) {
          const u = (t - list[j - 1].t) / (list[j].t - list[j - 1].t || 1);
          const at = (i) => f(list[clamp(i, 0, list.length - 1)]);
          return cr(at(j - 2), at(j - 1), at(j), at(j + 1), u);
        }
      }
      return f(list[list.length - 1]);
    };

    // Der Dealer sitzt unten mittig vor dem Tisch (Rücken zu uns) und schaut zum Tisch
    const base = { x: br.left + br.width / 2, y: vh + 20 * BODY, th: 0 };
    const shoulderOf = (b) => local(b, 215, -5);
    const lShoulderOf = (b) => local(b, -215, -5);
    const DECK = local(base, -40, -360);
    const S0 = shoulderOf(base);
    const sideL = Math.hypot(S0.x - DECK.x, S0.y - DECK.y) || 1;
    const take = { x: DECK.x + ((S0.x - DECK.x) / sideL) * 120 * k, y: DECK.y + ((S0.y - DECK.y) / sideL) * 120 * k };
    // Zum Zeigen hält er die Karte groß über die Tischmitte, dann legt er sie genau auf ihren Platz
    const SHOW = { x: br.left + br.width / 2, y: br.top + br.height * 0.45 };
    const LAND = { x: tr.left + W / 2, y: tr.top + H / 2 };
    const LIFT = clamp(Math.min(br.height * 0.62, 190) / H, 1, 3.2);
    const keys = [
      { t: 0, ...take },
      { t: R_TAKE, ...take },
      { t: R_TAKE + 260, ...lerp(take, SHOW, 0.5) },
      { t: R_SHOW, ...SHOW },
      { t: R_HOLD, x: SHOW.x, y: SHOW.y - 4 },
      { t: R_LAND, ...LAND },
      { t: R_LAND + 120, ...LAND },
      { t: R_HOME, ...lerp(LAND, take, 0.45) },
    ];
    const cardAt = (t) => ({ x: curve(keys, t, (q) => q.x), y: curve(keys, t, (q) => q.y) });
    const held = (t) => t >= R_TAKE - 60 && t < R_LAND;
    const deckOut = (t) => ease(clamp(t / R_IN, 0, 1)) * (1 - ease(clamp((t - R_LAND) / (R_HOME - R_LAND), 0, 1)));

    function elbow(S, P, out, backDir, z = Z, sideW = 0.6, backW = 0.5) {
      const ax = P.x - S.x;
      const ay = P.y - S.y;
      const d = clamp(Math.hypot(ax, ay, z), Math.abs(L1 - L2) + 1, L1 + L2 - 0.5);
      const u = [ax / d, ay / d, -z / d];
      const along = (L1 * L1 - L2 * L2 + d * d) / (2 * d);
      const rad = Math.sqrt(Math.max(0, L1 * L1 - along * along));
      const flat = Math.hypot(ax, ay) || 1;
      const pole = [(-ay / flat) * sideW * out + backDir.x * backW, (ax / flat) * sideW * out + backDir.y * backW, -1];
      const pu = pole[0] * u[0] + pole[1] * u[1] + pole[2] * u[2];
      const v = pole.map((x, i) => x - pu * u[i]);
      const vl = Math.hypot(...v) || 1;
      return { x: S.x + along * u[0] + (rad * v[0]) / vl, y: S.y + along * u[1] + (rad * v[1]) / vl };
    }

    function pose(t) {
      // Rein- und rausrutschen: alles kommt von unten über den Bildschirmrand
      const drop = ((1 - ease(clamp(t / R_IN, 0, 1))) + ease(clamp((t - R_HOME) / (R_END - R_HOME), 0, 1))) * REACH * 0.9;
      const backDir = rot2({ x: 0, y: 1 }, base.th);
      const b = { x: base.x, y: base.y + drop, th: base.th, lean: 0 };
      // Die Karte sitzt zwischen den Fingerspitzen: die Handfläche liegt ein Stück davor Richtung Schulter
      const C = cardAt(t);
      const Sb = shoulderOf(b);
      const dl = Math.hypot(C.x - Sb.x, C.y - Sb.y) || 1;
      let Q = { x: C.x - ((C.x - Sb.x) / dl) * 160 * k, y: C.y - ((C.y - Sb.y) / dl) * 160 * k + drop };
      // Reicht der Arm nicht bequem, beugt er sich über den Tisch (von oben: Oberkörper rückt vor und wird größer)
      const far = Math.hypot(Q.x - Sb.x, Q.y - Sb.y);
      if (far > MAXR) {
        const f = 1 - MAXR / far;
        b.x += (Q.x - Sb.x) * f;
        b.y += (Q.y - Sb.y) * f;
        b.lean = Math.min(1, (far - MAXR) / (REACH * 0.4));
      }
      const S = shoulderOf(b);
      const dq = Math.hypot(Q.x - S.x, Q.y - S.y) || 1;
      const P = { x: Q.x - ((Q.x - S.x) / dq) * PALM, y: Q.y - ((Q.y - S.y) / dq) * PALM };
      const E = elbow(S, P, 1, backDir);
      const ax = P.x - S.x;
      const ay = P.y - S.y;
      const flat = Math.hypot(ax, ay) || 1;
      const fl = Math.hypot(P.x - E.x, P.y - E.y) || 1;
      const fx = (P.x - E.x) / fl;
      const fy = (P.y - E.y) / fl;
      const w = clamp(fl / (L2 * 0.6), 0, 1);
      const rot = (Math.atan2(fy * w + (ay / flat) * (1 - w), fx * w + (ax / flat) * (1 - w)) * 180) / Math.PI + 90;
      const out = deckOut(t);
      const LH = lerp(local(b, -130, -40), local(b, -40, -360), out);
      const SL = lShoulderOf(b);
      const off = rot2({ x: -10 * k, y: (ch * 0.62 + 7) * k }, b.th);
      const WL = { x: LH.x + off.x, y: LH.y + off.y };
      const EL = elbow(SL, WL, -1, backDir, Z * 0.35, 0.15, 0.2);
      return { b, S, E, P, C: { x: C.x, y: C.y + drop }, fl, fx, fy, rot, SL, EL, WL, LH, out };
    }

    // Ärmel mit Muskelform (wie bei Fenster)
    const UPPER = { s: [0, 0.22, 0.52, 0.78, 1], a: [62, 60, 69, 58, 47], b: [62, 58, 61, 54, 47] };
    const FORE = { s: [0, 0.22, 0.5, 0.8, 1], a: [49, 58, 52, 44, 42], b: [49, 54, 47, 42, 42] };
    const half = (prof, key, x) => {
      const w = prof[key];
      let j = 1;
      while (j < prof.s.length - 1 && x > prof.s[j]) j++;
      const u = (x - prof.s[j - 1]) / (prof.s[j] - prof.s[j - 1]);
      return cr(w[Math.max(0, j - 2)], w[j - 1], w[j], w[Math.min(w.length - 1, j + 1)], u);
    };
    const pt = (p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
    function limb(a, b, prof, flip, capA, capB, gradId) {
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const dx = (b.x - a.x) / len;
      const dy = (b.y - a.y) / len;
      const nx = -dy * flip;
      const ny = dx * flip;
      const at = (x, s2) => {
        const h = half(prof, s2 < 0 ? "b" : "a", x) * k * s2;
        return { x: a.x + dx * len * x + nx * h, y: a.y + dy * len * x + ny * h };
      };
      const g = rig.querySelector(`#${gradId}`);
      const g1 = at(0.5, -1);
      const g2 = at(0.5, 1);
      g.setAttribute("x1", g1.x);
      g.setAttribute("y1", g1.y);
      g.setAttribute("x2", g2.x);
      g.setAttribute("y2", g2.y);
      const N = 12;
      const sideA = [];
      const sideB = [];
      for (let i = 0; i <= N; i++) {
        sideA.push(pt(at(i / N, 1)));
        sideB.push(pt(at(1 - i / N, -1)));
      }
      const ra = prof.a[0] * k;
      const rb = prof.a[prof.a.length - 1] * k;
      const sw = flip > 0 ? 0 : 1;
      const endB = capB ? `A ${rb} ${rb} 0 0 ${sw} ${sideB[0]}` : `L ${sideB[0]}`;
      const endA = capA ? `A ${ra} ${ra} 0 0 ${sw} ${sideA[0]}` : `L ${sideA[0]}`;
      return `M ${sideA[0]} L ${sideA.join(" L ")} ${endB} L ${sideB.join(" L ")} ${endA} Z`;
    }

    // Karten in Hand-Einheiten für den Stapel in der linken Hand
    const cw = W / k;
    const ch = H / k;
    const back = `fill="url(#fdr-back)" stroke="#fff"`;
    const deck = [0, 1, 2, 3]
      .map((i) => `<rect x="${-cw / 2 - i * 3}" y="${-ch / 2 - i * 3}" width="${cw}" height="${ch}" rx="${cw * 0.1}" ${back} stroke-width="${cw * 0.05}"/>`)
      .join("");
    const fingers = [-0.32, -0.1, 0.12, 0.32]
      .map((f, i) => `<rect x="${cw / 2 - 16}" y="${ch * f - 13}" width="${34 - i * 2}" height="26" rx="13" fill="url(#fhf)"/>`)
      .join("");
    const LEFT_HAND = `<ellipse cx="${-cw * 0.05}" cy="${ch * 0.18}" rx="${cw * 0.62}" ry="${ch * 0.5}" fill="url(#fhs)"/>
      <path d="M${-cw * 0.45} ${ch * 0.62} L${cw * 0.4} ${ch * 0.62} L${cw * 0.4} ${ch * 0.62 + 14} L${-cw * 0.45} ${ch * 0.62 + 14} Z" fill="#f4f1ea"/>
      ${deck}${fingers}
      <rect x="${-cw * 0.62}" y="${-ch * 0.05}" width="${cw * 0.62}" height="28" rx="14" transform="rotate(-38 ${-cw * 0.3} ${ch * 0.05})" fill="url(#fhf)"/>`;
    // Die Karte in der rechten Hand (in Bildschirm-Pixeln): Rückseite, nach dem Umdrehen die Vorderseite
    const red = card.suit.red ? "#dc2626" : "#1b1033";
    const FRONT = `<rect x="${-W / 2}" y="${-H / 2}" width="${W}" height="${H}" rx="${W * 0.1}" fill="${right ? "#dcfce7" : "#fff"}" stroke="${right ? "#22c55e" : "rgb(0 0 0 / 0.15)"}" stroke-width="${right ? W * 0.06 : 1}"/>
      <text x="${-W * 0.36}" y="${-H * 0.16}" font-size="${H * 0.26}" font-weight="900" fill="${red}" font-family="inherit">${escapeHtml(card.rank)}</text>
      <text x="${-W * 0.36}" y="${H * 0.14}" font-size="${H * 0.24}" fill="${red}">${card.suit.symbol}</text>`;
    const BACK = `<rect x="${-W / 2}" y="${-H / 2}" width="${W}" height="${H}" rx="${W * 0.1}" ${back} stroke-width="2"/>`;

    const grad = (id) =>
      `<linearGradient id="${id}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#0a1222"/><stop offset="0.28" stop-color="#2c4371"/><stop offset="0.55" stop-color="#1c2d50"/><stop offset="1" stop-color="#080f1d"/></linearGradient>`;
    const rig = document.createElementNS(SVG_NS, "svg");
    rig.setAttribute("class", "fe-rig fd-rig");
    rig.setAttribute("viewBox", `0 0 ${vw} ${vh}`);
    rig.innerHTML = `<defs>${A.HAND_DEFS}${grad("fdu")}${grad("fdf")}${grad("fdu2")}${grad("fdf2")}
        <pattern id="fdr-back" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="#5b21b6"/><rect width="4" height="8" fill="#7c3aed"/></pattern></defs>
      <path class="fd-shadow" fill="rgb(0 0 0 / 0.22)"/>
      <path class="fd-lupper" fill="url(#fdu2)"/>
      <path class="fd-lfore" fill="url(#fdf2)"/>
      <g class="fd-lhand">${LEFT_HAND}</g>
      <path class="fd-upper" fill="url(#fdu)"/>
      <path class="fd-fore" fill="url(#fdf)"/>
      <path class="fd-folds" fill="none" stroke="#060c18" stroke-width="${5 * k}" stroke-linecap="round" opacity="0.55"/>
      <g class="fdr-card"><g class="fdr-back">${BACK}</g><g class="fdr-front">${FRONT}</g></g>
      <g class="fd-hand">${A.HAND_BODY}</g>
      <g class="fd-body">${A.DEALER_BODY}</g>
      <g class="fd-head">${A.DEALER_HEAD}</g>`;
    document.body.appendChild(rig);
    const $ = (c) => rig.querySelector(c);

    function draw(t) {
      const { b, S, E, P, C, fl, fx, fy, rot, SL, EL, WL, LH, out } = pose(t);
      const bodyT = `translate(${b.x} ${b.y}) rotate(${(b.th * 180) / Math.PI}) scale(${BODY * (1 + 0.1 * b.lean)})`;
      $(".fd-body").setAttribute("transform", bodyT);
      $(".fd-head").setAttribute("transform", bodyT);
      const innerOf = (A2, B2) => ((A2.x - b.x) * (B2.y - A2.y) - (A2.y - b.y) * (B2.x - A2.x) > 0 ? 1 : -1);
      const up = limb(S, E, UPPER, innerOf(S, E), false, true, "fdu");
      const fore = limb(E, P, FORE, innerOf(S, E), true, false, "fdf");
      $(".fd-upper").setAttribute("d", up);
      $(".fd-fore").setAttribute("d", fore);
      let shadow = up + fore;
      if (out > 0.02) {
        const lup = limb(SL, EL, UPPER, innerOf(SL, EL), false, true, "fdu2");
        const lfore = limb(EL, WL, FORE, innerOf(SL, EL), true, false, "fdf2");
        $(".fd-lupper").setAttribute("d", lup);
        $(".fd-lfore").setAttribute("d", lfore);
        shadow += lup + lfore;
      } else {
        $(".fd-lupper").setAttribute("d", "");
        $(".fd-lfore").setAttribute("d", "");
      }
      $(".fd-lhand").setAttribute("transform", `translate(${LH.x} ${LH.y}) rotate(${(b.th * 180) / Math.PI}) scale(${k})`);
      $(".fd-lhand").style.display = out > 0.02 ? "" : "none";
      $(".fd-shadow").setAttribute("d", shadow);
      $(".fd-shadow").setAttribute("transform", `translate(${-8 * k} ${24 * k})`);
      let folds = "";
      for (const [s0, w0] of [[0.1, 0.42], [0.2, 0.36], [0.62, 0.3]]) {
        const c = { x: E.x + fx * fl * s0, y: E.y + fy * fl * s0 };
        const o = 52 * k * w0 * 2;
        folds += `M ${pt({ x: c.x - fy * o, y: c.y + fx * o })} Q ${pt({ x: c.x + fx * 14 * k, y: c.y + fy * 14 * k })} ${pt({ x: c.x + fy * o * 0.4, y: c.y - fx * o * 0.4 })} `;
      }
      $(".fd-folds").setAttribute("d", folds);
      $(".fd-hand").setAttribute("transform", `translate(${P.x} ${P.y}) rotate(${rot}) scale(${k}) translate(-106 -306)`);
      // Karte: wird beim Hochheben größer (näher an uns), dreht sich um und liegt zum Schluss gerade
      const cardEl = $(".fdr-card");
      cardEl.style.display = held(t) ? "" : "none";
      if (held(t)) {
        const up2 = ease(clamp((t - R_TAKE) / (R_SHOW - R_TAKE), 0, 1)) * (1 - ease(clamp((t - R_HOLD) / (R_LAND - R_HOLD), 0, 1)));
        const sc = 1 + (LIFT - 1) * up2;
        const f = clamp((t - R_FLIP[0]) / (R_FLIP[1] - R_FLIP[0]), 0, 1);
        const sx = Math.max(0.02, Math.abs(Math.cos(ease(f) * Math.PI)));
        const tilt = (rot - 360 * Math.round(rot / 360)) * 0.3 * (1 - ease(clamp((t - R_HOLD) / (R_LAND - R_HOLD), 0, 1)));
        cardEl.setAttribute("transform", `translate(${C.x} ${C.y}) rotate(${tilt}) scale(${sc * sx} ${sc})`);
        $(".fdr-front").style.display = f >= 0.5 ? "" : "none";
        $(".fdr-back").style.display = f >= 0.5 ? "none" : "";
      }
    }

    let landed = false;
    const land = () => {
      if (landed) return;
      landed = true;
      const el = document.querySelector("#game-root .fd-card.new");
      if (el) {
        el.style.visibility = "";
        el.classList.add("landed");
        if (right) el.classList.add("right");
      }
    };
    const t0 = performance.now();
    const loop = (now) => {
      if (!rig.isConnected) return;
      const t = now - t0;
      draw(t);
      if (t >= R_LAND) land();
      if (t < R_END) requestAnimationFrame(loop);
      else rig.remove();
    };
    rig._draw = draw; // für Screenshot-Tests: Zeitpunkt direkt zeichnen
    draw(0);
    requestAnimationFrame(loop);
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
    const total = landMs() + (s.result.completed ? 1300 : 0); // erst umdrehen, dann Meldung
    flying = { id: s.result.id, end: now + total };
    target.style.visibility = "hidden";
    const right = s.result.kind !== "miss"; // erratene Karte wird grün umrandet hingelegt
    if (dealerOn()) {
      dealerReveal(target, table, s, right);
      return total;
    }
    const tr = target.getBoundingClientRect();
    const br = table.getBoundingClientRect();
    const h = Math.min(br.height * 0.7, 190);
    const w = h * (110 / 158);
    const el = document.createElement("div");
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
    description: "Errate die Karte oder trink. Triffst du, trinkt der Dealer.",
    color: "#dc2626",
    fit: true,
    privateAlerts: true,
    rules: [
      "Einer ist Dealer und hält den Stapel (die App), alle anderen raten reihum die oberste Karte (2 bis Ass, Ass zählt 14).",
      "Erster Tipp richtig: Der Dealer trinkt so viele Schlucke, wie die Karte wert ist. Daneben: Der Dealer sagt „höher“ oder „niedriger“.",
      "Zweiter Tipp richtig: Der Dealer trinkt den Abstand zwischen deinen beiden Tipps. Wieder daneben: Du trinkst den Abstand zwischen deinem Tipp und der Karte.",
      "Sind alle 4 Karten eines Werts weg, trinken alle einen Schluck.",
      "Liegt der Tisch dreimal hintereinander falsch, wechselt der Dealer zur nächsten Person.",
    ],

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
          return guessView(s, me);
        case "check":
          return checkView(s, me);
        case "result": return resultView(s, me);
        default: return endView(s);
      }
    },

    afterRender(root, s) {
      dealerToggle(root);
      return flyCard(root, s);
    },

    bot(s, name, acts) {
      return s.stage === "guess1" || s.stage === "guess2" ? botGuess(s) : acts[0];
    },

    act(s, a) {
      if ((s.stage === "guess1" || s.stage === "guess2") && a.type === "guess") guess(s, a.value);
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
          s.first = null;
        }
      }
    },
  });
})();
