// Startanimation beim Öffnen der App: ein Maßkrug wird gezapft, Schaum läuft über,
// „Saufomat“ fällt Buchstabe für Buchstabe rein, dann wird angestoßen.
// Dazu eine selbst gebaute Blasmusik-Melodie (WebAudio, keine fremde Musik).
//
// Einstellung „intro“ in saufspiel-settings: "ton" (Standard), "still" (ohne Ton), "aus" (keine Animation).
// iPhone/Safari spielt keinen Ton, bevor jemand getippt hat. Dann zeigt der Start einen leeren Krug
// mit „Tippen zum Anzapfen“, der Tipp startet Animation und Melodie zusammen.
// Läuft einmal pro App-Start (sessionStorage), nicht beim Zurückkommen von flunky.html.
const Intro = (() => {
  const SEEN_KEY = "saufomat-intro-seen";
  const END = 3.05; // Sekunden bis zum Ausblenden
  let el = null;
  let ctx = null;
  let master = null;
  let timer = null;
  let state = "idle"; // idle | waiting (auf Tipp für Ton) | playing | done

  const readSettings = () => {
    try {
      return JSON.parse(localStorage.getItem("saufspiel-settings")) ?? {};
    } catch {
      return {};
    }
  };
  const mode = () => {
    const m = typeof Settings !== "undefined" ? Settings.intro : readSettings().intro;
    return m === "still" || m === "aus" ? m : "ton";
  };
  const setMode = (m) => {
    if (typeof Settings !== "undefined") {
      Settings.intro = m;
      return;
    }
    try {
      const d = readSettings();
      d.intro = m;
      localStorage.setItem("saufspiel-settings", JSON.stringify(d));
    } catch {
      // egal
    }
  };
  const en = () => readSettings().lang === "en";

  // ---------------------------------------------------------------- Ton ---
  function audio() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
    } catch {
      return null;
    }
    return ctx;
  }

  const hz = (n) => 440 * Math.pow(2, (n - 69) / 12);
  // Notennamen → MIDI
  const N = { C2: 36, F2: 41, Bb2: 46, C3: 48, A3: 57, Bb3: 58, C4: 60, D4: 62, E4: 64, F4: 65, G4: 67, A4: 69, Bb4: 70, C5: 72, D5: 74, E5: 76, F5: 77, G5: 79, A5: 81, Bb5: 82, C6: 84, F6: 89 };

  function noiseBuffer(c) {
    const len = c.sampleRate;
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  function env(g, t, a, peak, dur, rel) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.setValueAtTime(peak, t + Math.max(a, dur - rel));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  // Blech: zwei leicht verstimmte Sägezähne, Filter öffnet sich beim Anblasen
  function brass(c, out, note, t, dur, vol = 0.16) {
    const g = c.createGain();
    const f = c.createBiquadFilter();
    f.type = "lowpass";
    f.Q.value = 2;
    f.frequency.setValueAtTime(500, t);
    f.frequency.linearRampToValueAtTime(3200, t + 0.04);
    f.frequency.exponentialRampToValueAtTime(1400, t + dur);
    env(g, t, 0.02, vol, dur, 0.06);
    for (const det of [-7, 7]) {
      const o = c.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = hz(N[note]);
      o.detune.value = det;
      o.connect(f);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
    f.connect(g).connect(out);
  }

  // Tuba: weich und rund, kurz
  function tuba(c, out, note, t, dur = 0.22, vol = 0.32) {
    const g = c.createGain();
    env(g, t, 0.015, vol, dur, 0.1);
    const o = c.createOscillator();
    o.type = "triangle";
    o.frequency.value = hz(N[note]);
    const o2 = c.createOscillator();
    o2.type = "sine";
    o2.frequency.value = hz(N[note]) * 2;
    const g2 = c.createGain();
    g2.gain.value = 0.25;
    o.connect(g);
    o2.connect(g2).connect(g);
    g.connect(out);
    o.start(t);
    o2.start(t);
    o.stop(t + dur + 0.05);
    o2.stop(t + dur + 0.05);
  }

  // Nachschlag: kurzer Akkord („pah“)
  function chord(c, out, notes, t, vol = 0.05) {
    const f = c.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 2200;
    const g = c.createGain();
    env(g, t, 0.01, vol, 0.12, 0.06);
    for (const n of notes) {
      const o = c.createOscillator();
      o.type = "square";
      o.frequency.value = hz(N[n]);
      o.connect(f);
      o.start(t);
      o.stop(t + 0.16);
    }
    f.connect(g).connect(out);
  }

  // Rauschen: Zapfen, Schaum, Becken
  function noise(c, out, t, dur, type, freq, vol, q = 1) {
    const s = c.createBufferSource();
    s.buffer = noiseBuffer(c);
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    env(g, t, Math.min(0.05, dur / 3), vol, dur, dur * 0.6);
    s.connect(f).connect(g).connect(out);
    s.start(t);
    s.stop(t + dur + 0.05);
    return f;
  }

  // Anstoßen: zwei Gläser, glockige Teiltöne
  function clink(c, out, t) {
    for (const [dt, base] of [[0, 2350], [0.035, 2790]]) {
      for (const [ratio, v] of [[1, 0.12], [2.76, 0.05], [5.4, 0.025]]) {
        const o = c.createOscillator();
        o.type = "sine";
        o.frequency.value = base * ratio;
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, t + dt);
        g.gain.linearRampToValueAtTime(v, t + dt + 0.003);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 1.1 / ratio + 0.2);
        o.connect(g).connect(out);
        o.start(t + dt);
        o.stop(t + dt + 1.4);
      }
    }
  }

  function melody(t0) {
    const c = audio();
    if (!c) return;
    master = c.createGain();
    master.gain.value = 0.9;
    const comp = c.createDynamicsCompressor();
    master.connect(comp).connect(c.destination);
    const o = master;

    // Zapfen (gluckert), dann Schaum zischt
    const pour = noise(c, o, t0 + 0.1, 1.05, "bandpass", 700, 0.07, 3);
    pour.frequency.setValueAtTime(500, t0 + 0.1);
    pour.frequency.linearRampToValueAtTime(1300, t0 + 1.15);
    noise(c, o, t0 + 1.08, 0.5, "highpass", 5000, 0.04);

    // Humpta: Tuba auf den Schlag, Akkord dazwischen
    const F = ["A3", "C4", "F4"], Bb = ["Bb3", "D4", "F4"], C7 = ["Bb3", "C4", "E4"];
    [["F2", F], ["C3", F], ["Bb2", Bb], ["C3", C7], ["C2", C7]].forEach(([bass, ch], i) => {
      tuba(c, o, bass, t0 + i * 0.4);
      chord(c, o, ch, t0 + i * 0.4 + 0.2);
      noise(c, o, t0 + i * 0.4 + 0.2, 0.05, "highpass", 7000, 0.03);
    });

    // Melodie: Auftakt, dann die Leiter hoch, während die Buchstaben reinfallen
    [["C5", 0, 0.18], ["A4", 0.2, 0.18], ["C5", 0.4, 0.18], ["F5", 0.6, 0.36], ["E5", 1.0, 0.09], ["D5", 1.1, 0.09]]
      .forEach(([n, t, d]) => brass(c, o, n, t0 + t, d));
    ["C5", "D5", "E5", "F5", "G5", "A5", "Bb5", "C6"].forEach((n, i) => brass(c, o, n, t0 + 1.2 + i * 0.1, 0.09, 0.13));

    // Schlussakkord + Anstoßen
    const T = t0 + 2.0;
    for (const n of ["F5", "A5", "C6"]) brass(c, o, n, T, 0.85, 0.09);
    brass(c, o, "F4", T, 0.85, 0.08);
    tuba(c, o, "F2", T, 0.7, 0.4);
    noise(c, o, T, 0.9, "highpass", 6000, 0.035);
    clink(c, o, T + 0.02);
  }

  function silence() {
    if (!master || !ctx) return;
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
    master.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.08);
    master = null;
  }

  // ------------------------------------------------------------- Optik ---
  const css = `
  .intro { position: fixed; inset: 0; z-index: 300; display: flex; align-items: center; justify-content: center;
    overflow: hidden; touch-action: manipulation; -webkit-user-select: none; user-select: none; cursor: pointer;
    background: radial-gradient(60% 45% at 50% 38%, rgb(240 180 41 / 0.16), transparent 70%), var(--bg, #17130f);
    color: var(--text, #f3e9d4); --beer: #f2b630; --beer-dark: #c7790e; --foam: #fff7e2; --glass: var(--text, #f3e9d4); }
  html:not(.neu) .intro { background: radial-gradient(circle at 50% 30%, #4a2a8a, #1b1033 65%); --glass: #f5f0ff; }
  html.neu.garten .intro { background: radial-gradient(60% 45% at 50% 38%, rgb(246 160 77 / 0.16), transparent 70%), var(--bg); }
  html.neu.wiesn .intro { background: radial-gradient(60% 45% at 50% 40%, rgb(31 143 216 / 0.32), transparent 70%), var(--bg); }
  /* Biergarten: rot-weiß karierte Kante oben und unten */
  html.neu.garten .intro::before, html.neu.garten .intro::after { content: ""; position: absolute; left: 0; right: 0; height: 22px;
    background: repeating-conic-gradient(#d9483b 0 25%, #fbf3e2 0 50%) 0 0 / 22px 22px; opacity: 0.9; }
  html.neu.garten .intro::before { top: 0; } html.neu.garten .intro::after { bottom: 0; }
  /* Wiesn: Rauten-Band oben wie im Menü */
  html.neu.wiesn .intro::before { content: ""; position: absolute; left: 0; right: 0; top: 0; height: 20px;
    background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='20'%3E%3Crect width='32' height='20' fill='%23fff'/%3E%3Cpath d='M16 0L32 10 16 20 0 10z' fill='%231f8fd8'/%3E%3C/svg%3E") 0 0 / 32px 20px repeat-x; }

  .intro-stage { position: relative; display: flex; flex-direction: column; align-items: center; gap: clamp(8px, 3vh, 28px);
    padding: calc(20px + env(safe-area-inset-top)) 16px calc(20px + env(safe-area-inset-bottom)); }
  .intro-glass { width: auto; height: min(40vh, 320px); overflow: visible; }
  .intro-word { margin: 0; display: flex; line-height: 1; white-space: nowrap; font-size: clamp(2.8rem, 15vw, 5.6rem);
    font-family: var(--display, system-ui, sans-serif); font-weight: 900; letter-spacing: -0.03em; }
  html.neu .intro-word { font-weight: 800; font-stretch: 80%; }
  html.neu.garten .intro-word { font-weight: 800; letter-spacing: -0.02em; }
  html.neu.wiesn .intro-word { font-family: "Pacifico", cursive; font-weight: 400; letter-spacing: 0; padding-bottom: 0.15em;
    text-shadow: 0.04em 0.05em 0 #c8102e; }
  html:not(.neu) .intro-word { color: #fff; text-shadow: 0 0.05em 0 #7c3aed; }
  .intro-word span { display: inline-block; opacity: 0; }
  .intro-word .dot { color: var(--primary, #f59e0b); }
  html.neu.wiesn .intro-word .dot { display: none; }

  .intro-hint { position: absolute; left: 50%; bottom: calc(26px + env(safe-area-inset-bottom)); transform: translateX(-50%);
    display: none; align-items: center; gap: 10px; padding: 12px 20px; border-radius: 999px; white-space: nowrap;
    background: var(--primary, #f59e0b); color: var(--ink, #1b1033); font: 700 1.05rem var(--display, system-ui, sans-serif);
    box-shadow: 0 6px 24px rgb(0 0 0 / 0.35); }
  .intro-hint svg { width: 22px; height: 22px; }
  .intro.waiting .intro-hint { display: flex; animation: intro-pulse 1.4s ease-in-out infinite; }
  .intro-mute { position: absolute; top: calc(30px + env(safe-area-inset-top)); right: calc(16px + env(safe-area-inset-right));
    width: 46px; height: 46px; display: grid; place-items: center; border-radius: 50%; border: 1.5px solid currentColor;
    background: rgb(0 0 0 / 0.15); color: inherit; opacity: 0.75; cursor: pointer; padding: 0; }
  .intro-mute svg { width: 24px; height: 24px; }
  .intro-mute .x { display: none; } .intro.muted .intro-mute .x { display: inline; } .intro.muted .intro-mute .w { display: none; }

  /* Krug-Teile */
  .ig-beer, .ig-foam, .ig-stream, .ig-spark, .ig-bubbles { transform-box: fill-box; }
  .ig-beer { transform-origin: 50% 100%; transform: scaleY(0); }
  .ig-foam { transform-origin: 50% 100%; transform: scale(0); }
  .ig-stream { transform-origin: 50% 0; transform: scaleY(0); }
  .ig-bubbles { opacity: 0; }
  .ig-spark { transform-origin: 50% 50%; transform: scale(0); }
  .ig-mug { transform-origin: 30% 95%; transform-box: fill-box; }
  .intro.waiting .ig-mug { animation: intro-wobble 1.6s ease-in-out infinite; }
  .intro.waiting .ig-stream { transform: scaleY(0.12); }

  .intro.play .intro-glass { animation: intro-pop 0.45s cubic-bezier(.3,1.6,.5,1) both; }
  .intro.play .ig-stream { animation: intro-stream 1.15s ease-in-out 0.05s both; }
  .intro.play .ig-beer { animation: intro-fill 1.05s cubic-bezier(.4,.1,.4,1) 0.12s both; }
  .intro.play .ig-bubbles { animation: intro-fade-in 0.3s ease 0.5s both; }
  .intro.play .ig-bubbles circle { animation: intro-bubble 1.1s linear infinite; }
  .intro.play .ig-foam { animation: intro-foam 0.5s cubic-bezier(.3,1.7,.5,1) 1.05s both; }
  .intro.play .ig-mug { animation: intro-prost 0.6s ease-in-out 1.95s both; }
  .intro.play .ig-spark { animation: intro-spark 0.7s ease-out 2.02s both; }
  .intro.play .intro-word span { animation: intro-drop 0.42s cubic-bezier(.3,1.5,.5,1) calc(1.18s + var(--k) * 0.1s) both; }
  .intro.play .intro-word { animation: intro-beat 0.35s ease-out 2s both; }
  .intro.out { animation: intro-out 0.45s ease-in both; pointer-events: none; }

  @keyframes intro-pop { from { transform: scale(0.6) translateY(20px); opacity: 0; } to { transform: none; opacity: 1; } }
  @keyframes intro-stream { 0% { transform: scaleY(0); } 12%, 82% { transform: scaleY(1); } 100% { transform: scaleY(1) translateY(110%); opacity: 0; } }
  @keyframes intro-fill { from { transform: scaleY(0); } to { transform: scaleY(1); } }
  @keyframes intro-fade-in { from { opacity: 0; } to { opacity: 1; } }
  @keyframes intro-bubble { from { transform: translateY(0); opacity: 0.9; } to { transform: translateY(-80px); opacity: 0; } }
  @keyframes intro-foam { from { transform: scale(0.2, 0); } to { transform: none; } }
  @keyframes intro-prost { 0% { transform: none; } 35% { transform: rotate(-13deg) translateX(-4px); } 70% { transform: rotate(4deg); } 100% { transform: none; } }
  @keyframes intro-spark { 0% { transform: scale(0); opacity: 1; } 50% { transform: scale(1.2); opacity: 1; } 100% { transform: scale(0.4); opacity: 0; } }
  @keyframes intro-drop { 0% { transform: translateY(-1.3em) rotate(-14deg) scale(0.6); opacity: 0; }
    60% { transform: translateY(0.07em) rotate(4deg) scale(1.06); opacity: 1; } 100% { transform: none; opacity: 1; } }
  @keyframes intro-beat { 0% { transform: none; } 40% { transform: scale(1.07); } 100% { transform: none; } }
  @keyframes intro-out { to { opacity: 0; transform: scale(1.06); } }
  @keyframes intro-pulse { 50% { transform: translateX(-50%) scale(1.06); } }
  @keyframes intro-wobble { 0%, 100% { transform: rotate(0); } 50% { transform: rotate(-3deg); } }

  /* Quer und Klapphandy zu: Krug links, Schriftzug rechts */
  @media (orientation: landscape) and (max-height: 560px) {
    .intro-stage { flex-direction: row; gap: clamp(16px, 5vw, 48px); }
    .intro-glass { height: min(62vh, 260px); }
    .intro-word { font-size: clamp(2.6rem, min(11vw, 22vh), 6rem); }
    .intro-hint { bottom: calc(16px + env(safe-area-inset-bottom)); }
    .intro-mute { top: calc(26px + env(safe-area-inset-top)); }
  }
  @media (prefers-reduced-motion: reduce) {
    .intro.play *, .intro.play .intro-word span { animation-duration: 0.01s !important; }
  }`;

  const speaker = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" fill-opacity=".25"/>
    <path class="w" d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/><path class="x" d="M17 9l5 6M22 9l-5 6"/></svg>`;

  // Maßkrug, 120 × 150. Innen: x 27–83, y 32–132.
  const glass = `
  <svg class="intro-glass" viewBox="0 0 130 160" aria-hidden="true">
    <defs>
      <clipPath id="ig-in"><rect x="27" y="32" width="56" height="102" rx="6"/></clipPath>
      <linearGradient id="ig-beer" x1="0" y1="0" x2="0" y2="1"><stop style="stop-color:var(--beer)" offset="0"/><stop style="stop-color:var(--beer-dark)" offset="1"/></linearGradient>
    </defs>
    <rect class="ig-stream" x="51" y="-260" width="8" height="390" rx="4" fill="url(#ig-beer)"/>
    <g class="ig-mug">
      <rect style="fill:var(--glass)" x="22" y="27" width="66" height="112" rx="10" fill-opacity=".07"/>
      <g clip-path="url(#ig-in)">
        <rect class="ig-beer" x="27" y="32" width="56" height="102" fill="url(#ig-beer)"/>
        <g class="ig-bubbles" fill="#fff" fill-opacity=".7">
          <circle cx="38" cy="125" r="2" style="animation-delay:0s"/><circle cx="52" cy="128" r="1.5" style="animation-delay:.35s"/>
          <circle cx="66" cy="124" r="2.2" style="animation-delay:.7s"/><circle cx="74" cy="130" r="1.4" style="animation-delay:.2s"/>
          <circle cx="45" cy="110" r="1.3" style="animation-delay:.55s"/><circle cx="60" cy="115" r="1.8" style="animation-delay:.9s"/>
        </g>
      </g>
      <g style="fill:var(--foam)" class="ig-foam">
        <circle cx="30" cy="30" r="10"/><circle cx="44" cy="24" r="12"/><circle cx="60" cy="22" r="13"/><circle cx="76" cy="26" r="11"/><circle cx="86" cy="32" r="8"/>
        <rect x="22" y="28" width="66" height="12"/>
        <path d="M24 38c-3 0-4 4-4 8s1.5 7 4 7 3.5-3 3.5-7S27 38 24 38z"/><path d="M80 38c-2 0-3 3-3 6s1 5 3 5 3-2 3-5-1-6-3-6z"/>
      </g>
      <rect style="stroke:var(--glass)" x="22" y="27" width="66" height="112" rx="10" fill="none" stroke-width="4.5"/>
      <path style="stroke:var(--glass)" d="M88 50h12c8 0 12 4 12 12v38c0 8-4 12-12 12H88" fill="none" stroke-width="7" stroke-linecap="round"/>
      <path d="M36 48v70M55 48v70M74 48v70" stroke="#fff" stroke-opacity=".22" stroke-width="5" stroke-linecap="round"/>
    </g>
    <g style="fill:var(--primary, #f59e0b)">
      <path class="ig-spark" d="M10 14l2.5 6 6 2.5-6 2.5-2.5 6-2.5-6-6-2.5 6-2.5z"/>
      <path class="ig-spark" d="M112 10l2 4.5 4.5 2-4.5 2-2 4.5-2-4.5-4.5-2 4.5-2z"/>
      <path class="ig-spark" d="M120 40l1.6 3.4 3.4 1.6-3.4 1.6-1.6 3.4-1.6-3.4-3.4-1.6 3.4-1.6z"/>
    </g>
  </svg>`;

  function build() {
    if (!document.getElementById("intro-css")) {
      const style = document.createElement("style");
      style.id = "intro-css";
      style.textContent = css;
      document.head.appendChild(style);
    }
    const word = "Saufomat".split("").map((ch, k) => `<span style="--k:${k}">${ch}</span>`).join("") + `<span class="dot" style="--k:8">.</span>`;
    const node = document.createElement("div");
    node.className = "intro";
    node.setAttribute("role", "img");
    node.setAttribute("aria-label", "Saufomat");
    node.innerHTML = `
      <div class="intro-stage">${glass}<h1 class="intro-word">${word}</h1></div>
      <div class="intro-hint">${speaker}<span>${en() ? "Tap to pour" : "Tippen zum Anzapfen"}</span></div>
      <button class="intro-mute" type="button">${speaker}</button>`;
    node.classList.toggle("muted", mode() === "still");
    muteLabel(node);
    return node;
  }

  function muteLabel(node) {
    const b = node.querySelector(".intro-mute");
    const muted = node.classList.contains("muted");
    b.setAttribute("aria-label", en() ? (muted ? "Sound on" : "Sound off") : muted ? "Ton an" : "Ton aus");
  }

  function run(withSound) {
    state = "playing";
    el.classList.remove("waiting", "play");
    void el.offsetWidth; // Animation neu starten
    el.classList.add("play");
    if (withSound && ctx) melody(ctx.currentTime + 0.03);
    clearTimeout(timer);
    timer = setTimeout(finish, END * 1000);
  }

  function finish() {
    if (!el || state === "done") return;
    state = "done";
    clearTimeout(timer);
    const node = el;
    node.classList.add("out");
    setTimeout(() => {
      node.remove();
      if (el === node) el = null;
    }, 460);
    // Ton klingt noch kurz aus, dann ist Ruhe
    setTimeout(() => {
      if (ctx && ctx.state === "running") ctx.suspend().catch(() => {});
    }, 1600);
  }

  // Ton freischalten, muss direkt im Tipp passieren (iPhone)
  function unlock() {
    const c = audio();
    if (!c) return Promise.resolve(false);
    try {
      const b = c.createBuffer(1, 1, 22050);
      const s = c.createBufferSource();
      s.buffer = b;
      s.connect(c.destination);
      s.start(0);
    } catch {
      // egal
    }
    return c.resume().then(() => c.state === "running").catch(() => false);
  }

  function onTap(e) {
    if (e.target.closest(".intro-mute")) return;
    if (state === "waiting") {
      unlock().then((ok) => run(ok && mode() === "ton"));
    } else if (state === "playing") {
      silence();
      finish();
    }
  }

  function onMute(e) {
    e.stopPropagation();
    const muted = !el.classList.contains("muted");
    setMode(muted ? "still" : "ton");
    el.classList.toggle("muted", muted);
    muteLabel(el);
    if (muted) {
      silence();
      if (state === "waiting") run(false);
    } else if (state === "playing") {
      // Ton wieder an: von vorne, damit Melodie und Bild zusammenpassen
      unlock().then((ok) => run(ok));
    }
  }

  // manual = aus den Einstellungen („Ansehen“), da ist der Tipp schon da
  function play(manual = false) {
    if (el) el.remove();
    state = "idle";
    el = build();
    el.addEventListener("click", onTap);
    el.querySelector(".intro-mute").addEventListener("click", onMute);
    document.body.appendChild(el);
    const sound = mode() === "ton";
    if (!sound) return run(false);
    if (manual) return unlock().then((ok) => run(ok));
    const c = audio();
    if (!c) return run(false);
    // Darf der Browser ohne Tipp Ton machen? Kurz nachsehen, sonst auf den Tipp warten.
    c.resume().catch(() => {});
    setTimeout(() => {
      if (state !== "idle") return;
      if (c.state === "running") run(true);
      else {
        state = "waiting";
        el.classList.add("waiting");
      }
    }, 150);
  }

  function boot() {
    let seen = false;
    try {
      seen = sessionStorage.getItem(SEEN_KEY) === "1";
      sessionStorage.setItem(SEEN_KEY, "1");
    } catch {
      // ohne Speicher: jedes Mal zeigen
    }
    if (seen || mode() === "aus") return;
    play(false);
  }

  if (document.body) boot();
  else document.addEventListener("DOMContentLoaded", boot);

  return { play };
})();
