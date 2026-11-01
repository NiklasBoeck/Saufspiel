// Gezeichnete Icons für das neue Design (Design „Neu“).
// Stil: wie gedruckt auf einem Bierdeckel. Eine Farbfläche (--spot), leicht versetzt wie beim Siebdruck,
// darüber eine dunkle Tusche-Linie. Alles 48 × 48, Linien rund.
//
// drawnIcon(name, spot) gibt das SVG als Text zurück.
// Im klassischen Design sieht man diese Icons nicht, da bleiben die Emojis.
const DRAWN_ICONS = (() => {
  // f = Farbfläche (versetzt), i = Tusche-Linie
  const I = {
    // Flunky Ball: Flasche steht, der Ball fliegt drauf zu
    flunky: {
      f: `<circle cx="13" cy="30" r="5.5"/><path d="M30 41h8V27c0-3-2-4.5-2-7.5V13h-4v6.5c0 3-2 4.5-2 7.5z"/>`,
      i: `<path d="M30 41h8V27c0-3-2-4.5-2-7.5V13h-4v6.5c0 3-2 4.5-2 7.5z"/><path d="M31.5 9.5h5v3.5h-5z"/><circle cx="13" cy="30" r="5.5"/>
          <path d="M9.5 26.5c2 1.6 5 1.6 7 0" /><path d="M16 21c3-9 10-11 13-7" stroke-dasharray="0.1 4"/><path d="M5 41h38"/><path d="M30.5 31h7"/>`,
    },
    // Hodenritter: zwei Kugeln und die kleine rote
    hodenritter: {
      f: `<circle cx="14.5" cy="31" r="8.5"/><circle cx="32" cy="32" r="7.5"/>`,
      i: `<circle cx="14.5" cy="31" r="8.5"/><circle cx="32" cy="32" r="7.5"/><circle cx="42" cy="37.5" r="2.4"/>
          <path d="M10 27.5c1-2 2.5-3 4.5-3.3"/><path d="M28.5 29c.8-1.5 2-2.3 3.5-2.6"/><path d="M4 40h36"/><path d="M8 15l3 3m4.5-6.5v4.5m6-1.5l-2.5 3.5"/>`,
    },
    // Kistenturm: drei Bierkisten, die oberste kippelt
    kistenturm: {
      f: `<rect x="9" y="30" width="22" height="11" rx="1.5"/><rect x="15" y="19" width="22" height="11" rx="1.5"/><rect x="11" y="7.5" width="22" height="11" rx="1.5" transform="rotate(-9 22 13)"/>`,
      i: `<rect x="9" y="30" width="22" height="11" rx="1.5"/><rect x="15" y="19" width="22" height="11" rx="1.5"/><rect x="11" y="7.5" width="22" height="11" rx="1.5" transform="rotate(-9 22 13)"/>
          <path d="M16.5 33.5h7M22.5 22.5h7"/><path d="M18 11.5l7-1.1"  /><path d="M4 41h40"/><path d="M38 9l3-2m-2 6h3.5"/>`,
    },
    // Flaschendrehen: liegende Flasche, Pfeile rundherum
    flasche: {
      f: `<path d="M11 20.5h16c3 0 4 2.5 6 2.5h4v3h-4c-2 0-3 2.5-6 2.5H11z" transform="rotate(-28 24 24)"/>`,
      i: `<path d="M11 20.5h16c3 0 4 2.5 6 2.5h4v3h-4c-2 0-3 2.5-6 2.5H11z" transform="rotate(-28 24 24)"/>
          <path d="M7 31a18 18 0 0 0 20 12"/><path d="M27 43l-4.5 1.8M27 43l-3.4-3.6"/>
          <path d="M41 17A18 18 0 0 0 21 5"/><path d="M21 5l4.5-1.8M21 5l3.4 3.6"/>`,
    },
    // F*ck den Dealer: zwei Karten gefächert, Herz drauf
    dealer: {
      b: `<rect x="8.5" y="9" width="18" height="26" rx="2.5" transform="rotate(-13 17.5 22)"/>
          <rect x="18.5" y="12" width="18" height="26" rx="2.5" transform="rotate(9 27.5 25)"/>`,
      f: `<path d="M27.5 31.5c-4.2-3-6.3-5.2-6.3-7.4a3 3 0 0 1 6.3-1.2 3 3 0 0 1 6.3 1.2c0 2.2-2.1 4.4-6.3 7.4z"/>`,
      i: `<path d="M27.5 31.5c-4.2-3-6.3-5.2-6.3-7.4a3 3 0 0 1 6.3-1.2 3 3 0 0 1 6.3 1.2c0 2.2-2.1 4.4-6.3 7.4z"/>
          <path d="M11.5 13.5l2.5 3m0-3l-2.5 3"/>`,
    },
    // Fenster: Fensterrahmen mit Kreuz, Licht in zwei Scheiben
    fenster: {
      f: `<rect x="12" y="10" width="11" height="13"/><rect x="25" y="25" width="11" height="13"/>`,
      i: `<rect x="10" y="8" width="28" height="32" rx="2"/><path d="M24 8v32M10 24h28"/><path d="M6 40h36"/>
          <path d="M14.5 13.5l4 4M27 27l4 4"/>`,
    },
    // Randvoll: Glas bis zum Rand, Schaum läuft über
    randvoll: {
      f: `<path d="M14.6 19h18.8l-2.2 22H16.8z"/>`,
      i: `<path d="M13.5 15l3 26h15l3-26"/><path d="M11.5 16c-1-4 3-6.5 6-4.5 1.2-3.5 7.5-4 9 0 2.5-2.5 8-1 7 3.5 1.5 1.5.5 3.5-1 4H13c-1.8-.6-2.5-2-1.5-3z"/>
          <path d="M35 19c1.5 2.5 2 5 1 7.5"/><path d="M36.5 30.5v.5"/><path d="M20 25v9M24.5 28v7"/>`,
    },
    // Prost-Duell: zwei Krüge stoßen an
    duell: {
      f: `<path d="M8 20h13l-1 20H9z" transform="rotate(14 15 30)"/><path d="M27 20h13l-1 20H28z" transform="rotate(-14 33 30)"/>`,
      i: `<g transform="rotate(14 15 30)"><path d="M8 20h13l-1 20H9z"/><path d="M8.5 16.5c0-3 4-3.5 5-1.5 1.5-2 6-1.5 6.5 1.5.6 1.8-.3 3.5-2 3.5H10c-1.5 0-2-1.8-1.5-3.5z"/><path d="M8.6 24H6a2.5 2.5 0 0 0-2.5 2.5v4A2.5 2.5 0 0 0 6 33h2.6"/></g>
          <g transform="rotate(-14 33 30)"><path d="M27 20h13l-1 20H28z"/><path d="M27.5 16.5c0-3 4-3.5 5-1.5 1.5-2 6-1.5 6.5 1.5.6 1.8-.3 3.5-2 3.5H29c-1.5 0-2-1.8-1.5-3.5z"/><path d="M39.4 24H42a2.5 2.5 0 0 1 2.5 2.5v4A2.5 2.5 0 0 1 42 33h-2.6"/></g>
          <path d="M24 4.5v4.5M18 6.5l2.2 3.4M30 6.5l-2.2 3.4"/>`,
    },
    // Wer würde eher…? Drei Leute, über einem das Fragezeichen
    eher: {
      f: `<path d="M18 9.5a6 6 0 1 1 9 5.2c-1.7 1-3 2-3 4.3"/><circle cx="24" cy="31" r="4.5"/>`,
      i: `<path d="M18 9.5a6 6 0 1 1 9 5.2c-1.7 1-3 2-3 4.3"/><path d="M24 23v.4"/>
          <circle cx="24" cy="31" r="4.5"/><path d="M15.5 44c0-5 3.8-8 8.5-8s8.5 3 8.5 8"/>
          <circle cx="9.5" cy="32.5" r="3.5"/><path d="M3.5 44c0-4 2.8-6.5 6-6.5 1.5 0 2.8.4 3.8 1.2"/>
          <circle cx="38.5" cy="32.5" r="3.5"/><path d="M44.5 44c0-4-2.8-6.5-6-6.5-1.5 0-2.8.4-3.8 1.2"/>`,
    },
    // Busfahrer: Bus von vorne
    busfahrer: {
      f: `<rect x="14" y="12" width="20" height="12" rx="1.5"/><circle cx="16.5" cy="31" r="2.2"/><circle cx="31.5" cy="31" r="2.2"/>`,
      i: `<rect x="11" y="7" width="26" height="30" rx="4.5"/><rect x="14" y="12" width="20" height="12" rx="1.5"/><path d="M17 9.5h14"/>
          <circle cx="16.5" cy="31" r="2.2"/><circle cx="31.5" cy="31" r="2.2"/><path d="M21.5 31h5"/>
          <path d="M13.5 37v4h4v-4M30.5 37v4h4v-4"/><path d="M11 15H8.5v5M37 15h2.5v5"/>`,
    },
    // Ich hab noch nie: Hand mit Fingern hoch
    niewieder: {
      f: `<path d="M14 25V14.5a2.4 2.4 0 0 1 4.8 0V23 10a2.4 2.4 0 0 1 4.8 0v13-11a2.4 2.4 0 0 1 4.8 0v12-7.5a2.4 2.4 0 0 1 4.8 0V30c0 7-4.5 12-11 12-4.5 0-7-2.5-9.5-6.5L8.5 29a2.6 2.6 0 0 1 4.2-3z"/>`,
      i: `<path d="M14 25V14.5a2.4 2.4 0 0 1 4.8 0V23 10a2.4 2.4 0 0 1 4.8 0v13-11a2.4 2.4 0 0 1 4.8 0v12-7.5a2.4 2.4 0 0 1 4.8 0V30c0 7-4.5 12-11 12-4.5 0-7-2.5-9.5-6.5L8.5 29a2.6 2.6 0 0 1 4.2-3z"/>
          <path d="M37.5 8l2.5-2.5M39 13h3.5M8 9.5L5.5 7"/>`,
    },
    // Pflicht: Zielscheibe mit Pfeil
    pflicht: {
      f: `<circle cx="22" cy="26" r="7"/>`,
      i: `<circle cx="22" cy="26" r="15"/><circle cx="22" cy="26" r="7"/><path d="M22 26L38 10"/><path d="M38 10l.5-5M38 10l5-.5M35 13l.4-4.5M35 13l4.5-.4"/>`,
    },
    // Triade: drei Karten im Dreieck
    triade: {
      b: `<rect x="8" y="22" width="14" height="19" rx="2" transform="rotate(-6 15 31)"/><rect x="26" y="22" width="14" height="19" rx="2" transform="rotate(6 33 31)"/>
          <rect x="17" y="6" width="14" height="19" rx="2"/>`,
      f: `<rect x="17" y="6" width="14" height="19" rx="2"/>`,
      i: `<rect x="17" y="6" width="14" height="19" rx="2"/>
          <path d="M24 12l2.8 3.5L24 19l-2.8-3.5z"/>`,
    },
    // Lügendetektor: Papierstreifen mit Ausschlag, Nadel
    luegen: {
      f: `<rect x="7" y="18" width="34" height="14" rx="1"/>`,
      i: `<rect x="7" y="13" width="34" height="24" rx="2"/><path d="M7 26h6l2.5-5 3 12 3.5-17 3 14 2.5-6 2 2h11"/>
          <path d="M32 6l-5.5 13"/><circle cx="32.5" cy="5.5" r="1.5"/><path d="M12 41h24"/>`,
    },
    // Bierdeckel-Schnippen: Deckel fliegt, Schwung-Linien
    deckel: {
      f: `<ellipse cx="28" cy="21" rx="13" ry="8.5" transform="rotate(-16 28 21)"/>`,
      i: `<ellipse cx="28" cy="21" rx="13" ry="8.5" transform="rotate(-16 28 21)"/><ellipse cx="28" cy="21" rx="7.5" ry="4.6" transform="rotate(-16 28 21)"/>
          <path d="M4 28h9M6 34h11M10 22h4"/><path d="M15 41c3-1.5 6-1.5 9 0"/>`,
    },

    // --- Knöpfe und Einstellungen ---
    phone: {
      f: `<rect x="17" y="10" width="14" height="22" rx="1"/>`,
      i: `<rect x="14" y="5" width="20" height="38" rx="4"/><path d="M21 8.5h6M22 38.5h4"/>`,
    },
    phones: {
      f: `<rect x="9" y="12" width="12" height="20" rx="1"/><rect x="28" y="14" width="12" height="20" rx="1"/>`,
      i: `<rect x="6" y="7" width="18" height="34" rx="3.5" transform="rotate(-6 15 24)"/><rect x="25" y="9" width="18" height="34" rx="3.5" transform="rotate(6 34 26)"/>`,
    },
    settings: {
      f: `<circle cx="17" cy="14" r="4"/><circle cx="31" cy="24" r="4"/><circle cx="20" cy="34" r="4"/>`,
      i: `<path d="M8 14h5M21 14h19M8 24h19M35 24h5M8 34h8M24 34h16"/><circle cx="17" cy="14" r="4"/><circle cx="31" cy="24" r="4"/><circle cx="20" cy="34" r="4"/>`,
    },
    alkoholfrei: {
      f: `<path d="M15.5 20h17l-2 21h-13z"/>`,
      i: `<path d="M14 15h20l-2.8 26H16.8z"/><path d="M26 15l3-10h6"/><path d="M17 26c2 1.5 4.5 1.5 7 0s5-1.5 7 0"/><circle cx="21" cy="33" r="1"/><circle cx="26" cy="36" r="1"/>`,
    },
    mild: {
      f: `<path d="M17 28h14l-1 13H18z"/>`,
      i: `<path d="M15 13h18l-2 28H17z"/><path d="M16.4 28h15.2"/>`,
    },
    normal: {
      f: `<path d="M12.5 19h18l-1 21h-16z"/>`,
      i: `<path d="M12 19h19l-1 22H13z"/><path d="M12.5 15.5c0-3.5 4.5-4 6-1.8 1.7-2.5 6.5-2 7.5 1 2.5-.8 5 .8 4.8 3.3H12.8"/><path d="M30.6 24H35a3 3 0 0 1 3 3v5a3 3 0 0 1-3 3h-5.2"/><path d="M18 25v10M24 25v10"/>`,
    },
    hart: {
      f: `<path d="M24 43c-8 0-12-5.5-12-11 0-6 5-9 5.5-15.5 3 2 4.5 4.5 4.5 8 1.5-4 4-8 3-15 6 4 11 12 11 21 0 7.5-5 12.5-12 12.5z"/>`,
      i: `<path d="M24 43c-8 0-12-5.5-12-11 0-6 5-9 5.5-15.5 3 2 4.5 4.5 4.5 8 1.5-4 4-8 3-15 6 4 11 12 11 21 0 7.5-5 12.5-12 12.5z"/><path d="M24 43c-3.5 0-5.5-2.5-5.5-5.5 0-3.5 3-5 4-8.5 3.5 2.5 6.5 5 6.5 9 0 3-2 5-5 5z"/>`,
    },
    leicht: {
      f: `<rect x="11" y="15" width="26" height="21" rx="5"/>`,
      i: `<rect x="11" y="15" width="26" height="21" rx="5"/><path d="M24 15V9"/><circle cx="24" cy="7.5" r="2"/><circle cx="19" cy="24" r="1.6"/><circle cx="29" cy="24" r="1.6"/><path d="M20 30c2.5 2 5.5 2 8 0"/><path d="M11 25H7.5M37 25h3.5"/><path d="M17 36v5M31 36v5"/>`,
    },
    mittel: {
      f: `<rect x="11" y="15" width="26" height="21" rx="5"/>`,
      i: `<rect x="11" y="15" width="26" height="21" rx="5"/><path d="M24 15V9"/><circle cx="24" cy="7.5" r="2"/><path d="M17 24h4M27 24h4"/><path d="M20 30.5h8"/><path d="M11 25H7.5M37 25h3.5"/><path d="M17 36v5M31 36v5"/>`,
    },
    schwer: {
      f: `<rect x="11" y="15" width="26" height="21" rx="5"/>`,
      i: `<rect x="11" y="15" width="26" height="21" rx="5"/><path d="M15 15l-3-7M33 15l3-7"/><path d="M16.5 22l5 2.5M31.5 22l-5 2.5"/><path d="M19 31c3-2 7-2 10 0"/><path d="M11 25H7.5M37 25h3.5"/><path d="M17 36v5M31 36v5"/>`,
    },
    neu: {
      f: `<path d="M10 38l3-9 19-19 6 6-19 19z"/>`,
      i: `<path d="M10 38l3-9 19-19 6 6-19 19z"/><path d="M13 29l6 6M28 14l6 6"/><path d="M8 43h14"/>`,
    },
    // Biergarten-Design: Brezel
    garten: {
      f: `<path d="M24 41c-9 0-16-5-16-13 0-7 5-12 10.5-12 3.5 0 5.5 2.5 5.5 6 0-3.5 2-6 5.5-6C35 16 40 21 40 28c0 8-7 13-16 13z"/>`,
      i: `<path d="M24 41c-9 0-16-5-16-13 0-7 5-12 10.5-12 3.5 0 5.5 2.5 5.5 6 0-3.5 2-6 5.5-6C35 16 40 21 40 28c0 8-7 13-16 13z"/>
          <path d="M15 38l13-14M33 38L20 24"/><path d="M16 28.5v.4M32 28.5v.4M24 34.5v.4M20 20v.4M28 20v.4"/>`,
    },
    // Wiesn-Design: Lebkuchenherz
    wiesn: {
      f: `<path d="M24 41C14 34 6 27 6 18.5 6 12 10.5 8 15.5 8c4 0 7 2.3 8.5 5.5C25.5 10.3 28.5 8 32.5 8 37.5 8 42 12 42 18.5 42 27 34 34 24 41z"/>`,
      i: `<path d="M24 41C14 34 6 27 6 18.5 6 12 10.5 8 15.5 8c4 0 7 2.3 8.5 5.5C25.5 10.3 28.5 8 32.5 8 37.5 8 42 12 42 18.5 42 27 34 34 24 41z"/>
          <path d="M24 36.5C16 31 10.5 25.5 10.5 19c0-4 2.5-6.5 5.5-6.5 3.5 0 6 2.5 8 6 2-3.5 4.5-6 8-6 3 0 5.5 2.5 5.5 6.5 0 6.5-5.5 12-13.5 17.5z" stroke-dasharray="0.1 3.2"/>
          <path d="M17 22c2 2.5 4.5 3.5 7 3.5s5-1 7-3.5"/>`,
    },
    // Sprachen: Sprechblase mit Kürzel
    de: {
      f: `<path d="M8 10h32a3 3 0 0 1 3 3v17a3 3 0 0 1-3 3H21l-8 7v-7H8a3 3 0 0 1-3-3V13a3 3 0 0 1 3-3z"/>`,
      i: `<path d="M8 10h32a3 3 0 0 1 3 3v17a3 3 0 0 1-3 3H21l-8 7v-7H8a3 3 0 0 1-3-3V13a3 3 0 0 1 3-3z"/><text x="24" y="26.5" text-anchor="middle" font-size="12" font-weight="800" font-family="system-ui, sans-serif" style="fill:var(--ink,#211910);stroke:none">DE</text>`,
    },
    en: {
      f: `<path d="M8 10h32a3 3 0 0 1 3 3v17a3 3 0 0 1-3 3H21l-8 7v-7H8a3 3 0 0 1-3-3V13a3 3 0 0 1 3-3z"/>`,
      i: `<path d="M8 10h32a3 3 0 0 1 3 3v17a3 3 0 0 1-3 3H21l-8 7v-7H8a3 3 0 0 1-3-3V13a3 3 0 0 1 3-3z"/><text x="24" y="26.5" text-anchor="middle" font-size="12" font-weight="800" font-family="system-ui, sans-serif" style="fill:var(--ink,#211910);stroke:none">EN</text>`,
    },
    klassisch: {
      f: `<rect x="9" y="9" width="30" height="30" rx="9"/>`,
      i: `<rect x="9" y="9" width="30" height="30" rx="9"/><circle cx="19" cy="21" r="1.6"/><circle cx="29" cy="21" r="1.6"/><path d="M18 28c3.5 3 8.5 3 12 0"/>`,
    },
  };

  // Farben pro Icon, wie Druckfarben: gedeckt, nicht neon
  const SPOT = {
    flunky: "#e4572e", hodenritter: "#5b9e6d", kistenturm: "#e9a23b", flasche: "#4f8fbf",
    dealer: "#d94a3d", fenster: "#e9b949", randvoll: "#efb030", duell: "#c9573c",
    eher: "#8f7ac8", busfahrer: "#e9b949", niewieder: "#e57a8f", pflicht: "#d94a3d",
    triade: "#5b9e6d", luegen: "#4fa3a5", deckel: "#c9814a",
    phone: "#e9b949", phones: "#e4572e", settings: "#e9b949",
    alkoholfrei: "#6fb6c8", mild: "#e9c46a", normal: "#efb030", hart: "#e4572e",
    leicht: "#9cc27a", mittel: "#6fa8d6", schwer: "#d94a3d",
    neu: "#e9b949", garten: "#c9814a", wiesn: "#a0582c", de: "#e9b949", en: "#6fa8d6", klassisch: "#8f6fd8",
  };

  return { I, SPOT };
})();

function drawnIcon(name, spot) {
  const ic = DRAWN_ICONS.I[name];
  if (!ic) return "";
  const color = spot ?? DRAWN_ICONS.SPOT[name] ?? "#e9b949";
  return `<svg class="drawn" viewBox="0 0 48 48" aria-hidden="true" style="--spot:${color}">
    <circle class="drawn-bg" cx="24" cy="24" r="24"/><g class="drawn-c">
    ${ic.b ? `<g class="drawn-b">${ic.b}</g>` : ""}
    <g class="drawn-f" transform="translate(1.6 1.4)">${ic.f}</g>
    <g class="drawn-i">${ic.i}</g></g></svg>`;
}

function hasDrawnIcon(name) {
  return !!DRAWN_ICONS.I[name];
}

// Platzhalter im HTML (<span data-icon="phone">) füllen
function fillDrawnIcons(root = document) {
  root.querySelectorAll("[data-icon]").forEach((el) => {
    if (!el.firstChild) el.innerHTML = drawnIcon(el.dataset.icon);
  });
}
