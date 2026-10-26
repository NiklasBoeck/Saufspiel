// Hodenritter in 3D (three.js): Garten mit Terrasse, Gartenstühlen, Menschen, Boule-Kugeln und Hindernissen.
// Wird erst geladen, wenn das Spiel startet. Das Canvas bleibt erhalten, wenn die App neu zeichnet;
// mount() hängt es nur wieder ein und übernimmt den neuen Spielstand.
// Koordinaten wie in hodenritter.js: x quer, y nach vorne in den Rasen → three.js (x, Höhe, -y).
window.Hodenritter3D = (() => {
  "use strict";
  const H = window.Hodenritter;
  const P = (x, y, h = 0) => new THREE.Vector3(x, h, -y);
  const TAU = Math.PI * 2;
  // Für automatische Tests ohne Grafikkarte: ?lowgfx oder localStorage hr-lowgfx
  const LOW = /[?&]lowgfx/.test(location.search) || (() => {
    try {
      return !!localStorage.getItem("hr-lowgfx");
    } catch {
      return false;
    }
  })();

  let S = null; // Spielstand
  let ME = null; // eigener Name (null: ein Handy)
  let el = null;
  let gl = null;
  let hud = null;
  let hctx = null;
  let G = null;
  let failed = false;
  let raf = 0;
  let lastNow = 0;

  // --- Einhängen, Spielstand übernehmen ---

  function mount(root, s, me) {
    S = s;
    ME = me;
    if (!el) createDom();
    const spot = root.querySelector(".hr-mount");
    if (spot && el.parentNode !== spot) spot.appendChild(el);
    if (!G && !failed) init();
    if (G) sync();
    if (!raf) raf = requestAnimationFrame(frame);
  }

  function createDom() {
    el = document.createElement("div");
    el.className = "hr-stage";
    gl = document.createElement("canvas");
    hud = document.createElement("canvas");
    hud.className = "hr-hud";
    el.append(gl, hud);
    hctx = hud.getContext("2d");
    hud.addEventListener("pointerdown", onDown);
    hud.addEventListener("pointermove", onMove);
    hud.addEventListener("pointerup", onUp);
    hud.addEventListener("pointercancel", onUp);
  }

  // --- Kugel-Animation ---

  let playing = null; // { a, t0 }
  const seenAnims = new Set();
  let firstSync = true;
  let syncedK = 0;

  function sync() {
    const a = S.anim;
    if (a && !seenAnims.has(a.id)) {
      seenAnims.add(a.id);
      // Wer mitten ins Spiel kommt, bekommt den alten Wurf nicht nochmal gezeigt.
      if (!firstSync && (S.phase === "white" || S.phase === "throw" || S.phase === "result")) {
        playing = { a, t0: performance.now() };
        pendingK = null;
      }
    }
    firstSync = false;
    if (S.k !== syncedK) {
      syncedK = S.k;
      phaseSeen.set(phaseKey(), performance.now());
    }
  }

  function animLeftMs() {
    if (!playing) return 0;
    return Math.max(0, playing.t0 + playing.a.dur * 1000 - performance.now());
  }

  // Spielt noch ein Wurf? Dann warten die Knöpfe (afterRender) und die Bots.
  function holdMs(s) {
    return s.phase === "result" ? animLeftMs() + 600 : 0;
  }

  // Wann der letzte Wurf fertig war (oder sein wird)
  let lastEnd = 0;
  function animEndsAt() {
    if (playing) lastEnd = Date.now() + (playing.t0 + playing.a.dur * 1000 - performance.now());
    return lastEnd;
  }

  // Position einer Kugel während der Animation (oder null, wenn sie nicht animiert wird)
  function animBall(id, t) {
    const a = playing?.a;
    if (!a) return null;
    const r = id === "@w" ? H.W_R : H.B_R;
    if (id === a.ball && t < a.T) {
      const u = t / a.T;
      const x = a.from[0] + (a.land[0] - a.from[0]) * u;
      const y = a.from[1] + (a.land[1] - a.from[1]) * u;
      return { x, y, h: (1 - u) * 0.85 + u * r + a.h * 4 * u * (1 - u), air: true };
    }
    const tr = a.tracks[id];
    if (!tr) return null;
    const f = Math.max(0, (t - a.T) / a.dt);
    const n = tr.length / 2;
    const i = Math.min(n - 1, Math.floor(f));
    const j = Math.min(n - 1, i + 1);
    const k = Math.min(1, f - i);
    return { x: tr[i * 2] + (tr[j * 2] - tr[i * 2]) * k, y: tr[i * 2 + 1] + (tr[j * 2 + 1] - tr[i * 2 + 1]) * k, h: r };
  }

  // --- Hilfen ---

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

  function canvasTex(w, h, paint, repeat) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    paint(c.getContext("2d"), w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    if (repeat) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(repeat[0], repeat[1]);
    }
    return t;
  }

  const matCache = new Map();
  function mat(color, rough = 0.7, extra) {
    const key = `${color}|${rough}|${extra ? JSON.stringify(extra) : ""}`;
    if (!extra && matCache.has(key)) return matCache.get(key);
    const m = new THREE.MeshStandardMaterial({ color, roughness: rough, ...(extra || {}) });
    if (!extra) matCache.set(key, m);
    return m;
  }

  function mesh(geo, material, x = 0, y = 0, z = 0, shadow = true) {
    const m = new THREE.Mesh(geo, material);
    m.position.set(x, y, z);
    m.castShadow = shadow;
    m.receiveShadow = shadow;
    return m;
  }

  // Kind anhängen und zurückgeben (add() gibt den Elternteil zurück)
  function addTo(parent, child) {
    parent.add(child);
    return child;
  }

  // Arm, Bein oder Rumpf als gedrehtes Profil: Gelenk oben bei y = 0, runde Enden, Dicke r über die Länge (t von 0 bis 1).
  // len < 0: wächst nach oben (Rumpf). cap: Rundung der Enden (Standard: halber Radius als Kugel).
  function limbGeo(len, radii, cap) {
    const rAt = (t) => {
      for (let i = 1; i < radii.length; i++) {
        if (t <= radii[i][0]) {
          const [t0, r0] = radii[i - 1];
          const [t1, r1] = radii[i];
          const k = (t - t0) / (t1 - t0 || 1);
          return r0 + (r1 - r0) * (0.5 - Math.cos(k * Math.PI) / 2);
        }
      }
      return radii[radii.length - 1][1];
    };
    const dir = len < 0 ? 1 : -1;
    const L = Math.abs(len);
    const pts = [];
    const r0 = rAt(0);
    const r1 = rAt(1);
    const c0 = cap ?? r0;
    const c1 = cap ?? r1;
    for (let i = 0; i <= 6; i++) {
      const a = (i / 6) * (Math.PI / 2);
      pts.push(new THREE.Vector2(Math.max(1e-4, Math.sin(a) * r0), -dir * Math.cos(a) * c0));
    }
    for (let i = 1; i < 16; i++) {
      const t = i / 16;
      pts.push(new THREE.Vector2(rAt(t), dir * t * L));
    }
    for (let i = 0; i <= 6; i++) {
      const a = Math.PI / 2 + (i / 6) * (Math.PI / 2);
      pts.push(new THREE.Vector2(Math.max(1e-4, Math.sin(a) * r1), dir * L - dir * Math.cos(a) * c1));
    }
    // Lathe braucht Punkte von unten nach oben
    if (dir < 0) pts.reverse();
    const g = new THREE.LatheGeometry(pts, 18);
    g.computeVertexNormals();
    return g;
  }

  const capsule = (r, len, seg = 14) => new THREE.CapsuleGeometry(r, len, 6, seg);
  const sphere = (r, w = 24, h = 16) => new THREE.SphereGeometry(r, w, h);

  // Mehrere Geometrien zu einer zusammenfassen (z. B. ein Stuhl = ein Zeichenaufruf)
  function merge(parts) {
    const list = parts.map(([g, m]) => {
      const ng = g.index ? g.toNonIndexed() : g.clone();
      ng.applyMatrix4(m);
      return ng;
    });
    const count = list.reduce((n, g) => n + g.attributes.position.count, 0);
    const pos = new Float32Array(count * 3);
    const nor = new Float32Array(count * 3);
    let o = 0;
    for (const g of list) {
      pos.set(g.attributes.position.array, o * 3);
      nor.set(g.attributes.normal.array, o * 3);
      o += g.attributes.position.count;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    out.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    return out;
  }

  function M(x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
    return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
  }

  function roundedRect(w, h, r) {
    const s = new THREE.Shape();
    s.moveTo(-w / 2 + r, -h / 2);
    s.lineTo(w / 2 - r, -h / 2);
    s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
    s.lineTo(w / 2, h / 2 - r);
    s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
    s.lineTo(-w / 2 + r, h / 2);
    s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
    s.lineTo(-w / 2, -h / 2 + r);
    s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
    return s;
  }

  function slab(w, h, depth, r, bevel) {
    const g = new THREE.ExtrudeGeometry(roundedRect(w, h, r), { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 6 });
    g.translate(0, 0, -depth / 2);
    return g;
  }

  // --- Szene ---

  const SUN_DIR = new THREE.Vector3(-0.66, 0.5, -0.56).normalize(); // tief stehende Abendsonne links über dem Rasen

  function init() {
    try {
      const renderer = new THREE.WebGLRenderer({ canvas: gl, antialias: true, powerPreference: "high-performance" });
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      renderer.shadowMap.enabled = !LOW;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;

      const scene = new THREE.Scene();
      scene.fog = new THREE.Fog(0xf3cfa6, 30, 95);
      const camera = new THREE.PerspectiveCamera(55, 1, 0.05, 300);

      const sky = makeSky();
      scene.add(sky);
      // Umgebung für Spiegelungen auf den Stahlkugeln
      const envScene = new THREE.Scene();
      envScene.add(makeSky());
      const envGround = new THREE.Mesh(new THREE.CircleGeometry(150, 32), new THREE.MeshBasicMaterial({ color: 0x3d6a2a }));
      envGround.rotation.x = -Math.PI / 2;
      envGround.position.y = -1;
      envScene.add(envGround);
      const pmrem = new THREE.PMREMGenerator(renderer);
      scene.environment = pmrem.fromScene(envScene, 0.02, 0.1, 500).texture;
      scene.environmentIntensity = 0.6;

      scene.add(new THREE.HemisphereLight(0xd6e6ff, 0x8a7a55, 1.05));
      const sun = new THREE.DirectionalLight(0xffd9a8, 3.0);
      sun.position.copy(P(0, 6.5).add(SUN_DIR.clone().multiplyScalar(30)));
      sun.target.position.copy(P(0, 6.5));
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 5, far: 70 });
      sun.shadow.bias = -0.0004;
      sun.shadow.normalBias = 0.025;
      scene.add(sun, sun.target);

      const rnd = seeded(7);
      const timeU = { value: 0 };
      addGround(scene, renderer, rnd);
      addGrass(scene, rnd, timeU);
      addGarden(scene, rnd);

      const whiteBall = mesh(sphere(H.W_R, 28, 20), mat(0xfbfaf5, 0.28), 0, 0, 0);
      const whiteRing = new THREE.Mesh(new THREE.RingGeometry(0.11, 0.14, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false }));
      whiteRing.rotation.x = -Math.PI / 2;
      scene.add(whiteBall, whiteRing);

      const ray = new THREE.Raycaster();
      G = { renderer, scene, camera, sun, timeU, whiteBall, whiteRing, ray, chairs: null, chairCount: 0, people: new Map(), balls: new Map(), obstacles: new Map(), ghost: null, ghostKind: null, cam: null, look: null, size: "" };
    } catch (err) {
      console.error(err);
      failed = true;
      G = null;
    }
  }

  function makeSky() {
    const m = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: { sunDir: { value: SUN_DIR } },
      vertexShader: "varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: `varying vec3 vDir; uniform vec3 sunDir;
        void main(){
          float y = vDir.y;
          vec3 top = vec3(0.20, 0.42, 0.78);
          vec3 mid = vec3(0.55, 0.72, 0.92);
          vec3 hor = vec3(1.0, 0.80, 0.58);
          vec3 c = y > 0.18 ? mix(mid, top, smoothstep(0.18, 0.75, y)) : mix(hor, mid, smoothstep(-0.02, 0.18, y));
          float d = max(dot(normalize(vDir), sunDir), 0.0);
          c += vec3(1.0, 0.75, 0.45) * (pow(d, 12.0) * 0.35 + pow(d, 400.0) * 2.5);
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(200, 32, 16), m);
    sky.renderOrder = -1;
    return sky;
  }

  function paintGrass(g, w, h, rnd, base, n) {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    const greens = ["#3f7f2a", "#4f9334", "#5ea33d", "#467f2c", "#6aad47", "#37702a", "#7bb455"];
    for (let i = 0; i < n; i++) {
      const x = rnd() * w;
      const y = rnd() * h;
      g.strokeStyle = greens[Math.floor(rnd() * greens.length)];
      g.globalAlpha = 0.3 + rnd() * 0.5;
      g.lineWidth = 1 + rnd();
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + (rnd() - 0.5) * 4, y - 3 - rnd() * 6);
      g.stroke();
    }
    // ein paar Kleeblätter und dunklere Stellen
    for (let i = 0; i < n / 60; i++) {
      g.fillStyle = rnd() < 0.5 ? "#2f6a22" : "#6aa83f";
      g.globalAlpha = 0.25;
      g.beginPath();
      g.arc(rnd() * w, rnd() * h, 2 + rnd() * 6, 0, TAU);
      g.fill();
    }
    g.globalAlpha = 1;
  }

  function addGround(scene, renderer, rnd) {
    const aniso = renderer.capabilities.getMaxAnisotropy();
    const grass = canvasTex(512, 512, (g, w, h) => paintGrass(g, w, h, rnd, "#4e8f35", 9000), [70, 70]);
    grass.anisotropy = aniso;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), new THREE.MeshStandardMaterial({ map: grass, roughness: 0.95 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.copy(P(0, 6));
    ground.receiveShadow = true;
    scene.add(ground);

    // Gemähte Streifen auf dem Spielrasen
    const stripes = canvasTex(4, 32, (g, w, h) => {
      for (let i = 0; i < 16; i++) {
        g.fillStyle = i % 2 ? "rgba(215,255,160,0.16)" : "rgba(20,60,10,0.10)";
        g.fillRect(0, (i * h) / 16, w, h / 16);
      }
    });
    stripes.magFilter = THREE.LinearFilter;
    const lawnW = H.FIELD.x * 2 + 0.6;
    const lawn = new THREE.Mesh(
      new THREE.PlaneGeometry(H.FIELD.y1 + 0.6, lawnW),
      new THREE.MeshStandardMaterial({ map: stripes, transparent: true, depthWrite: false, roughness: 0.9 })
    );
    lawn.rotation.x = -Math.PI / 2;
    lawn.rotation.z = Math.PI / 2;
    lawn.position.copy(P(0, H.FIELD.y1 / 2, 0.002));
    lawn.receiveShadow = true;
    scene.add(lawn);
  }

  // Grashalme, die sich im Wind wiegen. Vorne dichter, wo die Kamera nah ist.
  function addGrass(scene, rnd, timeU) {
    const geo = new THREE.PlaneGeometry(0.03, 0.15, 1, 4);
    geo.translate(0, 0.075, 0);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const t = pos.getY(i) / 0.15;
      pos.setX(i, pos.getX(i) * (1 - t * 0.9));
      pos.setZ(i, t * t * 0.035);
    }
    geo.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.85 });
    material.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = timeU;
      sh.vertexShader = `uniform float uTime;\n${sh.vertexShader}`.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        float hh = clamp(position.y / 0.15, 0.0, 1.0);
        vec4 wp = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float sw = sin(uTime * 1.5 + wp.x * 0.8 + wp.z * 0.5) * 0.6 + sin(uTime * 3.1 + wp.x * 2.3 - wp.z) * 0.25;
        transformed.x += sw * 0.035 * hh * hh;`
      );
    };
    const count = LOW || /[?&]fewgrass/.test(location.search) ? 300 : 16000;
    const blades = new THREE.InstancedMesh(geo, material, count);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const col = new THREE.Color();
    const greens = [0x4a8c33, 0x5a9c3c, 0x3f7d2b, 0x66a845, 0x548f36, 0x76b04d];
    for (let i = 0; i < count; i++) {
      const near = i < count * 0.55;
      const x = (rnd() - 0.5) * (near ? 13 : 15);
      const y = near ? -0.1 + rnd() * rnd() * 7 : rnd() * 16.2;
      e.set((rnd() - 0.5) * 0.5, rnd() * TAU, (rnd() - 0.5) * 0.5);
      q.setFromEuler(e);
      const sc = 0.6 + rnd() * 0.8;
      m.compose(P(x, y), q, new THREE.Vector3(sc, sc * (0.7 + rnd() * 0.6), sc));
      blades.setMatrixAt(i, m);
      blades.setColorAt(i, col.set(greens[Math.floor(rnd() * greens.length)]));
    }
    blades.receiveShadow = true;
    scene.add(blades);

    // Gänseblümchen und Löwenzahn
    const flowers = new THREE.InstancedMesh(new THREE.CircleGeometry(0.018, 8), new THREE.MeshStandardMaterial({ roughness: 0.6, side: THREE.DoubleSide }), 700);
    for (let i = 0; i < 700; i++) {
      const x = (rnd() - 0.5) * 14;
      const y = rnd() * 16;
      q.setFromEuler(e.set(-Math.PI / 2 + (rnd() - 0.5) * 0.4, 0, rnd() * TAU));
      m.compose(P(x, y, 0.05 + rnd() * 0.05), q, new THREE.Vector3(1, 1, 1).multiplyScalar(0.7 + rnd() * 0.6));
      flowers.setMatrixAt(i, m);
      flowers.setColorAt(i, col.set(rnd() < 0.75 ? 0xffffff : 0xffd21f));
    }
    scene.add(flowers);
  }

  function addGarden(scene, rnd) {
    // Terrasse aus Holzdielen unter den Stühlen
    const planks = canvasTex(256, 256, (g, w, h) => {
      for (let i = 0; i < 8; i++) {
        const tone = 120 + Math.floor(rnd() * 40);
        g.fillStyle = `rgb(${tone + 40},${tone - 5},${tone - 55})`;
        g.fillRect(0, (i * h) / 8, w, h / 8);
        g.fillStyle = "rgba(60,30,10,0.55)";
        g.fillRect(0, (i * h) / 8, w, 2);
        for (let k = 0; k < 18; k++) {
          g.strokeStyle = `rgba(80,45,15,${0.08 + rnd() * 0.12})`;
          g.beginPath();
          const y = (i * h) / 8 + 3 + rnd() * (h / 8 - 6);
          g.moveTo(0, y);
          g.bezierCurveTo(w * 0.3, y + rnd() * 4 - 2, w * 0.6, y + rnd() * 4 - 2, w, y + rnd() * 2 - 1);
          g.stroke();
        }
        g.fillStyle = "rgba(40,20,5,0.6)";
        g.fillRect(Math.floor(rnd() * w), (i * h) / 8, 2, h / 8);
      }
    }, [5, 2]);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(24, 0.08, 4.2), new THREE.MeshStandardMaterial({ map: planks, roughness: 0.75 }));
    deck.position.copy(P(0, -2.2, -0.035));
    deck.receiveShadow = true;
    scene.add(deck);

    // Haus mit Terrassentür und Fenstern
    const wallTex = canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = "#efe6d6";
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 4000; i++) {
        g.fillStyle = `rgba(${rnd() < 0.5 ? "120,100,80" : "255,255,255"},${rnd() * 0.08})`;
        g.fillRect(rnd() * w, rnd() * h, 2, 2);
      }
    }, [6, 2]);
    const house = new THREE.Group();
    const wall = mesh(new THREE.BoxGeometry(24, 3.4, 0.3), new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.9 }), 0, 1.7, 0);
    house.add(wall);
    const glassM = new THREE.MeshStandardMaterial({ color: 0x1d2a3a, roughness: 0.08, metalness: 0.6 });
    const frameM = mat(0xffffff, 0.5);
    for (const [x, w, h, y] of [[-2.2, 1.8, 2.2, 1.1], [-6.5, 1.2, 1.2, 1.8], [3.2, 1.2, 1.2, 1.8], [7.5, 1.2, 1.2, 1.8]]) {
      house.add(mesh(new THREE.BoxGeometry(w + 0.12, h + 0.12, 0.06), frameM, x, y, 0.16));
      house.add(mesh(new THREE.BoxGeometry(w, h, 0.07), glassM, x, y, 0.17));
      house.add(mesh(new THREE.BoxGeometry(0.05, h, 0.08), frameM, x, y, 0.18));
    }
    const roof = mesh(new THREE.BoxGeometry(24.6, 0.25, 1.6), mat(0x7a3b26, 0.8), 0, 3.5, 0.5);
    roof.rotation.x = 0.35;
    house.add(roof);
    house.position.copy(P(0, -4.45));
    house.rotation.y = 0;
    scene.add(house);

    // Lichterkette über der Terrasse: vom Haus nach vorne zu zwei Masten links und rechts
    const bulbs = [];
    const strand = (a, b, sag, n) => {
      for (let i = 0; i <= n; i++) {
        const u = i / n;
        bulbs.push(a.clone().lerp(b, u).add(new THREE.Vector3(0, -Math.sin(u * Math.PI) * sag, 0)));
      }
    };
    strand(P(-10.5, -0.2, 2.7), P(10.5, -0.2, 2.7), 0.55, 70);
    for (const x of [-7, 0, 7]) strand(P(x, -4.25, 2.9), P(x * 1.2, -0.2, 2.6 - 0.55 * (1 - (x / 10.5) ** 2)), 0.25, 14);
    const bulbMesh = new THREE.InstancedMesh(sphere(0.032, 10, 8), new THREE.MeshStandardMaterial({ color: 0xfff1c1, emissive: 0xffc35a, emissiveIntensity: 2.2 }), bulbs.length);
    bulbs.forEach((p, i) => bulbMesh.setMatrixAt(i, new THREE.Matrix4().makeTranslation(p.x, p.y, p.z)));
    scene.add(bulbMesh);
    const poleM = mat(0x4b3621, 0.8);
    for (const x of [-10.5, 10.5]) {
      const pole = mesh(new THREE.CylinderGeometry(0.035, 0.045, 2.8, 8), poleM, 0, 0, 0);
      pole.position.copy(P(x, -0.2, 1.4));
      scene.add(pole);
    }

    // Hecke hinten
    const leafTex = canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = "#2f5e22";
      g.fillRect(0, 0, w, h);
      const cs = ["#3b7a2a", "#2a5a1d", "#4c8c34", "#24501a", "#5c9a3c"];
      for (let i = 0; i < 2600; i++) {
        g.fillStyle = cs[Math.floor(rnd() * cs.length)];
        g.beginPath();
        g.ellipse(rnd() * w, rnd() * h, 3 + rnd() * 4, 2 + rnd() * 2, rnd() * TAU, 0, TAU);
        g.fill();
      }
    }, [8, 1]);
    const hedgeM = new THREE.MeshStandardMaterial({ map: leafTex, roughness: 0.95 });
    const hedge = mesh(new THREE.BoxGeometry(17, 1.7, 1.1), hedgeM, 0, 0, 0);
    hedge.position.copy(P(0, H.FIELD.y1 + 0.75, 0.85));
    scene.add(hedge);
    const leafM = new THREE.MeshStandardMaterial({ map: leafTex, roughness: 0.95 });
    const clump = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.5, 1), leafM, 70);
    for (let i = 0; i < 70; i++) {
      const x = -8.4 + (i / 69) * 16.8;
      const s = 0.6 + rnd() * 0.5;
      clump.setMatrixAt(i, M(x, 1.55 + rnd() * 0.15, -(H.FIELD.y1 + 0.75) + (rnd() - 0.5) * 0.4, rnd(), rnd(), rnd(), s * 1.1, s * 0.7, s));
    }
    clump.castShadow = true;
    clump.receiveShadow = true;
    scene.add(clump);

    // Holzzaun links und rechts
    const picket = merge([
      [new THREE.BoxGeometry(0.09, 1.1, 0.025), M(0, 0.55, 0)],
      [new THREE.ConeGeometry(0.064, 0.08, 4), M(0, 1.14, 0, 0, Math.PI / 4, 0, 1, 1, 0.28)],
    ]);
    const nP = 110;
    const fence = new THREE.InstancedMesh(picket, mat(0xb98a5a, 0.85), nP * 2);
    let fi = 0;
    for (const side of [-1, 1]) {
      for (let i = 0; i < nP; i++) {
        const y = -0.1 + i * ((H.FIELD.y1 + 0.3) / nP);
        fence.setMatrixAt(fi++, M(side * (H.FIELD.x + 0.45), 0, -y, 0, Math.PI / 2, (rnd() - 0.5) * 0.03));
      }
      for (const hgt of [0.3, 0.85]) {
        const rail = mesh(new THREE.BoxGeometry(0.04, 0.07, H.FIELD.y1 + 0.3), mat(0x9c7148, 0.85), 0, 0, 0);
        rail.position.copy(P(side * (H.FIELD.x + 0.42), (H.FIELD.y1 - 0.1) / 2, hgt));
        scene.add(rail);
      }
    }
    fence.castShadow = true;
    fence.receiveShadow = true;
    scene.add(fence);

    // Apfelbaum im Rasen und große Bäume hinter Hecke und Zaun
    scene.add(makeTree(rnd, 1.0, true, H.TREE.x, H.TREE.y));
    for (let i = 0; i < 26; i++) {
      const a = rnd() * TAU;
      let x;
      let y;
      if (i < 10) {
        x = -14 + i * 3.1 + rnd();
        y = H.FIELD.y1 + 4 + rnd() * 6;
      } else {
        x = (rnd() < 0.5 ? -1 : 1) * (H.FIELD.x + 3 + rnd() * 8);
        y = -2 + rnd() * 22;
      }
      scene.add(makeTree(rnd, 1.6 + rnd() * 1.3, false, x, y, a));
    }
    // Wald am Horizont
    const far = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0x3e6b3a, roughness: 1, flatShading: true }), 80);
    for (let i = 0; i < 80; i++) {
      const a = (i / 80) * Math.PI - 0.0;
      const r = 45 + rnd() * 12;
      const s = 4 + rnd() * 5;
      far.setMatrixAt(i, M(Math.cos(a) * r * 1.3, s * 0.6, -6 - Math.sin(a) * r, 0, rnd() * 3, 0, s, s * 1.3, s));
    }
    scene.add(far);

    // Grill, Bierkasten und Beistelltisch auf der Terrasse
    const grill = new THREE.Group();
    const grillM = mat(0x1d1d1f, 0.45, { metalness: 0.6 });
    const bowl = mesh(new THREE.SphereGeometry(0.3, 24, 12, 0, TAU, Math.PI / 2, Math.PI / 2), grillM, 0, 0.85, 0);
    const lid = mesh(new THREE.SphereGeometry(0.3, 24, 12, 0, TAU, 0, Math.PI / 2), grillM, 0, 0.9, 0);
    lid.rotation.x = -0.9;
    lid.position.z = -0.2;
    grill.add(bowl, lid);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU;
      const leg = mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.75, 6), mat(0x9ca3af, 0.4, { metalness: 0.8 }), Math.cos(a) * 0.2, 0.4, Math.sin(a) * 0.2);
      leg.rotation.set(Math.sin(a) * 0.2, 0, -Math.cos(a) * 0.2);
      grill.add(leg);
    }
    grill.position.copy(P(-9.5, -2.6));
    scene.add(grill);
    const crate = makeObstacle("kasten");
    crate.position.copy(P(8.6, -2.6));
    crate.rotation.y = 0.3;
    scene.add(crate);
    const crate2 = makeObstacle("kasten");
    crate2.position.copy(P(8.6, -2.6, 0.3));
    crate2.rotation.y = 0.15;
    scene.add(crate2);
  }

  function makeTree(rnd, size, fruit, x, y, rot = 0) {
    const tree = new THREE.Group();
    const bark = canvasTex(64, 128, (g, w, h) => {
      g.fillStyle = "#5b4130";
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 60; i++) {
        g.strokeStyle = `rgba(${rnd() < 0.5 ? "30,20,10" : "140,120,100"},0.5)`;
        g.beginPath();
        const xx = rnd() * w;
        g.moveTo(xx, 0);
        g.lineTo(xx + (rnd() - 0.5) * 10, h);
        g.stroke();
      }
    });
    const trunk = mesh(new THREE.CylinderGeometry(0.11 * size, 0.18 * size, 1.9 * size, 10), new THREE.MeshStandardMaterial({ map: bark, roughness: 0.95 }), 0, 0.95 * size, 0);
    trunk.rotation.z = (rnd() - 0.5) * 0.1;
    tree.add(trunk);
    for (let i = 0; i < 3; i++) {
      const br = mesh(new THREE.CylinderGeometry(0.03 * size, 0.06 * size, 1 * size, 6), trunk.material, 0, 0, 0);
      const a = (i / 3) * TAU + rnd();
      br.position.set(Math.cos(a) * 0.25 * size, 1.85 * size, Math.sin(a) * 0.25 * size);
      br.rotation.set(Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7);
      tree.add(br);
    }
    const greens = [0x3f7f2e, 0x4b8d35, 0x356f27, 0x5b9a3c];
    const leaf = new THREE.MeshStandardMaterial({ color: greens[Math.floor(rnd() * greens.length)], roughness: 0.9 });
    const geo = new THREE.IcosahedronGeometry(1, 2);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const k = 0.85 + rnd() * 0.3;
      p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k);
    }
    geo.computeVertexNormals();
    for (let i = 0; i < 7; i++) {
      const a = rnd() * TAU;
      const r = i ? 0.55 * size : 0;
      const s = (0.7 + rnd() * 0.35) * size;
      const blob = mesh(geo, leaf, Math.cos(a) * r, (2.35 + rnd() * 0.5) * size + (i ? 0 : 0.3 * size), Math.sin(a) * r);
      blob.scale.set(s, s * 0.8, s);
      tree.add(blob);
    }
    if (fruit) {
      const apples = new THREE.InstancedMesh(sphere(0.045, 10, 8), mat(0xc81e1e, 0.4), 40);
      for (let i = 0; i < 40; i++) {
        const a = rnd() * TAU;
        const b = rnd() * Math.PI * 0.7;
        const r = 1.0 * size;
        apples.setMatrixAt(i, new THREE.Matrix4().makeTranslation(Math.cos(a) * Math.sin(b) * r, 2.45 * size + Math.cos(b) * r * 0.75, Math.sin(a) * Math.sin(b) * r));
      }
      tree.add(apples);
      // Fallobst im Gras
      for (let i = 0; i < 4; i++) tree.add(mesh(sphere(0.045, 10, 8), mat(0xb91c1c, 0.5), (rnd() - 0.5) * 1.6, 0.04, (rnd() - 0.5) * 1.6));
    }
    tree.position.copy(P(x, y));
    tree.rotation.y = rot;
    return tree;
  }

  // --- Gartenstühle (weiße Plastikstühle), alle als ein Zeichenaufruf ---

  function chairGeometry() {
    const parts = [];
    // Sitzfläche und Lehne als abgerundete Platten
    parts.push([slab(0.44, 0.42, 0.012, 0.06, 0.012), M(0, 0.45, 0.01, -Math.PI / 2)]);
    const back = slab(0.42, 0.38, 0.01, 0.07, 0.01);
    parts.push([back, M(0, 0.72, -0.235, -0.16)]);
    // Schlitze in der Lehne (dunkler Spalt wirkt durch Schatten), hier als Leisten davor
    for (const x of [-0.12, 0, 0.12]) parts.push([new THREE.BoxGeometry(0.06, 0.26, 0.012), M(x, 0.72, -0.22, -0.16)]);
    // Beine: leicht nach außen gespreizt
    for (const [x, z] of [[-0.2, 0.18], [0.2, 0.18], [-0.2, -0.2], [0.2, -0.2]]) {
      parts.push([new THREE.CylinderGeometry(0.02, 0.026, 0.46, 10), M(x * 1.05, 0.225, z * 1.05, z * 0.18, 0, -x * 0.18)]);
    }
    // Armlehnen
    for (const x of [-0.235, 0.235]) {
      parts.push([slab(0.045, 0.44, 0.012, 0.02, 0.008), M(x, 0.63, 0.0, -Math.PI / 2)]);
      parts.push([new THREE.CylinderGeometry(0.018, 0.02, 0.18, 8), M(x, 0.54, 0.19)]);
    }
    return merge(parts);
  }

  function syncChairs() {
    const n = S.players.length;
    if (G.chairCount === n) return;
    if (G.chairs) G.scene.remove(G.chairs);
    G.chairs = new THREE.InstancedMesh(chairGeometry(), new THREE.MeshStandardMaterial({ color: 0xf2f1ec, roughness: 0.38 }), n);
    for (let i = 0; i < n; i++) {
      const p = P(H.seatX(S, i), H.CHAIR_Y);
      G.chairs.setMatrixAt(i, M(p.x, 0, p.z, 0, Math.PI, 0));
    }
    G.chairs.castShadow = true;
    G.chairs.receiveShadow = true;
    G.scene.add(G.chairs);
    G.chairCount = n;
  }

  // --- Menschen ---

  const SKINS = ["#f3d2bd", "#eac0a2", "#e0ac86", "#c98e66", "#a86f4c", "#7c4f34", "#5a3825", "#f6dccb"];
  const HAIRS = ["#1d1611", "#3b2717", "#5c3b22", "#7a5230", "#a87444", "#d0a868", "#e7cf9c", "#8a3b1c", "#9a9a9a", "#2b2b2b"];
  const SHIRTS = ["#e8e8e8", "#1f2937", "#b91c1c", "#1d4ed8", "#15803d", "#f59e0b", "#7c3aed", "#db2777", "#0e7490", "#f97316", "#64748b", "#fde68a", "#a3e635", "#38bdf8"];
  const IRIS = ["#4b3621", "#2f6fa3", "#3d7a4d", "#6b4e2e", "#7a8c99"];

  function lookOf(name) {
    const r = seeded(hash(name) ^ 0x9e3779b9);
    const pick = (a) => a[Math.floor(r() * a.length)];
    const female = r() < 0.45;
    const style = female ? pick(["long", "long", "ponytail", "bun", "bob", "curly"]) : pick(["short", "short", "short", "buzz", "curly", "bald", "long"]);
    const shirt = pick(SHIRTS);
    let shirt2 = pick(SHIRTS);
    if (shirt2 === shirt) shirt2 = "#ffffff";
    return {
      female,
      height: female ? 1.6 + r() * 0.16 : 1.72 + r() * 0.2,
      build: 0.92 + r() * 0.18,
      skin: pick(SKINS),
      hair: style === "bald" ? pick(HAIRS.slice(0, 4)) : r() < 0.06 ? "#e05a8a" : pick(HAIRS),
      iris: pick(IRIS),
      style,
      beard: !female && r() < 0.35,
      cap: r() < 0.14,
      glasses: r() < 0.16,
      shades: r() < 0.12,
      top: female ? pick(["tee", "tee", "tank", "long"]) : pick(["tee", "tee", "tee", "long", "tank"]),
      stripes: r() < 0.25,
      shirt,
      shirt2,
      bottom: pick(["shorts", "shorts", "jeans", "jeans", "chinos"]),
      pants: pick(["#2b4a7a", "#34507e", "#1f2937", "#c2b28f", "#6b7b4e", "#3f3f46", "#9b8a6a"]),
      shoes: pick(["#f5f5f5", "#111827", "#b91c1c", "#1d4ed8", "#9ca3af", "#7c5a3a"]),
      capColor: pick(["#b91c1c", "#1d4ed8", "#111827", "#f5f5f5", "#15803d"]),
    };
  }

  function stripeTex(a, b) {
    return canvasTex(8, 64, (g, w, h) => {
      for (let i = 0; i < 8; i++) {
        g.fillStyle = i % 2 ? b : a;
        g.fillRect(0, (i * h) / 8, w, h / 8);
      }
    });
  }

  function jeansTex(color) {
    const r = seeded(hash(color));
    return canvasTex(64, 64, (g, w, h) => {
      g.fillStyle = color;
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 900; i++) {
        g.fillStyle = `rgba(${r() < 0.5 ? "255,255,255" : "0,0,20"},${r() * 0.07})`;
        g.fillRect(r() * w, r() * h, 1, 3);
      }
    });
  }

  function makeBottle() {
    const g = new THREE.Group();
    const prof = [[0, 0], [0.032, 0], [0.033, 0.006], [0.033, 0.13], [0.03, 0.155], [0.017, 0.185], [0.0125, 0.215], [0.0135, 0.228], [0, 0.228]].map(([r, y]) => new THREE.Vector2(r, y));
    const glass = mesh(new THREE.LatheGeometry(prof, 18), new THREE.MeshStandardMaterial({ color: 0x5a2c06, roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.88 }), 0, 0, 0);
    const label = mesh(new THREE.CylinderGeometry(0.0335, 0.0335, 0.06, 18, 1, true), mat(0xf3ead2, 0.6), 0, 0.075, 0, false);
    const cap = mesh(new THREE.CylinderGeometry(0.0145, 0.0145, 0.008, 12), mat(0xd4a017, 0.3, { metalness: 0.8 }), 0, 0.231, 0, false);
    g.add(glass, label, cap);
    g.position.y = -0.11;
    const holder = new THREE.Group();
    holder.add(g);
    return holder;
  }

  // Ein Mensch aus Gelenken: Becken → Wirbelsäule → Brust → Hals → Kopf, Schultern → Ellbogen → Hand,
  // Hüften → Knie → Knöchel. Gebaut für 1,78 m, dann auf die eigene Größe skaliert. Schaut nach +z.
  function makeHuman(name) {
    const L = lookOf(name);
    const sw = L.female ? 0.88 : 1.0 * L.build; // Schulterbreite
    const hw = L.female ? 1.08 : 0.98; // Hüftbreite
    const skin = mat(L.skin, 0.55);
    const shirtM = L.stripes ? new THREE.MeshStandardMaterial({ map: stripeTex(L.shirt, L.shirt2), roughness: 0.8 }) : mat(L.shirt, 0.82);
    const pantsM = L.bottom === "jeans" ? new THREE.MeshStandardMaterial({ map: jeansTex(L.pants), roughness: 0.85 }) : mat(L.pants, 0.85);
    const hairM = mat(L.hair, 0.75);
    const shoeM = mat(L.shoes, 0.55);
    const soleM = mat("#f1f1f1", 0.6);
    const lipM = mat(new THREE.Color(L.skin).lerp(new THREE.Color("#a3473f"), 0.45).getStyle(), 0.5);
    const eyeM = mat("#f8f8f5", 0.25);
    const irisM = mat(L.iris, 0.3);
    const pupilM = mat("#0b0b0b", 0.2);

    const root = new THREE.Group();
    const hips = new THREE.Group();
    hips.position.y = 0.95;
    root.add(hips);
    addTo(hips, mesh(sphere(1, 20, 14), pantsM, 0, 0.02, 0)).scale.set(0.165 * hw, 0.115, 0.115);

    const spine = new THREE.Group();
    spine.position.y = 0.06;
    hips.add(spine);
    // Bauch von der Hüfte bis zur Brust, Brustkorb mit breiten Schultern: gedrehte Profile, oval gedrückt
    const belly = mesh(limbGeo(-0.22, [[0, 0.135 * hw], [0.45, 0.125], [1, 0.14]], 0.02), shirtM, 0, 0, 0);
    belly.scale.set(1.08 * (L.female ? 0.95 : L.build), 1, 0.74 * (L.female ? 0.95 : L.build));
    spine.add(belly);
    const chest = new THREE.Group();
    chest.position.y = 0.2;
    spine.add(chest);
    const torso = mesh(limbGeo(-0.27, [[0, 0.14], [0.35, 0.155], [0.7, 0.15], [0.9, 0.12], [1, 0.07]], 0.03), shirtM, 0, 0, 0);
    torso.scale.set(1.15 * sw, 1, 0.7);
    chest.add(torso);
    for (const s of [-1, 1]) chest.add(mesh(sphere(0.066, 16, 12), shirtM, s * 0.165 * sw, 0.175, 0));

    const neck = new THREE.Group();
    neck.position.y = 0.285;
    chest.add(neck);
    neck.add(mesh(new THREE.CylinderGeometry(0.047, 0.055, 0.12, 14), skin, 0, 0.03, 0));
    const head = new THREE.Group();
    head.position.y = 0.085;
    neck.add(head);
    addTo(head, mesh(sphere(0.1, 32, 24), skin, 0, 0.1, 0)).scale.set(0.9, 1.08, 1.0);
    addTo(head, mesh(sphere(0.08, 24, 16), skin, 0, 0.045, 0.02)).scale.set(0.92, 0.8, 1.0);
    const nose = mesh(capsule(0.0115, 0.03, 10), skin, 0, 0.088, 0.096);
    nose.rotation.x = 0.4;
    head.add(nose);
    for (const s of [-1, 1]) {
      addTo(head, mesh(sphere(0.026, 12, 10), skin, s * 0.09, 0.095, -0.005)).scale.set(0.45, 1, 0.75);
      head.add(mesh(sphere(0.0135, 14, 10), eyeM, s * 0.034, 0.112, 0.082, false));
      head.add(mesh(sphere(0.0072, 12, 8), irisM, s * 0.034, 0.112, 0.0945, false));
      head.add(mesh(sphere(0.0036, 8, 6), pupilM, s * 0.034, 0.112, 0.1012, false));
      const lid = mesh(new THREE.SphereGeometry(0.0146, 14, 8, 0, TAU, 0, Math.PI * 0.42), skin, s * 0.034, 0.112, 0.082, false);
      lid.rotation.x = 0.55;
      head.add(lid);
      const brow = mesh(new THREE.BoxGeometry(0.034, 0.0065, 0.012), hairM, s * 0.035, 0.135, 0.091, false);
      brow.rotation.z = -s * 0.12;
      head.add(brow);
    }
    const lips = mesh(capsule(0.0065, 0.024, 8), lipM, 0, 0.05, 0.093, false);
    lips.rotation.z = Math.PI / 2;
    head.add(lips);
    addHair(head, L, hairM);
    if (L.beard) {
      const beard = mesh(new THREE.SphereGeometry(0.084, 24, 12, 0, TAU, Math.PI * 0.45, Math.PI * 0.55), hairM, 0, 0.065, 0.012);
      beard.scale.set(0.95, 0.95, 1.06);
      head.add(beard);
      const stache = mesh(capsule(0.008, 0.035, 8), hairM, 0, 0.064, 0.094, false);
      stache.rotation.z = Math.PI / 2;
      head.add(stache);
    }
    if (L.cap) {
      const capM = mat(L.capColor, 0.7);
      addTo(head, mesh(new THREE.SphereGeometry(0.108, 24, 12, 0, TAU, 0, Math.PI * 0.5), capM, 0, 0.125, -0.005)).scale.set(0.95, 0.85, 1.04);
      const visor = mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.008, 20, 1, false, -Math.PI / 2, Math.PI), capM, 0, 0.13, 0.07);
      visor.rotation.x = 0.12;
      visor.scale.z = 0.9;
      head.add(visor);
    }
    if (L.glasses || L.shades) {
      const fm = mat(L.shades ? "#111" : "#3a2a1a", 0.3);
      const lens = L.shades ? mat("#101418", 0.05, { metalness: 0.5 }) : new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.15, roughness: 0.05 });
      for (const s of [-1, 1]) {
        head.add(mesh(new THREE.TorusGeometry(0.017, 0.0028, 6, 18), fm, s * 0.034, 0.112, 0.1, false));
        head.add(mesh(new THREE.CircleGeometry(0.017, 16), lens, s * 0.034, 0.112, 0.101, false));
        head.add(mesh(new THREE.BoxGeometry(0.004, 0.004, 0.09), fm, s * 0.085, 0.115, 0.055, false));
      }
      head.add(mesh(new THREE.BoxGeometry(0.02, 0.004, 0.004), fm, 0, 0.116, 0.102, false));
    }

    // Arme: [0] links (+x), [1] rechts (−x)
    const arms = [];
    for (const s of [1, -1]) {
      const sh = new THREE.Group();
      sh.position.set(s * 0.188 * sw, 0.185, 0);
      chest.add(sh);
      const sleeveLong = L.top === "long";
      sh.add(mesh(limbGeo(0.28, [[0, 0.047], [0.35, 0.044], [1, 0.034]]), sleeveLong ? shirtM : skin, 0, 0, 0));
      if (L.top === "tee") sh.add(mesh(limbGeo(0.12, [[0, 0.056], [1, 0.05]], 0.01), shirtM, 0, 0, 0));
      if (L.top === "tank") sh.add(mesh(sphere(0.05, 12, 10), skin, 0, -0.01, 0));
      const el = new THREE.Group();
      el.position.y = -0.28;
      sh.add(el);
      el.add(mesh(limbGeo(0.25, [[0, 0.036], [0.25, 0.037], [1, 0.024]]), sleeveLong ? shirtM : skin, 0, 0, 0));
      const hand = new THREE.Group();
      hand.position.y = -0.255;
      el.add(hand);
      addTo(hand, mesh(sphere(1, 14, 10), skin, 0, -0.035, 0.004)).scale.set(0.022, 0.048, 0.041);
      const fingers = mesh(capsule(0.019, 0.04, 10), skin, 0, -0.085, 0.006);
      fingers.scale.set(0.95, 1, 1.75);
      hand.add(fingers);
      const thumb = mesh(capsule(0.011, 0.035, 8), skin, -s * 0.008, -0.04, 0.036);
      thumb.rotation.x = 0.7;
      hand.add(thumb);
      arms.push({ sh, el, hand });
    }
    const bottle = makeBottle();
    bottle.position.set(0, -0.06, 0.03);
    bottle.rotation.x = 1.15;
    arms[0].hand.add(bottle);
    const ball = mesh(sphere(H.B_R, 20, 14), mat(0xbfc4ca, 0.3, { metalness: 1 }), 0, -0.085, 0.03);
    ball.visible = false;
    arms[1].hand.add(ball);

    // Beine
    const legs = [];
    for (const s of [1, -1]) {
      const hip = new THREE.Group();
      hip.position.set(s * 0.088 * hw, -0.01, 0);
      hips.add(hip);
      const shorts = L.bottom === "shorts";
      hip.add(mesh(limbGeo(0.43, [[0, 0.082], [0.3, 0.075], [1, 0.05]]), shorts ? skin : pantsM, 0, 0, 0));
      if (shorts) hip.add(mesh(limbGeo(0.25, [[0, 0.09], [1, 0.077]], 0.015), pantsM, 0, 0, 0));
      const knee = new THREE.Group();
      knee.position.y = -0.43;
      hip.add(knee);
      const shin = mesh(limbGeo(0.45, [[0, 0.05], [0.28, 0.056], [0.75, 0.038], [1, 0.032]]), shorts ? skin : pantsM, 0, 0, 0);
      shin.scale.z = 0.95;
      knee.add(shin);
      const ankle = new THREE.Group();
      ankle.position.y = -0.45;
      knee.add(ankle);
      const shoe = mesh(capsule(0.046, 0.14), shoeM, 0, -0.022, 0.045);
      shoe.rotation.x = Math.PI / 2;
      shoe.scale.set(1, 1, 0.72);
      ankle.add(shoe);
      ankle.add(mesh(new THREE.BoxGeometry(0.094, 0.022, 0.27), soleM, 0, -0.05, 0.045));
      legs.push({ hip, knee, ankle });
    }

    root.scale.setScalar(L.height / 1.78);
    root.traverse((o) => {
      if (o.isMesh && o.castShadow) o.castShadow = o.geometry.parameters?.radius !== 0.0036;
    });
    const person = { root, hips, spine, chest, neck, head, arms, legs, bottle, ball, look: L, J: { ...POSES.stand }, pos: null, face: 0, mode: "seated", leg: null, walk: 0, moveW: 0, seed: (hash(name) % 1000) / 100, sipAt: 0 };
    return person;
  }

  function addHair(head, L, hairM) {
    const cap = (scale = 1) => {
      const m = mesh(new THREE.SphereGeometry(0.106 * scale, 32, 16, 0, TAU, 0, Math.PI * 0.55), hairM, 0, 0.108, -0.008);
      m.scale.set(0.93, 1.08, 1.05);
      m.rotation.x = -0.32;
      head.add(m);
      return m;
    };
    switch (L.style) {
      case "bald":
        addTo(head, mesh(new THREE.TorusGeometry(0.088, 0.018, 8, 24, Math.PI * 1.2), hairM, 0, 0.09, -0.01)).rotation.set(Math.PI / 2, 0, -Math.PI * 0.1 + Math.PI);
        break;
      case "buzz":
        cap(0.985);
        break;
      case "short":
        cap();
        addTo(head, mesh(sphere(0.05, 14, 10), hairM, 0, 0.19, 0.03)).scale.set(1.5, 0.45, 1.1);
        break;
      case "curly":
        cap();
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * TAU;
          const up = i % 2 ? 0.17 : 0.12;
          head.add(mesh(sphere(0.034, 10, 8), hairM, Math.cos(a) * 0.075, up + 0.03, Math.sin(a) * 0.075 - 0.01));
        }
        break;
      case "long": {
        cap();
        const back = mesh(capsule(0.085, 0.2), hairM, 0, 0.0, -0.06);
        back.scale.set(1.12, 1, 0.45);
        head.add(back);
        for (const s of [-1, 1]) head.add(mesh(capsule(0.028, 0.16), hairM, s * 0.083, 0.02, 0.01));
        break;
      }
      case "bob": {
        cap();
        const back = mesh(capsule(0.092, 0.06), hairM, 0, 0.06, -0.035);
        back.scale.set(1.08, 1, 0.75);
        head.add(back);
        break;
      }
      case "ponytail": {
        cap();
        const tail = mesh(capsule(0.03, 0.16), hairM, 0, 0.05, -0.13);
        tail.rotation.x = 0.45;
        head.add(tail);
        addTo(head, mesh(new THREE.TorusGeometry(0.022, 0.007, 6, 12), mat("#e11d48", 0.5), 0, 0.12, -0.105)).rotation.x = 1.1;
        break;
      }
      case "bun":
        cap();
        head.add(mesh(sphere(0.048, 14, 10), hairM, 0, 0.2, -0.065));
        break;
    }
  }

  // --- Posen: Gelenkwinkel ---

  const POSES = {
    stand: { hipY: 0.95, pelvis: 0, spine: 0, chest: 0, neck: 0, headX: 0, headY: 0, lShX: -0.25, lShZ: 0.14, lEl: -1.1, rShX: 0.04, rShZ: -0.1, rEl: -0.18, lHip: 0, lHipZ: 0.03, lKnee: 0.04, rHip: 0, rHipZ: -0.03, rKnee: 0.04 },
  };
  POSES.sit = { ...POSES.stand, hipY: 0.53, spine: -0.12, chest: 0.06, lShX: -0.3, lShZ: -0.04, lEl: -1.2, rShX: -0.28, rShZ: 0.06, rEl: -1.15, lHip: -1.45, lHipZ: 0.1, lKnee: 1.42, rHip: -1.45, rHipZ: -0.1, rKnee: 1.42 };
  POSES.drink = { ...POSES.stand, spine: -0.08, headX: -0.4, lShX: -1.3, lShZ: 0.3, lEl: -1.75 };
  POSES.sitDrink = { ...POSES.sit, headX: -0.4, lShX: -1.25, lShZ: 0.32, lEl: -1.8 };
  POSES.aim = { ...POSES.stand, hipY: 0.9, spine: 0.22, headX: -0.15, rShX: -0.35, rShZ: -0.05, rEl: -0.6, lHip: -0.45, lKnee: 0.55, rHip: 0.25, rKnee: 0.3, lShX: -0.2 };
  POSES.release = { ...POSES.aim, spine: 0.3, rShX: -1.7, rEl: -0.15, headX: -0.25 };
  POSES.bow = { ...POSES.stand, hipY: 0.93, spine: 1.0, chest: 0.15, headX: 0.2, rShX: -0.55, rShZ: 0.55, rEl: -1.6, lShX: 0.55, lShZ: 0.1, lEl: -0.5, lHip: 0.15, lKnee: 0.2, rHip: -0.12, rKnee: 0.1 };
  POSES.cheerSit = { ...POSES.sit, lShX: -0.3, lShZ: 2.5, lEl: -0.35, rShZ: -2.6, rShX: -0.2, rEl: -0.3, spine: 0.02 };
  POSES.cheer = { ...POSES.stand, lShZ: 2.4, lEl: -0.4, rShZ: -2.5, rEl: -0.3 };
  POSES.jacks = { ...POSES.stand };
  POSES.squat = { ...POSES.stand };

  function sitHipY(p) {
    const h = p.look.height / 1.78;
    return (0.51 * h + 0.015) / h;
  }

  function applyPose(p, J) {
    p.hips.position.y = J.hipY;
    p.hips.rotation.x = J.pelvis;
    p.spine.rotation.x = J.spine;
    p.chest.rotation.x = J.chest;
    p.neck.rotation.x = J.neck;
    p.head.rotation.set(J.headX, J.headY, 0);
    p.arms[0].sh.rotation.set(J.lShX, 0, J.lShZ);
    p.arms[0].el.rotation.x = J.lEl;
    p.arms[1].sh.rotation.set(J.rShX, 0, J.rShZ);
    p.arms[1].el.rotation.x = J.rEl;
    p.legs[0].hip.rotation.set(J.lHip, 0, J.lHipZ);
    p.legs[0].knee.rotation.x = J.lKnee;
    p.legs[0].ankle.rotation.x = -(J.lHip + J.lKnee) * 0.85;
    p.legs[1].hip.rotation.set(J.rHip, 0, J.rHipZ);
    p.legs[1].knee.rotation.x = J.rKnee;
    p.legs[1].ankle.rotation.x = -(J.rHip + J.rKnee) * 0.85;
  }

  // --- Wer steht wo und macht was ---

  function seatOf(name) {
    const i = S.players.indexOf(name);
    return { x: H.seatX(S, i), y: H.CHAIR_Y - 0.05 };
  }

  // Wo die Aufgestandenen trinken: ein paar Meter rechts neben der Stuhlreihe
  function drinkSpot(name) {
    const list = S.standing?.length ? S.standing : [];
    const i = Math.max(0, list.indexOf(name));
    const right = H.seatX(S, S.players.length - 1);
    return { x: right + 2.1 + (i % 3) * 0.75, y: -0.9 - Math.floor(i / 3) * 0.8 - (i % 2) * 0.25 };
  }

  // Ziel, Blickrichtung und Pose für jede Person
  function planFor(name, now) {
    const seat = seatOf(name);
    const sit = { sit: true, x: seat.x, y: seat.y, face: 0, pose: "sit" };
    const standing = S.standing?.includes(name);
    const t = (now - (phaseSeen.get(phaseKey()) ?? now)) / 1000;
    switch (S.phase) {
      case "white":
      case "throw": {
        const a = playing?.a;
        const tA = a ? (now - playing.t0) / 1000 : 0;
        if (a && tA < a.T + 1.4 && throwerOfAnim(a) === name) {
          return { x: seat.x, y: H.THROW_Y - 0.3, face: Math.atan2(a.land[0] - a.from[0], a.land[1] - a.from[1]), pose: tA < 0.12 ? "aim" : "release" };
        }
        if (name === H.thrower(S) && animLeftMs() === 0) return { x: seat.x, y: H.THROW_Y - 0.3, face: aimAngle ?? 0, pose: "aim", ball: true };
        return sit;
      }
      case "result":
        return { ...sit, pose: name === S.result.near ? "cheerSit" : "sit" };
      case "drink": {
        const d = S.drink.list.find((x) => x.n === name);
        if (standing) {
          const spot = drinkSpot(name);
          if (S.drink.kind === "refuse" && name === S.bow?.queue[0]) {
            const target = S.drink.list.find((x) => x.sit)?.n;
            return { x: seatOf(target ?? name).x, y: H.CHAIR_Y + 0.95, face: Math.PI, pose: d && !d.done ? "drink" : "stand" };
          }
          return { x: spot.x, y: spot.y, face: -Math.PI / 2 + 0.3, pose: d && !d.done ? "drink" : "stand" };
        }
        if (d && !d.done) return { ...sit, pose: "sitDrink" };
        return sit;
      }
      case "task": {
        if (name === S.task.who) {
          if (S.task.stage === "ready") return { x: 0, y: 0.7, face: 0, pose: "stand" };
          return taskPlan(H.TASKS[S.task.i].a, t);
        }
        if (standing) {
          const spot = drinkSpot(name);
          return { x: spot.x, y: spot.y, face: -Math.PI / 2, pose: "stand" };
        }
        return { ...sit, pose: S.task.stage === "run" ? "cheerSit" : "sit" };
      }
      case "bow": {
        const cur = S.bow.queue[0];
        if (name === cur) {
          const target = H.bowTargets(S)[S.bow.ti];
          const ts = seatOf(target);
          return { x: ts.x, y: H.CHAIR_Y + 0.95, face: Math.PI, pose: "bow" };
        }
        if (standing) {
          const spot = drinkSpot(name);
          return { x: spot.x, y: spot.y, face: -Math.PI / 2, pose: "stand" };
        }
        return sit;
      }
      case "place":
        return { ...sit, pose: name === S.place.who ? "cheerSit" : "sit" };
    }
    return sit;
  }

  // Wie die Aufgabe aussieht: ein Ziel, das sich bewegt (die Figur läuft hinterher), oder eine Übung auf der Stelle.
  function taskPlan(kind, t) {
    const home = { x: 0, y: 0.7 };
    const white = S.white ?? { x: 0, y: 7 };
    const shuttle = (to, speed) => {
      const d = Math.hypot(to.x - home.x, to.y - home.y);
      const u = ((t * speed) / d) % 2;
      const k = u < 1 ? u : 2 - u;
      return { x: home.x + (to.x - home.x) * k, y: home.y + (to.y - home.y) * k, back: u >= 1 };
    };
    switch (kind) {
      case "chairs": {
        const rx = (S.players.length - 1) / 2 + 1.2;
        const a = (t * 2.6) / rx - Math.PI / 2;
        return { x: Math.cos(a) * rx, y: H.CHAIR_Y + Math.sin(a) * 1.7, pose: "stand", run: true };
      }
      case "hedge":
        return { ...shuttle({ x: 0.5, y: H.FIELD.y1 - 0.4 }, 3), pose: "stand", run: true };
      case "white": {
        const p = shuttle(white, 1.6);
        return { ...p, pose: "stand", run: true, backwards: !p.back };
      }
      case "spin":
        if (t < 3) return { x: home.x, y: home.y, face: t * 10.5, pose: "stand", spin: true };
        return { ...shuttle(white, 2.2), pose: "stand", run: true };
      case "hop":
        return { ...shuttle({ x: white.x * 0.5, y: Math.min(5, white.y) }, 1.3), pose: "stand", run: true, hop: true };
      case "tree": {
        const tr = { x: H.TREE.x + 1.1, y: H.TREE.y };
        if (t < 5.5) return { ...shuttle(tr, 2.6), pose: "stand", run: true };
        const a = (t - 5.5) * 2.4;
        return { x: H.TREE.x + Math.cos(a) * 1.1, y: H.TREE.y + Math.sin(a) * 1.1, pose: "stand", run: true };
      }
      case "jacks":
        return { ...home, face: 0, pose: "jacks" };
      case "squat":
        return { ...home, face: 0, pose: "squat" };
      case "sing":
        return { ...home, face: Math.PI * 0.85, pose: "cheer" };
    }
    return { ...home, face: 0, pose: "stand" };
  }

  function throwerOfAnim(a) {
    // Werfer = Sitz, von dem aus geworfen wurde
    const i = S.players.findIndex((p, k) => Math.abs(H.seatX(S, k) - a.from[0]) < 0.01);
    return S.players[i];
  }

  const phaseSeen = new Map();
  function phaseKey() {
    return `${S.phase}:${S.k}:${S.task?.stage ?? ""}`;
  }

  function angLerp(a, b, k) {
    let d = ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI;
    return a + d * k;
  }

  function updatePeople(now, dt) {
    const seen = new Set();
    for (const name of S.players) {
      seen.add(name);
      let p = G.people.get(name);
      if (!p) {
        p = makeHuman(name);
        G.people.set(name, p);
        G.scene.add(p.root);
        const seat = seatOf(name);
        p.pos = { x: seat.x, y: seat.y };
      }
      const plan = planFor(name, now);
      const seat = seatOf(name);
      const front = { x: seat.x, y: seat.y + 0.7 };
      // Wege: zum Hinsetzen erst vor den Stuhl, dann rückwärts rein; zum Aufstehen erst nach vorne raus.
      let goal = plan;
      let backIn = false;
      if (plan.sit) {
        if (p.mode !== "seated") {
          if (p.leg === "in") {
            goal = seat;
            backIn = true;
            if (Math.hypot(p.pos.x - seat.x, p.pos.y - seat.y) < 0.03) p.mode = "seated";
          } else {
            goal = front;
            if (Math.hypot(p.pos.x - front.x, p.pos.y - front.y) < 0.06) p.leg = "in";
          }
        } else goal = seat;
      } else if (p.mode === "seated") {
        goal = front;
        p.leg = null;
        if (Math.hypot(p.pos.x - front.x, p.pos.y - front.y) < 0.06) p.mode = "free";
      } else p.leg = null;
      const dx = goal.x - p.pos.x;
      const dy = goal.y - p.pos.y;
      const dist = Math.hypot(dx, dy);
      const speed = plan.run ? 3.4 : p.mode === "seated" || backIn || goal === front ? 0.9 : 1.5;
      const step = Math.min(dist, speed * dt);
      const moving = dist > 0.02;
      if (dist > 0.001) {
        p.pos.x += (dx / dist) * step;
        p.pos.y += (dy / dist) * step;
      }
      const walking = dist > 0.05 || (plan.run && dist > 0.005);
      p.moveW += ((walking ? 1 : 0) - p.moveW) * Math.min(1, dt * 6);
      p.walk += dt * (plan.run ? 11 : 7) * (walking ? 1 : 0);
      let face = plan.face ?? p.face;
      if (plan.spin) face = plan.face;
      else if (walking && !backIn && (dist > 0.1 || plan.run)) face = Math.atan2(dx, dy) + (plan.backwards ? Math.PI : 0);
      else if (backIn || (p.mode === "seated" && plan.sit)) face = 0;
      p.face = plan.spin ? face : angLerp(p.face, face, Math.min(1, dt * 7));
      p.hop = plan.hop && walking ? Math.abs(Math.sin(p.walk * 0.5)) * 0.14 : 0;
      const pp = P(p.pos.x, p.pos.y, p.hop || 0);
      p.root.position.copy(pp);
      p.root.rotation.y = Math.atan2(Math.sin(p.face), -Math.cos(p.face));

      // Pose
      const seated = p.mode === "seated" && plan.sit;
      let poseName = plan.pose;
      if (!seated && (poseName === "sit" || poseName === "sitDrink" || poseName === "cheerSit")) poseName = "stand";
      if (seated && !poseName.startsWith("sit") && poseName !== "cheerSit") poseName = "sit";
      // Ab und zu einen Schluck nehmen, wer sitzt
      if (seated && poseName === "sit") {
        if (now > p.sipAt + 4000 && now < p.sipAt + 6200) poseName = "sitDrink";
        else if (now > p.sipAt + 6200) p.sipAt = now + 6000 + ((hash(name + Math.floor(now / 1000)) % 100) / 100) * 14000;
      }
      const target = { ...POSES[poseName] ?? POSES.stand };
      if (poseName.startsWith("sit") || poseName === "cheerSit") target.hipY = sitHipY(p);
      if (poseName === "aim") {
        const k = aimPull ? aimPull.power : 0;
        if (name === H.thrower(S) && pulling()) {
          target.rShX = 0.25 + k * 1.1;
          target.spine = 0.22 + k * 0.15;
        } else target.rShX = -0.35 + Math.sin(now / 500 + p.seed) * 0.08;
      }
      if (poseName === "bow") {
        const c = 0.5 + 0.5 * Math.sin(now / 700 + p.seed);
        target.spine = 0.45 + c * 0.6;
        target.headX = 0.1 + c * 0.2;
      }
      if (poseName === "jacks") {
        const c = (Math.sin(now / 230) + 1) / 2;
        Object.assign(target, { lShZ: 0.15 + c * 2.7, rShZ: -0.15 - c * 2.7, lShX: 0, rShX: 0, lEl: -0.15, rEl: -0.15, lHipZ: 0.03 + c * 0.32, rHipZ: -0.03 - c * 0.32, hipY: 0.95 - c * 0.03 });
      }
      if (poseName === "squat") {
        const c = (Math.sin(now / 420) + 1) / 2;
        Object.assign(target, { hipY: 0.95 - c * 0.42, lHip: -c * 1.45, rHip: -c * 1.45, lKnee: c * 2.05, rKnee: c * 2.05, spine: c * 0.4, lShX: -c * 1.4, rShX: -c * 1.4, lEl: -0.2, rEl: -0.1, lShZ: 0.1, rShZ: -0.1 });
      }
      if (poseName === "cheerSit" || poseName === "cheer") {
        const w = Math.sin(now / 180 + p.seed);
        target.lShZ += w * 0.25;
        target.rShZ += w * 0.25;
      }
      // Kopf wendet sich der fliegenden Kugel zu
      if (playing && (seated || poseName === "stand")) {
        const b = animBall(playing.a.ball, (now - playing.t0) / 1000);
        if (b) target.headY = Math.max(-1, Math.min(1, -Math.atan2(b.x - p.pos.x, b.y - p.pos.y) * 0.6));
      } else if (seated) target.headY = Math.sin(now / 2300 + p.seed * 3) * 0.35;
      const k = Math.min(1, dt * (poseName === "jacks" || poseName === "squat" ? 16 : 7));
      for (const key in target) p.J[key] += (target[key] - p.J[key]) * k;
      const J = { ...p.J };
      // Gehen und Rennen: Schwung über die Pose legen
      if (p.moveW > 0.01) {
        const run = plan.run ? 1 : 0;
        const sw = Math.sin(p.walk);
        const amp = (run ? 0.85 : 0.45) * p.moveW;
        J.lHip += sw * amp - run * 0.25 * p.moveW;
        J.rHip += -sw * amp - run * 0.25 * p.moveW;
        J.lKnee += Math.max(0, -Math.cos(p.walk)) * (run ? 1.4 : 0.7) * p.moveW;
        J.rKnee += Math.max(0, Math.cos(p.walk)) * (run ? 1.4 : 0.7) * p.moveW;
        J.rShX += sw * amp * 0.8;
        J.rEl -= run * 1.1 * p.moveW;
        J.spine += run * 0.15 * p.moveW;
        J.hipY += Math.abs(Math.cos(p.walk)) * 0.02 * p.moveW;
      }
      applyPose(p, J);
      // Bier in der Hand (beim Trinken leert es sich)
      p.bottle.visible = true;
      p.ball.visible = !!plan.ball;
    }
    for (const [name, p] of G.people) {
      if (!seen.has(name)) {
        G.scene.remove(p.root);
        G.people.delete(name);
      }
    }
  }

  // --- Kugeln ---

  const BALL_COLORS = ["#ef4444", "#3b82f6", "#f59e0b", "#22c55e", "#a855f7", "#ec4899", "#14b8a6", "#f97316", "#eab308", "#6366f1", "#84cc16", "#06b6d4", "#e11d48", "#8b5cf6", "#10b981", "#f43f5e"];

  function ballColor(name) {
    return BALL_COLORS[Math.max(0, S.players.indexOf(name)) % BALL_COLORS.length];
  }

  function bouleTex(color) {
    return canvasTex(256, 128, (g, w, h) => {
      g.fillStyle = "#c4c8ce";
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 2500; i++) {
        g.fillStyle = `rgba(${Math.random() < 0.5 ? "255,255,255" : "40,40,50"},${Math.random() * 0.08})`;
        g.fillRect(Math.random() * w, Math.random() * h, 2, 1);
      }
      g.strokeStyle = "rgba(30,30,40,0.7)";
      g.lineWidth = 2;
      for (const y of [0.3, 0.7]) {
        g.beginPath();
        g.moveTo(0, h * y);
        g.lineTo(w, h * y);
        g.stroke();
      }
      g.fillStyle = color;
      g.fillRect(0, h * 0.44, w, h * 0.12);
    });
  }

  function ballMesh(id) {
    let m = G.balls.get(id);
    if (m) return m;
    m = mesh(sphere(H.B_R, 32, 22), new THREE.MeshStandardMaterial({ map: bouleTex(ballColor(id)), metalness: 1, roughness: 0.3 }), 0, 0, 0);
    m.userData.last = null;
    G.balls.set(id, m);
    G.scene.add(m);
    return m;
  }

  const tmpAxis = new THREE.Vector3();
  const tmpQ = new THREE.Quaternion();
  function placeBall(m, x, y, h, r) {
    const last = m.userData.last;
    if (last && h <= r + 0.001) {
      const dx = x - last.x;
      const dy = y - last.y;
      const d = Math.hypot(dx, dy);
      if (d > 1e-5 && d < 1) {
        tmpAxis.set(-dy, 0, -dx).normalize();
        m.quaternion.premultiply(tmpQ.setFromAxisAngle(tmpAxis, d / r));
      }
    }
    m.userData.last = { x, y };
    m.position.copy(P(x, y, h));
  }

  // Position aller Kugeln jetzt (Animation oder Spielstand)
  function ballPositions(now) {
    const out = new Map();
    const t = playing ? (now - playing.t0) / 1000 : 0;
    const a = playing?.a;
    if (S.white) out.set("@w", { ...S.white, h: H.W_R });
    for (const [id, b] of Object.entries(S.balls)) out.set(id, { ...b, h: H.B_R });
    if (a) {
      if (t > a.dur + 1.5) {
        playing = null;
      } else {
        for (const id of [a.ball, ...Object.keys(a.tracks)]) {
          const b = animBall(id, t);
          if (b) out.set(id, b);
        }
        // Der Wurf geht gleich los: die geworfene Kugel ist noch in der Hand
      }
    }
    return out;
  }

  function updateBalls(now) {
    const pos = ballPositions(now);
    const w = pos.get("@w");
    G.whiteBall.visible = !!w;
    G.whiteRing.visible = !!w && !w.air;
    if (w) {
      placeBall(G.whiteBall, w.x, w.y, w.h, H.W_R);
      G.whiteRing.position.copy(P(w.x, w.y, 0.006));
      const pulse = 1 + Math.sin(now / 300) * 0.12;
      G.whiteRing.scale.setScalar(pulse);
      G.whiteRing.material.opacity = 0.35 + 0.2 * Math.sin(now / 300);
    }
    for (const [id, m] of G.balls) m.visible = pos.has(id);
    for (const [id, b] of pos) {
      if (id === "@w") continue;
      placeBall(ballMesh(id), b.x, b.y, b.h, H.B_R);
    }
    return pos;
  }

  // --- Hindernisse ---

  function makeObstacle(kind) {
    const g = new THREE.Group();
    const add = (geo, m, x, y, z) => {
      const o = mesh(geo, m, x, y, z);
      g.add(o);
      return o;
    };
    switch (kind) {
      case "zwerg": {
        const skin = mat("#f1c9a5", 0.5);
        add(new THREE.CylinderGeometry(0.07, 0.11, 0.05, 16), mat("#5b3a21", 0.7), 0, 0.025, 0);
        add(capsule(0.085, 0.09), mat("#2563eb", 0.45), 0, 0.15, 0);
        add(new THREE.CylinderGeometry(0.088, 0.088, 0.02, 16), mat("#3b2a1a", 0.5), 0, 0.14, 0);
        add(sphere(0.058, 18, 14), skin, 0, 0.28, 0.005);
        add(sphere(0.016, 10, 8), mat("#f08a7a", 0.5), 0, 0.275, 0.058);
        const beard = add(new THREE.ConeGeometry(0.06, 0.13, 16), mat("#f8f8f8", 0.8), 0, 0.215, 0.03);
        beard.rotation.x = Math.PI;
        add(new THREE.ConeGeometry(0.068, 0.2, 18), mat("#dc2626", 0.45), 0, 0.41, -0.01).rotation.x = -0.15;
        for (const s of [-1, 1]) {
          add(sphere(0.008, 8, 6), mat("#111", 0.3), s * 0.02, 0.295, 0.052);
          add(capsule(0.022, 0.06), mat("#2563eb", 0.45), s * 0.09, 0.17, 0.02).rotation.z = s * 0.4;
        }
        break;
      }
      case "kasten": {
        const c = mat("#1f7a3a", 0.5);
        add(new THREE.BoxGeometry(0.4, 0.3, 0.3), c, 0, 0.15, 0);
        add(new THREE.BoxGeometry(0.42, 0.04, 0.32), mat("#166534", 0.5), 0, 0.29, 0);
        add(new THREE.BoxGeometry(0.12, 0.04, 0.31), mat("#0f3d1e", 0.6), 0, 0.24, 0);
        const bottles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.017, 0.022, 0.09, 10), mat("#5a2c06", 0.2), 20);
        const caps = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.014, 0.014, 0.008, 10), mat("#d4a017", 0.3, { metalness: 0.8 }), 20);
        let i = 0;
        for (let a = 0; a < 5; a++) {
          for (let b = 0; b < 4; b++) {
            bottles.setMatrixAt(i, new THREE.Matrix4().makeTranslation(-0.16 + a * 0.08, 0.34, -0.105 + b * 0.07));
            caps.setMatrixAt(i++, new THREE.Matrix4().makeTranslation(-0.16 + a * 0.08, 0.388, -0.105 + b * 0.07));
          }
        }
        bottles.castShadow = true;
        g.add(bottles, caps);
        break;
      }
      case "topf": {
        const prof = [[0, 0], [0.12, 0], [0.13, 0.02], [0.17, 0.24], [0.185, 0.25], [0.185, 0.28], [0.16, 0.28], [0.15, 0.26], [0, 0.26]].map(([r, y]) => new THREE.Vector2(r, y));
        add(new THREE.LatheGeometry(prof, 28), mat("#c2622d", 0.8), 0, 0, 0);
        const leaf = mat("#2f7d32", 0.8);
        for (let i = 0; i < 6; i++) add(new THREE.IcosahedronGeometry(0.09, 1), leaf, Math.cos(i) * 0.07, 0.34 + (i % 2) * 0.06, Math.sin(i) * 0.07);
        for (let i = 0; i < 7; i++) add(sphere(0.028, 10, 8), mat(i % 2 ? "#e11d48" : "#facc15", 0.5), Math.cos(i * 1.7) * 0.11, 0.42 + (i % 3) * 0.03, Math.sin(i * 1.7) * 0.11);
        break;
      }
      case "kanne": {
        const m = mat("#16a34a", 0.35, { metalness: 0.3 });
        add(new THREE.CylinderGeometry(0.1, 0.11, 0.24, 24), m, 0, 0.12, 0);
        add(new THREE.CylinderGeometry(0.1, 0.1, 0.02, 24), m, 0, 0.245, 0);
        const spout = add(new THREE.CylinderGeometry(0.012, 0.02, 0.3, 10), m, 0, 0.2, 0.17);
        spout.rotation.x = 0.85;
        add(new THREE.CylinderGeometry(0.03, 0.022, 0.03, 12), m, 0, 0.3, 0.29).rotation.x = 0.85;
        const handle = add(new THREE.TorusGeometry(0.09, 0.012, 8, 20, Math.PI), m, 0, 0.25, -0.03);
        handle.rotation.y = Math.PI / 2;
        break;
      }
      case "flamingo": {
        const pink = mat("#f472b6", 0.35);
        for (const s of [-1, 1]) add(new THREE.CylinderGeometry(0.005, 0.005, 0.42, 6), mat("#e2e8f0", 0.4, { metalness: 0.7 }), s * 0.02, 0.21, 0);
        const body = add(sphere(0.09, 20, 14), pink, 0, 0.5, -0.02);
        body.scale.set(0.8, 0.75, 1.35);
        const neckCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.53, 0.09), new THREE.Vector3(0, 0.65, 0.13), new THREE.Vector3(0, 0.73, 0.05), new THREE.Vector3(0, 0.79, 0.08)]);
        add(new THREE.TubeGeometry(neckCurve, 16, 0.018, 8), pink, 0, 0, 0);
        add(sphere(0.035, 14, 10), pink, 0, 0.8, 0.1);
        const beak = add(new THREE.ConeGeometry(0.014, 0.06, 10), mat("#111827", 0.4), 0, 0.78, 0.15);
        beak.rotation.x = 2.2;
        const tail = add(new THREE.ConeGeometry(0.05, 0.1, 10), pink, 0, 0.52, -0.15);
        tail.rotation.x = -1.4;
        break;
      }
      case "stein": {
        const geo = new THREE.DodecahedronGeometry(0.2, 1);
        const p = geo.attributes.position;
        const r = seeded(11);
        for (let i = 0; i < p.count; i++) {
          const k = 0.85 + r() * 0.25;
          p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.65, p.getZ(i) * k);
        }
        geo.computeVertexNormals();
        add(geo, mat("#8a8a86", 0.9, { flatShading: true }), 0, 0.07, 0);
        break;
      }
      case "huegel": {
        const geo = new THREE.SphereGeometry(0.24, 20, 10, 0, TAU, 0, Math.PI / 2);
        const p = geo.attributes.position;
        const r = seeded(5);
        for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) * (0.45 + r() * 0.12));
        geo.computeVertexNormals();
        add(geo, mat("#5b3d26", 1), 0, 0, 0);
        for (let i = 0; i < 8; i++) add(sphere(0.03, 6, 5), mat("#4a3020", 1), (r() - 0.5) * 0.35, 0.02, (r() - 0.5) * 0.35);
        break;
      }
    }
    return g;
  }

  function updateObstacles(now) {
    const ids = new Set(S.obstacles.map((o) => o.id));
    for (const [id, o] of G.obstacles) {
      if (!ids.has(id)) {
        G.scene.remove(o);
        G.obstacles.delete(id);
      }
    }
    for (const o of S.obstacles) {
      let m = G.obstacles.get(o.id);
      if (!m) {
        m = makeObstacle(o.k);
        m.position.copy(P(o.x, o.y));
        m.rotation.y = o.rot;
        m.userData.born = o.id === S.lastPlaced && !firstObstacles ? now : 0;
        G.obstacles.set(o.id, m);
        G.scene.add(m);
      }
      // Neues Hindernis fällt mit einem kleinen Hüpfer auf den Rasen
      const t = m.userData.born ? (now - m.userData.born) / 1000 : 9;
      if (t < 1.2) {
        const fall = Math.max(0, 1 - t / 0.45);
        m.position.y = fall * fall * 3 + (t > 0.45 ? Math.abs(Math.sin((t - 0.45) * 9)) * 0.08 * (1.2 - t) : 0);
      } else m.position.y = 0;
    }
    firstObstacles = false;
  }
  let firstObstacles = true;

  // --- Kamera ---

  function fov() {
    const asp = G.size.w / G.size.h;
    // Hochformat: genug Breite zeigen
    const hf = asp < 1 ? 70 : 62;
    const v = (2 * Math.atan(Math.tan((hf * Math.PI) / 360) / asp) * 180) / Math.PI;
    return Math.max(42, Math.min(80, v));
  }

  function hfov(camera) {
    return 2 * Math.atan(Math.tan((camera.fov * Math.PI) / 360) * camera.aspect);
  }

  // Abstand, damit eine Breite w ins Bild passt
  function fitDist(w) {
    return w / 2 / Math.tan(hfov(G.camera) / 2);
  }

  function rowBounds(extra = []) {
    const xs = [H.seatX(S, 0) - 0.7, H.seatX(S, S.players.length - 1) + 0.7, ...extra];
    return { min: Math.min(...xs), max: Math.max(...xs) };
  }

  function cameraTarget(now, balls) {
    const t = playing ? (now - playing.t0) / 1000 : 0;
    const a = playing?.a;
    // Wurf läuft: Kamera fliegt der Kugel hinterher
    if (a && t < a.dur + 1.2) {
      const b = balls.get(a.ball) ?? { x: a.land[0], y: a.land[1], h: 0 };
      const fromX = a.from[0];
      const back = Math.min(3.5, 2 + b.y * 0.12);
      return { pos: P(b.x * 0.75 + fromX * 0.25, b.y - back - 0.4, 1.4 + b.y * 0.06), look: P(b.x, b.y + 0.6, 0.1), k: 4 };
    }
    const w = S.white;
    switch (S.phase) {
      case "white":
      case "throw": {
        const thr = H.thrower(S);
        const x = H.seatX(S, S.players.indexOf(thr));
        const fx = w ? w.x : x * 0.4;
        const fy = w ? w.y : 7;
        return { pos: P(x + 0.7, -3.4, 2.35), look: P(x * 0.35 + fx * 0.65, fy * 0.85, 0), k: 2.5 };
      }
      case "result": {
        // Von schräg oben auf die weiße Kugel, so dass die meisten Kugeln drauf sind
        const ds = [...balls].filter(([id]) => id !== "@w").map(([, b]) => Math.hypot(b.x - w.x, b.y - w.y)).sort((a, b) => a - b);
        const r = Math.min(3, Math.max(0.8, ds[Math.max(0, ds.length - 2)] ?? 1));
        const d = 0.9 + r * 1.5;
        return { pos: P(w.x, w.y - d * 0.55, d * 1.25), look: P(w.x, w.y + 0.05, 0), k: 2.5 };
      }
      case "drink": {
        // Nah an die Trinkenden, die Stuhlreihe dahinter
        const pts = S.drink.list.map((d) => G.people.get(d.n)?.pos).filter(Boolean);
        if (!pts.length) break;
        const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
        const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
        const spread = Math.max(1.2, ...pts.map((p) => Math.abs(p.x - cx) * 2 + 1));
        const d = Math.max(2.6, fitDist(spread) * 1.1);
        return { pos: P(cx - d * 0.35, cy + d * 0.95, 1.55), look: P(cx, cy, 1.0), k: 1.6 };
      }
      case "bow": {
        const target = H.bowTargets(S)[S.bow.ti];
        const tx = H.seatX(S, Math.max(0, S.players.indexOf(target)));
        return { pos: P(tx + 1.9, H.CHAIR_Y + 2.6, 1.45), look: P(tx + 0.1, H.CHAIR_Y + 0.4, 0.85), k: 2 };
      }
      case "task": {
        const still = ["jacks", "squat", "sing"].includes(H.TASKS[S.task.i].a);
        if (S.task.stage === "run" && !still) return { pos: P(0, -4.2, 4.6), look: P(0, 5.5, 0), k: 1.5 };
        return { pos: P(1.2, 3.6, 1.6), look: P(0, 0.4, 0.9), k: 1.8 };
      }
      case "place": {
        const b = rowBounds();
        return { pos: P(0, 1.2, 11), look: P(0, 8, 0), k: 1.6, b };
      }
    }
    return { pos: P(0, -3, 2.2), look: P(0, 6, 0), k: 2 };
  }

  // --- Zielen, Platzieren ---

  let aimStart = null; // { x, y } Bildschirm
  let aimPull = null; // { dx, dy, power, angle }
  let aimAngle = null;
  let pendingK = null;
  let ghostAt = null;

  function canAct(name) {
    if (typeof run === "undefined" || !run || isBot(name)) return false;
    if (!run.me || run.me === name) return true;
    return !!run.host && run.offline(name);
  }

  function canThrow() {
    if (!S || (S.phase !== "white" && S.phase !== "throw")) return false;
    if (pendingK === S.k || animLeftMs() > 0) return false;
    return canAct(H.thrower(S));
  }

  function canPlace() {
    return !!S && S.phase === "place" && !!S.place.kind && pendingK !== S.k && canAct(S.place.who);
  }

  function pulling() {
    return !!aimPull && aimPull.power > 0.03;
  }

  function maxPull() {
    return Math.min(hud.clientHeight * 0.42, 280);
  }

  function onDown(e) {
    if (canThrow()) {
      hud.setPointerCapture(e.pointerId);
      aimStart = { x: e.clientX, y: e.clientY };
      aimPull = { dx: 0, dy: 0, power: 0, angle: 0 };
    } else if (canPlace()) {
      hud.setPointerCapture(e.pointerId);
      ghostAt = groundAt(e);
    }
  }

  function onMove(e) {
    if (aimStart) {
      const dx = e.clientX - aimStart.x;
      const dy = e.clientY - aimStart.y;
      const len = Math.hypot(dx, Math.max(0, dy));
      const power = Math.min(1, Math.max(0, dy) / maxPull());
      const angle = Math.max(-0.75, Math.min(0.75, Math.atan2(-dx, Math.max(30, dy)) * 0.8));
      aimPull = { dx, dy, power, angle, len };
      aimAngle = angle;
    } else if (ghostAt && canPlace()) ghostAt = groundAt(e);
  }

  function onUp(e) {
    if (aimStart) {
      const pull = aimPull;
      aimStart = null;
      aimPull = null;
      if (e.type === "pointerup" && pull && pull.power >= 0.06 && canThrow()) {
        pendingK = S.k;
        run.send({ type: "throw", k: S.k, a: pull.angle, p: pull.power });
      }
      return;
    }
    if (ghostAt && canPlace()) {
      const at = groundAt(e);
      ghostAt = null;
      if (e.type === "pointerup" && at) {
        pendingK = S.k;
        run.send({ type: "place", k: S.k, kind: S.place.kind, x: at.x, y: at.y });
      }
    }
  }

  function groundAt(e) {
    const r = hud.getBoundingClientRect();
    const v = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    G.ray.setFromCamera(v, G.camera);
    const hit = new THREE.Vector3();
    if (!G.ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit)) return null;
    const x = hit.x;
    const y = -hit.z;
    if (Math.abs(x) > 6.6 || y < 1.2 || y > 15) return null;
    return { x, y };
  }

  function updateGhost() {
    const kind = S.phase === "place" && canAct(S.place.who) ? S.place.kind : null;
    if (G.ghostKind !== kind) {
      if (G.ghost) G.scene.remove(G.ghost);
      G.ghost = null;
      G.ghostKind = kind;
      if (kind) {
        G.ghost = makeObstacle(kind);
        G.ghost.traverse((o) => {
          if (o.isMesh) {
            o.material = o.material.clone();
            o.material.transparent = true;
            o.material.opacity = 0.55;
            o.castShadow = false;
          }
        });
        G.scene.add(G.ghost);
      }
    }
    if (G.ghost) {
      G.ghost.visible = !!ghostAt;
      if (ghostAt) G.ghost.position.copy(P(ghostAt.x, ghostAt.y));
    }
  }

  // --- Zeichnen ---

  function project(v) {
    const p = v.clone().project(G.camera);
    if (p.z > 1) return null;
    return { x: (p.x * 0.5 + 0.5) * G.size.w, y: (-p.y * 0.5 + 0.5) * G.size.h };
  }

  let placed = []; // schon gezeichnete Schilder, damit sich keine überdecken
  function label(text, x, y, opt = {}) {
    hctx.font = `700 ${opt.size ?? 13}px system-ui, sans-serif`;
    const w = hctx.measureText(text).width + 14;
    const h = (opt.size ?? 13) + 9;
    if (opt.avoid) {
      for (let tries = 0; tries < 8; tries++) {
        const hit = placed.find((r) => Math.abs(r.x - x) < (r.w + w) / 2 + 2 && Math.abs(r.y - y) < (r.h + h) / 2 + 1);
        if (!hit) break;
        y = hit.y - hit.h - 2;
      }
      placed.push({ x, y, w, h });
    }
    hctx.fillStyle = opt.bg ?? "rgba(15,12,30,0.62)";
    hctx.beginPath();
    if (hctx.roundRect) hctx.roundRect(x - w / 2, y - h, w, h, h / 2);
    else hctx.rect(x - w / 2, y - h, w, h);
    hctx.fill();
    if (opt.dot) {
      hctx.fillStyle = opt.dot;
      hctx.beginPath();
      hctx.arc(x - w / 2 + 9, y - h / 2, 4, 0, TAU);
      hctx.fill();
    }
    hctx.fillStyle = opt.color ?? "#fff";
    hctx.textAlign = "center";
    hctx.textBaseline = "middle";
    hctx.fillText(text, x + (opt.dot ? 5 : 0), y - h / 2 + 0.5);
  }

  function shortName(n) {
    const t = n.replace(/^🤖 /, "🤖");
    return t.length > 12 ? `${t.slice(0, 11)}…` : t;
  }

  function drawHud(now, balls) {
    const { w, h } = G.size;
    hctx.clearRect(0, 0, w, h);
    placed = [];
    const t = phaseSeen.has(phaseKey()) ? (now - phaseSeen.get(phaseKey())) / 1000 : 0;

    // Namen über den Köpfen
    const showNames = S.phase !== "result" && S.phase !== "place";
    if (showNames) {
      for (const [name, p] of G.people) {
        const head = p.root.position.clone();
        head.y += (p.look.height / 1.78) * (p.J.hipY + 0.9);
        const s = project(head);
        if (!s || s.x < -40 || s.x > w + 40) continue;
        const actor = name === H.thrower(S) || (S.phase === "bow" && name === S.bow.queue[0]) || (S.phase === "task" && name === S.task.who);
        const dist = G.camera.position.distanceTo(head);
        if (!actor && dist > 9) continue;
        label(shortName(name), s.x, s.y - 4, { avoid: true, size: actor ? 14 : 11, bg: actor ? "rgba(250,204,21,0.92)" : undefined, color: actor ? "#1b1033" : "#fff", dot: S.phase === "throw" || S.phase === "white" ? ballColor(name) : null });
      }
    }

    // Kugeln beschriften, im Ergebnis mit Abstand zur weißen Kugel
    const wb = balls.get("@w");
    if (S.phase === "result" && wb && !playing) {
      const ws = project(P(wb.x, wb.y, 0.02));
      for (const [id, b] of balls) {
        if (id === "@w") continue;
        const s = project(P(b.x, b.y, 0.02));
        if (!s || !ws) continue;
        const far = id === S.result.far;
        const near = id === S.result.near;
        hctx.strokeStyle = far ? "#f87171" : near ? "#4ade80" : "rgba(255,255,255,0.7)";
        hctx.lineWidth = far || near ? 3 : 1.5;
        hctx.setLineDash(far || near ? [] : [5, 5]);
        hctx.beginPath();
        hctx.moveTo(ws.x, ws.y);
        hctx.lineTo(s.x, s.y);
        hctx.stroke();
        hctx.setLineDash([]);
      }
      for (const [id, b] of balls) {
        if (id === "@w") continue;
        const s = project(P(b.x, b.y, 0.2));
        if (!s) continue;
        const d = S.result.dist[id];
        const touched = S.touched.includes(id);
        const far = id === S.result.far;
        const near = id === S.result.near;
        label(`${shortName(id)} ${d.toFixed(2).replace(".", ",")} m${touched ? " ⚠️" : ""}`, s.x, s.y, { avoid: true, size: 12, dot: ballColor(id), bg: far ? "rgba(185,28,28,0.9)" : near ? "rgba(21,128,61,0.92)" : undefined });
      }
    } else if (S.phase === "throw" || S.phase === "white") {
      for (const [id, b] of balls) {
        const s = project(P(b.x, b.y, (id === "@w" ? H.W_R : H.B_R) * 2 + 0.08));
        if (!s) continue;
        if (id === "@w") {
          const d = G.camera.position.distanceTo(P(b.x, b.y));
          if (d > 4) label("⚪", s.x, s.y, { size: 12, bg: "rgba(255,255,255,0.25)" });
        } else if (!b.air) label(shortName(id), s.x, s.y, { avoid: true, size: 10, dot: ballColor(id) });
      }
    }

    // Zielhilfe: Richtung auf dem Rasen und Kraftbalken
    if (aimPull && canThrow()) {
      const thr = H.thrower(S);
      const x0 = H.seatX(S, S.players.indexOf(thr));
      const a = aimPull.angle;
      hctx.strokeStyle = "rgba(255,255,255,0.85)";
      hctx.lineWidth = 3;
      hctx.setLineDash([8, 8]);
      hctx.beginPath();
      let first = true;
      for (let d = 0.3; d <= 4; d += 0.3) {
        const s = project(P(x0 + Math.sin(a) * d, H.THROW_Y + Math.cos(a) * d, 0.01));
        if (!s) continue;
        if (first) hctx.moveTo(s.x, s.y);
        else hctx.lineTo(s.x, s.y);
        first = false;
      }
      hctx.stroke();
      hctx.setLineDash([]);
      // Kraft
      const bh = Math.min(h * 0.5, 220);
      const bx = w - 26;
      const by = h / 2 + bh / 2;
      hctx.fillStyle = "rgba(15,12,30,0.55)";
      hctx.fillRect(bx - 9, by - bh - 4, 18, bh + 8);
      const grad = hctx.createLinearGradient(0, by, 0, by - bh);
      grad.addColorStop(0, "#22c55e");
      grad.addColorStop(0.6, "#facc15");
      grad.addColorStop(1, "#ef4444");
      hctx.fillStyle = grad;
      hctx.fillRect(bx - 5, by - bh * aimPull.power, 10, bh * aimPull.power);
      hctx.fillStyle = "#fff";
      hctx.font = "700 12px system-ui, sans-serif";
      hctx.textAlign = "center";
      hctx.fillText("Kraft", bx, by + 18);
    } else if (canThrow() && !playing) {
      // Hinweis zum Werfen
      const pulse = 0.6 + 0.4 * Math.sin(now / 350);
      hctx.globalAlpha = pulse;
      label("👆 nach unten ziehen und loslassen", w / 2, h - 14, { size: 13 });
      hctx.globalAlpha = 1;
    }

    // Uhr beim Trinken und bei der Aufgabe
    let clock = null;
    if (S.phase === "drink") {
      const left = H.DRINK_SECS - t;
      clock = left > 0 ? `⏱ ${fmtClock(left)}` : "⏱ Zeit um!";
      for (const d of S.drink.list) {
        const p = G.people.get(d.n);
        if (!p) continue;
        const head = p.root.position.clone();
        head.y += (p.look.height / 1.78) * (p.J.hipY + 1.05);
        const s = project(head);
        if (s && d.done) label("✓ leer", s.x, s.y - 22, { size: 12, bg: "rgba(21,128,61,0.92)" });
      }
    } else if (S.phase === "task" && S.task.stage === "run") {
      const left = H.TASKS[S.task.i].s - t;
      clock = left > 0 ? `⏱ ${fmtClock(left)}` : "⏱ Zeit um!";
    }
    if (clock) label(clock, w / 2, 44, { size: 20, bg: clock.includes("um") ? "rgba(185,28,28,0.9)" : "rgba(15,12,30,0.7)" });

    if (S.phase === "place" && canPlace() && !ghostAt) {
      const pulse = 0.6 + 0.4 * Math.sin(now / 350);
      hctx.globalAlpha = pulse;
      label("👆 auf den Rasen tippen", w / 2, h - 14, { size: 13 });
      hctx.globalAlpha = 1;
    }
  }

  function fmtClock(s) {
    s = Math.ceil(s);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }

  function frame(now) {
    raf = 0;
    if (!el || !el.isConnected || !S) return; // Spiel verlassen: Schleife ruht bis zum nächsten mount()
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - (lastNow || now)) / 1000);
    lastNow = now;
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (!w || !h) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (hud.width !== Math.round(w * dpr) || hud.height !== Math.round(h * dpr)) {
      hud.width = Math.round(w * dpr);
      hud.height = Math.round(h * dpr);
    }
    hctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!G) {
      hctx.clearRect(0, 0, w, h);
      hctx.fillStyle = "#fff";
      hctx.font = "600 15px system-ui, sans-serif";
      hctx.textAlign = "center";
      hctx.fillText(failed ? "3D geht auf diesem Gerät leider nicht." : "Lädt…", w / 2, h / 2);
      return;
    }
    const size = `${w}x${h}`;
    if (G.sizeKey !== size) {
      G.renderer.setSize(w, h, false);
      G.size = { w, h };
      G.sizeKey = size;
    }
    G.camera.aspect = w / h;
    G.camera.fov = fov();
    G.camera.updateProjectionMatrix();
    G.timeU.value = now / 1000;

    syncChairs();
    const balls = updateBalls(now);
    updatePeople(now, dt);
    updateObstacles(now);
    updateGhost();

    const tgt = debugCam ? { pos: debugCam.pos, look: debugCam.look, k: 50 } : cameraTarget(now, balls);
    if (!G.cam) {
      G.cam = tgt.pos.clone();
      G.look = tgt.look.clone();
    }
    const k = 1 - Math.exp(-dt * (tgt.k ?? 2));
    G.cam.lerp(tgt.pos, k);
    G.look.lerp(tgt.look, k * 1.2);
    G.camera.position.copy(G.cam);
    G.camera.lookAt(G.look);

    G.renderer.render(G.scene, G.camera);
    drawHud(now, balls);
  }

  // Für Tests: ?debug
  let debugCam = null;
  if (/[?&]debug/.test(location.search)) {
    window.hrDebug = {
      get G() {
        return G;
      },
      cam(pos, look) {
        debugCam = pos ? { pos: P(...pos), look: P(...look) } : null;
      },
      people: () => G.people,
      POSES,
    };
  }

  return { mount, holdMs, animEndsAt };
})();
