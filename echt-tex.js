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

  // Rasen: Farbflecken in mehreren Größen, darüber Zehntausende kurze Halme in vielen Grüntönen, ein paar trockene Stellen.
  // Die Halme werden direkt in Pixel-Puffer gezeichnet (Canvas-Linien wären auf dem Handy viel zu langsam).
  function lawn(S, rnd = seeded(99)) {
    const base = fbm(S, S, 4, 4, 5, rnd);
    const dry = fbm(S, S, 3, 3, 4, rnd);
    const k = S / 512;
    const col = new Float32Array(S * S * 3);
    const hgt = new Float32Array(S * S);
    for (let i = 0; i < S * S; i++) {
      let c = mixc([46, 74, 26], [92, 124, 44], base[i]);
      c = mixc(c, [122, 120, 62], sstep(0.58, 0.8, dry[i]) * 0.55);
      const n = (rnd() - 0.5) * 14;
      col[i * 3] = c[0] + n;
      col[i * 3 + 1] = c[1] + n;
      col[i * 3 + 2] = c[2] + n * 0.6;
      hgt[i] = 0.27 + base[i] * 0.12;
    }
    const dot = (x, y, c, a, h) => {
      const i = (((y | 0) % S + S) % S) * S + (((x | 0) % S + S) % S);
      col[i * 3] += (c[0] - col[i * 3]) * a;
      col[i * 3 + 1] += (c[1] - col[i * 3 + 1]) * a;
      col[i * 3 + 2] += (c[2] - col[i * 3 + 2]) * a;
      hgt[i] += (h - hgt[i]) * a;
    };
    const n = Math.round((S * S) / 22);
    for (let i = 0; i < n; i++) {
      const x = rnd() * S;
      const y = rnd() * S;
      const len = (2.5 + rnd() * 6) * k;
      const a = rnd() * TAU;
      const ex = Math.cos(a);
      const ey = Math.sin(a);
      const lt = rnd();
      let c = mixc([38, 66, 22], [128, 160, 64], lt);
      if (rnd() < sstep(0.55, 0.85, dry[(y | 0) * S + (x | 0)]) * 0.6) c = mixc(c, [150, 140, 80], 0.6);
      const al = 0.55 + rnd() * 0.35;
      const h = 0.43 + lt * 0.57;
      const wide = rnd() < 0.5 * k;
      for (let t = 0; t <= len; t += 0.7) {
        const fade = 1 - (t / len) * 0.4; // Spitze heller und dünner
        dot(x + ex * t, y + ey * t, c, al * fade, h * fade);
        if (wide && t < len * 0.6) dot(x + ex * t - ey, y + ey * t + ex, c, al * 0.6, h * 0.9);
      }
    }
    // ein paar Kleeblätter und Erdkrümel
    for (let i = 0; i < 160 * k * k; i++) {
      const x = rnd() * S;
      const y = rnd() * S;
      if (rnd() < 0.35) {
        dot(x, y, [70, 52, 30], 0.55, 0.1);
        continue;
      }
      for (let j = 0; j < 3; j++) {
        const cx = x + Math.cos(j * 2.1) * 2 * k;
        const cy = y + Math.sin(j * 2.1) * 2 * k;
        const r = 1.8 * k;
        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r) dot(cx + dx, cy + dy, [64, 104, 40], 0.85, 0.7);
      }
    }
    const colC = paintPx(S, S, (x, y, i) => [col[i * 3], col[i * 3 + 1], col[i * 3 + 2]]);
    const macro = fbm(128, 128, 3, 3, 4, rnd);
    const macroC = paintPx(128, 128, (x, y, i) => [macro[i] * 255, macro[i] * 255, macro[i] * 255]);
    return { color: colC, normal: normalFrom(hgt, S, S, 3.2 / k), macro: macroC };
  }

  // Rasen-Material: Halm-Textur zweimal in verschiedener Größe, gemischt über großes Rauschen (keine sichtbare Wiederholung).
  // T: { map, normal, macro } als Texturen, rep: Wiederholungen von map/normal auf der Fläche
  function lawnMaterial(T, rep, normalScale = 0.35) {
    for (const t of [T.map, T.normal]) t.repeat.set(rep, rep);
    const m = new THREE.MeshStandardMaterial({ map: T.map, normalMap: T.normal, normalScale: new THREE.Vector2(normalScale, normalScale), roughness: 0.95 });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.macro = { value: T.macro };
      sh.fragmentShader = `uniform sampler2D macro;\n${sh.fragmentShader}`.replace(
        "#include <map_fragment>",
        `vec2 mu = vMapUv / ${rep.toFixed(1)};
        float mA = texture2D(macro, mu * 7.0).r;
        float mB = texture2D(macro, mu * 23.0 + 0.37).r;
        vec4 g1 = texture2D(map, vMapUv);
        vec4 g2 = texture2D(map, vMapUv * 0.29 + vec2(0.31, 0.57));
        vec3 gc = mix(g1.rgb, g2.rgb, smoothstep(0.35, 0.65, mA));
        gc *= mix(0.8, 1.16, mB) * mix(0.9, 1.08, mA);
        gc = mix(gc, gc * vec3(1.12, 1.05, 0.78), smoothstep(0.62, 0.82, mB) * 0.5);
        diffuseColor.rgb *= gc;`
      );
    };
    return m;
  }

  // Sommerhimmel: oben tiefblau, zum Horizont dunstig hell, Sonne mit Hof, Haufenwolken aus Rauschen, die langsam ziehen.
  // time: { value } in Sekunden. Gleiche Farbe wie der Dunst: Fog 0xc6d6e6.
  let cloudCanvas = null;
  function daySky(sunDir, time = { value: 0 }, radius = 200) {
    if (!cloudCanvas) {
      const f = fbm(256, 256, 5, 5, 6, seeded(31));
      cloudCanvas = paintPx(256, 256, (x, y, i) => [f[i] * 255, f[i] * 255, f[i] * 255]);
    }
    const m = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: { sunDir: { value: sunDir }, clouds: { value: texture(cloudCanvas, { color: false, aniso: 1 }) }, time },
      vertexShader: "varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: `varying vec3 vDir; uniform vec3 sunDir; uniform sampler2D clouds; uniform float time;
        void main(){
          vec3 d = normalize(vDir);
          float y = d.y;
          vec3 zen = vec3(0.085, 0.24, 0.62);
          vec3 hor = vec3(0.62, 0.74, 0.86);
          vec3 c = mix(hor, zen, pow(clamp(y, 0.0, 1.0), 0.42));
          if (y < 0.0) c = mix(hor, vec3(0.30, 0.36, 0.30), smoothstep(0.0, -0.25, y));
          float s = max(dot(d, sunDir), 0.0);
          if (y > 0.0) {
            vec2 uv = d.xz / (y + 0.09) * 0.11 + vec2(time * 0.0012, time * 0.0004);
            float n = texture2D(clouds, uv).r;
            float n2 = texture2D(clouds, uv * 3.1 + 0.37).r;
            float dens = n * 0.78 + n2 * 0.22;
            float cov = smoothstep(0.5, 0.7, dens) * smoothstep(0.0, 0.16, y);
            float thick = smoothstep(0.5, 0.86, dens);
            vec3 cc = mix(vec3(1.0, 0.99, 0.96), vec3(0.58, 0.63, 0.70), thick * 0.75);
            cc += vec3(1.0, 0.92, 0.75) * pow(s, 6.0) * (1.0 - thick) * 0.5;
            c = mix(c, mix(cc, hor, smoothstep(0.25, 0.0, y) * 0.6), cov * 0.95);
          }
          c += vec3(1.0, 0.86, 0.62) * (pow(s, 12.0) * 0.22 + pow(s, 120.0) * 0.5);
          c += vec3(1.0, 0.97, 0.9) * smoothstep(0.99955, 0.9997, s) * 8.0;
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 16), m);
    sky.renderOrder = -1;
    return sky;
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

  return { seeded, lawn, lawnMaterial, daySky, fbm, paintPx, normalFrom, mixc, sstep, stampLeaf, leafColor, canvasRGBA, texture, wood, gravel, leafAtlas, foliageGeo, clumpCards, foliageMaterial, blobCanvas };
})();
