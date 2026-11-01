// Eigener Charakter: Beim ersten Start erstellt jeder seine Figur (Aussehen, Kleidung, auf Wunsch ein Foto vom Gesicht).
// Sie wird auf dem Handy gespeichert (localStorage), als kleines Bild bei den Spielernamen gezeigt und in Hodenritter
// als 3D-Mensch. Beim Spielen mit mehreren Handys geht sie mit dem Beitreten an den Host und von da an alle im Raum.
//
// Die Felder heißen wie in figuren/personen.js (haut, haare, frisur, …), damit Hodenritter beides gleich behandelt.
const Figur = (() => {
  const KEY = "saufspiel-figur";
  const LATER_KEY = "saufspiel-figur-spaeter";

  // Gleiche Farben wie die gewürfelten Figuren in Hodenritter
  const SKINS = ["#f4cbad", "#f1c3a1", "#e8b08a", "#dc9a70", "#c4825a", "#a26745", "#7f4f34", "#5f3b27"];
  const HAIRS = ["#1d1611", "#3b2717", "#5c3b22", "#7a5230", "#a87444", "#d0a868", "#e7cf9c", "#8a3b1c", "#9a9a9a", "#2b2b2b", "#e05a8a", "#3b82f6"];
  const SHIRTS = ["#e8e8e8", "#1f2937", "#b91c1c", "#1d4ed8", "#15803d", "#f59e0b", "#7c3aed", "#db2777", "#0e7490", "#f97316", "#64748b", "#fde68a", "#a3e635", "#38bdf8"];
  const IRIS = ["#4b3621", "#6b4e2e", "#2f6fa3", "#3d7a4d", "#7a8c99"];
  const PANTS = ["#2b4a7a", "#34507e", "#1f2937", "#c2b28f", "#6b7b4e", "#3f3f46", "#9b8a6a", "#b91c1c", "#f5f5f5"];
  const SHOES = ["#f5f5f5", "#111827", "#b91c1c", "#1d4ed8", "#9ca3af", "#7c5a3a", "#f59e0b"];
  const CAPS = ["#b91c1c", "#1d4ed8", "#111827", "#f5f5f5", "#15803d", "#f59e0b", "#db2777"];
  const STYLES = { short: "Kurz", buzz: "Raspel", curly: "Locken", bald: "Glatze", long: "Lang", ponytail: "Zopf", bun: "Dutt", bob: "Bob" };
  const TOPS = { tee: "T-Shirt", tank: "Top", long: "Langarm" };
  const BOTTOMS = { shorts: "Shorts", jeans: "Jeans", chinos: "Stoffhose" };

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const lc = (name) => String(name ?? "").trim().toLowerCase();

  // --- Gespeicherte Figur ---

  let mine = null; // wird direkt nach clean() geladen
  const others = new Map(); // Figuren der anderen im Raum: kleiner Name → Figur

  function load() {
    try {
      return clean(JSON.parse(localStorage.getItem(KEY)));
    } catch {
      return null;
    }
  }

  function store() {
    try {
      localStorage.setItem(KEY, JSON.stringify(mine));
      try {
        localStorage.setItem("saufspiel-name", mine.name); // Name auch fürs Beitreten in Räume
      } catch {
        // egal
      }
    } catch {
      // Foto zu groß oder kein Speicher: ohne Foto nochmal
      try {
        localStorage.setItem(KEY, JSON.stringify({ ...mine, foto: undefined, fotoKlein: undefined }));
      } catch {
        // dann eben nur für diesmal
      }
    }
  }

  // Nur bekannte Felder mit gültigen Werten übernehmen (Figuren kommen auch von anderen Handys).
  const COLOR = /^#[0-9a-f]{6}$/i;
  const ZUG = ["laenge", "kiefer", "augen", "offen", "nase", "nasenlaenge", "mund", "lippen", "brauen"];
  const PHOTO = /^data:image\/jpeg;base64,[a-z0-9+/=]+$/i;
  function clean(f) {
    if (!f || typeof f !== "object") return null;
    const out = {};
    if (typeof f.name === "string") out.name = f.name.trim().slice(0, 20);
    for (const k of ["haut", "haare", "augen", "shirt", "shirt2", "hose", "schuhe", "kappenfarbe"]) if (COLOR.test(f[k])) out[k] = f[k];
    for (const k of ["frau", "bart", "brille", "sonnenbrille", "kappe", "streifen"]) if (typeof f[k] === "boolean") out[k] = f[k];
    if (STYLES[f.frisur]) out.frisur = f.frisur;
    if (TOPS[f.oben]) out.oben = f.oben;
    if (BOTTOMS[f.unten]) out.unten = f.unten;
    if (Number.isFinite(f.groesse)) out.groesse = Math.min(2.1, Math.max(1.45, f.groesse));
    if (Number.isFinite(f.statur)) out.statur = Math.min(1.12, Math.max(0.88, f.statur));
    if (window.Gesicht3D?.validForm(f.form)) out.form = f.form; // grobes 3D-Gesicht (figur-3d.js)
    for (const k of ["foto", "fotoKlein", "formFoto", "formFotoKlein"]) if (typeof f[k] === "string" && f[k].length < 120000 && PHOTO.test(f[k])) out[k] = f[k];
    if (f.stil === "3d" || f.stil === "gezeichnet") out.stil = f.stil;
    if (f.zug && typeof f.zug === "object") {
      const z = {};
      for (const k of ZUG) if (Number.isFinite(f.zug[k])) z[k] = Math.min(1.4, Math.max(0.7, f.zug[k]));
      if (Object.keys(z).length) out.zug = z;
    }
    return out;
  }

  mine = load();

  // Würfeln wie in Hodenritter (gleiche Reihenfolge), damit jemand ohne eigene Figur überall gleich aussieht.
  function hash(str) {
    let h = 2166136261;
    for (const c of String(str)) {
      h ^= c.codePointAt(0);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function seeded(seed) {
    let s = seed >>> 0 || 1;
    return () => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }
  const HR_SKINS = ["#f1c3a1", "#e8b08a", "#dc9a70", "#c4825a", "#a26745", "#7f4f34", "#5f3b27", "#f4cbad"];
  const HR_HAIRS = ["#1d1611", "#3b2717", "#5c3b22", "#7a5230", "#a87444", "#d0a868", "#e7cf9c", "#8a3b1c", "#9a9a9a", "#2b2b2b"];
  const HR_IRIS = ["#4b3621", "#2f6fa3", "#3d7a4d", "#6b4e2e", "#7a8c99"];
  function randomLook(seedText) {
    const r = seeded(hash(seedText) ^ 0x9e3779b9);
    const pick = (a) => a[Math.floor(r() * a.length)];
    const frau = r() < 0.45;
    const frisur = frau ? pick(["long", "long", "ponytail", "bun", "bob", "curly"]) : pick(["short", "short", "short", "buzz", "curly", "bald", "long"]);
    const shirt = pick(SHIRTS);
    let shirt2 = pick(SHIRTS);
    if (shirt2 === shirt) shirt2 = "#ffffff";
    const L = { frau, frisur, shirt, shirt2 };
    L.groesse = frau ? 1.6 + r() * 0.16 : 1.72 + r() * 0.2;
    L.statur = 0.92 + r() * 0.18;
    L.haut = pick(HR_SKINS);
    L.haare = frisur === "bald" ? pick(HR_HAIRS.slice(0, 4)) : r() < 0.06 ? "#e05a8a" : pick(HR_HAIRS);
    L.augen = pick(HR_IRIS);
    L.bart = !frau && r() < 0.35;
    L.kappe = r() < 0.14;
    L.brille = r() < 0.16;
    L.sonnenbrille = r() < 0.12;
    L.oben = frau ? pick(["tee", "tee", "tank", "long"]) : pick(["tee", "tee", "tee", "long", "tank"]);
    L.streifen = r() < 0.25;
    L.unten = pick(["shorts", "shorts", "jeans", "jeans", "chinos"]);
    L.hose = pick(["#2b4a7a", "#34507e", "#1f2937", "#c2b28f", "#6b7b4e", "#3f3f46", "#9b8a6a"]);
    L.schuhe = pick(["#f5f5f5", "#111827", "#b91c1c", "#1d4ed8", "#9ca3af", "#7c5a3a"]);
    L.kappenfarbe = pick(["#b91c1c", "#1d4ed8", "#111827", "#f5f5f5", "#15803d"]);
    return L;
  }

  // Eigene Figur eines Spielers (oder null): meine, wenn der Name passt, sonst die vom Raum.
  function person(name) {
    if (typeof isBot === "function" && isBot(name)) return null;
    const k = lc(name);
    if (!k) return null;
    if (mine && lc(mine.name) === k) return mine;
    return others.get(k) ?? null;
  }

  // Vollständiges Aussehen für die Bilder: eigene Figur oder gewürfelt
  function lookFor(name) {
    const P = person(name);
    return P ? { ...randomLook(name), ...P } : randomLook(name);
  }

  // --- Bild der Figur (SVG) ---

  let uid = 0;
  function shade(hex, k) {
    const n = parseInt(hex.slice(1), 16);
    const f = (v) => Math.max(0, Math.min(255, Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k)));
    return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => f(v).toString(16).padStart(2, "0")).join("")}`;
  }

  // Kopf mit Haaren, Gesicht, Brille, Kappe. Koordinaten 0–100, Kopfmitte (50, 42).
  function headSvg(L, id) {
    const H = L.haare;
    const skin = L.haut;
    const fem = !!L.frau;
    const rx = fem ? 18 : 19;
    const s = L.frisur;
    const foto = L.stil === "gezeichnet" ? null : L.fotoKlein || L.foto;
    const Z = { laenge: 1, kiefer: 1, augen: 1, offen: 1, nase: 1, nasenlaenge: 1, mund: 1, lippen: 1, brauen: 1, ...(L.zug || {}) };
    const chinY = 65.5 + (Z.laenge - 1) * 18;
    const jaw = (fem ? 0.5 : 0.62) * Math.min(1.35, Math.max(0.7, 1 + (Z.kiefer - 1) * 1.6));
    let back = "";
    let front = "";
    if (s === "long") back = `<path d="M29 38C26 62 27 80 33 90L67 90C73 80 74 62 71 38Z" fill="${H}"/>`;
    if (s === "bob") back = `<path d="M29 36C27 52 28 63 32 67L68 67C72 63 73 52 71 36Z" fill="${H}"/>`;
    if (s === "ponytail") back = `<path d="M66 30C78 34 80 52 74 66C72 56 70 46 64 40Z" fill="${H}"/>`;
    if (s === "bun") back = `<circle cx="50" cy="15" r="8.5" fill="${H}"/>`;
    if (s === "curly") {
      back = [[31, 30], [35, 21], [43, 16], [52, 15], [61, 18], [67, 25], [70, 34], [30, 40], [71, 43]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="8" fill="${H}"/>`).join("");
      front = [[37, 25], [45, 21], [54, 21], [62, 25]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="5.5" fill="${H}"/>`).join("");
    }
    if (s === "short") front = `<path d="M31 39C29 22 39 15.5 50 15.5C62 15.5 71 22 69 39C66 30 58 26.5 50 27C42 26.5 34 30 31 39Z" fill="${H}"/>`;
    if (s === "buzz") front = `<path d="M32 35C32 23 41 18.5 50 18.5C60 18.5 68 23 68 35C61 28.5 40 28.5 32 35Z" fill="${H}" opacity="0.8"/>`;
    if (s === "long" || s === "bob" || s === "ponytail" || s === "bun") front = `<path d="M30 44C27 23 39 15.5 50 15.5C62 15.5 73 23 70 44C68 31 60 26 53 25C46 29 37 33 30 44Z" fill="${H}"/>`;

    let face = "";
    if (foto) {
      face = `<defs><radialGradient id="g${id}"><stop offset="0.72" stop-color="#fff"/><stop offset="1" stop-color="#000"/></radialGradient>
        <mask id="m${id}"><ellipse cx="50" cy="47" rx="17.5" ry="20" fill="url(#g${id})"/></mask></defs>
        <image href="${foto}" x="32.5" y="27" width="35" height="40" preserveAspectRatio="none" mask="url(#m${id})"/>`;
    } else {
      const iris = L.augen;
      const f = (v) => v.toFixed(2);
      const ex = 3.4 * Z.augen;
      const ey = 2.7 * Z.augen * Math.pow(Z.offen, 0.7);
      const ir = Math.min(ey * 0.95, 2 * Z.augen);
      for (const x of [42, 58]) {
        face += `<ellipse cx="${x}" cy="42" rx="${f(ex)}" ry="${f(ey)}" fill="#fbfaf6"/><circle cx="${x}" cy="42.2" r="${f(ir)}" fill="${iris}"/><circle cx="${x}" cy="42.2" r="${f(ir * 0.48)}" fill="#111"/><circle cx="${x + 0.7}" cy="41.4" r="0.5" fill="#fff"/>`;
        face += `<path d="M${f(x - ex - 0.3)} 42Q${x} ${f(42 - ey * 1.5)} ${f(x + ex + 0.3)} 42" stroke="${shade(skin, -0.45)}" stroke-width="0.7" fill="none"/>`;
      }
      const by = 36.4 - (Z.brauen - 1) * 7;
      face += `<path d="M38 ${f(by + 0.2)}Q42 ${f(by - 1.8)} 46 ${f(by - 0.2)}M54 ${f(by - 0.2)}Q58 ${f(by - 1.8)} 62 ${f(by + 0.2)}" stroke="${H}" stroke-width="${fem ? 1.2 : 1.7}" fill="none" stroke-linecap="round"/>`;
      const ny = 50.4 + (Z.nasenlaenge - 1) * 6 + (Z.laenge - 1) * 4;
      const nw = 2.6 * Z.nase;
      face += `<path d="M50.2 44Q48.6 ${f(ny - 3)} 49.6 ${f(ny - 0.6)}M${f(50 - nw)} ${f(ny - 0.8)}Q${f(50 - nw * 0.6)} ${f(ny + 0.8)} 50 ${f(ny)}Q${f(50 + nw * 0.6)} ${f(ny + 0.8)} ${f(50 + nw)} ${f(ny - 0.8)}" stroke="${shade(skin, -0.28)}" stroke-width="1.1" fill="none" stroke-linecap="round"/>`;
      if (L.bart) face += `<path d="M31.5 46C32 ${f(chinY - 3.5)} 40 ${f(chinY + 2)} 50 ${f(chinY + 2)}C60 ${f(chinY + 2)} 68 ${f(chinY - 3.5)} 68.5 46C66 54 62 ${f(chinY - 8)} 56 ${f(chinY - 8)}Q50 ${f(chinY - 10)} 44 ${f(chinY - 8)}C38 ${f(chinY - 8)} 34 54 31.5 46Z" fill="${H}"/>`;
      const my = 55.4 + (Z.laenge - 1) * 9;
      const mw = 5.4 * Z.mund;
      const lip = fem ? "#b0485a" : shade(skin, -0.3);
      const lt = (fem ? 1.3 : 0.9) * Z.lippen;
      face += `<path d="M${f(50 - mw)} ${f(my)}Q50 ${f(my + 3.2 * lt)} ${f(50 + mw)} ${f(my)}Q50 ${f(my + 1.2)} ${f(50 - mw)} ${f(my)}Z" fill="${lip}" opacity="0.85"/>`;
      face += `<path d="M${f(50 - mw)} ${f(my)}Q${f(50 - mw * 0.5)} ${f(my - 1.4 * lt)} 50 ${f(my - 0.6 * lt)}Q${f(50 + mw * 0.5)} ${f(my - 1.4 * lt)} ${f(50 + mw)} ${f(my)}Q50 ${f(my + 1.3)} ${f(50 - mw)} ${f(my)}Z" fill="${lip}"/>`;
      face += `<path d="M${f(50 - mw)} ${f(my)}Q50 ${f(my + 1.6)} ${f(50 + mw)} ${f(my)}" stroke="${shade(lip, -0.45)}" stroke-width="0.7" fill="none" stroke-linecap="round"/>`;
    }
    let extra = "";
    if (L.brille || L.sonnenbrille) {
      const fill = L.sonnenbrille ? "#121518" : "rgb(255 255 255 / 0.18)";
      extra += `<g stroke="${L.sonnenbrille ? "#0b0b0b" : "#3a2a1a"}" stroke-width="1.4" fill="${fill}"><circle cx="42" cy="42" r="5.4"/><circle cx="58" cy="42" r="5.4"/></g><path d="M47.4 41.4Q50 40 52.6 41.4M36.6 41.2L31 40M63.4 41.2L69 40" stroke="#2a2018" stroke-width="1.3" fill="none"/>`;
    }
    if (L.kappe) {
      const c = L.kappenfarbe;
      extra += `<path d="M29.5 35C29.5 19 39 12.5 50 12.5C61 12.5 70.5 19 70.5 35Z" fill="${c}"/><path d="M29 34.5Q50 31 71 34.5Q73 37.5 71 38.5Q50 35 29 38.5Q27 37.5 29 34.5Z" fill="${shade(c, -0.25)}"/><circle cx="50" cy="13.4" r="1.6" fill="${shade(c, -0.25)}"/>`;
    }
    return `${back}
      <ellipse cx="${50 - rx}" cy="45" rx="3.2" ry="5" fill="${skin}"/><ellipse cx="${50 + rx}" cy="45" rx="3.2" ry="5" fill="${skin}"/>
      <path d="M${50 - rx} 40C${50 - rx} 26 ${50 - rx * 0.55} 19 50 19C${50 + rx * 0.55} 19 ${50 + rx} 26 ${50 + rx} 40C${50 + rx} 54 ${(50 + rx * jaw).toFixed(2)} ${chinY.toFixed(2)} 50 ${chinY.toFixed(2)}C${(50 - rx * jaw).toFixed(2)} ${chinY.toFixed(2)} ${50 - rx} 54 ${50 - rx} 40Z" fill="${skin}"/>
      ${face}${front}${extra}`;
  }

  function shirtFill(L, id) {
    if (!L.streifen) return { defs: "", fill: L.shirt };
    return {
      defs: `<defs><pattern id="s${id}" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="${L.shirt}"/><rect width="6" height="3" fill="${L.shirt2 || "#ffffff"}"/></pattern></defs>`,
      fill: `url(#s${id})`,
    };
  }

  // Kleines rundes Bild: Kopf und Schultern
  function bust(L) {
    const id = `f${++uid}`;
    const sh = shirtFill(L, id);
    const w = (L.frau ? 0.9 : 1) * (L.statur ?? 1);
    const x = (v) => (50 + (v - 50) * w).toFixed(1);
    const skin = L.haut;
    let body = `<rect x="44" y="58" width="12" height="18" fill="${shade(skin, -0.08)}"/>`;
    if (L.oben === "tank") {
      body += `<path d="M${x(10)} 100C${x(12)} 82 ${x(28)} 74 50 74C${x(72)} 74 ${x(88)} 82 ${x(90)} 100Z" fill="${skin}"/><path d="M${x(26)} 100C${x(28)} 88 ${x(34)} 78 ${x(38)} 75L44 75Q50 82 56 75L${x(62)} 75C${x(66)} 78 ${x(72)} 88 ${x(74)} 100Z" fill="${sh.fill}"/>`;
    } else {
      body += `<path d="M${x(9)} 100C${x(11)} 81 ${x(28)} 73 50 73C${x(72)} 73 ${x(89)} 81 ${x(91)} 100Z" fill="${sh.fill}"/><path d="M43 73.5Q50 81 57 73.5" fill="${shade(skin, -0.08)}"/>`;
    }
    return `<svg class="figur-svg" viewBox="0 0 100 100" aria-hidden="true">${sh.defs}${body}${headSvg(L, id)}</svg>`;
  }

  // Ganze Figur für den Editor
  function full(L) {
    const id = `f${++uid}`;
    const sh = shirtFill(L, id);
    const skin = L.haut;
    const w = (L.frau ? 0.9 : 1) * (L.statur ?? 1);
    const x = (v) => (50 + (v - 50) * w).toFixed(1);
    const sleeve = L.oben === "long" ? sh.fill : skin;
    const pants = L.hose;
    const shorts = L.unten === "shorts";
    const legs = shorts ? skin : pants;
    let s = sh.defs;
    // Arme (hinter dem Körper), Hände
    s += `<path d="M${x(30)} 78C${x(22)} 92 ${x(20)} 112 ${x(21)} 132L${x(28)} 132C${x(28)} 114 ${x(30)} 98 ${x(35)} 86Z" fill="${sleeve}"/>`;
    s += `<path d="M${x(70)} 78C${x(78)} 92 ${x(80)} 112 ${x(79)} 132L${x(72)} 132C${x(72)} 114 ${x(70)} 98 ${x(65)} 86Z" fill="${sleeve}"/>`;
    if (L.oben === "tee") s += `<path d="M${x(30)} 76C${x(23)} 86 ${x(22)} 94 ${x(22)} 100L${x(31)} 101C${x(31)} 95 ${x(32)} 90 ${x(36)} 84Z" fill="${sh.fill}"/><path d="M${x(70)} 76C${x(77)} 86 ${x(78)} 94 ${x(78)} 100L${x(69)} 101C${x(69)} 95 ${x(68)} 90 ${x(64)} 84Z" fill="${sh.fill}"/>`;
    s += `<ellipse cx="${x(24.5)}" cy="136" rx="4" ry="5.5" fill="${skin}"/><ellipse cx="${x(75.5)}" cy="136" rx="4" ry="5.5" fill="${skin}"/>`;
    // Beine, Hose, Schuhe
    s += `<path d="M${x(36)} 126L${x(35)} 194L${x(48)} 194L50 136L52 194L${x(65)} 194L${x(64)} 126Z" fill="${legs}"/>`;
    s += shorts
      ? `<path d="M${x(35)} 124L${x(34)} 154L${x(49)} 155L50 140L51 155L${x(66)} 154L${x(65)} 124Z" fill="${pants}"/>`
      : `<path d="M${x(36)} 124L${x(35)} 194L${x(48)} 194L50 138L52 194L${x(65)} 194L${x(64)} 124Z" fill="${pants}"/>${L.unten === "jeans" ? `<path d="M${x(41.5)} 130L${x(41)} 192M${x(58.5)} 130L${x(59)} 192" stroke="${shade(pants, 0.25)}" stroke-width="0.6" stroke-dasharray="1.6 1.2"/>` : ""}`;
    s += `<path d="M${x(33)} 192h${(16 * w).toFixed(1)}q3 0 3 4v2h-${(20 * w).toFixed(1)}q0-6 1-6Z" fill="${L.schuhe}"/><path d="M${x(51)} 192h${(16 * w).toFixed(1)}q1 0 1 6h-${(20 * w).toFixed(1)}v-2q0-4 3-4Z" fill="${L.schuhe}"/>`;
    // Oberkörper
    s += `<rect x="44" y="58" width="12" height="18" fill="${shade(skin, -0.08)}"/>`;
    if (L.oben === "tank") {
      s += `<path d="M${x(31)} 78C${x(33)} 74 ${x(40)} 72 50 72C${x(60)} 72 ${x(67)} 74 ${x(69)} 78L${x(65)} 88Z M${x(35)} 88L${x(31)} 78L${x(35)} 86Z" fill="${skin}"/>`;
      s += `<path d="M${x(36)} 75L44 74Q50 81 56 74L${x(64)} 75C${x(66)} 90 ${x(66)} 108 ${x(65)} 128L${x(35)} 128C${x(34)} 108 ${x(34)} 90 ${x(36)} 75Z" fill="${sh.fill}"/>`;
    } else {
      s += `<path d="M${x(30)} 78C${x(32)} 74 ${x(40)} 72 50 72C${x(60)} 72 ${x(68)} 74 ${x(70)} 78C${x(67)} 92 ${x(66)} 110 ${x(65)} 128L${x(35)} 128C${x(34)} 110 ${x(33)} 92 ${x(30)} 78Z" fill="${sh.fill}"/><path d="M43 72.5Q50 80 57 72.5" fill="${shade(skin, -0.08)}"/>`;
    }
    const h = Math.min(1.1, Math.max(0.82, (L.groesse ?? 1.75) / 1.85));
    return `<svg class="figur-svg figur-full" viewBox="0 -4 100 206" aria-hidden="true"><g transform="translate(50 202) scale(${h.toFixed(3)}) translate(-50 -202)"><ellipse cx="50" cy="199" rx="30" ry="3.5" fill="rgb(0 0 0 / 0.25)"/>${s}${headSvg(L, id)}</g></svg>`;
  }

  // Kleines Bild zu einem Spielernamen (für Listen und Meldungen)
  function avatar(name, cls = "") {
    if (typeof isBot === "function" && isBot(name)) return ""; // Bots haben schon 🤖 im Namen
    return `<span class="fav ${cls}" aria-hidden="true">${bust(lookFor(name))}</span>`;
  }

  // Kleines Bild zu einer Figur, die z. B. ein Freund geschickt hat
  function avatarFor(fig, cls = "") {
    const f = clean(fig);
    return `<span class="fav ${cls}" aria-hidden="true">${bust(f ? { ...randomLook(f.name || ""), ...f } : randomLook(""))}</span>`;
  }

  // --- Mehrere Handys: Figur geht beim Beitreten mit, der Host legt sie in den Raum ---

  function wire() {
    if (!mine) return null;
    const { foto, formFoto, ...rest } = mine;
    if (rest.stil === "gezeichnet") {
      // gezeichnet: es reichen die gemessenen Gesichtszüge, Fotos bleiben auf dem Handy
      delete rest.fotoKlein;
      delete rest.form;
      delete rest.formFotoKlein;
    }
    return rest; // mit den kleinen Fotos, die großen bleiben auf dem Handy
  }

  function setRoom(players) {
    others.clear();
    for (const p of players || []) {
      if (p.bot || !p.fig) continue;
      const f = clean(p.fig);
      if (f) others.set(lc(p.name), { ...f, name: p.name });
    }
  }

  // --- Editor ---

  let draft = null;
  let tab = "aussehen";
  let onDone = null;
  let first = false;

  function defaults() {
    const L = randomLook(`${Date.now()}-${Math.random()}`);
    L.kappe = false;
    L.sonnenbrille = false;
    return { name: localStorageName(), ...L };
  }

  function localStorageName() {
    try {
      return localStorage.getItem("saufspiel-name") || "";
    } catch {
      return "";
    }
  }

  function edit(opts = {}) {
    draft = mine ? JSON.parse(JSON.stringify(mine)) : defaults();
    first = !!opts.first;
    onDone = opts.done ?? null;
    tab = "aussehen";
    render();
    showScreen("figur");
  }

  function swatches(field, colors) {
    return `<div class="fg-swatches">${colors.map((c) => `<button class="fg-sw ${draft[field] === c ? "picked" : ""}" style="--c:${c}" data-set="${field}" data-val="${c}" aria-label="${c}" aria-pressed="${draft[field] === c}"></button>`).join("")}</div>`;
  }

  function choice(field, options, val = (k) => k) {
    return `<div class="fg-choice">${Object.entries(options).map(([k, label]) => {
      const v = val(k);
      const on = draft[field] === v;
      return `<button class="${on ? "picked" : ""}" data-set="${field}" data-val='${JSON.stringify(v)}' aria-pressed="${on}">${esc(t(label))}</button>`;
    }).join("")}</div>`;
  }

  function onOff(field, label) {
    return `<button class="fg-toggle ${draft[field] ? "picked" : ""}" data-set="${field}" data-val='${JSON.stringify(!draft[field])}' aria-pressed="${!!draft[field]}">${esc(t(label))}</button>`;
  }

  function row(label, html) {
    return `<div class="fg-row"><span class="fg-label">${esc(t(label))}</span>${html}</div>`;
  }

  function panel() {
    if (tab === "aussehen") {
      const styles = Object.entries(STYLES).map(([k, label]) => {
        const on = draft.frisur === k;
        return `<button class="fg-style ${on ? "picked" : ""}" data-set="frisur" data-val='"${k}"' aria-pressed="${on}">${bust({ ...draft, frisur: k, kappe: false, foto: null, fotoKlein: null })}<span>${esc(t(label))}</span></button>`;
      }).join("");
      return [
        row("Figur", choice("frau", { m: "Mann", w: "Frau" }, (k) => k === "w")),
        row("Hautfarbe", swatches("haut", SKINS)),
        row("Frisur", `<div class="fg-styles">${styles}</div>`),
        row("Haarfarbe", swatches("haare", HAIRS)),
        row("Augenfarbe", swatches("augen", IRIS)),
        row("Extras", `<div class="fg-choice">${onOff("bart", "Bart")}${onOff("brille", "Brille")}${onOff("sonnenbrille", "Sonnenbrille")}</div>`),
        row("Größe", `<label class="fg-range"><input type="range" min="1.5" max="2.05" step="0.01" value="${draft.groesse ?? 1.75}" data-range="groesse"><b>${(draft.groesse ?? 1.75).toFixed(2).replace(".", ",")} m</b></label>`),
        row("Statur", `<label class="fg-range"><span>${esc(t("schmal"))}</span><input type="range" min="0.9" max="1.1" step="0.01" value="${draft.statur ?? 1}" data-range="statur"><span>${esc(t("breit"))}</span></label>`),
      ].join("");
    }
    if (tab === "kleidung") {
      return [
        row("Oberteil", choice("oben", TOPS)),
        row("Farbe", swatches("shirt", SHIRTS)),
        row("Streifen", `<div class="fg-choice">${onOff("streifen", draft.streifen ? "Mit Streifen" : "Ohne Streifen")}</div>${draft.streifen ? swatches("shirt2", ["#ffffff", ...SHIRTS]) : ""}`),
        row("Hose", choice("unten", BOTTOMS)),
        row("Hosenfarbe", swatches("hose", PANTS)),
        row("Schuhe", swatches("schuhe", SHOES)),
        row("Kappe", `<div class="fg-choice">${onOff("kappe", draft.kappe ? "Mit Kappe" : "Ohne Kappe")}</div>${draft.kappe ? swatches("kappenfarbe", CAPS) : ""}`),
      ].join("");
    }
    const has = !!draft.foto;
    return `
      <div class="fg-face">
        ${draft.form ? `<div class="fg-choice fg-stil" role="group" aria-label="${esc(t("Wie soll dein Gesicht aussehen?"))}">
          <button class="${draft.stil !== "gezeichnet" ? "picked" : ""}" data-set="stil" data-val='"3d"' aria-pressed="${draft.stil !== "gezeichnet"}">📸 ${esc(t("Echt in 3D"))}</button>
          <button class="${draft.stil === "gezeichnet" ? "picked" : ""}" data-set="stil" data-val='"gezeichnet"' aria-pressed="${draft.stil === "gezeichnet"}">✏️ ${esc(t("Gezeichnet"))}</button>
        </div>` : ""}
        ${draft.form && draft.stil !== "gezeichnet" ? `<div class="fg-3d" aria-label="${esc(t("Dein Gesicht in 3D"))}"><canvas></canvas><span class="fg-3d-hint">${esc(t("3D · zum Drehen wischen"))}</span></div>` : draft.form ? `<div class="fg-face-pic fg-drawn">${bust({ ...draft, kappe: false })}</div>` : `<div class="fg-face-pic">${has ? `<img src="${draft.foto}" alt="">` : `<span>🙂</span>`}</div>`}
        <p>${esc(t(draft.form && draft.stil === "gezeichnet" ? "Gezeichnet: Aus deinem Foto wurden Gesichtsform, Augen, Nase, Mund, Lippen, Haut-, Haar- und Augenfarbe gemessen und im Stil der App gezeichnet. So siehst du auch in Hodenritter aus." : draft.form ? "Echt in 3D: Aus deinem Foto ist ein 3D-Gesicht geworden, Nase, Augen, Mund, Wangen und Kinn haben deine Form. In Hodenritter sitzt es auf dem Kopf deiner Figur." : has ? "Dein Gesicht ist drauf, aber nur flach als Foto (es wurde kein Gesicht erkannt). Versuch es nochmal gerade von vorne mit gutem Licht." : "Mach ein Selfie: Du kannst danach wählen, ob dein echtes Gesicht in 3D auf die Figur kommt oder ob es gezeichnet wird."))}</p>
        <button class="btn" data-do="scan">📷 ${esc(t(has ? "Neu scannen" : "Gesicht scannen"))}</button>
        <label class="btn ghost fg-file">🖼️ ${esc(t("Foto aus der Galerie"))}<input type="file" accept="image/*" data-do="file" hidden></label>
        ${has ? `<button class="btn ghost" data-do="nofoto">${esc(t("Foto entfernen"))}</button>` : ""}
        <p class="hint small-text">${esc(t("Die Gesichtserkennung läuft auf deinem Handy, beim ersten Mal lädt sie etwa 13 MB. Am besten gerade in die Kamera schauen, mit gutem Licht. Foto und 3D-Gesicht bleiben auf deinem Handy und gehen nur an die Handys in deinem Raum, wenn ihr mit mehreren Handys spielt."))}</p>
      </div>`;
  }

  function render() {
    const root = $("figur-root");
    const tabs = { aussehen: "Aussehen", kleidung: "Kleidung", gesicht: "Gesicht" };
    root.innerHTML = `
      ${first ? `<p class="fg-welcome">${esc(t("Willkommen! Erstell dir zuerst deinen Charakter. Er spielt dann überall für dich mit."))}</p>` : ""}
      <div class="fg-layout">
        <div class="fg-stage">
          <div class="fg-preview">${full(draft)}</div>
          <button class="btn ghost small fg-dice" data-do="dice" aria-label="${esc(t("Zufällig"))}">🎲 ${esc(t("Zufällig"))}</button>
        </div>
        <div class="fg-side">
          <label class="field fg-name"><span>${esc(t("Dein Name"))}</span><input id="figur-name" type="text" maxlength="20" placeholder="${esc(t("Name"))}" autocomplete="off" value="${esc(draft.name)}"></label>
          <div class="fg-tabs" role="tablist">${Object.entries(tabs).map(([k, l]) => `<button role="tab" class="${tab === k ? "picked" : ""}" aria-selected="${tab === k}" data-tab="${k}">${esc(t(l))}</button>`).join("")}</div>
          <div class="fg-panel">${panel()}</div>
        </div>
      </div>
      <div class="fg-bottom">
        ${first ? `<button class="btn ghost" data-do="later">${esc(t("Später"))}</button>` : ""}
        <button class="btn" data-do="save">${esc(t("Fertig"))}</button>
      </div>`;
    mountPreview3d();
  }

  // Gedrehte 3D-Vorschau des Gesichts im Reiter „Gesicht“
  let preview3d = null;
  function mountPreview3d() {
    preview3d?.stop();
    preview3d = null;
    const box = document.querySelector("#figur-root .fg-3d");
    if (!box || !draft.form) return;
    const go = () => {
      if (box.isConnected) preview3d = Preview3D(box, draft);
    };
    if (window.THREE) return go();
    let tag = document.getElementById("hr-three") || document.getElementById("fg-three");
    if (!tag) {
      tag = document.createElement("script");
      tag.id = "fg-three";
      tag.src = "vendor/three.min.js";
      document.head.appendChild(tag);
    }
    tag.addEventListener("load", go);
  }

  function Preview3D(box, L) {
    const THREE = window.THREE;
    const canvas = box.querySelector("canvas");
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(30, 1, 1, 200);
    cam.position.set(0, 0.5, 78);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x554433, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(8, 10, 20);
    scene.add(sun);
    const head = new THREE.Group();
    scene.add(head);
    // Kopf als Ellipsoid in Hautfarbe, das Gesicht liegt vorne drauf und nie darin
    const R = [8.2, 11, 9.6];
    const cy = 0.6;
    const cz = -1.4;
    const skin = new THREE.MeshStandardMaterial({ color: L.haut || "#e0b090", roughness: 0.7 });
    const skull = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 36), skin);
    skull.scale.set(...R);
    skull.position.set(0, cy, cz);
    head.add(skull);
    const geo = Gesicht3D.geometry(THREE, L.form, (i, x, y, z) => {
      const dx = x / R[0];
      const dy = (y - cy) / R[1];
      const dz = (z - cz) / R[2];
      const d = Math.hypot(dx, dy, dz) || 1;
      const k = d < 1.01 ? 1.01 / d : 1;
      return [x * k, cy + (y - cy) * k, cz + (z - cz) * k];
    });
    const face = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: Gesicht3D.texture(THREE, L.formFoto || L.formFotoKlein), vertexColors: true, transparent: true, roughness: 0.65 }));
    head.add(face);
    let yaw = 0;
    let drag = null;
    let auto = true;
    canvas.onpointerdown = (e) => {
      drag = e.clientX;
      auto = false;
      canvas.setPointerCapture(e.pointerId);
    };
    canvas.onpointermove = (e) => {
      if (drag == null) return;
      yaw += (e.clientX - drag) * 0.012;
      yaw = Math.max(-1.6, Math.min(1.6, yaw));
      drag = e.clientX;
    };
    canvas.onpointerup = canvas.onpointercancel = () => (drag = null);
    let raf = 0;
    const t0 = performance.now();
    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      if (!canvas.isConnected) return stop();
      const r = canvas.getBoundingClientRect();
      if (canvas.width !== Math.round(r.width * renderer.getPixelRatio())) {
        renderer.setSize(r.width, r.height, false);
        cam.aspect = r.width / r.height;
        cam.updateProjectionMatrix();
      }
      if (auto) yaw = Math.sin((now - t0) / 1400) * 0.75;
      head.rotation.y = yaw;
      renderer.render(scene, cam);
    };
    raf = requestAnimationFrame(frame);
    function stop() {
      cancelAnimationFrame(raf);
      renderer.dispose();
    }
    return { stop };
  }

  function refreshPreview() {
    const p = document.querySelector("#figur-root .fg-preview");
    if (p) p.innerHTML = full(draft);
  }

  function finish(saveIt) {
    if (saveIt) {
      const name = ($("figur-name")?.value ?? draft.name).trim().slice(0, 20);
      if (!name) {
        $("figur-name").focus();
        $("figur-name").classList.add("bad");
        return;
      }
      draft.name = name;
      mine = clean(draft);
      store();
      try {
        window.dispatchEvent(new CustomEvent("figur-change", { detail: wire() }));
      } catch {
        // egal
      }
    } else {
      try {
        localStorage.setItem(LATER_KEY, "1");
      } catch {
        // egal
      }
    }
    const done = onDone;
    onDone = null;
    first = false;
    renderMenuButton();
    if (done) done();
    else showScreen("menu");
  }

  function wireEditor() {
    const root = $("figur-root");
    root.addEventListener("click", (e) => {
      const b = e.target.closest("button, [data-do]");
      if (!b || !root.contains(b)) return;
      if (b.dataset.tab) {
        draft.name = $("figur-name").value;
        tab = b.dataset.tab;
        render();
        return;
      }
      if (b.dataset.set) {
        draft.name = $("figur-name").value;
        const field = b.dataset.set;
        draft[field] = JSON.parse(b.dataset.val.startsWith("#") ? JSON.stringify(b.dataset.val) : b.dataset.val);
        if (field === "brille" && draft.brille) draft.sonnenbrille = false;
        if (field === "sonnenbrille" && draft.sonnenbrille) draft.brille = false;
        const y = root.querySelector(".fg-panel")?.scrollTop ?? 0;
        const sy = window.scrollY;
        render();
        root.querySelector(".fg-panel").scrollTop = y;
        window.scrollTo(0, sy);
        return;
      }
      switch (b.dataset.do) {
        case "dice": {
          const keep = { name: $("figur-name").value, foto: draft.foto, fotoKlein: draft.fotoKlein };
          draft = { ...randomLook(`${Date.now()}-${Math.random()}`), ...keep };
          if (keep.foto) draft.bart = false;
          refreshPreview();
          const y = root.querySelector(".fg-panel").scrollTop;
          render();
          root.querySelector(".fg-panel").scrollTop = y;
          break;
        }
        case "scan":
          draft.name = $("figur-name").value;
          Scan.camera();
          break;
        case "nofoto":
          draft.name = $("figur-name").value;
          for (const k of ["foto", "fotoKlein", "form", "formFoto", "formFotoKlein"]) delete draft[k];
          render();
          break;
        case "save":
          finish(true);
          break;
        case "later":
          finish(false);
          break;
      }
    });
    root.addEventListener("input", (e) => {
      const r = e.target.dataset?.range;
      if (r) {
        draft[r] = Number(e.target.value);
        if (r === "groesse") e.target.nextElementSibling.textContent = `${draft.groesse.toFixed(2).replace(".", ",")} m`;
        refreshPreview();
      }
      if (e.target.id === "figur-name") e.target.classList.remove("bad");
    });
    root.addEventListener("change", (e) => {
      if (e.target.dataset?.do === "file" && e.target.files?.[0]) {
        draft.name = $("figur-name").value;
        Scan.file(e.target.files[0]);
        e.target.value = "";
      }
    });
    $("figur-back").onclick = () => (first ? finish(false) : (onDone ? finish(false) : showScreen("menu")));
  }

  // Foto fertig zugeschnitten: aufs Gesicht, Hautfarbe aus den Wangen
  function setPhoto(big, small, skin, form) {
    draft.foto = big;
    draft.fotoKlein = small;
    for (const k of ["form", "formFoto", "formFotoKlein", "zug"]) delete draft[k];
    if (form) {
      const { farben, ...rest } = form;
      Object.assign(draft, rest);
      draft.stil ??= "3d";
      // Haar- und Augenfarbe aus dem Foto: die nächste Farbe aus der Auswahl
      if (farben?.haare) draft.haare = nearest(farben.haare, HAIRS.slice(0, 10));
      if (farben?.augen) draft.augen = nearest(farben.augen, IRIS);
    }
    if (skin) draft.haut = skin;
    draft.bart = false;
    if (form) draft.brille = draft.sonnenbrille = false; // eine echte Brille ist schon im Foto
    tab = "gesicht";
    render();
    showScreen("figur");
  }

  function nearest(hex, list) {
    const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const a = rgb(hex);
    let best = list[0];
    let bd = Infinity;
    for (const c of list) {
      const b = rgb(c);
      const d = (a[0] - b[0]) ** 2 * 0.3 + (a[1] - b[1]) ** 2 * 0.59 + (a[2] - b[2]) ** 2 * 0.11;
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    return best;
  }

  // --- Gesicht scannen: Kamera (Selfie) oder Foto, dann zurechtschieben ---

  const Scan = (() => {
    const W = 112; // Größe des fertigen Gesichts (Seitenverhältnis wie das Oval)
    const Hh = 128;
    let stream = null;
    let img = null; // Quelle zum Zuschneiden (Canvas)
    let view = { s: 1, x: 0, y: 0 };

    function overlay() {
      let el = $("figur-scan");
      if (el) return el;
      el = document.createElement("div");
      el.id = "figur-scan";
      el.className = "fg-scan";
      el.hidden = true;
      document.body.appendChild(el);
      return el;
    }

    function ovalSvg() {
      return `<svg class="fg-oval" viewBox="0 0 100 114" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <defs><mask id="fg-hole"><rect x="-200" y="-200" width="500" height="514" fill="#fff"/><ellipse cx="50" cy="57" rx="35" ry="40" fill="#000"/></mask></defs>
        <rect x="-200" y="-200" width="500" height="514" fill="rgb(0 0 0 / 0.55)" mask="url(#fg-hole)"/>
        <ellipse cx="50" cy="57" rx="35" ry="40" fill="none" stroke="#fff" stroke-width="0.8" stroke-dasharray="2 1.5"/>
        <path d="M28 43.4H43M57 43.4H72" stroke="#ffd34d" stroke-width="0.7" opacity="0.9"/>
        <path d="M42 78.6H58" stroke="#ffd34d" stroke-width="0.7" opacity="0.9"/>
      </svg>`;
    }

    function close() {
      stream?.getTracks().forEach((tr) => tr.stop());
      stream = null;
      overlay().hidden = true;
      overlay().innerHTML = "";
    }

    async function camera() {
      const el = overlay();
      el.innerHTML = `
        <div class="fg-scan-box">
          <p class="fg-scan-title">${esc(t("Gesicht ins Oval, Augen auf die gelben Striche, Mund auf den unteren."))}</p>
          <div class="fg-scan-stage"><video playsinline muted autoplay></video>${ovalSvg()}</div>
          <p class="fg-scan-msg" hidden></p>
          <div class="fg-scan-btns">
            <button class="btn ghost" data-scan="cancel">${esc(t("Abbrechen"))}</button>
            <button class="btn" data-scan="shot" disabled>📸 ${esc(t("Foto machen"))}</button>
          </div>
        </div>`;
      el.hidden = false;
      el.querySelector('[data-scan="cancel"]').onclick = close;
      window.Gesicht3D?.preload(); // Gesichtserkennung schon mal laden, während man sich ins Oval setzt
      const video = el.querySelector("video");
      const msg = el.querySelector(".fg-scan-msg");
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("none");
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 1280 } }, audio: false });
        if (el.hidden) return close();
        video.srcObject = stream;
        await video.play().catch(() => {});
        const shot = el.querySelector('[data-scan="shot"]');
        shot.disabled = false;
        shot.onclick = () => {
          if (!video.videoWidth) return;
          // Wie in der Vorschau: gespiegelt, so wie man sich im Spiegel kennt
          const c = document.createElement("canvas");
          c.width = video.videoWidth;
          c.height = video.videoHeight;
          const g = c.getContext("2d");
          g.translate(c.width, 0);
          g.scale(-1, 1);
          g.drawImage(video, 0, 0);
          stream.getTracks().forEach((tr) => tr.stop());
          stream = null;
          process(c);
        };
      } catch {
        msg.hidden = false;
        msg.innerHTML = `${esc(t("Die Kamera geht hier nicht (keine Erlaubnis?). Nimm stattdessen ein Foto:"))}<label class="btn fg-file">🖼️ ${esc(t("Foto wählen"))}<input type="file" accept="image/*" capture="user" hidden></label>`;
        msg.querySelector("input").onchange = (e) => e.target.files?.[0] && file(e.target.files[0]);
      }
    }

    function file(f) {
      const url = URL.createObjectURL(f);
      const im = new Image();
      im.onload = () => {
        const max = 1600;
        const k = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight));
        const c = document.createElement("canvas");
        c.width = Math.round(im.naturalWidth * k);
        c.height = Math.round(im.naturalHeight * k);
        c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        process(c);
      };
      im.onerror = () => URL.revokeObjectURL(url);
      im.src = url;
    }

    // Bild verschieben und zoomen, bis das Gesicht im Oval sitzt
    function adjust(canvas) {
      img = canvas;
      const el = overlay();
      el.innerHTML = `
        <div class="fg-scan-box">
          <p class="fg-scan-title">${esc(t("Schieb und zoom das Bild, bis dein Gesicht genau im Oval sitzt."))}</p>
          <div class="fg-scan-stage"><canvas></canvas>${ovalSvg()}</div>
          <label class="fg-range fg-zoom"><span>−</span><input type="range" min="1" max="4" step="0.01" value="1"><span>+</span></label>
          <div class="fg-scan-btns">
            <button class="btn ghost" data-scan="again">${esc(t("Nochmal"))}</button>
            <button class="btn" data-scan="ok">✓ ${esc(t("Übernehmen"))}</button>
          </div>
        </div>`;
      const stage = el.querySelector(".fg-scan-stage");
      const cv = stage.querySelector("canvas");
      const zoom = el.querySelector(".fg-zoom input");
      const size = () => stage.getBoundingClientRect();
      const base = () => {
        const r = size();
        return Math.max(r.width / img.width, r.height / img.height); // wie object-fit: cover
      };
      view = { s: 1, x: 0, y: 0 };
      const draw = () => {
        const r = size();
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        cv.width = Math.round(r.width * dpr);
        cv.height = Math.round(r.height * dpr);
        const g = cv.getContext("2d");
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.fillStyle = "#000";
        g.fillRect(0, 0, r.width, r.height);
        const k = base() * view.s;
        g.drawImage(img, r.width / 2 + view.x - (img.width * k) / 2, r.height / 2 + view.y - (img.height * k) / 2, img.width * k, img.height * k);
      };
      requestAnimationFrame(draw);
      zoom.oninput = () => {
        view.s = Number(zoom.value);
        draw();
      };
      // Ziehen mit einem Finger, Zoomen mit zwei
      const pts = new Map();
      let pinch = null;
      stage.onpointerdown = (e) => {
        stage.setPointerCapture(e.pointerId);
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pts.size === 2) {
          const [a, b] = [...pts.values()];
          pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), s: view.s };
        }
      };
      stage.onpointermove = (e) => {
        const p = pts.get(e.pointerId);
        if (!p) return;
        if (pts.size === 1) {
          view.x += e.clientX - p.x;
          view.y += e.clientY - p.y;
        }
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pts.size === 2 && pinch) {
          const [a, b] = [...pts.values()];
          view.s = Math.min(4, Math.max(1, (pinch.s * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.d));
          zoom.value = view.s;
        }
        draw();
      };
      stage.onpointerup = stage.onpointercancel = (e) => {
        pts.delete(e.pointerId);
        if (pts.size < 2) pinch = null;
      };
      stage.onwheel = (e) => {
        e.preventDefault();
        view.s = Math.min(4, Math.max(1, view.s * (e.deltaY < 0 ? 1.08 : 1 / 1.08)));
        zoom.value = view.s;
        draw();
      };
      el.querySelector('[data-scan="again"]').onclick = () => camera();
      el.querySelector('[data-scan="ok"]').onclick = () => {
        const r = size();
        const k = base() * view.s;
        // Oval in der Bühne (viewBox 100×114, mittig eingepasst) → Bildpunkte
        const vb = Math.min(r.width / 100, r.height / 114);
        const ox = r.width / 2 + (50 - 35 - 50) * vb;
        const oy = r.height / 2 + (57 - 40 - 57) * vb;
        const ow = 70 * vb;
        const oh = 80 * vb;
        const ix = (px) => (px - (r.width / 2 + view.x)) / k + img.width / 2;
        const iy = (py) => (py - (r.height / 2 + view.y)) / k + img.height / 2;
        const sx = ix(ox);
        const sy = iy(oy);
        const sw = ow / k;
        const shh = oh / k;
        const flat = flatPhoto(img, sx, sy, sw, shh);
        close();
        setPhoto(flat.big, flat.small, flat.skin, null);
      };
    }

    // Flaches Foto fürs runde Bildchen: Ausschnitt (sx, sy, sw, sh) des Bildes
    function flatPhoto(src, sx, sy, sw, sh) {
      const out = (w, h, q) => {
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        const g = c.getContext("2d");
        g.fillStyle = "#c8a080";
        g.fillRect(0, 0, w, h);
        g.drawImage(src, sx, sy, sw, sh, 0, 0, w, h);
        return { url: c.toDataURL("image/jpeg", q), c };
      };
      const big = out(W * 2, Hh * 2, 0.82);
      const small = out(W / 2, Hh / 2, 0.7);
      return { big: big.url, small: small.url, skin: cheekColor(big.c) };
    }

    // Foto da: Gesicht suchen, 3D-Gesicht bauen und das Bildchen selbst zuschneiden.
    // Wird kein Gesicht gefunden, schiebt man das Foto von Hand ins Oval (dann nur flach).
    function process(canvas) {
      const el = overlay();
      el.hidden = false;
      el.innerHTML = `<div class="fg-scan-box"><div class="fg-busy"><span class="fg-spin"></span><p>${esc(t("Dein 3D-Gesicht wird gebaut…"))}</p><p class="hint">${esc(t("Beim ersten Mal lädt die Gesichtserkennung, das kann ein paar Sekunden dauern."))}</p></div></div>`;
      setTimeout(async () => {
        let res = null;
        try {
          res = window.Gesicht3D ? await Gesicht3D.fromImage(canvas) : null;
        } catch (err) {
          console.warn("3D-Gesicht", err);
        }
        if (overlay().hidden) return;
        if (!res) {
          adjust(canvas);
          const title = overlay().querySelector(".fg-scan-title");
          if (title) title.textContent = t("Kein Gesicht erkannt. Schieb das Foto von Hand ins Oval, dann kommt es flach aufs Gesicht.");
          return;
        }
        const { crop, ...form } = res;
        const flat = flatPhoto(canvas, crop.x, crop.y, crop.w, crop.h);
        close();
        setPhoto(flat.big, flat.small, flat.skin, form);
      }, 60);
    }

    // Hautfarbe: Durchschnitt aus beiden Wangen
    function cheekColor(c) {
      try {
        const g = c.getContext("2d");
        let r = 0;
        let gg = 0;
        let b = 0;
        let n = 0;
        for (const fx of [0.24, 0.66]) {
          const d = g.getImageData(Math.round(c.width * fx), Math.round(c.height * 0.56), Math.round(c.width * 0.1), Math.round(c.height * 0.1)).data;
          for (let i = 0; i < d.length; i += 4) {
            r += d[i];
            gg += d[i + 1];
            b += d[i + 2];
            n++;
          }
        }
        if (!n) return null;
        const hex = (v) => Math.round(v / n).toString(16).padStart(2, "0");
        return `#${hex(r)}${hex(gg)}${hex(b)}`;
      } catch {
        return null;
      }
    }

    return { camera, file, close };
  })();

  // --- Menü: eigene Figur oben, Antippen öffnet den Editor ---

  function renderMenuButton() {
    const btn = $("figur-btn");
    if (!btn) return;
    btn.innerHTML = mine
      ? `<span class="fav">${bust(mine)}</span><span class="fb-name">${esc(mine.name)}</span>`
      : `<span class="fav empty">＋</span><span class="fb-name">${esc(t("Charakter"))}</span>`;
    btn.setAttribute("aria-label", t("Dein Charakter"));
  }

  function boot() {
    wireEditor();
    renderMenuButton();
    $("figur-btn").onclick = () => (window.Profil?.open ? window.Profil.open() : edit());
    // Erster Start: gleich den Charakter erstellen (nicht, wenn man per Link in einen Raum kommt)
    let later = false;
    try {
      later = localStorage.getItem(LATER_KEY) === "1";
    } catch {
      // egal
    }
    const joining = new URLSearchParams(location.search).has("raum");
    if (!mine && !later && !joining) edit({ first: true });
  }

  return {
    boot,
    edit,
    person,
    lookFor,
    avatar,
    avatarFor,
    wire,
    setRoom,
    renderMenuButton,
    get mine() {
      return mine;
    },
  };
})();
window.Figur = Figur;
