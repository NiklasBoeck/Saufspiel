// Echt-Look: gemalte Texturen ohne Bilddateien (Rauschen, Holz, Kies, Blätter) und Laub aus Blattkarten.
// Wird von den 3D-Spielen benutzt (Hodenritter, Flaschendrehen, Kistenturm). Braucht three.js erst beim Aufruf.
window.EchtTex = (() => {
  "use strict";
  const TAU = Math.PI * 2;

  function seeded(seed) {
    let s = seed >>> 0 || 1;
    return () => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  // kachelbares Wertrauschen, Werte 0..1. cx/cy: Zellen in x/y bei der gröbsten Stufe
  function fbm(w, h, cx, cy, oct, rnd) {
    const out = new Float32Array(w * h);
    let amp = 1;
    let tot = 0;
    for (let o = 0; o < oct; o++) {
      const nx = Math.max(1, Math.round(cx * 2 ** o));
      const ny = Math.max(1, Math.round(cy * 2 ** o));
      const grid = new Float32Array(nx * ny);
      for (let i = 0; i < grid.length; i++) grid[i] = rnd();
      for (let y = 0; y < h; y++) {
        const fy = (y / h) * ny;
        const y0 = Math.floor(fy);
        let ty = fy - y0;
        ty = ty * ty * (3 - 2 * ty);
        const r0 = (y0 % ny) * nx;
        const r1 = ((y0 + 1) % ny) * nx;
        for (let x = 0; x < w; x++) {
          const fx = (x / w) * nx;
          const x0 = Math.floor(fx);
          let tx = fx - x0;
          tx = tx * tx * (3 - 2 * tx);
          const x1 = (x0 + 1) % nx;
          const a = grid[r0 + x0] + (grid[r0 + x1] - grid[r0 + x0]) * tx;
          const b = grid[r1 + x0] + (grid[r1 + x1] - grid[r1 + x0]) * tx;
          out[y * w + x] += (a + (b - a) * ty) * amp;
        }
      }
      tot += amp;
      amp *= 0.5;
    }
    for (let i = 0; i < out.length; i++) out[i] /= tot;
    return out;
  }

  // Bild aus einer Funktion je Pixel: px(x, y, i) → [r, g, b] (0..255)
  function paintPx(w, h, px) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const g = c.getContext("2d");
    const img = g.createImageData(w, h);
    const d = img.data;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const [r, gg, b] = px(x, y, i);
        d[i * 4] = r;
        d[i * 4 + 1] = gg;
        d[i * 4 + 2] = b;
        d[i * 4 + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  // Normal-Map aus einer Höhe (Float32Array 0..1, kachelbar)
  function normalFrom(hgt, w, h, strength) {
    return paintPx(w, h, (x, y, i) => {
      const l = hgt[y * w + ((x - 1 + w) % w)];
      const r = hgt[y * w + ((x + 1) % w)];
      const u = hgt[((y - 1 + h) % h) * w + x];
      const dn = hgt[((y + 1) % h) * w + x];
      const nx = (l - r) * strength;
      const ny = (dn - u) * strength;
      const len = Math.hypot(nx, ny, 1);
      return [(nx / len) * 127.5 + 127.5, (ny / len) * 127.5 + 127.5, (1 / len) * 127.5 + 127.5];
    });
  }

  const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const sstep = (a, b, x) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };

  // Ein Blatt als Pixel in einen RGBA-Puffer stempeln (Float32, 0..255): Spitze in Richtung a, Länge L.
  // Mittelrippe heller, Rand etwas dunkler; wrap: an den Kanten der Kachel weiterzeichnen. h: Höhe für die Normal-Map
  function stampLeaf(buf, S, wrap, x, y, a, L, c, hgt, hv) {
    const W = L * 0.42;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const R = Math.ceil(L) + 1;
    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        const u = dx * ca + dy * sa; // entlang des Blatts
        const v = -dx * sa + dy * ca; // quer
        if (u < 0 || u > L) continue;
        const half = W * Math.sin((Math.PI * u) / L) * (1 - (u / L) * 0.25);
        const av = Math.abs(v);
        if (av > half) continue;
        let px = Math.round(x + dx);
        let py = Math.round(y + dy);
        if (wrap) {
          px = ((px % S) + S) % S;
          py = ((py % S) + S) % S;
        } else if (px < 0 || py < 0 || px >= S || py >= S) continue;
        const i = py * S + px;
        const edge = av / Math.max(half, 0.01);
        const sh = (1.08 - edge * 0.28) * (av < 0.6 ? 1.15 : 1) * (0.85 + (u / L) * 0.2);
        const aa = Math.min(1, (half - av) * 1.5); // weiche Kante
        const o = i * 4;
        buf[o] += (c[0] * sh - buf[o]) * aa;
        buf[o + 1] += (c[1] * sh - buf[o + 1]) * aa;
        buf[o + 2] += (c[2] * sh - buf[o + 2]) * aa;
        buf[o + 3] += (255 - buf[o + 3]) * aa;
        if (hgt) hgt[i] += (hv * (1 - edge * 0.4) - hgt[i]) * aa;
      }
    }
  }
  function leafColor(rnd, light) {
    const c = new THREE.Color().setHSL((78 + rnd() * 34) / 360, (32 + rnd() * 26) / 100, ((light ? 26 : 14) + rnd() * (light ? 22 : 14)) / 100, THREE.LinearSRGBColorSpace);
    return [c.r * 255, c.g * 255, c.b * 255];
  }
  function canvasRGBA(buf, S) {
    const c = document.createElement("canvas");
    c.width = c.height = S;
    const g = c.getContext("2d");
    const img = g.createImageData(S, S);
    img.data.set(buf);
    g.putImageData(img, 0, 0);
    return c;
  }

  // Canvas → three.js-Textur (color: Farbbild in sRGB, sonst Daten wie Normal-Map)
  function texture(c, { color = true, repeat = null, aniso = 4 } = {}) {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (repeat) t.repeat.set(repeat[0], repeat[1]);
    t.anisotropy = aniso;
    return t;
  }

  // Holz: Bretter (rows) mit Maserung längs, Ringen, Ästen, dunklen Fugen und versetzten Stößen.
  // tones: [dunkel, hell] als [r, g, b]. Gibt { color, height } (Canvas und Float32Array) zurück.
  function wood({ w = 512, h = 256, rows = 8, tones = [[134, 92, 58], [178, 132, 88]], seed = 3, gap = 1.2, joints = true } = {}) {
    const rnd = seeded(seed);
    const grain = fbm(w, h, 2, 64, 4, rnd);
    const knots = fbm(w, h, 6, 3, 2, rnd);
    const ph = h / rows;
    const tone = [];
    const joint = [];
    for (let r = 0; r < rows; r++) {
      tone.push(mixc(tones[0], tones[1], rnd()));
      joint.push(rnd() * w);
    }
    const k = w / 512;
    const hgt = new Float32Array(w * h);
    const color = paintPx(w, h, (x, y, i) => {
      const r = Math.min(rows - 1, Math.floor(y / ph));
      const yy = y - r * ph;
      const gv = grain[i];
      const ring = Math.sin(gv * 30 + yy * 0.08 + r * 2) * 0.5 + 0.5;
      let f = 0.78 + gv * 0.32 + ring * 0.08 - sstep(0.7, 0.9, knots[i]) * 0.12;
      let hh = 0.6 + gv * 0.25 + ring * 0.05;
      const edge = Math.min(yy, ph - 1 - yy);
      const jd = joints ? Math.abs(((x - joint[r] + w * 1.5) % w) - w / 2) : 1e9;
      if (edge < gap * k || jd < 0.8 * k) {
        f = 0.28;
        hh = 0.05;
      } else if (edge < (gap + 1.8) * k) {
        f *= 0.9;
        hh *= 0.8;
      }
      hgt[i] = hh;
      const t = tone[r];
      return [t[0] * f, t[1] * f, t[2] * f];
    });
    return { color, height: hgt, w, h };
  }

  // Kies / Sand im Biergarten: viele kleine runde Steinchen in Grau- und Beigetönen
  function gravel({ size = 512, seed = 11, base = [150, 132, 104], stones = 1 } = {}) {
    const rnd = seeded(seed);
    const S = size;
    const f = fbm(S, S, 6, 6, 4, rnd);
    const col = new Float32Array(S * S * 3);
    const hgt = new Float32Array(S * S);
    for (let i = 0; i < S * S; i++) {
      const v = 0.8 + f[i] * 0.3 + (rnd() - 0.5) * 0.12;
      col[i * 3] = base[0] * v;
      col[i * 3 + 1] = base[1] * v;
      col[i * 3 + 2] = base[2] * v;
      hgt[i] = 0.2 + f[i] * 0.1;
    }
    const n = Math.round(((S * S) / 70) * stones);
    const k = S / 512;
    for (let s = 0; s < n; s++) {
      const x = rnd() * S;
      const y = rnd() * S;
      const r = (1.2 + rnd() * rnd() * 4.5) * k;
      const t = rnd();
      const c = t < 0.4 ? mixc([110, 104, 96], [190, 182, 168], rnd()) : t < 0.8 ? mixc([140, 118, 88], [214, 192, 156], rnd()) : mixc([90, 80, 70], [130, 112, 92], rnd());
      const ex = 0.7 + rnd() * 0.6;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r * ex; dx <= r * ex; dx++) {
          const d = (dx / ex) * (dx / ex) + dy * dy;
          if (d > r * r) continue;
          const px = (((Math.round(x + dx)) % S) + S) % S;
          const py = (((Math.round(y + dy)) % S) + S) % S;
          const i = py * S + px;
          const dome = Math.sqrt(1 - d / (r * r));
          const light = 0.75 + 0.35 * dome - (dy / r) * 0.15; // oben heller
          col[i * 3] = c[0] * light;
          col[i * 3 + 1] = c[1] * light;
          col[i * 3 + 2] = c[2] * light;
          hgt[i] = 0.3 + dome * 0.7 * Math.min(1, r / (3 * k));
        }
      }
    }
    const color = paintPx(S, S, (x, y, i) => [col[i * 3], col[i * 3 + 1], col[i * 3 + 2]]);
    return { color, height: hgt, w: S, h: S };
  }

  // Blätterzweig (durchsichtig) für Blattkarten
  function leafAtlas(S, seed = 77) {
    const rnd = seeded(seed);
    const buf = new Float32Array(S * S * 4);
    for (let i = 0; i < S * S; i++) buf.set([52, 72, 30, 0], i * 4);
    for (let i = 0; i < 6; i++) {
      const a = rnd() * TAU;
      for (let t = 0; t < S * 0.4; t += 0.5) {
        const px = Math.round(S / 2 + Math.cos(a) * t);
        const py = Math.round(S / 2 + Math.sin(a) * t);
        buf.set([70, 52, 34, 230], (py * S + px) * 4);
      }
    }
    const n = 230;
    for (let i = 0; i < n; i++) {
      const light = i > n * 0.45;
      const r = Math.sqrt(rnd()) * S * 0.4;
      const a = rnd() * TAU;
      stampLeaf(buf, S, false, S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r, a + (rnd() - 0.5) * 1.2, S * (0.06 + rnd() * 0.05), leafColor(rnd, light));
    }
    return canvasRGBA(new Uint8ClampedArray(buf), S);
  }

  // Laub aus Blattkarten. cards: [{ p, c, s, col }]: Mitte, Punkt von dem die Normale wegzeigt, Größe, Farbe
  function foliageGeo(cards, rnd) {
    const n = cards.length;
    const pos = new Float32Array(n * 12);
    const nor = new Float32Array(n * 12);
    const uv = new Float32Array(n * 8);
    const col = new Float32Array(n * 12);
    const idx = new Uint32Array(n * 6);
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const v = new THREE.Vector3();
    const nv = new THREE.Vector3();
    const C = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
    cards.forEach((cd, k) => {
      q.setFromEuler(e.set(rnd() * TAU, rnd() * TAU, rnd() * TAU));
      for (let j = 0; j < 4; j++) {
        v.set(C[j][0] * cd.s, C[j][1] * cd.s, 0).applyQuaternion(q).add(cd.p);
        pos.set([v.x, v.y, v.z], (k * 4 + j) * 3);
        nv.copy(v).sub(cd.c).normalize();
        nv.y += 0.25;
        nv.normalize();
        nor.set([nv.x, nv.y, nv.z], (k * 4 + j) * 3);
        uv.set([C[j][0] + 0.5, C[j][1] + 0.5], (k * 4 + j) * 2);
        const sh = 0.72 + 0.38 * Math.max(0, Math.min(1, nv.y * 0.5 + 0.5));
        col.set([cd.col.r * sh, cd.col.g * sh, cd.col.b * sh], (k * 4 + j) * 3);
      }
      idx.set([k * 4, k * 4 + 1, k * 4 + 2, k * 4, k * 4 + 2, k * 4 + 3], k * 6);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    return g;
  }

  // Karten für eine Krone um c mit den Halbachsen r = [rx, ry, rz]
  function clumpCards(cards, rnd, c, r, n, s, tint) {
    for (let i = 0; i < n; i++) {
      const u = rnd() * 2 - 1;
      const a = rnd() * TAU;
      const sq = Math.sqrt(1 - u * u);
      const d = 0.45 + 0.55 * Math.sqrt(rnd());
      const p = new THREE.Vector3(c.x + Math.cos(a) * sq * r[0] * d, c.y + u * r[1] * d, c.z + Math.sin(a) * sq * r[2] * d);
      cards.push({ p, c, s: s * (0.8 + rnd() * 0.4), col: tint.clone().multiplyScalar(0.8 + rnd() * 0.35) });
    }
  }

  // Material fürs Laub: Rückseiten nicht umdrehen (Normale zeigt aus der Krone), Sonne scheint durch die Blätter
  function foliageMaterial(map, sunDir) {
    const m = new THREE.MeshStandardMaterial({ map, alphaTest: 0.42, side: THREE.DoubleSide, vertexColors: true, roughness: 0.82 });
    m.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace("#include <normal_fragment_begin>", THREE.ShaderChunk.normal_fragment_begin.replace(/normal \*= faceDirection;/g, ""));
      if (sunDir)
        sh.fragmentShader = sh.fragmentShader.replace(
          "#include <opaque_fragment>",
          `outgoingLight += diffuseColor.rgb * vec3(0.55, 0.62, 0.18) * pow(saturate(dot(normalize(vViewPosition), normalize((viewMatrix * vec4(${sunDir.x.toFixed(3)}, ${sunDir.y.toFixed(3)}, ${sunDir.z.toFixed(3)}, 0.0)).xyz))), 4.0) * 0.6;\n#include <opaque_fragment>`
        );
    };
    return m;
  }

  // Weicher runder Schatten (Bild für eine Fläche am Boden)
  function blobCanvas(size = 64) {
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const g = c.getContext("2d");
    const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gr.addColorStop(0, "rgba(0,0,0,1)");
    gr.addColorStop(0.45, "rgba(0,0,0,0.6)");
    gr.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, size, size);
    return c;
  }

  return { seeded, fbm, paintPx, normalFrom, mixc, sstep, stampLeaf, leafColor, canvasRGBA, texture, wood, gravel, leafAtlas, foliageGeo, clumpCards, foliageMaterial, blobCanvas };
})();
