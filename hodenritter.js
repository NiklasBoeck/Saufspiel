// Hodenritter: Boule im Garten. Alle sitzen auf Gartenstühlen in einer Reihe vor dem Rasen.
// Wer die weiße Kugel hat, wirft sie auf den Rasen, dann werfen alle reihum (rechts daneben fängt an,
// wer die weiße Kugel geworfen hat, wirft als Letztes). Wer am weitesten weg liegt und wer die weiße
// Kugel berührt hat, steht auf und trinkt ein halbes Bier. Der Weiteste muss danach eine Aufgabe
// schaffen. Dann verbeugen sich alle, die aufgestanden sind, vor jedem, der noch sitzt. Wer am nächsten
// dran war, bekommt die weiße Kugel und darf ein Hindernis auf den Rasen legen.
//
// Läuft wie die anderen Spiele über setup/view/act (ein Handy oder jeder sein Handy). Der Spielstand
// enthält auch die Kugel-Physik: Der Host rechnet den Wurf aus und schickt die Bahnen mit, alle Handys
// spielen sie in 3D ab. Gezeichnet wird mit three.js in einem Canvas, das beim Neuzeichnen erhalten bleibt.
(() => {
  "use strict";

  // --- Spielfeld (Meter). x quer (rechts = größer), y nach vorne in den Rasen. ---
  const SEAT_GAP = 1.0; // Abstand der Stühle
  const CHAIR_Y = -1.25; // Stuhlreihe
  const THROW_Y = -0.15; // hier verlässt die Kugel die Hand
  const RANGE = 14; // Flugweite bei voller Kraft
  const B_R = 0.065; // Boule-Kugel (etwas größer als echt, damit man sie sieht)
  const W_R = 0.04; // weiße Kugel
  const DECEL = 2.3; // Bremsen im Gras (m/s²)
  const ROLL = { boule: 0.1, white: 0.2 }; // so viel der Flugweite rollt die Kugel nach
  const SPREAD_A = 0.02; // Streuung der Richtung (rad)
  const SPREAD_P = 0.035; // Streuung der Kraft (Anteil)
  const FIELD = { x: 7.1, y0: 0.05, y1: 15.7 }; // Zaun links/rechts, Terrassenkante, Hecke
  const WHITE_MIN = 3; // so weit muss die weiße Kugel mindestens fliegen
  const DRINK_SECS = 60;
  const MAX_OBSTACLES = 10;
  const TREE = { x: -5.6, y: 12.6, r: 0.2 }; // Apfelbaum im Rasen, auch ein Hindernis

  const KINDS = {
    zwerg: { label: "Gartenzwerg", emoji: "🧙", r: 0.16 },
    kasten: { label: "Bierkasten", emoji: "🍺", r: 0.25 },
    topf: { label: "Blumentopf", emoji: "🪴", r: 0.19 },
    kanne: { label: "Gießkanne", emoji: "💧", r: 0.17 },
    flamingo: { label: "Flamingo", emoji: "🦩", r: 0.09 },
    stein: { label: "Stein", emoji: "🪨", r: 0.2 },
    huegel: { label: "Maulwurfshügel", emoji: "🟤", r: 0.23 },
  };

  // a = wie die Figur die Aufgabe in 3D macht
  const TASKS = [
    { t: "Lauf einmal um alle Stühle herum.", s: 20, a: "chairs" },
    { t: "Lauf bis zur Hecke, klatsch sie ab und komm zurück.", s: 20, a: "hedge" },
    { t: "Hol die weiße Kugel, aber rückwärts laufend.", s: 25, a: "white" },
    { t: "Dreh dich fünfmal im Kreis und lauf dann geradeaus zur weißen Kugel.", s: 25, a: "spin" },
    { t: "Hüpf auf einem Bein bis zur nächsten Kugel und zurück.", s: 30, a: "hop" },
    { t: "Zehn Hampelmänner und dabei laut mitzählen.", s: 15, a: "jacks" },
    { t: "Schubkarre: Einer hält deine Beine, du läufst fünf Meter auf den Händen.", s: 30, a: "squat" },
    { t: "Lauf einmal um den Apfelbaum und gib unterwegs jedem ein High Five.", s: 30, a: "tree" },
    { t: "Sing den Refrain von einem Lied, das sich die anderen aussuchen.", s: 30, a: "sing" },
    { t: "Zehn Kniebeugen und dabei das Alphabet rückwärts von Z bis P.", s: 30, a: "squat" },
    { t: "Ein Purzelbaum auf dem Rasen.", s: 15, a: "squat" },
    { t: "Lauf zur Hecke und zurück, ohne dass dein Bier überschwappt.", s: 25, a: "hedge" },
  ];

  // --- Hilfen ---
  const rid = () => Math.random().toString(36).slice(2, 9);
  const r2 = (v) => Math.round(v * 100) / 100;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const nm = (n) => `<b>${escapeHtml(n)}</b>`;
  const metres = (d) => `${d.toFixed(2).replace(".", ",")} m`;

  function gauss() {
    let u = 0;
    while (!u) u = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random());
  }

  function seatX(s, i) {
    return (i - (s.players.length - 1) / 2) * SEAT_GAP;
  }

  // Wer gerade wirft
  function thrower(s) {
    if (s.phase === "white") return s.players[s.holder];
    if (s.phase === "throw") return s.order[s.turn];
    return null;
  }

  // Rechts neben dem, der die weiße Kugel hat, geht es los, er selbst wirft als Letztes.
  function throwOrder(s) {
    const n = s.players.length;
    return Array.from({ length: n }, (_, i) => s.players[(s.holder + 1 + i) % n]);
  }

  // Wie viel Bier: u in halben Bieren, angepasst an die Stufe (Mild halb, Hart anderthalbmal).
  function beerOf(s, u) {
    const f = { mild: 0.5, hart: 1.5 }[levelOf(s)] ?? 1;
    return Math.round(u * 0.5 * f * 4) / 4;
  }

  function beerText(s, u) {
    const b = beerOf(s, u);
    const glass = levelOf(s) === "alkoholfrei";
    const whole = Math.floor(b);
    const frac = b - whole;
    const noun = glass ? (b > 1 ? "Gläser" : "Glas") : "Bier";
    if (!whole) return `${{ 0.25: "ein Viertel", 0.5: "ein halbes", 0.75: "drei Viertel" }[frac]} ${noun}`;
    if (!frac) return whole === 1 ? `ein ganzes ${noun}` : `${whole} ${noun}`;
    if (whole === 1 && frac === 0.5) return `anderthalb ${noun}`;
    return `${whole}${{ 0.25: "¼", 0.5: "½", 0.75: "¾" }[frac]} ${noun}`;
  }

  function beerShort(b) {
    const whole = Math.floor(b);
    const frac = { 0.25: "¼", 0.5: "½", 0.75: "¾" }[b - whole] ?? "";
    return `${whole || !frac ? whole : ""}${frac}`;
  }

  // --- Kugel-Physik (nur wer den Spielstand hält, rechnet; alle anderen spielen die Bahnen ab) ---

  function collide(a, b, e) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.hypot(dx, dy);
    const min = a.r + b.r;
    if (dist >= min) return false;
    const nx = dist ? dx / dist : 1;
    const ny = dist ? dy / dist : 0;
    const ia = a.fixed ? 0 : 1 / a.m;
    const ib = b.fixed ? 0 : 1 / b.m;
    const over = min - dist;
    a.x -= (nx * over * ia) / (ia + ib);
    a.y -= (ny * over * ia) / (ia + ib);
    b.x += (nx * over * ib) / (ia + ib);
    b.y += (ny * over * ib) / (ia + ib);
    const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
    if (rv < 0) {
      const j = (-(1 + e) * rv) / (ia + ib);
      a.vx -= j * ia * nx;
      a.vy -= j * ia * ny;
      b.vx += j * ib * nx;
      b.vy += j * ib * ny;
    }
    return true;
  }

  // shot: { id, from, ang, power, white }
  // Ergebnis: neue Positionen, ob die weiße Kugel berührt wurde, und die Bahnen für die Animation.
  function simulate(s, shot) {
    const d = shot.power * RANGE;
    const land = { x: shot.from.x + Math.sin(shot.ang) * d, y: shot.from.y + Math.cos(shot.ang) * d };
    const bodies = [];
    if (s.white && !shot.white) bodies.push({ id: "@w", x: s.white.x, y: s.white.y, r: W_R, m: 0.3, vx: 0, vy: 0 });
    for (const [id, b] of Object.entries(s.balls)) bodies.push({ id, x: b.x, y: b.y, r: B_R, m: 1, vx: 0, vy: 0 });
    const roll = d * (shot.white ? ROLL.white : ROLL.boule) * (0.75 + Math.random() * 0.5);
    const v0 = Math.sqrt(2 * DECEL * roll);
    const ball = {
      id: shot.id,
      x: land.x,
      y: land.y,
      r: shot.white ? W_R : B_R,
      m: shot.white ? 0.3 : 1,
      vx: Math.sin(shot.ang) * v0,
      vy: Math.cos(shot.ang) * v0,
    };
    bodies.push(ball);
    const fixed = [...s.obstacles.map((o) => ({ x: o.x, y: o.y, r: KINDS[o.k].r })), TREE].map((o) => ({ ...o, fixed: true, vx: 0, vy: 0 }));
    const start = bodies.map((b) => [b.x, b.y]);
    const samples = bodies.map((b) => [r2(b.x), r2(b.y)]);
    const DT = 1 / 120;
    const EVERY = 4; // 30 Bilder pro Sekunde
    let touched = false;
    let steps = 0;
    for (; steps < 120 * 10; steps++) {
      let moving = false;
      for (const b of bodies) {
        const sp = Math.hypot(b.vx, b.vy);
        if (!sp) continue;
        moving = true;
        const ns = Math.max(0, sp - DECEL * DT * (b.m < 1 ? 1.2 : 1));
        b.vx *= ns / sp;
        b.vy *= ns / sp;
        if (ns < 0.015) b.vx = b.vy = 0;
        b.x += b.vx * DT;
        b.y += b.vy * DT;
      }
      for (let i = 0; i < bodies.length; i++) {
        for (let j = i + 1; j < bodies.length; j++) {
          const a = bodies[i];
          const b = bodies[j];
          if (collide(a, b, 0.55) && ((a === ball && b.id === "@w") || (b === ball && a.id === "@w"))) touched = true;
        }
        for (const o of fixed) collide(o, bodies[i], 0.35);
        const b = bodies[i];
        if (Math.abs(b.x) > FIELD.x) {
          b.x = Math.sign(b.x) * FIELD.x;
          b.vx *= -0.3;
        }
        if (b.y > FIELD.y1) {
          b.y = FIELD.y1;
          b.vy *= -0.2;
        }
        if (b.y < FIELD.y0) {
          b.y = FIELD.y0;
          b.vy *= -0.3;
        }
      }
      if (steps % EVERY === EVERY - 1) bodies.forEach((b, i) => samples[i].push(r2(b.x), r2(b.y)));
      if (!moving && steps > 2) break;
    }
    // Bahnen nur für Kugeln, die sich bewegt haben; am Ende stehen sie still
    const tracks = {};
    bodies.forEach((b, i) => {
      if (b !== ball && Math.hypot(b.x - start[i][0], b.y - start[i][1]) < 0.005) return;
      const t = samples[i];
      t.push(r2(b.x), r2(b.y));
      while (t.length > 4 && t[t.length - 1] === t[t.length - 3] && t[t.length - 2] === t[t.length - 4]) t.length -= 2;
      tracks[b.id] = t;
    });
    const T = 0.5 + d * 0.06;
    const longest = Math.max(...Object.values(tracks).map((t) => t.length / 2));
    const anim = {
      id: rid(),
      ball: shot.id,
      white: !!shot.white,
      from: [r2(shot.from.x), r2(shot.from.y)],
      land: [r2(land.x), r2(land.y)],
      T: r2(T),
      h: r2(0.35 + d * 0.15),
      dt: EVERY / 120,
      tracks,
      dur: r2(T + (longest * EVERY) / 120),
    };
    const final = {};
    bodies.forEach((b) => (final[b.id] = { x: r2(b.x), y: r2(b.y) }));
    return { final, touched, anim, d };
  }

  // --- Spielablauf ---

  function startObstacles() {
    const list = [];
    for (let i = 0; i < 2; i++) list.push({ k: "huegel", x: r2((Math.random() - 0.5) * 9), y: r2(5 + Math.random() * 8), rot: r2(Math.random() * 6), id: rid() });
    return list;
  }

  function setup(players) {
    const s = {
      gid: rid(), // Spiel-Kennung, damit Bots nach „Nochmal“ nicht alte Schritte für erledigt halten
      players: [...players],
      round: 1,
      holder: Math.floor(Math.random() * players.length),
      phase: "white",
      k: 1,
      white: null,
      balls: {},
      touched: [],
      order: [],
      turn: 0,
      anim: null,
      obstacles: startObstacles(),
      tally: {},
      refused: {},
      standing: [],
      result: null,
      drink: null,
      task: null,
      bow: null,
      place: null,
      lastTask: -1,
    };
    players.forEach((p) => (s.tally[p] = 0));
    return s;
  }

  function doThrow(s, a) {
    const name = thrower(s);
    const i = s.players.indexOf(name);
    const white = s.phase === "white";
    const sim = simulate(s, {
      id: white ? "@w" : name,
      from: { x: seatX(s, i), y: THROW_Y },
      ang: clamp(Number(a.a) || 0, -0.8, 0.8) + gauss() * SPREAD_A,
      power: clamp(Number(a.p) || 0, 0.05, 1) * (1 + gauss() * SPREAD_P),
      white,
    });
    s.anim = sim.anim;
    s.k++;
    if (white) {
      const w = sim.final["@w"];
      const far = Math.hypot(w.x - seatX(s, i), w.y - THROW_Y);
      if (far < WHITE_MIN || w.y > FIELD.y1 - 0.2 || Math.abs(w.x) > FIELD.x - 0.2) {
        s.white = null;
        notice(s, { emoji: "↩️", title: far < WHITE_MIN ? "Zu kurz!" : "Zu weit!", text: `${name} wirft die weiße Kugel nochmal.` });
        return;
      }
      s.white = w;
      s.order = throwOrder(s);
      s.turn = 0;
      s.phase = "throw";
      return;
    }
    for (const [id, p] of Object.entries(sim.final)) {
      if (id === "@w") s.white = p;
      else s.balls[id] = p;
    }
    if (sim.touched && !s.touched.includes(name)) s.touched.push(name);
    s.turn++;
    if (s.turn >= s.order.length) finishThrows(s);
  }

  function finishThrows(s) {
    const dist = {};
    for (const n of s.order) dist[n] = r2(Math.hypot(s.balls[n].x - s.white.x, s.balls[n].y - s.white.y));
    const byDist = [...s.order].sort((a, b) => dist[a] - dist[b]);
    const clean = byDist.filter((n) => !s.touched.includes(n));
    s.result = { dist, far: byDist[byDist.length - 1], near: (clean.length ? clean : byDist)[0] };
    s.phase = "result";
  }

  // Trinken: list = [{ n, u }] (u in halben Bieren), danach geht es mit next weiter.
  function startDrink(s, list, next, why, kind) {
    s.drink = {
      id: rid(),
      next,
      why,
      kind,
      list: list.map(({ n, u, sit }) => ({ n, u, sit: !!sit, done: false, bot: isBot(n) ? Math.round(7000 + Math.random() * 16000) : 0 })),
    };
    list.forEach(({ n, u }) => (s.tally[n] = (s.tally[n] ?? 0) + u));
    drink(
      s,
      list.map((d) => ({ who: d.n, text: `${beerText(s, d.u)} · ${d.why ?? why}` }))
    );
    s.phase = "drink";
    s.k++;
  }

  function afterDrink(s) {
    const next = s.drink.next;
    if (next === "task") return startTask(s);
    if (next === "bow") return startBow(s);
  }

  function startTask(s) {
    let i;
    do i = Math.floor(Math.random() * TASKS.length);
    while (i === s.lastTask && TASKS.length > 1);
    s.lastTask = i;
    const who = s.result.far;
    s.task = { who, i, stage: "ready", id: rid() };
    if (isBot(who)) {
      s.task.botOk = Math.random() < 0.65;
      s.task.botMs = Math.round(TASKS[i].s * 1000 * (0.35 + Math.random() * 0.3));
    }
    s.phase = "task";
    s.k++;
  }

  // Verbeugen: Wer aufgestanden ist, verbeugt sich der Reihe nach vor jedem, der sitzt.
  function startBow(s) {
    if (!s.bow) s.bow = { queue: [...s.standing], ti: 0 };
    s.phase = "bow";
    s.k++;
    checkBow(s);
  }

  // Vor wem sich der aktuelle Ritter verbeugen muss: ab seinem rechten Nachbarn, leere Stühle überspringen.
  function bowTargets(s) {
    const cur = s.bow?.queue[0];
    if (!cur) return [];
    const n = s.players.length;
    const i = s.players.indexOf(cur);
    const out = [];
    for (let k = 1; k < n; k++) {
      const p = s.players[(i + k) % n];
      if (!s.standing.includes(p)) out.push(p);
    }
    return out;
  }

  function checkBow(s) {
    while (s.bow.queue.length) {
      const targets = bowTargets(s);
      if (s.bow.ti < targets.length) return;
      // Alle haben angenommen: setzen
      const cur = s.bow.queue.shift();
      s.standing = s.standing.filter((p) => p !== cur);
      s.bow.ti = 0;
    }
    s.standing = [];
    startPlace(s);
  }

  function refuseCost(s, cur) {
    return 1 + (s.refused[cur] ?? 0);
  }

  function startPlace(s) {
    s.place = { who: s.result.near, kind: null };
    s.phase = "place";
    s.k++;
  }

  function placeObstacle(s, kind, x, y) {
    if (!KINDS[kind]) return;
    x = clamp(Number(x) || 0, -6.4, 6.4);
    y = clamp(Number(y) || 0, 1.5, 14.8);
    // nicht in andere Hindernisse oder den Baum
    for (let tries = 0; tries < 30; tries++) {
      const hit = [...s.obstacles.map((o) => ({ ...o, r: KINDS[o.k].r })), TREE].find((o) => Math.hypot(o.x - x, o.y - y) < o.r + KINDS[kind].r + 0.05);
      if (!hit) break;
      const a = Math.atan2(y - hit.y, x - hit.x) || 0.5;
      x = clamp(hit.x + Math.cos(a) * (hit.r + KINDS[kind].r + 0.1), -6.4, 6.4);
      y = clamp(hit.y + Math.sin(a) * (hit.r + KINDS[kind].r + 0.1), 1.5, 14.8);
    }
    s.obstacles.push({ k: kind, x: r2(x), y: r2(y), rot: r2(Math.random() * Math.PI * 2), id: rid() });
    while (s.obstacles.length > MAX_OBSTACLES) s.obstacles.shift();
    s.lastPlaced = s.obstacles[s.obstacles.length - 1].id;
  }

  function newRound(s) {
    s.holder = s.players.indexOf(s.place.who);
    s.round++;
    s.white = null;
    s.balls = {};
    s.touched = [];
    s.order = [];
    s.turn = 0;
    s.result = null;
    s.drink = null;
    s.task = null;
    s.bow = null;
    s.place = null;
    s.refused = {};
    s.standing = [];
    s.phase = "white";
    s.k++;
  }

  function act(s, a) {
    switch (a.type) {
      case "throw":
        if (a.k !== s.k || (s.phase !== "white" && s.phase !== "throw")) return;
        return doThrow(s, a);
      case "next": {
        if (a.k !== s.k || s.phase !== "result") return;
        const { far } = s.result;
        s.standing = s.players.filter((p) => p === far || s.touched.includes(p));
        // Der Weiteste zuerst, dann die anderen in Sitzreihenfolge
        s.standing.sort((x, y) => (x === far ? -1 : y === far ? 1 : 0));
        const why = (p) => (p === far && s.touched.includes(p) ? "am weitesten weg und weiße Kugel berührt" : p === far ? "am weitesten weg" : "weiße Kugel berührt");
        startDrink(s, s.standing.map((n) => ({ n, u: 1, why: `${why(n)}: aufstehen, ein paar Meter weg, max. 1 Minute` })), "task", "", "stand");
        return;
      }
      case "empty": {
        if (s.phase !== "drink" || a.id !== s.drink.id) return;
        const d = s.drink.list.find((x) => x.n === a.who);
        if (!d || d.done) return;
        d.done = true;
        if (s.drink.list.every((x) => x.done)) afterDrink(s);
        return;
      }
      case "tasknew": {
        if (a.k !== s.k || s.phase !== "task" || s.task.stage !== "ready") return;
        const who = s.task.who;
        startTask(s);
        s.task.who = who;
        return;
      }
      case "taskgo":
        if (a.k !== s.k || s.phase !== "task" || s.task.stage !== "ready") return;
        s.task.stage = "run";
        s.k++;
        return;
      case "taskres":
        if (a.k !== s.k || s.phase !== "task" || s.task.stage !== "run") return;
        if (a.ok) {
          notice(s, { emoji: "🏅", title: "Geschafft!", text: `${s.task.who} darf sich jetzt verbeugen.` });
          return startBow(s);
        }
        return startDrink(s, [{ n: s.task.who, u: 1 }], "bow", "Aufgabe nicht geschafft", "task");
      case "accept":
        if (a.k !== s.k || s.phase !== "bow") return;
        s.bow.ti++;
        s.k++;
        return checkBow(s);
      case "refuse": {
        if (a.k !== s.k || s.phase !== "bow") return;
        const cur = s.bow.queue[0];
        const target = bowTargets(s)[s.bow.ti];
        const cost = refuseCost(s, cur);
        s.refused[cur] = (s.refused[cur] ?? 0) + 1;
        s.bow.ti = 0; // Runde fängt von vorne an
        return startDrink(
          s,
          [
            { n: cur, u: 1 },
            { n: target, u: cost, sit: true },
          ],
          "bow",
          `${target} hat ${cur} abgelehnt`,
          "refuse"
        );
      }
      case "kind":
        if (a.k !== s.k || s.phase !== "place" || !KINDS[a.kind]) return;
        s.place.kind = a.kind;
        s.k++;
        return;
      case "unkind":
        if (a.k !== s.k || s.phase !== "place") return;
        s.place.kind = null;
        s.k++;
        return;
      case "place":
        if (a.k !== s.k || s.phase !== "place") return;
        if (a.kind) placeObstacle(s, a.kind, a.x, a.y);
        return newRound(s);
    }
  }

  // --- Bots (nur wer den Spielstand hält, lässt sie spielen) ---

  function botThrow(s) {
    const name = thrower(s);
    const x0 = seatX(s, s.players.indexOf(name));
    if (s.phase === "white") {
      return { type: "throw", k: s.k, a: gauss() * 0.22, p: 0.42 + Math.random() * 0.38 };
    }
    const dx = s.white.x - x0;
    const dy = s.white.y - THROW_Y;
    const D = Math.hypot(dx, dy);
    // Kurz vor die weiße Kugel werfen, den Rest rollt sie
    const p = (D - 0.15) / (RANGE * (1 + ROLL.boule));
    return { type: "throw", k: s.k, a: Math.atan2(dx, dy) + gauss() * 0.03, p: p * (1 + gauss() * 0.055) };
  }

  function botBow(s) {
    const cost = refuseCost(s, s.bow.queue[0]);
    return { type: Math.random() < 0.3 / cost ? "refuse" : "accept", k: s.k };
  }

  function botPlace(s) {
    if (Math.random() < 0.15) return { type: "place", k: s.k };
    const kinds = Object.keys(KINDS);
    return { type: "place", k: s.k, kind: kinds[Math.floor(Math.random() * kinds.length)], x: (Math.random() - 0.5) * 9, y: 4 + Math.random() * 9 };
  }

  // Was als Nächstes von selbst passiert: { key, wait, afterAnim, act }
  function autoPlan(s) {
    switch (s.phase) {
      case "white":
      case "throw":
        if (!isBot(thrower(s))) return null;
        return { key: `t${s.k}`, wait: 1600 + Math.random() * 900, afterAnim: 1300, act: () => botThrow(s) };
      case "result":
        return { key: `r${s.k}`, wait: 0, afterAnim: 4200, act: () => ({ type: "next", k: s.k }) };
      case "drink": {
        const open = s.drink.list.filter((d) => !d.done && d.bot).sort((a, b) => a.bot - b.bot)[0];
        if (!open) return null;
        return { key: `d${s.drink.id}`, id: open.n, wait: open.bot, act: () => ({ type: "empty", id: s.drink.id, who: open.n }) };
      }
      case "task":
        if (!isBot(s.task.who)) return null;
        if (s.task.stage === "ready") return { key: `k${s.k}`, wait: 3000, act: () => ({ type: "taskgo", k: s.k }) };
        return { key: `k${s.k}`, wait: s.task.botMs, act: () => ({ type: "taskres", k: s.k, ok: s.task.botOk }) };
      case "bow": {
        const target = bowTargets(s)[s.bow.ti];
        if (!isBot(target)) return null;
        return { key: `b${s.k}`, wait: 3200, act: () => botBow(s) };
      }
      case "place":
        if (!isBot(s.place.who)) return null;
        return { key: `p${s.k}`, wait: 2600, act: () => botPlace(s) };
    }
    return null;
  }

  // --- Anzeige ---

  function chipsHtml(s) {
    const chip = (text, cls = "") => `<li class="${cls}">${text}</li>`;
    let items = [];
    switch (s.phase) {
      case "throw":
        items = s.order.map((n, i) => chip(`${i < s.turn ? "✓ " : ""}${escapeHtml(n)}`, i === s.turn ? "now" : i < s.turn ? "done" : ""));
        break;
      case "result": {
        const { dist, far, near } = s.result;
        items = [...s.order]
          .sort((a, b) => dist[a] - dist[b])
          .map((n) => chip(`${n === near ? "🏆 " : n === far ? "🍺 " : ""}${escapeHtml(n)} ${metres(dist[n])}${s.touched.includes(n) ? " ⚠️" : ""}`, n === far ? "bad" : n === near ? "good" : ""));
        break;
      }
      case "drink":
        items = s.drink.list.map((d) => chip(`${d.done ? "✓" : drinkEmoji(s)} ${escapeHtml(d.n)} ${beerShort(beerOf(s, d.u))}`, d.done ? "done" : "now"));
        break;
      case "bow": {
        const targets = bowTargets(s);
        items = targets.map((n, i) => chip(`${i < s.bow.ti ? "✓ " : ""}${escapeHtml(n)}`, i === s.bow.ti ? "now" : i < s.bow.ti ? "done" : ""));
        break;
      }
      case "place":
        items = [...s.players]
          .sort((a, b) => (s.tally[b] ?? 0) - (s.tally[a] ?? 0))
          .map((n) => chip(`${escapeHtml(n)} ${drinkEmoji(s)} ${beerShort(beerOf(s, s.tally[n] ?? 0))}`));
        break;
    }
    return items.length ? `<ul class="hr-chips">${items.join("")}</ul>` : "";
  }

  function view(s, me) {
    const you = (n) => !!me && n === me;
    const v = { phase: `Runde ${s.round}`, title: "", body: "", actions: [] };
    let hint = "";
    switch (s.phase) {
      case "white": {
        const h = s.players[s.holder];
        v.title = you(h) ? "Du wirfst die weiße Kugel!" : `${nm(h)} wirft die weiße Kugel`;
        if (!isBot(h)) {
          v.turn = h;
          if (!me || you(h)) hint = "Finger aufs Bild, nach unten ziehen, loslassen.";
        }
        break;
      }
      case "throw": {
        const t = thrower(s);
        v.phase = `Runde ${s.round} · Wurf ${s.turn + 1} von ${s.order.length}`;
        v.title = you(t) ? "Du bist dran: so nah wie möglich an die weiße Kugel!" : `${nm(t)} wirft`;
        if (!isBot(t)) {
          v.turn = t;
          if (!me || you(t)) hint = "Ziehen und loslassen. Die weiße Kugel nicht berühren!";
        }
        break;
      }
      case "result": {
        const { far, near } = s.result;
        const touched = s.touched;
        v.title = `${nm(far)} liegt am weitesten weg`;
        hint = touched.length ? `Weiße Kugel berührt: ${touched.map(escapeHtml).join(", ")}. ` : "";
        hint += `Am nächsten dran: ${escapeHtml(near)}.`;
        v.actions.push({ label: "Weiter", act: { type: "next", k: s.k } });
        break;
      }
      case "drink": {
        const open = s.drink.list.filter((d) => !d.done);
        const names = open.map((d) => (you(d.n) ? "Du" : nm(d.n)));
        v.phase = { stand: "Aufstehen und trinken", task: "Aufgabe nicht geschafft", refuse: "Abgelehnt" }[s.drink.kind];
        v.title = `${names.join(" und ")} ${names.length === 1 && names[0] !== "Du" ? "trinkt" : "trinken"}`;
        hint = s.drink.kind === "stand" ? "Ein paar Meter weggehen und in max. 1 Minute austrinken." : `${escapeHtml(s.drink.why)}. Max. 1 Minute.`;
        for (const d of open) {
          if (isBot(d.n)) continue;
          v.actions.push({ label: you(d.n) ? `${drinkEmoji(s)} Leer!` : `${escapeHtml(d.n)}: leer ✓`, sub: you(d.n) || !me ? beerText(s, d.u) : "", by: d.n, act: { type: "empty", id: s.drink.id, who: d.n } });
        }
        break;
      }
      case "task": {
        const t = s.task;
        const task = TASKS[t.i];
        v.phase = "Aufgabe";
        v.title = `${you(t.who) ? "Deine Aufgabe" : `Aufgabe für ${nm(t.who)}`}: ${escapeHtml(task.t)}`;
        if (t.stage === "ready") {
          hint = `Zeit: ${task.s} Sekunden. Oder denkt euch selbst was aus.`;
          if (!isBot(t.who)) {
            v.actions.push({ label: "Los! ⏱", act: { type: "taskgo", k: s.k } });
            v.actions.push({ label: "Andere Aufgabe", ghost: true, act: { type: "tasknew", k: s.k } });
          }
        } else {
          hint = `Nicht geschafft: noch ${beerText(s, 1)}.`;
          if (!isBot(t.who)) {
            v.actions.push({ label: "Geschafft ✓", act: { type: "taskres", k: s.k, ok: true } });
            v.actions.push({ label: "Nicht geschafft ✗", ghost: true, act: { type: "taskres", k: s.k, ok: false } });
          }
        }
        break;
      }
      case "bow": {
        const cur = s.bow.queue[0];
        const target = bowTargets(s)[s.bow.ti];
        const cost = refuseCost(s, cur);
        v.phase = "Verbeugen";
        v.title = `${you(cur) ? "Du verbeugst dich" : `${nm(cur)} verbeugt sich`} vor ${you(target) ? "dir" : nm(target)}`;
        hint = you(target) ? "Nimmst du an?" : isBot(target) ? `${escapeHtml(target)} überlegt…` : `${escapeHtml(target)} nimmt an oder lehnt ab.`;
        hint += ` Ablehnen: ${escapeHtml(cur)} trinkt ${beerText(s, 1)}, ${escapeHtml(target)} ${beerText(s, cost)}, dann fängt ${escapeHtml(cur)} von vorne an.`;
        if (!isBot(target)) {
          v.actions.push({ label: "Annehmen 🙇", by: target, act: { type: "accept", k: s.k } });
          v.actions.push({ label: "Ablehnen ✋", sub: `selbst ${beerText(s, cost)}`, ghost: true, by: target, act: { type: "refuse", k: s.k } });
        }
        break;
      }
      case "place": {
        const { who, kind } = s.place;
        v.phase = "Hindernis";
        if (!kind) {
          v.title = `${you(who) ? "Du bist" : `${nm(who)} ist`} am nächsten dran und ${you(who) ? "bekommst" : "bekommt"} die weiße Kugel`;
          hint = "Leg ein Hindernis auf den Rasen:";
          if (!isBot(who)) {
            v.actionsClass = "hr-kinds";
            for (const [key, k] of Object.entries(KINDS)) v.actions.push({ label: k.emoji, sub: k.label, by: who, act: { type: "kind", k: s.k, kind: key } });
            v.actions.push({ label: "✕", sub: "Keins", ghost: true, by: who, act: { type: "place", k: s.k } });
          }
        } else {
          v.title = `${KINDS[kind].emoji} ${KINDS[kind].label}: ${you(who) || !me ? "Tipp auf den Rasen, wo er hin soll" : `${nm(who)} sucht einen Platz`}`;
          if (!isBot(who)) {
            v.actions.push({ label: "Zufällig hinlegen", by: who, act: { type: "place", k: s.k, kind, x: (Math.random() - 0.5) * 9, y: 4 + Math.random() * 9 } });
            v.actions.push({ label: "Zurück", ghost: true, by: who, act: { type: "unkind", k: s.k } });
          }
        }
        break;
      }
    }
    v.body = `<div class="hr-view"><div class="hr-mount"></div>${chipsHtml(s)}</div>${hint ? `<p class="hr-hint">${hint}</p>` : ""}`;
    return v;
  }

  // Gezeichnet wird in hodenritter-3d.js (lädt three.js erst, wenn das Spiel startet).
  function afterRender(root, s, me) {
    window.Hodenritter3D?.mount(root, s, me);
    if (!window.Hodenritter3D) loadScene(root, s, me);
    driveAuto();
    return window.Hodenritter3D?.holdMs?.(s) ?? 0;
  }

  let loading = false;
  function loadScene() {
    if (loading) return;
    loading = true;
    const add = (src, next) => {
      const el = document.createElement("script");
      el.src = src;
      el.onload = next;
      el.onerror = () => (loading = false);
      document.head.appendChild(el);
    };
    const go = () => add("hodenritter-3d.js", () => typeof run !== "undefined" && run?.key === "hodenritter" && window.Hodenritter3D.mount(document.getElementById("game-root"), run.s, run.me));
    if (window.THREE) go();
    else add("vendor/three.min.js", go);
  }

  // Bots und automatische Schritte: nur das Handy, das den Spielstand hält (ein Handy oder der Host).
  const seen = new Map();
  const sent = new Set();
  let autoTimer = null;
  function driveAuto() {
    if (!autoTimer) autoTimer = setInterval(autoTick, 200);
  }
  function autoTick() {
    if (typeof run === "undefined" || !run || run.key !== "hodenritter" || !document.getElementById("screen-game").classList.contains("active")) return;
    if (run.me && !run.host) return;
    const s = run.s;
    const plan = autoPlan(s);
    if (!plan) return;
    plan.key = `${s.gid}:${plan.key}`;
    const now = Date.now();
    if (!seen.has(plan.key)) seen.set(plan.key, now);
    if (seen.size > 300) seen.delete(seen.keys().next().value);
    const id = `${plan.key}:${plan.id ?? ""}`;
    if (sent.has(id)) return;
    // Auf einem Handy erst weiter, wenn die Trink-Meldung weg ist und die Kugeln liegen.
    if (!run.me && !document.getElementById("drink-alert").hidden) return seen.set(plan.key, Math.max(seen.get(plan.key), now - plan.wait + 1200));
    const animEnd = window.Hodenritter3D?.animEndsAt?.() ?? 0;
    if (now - seen.get(plan.key) < plan.wait || now - animEnd < (plan.afterAnim ?? 0)) return;
    sent.add(id);
    if (sent.size > 300) sent.delete(sent.values().next().value);
    run.send(plan.act());
  }

  registerGame("hodenritter", {
    label: "Hodenritter",
    emoji: "⚪",
    description: "Boule im Garten. Wer am weitesten weg liegt, trinkt und muss sich vor allen verbeugen.",
    color: "#16a34a",
    privateAlerts: true,
    rules: [
      "Alle sitzen in einer Reihe auf Gartenstühlen vor dem Rasen, jeder hat eine Kugel. Wer die weiße Kugel hat, wirft sie zuerst auf den Rasen.",
      "Dann wirft der rechte Nachbar so nah wie möglich an die weiße Kugel, ohne sie zu berühren, danach der nächste. Wer die weiße Kugel geworfen hat, wirft als Letztes.",
      "Werfen: Finger aufs Bild, nach unten ziehen (je weiter, desto fester) und loslassen. Zur Seite ziehen lenkt.",
      "Wer am weitesten weg liegt und wer die weiße Kugel berührt hat, steht auf, geht ein paar Meter weg und trinkt ein halbes Bier, höchstens 1 Minute.",
      "Der Weiteste macht danach eine Aufgabe (die App schlägt eine vor, ihr dürft euch auch selbst was ausdenken). Nicht geschafft: noch ein halbes.",
      "Dann verbeugt sich jeder, der aufgestanden ist, vor jedem, der noch sitzt, angefangen beim rechten Nachbarn. Leere Stühle werden übersprungen.",
      "Lehnt jemand ab, trinken beide ein halbes und die Verbeugungsrunde fängt von vorne an. Wer jemanden ablehnt, der schon abgelehnt wurde, trinkt mehr: 1 Bier, beim dritten Mal anderthalb und so weiter.",
      "Wer am nächsten an der weißen Kugel liegt (ohne sie zu berühren), bekommt sie für die nächste Runde und darf ein Hindernis auf den Rasen legen.",
    ],
    setup,
    view,
    act,
    afterRender,
  });

  // Für hodenritter-3d.js und Tests
  window.Hodenritter = { SEAT_GAP, CHAIR_Y, THROW_Y, RANGE, B_R, W_R, FIELD, TREE, KINDS, TASKS, DRINK_SECS, seatX, thrower, bowTargets, beerOf, act, setup };
})();
