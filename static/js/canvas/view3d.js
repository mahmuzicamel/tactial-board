// canvas/view3d.js - Leichtgewichtige, vollwertige 3D-Ansicht mit Three.js
// Visualisiert das Spielfeld, Spieler, Bälle, Tore, Hütchen, Zonen und Linien in 3D.
// Unterstützt Animationen (Interpolation aus PlaybackController) und interaktive Kamerafahrt.

import { VIRTUAL_WIDTH, VIRTUAL_HEIGHT } from "../core/constants.js";
import { drawPitchBackground } from "../core/pitch.js";

export class View3DManager {
  constructor(containerEl, stateRef, getCurrentExerciseFn) {
    this.container = containerEl;
    this.state = stateRef;
    this.getCurrentExercise = getCurrentExerciseFn;

    this.isActive = false;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.animId = null;

    // Pitch Plane & Dynamic Meshes
    this.pitchMesh = null;
    this.pitchTextureCanvas = null;
    this.pitchTextureCtx = null;
    this.pitchTexture = null;

    // Object Pools / Meshes
    this.elementMeshes = new Map(); // id -> THREE.Group
    this.arrowLines = []; // array of THREE.Line / THREE.Mesh
    this.zoneMeshes = new Map(); // id -> THREE.Mesh

    this.sharedMaterials = {};
    this.sharedGeometries = {};
  }

  isSupported() {
    return typeof window.THREE !== "undefined";
  }

  init() {
    if (!this.isSupported()) {
      console.warn("Three.js nicht geladen, 3D Modus nicht verfügbar.");
      return false;
    }
    if (this.renderer) return true; // Schon initialisiert

    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;

    // 1. Scene
    this.scene = new window.THREE.Scene();
    this.scene.background = new window.THREE.Color(0x0f172a); // Slate-900 Stadium-Look

    // 2. Camera
    this.camera = new window.THREE.PerspectiveCamera(45, width / height, 1, 5000);
    // Standard-Perspektive: Erhöhte Trainerbank / Haupttribüne
    this.camera.position.set(0, 520, 680);

    // 3. Renderer mit sauberem Antialiasing und Shadow Map (preserveDrawingBuffer für Snapshots & Video-Recording)
    this.renderer = new window.THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = window.THREE.PCFSoftShadowMap;

    this.renderer.domElement.id = "tactic3dCanvas";
    this.renderer.domElement.className = "w-full h-full absolute inset-0 z-10 cursor-grab active:cursor-grabbing pointer-events-none";
    this.renderer.domElement.style.display = "none";
    this.container.appendChild(this.renderer.domElement);

    // 4. OrbitControls
    if (typeof window.THREE.OrbitControls !== "undefined") {
      this.controls = new window.THREE.OrbitControls(this.camera, this.renderer.domElement);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.08;
      this.controls.maxPolarAngle = Math.PI / 2 - 0.05; // Nicht unter den Rasen blicken
      this.controls.minDistance = 150;
      this.controls.maxDistance = 1800;
      this.controls.target.set(0, 0, 0);
    }

    // 5. Lighting (Flutlicht & Atmosphäre)
    this.setupLighting();

    // 6. Reusable Geometries & Materials
    this.initSharedResources();

    // 7. Spielfeld & Stadion-Boden (cleaner Taktik-Look)
    this.createPitch();

    window.addEventListener("resize", () => this.onResize(), { passive: true });
    return true;
  }

  setupLighting() {
    // Weiches Umgebungslicht
    const ambient = new window.THREE.AmbientLight(0xffffff, 0.55);
    this.scene.add(ambient);

    // Hauptflutlicht mit Schattenwurf (schräg von oben links wie gewünscht)
    const floodLight1 = new window.THREE.DirectionalLight(0xfff8ee, 0.75);
    floodLight1.position.set(-400, 750, 400);
    floodLight1.castShadow = true;
    floodLight1.shadow.mapSize.width = 2048;
    floodLight1.shadow.mapSize.height = 2048;
    floodLight1.shadow.camera.near = 50;
    floodLight1.shadow.camera.far = 2000;
    const d = 600;
    floodLight1.shadow.camera.left = -d;
    floodLight1.shadow.camera.right = d;
    floodLight1.shadow.camera.top = d;
    floodLight1.shadow.camera.bottom = -d;
    floodLight1.shadow.bias = -0.001;
    this.scene.add(floodLight1);

    // Gegen-Flutlicht (weich) für realistische Stadionausleuchtung
    const floodLight2 = new window.THREE.DirectionalLight(0xdbeafe, 0.35);
    floodLight2.position.set(400, 500, -400);
    this.scene.add(floodLight2);
  }

  createPitch() {
    const T = window.THREE;
    // 2D-Textur aus unserer vorhandenen pitch.js Zeichenlogik rendern!
    this.pitchTextureCanvas = document.createElement("canvas");
    this.pitchTextureCanvas.width = 1024;
    this.pitchTextureCanvas.height = 716;
    this.pitchTextureCtx = this.pitchTextureCanvas.getContext("2d");

    this.pitchTexture = new T.CanvasTexture(this.pitchTextureCanvas);
    this.pitchTexture.anisotropy = 8;

    this.updatePitchTexture();

    // 1. Rasen-Spielfeld (1000 x 700 Einheiten)
    const pitchGeo = new T.PlaneGeometry(VIRTUAL_WIDTH, VIRTUAL_HEIGHT);
    const pitchMat = new T.MeshStandardMaterial({
      map: this.pitchTexture,
      roughness: 0.85,
      metalness: 0.05
    });
    this.pitchMesh = new T.Mesh(pitchGeo, pitchMat);
    this.pitchMesh.rotation.x = -Math.PI / 2;
    this.pitchMesh.position.y = 0.2;
    this.pitchMesh.receiveShadow = true;
    this.scene.add(this.pitchMesh);

    // 2. Äußere Rasen-Auslauffläche (dunkler edler Kunstrasen-Rand)
    const outerGeo = new T.PlaneGeometry(VIRTUAL_WIDTH + 300, VIRTUAL_HEIGHT + 300);
    const outerMat = new T.MeshStandardMaterial({
      color: 0x1b4332,
      roughness: 0.95
    });
    const outerMesh = new T.Mesh(outerGeo, outerMat);
    outerMesh.rotation.x = -Math.PI / 2;
    outerMesh.position.y = -0.4;
    outerMesh.receiveShadow = true;
    this.scene.add(outerMesh);
  }

