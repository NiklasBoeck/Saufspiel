// Kistenturm in 3D (three.js): Abends im Biergarten, Lichterketten, Bierbänke, und mitten drin der Turm aus Bierkisten.
// Bewusst sparsam fürs iPhone: keine Schatten, wenige Objekte, Texturen einmal auf ein Canvas gemalt.
// Das Canvas bleibt erhalten, wenn die App neu zeichnet; mount() hängt es nur wieder ein.
window.Kistenturm3D = (() => {
  "use strict";
  const K = window.Kistenturm;
  const { W, D, H } = K;
  const MOBILE = /iPhone|iPad|iPod|Android|Mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform));
  const LOW = /[?&]lowgfx/.test(location.search);
  const PALETTE = [
    { body: "#1f7a3a", dark: "#145227", label: "#f5d76e", text: "HELLES" },
    { body: "#b91c1c", dark: "#7f1212", label: "#fde68a", text: "MÄRZEN" },
    { body: "#1d4ed8", dark: "#163a9e", label: "#e0f2fe", text: "PILS" },
    { body: "#a16207", dark: "#713f05", label: "#fef3c7", text: "WEIZEN" },
    { body: "#334155", dark: "#1e293b", label: "#f8fafc", text: "DUNKEL" },
  ];
  const HOVER = 0.3; // so hoch schwebt die neue Kiste über dem Turm

  let S = null;
  let el = null;
  let canvas = null;
  let G = null;
  let failed = false;
  let raf = 0;
  let last = 0;
  let lost = false;

  // --- Einhängen ---

  function mount(root, s) {
    S = s;
    if (!el) {
      el = document.createElement("div");
      el.className = "kt-stage";
      newCanvas();
    }
    const spot = root.querySelector(".kt-mount");
    if (spot && el.parentNode !== spot) spot.appendChild(el);
    if (!G && !failed) init();
    const wait = G ? sync() : 0;
    if (!raf) raf = requestAnimationFrame(frame);
    return wait;
  }

  function newCanvas() {
    const c = document.createElement("canvas");
    c.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      lost = true;
    });
    c.addEventListener("webglcontextrestored", () => {
      lost = false;
      rebuild();
    });
    if (canvas) canvas.replaceWith(c);
    else el.appendChild(c);
    canvas = c;
  }

  function rebuild() {
    try {
      G?.renderer.dispose();
    } catch {}
    G = null;
    newCanvas();
    init();
    if (G) sync(true);
  }

  // --- Texturen (einmal gemalt) ---

  function tex(w, h, paint) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    paint(c.getContext("2d"), w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }

  function rr(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  // Lange Seite: Rippen, Etikett mit Sorte
  function sideLong(p) {
    return tex(256, 180, (g, w, h) => {
      g.fillStyle = p.body;
      g.fillRect(0, 0, w, h);
      g.fillStyle = "rgba(255,255,255,0.08)";
      g.fillRect(0, 0, w, 10);
      g.fillStyle = p.dark;
      for (let i = 0; i < 6; i++) g.fillRect(14 + i * 45, 18, 8, h - 34);
      g.fillRect(0, h - 12, w, 12);
      g.fillStyle = p.label;
      rr(g, 54, 52, 148, 70, 10);
      g.fill();
      g.fillStyle = p.dark;
      g.font = "900 30px system-ui, sans-serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(p.text, 128, 88);
    });
  }

  // Kurze Seite: Griffloch
  function sideShort(p) {
    return tex(180, 180, (g, w, h) => {
      g.fillStyle = p.body;
      g.fillRect(0, 0, w, h);
      g.fillStyle = "rgba(255,255,255,0.08)";
      g.fillRect(0, 0, w, 10);
      g.fillStyle = p.dark;
      g.fillRect(0, h - 12, w, 12);
      g.fillStyle = "#0b0b0b";
      rr(g, 46, 26, 88, 30, 15);
      g.fill();
    });
  }

  // Oben: 20 Flaschen mit Kronkorken
  function top(p) {
    return tex(256, 184, (g, w, h) => {
      g.fillStyle = p.dark;
      g.fillRect(0, 0, w, h);
      g.strokeStyle = p.body;
      g.lineWidth = 10;
      g.strokeRect(5, 5, w - 10, h - 10);
      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 5; c++) {
          const x = 30 + c * 49;
          const y = 30 + r * 41;
          g.fillStyle = "#3b2a10";
          g.beginPath();
          g.arc(x, y, 18, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = "#d4d4d8";
          g.beginPath();
          g.arc(x, y, 12, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = p.body;
          g.beginPath();
          g.arc(x, y, 7, 0, Math.PI * 2);
          g.fill();
        }
      }
    });
  }

  // --- Szene ---

  function init() {
    try {
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: !LOW, powerPreference: "default" });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, LOW ? 1 : MOBILE ? 1.5 : 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.15;
      const scene = new THREE.Scene();
      scene.fog = new THREE.Fog(0x2a2050, 18, 48);
      const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 120);

      scene.add(sky());
      scene.add(new THREE.HemisphereLight(0xffd9a8, 0x2d3b22, 1.6));
      const sun = new THREE.DirectionalLight(0xffc98a, 1.8);
      sun.position.set(-6, 9, 7);
      scene.add(sun);
      const fill = new THREE.DirectionalLight(0x9fb8ff, 0.6);
      fill.position.set(7, 4, -6);
      scene.add(fill);

      addGarden(scene);

      const box = new THREE.BoxGeometry(W, H, D);
      const mats = PALETTE.map((p) => {
        const long = new THREE.MeshLambertMaterial({ map: sideLong(p) });
        const short = new THREE.MeshLambertMaterial({ map: sideShort(p) });
        const up = new THREE.MeshLambertMaterial({ map: top(p) });
        const down = new THREE.MeshLambertMaterial({ color: p.dark });
        return [short, short, up, down, long, long]; // +x, -x, +y, -y, +z, -z
      });

      // Weicher Schatten unter dem Turm (nur ein Bild, keine echten Schatten)
      const blob = new THREE.Mesh(
        new THREE.PlaneGeometry(2.6, 2.2),
        new THREE.MeshBasicMaterial({
          map: tex(128, 128, (g) => {
            const r = g.createRadialGradient(64, 64, 4, 64, 64, 64);
            r.addColorStop(0, "rgba(0,0,0,0.55)");
            r.addColorStop(1, "rgba(0,0,0,0)");
            g.fillStyle = r;
            g.fillRect(0, 0, 128, 128);
          }),
          transparent: true,
          depthWrite: false,
        })
      );
      blob.rotation.x = -Math.PI / 2;
      blob.position.y = 0.005;
      scene.add(blob);

      G = { renderer, scene, camera, box, mats, crates: new Map(), moving: null, falling: [], fallId: null, camY: 2, camD: 6, sizeKey: "" };
    } catch (err) {
      console.error(err);
      failed = true;
      G = null;
    }
  }

  function sky() {
    const m = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: "varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: `varying vec3 vDir;
        void main(){
          float y = vDir.y;
          vec3 top = vec3(0.10, 0.08, 0.30);
          vec3 mid = vec3(0.45, 0.22, 0.45);
          vec3 hor = vec3(1.0, 0.55, 0.30);
          vec3 c = y > 0.12 ? mix(mid, top, smoothstep(0.12, 0.7, y)) : mix(hor, mid, smoothstep(-0.05, 0.12, y));
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    return new THREE.Mesh(new THREE.SphereGeometry(100, 24, 12), m);
  }

  function addGarden(scene) {
    // Kies-Boden
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(60, 40),
      new THREE.MeshLambertMaterial({
        map: (() => {
          const t = tex(256, 256, (g, w, h) => {
            g.fillStyle = "#7f7462";
            g.fillRect(0, 0, w, h);
            for (let i = 0; i < 2600; i++) {
              const v = 112 + Math.floor(Math.random() * 40);
              g.fillStyle = `rgb(${v + 12},${v + 4},${v - 14})`;
              g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
            }
          });
          t.wrapS = t.wrapT = THREE.RepeatWrapping;
          t.repeat.set(70, 70);
          return t;
        })(),
      })
    );
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    const wood = new THREE.MeshLambertMaterial({ color: 0x9a6b3c });
    const woodDark = new THREE.MeshLambertMaterial({ color: 0x6b4423 });
    // Bierbänke und Tische im Kreis
    const set = (x, z, ry) => {
      const g = new THREE.Group();
      const table = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.06, 0.7), wood);
      table.position.y = 0.76;
      g.add(table);
      for (const s of [-0.75, 0.75]) {
        const bench = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.05, 0.28), wood);
        bench.position.set(0, 0.46, s);
        g.add(bench);
        for (const lx of [-0.9, 0.9]) {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.46, 0.24), woodDark);
          leg.position.set(lx, 0.23, s);
          g.add(leg);
        }
      }
      for (const lx of [-0.9, 0.9]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.74, 0.6), woodDark);
        leg.position.set(lx, 0.37, 0);
        g.add(leg);
      }
      // Maßkrüge auf dem Tisch
      const glass = new THREE.MeshLambertMaterial({ color: 0xf2b233, emissive: 0x5a3a00, emissiveIntensity: 0.4 });
      for (const mx of [-0.6, 0.1, 0.7]) {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.18, 10), glass);
        m.position.set(mx, 0.88, (mx * 7) % 2 > 1 ? 0.15 : -0.12);
        g.add(m);
      }
      g.position.set(x, 0, z);
      g.rotation.y = ry;
      scene.add(g);
    };
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + 0.3;
      const r = 5.2 + (i % 2) * 1.6;
      set(Math.cos(a) * r, Math.sin(a) * r, -a + Math.PI / 2);
    }

    // Kastanienbäume
    const trunk = new THREE.MeshLambertMaterial({ color: 0x4a3222 });
    const leaves = new THREE.MeshLambertMaterial({ color: 0x2f6b2a });
    const crown = new THREE.IcosahedronGeometry(1.8, 1);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const r = 17 + (i % 3) * 2.5;
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.25, 3, 7), trunk);
      t.position.set(Math.cos(a) * r, 1.5, Math.sin(a) * r);
      scene.add(t);
      const c = new THREE.Mesh(crown, leaves);
      c.position.set(Math.cos(a) * r, 3.8, Math.sin(a) * r);
      c.scale.set(1.2, 1, 1.2);
      scene.add(c);
    }

    // Lichterketten zwischen Masten
    const pole = new THREE.MeshLambertMaterial({ color: 0x3f3f46 });
    const bulbGeo = new THREE.SphereGeometry(0.06, 8, 6);
    const bulbs = [];
    const posts = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.5;
      const p = new THREE.Vector3(Math.cos(a) * 14, 3.6, Math.sin(a) * 14);
      posts.push(p);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 3.6, 6), pole);
      m.position.set(p.x, 1.8, p.z);
      scene.add(m);
    }
    for (let i = 0; i < posts.length; i++) {
      const a = posts[i];
      const b = posts[(i + 1) % posts.length];
      for (let j = 1; j < 14; j++) {
        const t = j / 14;
        const p = a.clone().lerp(b, t);
        p.y -= Math.sin(t * Math.PI) * 0.7;
        bulbs.push(p);
      }
    }
    const inst = new THREE.InstancedMesh(bulbGeo, new THREE.MeshBasicMaterial({ color: 0xffd27a }), bulbs.length);
    const m4 = new THREE.Matrix4();
    bulbs.forEach((p, i) => inst.setMatrixAt(i, m4.makeTranslation(p.x, p.y, p.z)));
    scene.add(inst);
  }

  // --- Kisten ---

  function crateMesh(c) {
    const m = new THREE.Mesh(G.box, G.mats[c % G.mats.length]);
    G.scene.add(m);
    return m;
  }

  const yOf = (i) => i * H + H / 2;

  // Spielstand übernehmen: neue Kisten fallen kurz rein, beim Umkippen fliegen sie runter.
  function sync(force) {
    const now = performance.now();
    const tower = S.tower ?? [];
    const ids = new Set(tower.map((c) => c.id));
    // Neuer Turm: alte Kisten weg (die runtergefallenen bleiben liegen, bis der neue Turm kommt)
    for (const [id, c] of G.crates) {
      if (ids.has(id)) continue;
      G.scene.remove(c.mesh);
      G.crates.delete(id);
    }
    if (!S.fall) {
      G.falling = [];
      G.fallId = null;
    }
    tower.forEach((c, i) => {
      let k = G.crates.get(c.id);
      if (!k) {
        // Gerade gelandet: wenn die Kiste gerade noch geschwebt hat, von dort fallen lassen
        const fromMoving = G.moving && G.moving.id === c.id;
        const mesh = fromMoving ? G.moving.mesh : crateMesh(c.c);
        if (fromMoving) G.moving = null;
        const startY = fromMoving ? mesh.position.y : yOf(i) + (i ? HOVER : 0);
        k = { id: c.id, mesh, i, x: c.x, z: c.z, dropFrom: startY, dropAt: now };
        mesh.position.set(c.x, startY, c.z);
        mesh.rotation.set(0, 0, 0);
        G.crates.set(c.id, k);
      }
      k.i = i;
      k.x = c.x;
      k.z = c.z;
    });
    // Schwebende Kiste: gehört zum aktuellen Zug
    if (S.stage === "place" && S.turn) {
      if (!G.moving || G.moving.id !== S.turn.id) {
        if (G.moving) G.scene.remove(G.moving.mesh);
        G.moving = { id: S.turn.id, turn: S.turn, mesh: crateMesh(S.turn.c), dropped: null };
      }
      G.moving.turn = S.turn;
    } else if (G.moving) {
      G.scene.remove(G.moving.mesh);
      G.moving = null;
    }
    // Umkippen
    if (S.stage === "fall" && S.fall && G.fallId !== S.fall.id) {
      G.fallId = S.fall.id;
      const k0 = S.fall.k;
      const sup = tower[k0];
      let cx = 0;
      let cz = 0;
      const n = tower.length - k0 - 1;
      for (let i = k0 + 1; i < tower.length; i++) {
        cx += tower[i].x / n;
        cz += tower[i].z / n;
      }
      const dx = cx - sup.x;
      const dz = cz - sup.z;
      const len = Math.hypot(dx, dz) || 1;
      const ux = dx / len;
      const uz = dz / len;
      const fresh = force ? 0 : 380; // erst landen, dann kippen
      for (let i = k0 + 1; i < tower.length; i++) {
        const k = G.crates.get(tower[i].id);
        if (!k) continue;
        const h = i - k0;
        k.fallen = true;
        G.falling.push({
          id: k.id,
          mesh: k.mesh,
          k,
          start: now + fresh + (tower.length - i) * 40,
          vx: ux * (0.8 + h * 0.45) + (Math.random() - 0.5) * 0.8,
          vz: uz * (0.8 + h * 0.45) + (Math.random() - 0.5) * 0.8,
          vy: 0.5 + Math.random() * 0.6,
          rx: uz * (2 + Math.random() * 2),
          rz: -ux * (2 + Math.random() * 2),
          ry: (Math.random() - 0.5) * 2,
          resting: false,
        });
      }
      return fresh + 1500;
    }
    return 0;
  }

  // Eigenes Tippen: die Kiste bleibt sofort stehen, wo sie war (bevor der Host antwortet)
  function dropLocal(turn, o) {
    if (G?.moving && G.moving.id === turn.id) G.moving.dropped = o;
  }

  // --- Bild ---

  function frame(now) {
    raf = 0;
    if (!el || !el.isConnected || !S) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - (last || now)) / 1000);
    last = now;
    if (!G || lost) return;
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (!w || !h) return;
    const key = `${w}x${h}`;
    if (G.sizeKey !== key) {
      G.sizeKey = key;
      G.renderer.setSize(w, h, false);
      G.camera.aspect = w / h;
      G.camera.updateProjectionMatrix();
    }

    const tower = S.tower ?? [];
    // Kisten im Turm: kurz reinfallen lassen
    for (const k of G.crates.values()) {
      if (k.fallen) continue;
      const y = yOf(k.i);
      const t = Math.min(1, (now - k.dropAt) / 260);
      k.mesh.position.set(k.x, k.dropFrom + (y - k.dropFrom) * t * t, k.z);
    }
    // Schwebende Kiste
    if (G.moving) {
      const t = G.moving.turn;
      const topC = tower[tower.length - 1];
      const o = G.moving.dropped ?? K.swing(t, K.turnTime(t));
      const p = { x: topC.x, z: topC.z };
      p[t.axis] = o;
      const y = yOf(tower.length) + HOVER;
      G.moving.mesh.position.set(p.x, y + (G.moving.dropped == null ? Math.sin(now / 300) * 0.03 : 0), p.z);
    }
    // Umfallen: einfache Schwerkraft, auf dem Boden ausrollen
    for (const f of G.falling) {
      if (now < f.start || f.resting) continue;
      const m = f.mesh;
      f.vy -= 9.8 * dt;
      m.position.x += f.vx * dt;
      m.position.y += f.vy * dt;
      m.position.z += f.vz * dt;
      m.rotation.x += f.rx * dt;
      m.rotation.z += f.rz * dt;
      m.rotation.y += f.ry * dt;
      const floor = 0.36;
      if (m.position.y < floor) {
        m.position.y = floor;
        if (Math.abs(f.vy) < 1.2) {
          f.resting = true;
          // flach hinlegen (auf die nächste Seite)
          const snap = (a) => Math.round(a / (Math.PI / 2)) * (Math.PI / 2);
          m.rotation.x = snap(m.rotation.x);
          m.rotation.z = snap(m.rotation.z);
          m.position.y = 0.36;
        } else {
          f.vy = -f.vy * 0.3;
          f.vx *= 0.6;
          f.vz *= 0.6;
          f.rx *= 0.5;
          f.rz *= 0.5;
          f.ry *= 0.5;
        }
      }
    }

    // Kamera: schräg von vorne oben, folgt der Turmspitze, hochkant etwas weiter weg
    const n = S.stage === "fall" ? Math.max(3, (S.fall?.k ?? 0) + 3) : tower.length + 1;
    const aspect = w / h;
    const wantY = Math.max(1.2, n * H);
    // Hochkant: weiterer Blickwinkel, damit die schwingende Kiste ganz zu sehen ist
    const fov = aspect < 1 ? 64 : 50;
    if (G.camera.fov !== fov) {
      G.camera.fov = fov;
      G.camera.updateProjectionMatrix();
    }
    const hfov = 2 * Math.atan(Math.tan((fov * Math.PI) / 360) * aspect);
    const wantD = Math.max(4.6 + n * 0.12, 2.1 / Math.tan(hfov / 2));
    G.camY += (wantY - G.camY) * Math.min(1, dt * 2.5);
    G.camD += (wantD - G.camD) * Math.min(1, dt * 2.5);
    const a = 0.72;
    G.camera.position.set(Math.sin(a) * G.camD, G.camY + 0.8 + G.camD * 0.3, Math.cos(a) * G.camD);
    G.camera.lookAt(0, G.camY - 0.35, 0);

    G.renderer.render(G.scene, G.camera);
  }

  return { mount, dropLocal };
})();
