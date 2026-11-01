// Flaschendrehen in 3D (three.js): runder Holztisch in einer warmen Kneipe, Stühle, Bierkrüge auf Bierdeckeln,
// in der Mitte die grüne Flasche. Namen sind HTML-Schilder über den Stühlen (scharf auf jedem Handy).
// Bewusst sparsam fürs iPhone: keine Schatten, wenige Objekte, Texturen einmal auf ein Canvas gemalt.
window.Flasche3D = (() => {
  "use strict";
  const F = window.Flasche;
  const MOBILE = /iPhone|iPad|iPod|Android|Mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform));
  const LOW = /[?&]lowgfx/.test(location.search);
  const TABLE_R = 1.7;
  const TABLE_Y = 0.76; // Tischplatte oben
  const BOTTLE_R = 0.13;
  const SEAT_R = 2.25; // Stühle
  const MUG_R = 1.4; // Krüge auf dem Tisch
  const TOP = 100; // hochkant: so viel Platz (px) oben für den Titel, unten für Aufgabe und Knöpfe
  const BOTTOM = 210;
  const COLORS = ["#f43f5e", "#3b82f6", "#f59e0b", "#10b981", "#a855f7", "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1", "#14b8a6", "#eab308", "#ef4444", "#8b5cf6", "#22c55e", "#0ea5e9"];

  let S = null;
  let ME = null;
  let el = null;
  let canvas = null;
  let names = null;
  let G = null;
  let failed = false;
  let raf = 0;
  let last = 0;
  let lost = false;
  let held = null; // { id, a } während der Finger die Flasche hält
  let local = null; // eigener Dreh, bevor der Host antwortet
  let nudgeAt = -1e9;

  // --- Einhängen ---

  function mount(root, s, me) {
    S = s;
    ME = me;
    if (!el) {
      el = document.createElement("div");
      el.className = "fl-stage";
      names = document.createElement("div");
      names.className = "fl-names";
      newCanvas();
      el.appendChild(names);
    }
    const spot = root.querySelector(".fl-mount");
    if (spot && el.parentNode !== spot) spot.appendChild(el);
    if (!G && !failed) init();
    if (G) syncSeats();
    if (S.stage !== "spin") held = null;
    if (local && S.turn?.id !== local.id && S.spin?.id !== local.id) local = null;
    if (!raf) raf = requestAnimationFrame(frame);
    return 0;
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
    else el.prepend(c);
    canvas = c;
  }

  function rebuild() {
    try {
      G?.renderer.dispose();
    } catch {}
    G = null;
    newCanvas();
    init();
    if (G) syncSeats();
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

  // Holzbretter mit Maserung
  function planks(w, h, n, base, seed) {
    return tex(w, h, (g) => {
      let r = seed;
      const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
      const bh = h / n;
      for (let i = 0; i < n; i++) {
        const l = 0.85 + rnd() * 0.3;
        g.fillStyle = `rgb(${base[0] * l | 0},${base[1] * l | 0},${base[2] * l | 0})`;
        g.fillRect(0, i * bh, w, bh);
        g.strokeStyle = "rgba(40,20,5,0.18)";
        g.lineWidth = 1.2;
        for (let k = 0; k < 7; k++) {
          const y = i * bh + rnd() * bh;
          const amp = 1 + rnd() * 3;
          const f = 0.01 + rnd() * 0.02;
          const ph = rnd() * 10;
          g.beginPath();
          for (let x = 0; x <= w; x += 8) g.lineTo(x, y + Math.sin(x * f + ph) * amp);
          g.stroke();
        }
        g.fillStyle = "rgba(20,10,0,0.45)";
        g.fillRect(0, i * bh, w, 2);
      }
    });
  }

  function labelTex() {
    return tex(512, 128, (g, w, h) => {
      g.fillStyle = "#f6ecd2";
      g.fillRect(0, 0, w, h);
      g.fillStyle = "#b91c1c";
      g.fillRect(0, 8, w, 14);
      g.fillRect(0, h - 22, w, 14);
      g.fillStyle = "#14532d";
      g.font = "900 46px system-ui, sans-serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText("SAUFOMAT", w / 4, h / 2 + 2);
      g.fillText("SAUFOMAT", (3 * w) / 4, h / 2 + 2);
    });
  }

  // Bierdeckel in Spielerfarbe
  function coasterTex(col) {
    return tex(128, 128, (g) => {
      g.fillStyle = "#fbf6ea";
      g.beginPath();
      g.arc(64, 64, 63, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = col;
      g.lineWidth = 10;
      g.beginPath();
      g.arc(64, 64, 52, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = col;
      g.beginPath();
      g.arc(64, 64, 30, 0, Math.PI * 2);
      g.fill();
    });
  }

  // --- Szene ---

  function init() {
    try {
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: !LOW, powerPreference: "default" });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, LOW ? 1 : MOBILE ? 1.5 : 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.1;
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x140c08);
      scene.fog = new THREE.Fog(0x140c08, 9, 22);
      const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 60);

      scene.add(new THREE.HemisphereLight(0xffe0b0, 0x2a1508, 1.1));
      const lamp = new THREE.PointLight(0xffc27a, 26, 0, 1.6);
      lamp.position.set(0, 3.2, 0);
      scene.add(lamp);
      const key = new THREE.DirectionalLight(0xfff1dc, 1.3);
      key.position.set(-3, 6, 4);
      scene.add(key);

      // Boden
      const ft = planks(512, 512, 8, [92, 58, 34], 7);
      ft.wrapS = ft.wrapT = THREE.RepeatWrapping;
      ft.repeat.set(6, 6);
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshLambertMaterial({ map: ft }));
      floor.rotation.x = -Math.PI / 2;
      scene.add(floor);

      // Tisch: Platte, Rand, Fuß
      const top = planks(512, 512, 7, [176, 118, 66], 3);
      const side = new THREE.MeshLambertMaterial({ color: 0x6b3f1f });
      const table = new THREE.Mesh(new THREE.CylinderGeometry(TABLE_R, TABLE_R, 0.08, 64), [side, new THREE.MeshLambertMaterial({ map: top }), side]);
      table.position.y = TABLE_Y - 0.04;
      scene.add(table);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(TABLE_R, 0.045, 8, 64), new THREE.MeshLambertMaterial({ color: 0x5a3317 }));
      rim.rotation.x = Math.PI / 2;
      rim.position.y = TABLE_Y - 0.02;
      scene.add(rim);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.5, TABLE_Y - 0.08, 16), side);
      leg.position.y = (TABLE_Y - 0.08) / 2;
      scene.add(leg);

      // Weicher Schatten unter dem Tisch (nur ein Bild)
      const blobT = tex(128, 128, (g) => {
        const r = g.createRadialGradient(64, 64, 4, 64, 64, 64);
        r.addColorStop(0, "rgba(0,0,0,0.6)");
        r.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = r;
        g.fillRect(0, 0, 128, 128);
      });
      const blobMat = new THREE.MeshBasicMaterial({ map: blobT, transparent: true, depthWrite: false });
      const blob = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 4.4), blobMat);
      blob.rotation.x = -Math.PI / 2;
      blob.position.y = 0.01;
      scene.add(blob);

      // Flasche
      const bottle = makeBottle(blobMat);
      scene.add(bottle);

      // Ringe: wer dreht (leise), wen es trifft (leuchtet)
      const ring = (col, op) => {
        const m = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.27, 40), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op, depthWrite: false }));
        m.rotation.x = -Math.PI / 2;
        m.visible = false;
        scene.add(m);
        return m;
      };
      const turnRing = ring(0xffffff, 0.55);
      const hitRing = ring(0xffd34d, 0.95);
      // Lichtkegel vom Hals zum Getroffenen
      const beam = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({
          map: tex(64, 256, (g, w, h) => {
            const l = g.createLinearGradient(0, h, 0, 0);
            l.addColorStop(0, "rgba(255,211,77,0.0)");
            l.addColorStop(0.3, "rgba(255,211,77,0.35)");
            l.addColorStop(1, "rgba(255,211,77,0.0)");
            g.fillStyle = l;
            g.fillRect(0, 0, w, h);
          }),
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        })
      );
      beam.rotation.x = -Math.PI / 2;
      beam.visible = false;
      scene.add(beam);

      G = {
        renderer,
        scene,
        camera,
        bottle,
        turnRing,
        hitRing,
        beam,
        seats: new THREE.Group(),
        seatKey: "",
        az: null,
        sizeKey: "",
        mugGeo: makeMugGeo(),
        chairGeo: makeChairGeo(),
        coasterGeo: new THREE.CircleGeometry(0.19, 28),
      };
      scene.add(G.seats);
    } catch (err) {
      console.error(err);
      failed = true;
      G = null;
    }
  }

  function makeBottle(blobMat) {
    const L = 0.97;
    const prof = [
      [0, 0],
      [0.115, 0],
      [0.13, 0.02],
      [0.13, 0.5],
      [0.124, 0.56],
      [0.095, 0.64],
      [0.058, 0.72],
      [0.046, 0.78],
      [0.046, 0.91],
      [0.053, 0.925],
      [0.053, 0.955],
      [0.045, 0.965],
      [0, 0.965],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const geo = new THREE.LatheGeometry(prof, 28);
    const glass = new THREE.MeshPhongMaterial({ color: 0x17602c, specular: 0xffffff, shininess: 140, emissive: 0x062b10, transparent: true, opacity: 0.9 });
    const body = new THREE.Mesh(geo, glass);
    const label = new THREE.Mesh(new THREE.CylinderGeometry(0.1335, 0.1335, 0.26, 28, 1, true), new THREE.MeshLambertMaterial({ map: labelTex() }));
    label.position.y = 0.3;
    const neckLabel = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.07, 24, 1, true), new THREE.MeshLambertMaterial({ color: 0xd4a017 }));
    neckLabel.position.y = 0.665;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.058, 0.035, 18), new THREE.MeshPhongMaterial({ color: 0xc9a227, specular: 0xffffff, shininess: 80 }));
    cap.position.y = 0.965;
    // Stehend gebaut (Hals nach oben), dann hingelegt: Hals zeigt nach +x
    const inner = new THREE.Group();
    inner.add(body, label, neckLabel, cap);
    inner.position.y = -L * 0.45;
    const lay = new THREE.Group();
    lay.add(inner);
    lay.rotation.z = -Math.PI / 2 - 0.12; // Hals liegt etwas tiefer (dünner)
    const roll = new THREE.Group();
    roll.add(lay);
    roll.position.y = TABLE_Y / 1.25 + BOTTLE_R - 0.02;
    const g = new THREE.Group();
    g.add(roll);
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 0.42), blobMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = TABLE_Y / 1.25 + 0.003;
    g.add(shadow);
    g.userData.roll = roll;
    g.scale.setScalar(1.25);
    return g;
  }

  function makeMugGeo() {
    return {
      glass: new THREE.CylinderGeometry(0.085, 0.078, 0.2, 18),
      foam: new THREE.CylinderGeometry(0.088, 0.088, 0.035, 18),
      handle: new THREE.TorusGeometry(0.05, 0.015, 6, 12, Math.PI),
      glassMat: new THREE.MeshPhongMaterial({ color: 0xe8a21c, emissive: 0x4a2a00, specular: 0xffffff, shininess: 90, transparent: true, opacity: 0.92 }),
      foamMat: new THREE.MeshLambertMaterial({ color: 0xfffaf0 }),
    };
  }

  function makeChairGeo() {
    return {
      seat: new THREE.BoxGeometry(0.5, 0.06, 0.48),
      back: new THREE.BoxGeometry(0.5, 0.5, 0.05),
      leg: new THREE.BoxGeometry(0.05, 0.46, 0.05),
    };
  }

  // Stühle, Krüge, Bierdeckel und Namen für alle Spieler
  function syncSeats() {
    const players = S.players ?? [];
    const key = players.join("\n");
    if (G.seatKey === key) return;
    G.seatKey = key;
    G.seats.clear();
    names.replaceChildren();
    const n = players.length;
    const mg = G.mugGeo;
    const cg = G.chairGeo;
    G.labels = players.map((p, i) => {
      const a = F.seatAngle(i, n);
      const c = Math.cos(a);
      const s = Math.sin(a);
      const col = COLORS[i % COLORS.length];
      const mat = new THREE.MeshLambertMaterial({ color: col });
      // Stuhl: Lehne außen
      const chair = new THREE.Group();
      const seat = new THREE.Mesh(cg.seat, mat);
      seat.position.y = 0.48;
      chair.add(seat);
      const back = new THREE.Mesh(cg.back, mat);
      back.position.set(0, 0.76, 0.23);
      chair.add(back);
      const legMat = new THREE.MeshLambertMaterial({ color: 0x2b1a10 });
      for (const [lx, lz] of [[-0.21, -0.2], [0.21, -0.2], [-0.21, 0.2], [0.21, 0.2]]) {
        const l = new THREE.Mesh(cg.leg, legMat);
        l.position.set(lx, 0.23, lz);
        chair.add(l);
      }
      chair.position.set(c * SEAT_R, 0, s * SEAT_R);
      chair.rotation.y = -a + Math.PI / 2;
      G.seats.add(chair);
      // Bierdeckel und Krug vor dem Platz
      const coaster = new THREE.Mesh(G.coasterGeo, new THREE.MeshLambertMaterial({ map: coasterTex(col) }));
      coaster.rotation.x = -Math.PI / 2;
      coaster.position.set(c * MUG_R, TABLE_Y + 0.004, s * MUG_R);
      G.seats.add(coaster);
      const mug = new THREE.Group();
      const gl = new THREE.Mesh(mg.glass, mg.glassMat);
      gl.position.y = 0.1;
      const fo = new THREE.Mesh(mg.foam, mg.foamMat);
      fo.position.y = 0.21;
      const h = new THREE.Mesh(mg.handle, mg.glassMat);
      h.position.set(0.085, 0.1, 0);
      h.rotation.z = -Math.PI / 2;
      mug.add(gl, fo, h);
      const off = 0.11; // Krug etwas neben dem Deckel-Mittelpunkt, damit die Farbe zu sehen ist
      mug.position.set(c * (MUG_R + 0.02) - s * off, TABLE_Y + 0.006, s * (MUG_R + 0.02) + c * off);
      mug.rotation.y = -a;
      G.seats.add(mug);
      // Name
      const tag = document.createElement("div");
      tag.className = "fl-name";
      tag.style.setProperty("--c", col);
      tag.innerHTML = `<i></i>${escapeHtml(p)}`;
      names.appendChild(tag);
      return { el: tag, pos: new THREE.Vector3(c * (SEAT_R + 0.05), 0.62, s * (SEAT_R + 0.05)), mug: new THREE.Vector3(c * MUG_R, TABLE_Y, s * MUG_R), p, i, cls: "" };
    });
  }

  // --- Welcher Winkel gerade? ---

  function current() {
    if (!S) return { a: 0 };
    if (held && S.stage === "spin" && held.id === S.turn?.id) return { a: held.a };
    let spin = null;
    if ((S.stage === "spinning" || S.stage === "task") && S.spin) spin = S.spin;
    else if (local && S.stage === "spin" && local.id === S.turn?.id) spin = local;
    if (spin) {
      const ms = F.spinTime(spin.id);
      return { a: F.angleAt(spin, ms), spin, done: ms >= spin.T * 1000, u: Math.min(1, ms / 1000 / spin.T) };
    }
    return { a: S.angle ?? 0 };
  }

  // --- Bild ---

  let tmp = null;

  function frame(now) {
    raf = 0;
    tmp ??= new THREE.Vector3();
    if (!el || !el.isConnected || !S) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - (last || now)) / 1000);
    last = now;
    if (!G || lost) return;
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (!w || !h) return;
    const key = `${w}x${h}`;
    const wide = w > h * 1.2;
    if (G.sizeKey !== key) {
      G.sizeKey = key;
      G.renderer.setSize(w, h, false);
      G.camera.aspect = w / h;
      // Quer: Tisch links, rechts ist Platz für Text und Knöpfe. Hoch: Tisch etwas nach oben.
      if (wide) G.camera.setViewOffset(w, h, w * 0.19, -h * 0.03, w, h);
      else G.camera.setViewOffset(w, h, 0, (BOTTOM - TOP) / 2, w, h);
      G.camera.updateProjectionMatrix();
    }

    // Flasche
    const cur = current();
    const b = G.bottle;
    b.rotation.y = -cur.a;
    const roll = b.userData.roll;
    const spinning = cur.spin && !cur.done;
    const k = now - nudgeAt < 400 ? Math.sin((now - nudgeAt) / 30) * (1 - (now - nudgeAt) / 400) : 0;
    roll.rotation.x = spinning ? Math.sin(now / 45) * 0.05 * (1 - cur.u) : k * 0.12;
    roll.position.y = TABLE_Y / 1.25 + BOTTLE_R - 0.02 + (spinning ? Math.abs(Math.sin(now / 70)) * 0.012 * (1 - cur.u) : 0);
    b.rotation.y += k * 0.06;

    // Ringe und Lichtkegel
    const players = S.players ?? [];
    const n = players.length;
    const L = G.labels ?? [];
    const hitI = S.stage === "task" && S.task && (!cur.spin || cur.done) ? S.task.ai : -1;
    const turnI = S.stage === "spin" || S.stage === "spinning" ? players.indexOf(S.spin?.by ?? players[S.cur]) : -1;
    G.turnRing.visible = turnI >= 0 && !!L[turnI];
    if (G.turnRing.visible) G.turnRing.position.set(L[turnI].mug.x, TABLE_Y + 0.01, L[turnI].mug.z);
    G.hitRing.visible = hitI >= 0 && !!L[hitI];
    G.beam.visible = G.hitRing.visible;
    if (G.hitRing.visible) {
      const m = L[hitI].mug;
      const p = 1 + Math.sin(now / 180) * 0.12;
      G.hitRing.position.set(m.x, TABLE_Y + 0.012, m.z);
      G.hitRing.scale.set(p, p, p);
      const a = F.seatAngle(hitI, n);
      const len = MUG_R - 0.5;
      G.beam.scale.set(0.32, len, 1);
      G.beam.position.set(Math.cos(a) * (0.5 + len / 2), TABLE_Y + 0.008, Math.sin(a) * (0.5 + len / 2));
      G.beam.rotation.set(-Math.PI / 2, 0, -a - Math.PI / 2);
    }

    // Kamera: ein Handy fast von oben (liegt in der Mitte), eigenes Handy hinter dem eigenen Platz
    const meI = ME ? players.indexOf(ME) : -1;
    const wantAz = meI >= 0 ? F.seatAngle(meI, n) : Math.PI / 2;
    if (G.az == null) G.az = wantAz;
    G.az += (wantAz - G.az) * Math.min(1, dt * 3);
    const elev = meI >= 0 ? 0.92 : 1.18; // Neigung über dem Tisch (rad)
    const fov = 45;
    if (G.camera.fov !== fov) {
      G.camera.fov = fov;
      G.camera.updateProjectionMatrix();
    }
    // Platz für den Tisch: quer die linken 62 %, hoch ohne Titel oben und Aufgabe/Knöpfe unten
    const freeH = wide ? h - 40 : Math.max(h * 0.5, h - TOP - BOTTOM);
    const freeW = wide ? w * 0.62 : w;
    const aspect = freeW / freeH;
    const vf = 2 * Math.atan(Math.tan((fov * Math.PI) / 360) * (freeH / h));
    const hf = 2 * Math.atan(Math.tan(vf / 2) * aspect);
    const R = 2.55;
    const dist = R / Math.sin(Math.min(vf, hf) / 2) * (meI >= 0 ? 0.88 : 0.97);
    const near = meI >= 0 ? 0.3 : 0; // eigener Platz vorne: Blick etwas zu sich, damit der eigene Stuhl ganz drauf ist
    const look = new THREE.Vector3(Math.cos(G.az) * near, TABLE_Y * 0.6, Math.sin(G.az) * near);
    G.camera.position.set(Math.cos(G.az) * Math.cos(elev) * dist, look.y + Math.sin(elev) * dist, Math.sin(G.az) * Math.cos(elev) * dist);
    G.camera.lookAt(look);

    G.renderer.render(G.scene, G.camera);

    // Namen über die Stühle setzen
    for (const t of L) {
      tmp.copy(t.pos).project(G.camera);
      // am Rand bleibt das Schild ganz zu sehen
      const half = ((t.w ||= t.el.offsetWidth || 80) / 2) * 1.15 + 6;
      const x = Math.min(w - half, Math.max(half, ((tmp.x + 1) / 2) * w));
      const y = Math.min(h - 14, Math.max(14, ((1 - tmp.y) / 2) * h));
      t.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)${t.i === hitI ? " scale(1.15)" : ""}`;
      const cls = `${t.i === hitI ? " hit" : ""}${t.i === turnI ? " turn" : ""}${t.p === ME ? " me" : ""}`;
      if (cls !== t.cls) {
        t.cls = cls;
        t.el.className = `fl-name${cls}`;
        t.w = 0; // Breite neu messen (🍾 dahinter, größer bei Treffer)
      }
    }
  }

  // Bildschirmpunkt der Tischmitte (zum Wischen um die Flasche)
  function centre() {
    if (!G || !el?.isConnected || !tmp) return null;
    const r = canvas.getBoundingClientRect();
    tmp.set(0, TABLE_Y, 0).project(G.camera);
    return { x: r.left + ((tmp.x + 1) / 2) * r.width, y: r.top + ((1 - tmp.y) / 2) * r.height };
  }

  return {
    mount,
    centre,
    angle: () => current().a,
    hold(id, a) {
      held = id ? { id, a } : null;
    },
    spinLocal(spin) {
      held = null;
      local = spin;
    },
    nudge() {
      nudgeAt = performance.now();
    },
  };
})();
