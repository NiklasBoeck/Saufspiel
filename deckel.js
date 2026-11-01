// Bierdeckel-Schnippen: Ein Stapel Bierdeckel liegt über die Tischkante. Wer dran ist, schnippt ihn mit einem
// Wisch nach oben in die Luft und muss ihn wieder fangen (tippen, wenn er durch den Ring fällt). Jeder gefangene
// Wurf füllt den Pott (so viele Schlucke, wie Deckel geflogen sind). Danach: aufhören und den Pott verteilen,
// oder einen Deckel mehr drauflegen. Fällt der Stapel runter, trinkst du so viele Schlucke, wie Deckel geflogen
// sind, und der Pott ist weg.
(() => {
  const MAX = 4; // mehr Deckel gehen nicht auf einmal
  const HALF = [0, 110, 85, 65, 50]; // so viele ms darf man beim Fangen danebenliegen (je nach Stapel)
  const WEAK = 0.1; // schwächer geschnippt: Deckel kippt nur runter
  const STRONG = 0.95; // stärker: Deckel fliegt weg
  const EDGE = 26; // Tischkante, in % der Bühnenhöhe von unten
  const CATCH = 45; // hier ist der Ring, in dem man fängt
  const FLOOR = 3;
  const TILT = 66; // so schräg liegt ein Deckel auf dem Tisch (Grad)

  const nm = (p) => `<b>${escapeHtml(p)}</b>`;
  const newId = () => Math.random().toString(36).slice(2, 10);
  const deckel = (k) => (k === 1 ? "1 Deckel" : `${k} Deckel`);
  const pot = (k) => (k * (k + 1)) / 2; // Pott nach k gefangenen Würfen: 1, 3, 6, 10

  // --- Flugbahn: Wisch-Stärke p (0..1) bestimmt Höhe und Drehungen ---
  function flight(p) {
    const apex = 54 + 40 * p;
    const tr = 0.32 + 0.38 * p; // Sekunden bis ganz oben
    const g = (2 * (apex - EDGE)) / (tr * tr);
    const tc = tr + Math.sqrt((2 * (apex - CATCH)) / g); // wann er durch den Ring fällt
    const turns = 1 + Math.round(p * 3);
    return { apex, tr, g, tc, turns };
  }

  // Wo der Deckel nach t Sekunden ist: Höhe y (in % von unten) und Drehung
  function posAt(p, t) {
    if (p < WEAK) {
      // kippt einfach über die Kante und fällt runter
      const y = EDGE + 5 * Math.sin(Math.min(t / 0.25, 1) * Math.PI) - (t > 0.25 ? 220 * (t - 0.25) ** 2 : 0);
      return { y: Math.max(FLOOR, y), rot: TILT + 160 * Math.min(t / 0.6, 1), spread: 0 };
    }
    if (p > STRONG) {
      const y = EDGE + 260 * t;
      return { y, rot: TILT + 1100 * t, spread: Math.min(t * 3, 1) };
    }
    const f = flight(p);
    const y = EDGE + f.g * f.tr * t - (f.g * t * t) / 2;
    return { y: Math.max(FLOOR, y), rot: TILT + (360 * f.turns * t) / f.tc, spread: Math.sin(Math.min(t / f.tc, 1) * Math.PI) };
  }

  function halfWindow(k, p) {
    return HALF[k] * (p >= 0.3 && p <= 0.8 ? 1 : 0.75);
  }

  // Ergebnis eines Wurfs. e = Tippzeit minus Ring-Zeit (ms), null = gar nicht getippt
  function outcome(k, p, e) {
    if (p < WEAK) return "lasch";
    if (p > STRONG) return "weg";
    if (e == null) return "verpasst";
    if (Math.abs(e) <= halfWindow(k, p)) return "gefangen";
    return e < 0 ? "frueh" : "spaet";
  }

  const RES_TEXT = {
    gefangen: "✊ Gefangen!",
    lasch: "😴 Zu lasch geschnippt, der Stapel kippt nur runter.",
    weg: "🚀 Viel zu fest! Die Deckel fliegen ins Nachbarbier.",
    verpasst: "🙈 Gar nicht zugegriffen.",
    frueh: "⏪ Zu früh zugegriffen, die Deckel fallen durch.",
    spaet: "⏩ Zu spät, die Deckel liegen schon am Boden.",
  };

  // --- Ansicht ---

  function matHtml(k) {
    let d = "";
    for (let i = 0; i < k; i++) d += `<i style="--i:${i}"><span>PROST</span></i>`;
    return `<div class="bd-mat" style="--k:${k}">${d}</div>`;
  }

  // pose: "rest" (liegt auf der Kante), "caught" (in der Hand), "drop" (am Boden), "gone" (weg)
  function stageHtml(s, k, pose, extra = "") {
    return `
      <div class="bd-stage pose-${pose} ${extra}">
        <div class="bd-pot">${s.pot ? `Pott: <b>${sips(s.pot)}</b>` : "Pott leer"} · ${deckel(k)}</div>
        <div class="bd-ring"></div>
        <div class="bd-table"><i></i><i></i></div>
        ${matHtml(k)}
        <div class="bd-hand">✊</div>
        <div class="bd-flash"></div>
      </div>`;
  }

  function tallyHtml(s) {
    const rows = [...s.players]
      .sort((a, b) => s.tally[b].sips - s.tally[a].sips)
      .map((p) => `<li><span>${escapeHtml(p)}</span><span><b>${s.tally[p].sips}</b> ${drinkEmoji(s)}${s.tally[p].best ? ` · 🏆 ${s.tally[p].best}` : ""}</span></li>`)
      .join("");
    return `<ul class="bd-tally">${rows}</ul>`;
  }

  function canFlick(s, me) {
    if (s.stage !== "flick") return false;
    const p = s.players[s.cur];
    if (isBot(p)) return false;
    if (!me || me === p) return true;
    return typeof run !== "undefined" && run?.host && run.offline?.(p);
  }

  function introView(s) {
    const a = escapeHtml(s.players[0]);
    return {
      phase: "So geht Bierdeckel-Schnippen",
      title: "Schnipp die Bierdeckel hoch und fang sie wieder.",
      body: `<ol class="bd-intro">
          <li>Wenn du dran bist: <b>schnell nach oben wischen</b> über den Deckel an der Tischkante. Der Deckel fliegt hoch und dreht sich.</li>
          <li>Kommt er wieder runter, <b>tippen, wenn er im Ring ist</b>. Dann hast du ihn gefangen.</li>
          <li>Jeder gefangene Wurf füllt deinen <b>Pott</b> mit so vielen Schlucken, wie Deckel geflogen sind. Dann: <b>aufhören</b> und den Pott verteilen, oder <b>einen Deckel mehr</b> drauflegen. Mehr Deckel, kleineres Zeitfenster.</li>
          <li>Fällt der Stapel runter, trinkst du so viele Schlucke, wie Deckel geflogen sind, und der Pott ist weg. Nicht zu lasch und nicht zu fest schnippen!</li>
        </ol>
        <p class="bd-example">Beispiel: ${a} fängt 1 Deckel, Pott 1. Mit 2 Deckeln klappt's auch, Pott 1 + 2 = 3. ${a} hört auf und verteilt 3 Schlucke. Hätte ${a} es mit 3 Deckeln versucht und daneben gegriffen, müsste ${a} 3 trinken und der Pott wäre weg.</p>`,
      actions: [{ label: "Verstanden, los geht's 🍺", act: { type: "go" } }],
    };
  }

  function flickView(s, me) {
    const p = s.players[s.cur];
    const you = me === p;
    const mine = canFlick(s, me);
    return {
      phase: `${deckel(s.k)} · ${s.pot ? `Pott ${sips(s.pot)}` : "Pott leer"}`,
      title: you ? "Du schnippst!" : `${nm(p)} schnippt`,
      body: `${stageHtml(s, s.k, "rest", mine ? "mine" : "")}<p class="bd-hint">${
        mine
          ? `${me ? "" : `${nm(p)}: `}Schnell nach oben wischen, dann tippen, wenn die Deckel im Ring sind.`
          : isBot(p)
            ? `${nm(p)} legt den Finger unter die Kante…`
            : `Fällt's runter: ${sips(s.k)} für ${nm(p)}.`
      }</p>`,
      turn: p,
      actions: [],
    };
  }

  function decideView(s, me) {
    const p = s.players[s.cur];
    const you = me === p;
    const next = s.k + 1;
    return {
      phase: `${deckel(s.k)} gefangen · Pott ${sips(s.pot)}`,
      title: `✊ Gefangen! ${you ? "Traust du dich" : `Traut sich ${nm(p)}`} an ${deckel(next)}?`,
      body: `${stageHtml(s, s.k, "caught")}<p class="bd-hint">Mit ${deckel(next)} ist das Zeitfenster kleiner. Gefangen: Pott ${pot(next)}. Daneben: ${sips(next)} trinken, Pott weg.</p>`,
      actions: [
        { label: `Noch einer drauf (${deckel(next)})`, by: p, act: { type: "more", id: s.turn } },
        { label: `Aufhören, ${sips(s.pot)} verteilen`, by: p, ghost: true, act: { type: "stop", id: s.turn } },
      ],
    };
  }

  function doneView(s, me) {
    const r = s.result;
    const you = me === r.who;
    let title;
    if (r.kind === "drop") title = `${RES_TEXT[r.res]} ${you ? "Du trinkst" : `${nm(r.who)} trinkt`} ${sips(r.k)}.`;
    else if (r.kind === "king") title = `👑 Deckel-König! ${deckel(MAX)} gefangen, ${you ? "du verteilst" : `${nm(r.who)} verteilt`} ${sips(r.pot)}.`;
    else title = `${you ? "Du hörst" : `${nm(r.who)} hört`} auf und ${you ? "verteilst" : "verteilt"} ${sips(r.pot)}.`;
    const pose = r.kind === "drop" ? (r.res === "weg" ? "gone" : "drop") : "caught";
    const nextP = s.players[(s.cur + 1) % s.players.length];
    return {
      phase: `${escapeHtml(r.who)} · ${deckel(r.k)}`,
      title,
      body: `${stageHtml({ ...s, pot: r.kind === "drop" ? 0 : r.pot }, r.k, pose, r.kind)}${tallyHtml(s)}`,
      actions: [{ label: `Weiter: ${nextP} ist dran`, by: isBot(r.who) ? r.who : undefined, act: { type: "next", id: s.turn } }],
    };
  }

  // --- Am Handy: wischen, fliegen lassen, fangen ---
  let swipe = null; // { id, y, t, pts: [[y,t]...], h }
  let fly = null; // { id, k, p, t0, tap, res, sent }
  let localFly = null; // eben selbst geworfen: auf diesem Handy nicht nochmal abspielen
  const animated = new Set();

  const active = () => typeof run !== "undefined" && run && run.key === "deckel";

  function onDown(e) {
    if (!active()) return;
    const s = run.s;
    if (fly && fly.id === s.turn && !fly.res) {
      // Zugreifen!
      e.preventDefault();
      if (fly.tap == null) fly.tap = performance.now();
      return;
    }
    if (fly || !canFlick(s, run.me) || !document.getElementById("drink-alert").hidden) return;
    e.preventDefault();
    const st = document.querySelector(".bd-stage");
    const h = st?.getBoundingClientRect().height || window.innerHeight;
    const t = performance.now();
    swipe = { id: s.turn, y: e.clientY, h, pts: [[e.clientY, t]] };
  }

  function onMove(e) {
    if (!swipe) return;
    swipe.pts.push([e.clientY, performance.now()]);
    if (swipe.pts.length > 30) swipe.pts.shift();
  }

  function onUp(e) {
    if (!swipe) return;
    const sw = swipe;
    swipe = null;
    if (!active() || run.s.turn !== sw.id || !canFlick(run.s, run.me)) return;
    const now = performance.now();
    sw.pts.push([e.clientY, now]);
    const dist = (sw.y - e.clientY) / sw.h;
    if (dist < 0.06) return hint("Schnell nach oben wischen! 👆");
    // Tempo der letzten ~70 ms (in Bühnenhöhen pro Sekunde)
    let from = sw.pts[0];
    for (const pt of sw.pts) if (now - pt[1] <= 70) {
      from = pt;
      break;
    }
    const dt = Math.max(16, now - from[1]) / 1000;
    const v = (from[0] - e.clientY) / sw.h / dt;
    const p = Math.round(Math.max(0, Math.min(1.2, v / 9)) * 1000) / 1000;
    startFly(run.s, p);
  }

  function hint(text) {
    const el = document.querySelector(".bd-flash");
    if (!el) return;
    el.textContent = text;
    el.classList.remove("show");
    void el.offsetWidth;
    el.classList.add("show");
  }

  function startFly(s, p) {
    fly = { id: s.turn, k: s.k, p, t0: performance.now(), tap: null, res: null };
    try {
      navigator.vibrate?.(20);
    } catch {
      // egal
    }
    requestAnimationFrame(flyTick);
  }

  function setPose(st, pos, k) {
    const mat = st?.querySelector(".bd-mat");
    if (!mat) return;
    mat.style.transform = `translate(-50%, 50%) translateY(${-(pos.y - EDGE)}cqh) rotateX(${pos.rot}deg)`;
    mat.style.setProperty("--spread", pos.spread.toFixed(3));
  }

  function flyTick() {
    if (!fly || !active()) return (fly = null);
    const f = fly;
    const st = document.querySelector(".bd-stage");
    if (st && !st.classList.contains("flying")) st.classList.add("flying");
    const t = (performance.now() - f.t0) / 1000;
    const tcMs = f.p >= WEAK && f.p <= STRONG ? flight(f.p).tc * 1000 : 0;
    // Zugegriffen: Ergebnis steht fest
    if (!f.res && f.tap != null) {
      const e = f.tap - f.t0 - tcMs;
      f.e = Math.round(e);
      f.res = outcome(f.k, f.p, f.e);
      grabAt(st, f, e);
    }
    if (!f.res && (f.p < WEAK || f.p > STRONG || t * 1000 > tcMs + halfWindow(f.k, f.p) + 60)) {
      // verschnippt, oder der Ring ist vorbei: fertig fallen lassen
      f.e = null;
      f.res = outcome(f.k, f.p, null);
    }
    if (f.res === "gefangen") {
      setPose(st, { y: CATCH, rot: TILT, spread: 0 }, f.k);
      return finish(st, f, 500);
    }
    const pos = posAt(f.p, t);
    setPose(st, pos, f.k);
    if (f.res && (pos.y <= FLOOR || pos.y > 130)) return finish(st, f, 450);
    if (t > 6) return finish(st, f, 0);
    requestAnimationFrame(flyTick);
  }

  function grabAt(st, f, e) {
    const hand = st?.querySelector(".bd-hand");
    if (!hand) return;
    hand.classList.add("grab");
    if (outcome(f.k, f.p, e) !== "gefangen") hand.classList.add("miss");
  }

  function finish(st, f, ms) {
    if (f.sent) return;
    f.sent = true;
    st?.classList.remove("flying");
    st?.classList.add(f.res === "gefangen" ? "caught" : "dropped");
    hint(RES_TEXT[f.res]);
    setTimeout(() => {
      fly = null;
      if (!active() || run.s.turn !== f.id) return;
      localFly = f.id;
      run.send({ type: "flick", id: f.id, p: f.p, e: f.e ?? null });
    }, ms + 500);
  }

  window.addEventListener("pointermove", onMove, { passive: true });
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", () => (swipe = null));

  // Nach dem Zeichnen: Wurf auf den anderen Handys (und beim Bot) abspielen
  function afterRender(root, s) {
    const st = root.querySelector(".bd-stage");
    if (!st) return 0;
    st.addEventListener("pointerdown", onDown);
    st.addEventListener("contextmenu", (e) => e.preventDefault());
    if (fly && fly.id === s.turn) st.classList.add("flying"); // neu gezeichnet mitten im Flug
    const L = s.last;
    if (!L || animated.has(L.id) || !(s.stage === "decide" || s.stage === "done")) return 0;
    animated.add(L.id);
    if (animated.size > 200) animated.delete(animated.values().next().value);
    if (localFly === L.turn) {
      localFly = null;
      return 0;
    }
    // Abspielen
    const t0 = performance.now();
    const tcMs = L.p >= WEAK && L.p <= STRONG ? flight(L.p).tc * 1000 : 0;
    const tapAt = L.e == null ? null : tcMs + L.e;
    st.classList.add("flying");
    st.classList.remove("pose-caught", "pose-drop", "pose-gone");
    let grabbed = false;
    const total = L.res === "gefangen" ? tapAt : L.res === "weg" ? 700 : estimateFall(L.p);
    const step = () => {
      if (!st.isConnected) return;
      const ms = performance.now() - t0;
      if (tapAt != null && ms >= tapAt && !grabbed) {
        grabbed = true;
        grabAt(st, { k: L.k, p: L.p }, L.e);
      }
      if (L.res === "gefangen" && ms >= tapAt) {
        setPose(st, { y: CATCH, rot: TILT, spread: 0 }, L.k);
        st.classList.remove("flying");
        st.classList.add("caught");
        return;
      }
      const pos = posAt(L.p, ms / 1000);
      setPose(st, pos, L.k);
      if (ms >= total) {
        st.classList.remove("flying");
        st.classList.add("dropped");
        hint(RES_TEXT[L.res]);
        return;
      }
      requestAnimationFrame(step);
    };
    setPose(st, posAt(L.p, 0), L.k);
    requestAnimationFrame(step);
    return Math.min(5000, total + 500);
  }

  function estimateFall(p) {
    for (let t = 0.05; t < 6; t += 0.02) if (posAt(p, t).y <= FLOOR) return t * 1000;
    return 2000;
  }

  // --- Spielablauf ---

  function newTurn(s, cur) {
    s.cur = cur;
    s.k = 1;
    s.pot = 0;
    s.turn = newId();
    s.stage = "flick";
    s.result = null;
  }

  function flick(s, p, e) {
    const who = s.players[s.cur];
    const res = outcome(s.k, p, e);
    s.last = { id: newId(), turn: s.turn, k: s.k, p, e, res, who };
    if (res === "gefangen") {
      s.pot += s.k;
      s.tally[who].best = Math.max(s.tally[who].best, s.k);
      if (s.k >= MAX) {
        s.stage = "done";
        s.result = { kind: "king", who, k: s.k, pot: s.pot };
        drink(s, [{ who, n: s.pot, give: true, text: `👑 ${deckel(MAX)} gefangen, Deckel-König` }]);
      } else s.stage = "decide";
      return;
    }
    s.stage = "done";
    s.result = { kind: "drop", who, k: s.k, res, pot: 0 };
    s.tally[who].sips += LEVELS[levelOf(s)].scale(s.k);
    s.tally[who].drops++;
    drink(s, [{ who, n: s.k, text: `${deckel(s.k)} ${res === "weg" ? "weggeschnippt" : "fallen gelassen"}${s.pot ? `, Pott (${s.pot}) ist weg` : ""}` }]);
  }

  // --- Bots ---
  function gauss() {
    return Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
  }
  const botSd = () => 30 + 45 * botErr(); // ms Streuung beim Zugreifen

  // Wahrscheinlichkeit, mit k Deckeln zu fangen (|N(0, sd)| < half)
  function catchChance(k) {
    const z = HALF[k] / botSd() / Math.SQRT2;
    // erf-Näherung
    const t = 1 / (1 + 0.3275911 * z);
    const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z);
    return y * 0.97; // und manchmal ist der Schnipp selbst daneben
  }

  function botFlick(s) {
    let p = 0.55 + gauss() * 0.11 * botErr();
    if (Math.random() < 0.015 * botErr()) p = Math.random() < 0.5 ? 0.05 : 1.05; // total verschnippt
    p = Math.round(Math.max(0, Math.min(1.2, p)) * 1000) / 1000;
    return { type: "flick", id: s.turn, p, e: Math.round(gauss() * botSd()) };
  }

  function botDecide(s, acts) {
    const n = s.k + 1;
    const q = catchChance(n);
    // weitermachen lohnt sich, wenn q * (Pott + n) − (1 − q) * n > Pott
    const go = q * (s.pot + n) - (1 - q) * n > s.pot;
    const choice = go ? acts.find((a) => a.type === "more") : acts.find((a) => a.type === "stop");
    return botPick(choice, acts, 0.15);
  }

  registerGame("deckel", {
    label: "Bierdeckel-Schnippen",
    emoji: "🫴",
    description: "Schnipp den Bierdeckel-Stapel hoch und fang ihn wieder. Wer ihn fallen lässt, trinkt.",
    color: "#b45309",
    fit: true,
    rules: [
      "Ein Stapel Bierdeckel liegt über der Tischkante. Wer dran ist, wischt schnell nach oben über den Deckel: Er fliegt hoch, dreht sich und fällt wieder runter.",
      "Tipp aufs Spielfeld, wenn die Deckel durch den Ring fallen. Dann hast du sie gefangen. Zu früh, zu spät oder gar nicht: Die Deckel fallen auf den Boden.",
      "Zu lasch geschnippt kippt der Stapel nur über die Kante, zu fest geschnippt fliegt er ins Nachbarbier. Beides zählt als runtergefallen.",
      "Jeder gefangene Wurf kommt in deinen Pott: so viele Schlucke, wie Deckel geflogen sind (1 + 2 + 3 …). Danach entscheidest du: aufhören und den Pott verteilen, oder einen Deckel mehr drauflegen. Je mehr Deckel, desto kleiner das Zeitfenster.",
      "Lässt du die Deckel fallen, trinkst du so viele Schlucke, wie gerade geflogen sind, und dein Pott ist weg.",
      `Wer ${deckel(MAX)} auf einmal fängt, ist Deckel-König und verteilt den ganzen Pott (${sips(pot(MAX))}).`,
    ],

    setup(players) {
      const s = { players, stage: "intro", last: null, result: null, tally: {} };
      for (const p of players) s.tally[p] = { sips: 0, drops: 0, best: 0 };
      newTurn(s, Math.floor(Math.random() * players.length));
      s.stage = "intro";
      return s;
    },

    view(s, me) {
      if (s.stage === "intro") return introView(s);
      if (s.stage === "decide") return decideView(s, me);
      if (s.stage === "done") return doneView(s, me);
      return flickView(s, me);
    },

    afterRender,

    bot(s, name, acts) {
      if (s.stage === "flick") return botFlick(s);
      if (s.stage === "decide") return botDecide(s, acts);
      return acts[0];
    },

    act(s, a) {
      if (s.stage === "intro" && a.type === "go") s.stage = "flick";
      else if (s.stage === "flick" && a.type === "flick" && a.id === s.turn) {
        const e = a.e == null || !Number.isFinite(Number(a.e)) ? null : Number(a.e);
        flick(s, Math.max(0, Math.min(1.2, Number(a.p) || 0)), e);
      } else if (s.stage === "decide" && a.id === s.turn) {
        if (a.type === "more") {
          s.k++;
          s.turn = newId();
          s.stage = "flick";
        } else if (a.type === "stop") {
          const who = s.players[s.cur];
          s.stage = "done";
          s.result = { kind: "stop", who, k: s.k, pot: s.pot };
          drink(s, [{ who, n: s.pot, give: true, text: `Pott von ${deckel(s.k)} gefangen` }]);
        }
      } else if (s.stage === "done" && a.type === "next" && a.id === s.turn) {
        newTurn(s, (s.cur + 1) % s.players.length);
      }
    },
  });

  // --- Aussehen (hier statt in style.css, damit alles zum Spiel in einer Datei liegt) ---
  const css = `
.bd-stage {
  position: relative; flex: 1 1 0; min-height: 200px; width: 100%; overflow: hidden;
  container-type: size; touch-action: none; perspective: 900px;
  -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent;
  border-radius: 22px;
  background: radial-gradient(ellipse at 50% 90%, rgb(180 83 9 / 0.22), transparent 70%);
}
.bd-stage.mine { cursor: grab; }
.bd-pot {
  position: absolute; z-index: 4; top: 2cqh; left: 50%; transform: translateX(-50%); white-space: nowrap;
  padding: 3px 12px; border-radius: 999px; background: rgb(0 0 0 / 0.35); font-size: clamp(0.75rem, 4.5cqmin, 1rem);
}
.bd-pot b { color: #fcd34d; }
/* Tisch: Platte mit Kante, darunter die Zarge und zwei Beine, unten der Boden */
.bd-table {
  position: absolute; left: -2%; right: -2%; bottom: ${FLOOR}cqh; height: ${EDGE - FLOOR}cqh;
  background: linear-gradient(#8b5a2b 0 9%, #5b3a1a 9% 18%, transparent 18%);
}
.bd-table::before {
  content: ""; position: absolute; left: 0; right: 0; bottom: 100%; height: 9cqh;
  background: linear-gradient(#6b4423, #a0682f); clip-path: polygon(8% 0, 92% 0, 100% 100%, 0 100%);
}
.bd-table i { position: absolute; top: 18%; bottom: 0; width: 5%; background: linear-gradient(90deg, #3f2812, #5b3a1a); }
.bd-table i:first-child { left: 10%; }
.bd-table i:last-child { right: 10%; }
.bd-stage::after {
  content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: ${FLOOR + 1}cqh; background: rgb(0 0 0 / 0.35);
}
/* Ring zum Fangen */
.bd-ring {
  --d: min(46cqw, 34cqh);
  position: absolute; z-index: 1; left: 50%; bottom: ${CATCH}cqh; width: var(--d); height: calc(var(--d) * 0.42);
  transform: translate(-50%, 50%); border-radius: 50%;
  border: 3px dashed rgb(252 211 77 / 0.75); box-shadow: 0 0 16px rgb(252 211 77 / 0.25);
}
.bd-stage.pose-rest:not(.flying) .bd-ring { opacity: 0.45; }
/* Deckel-Stapel */
.bd-mat {
  --d: min(32cqw, 30cqh); --spread: 0;
  position: absolute; z-index: 3; left: 50%; bottom: ${EDGE}cqh; width: var(--d); height: var(--d);
  transform: translate(-50%, 50%) rotateX(${TILT}deg); transform-style: preserve-3d;
}
.bd-mat i {
  position: absolute; inset: 0; border-radius: 50%;
  background: radial-gradient(circle, #fff7e6 0 52%, #b91c1c 53% 60%, #fff7e6 61% 72%, #b91c1c 73% 77%, #f5e6c8 78%);
  box-shadow: 0 0 0 1px rgb(0 0 0 / 0.25), 0 2px 0 #c9b38a;
  transform: translateZ(calc(var(--i) * (0.9cqmin + var(--spread) * 3cqmin))) rotate(calc(var(--i) * (8deg + var(--spread) * 25deg)));
  display: grid; place-items: center;
}
.bd-mat i span { font: 900 calc(var(--d) * 0.16) / 1 system-ui, sans-serif; color: #b91c1c; letter-spacing: 0.04em; }
.bd-stage.pose-caught .bd-mat { transform: translate(-50%, 50%) translateY(${-(CATCH - EDGE)}cqh) rotateX(${TILT}deg); }
.bd-stage.pose-drop .bd-mat { transform: translate(-50%, 50%) translateY(${-(FLOOR - EDGE)}cqh) rotateX(80deg); --spread: 1; }
.bd-stage.pose-gone .bd-mat { opacity: 0; }
/* Hand */
.bd-hand {
  position: absolute; z-index: 4; left: 50%; bottom: ${CATCH}cqh; transform: translate(-50%, 70%) scale(0.4);
  font-size: min(20cqw, 15cqh); line-height: 1; opacity: 0; transition: transform 0.12s, opacity 0.12s; pointer-events: none;
}
.bd-hand.grab, .bd-stage.pose-caught .bd-hand { opacity: 1; transform: translate(-50%, 70%) scale(1); }
.bd-hand.miss { filter: grayscale(1) brightness(0.8); }
.bd-stage.caught .bd-mat, .bd-stage.pose-caught .bd-mat { filter: drop-shadow(0 0 12px rgb(74 222 128 / 0.9)); }
.bd-flash {
  position: absolute; z-index: 5; left: 50%; top: 14cqh; transform: translateX(-50%); width: 88%; text-align: center;
  font-weight: 800; font-size: clamp(0.9rem, 5.5cqmin, 1.4rem); text-shadow: 0 2px 6px rgb(0 0 0 / 0.8); opacity: 0; pointer-events: none;
}
.bd-flash.show { animation: bd-flash 2.2s ease-out both; }
@keyframes bd-flash { 0% { opacity: 0; transform: translate(-50%, 8px); } 10%, 75% { opacity: 1; transform: translate(-50%, 0); } 100% { opacity: 0; } }
.bd-hint { margin: 0; text-align: center; color: var(--muted); font-size: clamp(0.8rem, 2dvh, 1rem); }
.bd-stage.mine + .bd-hint { color: var(--text); font-weight: 600; }
.bd-tally { flex: none; list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; }
.bd-tally li { display: flex; gap: 8px; padding: 4px 12px; border-radius: 999px; background: var(--surface); font-size: 0.85rem; }
.bd-intro { margin: 0; padding: 0 0 0 1.3em; display: flex; flex-direction: column; gap: clamp(6px, 1.4dvh, 14px); line-height: 1.4; font-size: clamp(0.9rem, 2.2dvh, 1.1rem); }
.bd-intro b { color: #fcd34d; }
.bd-example { margin: 0; padding: clamp(8px, 1.6dvh, 14px) 14px; border-radius: 14px; background: var(--surface); color: var(--muted); line-height: 1.4; font-size: clamp(0.85rem, 2dvh, 1rem); }
html.fit[data-game="deckel"] #screen-game { gap: 2px; }
html.fit[data-game="deckel"] .bf { gap: clamp(4px, 1dvh, 12px); }
html.fit[data-game="deckel"] .bf-phase { text-align: center; text-transform: none; letter-spacing: 0; }
html.fit[data-game="deckel"] .your-turn { display: none; }
html.fit[data-game="deckel"] .bf-title { text-align: center; font-size: clamp(1rem, 2.6dvh, 1.35rem); }
html.fit[data-game="deckel"] .bf-body { overflow: hidden; gap: clamp(4px, 1dvh, 12px); }
@media (min-aspect-ratio: 6 / 5) {
  html.fit[data-game="deckel"] .bf { grid-template-columns: minmax(0, 1fr) clamp(170px, 30vw, 320px); }
  html.fit[data-game="deckel"] .bf-phase, html.fit[data-game="deckel"] .bf-title { text-align: left; }
  html.fit[data-game="deckel"] .bf-title { font-size: clamp(0.95rem, 4dvh, 1.4rem); }
}`;
  const tag = document.createElement("style");
  tag.textContent = css;
  document.head.appendChild(tag);
})();
