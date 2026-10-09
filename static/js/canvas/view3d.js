// canvas/view3d.js - Leichtgewichtige, vollwertige 3D-Ansicht mit Three.js
// Visualisiert das Spielfeld, Spieler, Bälle, Tore, Hütchen, Zonen und Linien in 3D.
// Unterstützt Animationen (Interpolation aus PlaybackController) und interaktive Kamerafahrt.

import { VIRTUAL_WIDTH, VIRTUAL_HEIGHT } from "../core/constants.js";
import { drawPitchBackground } from "../core/pitch.js";
import { drawArrow } from "./arrows.js";
import { getArrowCurveControlPoints } from "../core/geometry.js";

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
    this.currentArrows = [];
    this.zoneMeshes = new Map(); // id -> THREE.Mesh

    this.sharedMaterials = {};
    this.sharedGeometries = {};
    this.showNames = false; // Standardmäßig aus für sauberen Look
    this.showNumbers = false; // Standardmäßig schwebende Nummern aus, da Nummern jetzt auf dem Trikot stehen!

    // GLTF Footballer Model & Animations Cache
    this.footballerGLTF = null;
    this.footballerClips = new Map(); // name -> AnimationClip
    this.playerMixers = new Set(); // Set of AnimationMixers for update loop
    this.clock = new (window.THREE ? window.THREE.Clock : Object)();
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
    this.createStadiumEnvironment();
    this.preloadFootballerAssets();

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
    // 2D-Textur aus unserer vorhandenen pitch.js Zeichenlogik rendern! (2048x1434 für gestochen scharfe 2D-Linien)
    this.pitchTextureCanvas = document.createElement("canvas");
    this.pitchTextureCanvas.width = 2048;
    this.pitchTextureCanvas.height = 1432;
    this.pitchTextureCtx = this.pitchTextureCanvas.getContext("2d");

    this.pitchTexture = new T.CanvasTexture(this.pitchTextureCanvas);
    this.pitchTexture.anisotropy = 16;

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

  createStadiumEnvironment() {
    const T = window.THREE;
    const group = new T.Group();

    // 1. LED-Werbebanden rund um das Spielfeld
    const boardH = 14;
    const boardDepth = 2.5;
    const boardMarginX = 35;
    const boardMarginZ = 30;
    const halfW = VIRTUAL_WIDTH / 2 + boardMarginX;
    const halfH = VIRTUAL_HEIGHT / 2 + boardMarginZ;

    // LED-Textur generieren (modernes Sport-Branding & Taktikboard Logo)
    const ledCanvas = document.createElement("canvas");
    ledCanvas.width = 1024;
    ledCanvas.height = 64;
    const lCtx = ledCanvas.getContext("2d");
    const ledGrad = lCtx.createLinearGradient(0, 0, 1024, 0);
    ledGrad.addColorStop(0, "#0284c7");
    ledGrad.addColorStop(0.3, "#0f172a");
    ledGrad.addColorStop(0.5, "#06b6d4");
    ledGrad.addColorStop(0.7, "#0f172a");
    ledGrad.addColorStop(1, "#3b82f6");
    lCtx.fillStyle = ledGrad;
    lCtx.fillRect(0, 0, 1024, 64);
    lCtx.fillStyle = "#ffffff";
    lCtx.font = "bold 24px Inter, sans-serif";
    lCtx.textAlign = "center";
    lCtx.textBaseline = "middle";
    for (let x = 128; x < 1024; x += 256) {
      lCtx.fillText("⚽ TACTICAL COACH 3D", x, 32);
    }
    const ledTex = new T.CanvasTexture(ledCanvas);
    ledTex.wrapS = T.RepeatWrapping;
    ledTex.wrapT = T.RepeatWrapping;
    ledTex.repeat.set(4, 1);

    const ledMat = new T.MeshStandardMaterial({
      map: ledTex,
      roughness: 0.3,
      metalness: 0.2,
      emissive: 0x0369a1,
      emissiveIntensity: 0.25
    });
    const boardBaseMat = new T.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.8 });

    // Oben & Unten Banden (Länge 1000 + 2*marginX)
    const lenX = VIRTUAL_WIDTH + boardMarginX * 2;
    [-halfH, halfH].forEach(posZ => {
      const bGeo = new T.BoxGeometry(lenX, boardH, boardDepth);
      const bMesh = new T.Mesh(bGeo, [boardBaseMat, boardBaseMat, boardBaseMat, boardBaseMat, ledMat, ledMat]);
      bMesh.position.set(0, boardH / 2, posZ);
      bMesh.castShadow = true;
      group.add(bMesh);
    });

    // Links & Rechts Banden (Länge 700 + 2*marginZ, mit Torlücke)
    const sideLen = (VIRTUAL_HEIGHT + boardMarginZ * 2 - 140) / 2;
    [-halfW, halfW].forEach(posX => {
      [-halfH / 2 - 35, halfH / 2 + 35].forEach(posZ => {
        const bGeo = new T.BoxGeometry(boardDepth, boardH, sideLen);
        const bMesh = new T.Mesh(bGeo, ledMat);
        bMesh.position.set(posX, boardH / 2, posZ);
        bMesh.castShadow = true;
        group.add(bMesh);
      });
    });

    // 2. 4 Eck-Flutlichtmasten (Stadion-Atmosphäre)
    const towerH = 260;
    const mastMat = new T.MeshStandardMaterial({ color: 0x334155, metalness: 0.7, roughness: 0.3 });
    const lampMat = new T.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffedd5, emissiveIntensity: 1.0 });

    const mastGeo = new T.CylinderGeometry(3.5, 6, towerH, 12);
    const headGeo = new T.BoxGeometry(32, 18, 12);
    const cornerOffsets = [
      [-halfW - 50, -halfH - 50],
      [halfW + 50, -halfH - 50],
      [-halfW - 50, halfH + 50],
      [halfW + 50, halfH + 50]
    ];

    cornerOffsets.forEach(([cx, cz]) => {
      const mast = new T.Mesh(mastGeo, mastMat);
      mast.position.set(cx, towerH / 2, cz);
      mast.castShadow = true;
      group.add(mast);

      // Flutlicht-Kopf oben
      const head = new T.Mesh(headGeo, lampMat);
      head.position.set(cx, towerH, cz);
      head.lookAt(0, 0, 0); // Richtet Scheinwerfer zur Spielfeldmitte aus
      group.add(head);
    });

    this.scene.add(group);
  }

  preloadFootballerAssets() {
    if (!window.THREE || !window.THREE.GLTFLoader) return;
    const loader = new window.THREE.GLTFLoader();

    // 1. Lade Basis-Modell (Mixamo X-Bot Spieler inklusive aller 21 eingebetteter Animationen)
    loader.load('/static/models/mixamo_player.glb', (gltf) => {
      this.footballerGLTF = gltf;

      // Extrahiere eingebettete Animationen direkt aus der GLB-Datei
      if (gltf.animations && gltf.animations.length > 0) {
        gltf.animations.forEach(clip => {
          this.footballerClips.set(clip.name, clip);
        });
        console.log(`Mixamo Spieler & ${gltf.animations.length} Animationen erfolgreich geladen! Erneuere Meshes...`);
      }

      // Bestehende Fallback-Spieler entfernen, damit sie als echtes GLTF neu gebaut werden:
      for (const [id, grp] of this.elementMeshes.entries()) {
        if (grp.userData && !grp.userData.isGLTF && grp.userData.torsoMesh) {
          this.scene.remove(grp);
          this.disposeGroup(grp);
          this.elementMeshes.delete(id);
        }
      }
      if (this.isActive) this.syncScene();
    }, undefined, (err) => {
      console.warn("mixamo_player.glb konnte nicht geladen werden, verwende Fallback-Geometrie", err);
    });
  }

  updatePitchTexture() {
    if (!this.pitchTextureCtx) return;
    const ctx = this.pitchTextureCtx;
    ctx.clearRect(0, 0, 2048, 1432);

    ctx.save();
    // Skaliere virtuelle Spielfeld-Koordinaten (1000x700) auf 2048x1432
    ctx.scale(2048 / VIRTUAL_WIDTH, 1432 / VIRTUAL_HEIGHT);
    const ex = this.getCurrentExercise ? this.getCurrentExercise() : null;
    const pitchType = (ex && ex.pitch_type) || this.state.pitchType || "half";
    drawPitchBackground(ctx, pitchType);

    // Zeichne 2D-Taktiklinien direkt gestochen scharf auf den Rasen
    if (this.currentArrows && this.currentArrows.length > 0) {
      this.currentArrows.forEach(arr => {
        let cp1 = null;
        let cp2 = null;
        try {
          const cp = getArrowCurveControlPoints(arr);
          cp1 = cp.p1;
          cp2 = cp.p2;
        } catch (e) {
          if (arr.cp1_dx !== undefined && (arr.cp1_dx !== 0 || arr.cp1_dy !== 0 || arr.cp2_dx !== 0 || arr.cp2_dy !== 0)) {
            cp1 = { x: arr.x1 + arr.cp1_dx, y: arr.y1 + arr.cp1_dy };
            cp2 = { x: arr.x2 + (arr.cp2_dx || 0), y: arr.y2 + (arr.cp2_dy || 0) };
          }
        }
        // In 3D etwas kräftigerer Stroke (zoomScale = 1.35), flach und sauber als 2D-Linie auf dem Rasen
        drawArrow(
          ctx,
          arr.x1,
          arr.y1,
          arr.x2,
          arr.y2,
          arr.type || "pass",
          arr.color || (arr.type === "pass" ? "#facc15" : (arr.type === "guide" ? "#fbbf24" : "#38bdf8")),
          false,
          null,
          cp1,
          cp2,
          arr.rawPoints || null,
          1.35,
          true // keine interaktiven Bearbeitungs-Griffe in 3D
        );
      });
    }

    ctx.restore();

    if (this.pitchTexture) this.pitchTexture.needsUpdate = true;
  }

  initSharedResources() {
    const T = window.THREE;

    // Spieler-Komponenten Geometrien (anatomischer Fußballer-Look)
    // 1. Trikot-Torso (leicht trapezförmig, oben breitere Schultern 15, unten Taille 12, Höhe 18)
    this.sharedGeometries.playerTorso = new T.CylinderGeometry(15, 12, 18, 16);
    // 2. Ärmel (links & rechts, angewinkelt)
    this.sharedGeometries.playerSleeve = new T.CylinderGeometry(4.5, 4, 10, 12);
    // 3. Sporthose / Shorts (weiße oder dunkle Shorts, Höhe 10, oben 12.5, unten 13)
    this.sharedGeometries.playerShorts = new T.CylinderGeometry(12.5, 13, 10, 16);
    // 4. Beine / Knie / Stutzen (Stutzen oben bis unters Knie)
    this.sharedGeometries.playerLegUpper = new T.CylinderGeometry(3.8, 3.4, 10, 12); // Oberschenkel (Haut)
    this.sharedGeometries.playerSock = new T.CylinderGeometry(3.6, 3.2, 12, 12);     // Stutzen (Teamfarbe/Weiß)
    // 5. Fußballschuhe (schwarz mit Stollensohle)
    this.sharedGeometries.playerCleat = new T.BoxGeometry(6.5, 4.5, 11);
    // 6. Kopf & Haare & Blickrichtungs-Nase
    this.sharedGeometries.playerHead = new T.SphereGeometry(7.5, 18, 18);
    this.sharedGeometries.playerHair = new T.SphereGeometry(7.8, 16, 16, 0, Math.PI * 2, 0, Math.PI * 0.55);
    this.sharedGeometries.playerNose = new T.ConeGeometry(1.8, 3.5, 8);

    // 7. Weicher Kontaktschatten (flache runde Scheibe auf dem Rasen unter Spieler & Ball)
    this.sharedGeometries.contactShadow = new T.PlaneGeometry(32, 32);

    // Textur für weichen radialen Kontaktschatten (Soft Falloff)
    const shadowCanvas = document.createElement("canvas");
    shadowCanvas.width = 128;
    shadowCanvas.height = 128;
    const sCtx = shadowCanvas.getContext("2d");
    const sGrad = sCtx.createRadialGradient(64, 64, 4, 64, 64, 60);
    sGrad.addColorStop(0, "rgba(0, 0, 0, 0.65)");
    sGrad.addColorStop(0.5, "rgba(0, 0, 0, 0.25)");
    sGrad.addColorStop(1, "rgba(0, 0, 0, 0.0)");
    sCtx.fillStyle = sGrad;
    sCtx.fillRect(0, 0, 128, 128);
    const shadowTex = new T.CanvasTexture(shadowCanvas);

    this.sharedMaterials.contactShadow = new T.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.75
    });

    // Ball-Geometrie (Radius 8.5)
    this.sharedGeometries.ball = new T.SphereGeometry(8.5, 32, 32);

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

    // Ball-Textur (Klassischer Telstar / Hexagon-Fußball)
    const ballCanvas = document.createElement("canvas");
    ballCanvas.width = 512;
    ballCanvas.height = 256;
    const bCtx = ballCanvas.getContext("2d");
    bCtx.fillStyle = "#ffffff";
    bCtx.fillRect(0, 0, 512, 256);

    // Schwarze Fünfecke / Telstar-Waben auf dem Ball
    bCtx.fillStyle = "#1e293b";
    const drawHex = (cx, cy, r) => {
      bCtx.beginPath();
      for (let i = 0; i < 6; i++) {
        const ang = (i * Math.PI) / 3;
        const hx = cx + r * Math.cos(ang);
        const hy = cy + r * Math.sin(ang);
        if (i === 0) bCtx.moveTo(hx, hy);
        else bCtx.lineTo(hx, hy);
      }
      bCtx.closePath();
      bCtx.fill();
    };
    // Waben-Muster gleichmäßig verteilen
    const spots = [
      [64, 64], [192, 64], [320, 64], [448, 64],
      [128, 140], [256, 140], [384, 140],
      [64, 210], [192, 210], [320, 210], [448, 210]
    ];
    spots.forEach(([sx, sy]) => drawHex(sx, sy, 22));

    // Feine Nahtlinien
    bCtx.strokeStyle = "#cbd5e1";
    bCtx.lineWidth = 2.5;
    spots.forEach(([sx, sy]) => {
      bCtx.beginPath();
      bCtx.arc(sx, sy, 32, 0, Math.PI * 2);
      bCtx.stroke();
    });

    const ballTexture = new T.CanvasTexture(ballCanvas);
    this.sharedMaterials.ball = new T.MeshStandardMaterial({
      map: ballTexture,
      roughness: 0.35,
      metalness: 0.05
    });

    // Feste Materialien
    this.sharedMaterials.skin = new T.MeshStandardMaterial({ color: 0xffedd5, roughness: 0.7 });
    this.sharedMaterials.hair = new T.MeshStandardMaterial({ color: 0x332211, roughness: 0.8 });
    this.sharedMaterials.shorts = new T.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.5, skinning: true }); // Klassisch weiße Shorts
    this.sharedMaterials.cleats = new T.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.4, metalness: 0.2 }); // Schwarze Fußballschuhe

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

  // Generiert ein individuelles Trikot-Material mit echter Rückennummer & Schulterstreifen
  getJerseyMaterial(teamColHex, numberStr) {
    if (!this.jerseyMaterialCache) this.jerseyMaterialCache = new Map();
    const num = (numberStr || "").toString().trim();
    const key = `${teamColHex}_${num}`;
    if (this.jerseyMaterialCache.has(key)) {
      return this.jerseyMaterialCache.get(key);
    }

    const T = window.THREE;
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");

    // Grundfarbe Trikot
    const hexStr = `#${new T.Color(teamColHex).getHexString()}`;
    ctx.fillStyle = hexStr;
    ctx.fillRect(0, 0, 512, 256);

    // Schulter- & Kragenstreifen (Weiß oder Dunkel je nach Trikothelligkeit)
    const isLight = teamColHex === 0xeab308 || teamColHex === 0xffffff;
    ctx.fillStyle = isLight ? "#0f172a" : "#ffffff";
    ctx.fillRect(0, 0, 512, 24); // Oberer Kragenstreifen

    // Weiße/Dunkle Akzentstreifen an den Seiten
    ctx.fillStyle = isLight ? "rgba(15, 23, 42, 0.4)" : "rgba(255, 255, 255, 0.4)";
    ctx.fillRect(110, 0, 16, 256);
    ctx.fillRect(386, 0, 16, 256);

    // Rückseite (u ~ 0.25 -> X=128): Große Trikotnummer auf dem Rücken!
    // In Three.js CylinderGeometry läuft u=0 (+X rechts), u=0.25 (-Z Rücken), u=0.5 (-X links), u=0.75 (+Z Brust)
    if (num) {
      ctx.fillStyle = isLight ? "#0f172a" : "#ffffff";
      ctx.strokeStyle = isLight ? "#ffffff" : "#0f172a";
      ctx.lineWidth = 6;
      ctx.font = "900 110px Inter, Impact, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.strokeText(num, 128, 130);
      ctx.fillText(num, 128, 130);
    }

    // Vorderseite / Brust (u ~ 0.75 -> X=384): Kleines Vereinswappen / Brustlogo
    ctx.fillStyle = isLight ? "#0f172a" : "#ffffff";
    ctx.beginPath();
    ctx.arc(384, 90, 14, 0, Math.PI * 2);
    ctx.fill();

    const tex = new T.CanvasTexture(canvas);
    const mat = new T.MeshStandardMaterial({
      map: tex,
      roughness: 0.4,
      metalness: 0.1,
      skinning: true
    });

    this.jerseyMaterialCache.set(key, mat);
    return mat;
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

      // Update skeletal animation mixers
      if (this.clock && this.playerMixers && this.playerMixers.size > 0) {
        const delta = this.clock.getDelta();
        for (const mixer of this.playerMixers) {
          mixer.update(delta);
        }
      }

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

    this.render3DElements(elements, arrows);
    this.render3DZones(elements);
    this.render3DArrows(arrows);
  }

  render3DElements(elements, arrows = []) {
    const T = window.THREE;
    const activeIds = new Set();

    // 1. Finde den aktuellen Ball in den Elementen (für Blickrichtungs-Tracking)
    const ballEl = elements.find(e => e.type === "ball");
    const ballPos3D = ballEl ? this.to3DCoords(ballEl.x, ballEl.y) : null;

    // Finde Pass-/Schuss-Pfeile, die von Spielern ausgehen (für Schuss-Ausrichtung)
    const passArrows = (arrows || []).filter(a => a.type === "pass" || a.type === "shot");

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

      // Berechne Bewegungs-Geschwindigkeit & Richtung für Neigung (Lean/Tilt)
      const prevPos = group.userData.lastPos || { x: p3.x, z: p3.z };
      const dx = p3.x - prevPos.x;
      const dz = p3.z - prevPos.z;
      const moveDist = Math.hypot(dx, dz);
      group.userData.lastPos = { x: p3.x, z: p3.z };

      group.position.set(p3.x, jumpHeight, p3.z);

      // Rotation & Blickrichtung (Y-Rotation im 3D Raum)
      const elRot = el.rotation || 0;
      if (el.type === "player") {
        let targetRotY = -(elRot * Math.PI) / 180;

        // Prüfe, ob dieser Spieler gerade einen Pass/Torschuss ausführt (Pfeil-Startpunkt nah am Spieler)
        const myPass = passArrows.find(a => Math.hypot(a.x1 - el.x, a.y1 - el.y) < 45);

        if (myPass) {
          // 1. Priorität: Der Spieler schießt / passt -> Körper und Blickrichtung exakt zum Ziel des Schusses/Passes!
          const target3D = this.to3DCoords(myPass.x2, myPass.y2);
          const aimX = target3D.x - p3.x;
          const aimZ = target3D.z - p3.z;
          targetRotY = Math.atan2(aimX, aimZ);
        } else if (moveDist > 0.4) {
          // 2. Priorität: Wenn der Spieler sprintet / läuft -> Ausrichtung in Laufrichtung
          const moveAngle = Math.atan2(dx, dz); // +Z ist Vorwärts
          targetRotY = moveAngle;
        } else if (ballPos3D && (!el.rotation || el.rotation === 0)) {
          // 3. Priorität: Im Stand ohne Schuss/Lauf -> Spieler blickt und orientiert sich zum Ball
          const toBallX = ballPos3D.x - p3.x;
          const toBallZ = ballPos3D.z - p3.z;
          const distToBall = Math.hypot(toBallX, toBallZ);
          if (distToBall > 12) {
            targetRotY = Math.atan2(toBallX, toBallZ);
          }
        }

        // Weiche Dämpfung der Y-Drehung
        if (group.userData.currentRotY === undefined) {
          group.userData.currentRotY = targetRotY;
        } else {
          let diffY = (targetRotY - group.userData.currentRotY) % (Math.PI * 2);
          if (diffY > Math.PI) diffY -= Math.PI * 2;
          if (diffY < -Math.PI) diffY += Math.PI * 2;
          group.userData.currentRotY += diffY * 0.35;
        }
        group.rotation.y = group.userData.currentRotY;

        // 3D-Körper-Neigung (Lean-in / Z- & X-Tilt in Sprintrichtung):
        const maxTilt = 0.22; // ca. 12-13 Grad Neigung
        const speedFactor = Math.min(1.0, moveDist / 6.0);
        
        // Berechne relative Beschleunigung im lokalen Koordinatensystem des Spielers
        const localForward = dx * Math.sin(group.rotation.y) + dz * Math.cos(group.rotation.y);
        const localSide = dx * Math.cos(group.rotation.y) - dz * Math.sin(group.rotation.y);

        // Neigung nach vorne beim Sprint (X-Rotation) und zur Seite in der Kurve (Z-Rotation)
        const targetTiltX = Math.max(-maxTilt, Math.min(maxTilt, (localForward / 5.0) * maxTilt));
        const targetTiltZ = Math.max(-maxTilt, Math.min(maxTilt, -(localSide / 5.0) * maxTilt));

        group.rotation.x += (targetTiltX - group.rotation.x) * 0.2;
        group.rotation.z += (targetTiltZ - group.rotation.z) * 0.2;

        // GLTF Skeletal Animation Handling (Mixamo Clips: idle, run, sprint, kick, shoot, tackle, gk)
        if (group.userData.animMixer && group.userData.animActions) {
          let desiredAnim = 'idle';
          if (el.role === 'goalkeeper' || el.isGoalkeeper) {
            desiredAnim = 'gk_idle';
          }

          const distToBall = ballPos3D ? Math.hypot(ballPos3D.x - p3.x, ballPos3D.z - p3.z) : 999;
          if (myPass && ballPos3D && distToBall < 18) {
            desiredAnim = (myPass.type === 'shot') ? 'shoot' : 'kick';
          } else if (moveDist > 3.0) {
            desiredAnim = 'sprint';
          } else if (moveDist > 0.4) {
            desiredAnim = 'run';
          }

          if (group.userData.currentAnim !== desiredAnim) {
            const currentAction = group.userData.animActions.get(group.userData.currentAnim);
            const nextAction = group.userData.animActions.get(desiredAnim);
            if (nextAction) {
              if (currentAction && currentAction !== nextAction) {
                currentAction.fadeOut(0.2);
              }
              nextAction.reset().fadeIn(0.2).play();
              group.userData.currentAnim = desiredAnim;
            }
          }
        }

        // Schritt- & Schuss-Animation der Beine & Arme (Fallback bei Geometrie-Spielern)
        const thighL = group.userData.thighL;
        const thighR = group.userData.thighR;
        const armL = group.userData.armL;
        const armR = group.userData.armR;

        if (myPass && ballPos3D && Math.hypot(ballPos3D.x - p3.x, ballPos3D.z - p3.z) < 70) {
          // Schuss-Pose! Rechtes Bein zieht nach vorne durch, Arme balancieren aus
          const kickPhase = Math.sin(performance.now() * 0.015);
          if (thighR) thighR.rotation.x = 0.65;  // Schussbein vorgebeugt
          if (thighL) thighL.rotation.x = -0.3; // Standbein stabilisiert
          if (armL) armL.rotation.x = 0.5;
          if (armR) armR.rotation.x = -0.5;
        } else {
          // Normale Schritt-Laufanimation während der Bewegung
          const timeNow = performance.now() * 0.012;
          const stride = (moveDist > 0.2) ? Math.sin(timeNow) * speedFactor * 0.45 : 0;
          
          if (thighL && thighR) {
            thighL.rotation.x = stride;
            thighR.rotation.x = -stride;
          }
          if (armL && armR) {
            armL.rotation.x = -stride * 0.8;
            armR.rotation.x = stride * 0.8;
          }
        }

      } else if (el.type === "ball") {
        // Roll-Animation des Fußballs:
        // Wir drehen ausschließlich das innere Kugel-Mesh (ballMesh), NIEMALS die übergeordnete Gruppe!
        // group.position setzt die Position (x, y, z) linear & geradlinig auf dem Spielfeld.
        const ballMesh = group.userData.ballMesh;
        if (ballMesh) {
          if (moveDist > 0.05) {
            const rollAngle = moveDist / 8.5; // Radius r = 8.5
            // Rollachse senkrecht zur Bewegungsrichtung (dx, 0, dz) im Weltraum:
            const axis = new T.Vector3(dz, 0, -dx).normalize();
            const qRoll = new T.Quaternion().setFromAxisAngle(axis, rollAngle);
            ballMesh.quaternion.premultiply(qRoll);
          }
        }
        // Bei Flugbällen (Y > 8.5): Kontaktschatten bleibt auf dem Rasen, skaliert & wird transparenter
        const bShadow = group.userData.contactShadow;
        if (bShadow) {
          const ballY = el.z || 0; // z in 2D ist oft Flughöhe
          bShadow.position.y = -group.position.y + 0.3; // bleibt auf Rasenniveau
          const scale = Math.max(0.2, 0.65 - (ballY * 0.005));
          bShadow.scale.set(scale, scale, scale);
        }
      } else if (el.type === "dummy" || el.type === "hurdle" || el.type === "ladder" ||
          el.type === "goal_5m" || el.type === "goal_large" || el.type === "minigoal" || el.type === "goal_mini") {
        group.rotation.y = -(elRot * Math.PI) / 180 - Math.PI / 2;
        group.rotation.x = 0;
        group.rotation.z = 0;
      } else {
        group.rotation.y = -(elRot * Math.PI) / 180;
        group.rotation.x = 0;
        group.rotation.z = 0;
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
    if (group.userData && group.userData.animMixer) {
      if (this.playerMixers) this.playerMixers.delete(group.userData.animMixer);
      group.userData.animMixer.stopAllAction();
    }
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
      const baseJerseyMat = this.getMaterialForColor(teamCol, 0.4);
      const torsoJerseyMat = this.getJerseyMaterial(teamCol, el.number);
      const skinMat = this.sharedMaterials.skin;
      const hairMat = this.sharedMaterials.hair;
      const shortsMat = this.sharedMaterials.shorts;
      const cleatsMat = this.sharedMaterials.cleats;

      // 0. Weicher Kontaktschatten direkt unter den Füßen auf dem Rasen
      const shadow = new T.Mesh(this.sharedGeometries.contactShadow, this.sharedMaterials.contactShadow);
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.y = 0.3; // Knapp über dem Rasen
      group.add(shadow);
      group.userData.contactShadow = shadow;

      // 1. Prüfen, ob das GLTF-Fussballermodell mit Skelett verfügbar ist
      if (this.footballerGLTF && window.THREE.SkeletonUtils) {
        try {
          const model = window.THREE.SkeletonUtils.clone(this.footballerGLTF.scene);
          // Skalierung: Originalmodell ist ca. 180 Einheiten groß -> an Tactical Board anpassen (Höhe ca. 50 Einheiten)
          const scale = 0.28;
          model.scale.set(scale, scale, scale);
          model.position.y = 0;
          model.rotation.y = 0; // Standard Mixamo X Bot blickt nativ nach +Z in Laufrichtung

          // Sub-Meshes mit Team-Farben & Material ausstatten
          model.traverse((child) => {
            if (child.isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
              // Teamfarben auf Mesh-Oberfläche mappen
              if (child.name === 'Beta_Surface') {
                torsoJerseyMat.skinning = true;
                child.material = torsoJerseyMat;
                group.userData.torsoMesh = child;
              } else if (child.name === 'Beta_Joints') {
                shortsMat.skinning = true;
                child.material = shortsMat;
                group.userData.jointsMesh = child;
              }
            }
          });

          // AnimationMixer & Actions initialisieren
          const mixer = new T.AnimationMixer(model);
          const actions = new Map();
          if (this.footballerClips && this.footballerClips.size > 0) {
            for (const [clipName, clip] of this.footballerClips.entries()) {
              const action = mixer.clipAction(clip);
              if (clipName === 'kick' || clipName === 'shoot' || clipName === 'tackle') {
                action.setLoop(T.LoopOnce, 1);
                action.clampWhenFinished = true;
              }
              actions.set(clipName, action);
            }
          }

          // Starte standardmäßig mit Idle-Clip
          const idleAction = actions.get('idle');
          if (idleAction) {
            idleAction.play();
            group.userData.currentAnim = 'idle';
          }

          group.userData.animMixer = mixer;
          group.userData.animActions = actions;
          if (this.playerMixers) this.playerMixers.add(mixer);

          group.add(model);
          group.userData.isGLTF = true;

          // Namens- und Nummer-Billboards (falls aktiviert)
          const sprite = this.createNumberSprite(el.number || "");
          sprite.position.y = 58;
          sprite.name = "numberSprite";
          sprite.visible = !!this.showNumbers;
          group.add(sprite);

          if (el.name || el.label) {
            const nameSprite = this.createNameSprite(el.name || el.label);
            nameSprite.position.y = 58;
            nameSprite.name = "nameSprite";
            nameSprite.visible = !!this.showNames;
            group.add(nameSprite);
          }

          return group;
        } catch (err) {
          console.warn("Fehler beim Klonen des GLTF Modells, nutze prozeduralen Fallback:", err);
        }
      }

      // --- Fallback: Prozedurale Low-Poly Geometrie ---
      // 1. Torso / Trikot (mit gedruckter Rückennummer!)
      // CylinderGeometry UVs: u=0 bei +X, u=0.25 bei -Z (Rücken!), u=0.5 bei -X, u=0.75 bei +Z (Brust)
      const torso = new T.Mesh(this.sharedGeometries.playerTorso, torsoJerseyMat);
      torso.position.y = 28;
      torso.castShadow = true;
      group.add(torso);
      group.userData.torsoMesh = torso;

      // 1b. Ärmel links & rechts (in Trikotfarbe, leicht nach außen abgespreizt)
      const sleeveL = new T.Mesh(this.sharedGeometries.playerSleeve, baseJerseyMat);
      sleeveL.position.set(-10, 30, 0);
      sleeveL.rotation.z = Math.PI / 8;
      sleeveL.castShadow = true;
      group.add(sleeveL);

      const sleeveR = new T.Mesh(this.sharedGeometries.playerSleeve, baseJerseyMat);
      sleeveR.position.set(10, 30, 0);
      sleeveR.rotation.z = -Math.PI / 8;
      sleeveR.castShadow = true;
      group.add(sleeveR);

      // Unterarme / Hände (Hautton)
      const armL = new T.Mesh(new T.CylinderGeometry(2.5, 2.2, 8, 8), skinMat);
      armL.position.set(-13, 22, 1);
      armL.rotation.z = Math.PI / 10;
      armL.castShadow = true;
      group.add(armL);
      group.userData.armL = armL;

      const armR = new T.Mesh(new T.CylinderGeometry(2.5, 2.2, 8, 8), skinMat);
      armR.position.set(13, 22, 1);
      armR.rotation.z = -Math.PI / 10;
      armR.castShadow = true;
      group.add(armR);
      group.userData.armR = armR;

      // 2. Shorts / Sporthose (Höhe 10, Y-Mitte = 15)
      const shorts = new T.Mesh(this.sharedGeometries.playerShorts, shortsMat);
      shorts.position.y = 16;
      shorts.castShadow = true;
      group.add(shorts);

      // 3. Beine (Oberschenkel in Hautton, Kniestrümpfe/Stutzen in Teamfarbe, Fußballschuhe)
      const legGroups = [];
      [-5.5, 5.5].forEach((legX, lIdx) => {
        const legGroup = new T.Group();
        legGroup.position.set(legX, 12, 0);

        // Oberschenkel (Haut)
        const thigh = new T.Mesh(this.sharedGeometries.playerLegUpper, skinMat);
        thigh.position.set(0, -2, 0);
        thigh.castShadow = true;
        legGroup.add(thigh);

        // Stutzen (in Teamfarbe!)
        const sock = new T.Mesh(this.sharedGeometries.playerSock, baseJerseyMat);
        sock.position.set(0, -7, 0);
        sock.castShadow = true;
        legGroup.add(sock);

        // Fußballschuhe (schwarz, leicht nach vorne gestreckt)
        const cleat = new T.Mesh(this.sharedGeometries.playerCleat, cleatsMat);
        cleat.position.set(0, -10, 2);
        cleat.castShadow = true;
        legGroup.add(cleat);

        group.add(legGroup);
        legGroups.push(legGroup);
      });
      group.userData.thighL = legGroups[0];
      group.userData.thighR = legGroups[1];

      // 4. Kopf & Haare & Blickrichtung (Nase)
      // Kopf (Y = 43)
      const head = new T.Mesh(this.sharedGeometries.playerHead, skinMat);
      head.position.y = 43;
      head.castShadow = true;
      group.add(head);

      // Haare (Kappe auf dem Kopf)
      const hair = new T.Mesh(this.sharedGeometries.playerHair, hairMat);
      hair.position.y = 43.5;
      hair.rotation.x = -Math.PI / 16;
      hair.castShadow = true;
      group.add(hair);

      // Nase / Blickrichtungszeiger (zeigt genau nach vorne in Blickrichtung des Spielers: +Z)
      const nose = new T.Mesh(this.sharedGeometries.playerNose, skinMat);
      nose.position.set(0, 42.5, 7.5);
      nose.rotation.x = Math.PI / 2;
      group.add(nose);

      // Trikotnummer als 3D-Sprite Billboard über dem Kopf (nur falls explizit aktiviert)
      const sprite = this.createNumberSprite(el.number || "");
      sprite.position.y = 58;
      sprite.name = "numberSprite";
      sprite.visible = !!this.showNumbers;
      group.add(sprite);

      // Namens-Label (z.B. Spielername / Trainer) als 3D-Billboard über der Nummer
      if (el.name || el.label) {
        const nameSprite = this.createNameSprite(el.name || el.label);
        nameSprite.position.y = 58; // Direkt über Kopf wenn Nummern aus
        nameSprite.name = "nameSprite";
        nameSprite.visible = !!this.showNames;
        group.add(nameSprite);
      }

    } else if (el.type === "ball") {
      // Kontaktschatten unter dem Ball
      const ballShadow = new T.Mesh(this.sharedGeometries.contactShadow, this.sharedMaterials.contactShadow);
      ballShadow.rotation.x = -Math.PI / 2;
      ballShadow.position.y = 0.3;
      ballShadow.scale.set(0.65, 0.65, 0.65);
      group.add(ballShadow);
      group.userData.contactShadow = ballShadow;

      const ball = new T.Mesh(this.sharedGeometries.ball, this.sharedMaterials.ball);
      ball.position.y = 8.5;
      ball.castShadow = true;
      group.add(ball);
      group.userData.ballMesh = ball;

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
      const teamCol = el.team === "red" ? 0xef4444 : (el.team === "blue" ? 0x3b82f6 : (el.team === "yellow" ? 0xeab308 : (el.team === "orange" ? 0xf97316 : 0x10b981)));
      if (group.userData.torsoMesh) {
        group.userData.torsoMesh.material = this.getJerseyMaterial(teamCol, el.number);
      }

      const sprite = group.getObjectByName("numberSprite");
      if (sprite) {
        group.remove(sprite);
        const newSprite = this.createNumberSprite(el.number || "");
        newSprite.position.y = 58;
        newSprite.name = "numberSprite";
        newSprite.visible = !!this.showNumbers;
        group.add(newSprite);
      }

      const existingNameSprite = group.getObjectByName("nameSprite");
      if (existingNameSprite) {
        group.remove(existingNameSprite);
      }
      if (el.name || el.label) {
        const newNameSprite = this.createNameSprite(el.name || el.label);
        newNameSprite.position.y = 58;
        newNameSprite.name = "nameSprite";
        newNameSprite.visible = !!this.showNames;
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
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");

    // Pill-Hintergrund für optimale Lesbarkeit im 3D-Raum
    ctx.fillStyle = "rgba(15, 23, 42, 0.92)";
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 5;

    const r = 48;
    const x = 16, y = 14, w = 480, h = 100;
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

    // Großer, klar lesbarer Font
    ctx.font = "bold 64px Inter, sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(nameText, 256, 64);

    const texture = new window.THREE.CanvasTexture(canvas);
    const mat = new window.THREE.SpriteMaterial({ map: texture, depthTest: false });
    const sprite = new window.THREE.Sprite(mat);
    // Extragroß: 96 Einheiten breit, 24 hoch (doppelt so groß wie vorher)
    sprite.scale.set(96, 24, 1);
    return sprite;
  }

  toggleNamesVisibility(show = null) {
    if (show === null) {
      this.showNames = !this.showNames;
    } else {
      this.showNames = !!show;
    }

    this.elementMeshes.forEach(group => {
      const nameSprite = group.getObjectByName("nameSprite");
      if (nameSprite) {
        nameSprite.visible = this.showNames;
      }
    });

    return this.showNames;
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
    // Aktualisiere gecachte Linien und zeichne sie als flache, saubere 2D-Linien direkt auf die Spielfeld-Textur
    const arrowsChanged = JSON.stringify(this.currentArrows) !== JSON.stringify(arrows);
    this.currentArrows = arrows ? JSON.parse(JSON.stringify(arrows)) : [];
    if (arrowsChanged) {
      this.updatePitchTexture();
    }
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