  updatePitchTexture() {
    if (!this.pitchTextureCtx) return;
    const ctx = this.pitchTextureCtx;
    ctx.clearRect(0, 0, 1024, 716);

    ctx.save();
    // Skaliere virtuelle Spielfeld-Koordinaten (1000x700) auf 1024x716
    ctx.scale(1024 / VIRTUAL_WIDTH, 716 / VIRTUAL_HEIGHT);
    const ex = this.getCurrentExercise ? this.getCurrentExercise() : null;
    const pitchType = (ex && ex.pitch_type) || this.state.pitchType || "half";
    drawPitchBackground(ctx, pitchType);
    ctx.restore();

    if (this.pitchTexture) this.pitchTexture.needsUpdate = true;
  }

  initSharedResources() {
    const T = window.THREE;
    // Spieler-Körper (eleganter Zylinder/Pille mit Kopf)
    this.sharedGeometries.playerBody = new T.CylinderGeometry(14, 16, 28, 24);
    this.sharedGeometries.playerHead = new T.SphereGeometry(10, 20, 20);
    this.sharedGeometries.ball = new T.SphereGeometry(8.5, 24, 24);

    // Hütchen / Cones
    this.sharedGeometries.cone = new T.ConeGeometry(9, 20, 18);
    // Stangen / Poles
    this.sharedGeometries.pole = new T.CylinderGeometry(2, 2, 60, 12);
    // Hürden / Hurdles
    this.sharedGeometries.hurdleBar = new T.CylinderGeometry(2, 2, 34, 12);
    this.sharedGeometries.hurdleLeg = new T.CylinderGeometry(1.8, 1.8, 18, 12);
    // Tor
    this.sharedGeometries.goalPost = new T.CylinderGeometry(3, 3, 50, 12);
    this.sharedGeometries.goalBar = new T.CylinderGeometry(3, 3, 100, 12);

    // Ball-Material (klassischer Lederball / Gelb)
    this.sharedMaterials.ball = new T.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.35,
      metalness: 0.1
    });

    // Material-Palette
    this.colorMaterials = new Map();
  }

  getMaterialForColor(hex, roughness = 0.45) {
    if (!this.colorMaterials) this.colorMaterials = new Map();
    const key = `${hex}_${roughness}`;
    if (!this.colorMaterials.has(key)) {
      const col = new window.THREE.Color(hex);
      const mat = new window.THREE.MeshStandardMaterial({
        color: col,
        roughness,
        metalness: 0.15
      });
      this.colorMaterials.set(key, mat);
    }
    return this.colorMaterials.get(key);
  }

  // 2D Canvas Koordinate (0..1000, 0..700) -> 3D Weltkoordinate (Zentriert bei 0,0,0)
  to3DCoords(x, y) {
    return {
      x: x - VIRTUAL_WIDTH / 2,
      z: y - VIRTUAL_HEIGHT / 2
    };
  }

  show() {
    if (!this.init()) return;
    this.isActive = true;
    if (this.renderer) {
      this.renderer.domElement.style.display = "block";
      this.renderer.domElement.classList.remove("pointer-events-none");
    }
    this.onResize();
    this.updatePitchTexture();
    this.syncScene();
    this.startLoop();
  }

  hide() {
    this.isActive = false;
    if (this.renderer) {
      this.renderer.domElement.style.display = "none";
      this.renderer.domElement.classList.add("pointer-events-none");
    }
    if (this.animId) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }
  }

  toggle() {
    if (this.isActive) this.hide();
    else this.show();
    return this.isActive;
  }

  onResize() {
    if (!this.renderer || !this.camera) return;
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  startLoop() {
    const loop = () => {
      if (!this.isActive) return;
      if (this.controls) this.controls.update();
      if (this.renderer && this.scene && this.camera) {
        this.renderer.render(this.scene, this.camera);
      }
      this.animId = requestAnimationFrame(loop);
    };
    if (this.animId) cancelAnimationFrame(this.animId);
    this.animId = requestAnimationFrame(loop);
  }

  // Synchronisiert die 3D Szene mit den aktuellen Elementen / Interpolation
  syncScene(customElements = null, customArrows = null) {
    if (!this.scene) return;

    const ex = this.getCurrentExercise ? this.getCurrentExercise() : null;
    const curKf = (ex && ex.keyframes && ex.keyframes[this.state.currentKeyframeIndex]) || null;
    const elements = customElements || (curKf ? curKf.elements : []) || [];
    const arrows = customArrows || (curKf ? curKf.arrows : []) || [];

    this.render3DElements(elements);
    this.render3DZones(elements);
    this.render3DArrows(arrows);
  }

  render3DElements(elements) {
    const T = window.THREE;
    const activeIds = new Set();

    elements.forEach(el => {
      if (el.type === "zone_rect" || el.type === "zone_circle" || el.type === "zone_triangle") return;
      activeIds.add(el.id);

      let group = this.elementMeshes.get(el.id);
      if (!group) {
        group = this.buildElementMesh(el);
        this.elementMeshes.set(el.id, group);
        this.scene.add(group);
      } else {
        this.updateElementMeshContent(group, el);
      }

      const p3 = this.to3DCoords(el.x, el.y);
      const jumpProgress = el.jumpProgress || 0;
      const jumpHeight = jumpProgress * 36; // Bis zu 36 Einheiten in die Luft springen

      group.position.set(p3.x, jumpHeight, p3.z);

      // Rotation (Objekt-Drehung)
      // Standard-Ausrichtung im 2D-Canvas:
      // Auf dem 2D-Board blickt der Nutzer immer in Richtung POV (von unten nach oben).
      // Trainingsgeräte (Dummies, Hürden, Leitern, Tore) werden im 2D-Canvas so gezeichnet,
      // dass sie für den Trainer horizontal/waagerecht ausgerichtet sind.
      //
      // In 3D steht die Kamera (Trainer-Preset) an der Seitenlinie (z > 0, blickt nach -z auf den Rasen).
      // Damit ALLE Objekte (Dummies, Hürden, Leitern, Minitore, Großtore) in 3D EXAKT so stehen
      // wie der Nutzer sie im 2D-Board sieht:
      //
      // - Dummy: In 2D ist die Brust waagerecht (entlang X des Bildschirms) und blickt nach oben/unten.
      //   In 3D muss die Brust entlang der X-Achse der Kamera stehen.
      // - Hürde: In 2D verläuft der Querbalken waagerecht. In 3D muss er parallel zur Torlinie bzw. Grundlinie verlaufen.
      // - Tor: Die Toröffnung schaut ins Feld hinein.
      //
      // Durch den einheitlichen 90°-Offset (-Math.PI / 2) stimmen nun ALLE Ausrüstungsgegenstände
      // (Tore, Dummies, Hürden, Leitern) perfekt mit der Blickachse des 2D-Boards überein!
      const elRot = el.rotation || 0;
      if (el.type === "dummy" || el.type === "hurdle" || el.type === "ladder" ||
          el.type === "goal_5m" || el.type === "goal_large" || el.type === "minigoal" || el.type === "goal_mini") {
        group.rotation.y = -(elRot * Math.PI) / 180 - Math.PI / 2;
      } else {
        group.rotation.y = -(elRot * Math.PI) / 180;
      }

      // Skalierung (aus Jump-Effekt & globalem Skalierungs-Slider)
      const scaleMult = (el.scaleMultiplier || 1.0) * (this.state.globalElementScale || 1.0);
      group.scale.set(scaleMult, scaleMult, scaleMult);
    });

    // Entferne gelöschte Meshes
    for (const [id, grp] of this.elementMeshes.entries()) {
      if (!activeIds.has(id)) {
        this.scene.remove(grp);
        this.disposeGroup(grp);
        this.elementMeshes.delete(id);
      }
    }
  }

  // Hilfsmethode: Ressourcen freigeben
  disposeGroup(group) {
    if (!group) return;
    group.traverse((child) => {
      if (child.isMesh) {
        if (child.geometry && !this.isSharedGeometry(child.geometry)) {
          child.geometry.dispose();
        }
      }
    });
  }

  isSharedGeometry(geo) {
    if (!this.sharedGeometries) return false;
    return Object.values(this.sharedGeometries).includes(geo);
  }

  buildElementMesh(el) {
    const T = window.THREE;
    const group = new T.Group();

    if (el.type === "player") {
      const teamCol = el.team === "red" ? 0xef4444 : (el.team === "blue" ? 0x3b82f6 : (el.team === "yellow" ? 0xeab308 : (el.team === "orange" ? 0xf97316 : 0x10b981)));
      const bodyMat = this.getMaterialForColor(teamCol);
      const headMat = this.getMaterialForColor(0xffedd5, 0.6); // Hautton

      // Körper
      const body = new T.Mesh(this.sharedGeometries.playerBody, bodyMat);
      body.position.y = 14;
      body.castShadow = true;
      body.receiveShadow = false;
      group.add(body);

      // Kopf
      const head = new T.Mesh(this.sharedGeometries.playerHead, headMat);
      head.position.y = 35;
      head.castShadow = true;
      group.add(head);

      // Trikotnummer als 3D-Sprite Billboard über dem Kopf
      const sprite = this.createNumberSprite(el.number || "");
      sprite.position.y = 50;
      sprite.name = "numberSprite";
      group.add(sprite);

      // Namens-Label (z.B. Spielername / Trainer) als 3D-Billboard über der Nummer
      if (el.name || el.label) {
        const nameSprite = this.createNameSprite(el.name || el.label);
        nameSprite.position.y = 74;
        nameSprite.name = "nameSprite";
        group.add(nameSprite);
      }

    } else if (el.type === "ball") {
      const ball = new T.Mesh(this.sharedGeometries.ball, this.sharedMaterials.ball);
      ball.position.y = 8.5;
      ball.castShadow = true;
      group.add(ball);

    } else if (el.type === "cone") {
      // Echtes Markierungshütchen: quadratische Basisplatte + konischer Aufbau mit Spitze
      const coneMat = this.getMaterialForColor(0xf97316, 0.35); // Signalorange
      const baseGeo = new T.BoxGeometry(16, 1.5, 16);
      const baseMesh = new T.Mesh(baseGeo, coneMat);
      baseMesh.position.y = 0.75;
      baseMesh.castShadow = true;
      baseMesh.receiveShadow = true;
      group.add(baseMesh);

      const coneBody = new T.Mesh(new T.ConeGeometry(6.5, 18, 16), coneMat);
      coneBody.position.y = 10;
      coneBody.castShadow = true;
      group.add(coneBody);

      // Weißer Reflektorstreifen in der Mitte
      const stripeMat = this.getMaterialForColor(0xffffff, 0.2);
      const stripe = new T.Mesh(new T.CylinderGeometry(4.2, 5.2, 4, 16), stripeMat);
      stripe.position.y = 9;
      group.add(stripe);

    } else if (el.type === "pole") {
      // Slalomstange: schwarzer runder Standfuß / Federfuß + neongelbe Stange
      const baseMat = this.getMaterialForColor(0x1e293b, 0.8);
      const baseMesh = new T.Mesh(new T.CylinderGeometry(7, 8, 3, 16), baseMat);
      baseMesh.position.y = 1.5;
      baseMesh.castShadow = true;
      baseMesh.receiveShadow = true;
      group.add(baseMesh);

      const poleMat = this.getMaterialForColor(0xfacc15, 0.3); // Neon-Gelb
      const pole = new T.Mesh(new T.CylinderGeometry(1.8, 1.8, 55, 12), poleMat);
      pole.position.y = 30;
      pole.castShadow = true;
      group.add(pole);

      // Schwarze Schutzkappe oben
      const cap = new T.Mesh(new T.SphereGeometry(2.2, 12, 12), baseMat);
      cap.position.y = 57.5;
      group.add(cap);

    } else if (el.type === "hurdle") {
      // Agility-Hürde: 2 flache Bodenkufen + 2 senkrechte Steher + Querbalken mit Warnstreifen
      const frameMat = this.getMaterialForColor(0x0284c7, 0.3); // Cyan/Blau
      const skidGeo = new T.BoxGeometry(3, 2, 22);

      const skidL = new T.Mesh(skidGeo, frameMat);
      skidL.position.set(-18, 1, 0);
      skidL.castShadow = true;
      group.add(skidL);

      const skidR = new T.Mesh(skidGeo, frameMat);
      skidR.position.set(18, 1, 0);
      skidR.castShadow = true;
      group.add(skidR);

      const postGeo = new T.CylinderGeometry(1.5, 1.5, 18, 10);
      const postL = new T.Mesh(postGeo, frameMat);
      postL.position.set(-18, 10, 0);
      postL.castShadow = true;
      group.add(postL);

      const postR = new T.Mesh(postGeo, frameMat);
      postR.position.set(18, 10, 0);
      postR.castShadow = true;
      group.add(postR);

      const barGeo = new T.CylinderGeometry(2, 2, 38, 12);
      const bar = new T.Mesh(barGeo, this.getMaterialForColor(0xf97316, 0.3));
      bar.rotation.z = Math.PI / 2;
      bar.position.set(0, 19, 0);
      bar.castShadow = true;
      group.add(bar);

    } else if (el.type === "ring") {
      // Koordinationsring flach auf dem Rasen (Torus)
      const ringMat = this.getMaterialForColor(0x06b6d4, 0.35); // Leuchtendes Cyan
      const ringGeo = new T.TorusGeometry(15, 1.6, 12, 32);
      const ringMesh = new T.Mesh(ringGeo, ringMat);
      ringMesh.rotation.x = Math.PI / 2;
      ringMesh.position.y = 1.2;
      ringMesh.receiveShadow = true;
      group.add(ringMesh);

    } else if (el.type === "ladder") {
      // Koordinationsleiter auf dem Rasen: 2 lange Seile/Bänder + 5 Sprossen
      const ropeMat = this.getMaterialForColor(0x0284c7, 0.4); // Blaues Band
      const rungMat = this.getMaterialForColor(0xfacc15, 0.3); // Gelbe Kunststoff-Sprossen

      // Längsbänder
      const ropeGeo = new T.BoxGeometry(84, 0.8, 1.8);
      const rope1 = new T.Mesh(ropeGeo, ropeMat);
      rope1.position.set(0, 0.6, -11);
      rope1.receiveShadow = true;
      group.add(rope1);

      const rope2 = new T.Mesh(ropeGeo, ropeMat);
      rope2.position.set(0, 0.6, 11);
      rope2.receiveShadow = true;
      group.add(rope2);

      // 6 Sprossen
      const rungGeo = new T.BoxGeometry(2.4, 1.2, 24);
      for (let i = 0; i < 6; i++) {
        const rung = new T.Mesh(rungGeo, rungMat);
        rung.position.set(-38 + i * 15.2, 0.8, 0);
        rung.receiveShadow = true;
        group.add(rung);
      }

    } else if (el.type === "dummy") {
      // Freistoß-Dummy / Trainingsfigur: Standfuß mit 4 Spikes + anatomischer Torso + Kopf
      const baseMat = this.getMaterialForColor(0x0f172a, 0.8);
      const baseMesh = new T.Mesh(new T.CylinderGeometry(13, 14, 3, 16), baseMat);
      baseMesh.position.y = 1.5;
      baseMesh.castShadow = true;
      group.add(baseMesh);

      // Zwei Beine/Stangen
      const legMat = this.getMaterialForColor(0x334155, 0.6);
      const legGeo = new T.CylinderGeometry(1.8, 1.8, 22, 10);
      const legL = new T.Mesh(legGeo, legMat);
      legL.position.set(-6, 13, 0);
      legL.castShadow = true;
      group.add(legL);

      const legR = new T.Mesh(legGeo, legMat);
      legR.position.set(6, 13, 0);
      legR.castShadow = true;
      group.add(legR);

      // Torso / Schutzschild (markant Neongelb)
      const dummyMat = this.getMaterialForColor(0xeab308, 0.3);
      const torsoGeo = new T.BoxGeometry(22, 28, 7);
      const torso = new T.Mesh(torsoGeo, dummyMat);
      torso.position.set(0, 36, 0);
      torso.castShadow = true;
      group.add(torso);

      // Kopf
      const headMat = this.getMaterialForColor(0xca8a04, 0.3);
      const head = new T.Mesh(new T.SphereGeometry(6, 16, 16), headMat);
      head.position.set(0, 54, 0);
      head.castShadow = true;
      group.add(head);

    } else if (el.type === "minigoal" || el.type === "goal_mini") {
      // Echtes Minitor (ca. 1.2m x 0.8m) mit Pfosten, Latte, Bodenrahmen und echtem 3D-Netz
      // Öffnung nach -Z (ins Feld), Netz nach +Z (außen)
      const frameMat = this.getMaterialForColor(0xffffff, 0.2); // Weiß pulverbeschichtet
      const postRadius = 1.6;
      const gw = 40;
      const gh = 24;
      const depth = 20;

      // 2 Vorderpfosten
      const postGeo = new T.CylinderGeometry(postRadius, postRadius, gh, 12);
      const pL = new T.Mesh(postGeo, frameMat);
      pL.position.set(-gw / 2, gh / 2, -depth / 2);
      pL.castShadow = true;
      group.add(pL);

      const pR = new T.Mesh(postGeo, frameMat);
      pR.position.set(gw / 2, gh / 2, -depth / 2);
      pR.castShadow = true;
      group.add(pR);

      // Querlatte
      const crossGeo = new T.CylinderGeometry(postRadius, postRadius, gw, 12);
      const cross = new T.Mesh(crossGeo, frameMat);
      cross.rotation.z = Math.PI / 2;
      cross.position.set(0, gh, -depth / 2);
      cross.castShadow = true;
      group.add(cross);

      // Bodenrahmen & Tiefenstreben
      const baseSideGeo = new T.CylinderGeometry(postRadius * 0.8, postRadius * 0.8, depth, 10);
      const bL = new T.Mesh(baseSideGeo, frameMat);
      bL.rotation.x = Math.PI / 2;
      bL.position.set(-gw / 2, postRadius, 0);
      group.add(bL);

      const bR = new T.Mesh(baseSideGeo, frameMat);
      bR.rotation.x = Math.PI / 2;
      bR.position.set(gw / 2, postRadius, 0);
      group.add(bR);

      const bBack = new T.Mesh(crossGeo, frameMat);
      bBack.rotation.z = Math.PI / 2;
      bBack.position.set(0, postRadius, depth / 2);
      group.add(bBack);

      // Rückfallbügel oben nach hinten
      const topSideGeo = new T.CylinderGeometry(postRadius * 0.8, postRadius * 0.8, depth * 0.7, 10);
      const tL = new T.Mesh(topSideGeo, frameMat);
      tL.rotation.x = -Math.PI / 2.5;
      tL.position.set(-gw / 2, gh * 0.75, 0);
      group.add(tL);

      const tR = new T.Mesh(topSideGeo, frameMat);
      tR.rotation.x = -Math.PI / 2.5;
      tR.position.set(gw / 2, gh * 0.75, 0);
      group.add(tR);

      // Halbtransparentes Tornetz (Waben/Netz-Optik)
      const netMat = new T.MeshStandardMaterial({
        color: 0xf1f5f9,
        transparent: true,
        opacity: 0.38,
        wireframe: true,
        side: T.DoubleSide
      });
      const netBox = new T.BoxGeometry(gw - 1, gh - 1, depth);
      const netMesh = new T.Mesh(netBox, netMat);
      netMesh.position.set(0, gh / 2, 0);
      group.add(netMesh);

    } else if (el.type === "goal_5m" || el.type === "goal_large") {
      // Großes 5m Jugendtor (5m x 2m) mit weißem Aluminium-Rundrohrrahmen und tiefem Tornetz
      // WICHTIG: Die Toröffnung (Pfosten & Querlatte) liegt bei z = -depth/2 (zeigt in das Feld hinein)!
      // Das Netz und die Stützen ziehen sich nach hinten auf z = +depth/2 (aus dem Feld heraus).
      const frameMat = this.getMaterialForColor(0xffffff, 0.15);
      const postRadius = 2.6;
      const gw = 76;
      const gh = 36;
      const depth = 32;

      // 2 Senkrechte Torpfosten (Vorne bei z = -depth/2)
      const postGeo = new T.CylinderGeometry(postRadius, postRadius, gh, 14);
      const pL = new T.Mesh(postGeo, frameMat);
      pL.position.set(-gw / 2, gh / 2, -depth / 2);
      pL.castShadow = true;
      group.add(pL);

      const pR = new T.Mesh(postGeo, frameMat);
      pR.position.set(gw / 2, gh / 2, -depth / 2);
      pR.castShadow = true;
      group.add(pR);

      // Waagerechte Querlatte vorne bei z = -depth/2
      const crossGeo = new T.CylinderGeometry(postRadius, postRadius, gw + postRadius * 2, 14);
      const cross = new T.Mesh(crossGeo, frameMat);
      cross.rotation.z = Math.PI / 2;
      cross.position.set(0, gh, -depth / 2);
      cross.castShadow = true;
      group.add(cross);

      // Bodenrahmen (U-Profil nach hinten zu +depth/2)
      const sideGeo = new T.CylinderGeometry(postRadius * 0.8, postRadius * 0.8, depth, 12);
      const bL = new T.Mesh(sideGeo, frameMat);
      bL.rotation.x = Math.PI / 2;
      bL.position.set(-gw / 2, postRadius, 0);
      group.add(bL);

      const bR = new T.Mesh(sideGeo, frameMat);
      bR.rotation.x = Math.PI / 2;
      bR.position.set(gw / 2, postRadius, 0);
      group.add(bR);

      const bBack = new T.Mesh(crossGeo, frameMat);
      bBack.rotation.z = Math.PI / 2;
      bBack.position.set(0, postRadius, depth / 2);
      group.add(bBack);

      // Diagonale Netzbügel hinten von der Querlatte nach hinten zum Bodenrahmen
      const diagLen = Math.hypot(gh, depth);
      const diagGeo = new T.CylinderGeometry(postRadius * 0.7, postRadius * 0.7, diagLen, 10);
      const dL = new T.Mesh(diagGeo, frameMat);
      dL.rotation.x = -Math.atan2(depth, gh);
      dL.position.set(-gw / 2, gh / 2, 0);
      group.add(dL);

      const dR = new T.Mesh(diagGeo, frameMat);
      dR.rotation.x = -Math.atan2(depth, gh);
      dR.position.set(gw / 2, gh / 2, 0);
      group.add(dR);

      // Echtes dreidimensionales Tornetz (Wireframe-Netzstruktur)
      const netMat = new T.MeshStandardMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.35,
        wireframe: true,
        side: T.DoubleSide
      });
      const netBox = new T.BoxGeometry(gw - 1, gh - 1, depth);
      const netMesh = new T.Mesh(netBox, netMat);
      netMesh.position.set(0, gh / 2, 0);
      group.add(netMesh);

    } else {
      // Fallback: kleiner Zylinder-Pin
      const defMat = this.getMaterialForColor(0x94a3b8);
      const pin = new T.Mesh(this.sharedGeometries.cone, defMat);
      pin.position.y = 10;
      pin.castShadow = true;
      group.add(pin);
    }

    return group;
  }

  updateElementMeshContent(group, el) {
    if (el.type === "player") {
      const sprite = group.getObjectByName("numberSprite");
      if (sprite) {
        group.remove(sprite);
        const newSprite = this.createNumberSprite(el.number || "");
        newSprite.position.y = 50;
        newSprite.name = "numberSprite";
        group.add(newSprite);
      }

      const existingNameSprite = group.getObjectByName("nameSprite");
      if (existingNameSprite) {
        group.remove(existingNameSprite);
      }
      if (el.name || el.label) {
        const newNameSprite = this.createNameSprite(el.name || el.label);
        newNameSprite.position.y = 74;
        newNameSprite.name = "nameSprite";
        group.add(newNameSprite);
      }
    }
  }

  createNumberSprite(text) {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
    ctx.beginPath();
    ctx.arc(64, 64, 52, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 6;
    ctx.stroke();

    ctx.font = "bold 56px Inter, sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 64, 68);

    const texture = new window.THREE.CanvasTexture(canvas);
    const mat = new window.THREE.SpriteMaterial({ map: texture, depthTest: false });
    const sprite = new window.THREE.Sprite(mat);
    sprite.scale.set(24, 24, 1);
    return sprite;
  }

  createNameSprite(nameText) {
    const canvas = document.createElement("canvas");
    canvas.width = 384;
    canvas.height = 96;
    const ctx = canvas.getContext("2d");

    // Pill-Hintergrund für optimale Lesbarkeit im 3D-Raum
    ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
    ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
    ctx.lineWidth = 4;

    const r = 36;
    const x = 12, y = 10, w = 360, h = 76;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.font = "bold 40px Inter, sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(nameText, 192, 48);

    const texture = new window.THREE.CanvasTexture(canvas);
    const mat = new window.THREE.SpriteMaterial({ map: texture, depthTest: false });
    const sprite = new window.THREE.Sprite(mat);
    // Deutlich größer skaliert (54 x 13.5 Einheiten statt 36 x 9)
    sprite.scale.set(54, 13.5, 1);
    return sprite;
  }

  render3DZones(elements) {
    const T = window.THREE;
    const activeIds = new Set();

    elements.forEach(el => {
      const isZone = (el.type === "zone_rect" || el.type === "zone_circle" || el.type === "zone_triangle");
      if (!isZone) return;
      activeIds.add(el.id);

      let mesh = this.zoneMeshes.get(el.id);
      if (!mesh) {
        let geo = null;
        if (el.type === "zone_rect") {
          geo = new T.PlaneGeometry(el.width || 120, el.height || 80);
        } else if (el.type === "zone_circle") {
          geo = new T.CircleGeometry(el.radius || 50, 32);
        } else if (el.type === "zone_triangle") {
          const s = el.size || 70;
          const triH = s * 0.866;
          const shape = new T.Shape();
          shape.moveTo(0, -triH * 0.6);
          shape.lineTo(s * 0.5, triH * 0.4);
          shape.lineTo(-s * 0.5, triH * 0.4);
          shape.closePath();
          geo = new T.ShapeGeometry(shape);
        }

        const col = new T.Color(el.color || "#38bdf8");
        const mat = new T.MeshBasicMaterial({
          color: col,
          transparent: true,
          opacity: 0.35,
          side: T.DoubleSide
        });
        mesh = new T.Mesh(geo, mat);
        mesh.rotation.x = -Math.PI / 2;
        this.zoneMeshes.set(el.id, mesh);
        this.scene.add(mesh);
      }

      const p3 = this.to3DCoords(el.x, el.y);
      mesh.position.set(p3.x, 0.4, p3.z); // Direkt hauchdünn über dem Rasen
      if (el.rotation) {
        mesh.rotation.z = -(el.rotation * Math.PI) / 180;
      }
    });

    for (const [id, m] of this.zoneMeshes.entries()) {
      if (!activeIds.has(id)) {
        this.scene.remove(m);
        this.zoneMeshes.delete(id);
      }
    }
  }

  render3DArrows(arrows) {
    const T = window.THREE;
    // Bereinige alte Linien
    this.arrowLines.forEach(l => this.scene.remove(l));
    this.arrowLines = [];

    arrows.forEach(arr => {
      const pStart = this.to3DCoords(arr.x1, arr.y1);
      const pEnd = this.to3DCoords(arr.x2, arr.y2);

      const col = new T.Color(arr.color || (arr.type === "pass" ? "#facc15" : "#38bdf8"));
      const points = [];

      // Bézier-Kurve oder Direktverbindung in 3D
      if (arr.cp1_dx !== undefined && (arr.cp1_dx !== 0 || arr.cp1_dy !== 0)) {
        const p1_3d = this.to3DCoords(arr.x1 + arr.cp1_dx, arr.y1 + arr.cp1_dy);
        const p2_3d = this.to3DCoords(arr.x2 + (arr.cp2_dx || 0), arr.y2 + (arr.cp2_dy || 0));
        const curve = new T.CubicBezierCurve3(
          new T.Vector3(pStart.x, 1.5, pStart.z),
          new T.Vector3(p1_3d.x, 1.5, p1_3d.z),
          new T.Vector3(p2_3d.x, 1.5, p2_3d.z),
          new T.Vector3(pEnd.x, 1.5, pEnd.z)
        );
        points.push(...curve.getPoints(30));
      } else {
        points.push(new T.Vector3(pStart.x, 1.5, pStart.z));
        points.push(new T.Vector3(pEnd.x, 1.5, pEnd.z));
      }

      const geo = new T.BufferGeometry().setFromPoints(points);
      const mat = new T.LineBasicMaterial({
        color: col,
        linewidth: 3
      });
      const line = new T.Line(geo, mat);
      this.scene.add(line);
      this.arrowLines.push(line);

      // Pfeilspitze (Kegel) am Endpunkt
      const tipGeo = new T.ConeGeometry(5, 12, 12);
      const tipMat = new T.MeshBasicMaterial({ color: col });
      const tip = new T.Mesh(tipGeo, tipMat);
      tip.position.set(pEnd.x, 1.5, pEnd.z);

      // Richtung berechnen
      const lastPt = points[points.length - 1];
      const prevPt = points[Math.max(0, points.length - 3)];
      const dir = new T.Vector3().subVectors(lastPt, prevPt).normalize();
      tip.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), dir);
      this.scene.add(tip);
      this.arrowLines.push(tip);
    });
  }

  // Nimmt eine vollständige Animation als Video via CCapture.js frame-by-frame auf (100% flüssig, keine Framedrops)
  async recordAnimationVideo({ durationPerStep = 2000, fps = 30, onProgress = null }) {
    if (!this.renderer || !this.scene || !this.camera) {
      throw new Error("3D Ansicht ist nicht initialisiert.");
    }
    const currentEx = (typeof this.getCurrentExercise === "function") ? this.getCurrentExercise() : (this.state && this.state.currentExercise);
    if (!currentEx || !Array.isArray(currentEx.keyframes) || currentEx.keyframes.length < 2) {
      throw new Error("Mindestens 2 Schritte erforderlich für Video.");
    }

    const canvas = this.renderer.domElement;
    const totalSteps = currentEx.keyframes.length;
    const totalDuration = (totalSteps - 1) * durationPerStep;
    const totalFrames = Math.max(2, Math.round((totalDuration / 1000) * fps));

    const TC_REF = window.TacticalCoach || (typeof TC === "function" ? TC() : null);

    // Nutzen von CCapture falls geladen
    if (typeof window.CCapture !== "undefined") {
      const capturer = new window.CCapture({
        format: "webm",
        framerate: fps,
        quality: 95,
        verbose: false
      });

      capturer.start();

      return new Promise((resolve, reject) => {
        let frame = 0;

        const captureStep = () => {
          if (frame > totalFrames) {
            if (onProgress) onProgress(1.0);
            capturer.stop();
            capturer.save((blob) => {
              resolve({ blob: blob, mimeType: "video/webm" });
            });
            return;
          }

          const progress = frame / totalFrames;
          if (onProgress) onProgress(progress);

          const elapsed = (frame / fps) * 1000;
          const stepIdx = Math.min(totalSteps - 2, Math.floor(elapsed / durationPerStep));
          const stepProgress = Math.min(1.0, (elapsed % durationPerStep) / durationPerStep);
          const smoothT = 0.5 - 0.5 * Math.cos(Math.PI * stepProgress);

          const kf1 = currentEx.keyframes[stepIdx] || { elements: [], arrows: [] };
          const kf2 = currentEx.keyframes[stepIdx + 1] || { elements: [], arrows: [] };

          const map1 = new Map((kf1.elements || []).map(e => [e.id, e]));
          const map2 = new Map((kf2.elements || []).map(e => [e.id, e]));
          const interpolated = [];
          const allIds = new Set([...map1.keys(), ...map2.keys()]);

          for (const id of allIds) {
            const el1 = map1.get(id);
            const el2 = map2.get(id);
            if (el1 && el2) {
              let posX, posY;
              if ((el2.cp1_dx !== undefined || el2.cp1_dy !== undefined || el2.cp2_dx !== undefined || el2.cp2_dy !== undefined) && TC_REF && TC_REF.geometry) {
                const { p1, p2 } = TC_REF.geometry.getEffectiveCurveControlPoints(el1, el2);
                const pt = TC_REF.geometry.getCubicBezierPoint(smoothT, el1, p1, p2, el2);
                posX = pt.x;
                posY = pt.y;
              } else {
                posX = el1.x + (el2.x - el1.x) * smoothT;
                posY = el1.y + (el2.y - el1.y) * smoothT;
              }

              // Drehung (Rotation) interpolieren (kürzester Winkel)
              const rot1 = el1.rotation || 0;
              const rot2 = el2.rotation !== undefined ? el2.rotation : rot1;
              let diffRot = (rot2 - rot1) % 360;
              if (diffRot > 180) diffRot -= 360;
              if (diffRot < -180) diffRot += 360;
              const currentRot = rot1 + diffRot * smoothT;

              let scaleMult = 1.0;
              let jumpOffset = 0;
              if (el2.jump) {
                const jumpFactor = Math.sin(smoothT * Math.PI);
                scaleMult = 1.0 + jumpFactor * 0.45;
                jumpOffset = jumpFactor;
              }
              interpolated.push({
                ...el1,
                ...el2,
                x: posX,
                y: posY,
                rotation: currentRot,
                scaleMultiplier: scaleMult,
                jumpProgress: jumpOffset
              });
            } else if (el1) {
              interpolated.push(el1);
            } else if (el2 && smoothT > 0.5) {
              interpolated.push(el2);
            }
          }

          this.syncScene(interpolated, kf1.arrows);

          if (this.controls) this.controls.update();
          if (this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
          }

          capturer.capture(canvas);
          frame++;

          // Kleines Timeout, um dem UI/Mainthread Luft zu geben und Fortschritt anzuzeigen
          setTimeout(captureStep, 5);
        };

        captureStep();
      });
    }

    // Fallback: MediaRecorder captureStream
    let mimeType = "video/webm;codecs=vp9";
    if (window.MediaRecorder.isTypeSupported("video/mp4;codecs=avc1")) {
      mimeType = "video/mp4;codecs=avc1";
    } else if (window.MediaRecorder.isTypeSupported("video/mp4")) {
      mimeType = "video/mp4";
    } else if (window.MediaRecorder.isTypeSupported("video/webm;codecs=vp8")) {
      mimeType = "video/webm;codecs=vp8";
    } else if (window.MediaRecorder.isTypeSupported("video/webm")) {
      mimeType = "video/webm";
    }

    const stream = canvas.captureStream(fps);
    const recorder = new window.MediaRecorder(stream, {
      mimeType: mimeType,
      videoBitsPerSecond: 6000000
    });

    const chunks = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };

    return new Promise(async (resolve, reject) => {
      recorder.onerror = (err) => reject(err);
      recorder.onstop = () => {
        const finalBlob = new Blob(chunks, { type: mimeType });
        resolve({ blob: finalBlob, mimeType: mimeType });
      };

      const startTime = performance.now();
      recorder.start();

      const renderLoop = () => {
        const elapsed = performance.now() - startTime;
        const progress = Math.min(1.0, elapsed / totalDuration);
        if (onProgress) onProgress(progress);

        const stepIdx = Math.min(totalSteps - 2, Math.floor(elapsed / durationPerStep));
        const stepProgress = Math.min(1.0, (elapsed % durationPerStep) / durationPerStep);
        const smoothT = 0.5 - 0.5 * Math.cos(Math.PI * stepProgress);

        const kf1 = currentEx.keyframes[stepIdx] || { elements: [], arrows: [] };
        const kf2 = currentEx.keyframes[stepIdx + 1] || { elements: [], arrows: [] };

        const map1 = new Map((kf1.elements || []).map(e => [e.id, e]));
        const map2 = new Map((kf2.elements || []).map(e => [e.id, e]));
        const interpolated = [];
        const allIds = new Set([...map1.keys(), ...map2.keys()]);

        for (const id of allIds) {
          const el1 = map1.get(id);
          const el2 = map2.get(id);
          if (el1 && el2) {
            let posX, posY;
            if ((el2.cp1_dx !== undefined || el2.cp1_dy !== undefined || el2.cp2_dx !== undefined || el2.cp2_dy !== undefined) && TC_REF && TC_REF.geometry) {
              const { p1, p2 } = TC_REF.geometry.getEffectiveCurveControlPoints(el1, el2);
              const pt = TC_REF.geometry.getCubicBezierPoint(smoothT, el1, p1, p2, el2);
              posX = pt.x;
              posY = pt.y;
            } else {
              posX = el1.x + (el2.x - el1.x) * smoothT;
              posY = el1.y + (el2.y - el1.y) * smoothT;
            }

            const rot1 = el1.rotation || 0;
            const rot2 = el2.rotation !== undefined ? el2.rotation : rot1;
            let diffRot = (rot2 - rot1) % 360;
            if (diffRot > 180) diffRot -= 360;
            if (diffRot < -180) diffRot += 360;
            const currentRot = rot1 + diffRot * smoothT;

            let scaleMult = 1.0;
            let jumpOffset = 0;
            if (el2.jump) {
              const jumpFactor = Math.sin(smoothT * Math.PI);
              scaleMult = 1.0 + jumpFactor * 0.45;
              jumpOffset = jumpFactor;
            }
            interpolated.push({
              ...el1,
              ...el2,
              x: posX,
              y: posY,
              rotation: currentRot,
              scaleMultiplier: scaleMult,
              jumpProgress: jumpOffset
            });
          } else if (el1) {
            interpolated.push(el1);
          } else if (el2 && smoothT > 0.5) {
            interpolated.push(el2);
          }
        }

        this.syncScene(interpolated, kf1.arrows);

        if (this.controls) this.controls.update();
        if (this.renderer && this.scene && this.camera) {
          this.renderer.render(this.scene, this.camera);
        }

        if (elapsed < totalDuration) {
          requestAnimationFrame(renderLoop);
        } else {
          setTimeout(() => {
            recorder.stop();
          }, 350);
        }
      };

      requestAnimationFrame(renderLoop);
    });
  }

  // Liefert Data-URL eines 3D-Snapshots
  getSnapshotDataURL() {
    if (!this.renderer || !this.scene || !this.camera) return null;
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL("image/png");
  }

  // Setzt Kamera auf vordefinierte Taktik-Perspektiven
  setCameraPreset(preset = "tactical") {
    if (!this.camera || !this.controls) return;
    if (preset === "tactical") {
      this.camera.position.set(0, 520, 680);
      this.controls.target.set(0, 0, 0);
    } else if (preset === "bird") {
      this.camera.position.set(0, 850, 10);
      this.controls.target.set(0, 0, 0);
    } else if (preset === "sideline") {
      this.camera.position.set(0, 160, 480);
      this.controls.target.set(0, 0, 0);
    }
    this.controls.update();
  }
}
