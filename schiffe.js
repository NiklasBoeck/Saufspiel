// Schiffe versenken: Jeder versteckt seine Flotte auf einem 8 × 8-Meer, dann wird reihum geschossen.
// Treffer: einen Schluck verteilen und nochmal schießen. Schiff versenkt: zusätzlich einen Shot verteilen.
// Mit mehr als zwei Leuten sucht man sich aus, auf wen man schießt. Wer zuletzt noch ein Schiff hat, gewinnt.
// Ein Handy: jeder stellt seine Flotte geheim auf (Handy weitergeben, die anderen gucken weg), beim Schießen
// sieht man nur Treffer und Wasser, da gibt es nichts zu verstecken. Die eigene Flotte zeigt man durch Gedrückthalten.
// Mehrere Handys: alle stellen gleichzeitig auf, jeder sieht unten seine eigene Flotte.
(() => {
  const KEY = "schiffe";
  const N = 8; // Feld N × N
  const FLEET = [
    { len: 4, name: "Partydampfer" },
    { len: 3, name: "Bierkahn" },
    { len: 3, name: "Fischkutter" },
    { len: 2, name: "Schnellboot" },
    { len: 2, name: "Gummiboot" },
  ];
  const HIT = 1; // Schlucke zum Verteilen pro Treffer
  const COLS = "ABCDEFGH";

  const nm = (p) => `<b>${escapeHtml(p)}</b>`;
  const at = (r, c) => r * N + c;
  const rc = (i) => [Math.floor(i / N), i % N];
  const coord = (i) => `${COLS[i % N]}${Math.floor(i / N) + 1}`;
  const humans = (s) => s.players.filter((p) => !isBot(p));

  // Schiff: { r, c, len, v } (v = senkrecht), Felder als Index r * N + c
  function cellsOf(sh) {
    const out = [];
    for (let k = 0; k < sh.len; k++) out.push(sh.v ? at(sh.r + k, sh.c) : at(sh.r, sh.c + k));
    return out;
  }
  const inside = (sh) => sh.r >= 0 && sh.c >= 0 && (sh.v ? sh.r + sh.len : sh.c + sh.len) <= N && (sh.v ? sh.c : sh.r) < N;

  // Fehlerhafte Schiffe: außerhalb, überlappend oder berührend (auch über Eck). Gibt die Indizes der Schiffe zurück.
  function badShips(ships) {
    const bad = new Set();
    const owner = new Map();
    ships.forEach((sh, k) => {
      if (!inside(sh)) bad.add(k);
      else for (const i of cellsOf(sh)) owner.set(i, owner.has(i) ? -1 : k);
    });
    ships.forEach((sh, k) => {
      if (!inside(sh)) return;
      for (const i of cellsOf(sh)) {
        const [r, c] = rc(i);
        for (let dr = -1; dr <= 1; dr++)
          for (let dc = -1; dc <= 1; dc++) {
            const rr = r + dr;
            const cc = c + dc;
            if (rr < 0 || cc < 0 || rr >= N || cc >= N) continue;
            const o = owner.get(at(rr, cc));
            if (o === -1 || (o != null && o !== k)) {
              bad.add(k);
              if (o >= 0) bad.add(o);
            }
          }
      }
    });
    return bad;
  }

  function randomFleet() {
    for (let tries = 0; tries < 500; tries++) {
      const ships = [];
      let ok = true;
      for (const f of FLEET) {
        let placed = false;
        for (let k = 0; k < 200 && !placed; k++) {
          const v = Math.random() < 0.5;
          const sh = { r: Math.floor(Math.random() * (v ? N - f.len + 1 : N)), c: Math.floor(Math.random() * (v ? N : N - f.len + 1)), len: f.len, v };
          if (!badShips([...ships, sh]).size) {
            ships.push(sh);
            placed = true;
          }
        }
        if (!placed) {
          ok = false;
          break;
        }
      }
      if (ok) return ships;
    }
    return null;
  }

  // Passt eine geschickte Flotte zu den Regeln?
  function validFleet(ships) {
    if (!Array.isArray(ships) || ships.length !== FLEET.length) return false;
    const clean = ships.map((sh, k) => ({ r: sh?.r | 0, c: sh?.c | 0, len: FLEET[k].len, v: !!sh?.v }));
    if (ships.some((sh, k) => sh?.len !== FLEET[k].len)) return false;
    return !badShips(clean).size && clean;
  }

  // --- Spielstand ---

  const shipAt = (s, p, i) => s.fleets[p].findIndex((sh) => cellsOf(sh).includes(i));
  const isSunk = (s, p, k) => cellsOf(s.fleets[p][k]).every((i) => s.shots[p][i]);
  const sunkList = (s, p) => s.fleets[p].map((_, k) => k).filter((k) => isSunk(s, p, k));
  const afloat = (s, p) => FLEET.length - sunkList(s, p).length;
  const alive = (s) => s.players.filter((p) => !s.out.includes(p));

  // Felder rund um versenkte Schiffe: da kann nichts mehr sein (wird hell markiert, Bots schießen nicht drauf)
  function deadWater(s, p) {
    const out = new Set();
    for (const k of sunkList(s, p)) {
      for (const i of cellsOf(s.fleets[p][k])) {
        const [r, c] = rc(i);
        for (let dr = -1; dr <= 1; dr++)
          for (let dc = -1; dc <= 1; dc++) {
            const rr = r + dr;
            const cc = c + dc;
            if (rr >= 0 && cc >= 0 && rr < N && cc < N) out.add(at(rr, cc));
          }
      }
    }
    return out;
  }

  function nextAlive(s, from) {
    const ps = s.players;
    for (let k = 1; k <= ps.length; k++) {
      const p = ps[(ps.indexOf(from) + k) % ps.length];
      if (!s.out.includes(p)) return p;
    }
    return from;
  }

  // Auf wen schießt der Schütze erst mal? Menschen: den Nächsten. Bots suchen selbst aus.
  function defaultTarget(s, shooter) {
    if (isBot(shooter)) return botTarget(s, shooter);
    return nextAlive(s, shooter);
  }

  function startBattle(s) {
    s.stage = "battle";
    s.turn = s.players[s.first % s.players.length];
    s.target = defaultTarget(s, s.turn);
  }

  function shoot(s, shooter, t, i) {
    const p = shooter;
    s.shotN++;
    const k = shipAt(s, t, i);
    const hit = k >= 0;
    s.shots[t][i] = hit ? "h" : "m";
    const sunk = hit && isSunk(s, t, k);
    s.last = { id: s.shotN, by: p, t, i, hit, sunk: sunk ? FLEET[k].name : null };
    if (!hit) {
      s.turn = nextAlive(s, p);
      s.target = defaultTarget(s, s.turn);
      return notice(s, { emoji: "🌊", title: `Wasser! ${coord(i)} bei ${t}.`, text: `${s.turn} ist dran.` });
    }
    s.tally[p].hits++;
    s.tally[p].sips += LEVELS[levelOf(s)].scale(HIT);
    const items = [{ who: p, n: HIT, give: true, text: `💥 Treffer auf ${coord(i)} bei ${t}` }];
    if (sunk) {
      s.tally[p].sunk++;
      s.tally[p].shots++;
      if (isBot(p)) {
        const others = s.players.filter((q) => q !== p);
        const to = others[Math.floor(Math.random() * others.length)];
        items.push({ who: to, text: `🥃 1 Shot von ${p}, ${FLEET[k].name} versenkt` });
      } else items.push({ who: p, give: true, text: `🥃 1 Shot verteilen: ${t}s ${FLEET[k].name} ist versenkt` });
    }
    if (!afloat(s, t)) {
      s.out.push(t);
      s.last.out = true;
      if (alive(s).length <= 1) {
        s.stage = "end";
        s.winner = alive(s)[0] ?? p;
        score(s, [s.winner], [s.out[0]]);
      } else s.target = defaultTarget(s, p);
    }
    drink(s, items);
  }

  // --- Bots ---

  // Bekannte Treffer, die noch zu keinem versenkten Schiff gehören
  function openHits(s, t) {
    const sunkCells = new Set(sunkList(s, t).flatMap((k) => cellsOf(s.fleets[t][k])));
    return Object.keys(s.shots[t])
      .map(Number)
      .filter((i) => s.shots[t][i] === "h" && !sunkCells.has(i));
  }

  function botTarget(s, bot) {
    const opp = alive(s).filter((p) => p !== bot);
    if (!opp.length) return bot;
    const hunting = opp.filter((p) => openHits(s, p).length);
    const smart = hunting.length ? hunting[Math.floor(Math.random() * hunting.length)] : opp[Math.floor(Math.random() * opp.length)];
    return botPick(smart, opp, 0.15);
  }

  function botCell(s, t) {
    const dead = deadWater(s, t);
    const free = [];
    for (let i = 0; i < N * N; i++) if (!s.shots[t][i] && !dead.has(i)) free.push(i);
    if (!free.length) for (let i = 0; i < N * N; i++) if (!s.shots[t][i]) free.push(i);
    const isFree = (i) => free.includes(i);
    const hits = openHits(s, t);
    let cand = [];
    if (hits.length) {
      // In einer Linie weiter, sonst rundherum
      const rows = new Set(hits.map((i) => rc(i)[0]));
      const cols = new Set(hits.map((i) => rc(i)[1]));
      if (hits.length >= 2 && (rows.size === 1 || cols.size === 1)) {
        const sorted = [...hits].sort((a, b) => a - b);
        const step = rows.size === 1 ? 1 : N;
        const a = sorted[0] - step;
        const b = sorted[sorted.length - 1] + step;
        if (rows.size === 1) {
          const r = rc(sorted[0])[0];
          if (a >= 0 && rc(a)[0] === r) cand.push(a);
          if (b < N * N && rc(b)[0] === r) cand.push(b);
        } else {
          if (a >= 0) cand.push(a);
          if (b < N * N) cand.push(b);
        }
      }
      if (!cand.filter(isFree).length)
        for (const h of hits) {
          const [r, c] = rc(h);
          if (r > 0) cand.push(at(r - 1, c));
          if (r < N - 1) cand.push(at(r + 1, c));
          if (c > 0) cand.push(at(r, c - 1));
          if (c < N - 1) cand.push(at(r, c + 1));
        }
      cand = cand.filter(isFree);
    }
    if (!cand.length) {
      // Schachbrett-Muster: so findet man jedes Schiff ab Länge 2
      cand = free.filter((i) => (rc(i)[0] + rc(i)[1]) % 2 === 0);
      if (!cand.length) cand = free;
    }
    const smart = cand[Math.floor(Math.random() * cand.length)];
    return botPick(smart, free, 0.2);
  }

  // --- Am Handy: Flotte aufstellen (nur lokal, bis „Fertig“), Handy-Übergabe, Gedrückthalten ---

  const drafts = {}; // `${gid}:${name}` → { ships, sel }
  const opened = new Set(); // ein Handy: wer hat die Übergabe bestätigt
  const animated = new Set();

  const live = () => typeof run !== "undefined" && run && run.key === KEY && document.getElementById("screen-game").classList.contains("active");
  const rerender = () => live() && playGame(run);

  function draftOf(s, p) {
    const k = `${s.gid}:${p}`;
    drafts[k] ??= { ships: randomFleet(), sel: null };
    return drafts[k];
  }

  // Schiff im Feld halten (beim Verschieben und Drehen)
  function clamp(sh) {
    const maxR = sh.v ? N - sh.len : N - 1;
    const maxC = sh.v ? N - 1 : N - sh.len;
    return { ...sh, r: Math.max(0, Math.min(maxR, sh.r)), c: Math.max(0, Math.min(maxC, sh.c)) };
  }

  // --- Ansicht ---

  // Spielfeld zeichnen. cell(i) → { cls, act, by } für jedes Feld
  function boardHtml(cell, extra = "", label = "") {
    let h = `<div class="sv-board ${extra}">${label ? `<span class="sv-label">${label}</span>` : ""}<div class="sv-grid"><i></i>`;
    for (let c = 0; c < N; c++) h += `<i class="sv-h">${COLS[c]}</i>`;
    for (let r = 0; r < N; r++) {
      h += `<i class="sv-h">${r + 1}</i>`;
      for (let c = 0; c < N; c++) {
        const i = at(r, c);
        const x = cell(i);
        const act = x.act ? ` data-act="${escapeHtml(JSON.stringify(x.act))}"${x.by ? ` data-by="${escapeHtml(x.by)}"` : ""}` : "";
        const ed = x.ed != null ? ` data-ed="${i}"` : "";
        h += `<b class="sv-c ${x.cls ?? ""}"${act}${ed}></b>`;
      }
    }
    return `${h}</div></div>`;
  }

  // Schiffs-Teile: Bug und Heck rund
  function shipCls(ships, i) {
    const k = ships.findIndex((sh) => cellsOf(sh).includes(i));
    if (k < 0) return { k: -1, cls: "" };
    const sh = ships[k];
    const cs = cellsOf(sh);
    const pos = cs.indexOf(i);
    return { k, cls: `s ${sh.v ? "v" : "hz"}${pos === 0 ? " s0" : ""}${pos === cs.length - 1 ? " s1" : ""}` };
  }

  // Öffentliche Ansicht eines Meeres (Treffer, Wasser, versenkt). showShips: eigene Flotte mit einzeichnen.
  function seaCell(s, t, i, showShips) {
    const shot = s.shots[t][i];
    const k = shipAt(s, t, i);
    const sunk = k >= 0 && isSunk(s, t, k);
    let cls = "";
    if (sunk || showShips) cls = shipCls(s.fleets[t], i).cls;
    if (sunk) cls += " k";
    else if (shot === "h") cls += " x";
    else if (shot === "m") cls += " m";
    if (s.last && s.last.t === t && s.last.i === i) cls += " fresh";
    return cls;
  }

  function seaHtml(s, t, opt = {}) {
    const dead = deadWater(s, t);
    const shooter = opt.shooter;
    return boardHtml(
      (i) => {
        let cls = seaCell(s, t, i, opt.showShips);
        if (!s.shots[t][i] && dead.has(i)) cls += " a";
        const can = shooter && !s.shots[t][i];
        return { cls: cls + (can ? " t" : ""), act: can ? { type: "shot", n: s.shotN, t, c: i } : null, by: shooter };
      },
      opt.cls ?? "",
      opt.label ?? ""
    );
  }

  function introView(s) {
    const [a, b] = [...s.players.map(escapeHtml), "Kim", "Max"];
    return {
      phase: "So geht Schiffe versenken",
      title: "Versteck deine Flotte, versenk die der anderen.",
      body: `<ol class="za-intro">
          <li>Jeder stellt geheim <b>5 Schiffe</b> auf sein 8 × 8-Meer (oder lässt würfeln). Schiffe dürfen sich nicht berühren, auch nicht über Eck.</li>
          <li>Reihum wird geschossen: Feld antippen. Mit mehr als zwei Leuten suchst du dir oben aus, auf wen.</li>
          <li><b>Treffer:</b> du verteilst ${sips(HIT)} und schießt nochmal. <b>Versenkt:</b> du verteilst zusätzlich einen <b>Shot</b> 🥃. Wasser: der Nächste ist dran.</li>
          <li>Wessen Flotte ganz versenkt ist, ist raus. Wer zuletzt noch ein Schiff hat, gewinnt.</li>
        </ol>
        <p class="za-example">Beispiel: ${a} schießt bei ${b} auf C4: Treffer! ${a} verteilt ${sips(HIT)} und schießt nochmal: D4, versenkt, das Schnellboot ist weg. ${a} verteilt noch einen Shot 🥃 und schießt weiter, bis Wasser kommt.</p>`,
      actions: [{ label: "Verstanden, Flotte aufstellen ⚓", act: { type: "go" } }],
    };
  }

  function editorHtml(s, p) {
    const d = draftOf(s, p);
    const bad = badShips(d.ships);
    const board = boardHtml((i) => {
      const { k, cls } = shipCls(d.ships, i);
      return { cls: `${cls}${k >= 0 && k === d.sel ? " sel" : ""}${k >= 0 && bad.has(k) ? " bad" : ""}`, ed: true };
    }, "sv-edit");
    const sel = d.sel != null ? FLEET[d.sel] : null;
    const hint = bad.size
      ? `<p class="sv-hint bad">⚠️ Rote Schiffe berühren sich. Schieb sie auseinander.</p>`
      : sel
        ? `<p class="sv-hint">${sel.name} (${sel.len}) gewählt: tipp ein Feld, wohin es soll. Nochmal aufs Schiff tippen = drehen.</p>`
        : `<p class="sv-hint">Tipp ein Schiff an, dann ein Feld, wohin es soll. Oder einfach würfeln.</p>`;
    return {
      ok: !bad.size,
      ships: d.ships,
      html: `<div class="sv-place">${board}<div class="sv-tools">${hint}<div class="sv-tool-btns"><button class="btn ghost" data-ed="random">🎲 Würfeln</button><button class="btn ghost" data-ed="rotate" ${sel ? "" : "disabled"}>↻ Drehen</button></div></div></div>`,
    };
  }

  function readyList(s) {
    return `<ul class="za-tally sv-ready">${s.players.map((p) => `<li>${s.fleets[p] ? "✅" : "⏳"} ${escapeHtml(p)}</li>`).join("")}</ul>`;
  }

  function placeView(s, me) {
    const phase = "Flotte aufstellen";
    if (me) {
      if (s.fleets[me]) {
        const missing = s.players.filter((p) => !s.fleets[p]);
        return {
          phase,
          title: "Deine Flotte steht. Warte auf die anderen…",
          body: `${readyList(s)}${seaHtml(s, me, { showShips: true, cls: "sv-solo" })}`,
          actions: missing.length && missing.every((p) => !isBot(p)) ? [{ label: "Ohne die anderen starten", sub: `${missing.join(", ")} kriegen eine gewürfelte Flotte`, ghost: true, act: { type: "start" } }] : [],
        };
      }
      const ed = editorHtml(s, me);
      return { phase, title: "Stell deine Flotte geheim auf.", body: ed.html, actions: [{ label: "Fertig ✅", disabled: !ed.ok, act: { type: "fleet", who: me, ships: ed.ships } }] };
    }
    // Ein Handy: Menschen nacheinander, vorher Handy weitergeben
    const p = humans(s).find((q) => !s.fleets[q]);
    if (!p) return { phase, title: "Die Bots stellen auf…", body: readyList(s), actions: [] };
    const tag = `${s.gid}:${p}`;
    if (humans(s).length > 1 && !opened.has(tag)) {
      return {
        phase,
        title: `📱 Gib das Handy ${nm(p)}. Alle anderen weggucken!`,
        body: `${readyList(s)}<button class="sv-handover" data-local="open" data-tag="${escapeHtml(tag)}"><span>🙈</span><b>Ich bin ${escapeHtml(p)}</b><small>Tippen, dann siehst nur du deine Flotte</small></button>`,
        actions: [],
      };
    }
    const ed = editorHtml(s, p);
    return {
      phase,
      title: `${nm(p)}, stell deine Flotte geheim auf.`,
      body: ed.html,
      actions: [{ label: humans(s).length > 1 ? "Fertig, Handy weitergeben ✅" : "Fertig ✅", disabled: !ed.ok, act: { type: "fleet", who: p, ships: ed.ships } }],
    };
  }

  function chipsHtml(s, canAim) {
    return `<div class="sv-chips">${s.players
      .map((p) => {
        const out = s.out.includes(p);
        const left = afloat(s, p);
        const aim = canAim && !out && p !== s.turn && p !== s.target;
        const act = aim ? ` data-act="${escapeHtml(JSON.stringify({ type: "aim", n: s.shotN, t: p }))}" data-by="${escapeHtml(s.turn)}"` : "";
        const cls = `${out ? "out" : ""} ${p === s.target ? "aim" : ""} ${p === s.turn ? "turn" : ""} ${aim ? "can" : ""}`;
        return `<button class="sv-chip ${cls}"${act}>${p === s.turn ? "🎯 " : p === s.target ? "💣 " : ""}<span>${escapeHtml(p)}</span><small>${out ? "💀" : `🚢 ${left}`}</small></button>`;
      })
      .join("")}</div>`;
  }

  function battleView(s, me) {
    const shooter = s.turn;
    const t = s.target;
    const hs = humans(s);
    // Wer guckt auf dieses Handy? Mehrere Handys: ich. Ein Handy mit nur einem Menschen: der.
    const viewer = me ?? (hs.length === 1 ? hs[0] : null);
    const mine = me ? me === shooter : !isBot(shooter);
    const canAim = mine && alive(s).length > 2;
    const main = seaHtml(s, t, { shooter: mine ? shooter : null, showShips: viewer === t, cls: "sv-main", label: viewer === t ? "Dein Meer" : `Meer von ${escapeHtml(t)}` });
    let mini = "";
    if (viewer && viewer !== t && !s.out.includes(viewer)) mini = seaHtml(s, viewer, { showShips: true, cls: "sv-mini", label: "Deine Flotte" });
    else if (!me && hs.length > 1 && !isBot(shooter) && !s.out.includes(shooter)) {
      mini = `<button class="sv-peek" data-local="peek">${seaHtml(s, shooter, { showShips: true, cls: "sv-mini", label: `Flotte von ${escapeHtml(shooter)}` })}<span class="sv-peek-cover">👀<b>Gedrückt halten</b><small>nur ${escapeHtml(shooter)} guckt</small></span></button>`;
    }
    const last = s.last;
    let title;
    if (mine) title = `${me ? "Du schießt" : `${nm(shooter)} schießt`} auf ${viewer === t ? "dich" : nm(t)}. Tipp ein Feld!`;
    else title = `${nm(shooter)} zielt auf ${viewer === t ? "dich" : nm(t)}…`;
    if (last && last.hit && last.by === shooter) title = `💥 ${last.sunk ? `${escapeHtml(last.sunk)} versenkt!` : "Treffer!"} ${title.replace(/Tipp ein Feld!/, "Nochmal!")}`;
    return {
      phase: `Schuss ${s.shotN + 1}`,
      title,
      body: `${chipsHtml(s, canAim)}<div class="sv-boards ${mini ? "has-mini" : ""}">${main}${mini}</div>`,
      actions: [],
      turn: shooter,
    };
  }

  function endView(s, me) {
    const w = s.winner;
    const order = [w, ...[...s.out].reverse()];
    const rows = order
      .map((p, k) => {
        const tl = s.tally[p];
        return `<li class="${p === w ? "win" : ""}"><span>${k === 0 ? "🏆" : `${k + 1}.`} ${escapeHtml(p)}</span><span>💥 ${tl.hits} · 🚢 ${tl.sunk} versenkt · ${drinkEmoji(s)} ${tl.sips} + ${tl.shots} 🥃 verteilt</span></li>`;
      })
      .join("");
    return {
      phase: "Spiel vorbei",
      title: `🏆 ${me === w ? "Du hast" : `${nm(w)} hat`} gewonnen! Die letzte Flotte auf dem Meer.`,
      body: `<ul class="sv-end">${rows}</ul>${seaHtml(s, w, { showShips: true, cls: "sv-solo", label: `Flotte von ${escapeHtml(w)}` })}`,
      actions: [
        { label: "Nochmal spielen", act: { type: "restart" } },
        { label: "Zum Menü", exit: true, ghost: true },
      ],
    };
  }

  // --- Nach dem Zeichnen: Editor, Übergabe, Gedrückthalten, Schuss-Animation ---

  function afterRender(root, s, me) {
    // Übergabe bestätigt
    root.querySelector('[data-local="open"]')?.addEventListener("click", (e) => {
      opened.add(e.currentTarget.dataset.tag);
      rerender();
    });
    // Eigene Flotte nur zeigen, solange gedrückt
    const peek = root.querySelector('[data-local="peek"]');
    if (peek) {
      const on = (e) => {
        e.preventDefault();
        peek.classList.add("show");
      };
      const off = () => peek.classList.remove("show");
      peek.addEventListener("pointerdown", on);
      ["pointerup", "pointercancel", "pointerleave"].forEach((t) => peek.addEventListener(t, off));
      peek.addEventListener("contextmenu", (e) => e.preventDefault());
    }
    // Flotte aufstellen
    if (s.stage === "place") {
      const p = me ?? humans(s).find((q) => !s.fleets[q]);
      if (p && !s.fleets[p]) {
        const d = draftOf(s, p);
        root.querySelectorAll("[data-ed]").forEach((el) =>
          el.addEventListener("click", () => {
            const what = el.dataset.ed;
            if (what === "random") {
              d.ships = randomFleet();
              d.sel = null;
            } else if (what === "rotate") {
              if (d.sel != null) d.ships[d.sel] = clamp({ ...d.ships[d.sel], v: !d.ships[d.sel].v });
            } else {
              const i = Number(what);
              const k = d.ships.findIndex((sh) => cellsOf(sh).includes(i));
              if (k >= 0 && k === d.sel) d.ships[k] = clamp({ ...d.ships[k], v: !d.ships[k].v });
              else if (k >= 0) d.sel = k;
              else if (d.sel != null) {
                const [r, c] = rc(i);
                d.ships[d.sel] = clamp({ ...d.ships[d.sel], r, c });
              }
            }
            rerender();
          })
        );
      }
    }
    // Schuss: Einschlag oder Platscher, die Meldung wartet kurz
    const last = s.last;
    if (last && !animated.has(`${s.gid}:${last.id}`)) {
      animated.add(`${s.gid}:${last.id}`);
      const el = root.querySelector(".sv-c.fresh");
      if (el) {
        el.classList.add(last.hit ? "boom" : "splash");
        try {
          if (last.hit) navigator.vibrate?.(last.sunk ? [60, 40, 120] : 50);
        } catch {
          // egal
        }
        return last.hit ? 750 : 0;
      }
    }
    return 0;
  }

  // --- Aussehen ---

  const css = `
html[data-game="${KEY}"] .bf-actions:empty { display: none; }
html.fit[data-game="${KEY}"] .bf-body { overflow: hidden; gap: clamp(6px, 1.2dvh, 12px); justify-content: flex-start; }
html.fit[data-game="${KEY}"] .bf-body:has(> .za-intro) { justify-content: center; overflow-y: auto; }
html.fit[data-game="${KEY}"] .bf-title { font-size: clamp(1rem, 2.6dvh, 1.35rem); }
.sv-board { --sea: #0f3b5f; --line: rgb(160 210 255 / 0.18); position: relative; aspect-ratio: 1; container-type: inline-size; flex: none; }
.sv-label { position: absolute; left: 0; right: 0; top: -1.5em; text-align: center; font-size: clamp(0.7rem, 1.7dvh, 0.85rem); color: var(--muted); font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sv-grid { width: 100%; height: 100%; display: grid; grid-template-columns: 0.6fr repeat(${N}, 1fr); grid-template-rows: 0.6fr repeat(${N}, 1fr); gap: 2px; }
.sv-grid > i { display: grid; place-items: center; font-style: normal; font-size: 5cqw; font-weight: 700; color: var(--muted); }
.sv-c { position: relative; display: block; border-radius: 4px; background: var(--sea); box-shadow: inset 0 0 0 1px var(--line); }
.sv-c.t { cursor: pointer; }
.sv-c.t:active { background: #1d5b8a; }
@media (hover: hover) { .sv-c.t:hover { background: #1d5b8a; } }
.sv-c.a { background: #0b2c47; }
.sv-c.a::after { content: ""; position: absolute; inset: 42%; border-radius: 50%; background: rgb(160 210 255 / 0.18); }
.sv-c.m::after { content: ""; position: absolute; inset: 34%; border-radius: 50%; background: #cfe8ff; box-shadow: 0 0 0 3px rgb(207 232 255 / 0.18); }
.sv-c.s { background: #8e9aa6; box-shadow: inset 0 0 0 1px #5f6b77, inset 0 -3px 0 rgb(0 0 0 / 0.18); border-radius: 2px; }
.sv-c.s.hz.s0 { border-radius: 50% 2px 2px 50%; }
.sv-c.s.hz.s1 { border-radius: 2px 50% 50% 2px; }
.sv-c.s.v.s0 { border-radius: 50% 50% 2px 2px; }
.sv-c.s.v.s1 { border-radius: 2px 2px 50% 50%; }
.sv-c.s.s0.s1 { border-radius: 50%; }
.sv-c.x { background: #e4572e; box-shadow: inset 0 0 0 2px #ffb199; }
.sv-c.x::after, .sv-c.k::after { content: "✕"; position: absolute; inset: 0; display: grid; place-items: center; font-weight: 900; color: #fff; font-size: 7cqw; line-height: 1; }
.sv-c.k { background: #6d1f14; box-shadow: inset 0 0 0 2px #e4572e; }
.sv-c.k::after { color: #ffb199; }
.sv-c.s.x { background: #e4572e; }
.sv-c.sel { background: #f0b429; box-shadow: inset 0 0 0 2px #fff3c4; }
.sv-c.bad { background: #d94a3d; box-shadow: inset 0 0 0 2px #ffb3a8; }
.sv-edit .sv-c { cursor: pointer; }
.sv-c.boom { animation: sv-boom 0.7s ease-out; z-index: 1; }
.sv-c.boom::before { content: ""; position: absolute; inset: -60%; border-radius: 50%; background: radial-gradient(circle, #ffe08a 0 25%, #ff8a3d 40%, rgb(228 87 46 / 0) 70%); animation: sv-flash 0.7s ease-out forwards; pointer-events: none; }
.sv-c.splash::before { content: ""; position: absolute; inset: -30%; border-radius: 50%; border: 3px solid #cfe8ff; animation: sv-ring 0.6s ease-out forwards; pointer-events: none; }
@keyframes sv-boom { 0% { transform: scale(0.4); } 50% { transform: scale(1.25); } 100% { transform: none; } }
@keyframes sv-flash { from { opacity: 1; transform: scale(0.3); } to { opacity: 0; transform: scale(1.4); } }
@keyframes sv-ring { from { opacity: 1; transform: scale(0.3); } to { opacity: 0; transform: scale(1.6); } }
.sv-c.fresh:not(.boom):not(.splash) { box-shadow: inset 0 0 0 2px #f0b429; }

/* Aufstellen */
.sv-place { flex: 1; min-height: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: clamp(6px, 1.4dvh, 14px); container-type: size; width: 100%; }
.sv-place .sv-board { width: min(100cqw, 100cqh - 120px, 560px); }
.sv-tools { flex: none; width: min(100%, 520px); display: flex; flex-direction: column; gap: 8px; }
.sv-hint { margin: 0; text-align: center; color: var(--muted); font-size: clamp(0.85rem, 2dvh, 1rem); line-height: 1.35; }
.sv-hint.bad { color: #ff9b8f; }
.sv-tool-btns { display: flex; gap: 8px; }
.sv-tool-btns .btn { flex: 1; padding: clamp(8px, 1.6dvh, 12px); }
.sv-handover { flex: 1; min-height: 140px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; border: 2px dashed #4f8fbf; border-radius: 22px; background: rgb(79 143 191 / 0.12); color: var(--text, #fff); font: inherit; cursor: pointer; }
.sv-handover span { font-size: clamp(3rem, 12dvh, 5.5rem); line-height: 1; }
.sv-handover b { font-size: clamp(1.2rem, 3.6dvh, 1.8rem); }
.sv-handover small { color: var(--muted); }
.sv-ready { flex: none; }
.sv-solo { width: min(100%, 100cqh, 420px); align-self: center; margin-top: 1.6em; }
html[data-game="${KEY}"] .bf-body:has(> .sv-solo) { container-type: size; }

/* Schießen */
.sv-chips { flex: none; display: flex; flex-wrap: wrap; justify-content: center; gap: 6px; }
.sv-chip { display: flex; align-items: center; gap: 6px; padding: 5px 12px; border: none; border-radius: 999px; background: var(--surface); color: inherit; font: inherit; font-size: 0.85rem; max-width: 46vw; }
.sv-chip span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 700; }
.sv-chip small { color: var(--muted); white-space: nowrap; }
.sv-chip.can { cursor: pointer; box-shadow: inset 0 0 0 2px #4f8fbf; }
.sv-chip.aim { background: #e4572e; color: #fff; }
.sv-chip.aim small { color: #ffe1d6; }
.sv-chip.turn { box-shadow: inset 0 0 0 2px #f0b429; }
.sv-chip.out { opacity: 0.45; text-decoration: line-through; }
.sv-boards { flex: 1; min-height: 0; width: 100%; container-type: size; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1.9em; padding-top: 1.5em; }
.sv-boards .sv-main { width: min(100cqw, 100cqh - 1.5em, 640px); }
.sv-boards.has-mini .sv-main { width: min(100cqw, 66cqh, 640px); }
.sv-boards .sv-mini { width: min(52cqw, 30cqh - 1.5em, 300px); }
.sv-peek { position: relative; padding: 0; border: none; background: none; color: inherit; font: inherit; cursor: pointer; touch-action: none; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
.sv-peek .sv-board { visibility: hidden; }
.sv-peek.show .sv-board { visibility: visible; }
.sv-peek-cover { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; border: 2px dashed #4f8fbf; border-radius: 14px; background: rgb(79 143 191 / 0.12); font-size: clamp(1.6rem, 5dvh, 2.4rem); }
.sv-peek-cover b { font-size: 0.85rem; }
.sv-peek-cover small { font-size: 0.75rem; color: var(--muted); }
.sv-peek.show .sv-peek-cover { display: none; }
.sv-end { flex: none; list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.sv-end li { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 4px 12px; padding: 8px 14px; border-radius: 14px; background: var(--surface); font-size: 0.9rem; }
.sv-end li span:first-child { font-weight: 700; }
.sv-end li span:last-child { color: var(--muted); }
.sv-end li.win { box-shadow: inset 0 0 0 2px #f0b429; }

/* Querformat: Meere nebeneinander, Aufstellen mit Knöpfen daneben */
@media (min-aspect-ratio: 6 / 5) {
  .sv-boards { flex-direction: row; gap: clamp(16px, 4vw, 48px); padding-top: 1.5em; }
  .sv-boards .sv-main { width: min(100cqh - 1.5em, 100cqw, 640px); }
  .sv-boards.has-mini .sv-main { width: min(100cqh - 1.5em, 60cqw, 640px); }
  .sv-boards .sv-mini { width: min(62cqh, 34cqw, 340px); }
  .sv-place { flex-direction: row; justify-content: center; gap: clamp(16px, 4vw, 48px); }
  .sv-place .sv-board { width: min(100cqh, 55cqw, 560px); }
  .sv-tools { width: min(40cqw, 340px); }
  .sv-tool-btns { flex-direction: column; }
  html.fit[data-game="${KEY}"] .bf-body:has(> .sv-end) { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: clamp(16px, 4vw, 48px); }
  .sv-end + .sv-solo { width: min(100cqh - 2em, 40cqw, 380px); }
}
`;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  registerGame(KEY, {
    label: "Schiffe versenken",
    emoji: "🚢",
    description: "Flotte verstecken, reihum schießen. Treffer = Schluck verteilen, versenkt = Shot.",
    color: "#1d5b8a",
    fit: true,
    rules: [
      `Jeder stellt geheim 5 Schiffe auf sein 8 × 8-Meer: ${FLEET.map((f) => `${f.name} (${f.len})`).join(", ")}. Schiffe dürfen sich nicht berühren, auch nicht über Eck. Wer keine Lust hat, lässt würfeln.`,
      "Auf einem Handy stellt jeder nacheinander auf, die anderen gucken weg. Beim Schießen sieht man nur Treffer und Wasser, die eigene Flotte zeigt man durch Gedrückthalten. Mit mehreren Handys stellen alle gleichzeitig auf, jeder sieht seine Flotte unten.",
      "Reihum wird geschossen: Feld antippen. Mit mehr als zwei Leuten tippt man oben an, auf wen.",
      `Treffer: du verteilst ${sips(HIT)} und darfst nochmal schießen.`,
      "Schiff versenkt: du verteilst zusätzlich einen Shot 🥃. Die Felder rundherum werden hell, da kann kein Schiff mehr sein.",
      "Wasser: der Nächste ist dran. Wessen Flotte ganz versenkt ist, ist raus. Wer zuletzt noch ein Schiff hat, gewinnt.",
      "Bots stellen ihre Flotte selbst auf und schießen klug: nach einem Treffer suchen sie das Schiff ab.",
    ],

    setup(players) {
      const s = { players, stage: "intro", fleets: {}, shots: {}, out: [], tally: {}, shotN: 0, last: null, turn: null, target: null, first: Math.floor(Math.random() * players.length) };
      for (const p of players) {
        s.shots[p] = {};
        s.tally[p] = { hits: 0, sunk: 0, sips: 0, shots: 0 };
        s.fleets[p] = isBot(p) ? randomFleet() : null;
      }
      return s;
    },

    view(s, me) {
      if (s.stage === "intro") return introView(s);
      if (s.stage === "place") return placeView(s, me);
      if (s.stage === "end") return endView(s, me);
      return battleView(s, me);
    },

    afterRender,

    bot(s, name) {
      if (s.stage !== "battle" || s.turn !== name) return null;
      const t = s.target && s.target !== name && !s.out.includes(s.target) ? s.target : botTarget(s, name);
      return { type: "shot", n: s.shotN, t, c: botCell(s, t) };
    },

    act(s, a, by) {
      if (s.stage === "intro" && a.type === "go") {
        s.stage = "place";
        if (s.players.every((p) => s.fleets[p])) startBattle(s);
      } else if (s.stage === "place") {
        if (a.type === "fleet" && s.players.includes(a.who) && !s.fleets[a.who]) {
          const ships = validFleet(a.ships);
          if (!ships) return;
          s.fleets[a.who] = ships;
        } else if (a.type === "start") {
          for (const p of s.players) s.fleets[p] ??= randomFleet();
        } else return;
        if (s.players.every((p) => s.fleets[p])) startBattle(s);
      } else if (s.stage === "battle" && a.n === s.shotN) {
        if (a.type === "aim" && alive(s).includes(a.t) && a.t !== s.turn) s.target = a.t;
        else if (a.type === "shot" && alive(s).includes(a.t) && a.t !== s.turn) {
          const i = a.c | 0;
          if (i < 0 || i >= N * N || s.shots[a.t][i]) return;
          shoot(s, s.turn, a.t, i);
        }
      }
    },
  });
})();
