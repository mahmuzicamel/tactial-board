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

    // 3. Renderer mit sauberem Antialiasing und Shadow Map
    this.renderer = new window.THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = window.THREE.PCFSoftShadowMap;

    this.renderer.domElement.id = "tactic3dCanvas";
    this.renderer.domElement.className = "w-full h-full absolute inset-0 z-10 cursor-grab active:cursor-grabbing";
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

    // 6. Spielfeld & Stadion-Boden
    this.createPitch();

    // 7. Reusable Geometries & Materials
    this.initSharedResources();

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
    // 2D-Textur aus unserer vorhandenen pitch.js Zeichenlogik rendern!
    // Dadurch sieht das 3D-Feld zu 100% identisch zum 2D-Feld aus (Grasstreifen, Linien, Funino/Halbfeld)
    this.pitchTextureCanvas = document.createElement("canvas");
    this.pitchTextureCanvas.width = 1024;
    this.pitchTextureCanvas.height = 716;
    this.pitchTextureCtx = this.pitchTextureCanvas.getContext("2d");

    this.pitchTexture = new window.THREE.CanvasTexture(this.pitchTextureCanvas);
    this.pitchTexture.anisotropy = 8;

    this.updatePitchTexture();

    // Rasen-Plane: 1000 x 700 Welt-Einheiten (entspricht VIRTUAL_WIDTH / HEIGHT)
    const pitchGeo = new window.THREE.PlaneGeometry(VIRTUAL_WIDTH, VIRTUAL_HEIGHT);
    const pitchMat = new window.THREE.MeshStandardMaterial({
      map: this.pitchTexture,
      roughness: 0.85,
      metalness: 0.05
    });
    this.pitchMesh = new window.THREE.Mesh(pitchGeo, pitchMat);
    this.pitchMesh.rotation.x = -Math.PI / 2; // Liegend
    this.pitchMesh.receiveShadow = true;
    this.scene.add(this.pitchMesh);

    // Äußere Rasen-Auslauffläche (dunkler Rand)
    const outerGeo = new window.THREE.PlaneGeometry(VIRTUAL_WIDTH + 400, VIRTUAL_HEIGHT + 400);
    const outerMat = new window.THREE.MeshStandardMaterial({
      color: 0x1b4332,
      roughness: 0.95
    });
    const outerMesh = new window.THREE.Mesh(outerGeo, outerMat);
    outerMesh.rotation.x = -Math.PI / 2;
    outerMesh.position.y = -0.6;
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
    const pitchType = this.state.pitchType || "funino";
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
    if (this.renderer) this.renderer.domElement.style.display = "block";
    this.onResize();
    this.updatePitchTexture();
    this.syncScene();
    this.startLoop();
  }

  hide() {
    this.isActive = false;
    if (this.renderer) this.renderer.domElement.style.display = "none";
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
    if (!this.isActive || !this.scene) return;

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

      // Skalierung (aus Jump-Effekt & globalem Skalierungs-Slider)
      const scaleMult = (el.scaleMultiplier || 1.0) * (this.state.globalElementScale || 1.0);
      group.scale.set(scaleMult, scaleMult, scaleMult);
    });

    // Entferne gelöschte Meshes
    for (const [id, grp] of this.elementMeshes.entries()) {
      if (!activeIds.has(id)) {
        this.scene.remove(grp);
        this.elementMeshes.delete(id);
      }
    }
  }

  buildElementMesh(el) {
    const T = window.THREE;
    const group = new T.Group();

    if (el.type === "player") {
      const teamCol = el.team === "red" ? 0xef4444 : (el.team === "blue" ? 0x3b82f6 : (el.team === "yellow" ? 0xeab308 : 0x10b981));
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

    } else if (el.type === "ball") {
      const ball = new T.Mesh(this.sharedGeometries.ball, this.sharedMaterials.ball);
      ball.position.y = 8.5;
      ball.castShadow = true;
      group.add(ball);

    } else if (el.type === "cone") {
      const coneMat = this.getMaterialForColor(0xf97316); // Orange
      const cone = new T.Mesh(this.sharedGeometries.cone, coneMat);
      cone.position.y = 10;
      cone.castShadow = true;
      group.add(cone);

    } else if (el.type === "pole") {
      const poleMat = this.getMaterialForColor(0xfacc15); // Gelbe Stange
      const pole = new T.Mesh(this.sharedGeometries.pole, poleMat);
      pole.position.y = 30;
      pole.castShadow = true;
      group.add(pole);

    } else if (el.type === "hurdle") {
      const hMat = this.getMaterialForColor(0x38bdf8);
      const bar = new T.Mesh(this.sharedGeometries.hurdleBar, hMat);
      bar.rotation.z = Math.PI / 2;
      bar.position.y = 16;
      bar.castShadow = true;
      group.add(bar);

      const legL = new T.Mesh(this.sharedGeometries.hurdleLeg, hMat);
      legL.position.set(-15, 9, 0);
      legL.castShadow = true;
      group.add(legL);

      const legR = new T.Mesh(this.sharedGeometries.hurdleLeg, hMat);
      legR.position.set(15, 9, 0);
      legR.castShadow = true;
      group.add(legR);

    } else if (el.type === "goal_mini" || el.type === "goal_large") {
      const gMat = this.getMaterialForColor(0xffffff, 0.2);
      const postL = new T.Mesh(this.sharedGeometries.goalPost, gMat);
      postL.position.set(-45, 25, 0);
      postL.castShadow = true;
      group.add(postL);

      const postR = new T.Mesh(this.sharedGeometries.goalPost, gMat);
      postR.position.set(45, 25, 0);
      postR.castShadow = true;
      group.add(postR);

      const crossbar = new T.Mesh(this.sharedGeometries.goalBar, gMat);
      crossbar.rotation.z = Math.PI / 2;
      crossbar.position.set(0, 50, 0);
      crossbar.castShadow = true;
      group.add(crossbar);

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
