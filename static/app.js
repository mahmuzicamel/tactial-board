// Tactical Coach Frontend Logic

const DRAFT_STORAGE_KEY = "tactical_coach_active_draft_v1";

function isMobileScreen() {
  return window.innerWidth <= 768 || ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
}

function createEmptyExercise() {
  return {
    id: "ex_" + Math.random().toString(36).substr(2, 9),
    title: "",
    age_group: "F-Jugend (U9)",
    focus: "Passspiel",
    player_count: "6-8 Spieler",
    pitch_type: "half",
    dimensions: "20x15m",
    description: "",
    coaching_points: "",
    element_scale: 1.0,
    field_rotation: isMobileScreen() ? 270 : 0,
    playback_speed: 0.5,
    keyframes: [
      {
        title: "Schritt 1: Startaufstellung",
        elements: [],
        arrows: []
      }
    ]
  };
}

// Initialise state: start with empty exercise; active draft or URL link will override on load
let currentExercise = createEmptyExercise();

function saveLocalDraft() {
  try {
    if (currentExercise && currentExercise.keyframes) {
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({
        exercise: currentExercise,
        keyframeIndex: currentKeyframeIndex,
        savedAt: Date.now()
      }));
    }
  } catch (e) {
    console.warn("Could not save local draft to localStorage:", e);
  }
}

function loadLocalDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.exercise && Array.isArray(parsed.exercise.keyframes) && parsed.exercise.keyframes.length > 0) {
      return parsed;
    }
  } catch (e) {
    console.warn("Could not read local draft:", e);
  }
  return null;
}


let currentKeyframeIndex = 0;
let globalElementScale = 1.0;
let activeTool = "select"; // 'select', 'pass', 'run', 'guide'
let idlePulseReqId = null; // Animation frame loop for pulsing guide lines when editor is idle
const EQUIPMENT_TYPES = ["cone", "pole", "ladder", "minigoal", "goal_5m", "dummy", "ring", "hurdle"];
function isEquipment(type) {
  return window.TacticalCoach?.constants?.isEquipment ? window.TacticalCoach.constants.isEquipment(type) : EQUIPMENT_TYPES.includes(type);
}
let selectedElementId = null;
let selectedElementIds = []; // Multi-selection for grouped elements
let isLassoSelecting = false;
let lassoPoints = []; // Array of {x, y} points drawn by the user on the field
let selectedArrowIndex = null;
let selectedArrowPart = null; // 'start', 'end', or 'body'
// Curve Dragging State for Ghost Motion Trails:
let activeCurveDrag = null; // { toKfIndex, elementId, handle: 'start' | 'mid' | 'end' }
let isDragging = false;
let isDraggingArrow = false;
let isMovingElement = false; // true while mouse/touch is actively held down and moving an element/arrow
let dragStartX = 0;
let dragStartY = 0;
let groupDragOffsets = {}; // Map of { elId: { dx, dy } } for group dragging
let arrowDragOffsetX = 0;
let arrowDragOffsetY = 0;

// Arrow drawing state
let isDrawingArrow = false;
let arrowStartX = 0;
let arrowStartY = 0;
let arrowCurrentX = 0;
let arrowCurrentY = 0;
let arrowDrawStrokePoints = [];
let lineDrawMode = "freehand"; // 'raw_freehand' (1:1 freehand), 'freehand' (auto-fit Bezier), 'bezier' (draw straight + show handles), 'straight' (never curve)

// Undo / Redo History State
const MAX_HISTORY = 40;
let undoStack = [];
let redoStack = [];
let isUndoRedoAction = false;
let dragInitialSnapshot = null; // Snapshot saved at pointerdown before a potential move

function getExerciseSnapshot() {
  return {
    exercise: JSON.parse(JSON.stringify(currentExercise)),
    keyframeIndex: currentKeyframeIndex
  };
}

function recordHistory() {
  if (isUndoRedoAction) return;
  const snap = getExerciseSnapshot();
  // Don't duplicate top of stack
  if (undoStack.length > 0) {
    const last = undoStack[undoStack.length - 1];
    if (JSON.stringify(last.exercise) === JSON.stringify(snap.exercise) && last.keyframeIndex === snap.keyframeIndex) {
      return;
    }
  }
  undoStack.push(snap);
  if (undoStack.length > MAX_HISTORY) undoStack.shift();
  redoStack = []; // clear redo on new action
  updateUndoRedoUI();
  saveLocalDraft();
}

function updateUndoRedoUI() {
  const uBtn = document.getElementById("undoBtn");
  const rBtn = document.getElementById("redoBtn");
  if (uBtn) uBtn.disabled = (undoStack.length <= 1);
  if (rBtn) rBtn.disabled = (redoStack.length === 0);
}

function undo() {
  if (undoStack.length <= 1) return;
  if (isPlaying) stopAnimation();

  isUndoRedoAction = true;
  const currentSnap = undoStack.pop();
  redoStack.push(currentSnap);

  const prevSnap = undoStack[undoStack.length - 1];
  currentExercise = JSON.parse(JSON.stringify(prevSnap.exercise));
  currentKeyframeIndex = Math.min(prevSnap.keyframeIndex, (currentExercise.keyframes.length - 1) || 0);

  selectedElementId = null;
  selectedElementIds = [];
  selectedArrowIndex = null;
  hideInspector();
  updateActionPopupPosition();
  renderKeyframeTabs();
  drawScene();
  updateFormFields();

  isUndoRedoAction = false;
  updateUndoRedoUI();
  saveLocalDraft();
}

function redo() {
  if (redoStack.length === 0) return;
  if (isPlaying) stopAnimation();

  isUndoRedoAction = true;
  const nextSnap = redoStack.pop();
  undoStack.push(nextSnap);

  currentExercise = JSON.parse(JSON.stringify(nextSnap.exercise));
  currentKeyframeIndex = Math.min(nextSnap.keyframeIndex, (currentExercise.keyframes.length - 1) || 0);

  selectedElementId = null;
  selectedElementIds = [];
  selectedArrowIndex = null;
  hideInspector();
  updateActionPopupPosition();
  renderKeyframeTabs();
  drawScene();
  updateFormFields();

  isUndoRedoAction = false;
  updateUndoRedoUI();
  saveLocalDraft();
}

function resetUndoRedo() {
  undoStack = [getExerciseSnapshot()];
  redoStack = [];
  updateUndoRedoUI();
}

// Toast helper
function showToast(message, isError = false) {
  const toast = document.getElementById("toastNotification");
  const msgEl = document.getElementById("toastMsg");
  const iconEl = document.getElementById("toastIcon");
  if (!toast || !msgEl) {
    if (isError) alert(message);
    return;
  }

  msgEl.textContent = message;
  if (isError) {
    toast.className = "fixed top-16 left-1/2 -translate-x-1/2 z-[100] px-4 py-2.5 bg-slate-900/95 border border-rose-500/60 text-rose-200 rounded-xl shadow-2xl backdrop-blur-md flex items-center gap-2.5 text-xs font-medium transition-all duration-300";
    if (iconEl) iconEl.className = "fa-solid fa-triangle-exclamation text-rose-400 text-sm";
  } else {
    toast.className = "fixed top-16 left-1/2 -translate-x-1/2 z-[100] px-4 py-2.5 bg-slate-900/95 border border-emerald-500/60 text-white rounded-xl shadow-2xl backdrop-blur-md flex items-center gap-2.5 text-xs font-medium transition-all duration-300";
    if (iconEl) iconEl.className = "fa-solid fa-circle-check text-emerald-400 text-sm";
  }

  toast.classList.remove("hidden");
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.classList.add("hidden");
  }, 2800);
}

// URL routing & deep linking
function getExerciseIdFromUrl() {
  const path = window.location.pathname;
  const match = path.match(/^\/(?:exercise|e)\/([a-zA-Z0-9_\-]+)/);
  if (match) return match[1];

  const params = new URLSearchParams(window.location.search);
  return params.get("id") || params.get("exercise");
}

function updateUrlForExercise(id, replace = false) {
  if (!id) return;
  const targetPath = `/exercise/${encodeURIComponent(id)}`;
  if (window.location.pathname !== targetPath) {
    if (replace) {
      window.history.replaceState({ exerciseId: id }, "", targetPath);
    } else {
      window.history.pushState({ exerciseId: id }, "", targetPath);
    }
  }
}

async function copyExerciseShareLink() {
  syncFormToState();
  const id = currentExercise.id;
  const directUrl = `${window.location.origin}/exercise/${encodeURIComponent(id)}`;

  let copied = false;
  // Modern async clipboard API (requires secure context / https or localhost)
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(directUrl);
      copied = true;
    } catch (e) {
      copied = false;
    }
  }

  // Fallback for non-https / plain IP environments (like 100.81.194.35)
  if (!copied) {
    try {
      const textArea = document.createElement("textarea");
      textArea.value = directUrl;
      textArea.style.position = "fixed";
      textArea.style.left = "-9999px";
      textArea.style.top = "0";
      textArea.setAttribute("readonly", "");
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      copied = document.execCommand("copy");
      document.body.removeChild(textArea);
    } catch (err) {
      copied = false;
    }
  }

  if (copied) {
    showToast("🔗 Link kopiert: " + directUrl);
  } else {
    prompt("Link kopieren:", directUrl);
  }
}

// Animation playback state
let isPlaying = false;
let isLoopMode = true; // true = Endless loop, false = Play 1x and stop at end
let isGhostMode = "off"; // "off" = Aus, "prev" = Nur vorheriger Schritt (1x), "all" = Alle vorherigen Schritte (Gesamtweg)
let animReqId = null;
let animStartTime = null;
let currentSpeed = 0.5;
const SPEED_STEPS = [0.5, 1.0, 1.5, 2.0];

function cyclePlaybackSpeed() {
  const currentIdx = SPEED_STEPS.indexOf(currentSpeed);
  const nextIdx = (currentIdx + 1) % SPEED_STEPS.length;
  currentSpeed = SPEED_STEPS[nextIdx];
  const label = document.getElementById("speedToggleLabel");
  if (label) {
    label.innerText = `${currentSpeed.toFixed(1)}x`;
  }
}

// Zoom & Pan state
let viewScale = 1.0;
let viewPanX = 0;
let viewPanY = 0;
const MIN_SCALE = 0.5;
const MAX_SCALE = 3.0;

// Field rotation state (0, 90, 180, 270 degrees)
let fieldRotation = 270;

function rotatePitch() {
  const oldRotation = fieldRotation;
  fieldRotation = (fieldRotation + 90) % 360;
  const rotBadge = document.getElementById("rotationLevelText");
  if (rotBadge) rotBadge.textContent = `${fieldRotation}°`;

  // Wenn das Feld rotiert wird, passen wir die lokale Rotation jedes Elements
  // um -90° an, damit es seine optische Ausrichtung im Sichtfeld des Benutzers beibehält!
  // (Beispiel: Eine horizontale Hürde bei 270° wird bei Felddrehung auf 0° um +90° zur Feldachse gedreht,
  // bleibt also für den Betrachter weiterhin exakt waagerecht!)
  if (currentExercise && Array.isArray(currentExercise.keyframes)) {
    currentExercise.keyframes.forEach(kf => {
      (kf.elements || []).forEach(el => {
        el.rotation = ((el.rotation || 0) - 90) % 360;
        if (el.rotation < 0) el.rotation += 360;
      });
    });
  }

  currentExercise.field_rotation = fieldRotation;
  saveLocalDraft();
  drawScene();
  updateActionPopupPosition();
}

// Fallback functions in case module is not loaded yet
function drawPitchBackgroundFallback(c, pitchType) {
  const w = VIRTUAL_WIDTH;
  const h = VIRTUAL_HEIGHT;
  const stripes = 12;
  const sw = (w + 400) / stripes;
  for (let i = 0; i < stripes; i++) {
    c.fillStyle = (i % 2 === 0) ? "#2d6a4f" : "#285d45";
    c.fillRect(-200 + i * sw, -200, sw, h + 400);
  }
  if (pitchType === "plain") return;
  const mx = 30;
  const my = 25;
  const pw = w - 2 * mx;
  const ph = h - 2 * my;
  c.strokeStyle = "#ffffff";
  c.lineWidth = 4;
  c.strokeRect(mx, my, pw, ph);
  if (pitchType === "full") {
    const midX = mx + pw / 2;
    c.beginPath();
    c.moveTo(midX, my);
    c.lineTo(midX, my + ph);
    c.stroke();
    c.beginPath();
    c.arc(midX, my + ph / 2, 75, 0, Math.PI * 2);
    c.stroke();
    c.strokeRect(mx, my + (ph - 280) / 2, 140, 280);
    c.strokeRect(mx + pw - 140, my + (ph - 280) / 2, 140, 280);
  } else if (pitchType === "half") {
    c.strokeRect(mx, my + (ph - 360) / 2, 220, 360);
    c.strokeRect(mx, my + (ph - 180) / 2, 80, 180);
    c.beginPath();
    c.arc(mx + pw, my + ph / 2, 120, Math.PI * 0.5, Math.PI * 1.5);
    c.stroke();
  }
}

// -------------------------------------------------------------
// Fallback implementations in case ESM modules load deferred
// -------------------------------------------------------------
function drawElementOnCanvasFallback(c, el, isSelected = false, fRot = 0, gScale = 1.0) {
  const x = el.x;
  const y = el.y;
  c.save();
  c.translate(x, y);

  if (fRot !== 0) c.rotate((-fRot * Math.PI) / 180);
  if (el.rotation) c.rotate((el.rotation * Math.PI) / 180);

  const jumpScale = (el.scaleMultiplier !== undefined) ? el.scaleMultiplier : 1.0;
  const elScale = (gScale || 1.0) * jumpScale;
  c.scale(elScale, elScale);

  if (isSelected) {
    c.strokeStyle = "#38bdf8";
    c.lineWidth = 3;
    c.beginPath();
    c.arc(0, 0, 26, 0, Math.PI * 2);
    c.stroke();
  }

  if (el.type === "player") {
    const radius = 18;
    let fill = el.team === "red" ? "#ef4444" : (el.team === "yellow" ? "#eab308" : "#2563eb");
    let textCol = el.team === "yellow" ? "#000000" : "#ffffff";
    c.fillStyle = fill;
    c.beginPath();
    c.arc(0, 0, radius, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = "#ffffff";
    c.lineWidth = 2.5;
    c.stroke();

    if (el.number) {
      c.fillStyle = textCol;
      c.font = "bold 13px sans-serif";
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText(el.number, 0, 1);
    }

    if (el.name) {
      c.fillStyle = "rgba(0,0,0,0.75)";
      const nw = c.measureText(el.name).width + 8;
      c.fillRect(-nw / 2, radius + 3, nw, 14);
      c.fillStyle = "#ffffff";
      c.font = "10px sans-serif";
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText(el.name, 0, radius + 10);
    }
  } else if (el.type === "ball") {
    const radius = 10;
    c.fillStyle = "#ffffff";
    c.beginPath();
    c.arc(0, 0, radius, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = "#111827";
    c.lineWidth = 2;
    c.stroke();

    c.fillStyle = "#111827";
    c.beginPath();
    c.arc(0, 0, 4, 0, Math.PI * 2);
    c.fill();
  } else if (el.type === "cone") {
    c.fillStyle = "#f97316";
    c.beginPath();
    c.moveTo(0, -14);
    c.lineTo(14, 14);
    c.lineTo(-14, 14);
    c.closePath();
    c.fill();
    c.strokeStyle = "#ffffff";
    c.lineWidth = 2;
    c.stroke();
  } else if (el.type === "minigoal") {
    c.fillStyle = "#ffffff";
    c.fillRect(-20, -10, 40, 20);
    c.strokeStyle = "#334155";
    c.lineWidth = 2;
    c.strokeRect(-20, -10, 40, 20);
  } else if (el.type === "goal_5m") {
    const gw = 70;
    const gh = 30;
    c.fillStyle = "rgba(255, 255, 255, 0.15)";
    c.fillRect(-gw / 2, -gh / 2, gw, gh);
    c.strokeStyle = "rgba(255, 255, 255, 0.35)";
    c.lineWidth = 1;
    for (let gx = -gw / 2 + 10; gx < gw / 2; gx += 10) {
      c.beginPath();
      c.moveTo(gx, -gh / 2);
      c.lineTo(gx, gh / 2);
      c.stroke();
    }
    for (let gy = -gh / 2 + 10; gy < gh / 2; gy += 10) {
      c.beginPath();
      c.moveTo(-gw / 2, gy);
      c.lineTo(gw / 2, gy);
      c.stroke();
    }
    c.strokeStyle = "#ffffff";
    c.lineWidth = 4;
    c.strokeRect(-gw / 2, -gh / 2, gw, gh);
    c.save();
    if (el.rotation) c.rotate((-el.rotation * Math.PI) / 180);
    c.fillStyle = "rgba(255, 255, 255, 0.85)";
    c.font = "bold 10px sans-serif";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText("5m Tor", 0, 0);
    c.restore();
  } else if (el.type === "pole") {
    c.fillStyle = "#eab308";
    c.fillRect(-3, -24, 6, 32);
    c.fillStyle = "#000000";
    c.beginPath();
    c.arc(0, 8, 6, 0, Math.PI * 2);
    c.fill();
  } else if (el.type === "ladder") {
    c.strokeStyle = "#facc15";
    c.lineWidth = 2;
    c.strokeRect(-40, -10, 80, 20);
    for (let i = 1; i < 5; i++) {
      c.beginPath();
      c.moveTo(-40 + i * 16, -10);
      c.lineTo(-40 + i * 16, 10);
      c.stroke();
    }
  } else if (el.type === "dummy") {
    c.fillStyle = "rgba(0,0,0,0.45)";
    c.beginPath();
    c.ellipse(0, 16, 14, 5, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#eab308";
    c.strokeStyle = "#000000";
    c.lineWidth = 2;
    c.beginPath();
    c.roundRect(-12, -10, 24, 24, [4, 4, 8, 8]);
    c.fill();
    c.stroke();
    c.beginPath();
    c.arc(0, -16, 7, 0, Math.PI * 2);
    c.fill();
    c.stroke();
  } else if (el.type === "ring") {
    c.strokeStyle = "#06b6d4";
    c.lineWidth = 4;
    c.beginPath();
    c.arc(0, 0, 16, 0, Math.PI * 2);
    c.stroke();
    c.fillStyle = "rgba(6, 182, 212, 0.15)";
    c.fill();
  } else if (el.type === "hurdle") {
    c.fillStyle = "rgba(0,0,0,0.3)";
    c.fillRect(-22, 1, 44, 4);
    c.fillStyle = "#1e293b";
    c.fillRect(-22, -6, 5, 12);
    c.fillRect(17, -6, 5, 12);
    c.fillStyle = "#f97316";
    c.strokeStyle = "#ffffff";
    c.lineWidth = 1;
    c.fillRect(-20, -3, 40, 6);
    c.strokeRect(-20, -3, 40, 6);
    c.fillStyle = "#ffffff";
    c.fillRect(-8, -3, 4, 6);
    c.fillRect(4, -3, 4, 6);
  } else {
    c.fillStyle = "#94a3b8";
    c.beginPath();
    c.arc(0, 0, 14, 0, Math.PI * 2);
    c.fill();
  }
  c.restore();
}

function drawArrowFallback(c, x1, y1, x2, y2, type = "pass", color = "#facc15", isSelected = false, animTime = null, cp1 = null, cp2 = null, rawPoints = null) {
  c.save();
  c.strokeStyle = color;
  c.lineWidth = 3;
  if (type === "pass") c.setLineDash([6, 6]);
  c.beginPath();
  c.moveTo(x1, y1);
  if (cp1 && cp2) {
    c.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, x2, y2);
  } else {
    c.lineTo(x2, y2);
  }
  c.stroke();
  c.restore();
}

// Fallback Geometry functions in case module is not loaded yet
function pointInPolygonFallback(point, vs) {
  const x = point.x, y = point.y;
  let inside = false;
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    const xi = vs[i].x, yi = vs[i].y;
    const xj = vs[j].x, yj = vs[j].y;
    const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function distToSegmentFallback(px, py, x1, y1, x2, y2) {
  const l2 = (x2 - x1) ** 2 + (y2 - y1) ** 2;
  if (l2 === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)));
}

function distToPolylineFallback(px, py, points) {
  if (!points || points.length < 2) return Infinity;
  let minDist = Infinity;
  for (let i = 1; i < points.length; i++) {
    const d = distToSegmentFallback(px, py, points[i - 1].x, points[i - 1].y, points[i].x, points[i].y);
    if (d < minDist) minDist = d;
  }
  return minDist;
}

function getCubicBezierPointFallback(t, p0, p1, p2, p3) {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const mt3 = mt2 * mt;
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x: mt3 * p0.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t3 * p3.x,
    y: mt3 * p0.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t3 * p3.y
  };
}

function distToCubicBezierFallback(px, py, p0, p1, p2, p3, samples = 20) {
  let minDist = Infinity;
  let prevPt = p0;
  for (let i = 1; i <= samples; i++) {
    const t = i / samples;
    const currPt = getCubicBezierPointFallback(t, p0, p1, p2, p3);
    const d = distToSegmentFallback(px, py, prevPt.x, prevPt.y, currPt.x, currPt.y);
    if (d < minDist) minDist = d;
    prevPt = currPt;
  }
  return minDist;
}

function getEffectiveCurveControlPointsFallback(fromEl, toEl) {
  const dx = toEl.x - fromEl.x;
  const dy = toEl.y - fromEl.y;
  const baseP1 = { x: fromEl.x + dx * (1 / 3), y: fromEl.y + dy * (1 / 3) };
  const baseP2 = { x: fromEl.x + dx * (2 / 3), y: fromEl.y + dy * (2 / 3) };
  return {
    p1: { x: baseP1.x + (toEl.cp1_dx || 0), y: baseP1.y + (toEl.cp1_dy || 0) },
    p2: { x: baseP2.x + (toEl.cp2_dx || 0), y: baseP2.y + (toEl.cp2_dy || 0) }
  };
}

function getArrowCurveControlPointsFallback(arr) {
  const dx = arr.x2 - arr.x1;
  const dy = arr.y2 - arr.y1;
  const baseP1 = { x: arr.x1 + dx * (1 / 3), y: arr.y1 + dy * (1 / 3) };
  const baseP2 = { x: arr.x1 + dx * (2 / 3), y: arr.y1 + dy * (2 / 3) };
  return {
    p1: { x: baseP1.x + (arr.cp1_dx || 0), y: baseP1.y + (arr.cp1_dy || 0) },
    p2: { x: baseP2.x + (arr.cp2_dx || 0), y: baseP2.y + (arr.cp2_dy || 0) }
  };
}

function fitCubicBezierToStrokeFallback(points) {
  if (!points || points.length < 2) return null;
  const p0 = points[0];
  const p3 = points[points.length - 1];
  const chordLen = Math.hypot(p3.x - p0.x, p3.y - p0.y);
  if (chordLen < 15) return null;
  const idx1 = Math.floor(points.length / 3);
  const idx2 = Math.floor((points.length * 2) / 3);
  const sample1 = points[idx1];
  const sample2 = points[idx2];
  const baseP1 = { x: p0.x + (p3.x - p0.x) * (1 / 3), y: p0.y + (p3.y - p0.y) * (1 / 3) };
  const baseP2 = { x: p0.x + (p3.x - p0.x) * (2 / 3), y: p0.y + (p3.y - p0.y) * (2 / 3) };
  return {
    cp1_dx: Math.round(sample1.x - baseP1.x),
    cp1_dy: Math.round(sample1.y - baseP1.y),
    cp2_dx: Math.round(sample2.x - baseP2.x),
    cp2_dy: Math.round(sample2.y - baseP2.y)
  };
}

// Aliases for modules from window.TacticalCoach
const pitch = {
  drawPitchBackground: (c, type) => (window.TacticalCoach?.pitch?.drawPitchBackground || drawPitchBackgroundFallback)(c, type)
};
const elemModule = {
  drawElementOnCanvas: (c, el, sel, rot, sc) => (window.TacticalCoach?.elements?.drawElementOnCanvas || drawElementOnCanvasFallback)(c, el, sel, rot, sc)
};
const arrowModule = {
  drawArrow: (...args) => (window.TacticalCoach?.arrows?.drawArrow || drawArrowFallback)(...args)
};
const geomModule = {
  distToSegment: (...args) => (window.TacticalCoach?.geometry?.distToSegment || distToSegmentFallback)(...args),
  distToPolyline: (...args) => (window.TacticalCoach?.geometry?.distToPolyline || distToPolylineFallback)(...args),
  pointInPolygon: (...args) => (window.TacticalCoach?.geometry?.pointInPolygon || pointInPolygonFallback)(...args),
  getCubicBezierPoint: (...args) => (window.TacticalCoach?.geometry?.getCubicBezierPoint || getCubicBezierPointFallback)(...args),
  distToCubicBezier: (...args) => (window.TacticalCoach?.geometry?.distToCubicBezier || distToCubicBezierFallback)(...args),
  getEffectiveCurveControlPoints: (...args) => (window.TacticalCoach?.geometry?.getEffectiveCurveControlPoints || getEffectiveCurveControlPointsFallback)(...args),
  getArrowCurveControlPoints: (...args) => (window.TacticalCoach?.geometry?.getArrowCurveControlPoints || getArrowCurveControlPointsFallback)(...args),
  fitCubicBezierToStroke: (...args) => (window.TacticalCoach?.geometry?.fitCubicBezierToStroke || fitCubicBezierToStrokeFallback)(...args)
};
const vpModule = {
  getDisplayDimensions: (c) => (window.TacticalCoach?.viewport?.getDisplayDimensions || getDisplayDimensions)(c),
  getScreenCoords: (c, vx, vy) => (window.TacticalCoach?.viewport?.getScreenCoords || getScreenCoords)(c, vx, vy),
  getCanvasCoords: (c, evt) => (window.TacticalCoach?.viewport?.getCanvasCoords || getCanvasCoords)(c, evt),
  zoomAt: (...args) => (window.TacticalCoach?.viewport?.zoomAt || zoomAt)(...args),
  updateZoomUI: () => (window.TacticalCoach?.viewport?.updateZoomUI || updateZoomUI)()
};

function toggleTopMenu() {
  if (window.TacticalCoach?.popovers?.toggleTopMenu) {
    window.TacticalCoach.popovers.toggleTopMenu();
    refreshExerciseBadge();
    loadCatalogExercises();
    return;
  }
  const drawer = document.getElementById("topDrawerMenu");
  const overlay = document.getElementById("sidebarOverlay");
  if (!drawer) return;
  const isCollapsed = drawer.classList.contains("collapsed");
  if (isCollapsed) {
    drawer.classList.remove("collapsed");
    if (overlay) overlay.classList.remove("collapsed");
    refreshExerciseBadge();
    loadCatalogExercises();
  } else {
    closeSidebarMenu();
  }
}

function closeSidebarMenu() {
  if (window.TacticalCoach?.popovers?.closeSidebarMenu) {
    window.TacticalCoach.popovers.closeSidebarMenu();
    return;
  }
  const drawer = document.getElementById("topDrawerMenu");
  const overlay = document.getElementById("sidebarOverlay");
  if (drawer) drawer.classList.add("collapsed");
  if (overlay) overlay.classList.add("collapsed");
}

function switchSidebarTab(tab) {
  const tabExBtn = document.getElementById("sidebarTabExercises");
  const tabDetBtn = document.getElementById("sidebarTabDetails");
  const viewEx = document.getElementById("sidebarViewExercises");
  const viewDet = document.getElementById("sidebarViewDetails");

  if (tab === "exercises") {
    if (tabExBtn) {
      tabExBtn.className = "flex-1 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition bg-slate-800 text-emerald-400 shadow";
    }
    if (tabDetBtn) {
      tabDetBtn.className = "flex-1 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition text-slate-400 hover:text-white";
    }
    if (viewEx) viewEx.classList.remove("hidden");
    if (viewDet) viewDet.classList.add("hidden");
    loadCatalogExercises();
  } else {
    if (tabDetBtn) {
      tabDetBtn.className = "flex-1 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition bg-slate-800 text-emerald-400 shadow";
    }
    if (tabExBtn) {
      tabExBtn.className = "flex-1 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition text-slate-400 hover:text-white";
    }
    if (viewDet) viewDet.classList.remove("hidden");
    if (viewEx) viewEx.classList.add("hidden");
    updateFormFields();
  }
}

// Multi-touch pinch state
let initialPinchDistance = null;
let initialPinchScale = 1.0;
let isPanning = false;
let panStartX = 0;
let panStartY = 0;

const canvas = document.getElementById("tacticCanvas");
const ctx = canvas.getContext("2d");

// Service Worker Registration for PWA Standalone Mode
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(err => {
      console.log("ServiceWorker registration skipped or offline:", err);
    });
  });
}

// Initialize
window.addEventListener("DOMContentLoaded", async () => {
  // Check URL route first for deep-linked exercise ID (e.g. /exercise/<guid> or ?id=<guid>)
  const routeExerciseId = getExerciseIdFromUrl();
  let loadedFromUrl = false;

  if (routeExerciseId) {
    await loadExerciseFromCatalog(routeExerciseId, false);
    loadedFromUrl = true;
  } else {
    // No specific URL parameter: restore user's last working state from localStorage
    const savedDraft = loadLocalDraft();
    if (savedDraft && savedDraft.exercise) {
      currentExercise = savedDraft.exercise;
      currentKeyframeIndex = Math.min(savedDraft.keyframeIndex || 0, (currentExercise.keyframes.length - 1) || 0);
      if (currentExercise.id && currentExercise.id !== "ex_initial") {
        updateUrlForExercise(currentExercise.id, true);
      }
    } else {
      // First time ever: completely empty field, ready to build new exercise!
      currentExercise = createEmptyExercise();
      currentKeyframeIndex = 0;
    }
  }

  resetUndoRedo();
  resizeCanvasToContainer();
  setupCanvasEvents();
  renderKeyframeTabs();
  drawScene();
  updateFormFields();
  refreshExerciseBadge();

  // Setup bottom dock scroll indicator listener
  const bottomDock = document.getElementById("bottomDockScrollContainer");
  if (bottomDock) {
    bottomDock.addEventListener("scroll", updateBottomDockScrollHints, { passive: true });
    window.addEventListener("resize", updateBottomDockScrollHints, { passive: true });
  }

  // Multi-pass resize after layout & safe-areas settle
  setTimeout(() => {
    resizeCanvasToContainer();
    drawScene();
    updateActionPopupPosition();
    updateBottomDockScrollHints();
  }, 100);
  setTimeout(() => {
    resizeCanvasToContainer();
    drawScene();
    updateActionPopupPosition();
    updateBottomDockScrollHints();
  }, 350);

  setupMobileTooltips();
});

// Support browser back/forward buttons
window.addEventListener("popstate", async (e) => {
  const routeExerciseId = getExerciseIdFromUrl();
  if (routeExerciseId) {
    await loadExerciseFromCatalog(routeExerciseId, false);
  }
});

if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", () => {
    resizeCanvasToContainer();
    drawScene();
    updateActionPopupPosition();
  });
}

window.addEventListener("resize", () => {
  resizeCanvasToContainer();
  drawScene();
  updateActionPopupPosition();
});

function resizeCanvasToContainer() {
  const wrapper = document.getElementById("canvasWrapper");
  if (!wrapper) return;
  const rect = wrapper.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const w = Math.round(rect.width);
  const h = Math.round(rect.height);

  if (w > 0 && h > 0) {
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
}

function updateFormFields() {
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val;
  };

  setVal("exTitle", currentExercise.title || "");
  setVal("modalExTitle", currentExercise.title || "");

  setVal("exAgeGroup", currentExercise.age_group || "F-Jugend (U9)");
  setVal("modalExAgeGroup", currentExercise.age_group || "F-Jugend (U9)");

  setVal("exFocus", currentExercise.focus || "Passspiel");
  setVal("modalExFocus", currentExercise.focus || "Passspiel");

  setVal("exPlayers", currentExercise.player_count || "6-8 Spieler");
  setVal("modalExPlayers", currentExercise.player_count || "6-8 Spieler");

  setVal("exDimensions", currentExercise.dimensions || "20x15m");
  setVal("modalExDimensions", currentExercise.dimensions || "20x15m");

  setVal("exDescription", currentExercise.description || "");
  setVal("modalExDescription", currentExercise.description || "");

  setVal("exCoaching", currentExercise.coaching_points || "");
  setVal("modalExCoaching", currentExercise.coaching_points || "");

  setVal("pitchSelect", currentExercise.pitch_type || "half");

  if (currentExercise.element_scale !== undefined) {
    globalElementScale = parseFloat(currentExercise.element_scale) || 1.0;
  }
  if (currentExercise.field_rotation !== undefined) {
    // If mobile and field_rotation is 0 in draft or new exercise, ensure 270 on mobile
    if (isMobileScreen() && (!currentExercise.field_rotation || currentExercise.field_rotation === 0)) {
      fieldRotation = 270;
      currentExercise.field_rotation = 270;
    } else {
      fieldRotation = parseInt(currentExercise.field_rotation) || 0;
    }
    const rotBadge = document.getElementById("rotationLevelText");
    if (rotBadge) rotBadge.textContent = `${fieldRotation}°`;
  } else if (isMobileScreen()) {
    fieldRotation = 270;
    currentExercise.field_rotation = 270;
    const rotBadge = document.getElementById("rotationLevelText");
    if (rotBadge) rotBadge.textContent = "270°";
  }
  if (currentExercise.playback_speed !== undefined) {
    currentSpeed = parseFloat(currentExercise.playback_speed) || 0.5;
    const spdBadge = document.getElementById("speedToggleLabel");
    if (spdBadge) spdBadge.textContent = `${currentSpeed.toFixed(1)}x`;
  }
  updateElementScaleUI();
}

function syncFormToState() {
  currentExercise.title = document.getElementById("exTitle").value;
  currentExercise.age_group = document.getElementById("exAgeGroup").value;
  currentExercise.focus = document.getElementById("exFocus").value;
  currentExercise.player_count = document.getElementById("exPlayers").value;
  currentExercise.dimensions = document.getElementById("exDimensions").value;
  currentExercise.description = document.getElementById("exDescription").value;
  currentExercise.coaching_points = document.getElementById("exCoaching").value;
  currentExercise.pitch_type = document.getElementById("pitchSelect").value;
  currentExercise.element_scale = globalElementScale;
  currentExercise.field_rotation = fieldRotation;
  currentExercise.playback_speed = currentSpeed;
  saveLocalDraft();
}

function updateElementScaleUI() {
  const percentStr = `${Math.round(globalElementScale * 100)}%`;
  const sSlider = document.getElementById("elementScaleSlider");
  const sLabel = document.getElementById("elementScaleLabel");
  const sbSlider = document.getElementById("sidebarElementScaleSlider");
  const sbLabel = document.getElementById("sidebarElementScaleLabel");

  if (sSlider) sSlider.value = globalElementScale;
  if (sLabel) sLabel.textContent = percentStr;
  if (sbSlider) sbSlider.value = globalElementScale;
  if (sbLabel) sbLabel.textContent = percentStr;
}

function onElementScaleChange(val) {
  globalElementScale = parseFloat(val) || 1.0;
  currentExercise.element_scale = globalElementScale;
  updateElementScaleUI();
  drawScene();
  updateActionPopupPosition();
}

// Canvas Virtual Coordinates: Always 1000 x 700 virtual coordinate space!
const VIRTUAL_WIDTH = 1000;
const VIRTUAL_HEIGHT = 700;

function getDisplayDimensions() {
  const rect = canvas.getBoundingClientRect();
  return {
    w: rect.width || canvas.parentElement.clientWidth || VIRTUAL_WIDTH,
    h: rect.height || canvas.parentElement.clientHeight || VIRTUAL_HEIGHT
  };
}

// Canvas Rendering
function drawScene(customElements = null, customArrows = null, customTitle = null) {
  const kf = currentExercise.keyframes[currentKeyframeIndex] || { elements: [], arrows: [] };
  const elements = customElements || kf.elements;
  const arrows = customArrows || kf.arrows || [];
  const pitchType = currentExercise.pitch_type || "half";

  const { w: dispW, h: dispH } = getDisplayDimensions();
  const dpr = window.devicePixelRatio || 1;

  // Clear entire physical canvas buffer completely to avoid zoom ghosting/overlapping fields
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.restore();

  ctx.save();
  // Fit virtual field into dispW x dispH considering rotation
  const isRotated90 = (fieldRotation === 90 || fieldRotation === 270);
  const effectiveVW = isRotated90 ? VIRTUAL_HEIGHT : VIRTUAL_WIDTH;
  const effectiveVH = isRotated90 ? VIRTUAL_WIDTH : VIRTUAL_HEIGHT;

  // On mobile portrait (where dispH > dispW and field is 270°), fit to width and height comfortably
  const baseScale = Math.min(dispW / effectiveVW, dispH / effectiveVH);

  // Center of the canvas for Zoom & Pan
  ctx.translate(dispW / 2 + viewPanX, dispH / 2 + viewPanY);
  ctx.scale(viewScale, viewScale);

  // Rotation around center of view
  if (fieldRotation !== 0) {
    ctx.rotate((fieldRotation * Math.PI) / 180);
  }

  // Scale virtual field around center (1000x700 center is 500, 350)
  ctx.scale(baseScale, baseScale);
  ctx.translate(-VIRTUAL_WIDTH / 2, -VIRTUAL_HEIGHT / 2);

  // 1. Draw Pitch (always on 1000x700 coordinate system)
  pitch.drawPitchBackground(ctx, pitchType);

  // 1.5. Draw Ghost / Onion Skinning Layer (previous keyframes) when editing and ghost mode is enabled
  if (isGhostMode !== "off" && !isPlaying && currentKeyframeIndex > 0) {
    const startKfIndex = (isGhostMode === "all") ? 0 : (currentKeyframeIndex - 1);

    // 1.5.1 Motion Trails (Linien zwischen den aufeinanderfolgenden Schritten)
    ctx.save();
    for (let k = startKfIndex; k < currentKeyframeIndex; k++) {
      const fromKf = currentExercise.keyframes[k];
      const toKf = currentExercise.keyframes[k + 1];
      if (!fromKf || !toKf) continue;

      // Opacity-Decay: neuere Übergänge kräftiger, ältere zarter
      const stepsAgo = currentKeyframeIndex - (k + 1);
      const trailAlpha = Math.max(0.18, 0.65 - stepsAgo * 0.14);

      for (const toEl of (toKf.elements || [])) {
        if (toEl.type === "player" || toEl.type === "ball") {
          const fromEl = (fromKf.elements || []).find(it => it.id === toEl.id);
          if (fromEl) {
            const dist = Math.hypot(toEl.x - fromEl.x, toEl.y - fromEl.y);
            if (dist > 8) {
              const teamCol = toEl.type === "ball" ? "#facc15" : (toEl.team === "red" ? "#f87171" : toEl.team === "blue" ? "#60a5fa" : "#34d399");

              // Effective Cubic Bezier Control Points
              const { p1, p2 } = getEffectiveCurveControlPoints(fromEl, toEl);
              const pMid = getCubicBezierPoint(0.5, fromEl, p1, p2, toEl);

              // 1. Verbindungslinie (als geschwungene Bézier-Kurve)
              ctx.save();
              ctx.strokeStyle = teamCol;
              ctx.lineWidth = Math.max(1.8, 2.8 - stepsAgo * 0.3);
              ctx.setLineDash(stepsAgo > 0 ? [4, 4] : [6, 5]);
              ctx.globalAlpha = trailAlpha;
              ctx.beginPath();
              ctx.moveTo(fromEl.x, fromEl.y);
              ctx.bezierCurveTo(p1.x, p1.y, p2.x, p2.y, toEl.x, toEl.y);
              ctx.stroke();

              // 2. Startpunkt
              ctx.fillStyle = teamCol;
              ctx.globalAlpha = trailAlpha * 0.85;
              ctx.beginPath();
              ctx.arc(fromEl.x, fromEl.y, 3.5, 0, Math.PI * 2);
              ctx.fill();

              // 3. Richtungspfeil am Zielpunkt entlang der Kurventangente
              // Tangente bei t=1 (Ende) ist gegeben durch (toEl - p2)
              const tangentDx = toEl.x - p2.x;
              const tangentDy = toEl.y - p2.y;
              const angle = Math.atan2(tangentDy, tangentDx);
              const headLen = Math.max(7, 10 - stepsAgo * 1.0);
              const offsetRadius = toEl.type === "ball" ? 14 : 20;
              const arrowTipX = toEl.x - Math.cos(angle) * offsetRadius;
              const arrowTipY = toEl.y - Math.sin(angle) * offsetRadius;

              ctx.setLineDash([]);
              ctx.globalAlpha = trailAlpha * 1.2;
              ctx.beginPath();
              ctx.moveTo(arrowTipX, arrowTipY);
              ctx.lineTo(arrowTipX - headLen * Math.cos(angle - Math.PI / 6), arrowTipY - headLen * Math.sin(angle - Math.PI / 6));
              ctx.lineTo(arrowTipX - headLen * Math.cos(angle + Math.PI / 6), arrowTipY - headLen * Math.sin(angle + Math.PI / 6));
              ctx.closePath();
              ctx.fill();

              // 4. Interaktive Ziehpunkte (Handles) für Kurvenkrümmung anzeigen (nur für aktuellen Schritt N-1 -> N)
              const isDirectStep = (k + 1 === currentKeyframeIndex);
              if (isDirectStep && !isPlaying) {
                const handleR = Math.max(4.5, 6 / Math.sqrt(viewScale));

                // Handle 1 (unten / Start-Bogen: P1)
                ctx.save();
                ctx.fillStyle = "#ffffff";
                ctx.strokeStyle = teamCol;
                ctx.lineWidth = 2;
                ctx.globalAlpha = 0.95;
                ctx.beginPath();
                ctx.arc(p1.x, p1.y, handleR, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();

                // Handle 2 (Mitte / Scheitelpunkt: pMid)
                ctx.fillStyle = toEl.jump ? "#c084fc" : "#38bdf8";
                ctx.strokeStyle = "#ffffff";
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(pMid.x, pMid.y, handleR + (toEl.jump ? 2.5 : 1), 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();

                // If jumping, draw small jump indicator wave above mid point
                if (toEl.jump) {
                  ctx.strokeStyle = "#c084fc";
                  ctx.lineWidth = 1.8;
                  ctx.beginPath();
                  ctx.arc(pMid.x, pMid.y - handleR - 4, 4, Math.PI * 1.1, Math.PI * 1.9);
                  ctx.stroke();
                }

                // Handle 3 (oben / Ziel-Bogen: P2)
                ctx.fillStyle = "#ffffff";
                ctx.strokeStyle = teamCol;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(p2.x, p2.y, handleR, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                ctx.restore();
              }

              ctx.restore();
            }
          }
        }
      }
    }
    ctx.restore();

    // 1.5.2 Vorherige Positionen mit Geister-Transparenz und Schritt-Badges darstellen
    const prevOrder = { cone: 1, pole: 1, ladder: 1, ring: 1, hurdle: 1, dummy: 1, minigoal: 2, goal_5m: 2, player: 3, ball: 4 };

    for (let k = startKfIndex; k < currentKeyframeIndex; k++) {
      const gKf = currentExercise.keyframes[k];
      if (!gKf) continue;

      const stepsAgo = currentKeyframeIndex - 1 - k; // 0 = direkter Vorgänger
      // Abstufung: Step N-1 hat 0.28, Step N-2 hat 0.17, Step N-3 hat 0.10
      const baseAlpha = Math.max(0.09, 0.28 - stepsAgo * 0.08);

      ctx.save();
      ctx.globalAlpha = baseAlpha;

      // Pfeile des Geister-Schritts
      for (const pArrow of (gKf.arrows || [])) {
        const { p1: pArr1, p2: pArr2 } = getArrowCurveControlPoints(pArrow);
        arrowModule.drawArrow(pArrow.x1, pArrow.y1, pArrow.x2, pArrow.y2, pArrow.type, pArrow.color || "#94a3b8", false, null, pArr1, pArr2, pArrow.raw_points);
      }

      // Elemente des Geister-Schritts
      const sortedGhostElements = [...(gKf.elements || [])].sort((a, b) => (prevOrder[a.type] || 2) - (prevOrder[b.type] || 2));
      for (const pEl of sortedGhostElements) {
  elemModule.drawElementOnCanvas(ctx, pEl, false, fieldRotation, globalElementScale);
      }

      ctx.restore();

      // Schritt-Nummern-Plakette an Geister-Elementen einblenden (immer aufrecht/lesbar zum Betrachter!)
      ctx.save();
      for (const pEl of sortedGhostElements) {
        if (pEl.type === "player" || pEl.type === "ball") {
          // Nur kennzeichnen, wenn sich das Element gegenüber dem aktuellen Schritt bewegt hat
          const currMatched = elements.find(it => it.id === pEl.id);
          if (currMatched && Math.hypot(currMatched.x - pEl.x, currMatched.y - pEl.y) > 12) {
            // Position Badge 12px versetzt (aufrecht relativ zum Feld)
            const badgeRadius = 7.5;
            let offsetAngle = -Math.PI / 4; // oben-rechts im Bildschirm
            if (fieldRotation !== 0) {
              offsetAngle += (fieldRotation * Math.PI) / 180;
            }
            const badgeX = pEl.x + 14 * Math.cos(offsetAngle);
            const badgeY = pEl.y + 14 * Math.sin(offsetAngle);

            ctx.save();
            ctx.translate(badgeX, badgeY);
            // Gegenrotation: Zahl bleibt für den Leser exakt aufrecht stehen
            if (fieldRotation !== 0) {
              ctx.rotate((-fieldRotation * Math.PI) / 180);
            }

            ctx.globalAlpha = Math.max(0.6, baseAlpha * 2.8);
            ctx.fillStyle = "rgba(15, 23, 42, 0.88)";
            ctx.strokeStyle = "rgba(148, 163, 184, 0.75)";
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.arc(0, 0, badgeRadius, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = "#ffffff";
            ctx.font = "bold 8.5px system-ui, -apple-system, sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(`${k + 1}`, 0, 0.5);
            ctx.restore();
          }
        }
      }
      ctx.restore();
    }
  }

  // 2. Draw Arrows
  const nowSec = performance.now() / 1000;
  for (let i = 0; i < arrows.length; i++) {
    const arrow = arrows[i];
    const isSelected = (selectedArrowIndex === i && selectedElementId === null);
    const { p1, p2 } = getArrowCurveControlPoints(arrow);
    arrowModule.drawArrow(arrow.x1, arrow.y1, arrow.x2, arrow.y2, arrow.type, arrow.color || (arrow.type === "guide" ? "#fbbf24" : "#facc15"), isSelected, nowSec, p1, p2, arrow.raw_points);
  }

  // Draw arrow in progress (live freehand trail or fitted preview)
  if (isDrawingArrow && activeTool !== "select") {
    const aType = (activeTool === "pass") ? "pass" : ((activeTool === "guide") ? "guide" : "run");
    const col = (activeTool === "pass") ? "#facc15" : ((activeTool === "guide") ? "#fbbf24" : "#38bdf8");

    if ((lineDrawMode === "freehand" || lineDrawMode === "raw_freehand") && arrowDrawStrokePoints && arrowDrawStrokePoints.length > 2) {
      // Draw smooth live stroke path following user's hand
      ctx.save();
      ctx.strokeStyle = col;
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      if (aType === "pass") {
        ctx.setLineDash([10, 8]);
      } else if (aType === "guide") {
        ctx.setLineDash([12, 8]);
        ctx.strokeStyle = "#fbbf24";
      }
      ctx.beginPath();
      ctx.moveTo(arrowDrawStrokePoints[0].x, arrowDrawStrokePoints[0].y);
      for (let p = 1; p < arrowDrawStrokePoints.length; p++) {
        ctx.lineTo(arrowDrawStrokePoints[p].x, arrowDrawStrokePoints[p].y);
      }
      ctx.stroke();

      // Draw dynamic arrowhead at the leading tip of the freehand stroke
      const pLast = arrowDrawStrokePoints[arrowDrawStrokePoints.length - 1];
      const pPrev = arrowDrawStrokePoints[Math.max(0, arrowDrawStrokePoints.length - 3)];
      const tipAngle = Math.atan2(pLast.y - pPrev.y, pLast.x - pPrev.x);
      const arrowSize = 14;
      ctx.setLineDash([]);
      ctx.fillStyle = (aType === "guide") ? "#fbbf24" : col;
      ctx.beginPath();
      ctx.moveTo(pLast.x, pLast.y);
      ctx.lineTo(pLast.x - arrowSize * Math.cos(tipAngle - Math.PI / 6), pLast.y - arrowSize * Math.sin(tipAngle - Math.PI / 6));
      ctx.lineTo(pLast.x - arrowSize * Math.cos(tipAngle + Math.PI / 6), pLast.y - arrowSize * Math.sin(tipAngle + Math.PI / 6));
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    } else {
      arrowModule.drawArrow(arrowStartX, arrowStartY, arrowCurrentX, arrowCurrentY, aType, col, false, nowSec);
    }
  }

  // 3. Draw Elements (sort so balls and players render above cones)
  const order = { cone: 1, pole: 1, ladder: 1, ring: 1, hurdle: 1, dummy: 1, minigoal: 2, goal_5m: 2, player: 3, ball: 4 };
  const sorted = [...elements].sort((a, b) => (order[a.type] || 2) - (order[b.type] || 2));

  for (const el of sorted) {
    const isSelected = (el.id === selectedElementId) || selectedElementIds.includes(el.id);
    elemModule.drawElementOnCanvas(ctx, el, isSelected, fieldRotation, globalElementScale);
  }

  // 4. Draw Lasso Selection Outline if currently lassoing
  if (isLassoSelecting && lassoPoints.length > 1) {
    ctx.save();
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 2.5;
    ctx.setLineDash([6, 4]);
    ctx.fillStyle = "rgba(56, 189, 248, 0.15)";
    ctx.beginPath();
    ctx.moveTo(lassoPoints[0].x, lassoPoints[0].y);
    for (let p = 1; p < lassoPoints.length; p++) {
      ctx.lineTo(lassoPoints[p].x, lassoPoints[p].y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore();

  // If there are guide arrows present or currently drawing one, keep an idle animation loop running for pulsing
  checkGuidePulseLoop();
}

function hasGuideArrowsOnScreen() {
  if (isDrawingArrow && activeTool === "guide") return true;
  const kf = currentExercise && currentExercise.keyframes ? currentExercise.keyframes[currentKeyframeIndex] : null;
  if (!kf || !kf.arrows) return false;
  return kf.arrows.some(a => a.type === "guide");
}

let isPulseLoopRunning = false;
function checkGuidePulseLoop() {
  if (isPlaying) {
    if (idlePulseReqId) {
      cancelAnimationFrame(idlePulseReqId);
      idlePulseReqId = null;
    }
    isPulseLoopRunning = false;
    return;
  }

  if (hasGuideArrowsOnScreen()) {
    if (!isPulseLoopRunning) {
      isPulseLoopRunning = true;
      function pulseStep() {
        if (!isPlaying && hasGuideArrowsOnScreen()) {
          drawScene();
          idlePulseReqId = requestAnimationFrame(pulseStep);
        } else {
          idlePulseReqId = null;
          isPulseLoopRunning = false;
        }
      }
      idlePulseReqId = requestAnimationFrame(pulseStep);
    }
  } else {
    if (idlePulseReqId) {
      cancelAnimationFrame(idlePulseReqId);
      idlePulseReqId = null;
    }
    isPulseLoopRunning = false;
  }
}

function drawPitchBackground(pitchType) {
  pitch.drawPitchBackground(ctx, pitchType);
}

function drawArrow(x1, y1, x2, y2, type = "pass", color = "#facc15", isSelected = false, animTime = null, cp1 = null, cp2 = null, rawPoints = null) {
  arrowModule.drawArrow(x1, y1, x2, y2, type, color, isSelected, animTime, cp1, cp2, rawPoints);
}

function drawElementOnCanvas(el, isSelected = false) {
  elemModule.drawElementOnCanvas(ctx, el, isSelected, fieldRotation, globalElementScale);
}

// Geometry & Bezier calculations (delegated to static/js/core/geometry.js)
function pointInPolygon(point, vs) {
  return geomModule.pointInPolygon(point, vs);
}
function distToPolyline(px, py, points) {
  return geomModule.distToPolyline(px, py, points);
}
function distToSegment(px, py, x1, y1, x2, y2) {
  return geomModule.distToSegment(px, py, x1, y1, x2, y2);
}
function distToCubicBezier(px, py, p0, p1, p2, p3) {
  return geomModule.distToCubicBezier(px, py, p0, p1, p2, p3);
}
function getCubicBezierPoint(t, p0, p1, p2, p3) {
  return geomModule.getCubicBezierPoint(t, p0, p1, p2, p3);
}
function getEffectiveCurveControlPoints(fromEl, toEl) {
  return geomModule.getEffectiveCurveControlPoints(fromEl, toEl);
}
function getArrowCurveControlPoints(arr) {
  return geomModule.getArrowCurveControlPoints(arr);
}
function fitCubicBezierToStroke(points) {
  return geomModule.fitCubicBezierToStroke(points);
}


// Convert Virtual Coordinates (1000x700) to Canvas Screen/DOM Pixels
function getScreenCoords(vx, vy) {
  const rect = canvas.getBoundingClientRect();
  const dispW = rect.width;
  const dispH = rect.height;
  const isRotated90 = (fieldRotation === 90 || fieldRotation === 270);
  const effectiveVW = isRotated90 ? VIRTUAL_HEIGHT : VIRTUAL_WIDTH;
  const effectiveVH = isRotated90 ? VIRTUAL_WIDTH : VIRTUAL_HEIGHT;
  const baseScale = Math.min(dispW / effectiveVW, dispH / effectiveVH);
  let sx = (vx - VIRTUAL_WIDTH / 2) * baseScale;
  let sy = (vy - VIRTUAL_HEIGHT / 2) * baseScale;
  if (fieldRotation !== 0) {
    const rad = (fieldRotation * Math.PI) / 180;
    const cosA = Math.cos(rad);
    const sinA = Math.sin(rad);
    const rx = sx * cosA - sy * sinA;
    const ry = sx * sinA + sy * cosA;
    sx = rx;
    sy = ry;
  }
  const centerX = dispW / 2;
  const centerY = dispH / 2;
  return { x: centerX + viewPanX + sx * viewScale, y: centerY + viewPanY + sy * viewScale };
}

// Interaction & Mouse / Touch Handling
function getCanvasCoords(evt) {
  const rect = canvas.getBoundingClientRect();
  const dispW = rect.width;
  const dispH = rect.height;
  let clientX, clientY;
  if (evt.touches && evt.touches.length > 0) {
    clientX = evt.touches[0].clientX;
    clientY = evt.touches[0].clientY;
  } else {
    clientX = evt.clientX;
    clientY = evt.clientY;
  }
  const cx = clientX - rect.left;
  const cy = clientY - rect.top;
  const centerX = dispW / 2;
  const centerY = dispH / 2;
  let unpannedX = (cx - centerX - viewPanX) / viewScale;
  let unpannedY = (cy - centerY - viewPanY) / viewScale;
  if (fieldRotation !== 0) {
    const rad = (-fieldRotation * Math.PI) / 180;
    const cosA = Math.cos(rad);
    const sinA = Math.sin(rad);
    const rx = unpannedX * cosA - unpannedY * sinA;
    const ry = unpannedX * sinA + unpannedY * cosA;
    unpannedX = rx;
    unpannedY = ry;
  }
  const isRotated90 = (fieldRotation === 90 || fieldRotation === 270);
  const effectiveVW = isRotated90 ? VIRTUAL_HEIGHT : VIRTUAL_WIDTH;
  const effectiveVH = isRotated90 ? VIRTUAL_WIDTH : VIRTUAL_HEIGHT;
  const baseScale = Math.min(dispW / effectiveVW, dispH / effectiveVH);
  return {
    x: unpannedX / baseScale + VIRTUAL_WIDTH / 2,
    y: unpannedY / baseScale + VIRTUAL_HEIGHT / 2
  };
}

function zoomAt(targetScale, clientPoint = null) {
  const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, targetScale));
  if (newScale === viewScale) return;

  const rect = canvas.getBoundingClientRect();
  const centerX = rect.width / 2;
  const centerY = rect.height / 2;

  let cx = centerX;
  let cy = centerY;
  if (clientPoint) {
    cx = clientPoint.x - rect.left;
    cy = clientPoint.y - rect.top;
  }

  const worldX = (cx - centerX - viewPanX) / viewScale + centerX;
  const worldY = (cy - centerY - viewPanY) / viewScale + centerY;

  viewPanX = cx - centerX - (worldX - centerX) * newScale;
  viewPanY = cy - centerY - (worldY - centerY) * newScale;
  viewScale = newScale;

  updateZoomUI();
  drawScene();
  updateActionPopupPosition();
}

function zoomIn() {
  zoomAt(viewScale + 0.25);
}

function zoomOut() {
  zoomAt(viewScale - 0.25);
}

function resetZoom() {
  viewScale = 1.0;
  viewPanX = 0;
  viewPanY = 0;
  updateZoomUI();
  drawScene();
}

function updateZoomUI() {
  if (window.TacticalCoach?.viewport?.updateZoomUI) {
    window.TacticalCoach.viewport.updateZoomUI();
  } else {
    const badge = document.getElementById("zoomLevelText");
    if (badge) badge.textContent = `${Math.round(viewScale * 100)}%`;
  }
}

let isViewControlsOpen = false;

function toggleViewControls() {
  const drawer = document.getElementById("viewControlsDrawer");
  if (!drawer) return;
  isViewControlsOpen = !isViewControlsOpen;
  if (isViewControlsOpen) {
    drawer.classList.remove("hidden");
    // Auto-adjust left position if overflowing right viewport
    const rect = drawer.getBoundingClientRect();
    if (rect.right > window.innerWidth - 8) {
      const overflow = rect.right - (window.innerWidth - 8);
      const currentLeft = parseFloat(drawer.style.left || "0") || 0;
      drawer.style.left = `${currentLeft - overflow}px`;
    }
  } else {
    drawer.classList.add("hidden");
    drawer.style.left = "";
  }
}

// Close view controls drawer when clicking outside
window.addEventListener("pointerdown", (e) => {
  if (isViewControlsOpen) {
    const drawer = document.getElementById("viewControlsDrawer");
    const btn = document.getElementById("viewControlsToggleBtn");
    if (drawer && !drawer.contains(e.target) && btn && !btn.contains(e.target)) {
      isViewControlsOpen = false;
      drawer.classList.add("hidden");
      drawer.style.left = "";
    }
  }

  // If clicked outside canvas and outside context menus / modals / floating controls, deselect and hide menus
  const popup = document.getElementById("elementActionPopup");
  const bar = document.getElementById("floatingElementBar");
  const cWrapper = document.getElementById("canvasWrapper");

  const isInsideCanvas = (cWrapper && cWrapper.contains(e.target)) || (canvas && canvas.contains(e.target));
  const isInsidePopup = popup && popup.contains(e.target);
  const isInsideBar = bar && bar.contains(e.target);
  const isInsideModal = e.target.closest && e.target.closest(".fixed.inset-0");

  if (!isInsideCanvas && !isInsidePopup && !isInsideBar && !isInsideModal) {
    if (selectedElementId !== null || selectedElementIds.length > 0 || selectedArrowIndex !== null) {
      deselectElement();
    }
  }
});

function setupCanvasEvents() {
  // Wheel / Trackpad Zoom & Pan
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) > 20) {
      // Zoom
      const zoomFactor = e.deltaY < 0 ? 1.12 : 0.89;
      zoomAt(viewScale * zoomFactor, { x: e.clientX, y: e.clientY });
    } else {
      // Pan
      viewPanX -= e.deltaX;
      viewPanY -= e.deltaY;
      drawScene();
    }
  }, { passive: false });

  const onStart = (e) => {
    if (isPlaying) return;
    if (e.cancelable) e.preventDefault();

    // Snapshot state before action begins for Undo
    dragInitialSnapshot = JSON.stringify(currentExercise);

    // Multi-touch handling (Pinch to Zoom & 2-Finger Pan)
    if (e.touches && e.touches.length >= 2) {
      isDragging = false;
      isDrawingArrow = false;
      isPanning = true;

      const t1 = e.touches[0];
      const t2 = e.touches[1];
      initialPinchDistance = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      initialPinchScale = viewScale;
      panStartX = (t1.clientX + t2.clientX) / 2 - viewPanX;
      panStartY = (t1.clientY + t2.clientY) / 2 - viewPanY;
      return;
    }

    const { x, y } = getCanvasCoords(e);
    const kf = currentExercise.keyframes[currentKeyframeIndex];

    // 0. Check if user clicked on a Ghost Curve Handle (start, mid, end) to shape a player/ball run curve
    if (isGhostMode !== "off" && currentKeyframeIndex > 0) {
      const prevKf = currentExercise.keyframes[currentKeyframeIndex - 1];
      if (prevKf) {
        const handleHitRadius = Math.max(14, 18 / Math.sqrt(viewScale));
        for (const currEl of (kf.elements || [])) {
          if (currEl.type === "player" || currEl.type === "ball") {
            const prevEl = (prevKf.elements || []).find(it => it.id === currEl.id);
            if (prevEl) {
              const dist = Math.hypot(currEl.x - prevEl.x, currEl.y - prevEl.y);
              if (dist > 8) {
                const { p1, p2 } = getEffectiveCurveControlPoints(prevEl, currEl);
                const pMid = getCubicBezierPoint(0.5, prevEl, p1, p2, currEl);

                // Check Handle 1 (P1 - Start curve)
                if (Math.hypot(x - p1.x, y - p1.y) <= handleHitRadius) {
                  activeCurveDrag = {
                    elementId: currEl.id,
                    handle: "p1",
                    fromEl: { x: prevEl.x, y: prevEl.y },
                    toEl: currEl
                  };
                  isDragging = false;
                  isDraggingArrow = false;
                  hideInspector();
                  return;
                }
                // Check Handle 2 (pMid - Center curve)
                if (Math.hypot(x - pMid.x, y - pMid.y) <= handleHitRadius) {
                  activeCurveDrag = {
                    elementId: currEl.id,
                    handle: "mid",
                    fromEl: { x: prevEl.x, y: prevEl.y },
                    toEl: currEl,
                    initialMid: { x: pMid.x, y: pMid.y }
                  };
                  isDragging = false;
                  isDraggingArrow = false;
                  hideInspector();
                  return;
                }
                // Check Handle 3 (P2 - End curve)
                if (Math.hypot(x - p2.x, y - p2.y) <= handleHitRadius) {
                  activeCurveDrag = {
                    elementId: currEl.id,
                    handle: "p2",
                    fromEl: { x: prevEl.x, y: prevEl.y },
                    toEl: currEl
                  };
                  isDragging = false;
                  isDraggingArrow = false;
                  hideInspector();
                  return;
                }
              }
            }
          }
        }
      }
    }

    // Priority Check: Did user click on an already placed element or arrow/line?
    // If so, automatically switch to move/edit (select) mode immediately!
    const effectiveElScale = Math.max(0.6, globalElementScale || 1.0);
    const hitRadius = Math.max(26 * effectiveElScale, (34 * effectiveElScale) / Math.sqrt(viewScale));
    const clickedElement = [...kf.elements].reverse().find(el => Math.hypot(el.x - x, el.y - y) <= hitRadius);

    if (clickedElement) {
      if (activeTool !== "select") {
        setActiveTool("select");
      }
      if (selectedElementIds.includes(clickedElement.id)) {
        isDragging = true;
        isDraggingArrow = false;
        groupDragOffsets = {};
        kf.elements.filter(it => selectedElementIds.includes(it.id)).forEach(it => {
          groupDragOffsets[it.id] = { dx: x - it.x, dy: y - it.y };
        });
        drawScene();
        updateActionPopupPosition();
        return;
      }
      selectedElementIds = [];
      selectedElementId = clickedElement.id;
      selectedArrowIndex = null;
      selectedArrowPart = null;
      isDragging = true;
      isDraggingArrow = false;
      dragStartX = x - clickedElement.x;
      dragStartY = y - clickedElement.y;
      showInspector(clickedElement);
      drawScene();
      updateActionPopupPosition();
      return;
    }

    // Check if clicked on an arrow or guideline
    if (kf.arrows && kf.arrows.length > 0) {
      const arrowHitThreshold = Math.max(16, 22 / Math.sqrt(viewScale));
      const handleThreshold = Math.max(18, 24 / Math.sqrt(viewScale));

      // First check if user clicked on curve handles of the currently selected arrow
      if (selectedArrowIndex !== null && kf.arrows[selectedArrowIndex]) {
        const selArr = kf.arrows[selectedArrowIndex];
        const { p1: selP1, p2: selP2 } = getArrowCurveControlPoints(selArr);
        const selPMid = getCubicBezierPoint(0.5, { x: selArr.x1, y: selArr.y1 }, selP1, selP2, { x: selArr.x2, y: selArr.y2 });

        if (Math.hypot(x - selP1.x, y - selP1.y) <= handleThreshold) {
          activeCurveDrag = {
            arrowIndex: selectedArrowIndex,
            handle: "p1",
            arrow: selArr
          };
          isDragging = false;
          isDraggingArrow = false;
          hideInspector();
          return;
        }
        if (Math.hypot(x - selPMid.x, y - selPMid.y) <= handleThreshold) {
          activeCurveDrag = {
            arrowIndex: selectedArrowIndex,
            handle: "mid",
            arrow: selArr
          };
          isDragging = false;
          isDraggingArrow = false;
          hideInspector();
          return;
        }
        if (Math.hypot(x - selP2.x, y - selP2.y) <= handleThreshold) {
          activeCurveDrag = {
            arrowIndex: selectedArrowIndex,
            handle: "p2",
            arrow: selArr
          };
          isDragging = false;
          isDraggingArrow = false;
          hideInspector();
          return;
        }
      }

      for (let i = kf.arrows.length - 1; i >= 0; i--) {
        const arr = kf.arrows[i];
        const { p1, p2 } = getArrowCurveControlPoints(arr);
        const distStart = Math.hypot(arr.x1 - x, arr.y1 - y);
        const distEnd = Math.hypot(arr.x2 - x, arr.y2 - y);

        if (distEnd <= handleThreshold) {
          if (activeTool !== "select") setActiveTool("select");
          selectedArrowIndex = i;
          selectedArrowPart = "end";
          selectedElementId = null;
          selectedElementIds = [];
          isDraggingArrow = true;
          isDragging = false;
          showArrowInspector(arr);
          drawScene();
          updateActionPopupPosition();
          return;
        } else if (distStart <= handleThreshold) {
          if (activeTool !== "select") setActiveTool("select");
          selectedArrowIndex = i;
          selectedArrowPart = "start";
          selectedElementId = null;
          selectedElementIds = [];
          isDraggingArrow = true;
          isDragging = false;
          showArrowInspector(arr);
          drawScene();
          updateActionPopupPosition();
          return;
        } else if ((arr.raw_points && distToPolyline(x, y, arr.raw_points) <= arrowHitThreshold) || (!arr.raw_points && distToCubicBezier(x, y, { x: arr.x1, y: arr.y1 }, p1, p2, { x: arr.x2, y: arr.y2 }) <= arrowHitThreshold)) {
          if (activeTool !== "select") setActiveTool("select");
          selectedArrowIndex = i;
          selectedArrowPart = "body";
          selectedElementId = null;
          selectedElementIds = [];
          isDraggingArrow = true;
          isDragging = false;
          arrowDragOffsetX = x;
          arrowDragOffsetY = y;
          showArrowInspector(arr);
          drawScene();
          updateActionPopupPosition();
          return;
        }
      }
    }

    // Clicked outside on empty pitch:
    if (activeTool === "select") {
      // Hide all context menus and clear selection
      selectedElementId = null;
      selectedElementIds = [];
      selectedArrowIndex = null;
      selectedArrowPart = null;
      hideInspector();
      updateActionPopupPosition();

      // Start Lasso selection
      isLassoSelecting = true;
      lassoPoints = [{ x, y }];
      drawScene();
    } else {
      // Arrow / Guideline drawing mode on empty pitch
      selectedElementId = null;
      selectedElementIds = [];
      selectedArrowIndex = null;
      selectedArrowPart = null;
      hideInspector();
      updateActionPopupPosition();

      isDrawingArrow = true;
      arrowStartX = x;
      arrowStartY = y;
      arrowCurrentX = x;
      arrowCurrentY = y;
      arrowDrawStrokePoints = [{ x, y }];
      drawScene();
    }
  };

  const onMove = (e) => {
    if (isPlaying) return;
    if (e.cancelable) e.preventDefault();

    // Two-finger pinch / pan active
    if (isPanning && e.touches && e.touches.length >= 2) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      
      if (initialPinchDistance && initialPinchDistance > 10) {
        const factor = dist / initialPinchDistance;
        viewScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, initialPinchScale * factor));
      }

      const midX = (t1.clientX + t2.clientX) / 2;
      const midY = (t1.clientY + t2.clientY) / 2;
      viewPanX = midX - panStartX;
      viewPanY = midY - panStartY;

      updateZoomUI();
      drawScene();
      return;
    }

    const { x, y } = getCanvasCoords(e);

    // If dragging a Curve Handle (Ghost motion or Arrow/Guideline):
    if (activeCurveDrag) {
      if (activeCurveDrag.arrow) {
        // Dragging curve handle on a drawn Arrow / Guideline
        const { handle, arrow } = activeCurveDrag;
        const dx = arrow.x2 - arrow.x1;
        const dy = arrow.y2 - arrow.y1;

        if (handle === "p1") {
          const defaultP1X = arrow.x1 + dx * (1 / 3);
          const defaultP1Y = arrow.y1 + dy * (1 / 3);
          arrow.cp1_dx = Math.round(x - defaultP1X);
          arrow.cp1_dy = Math.round(y - defaultP1Y);
        } else if (handle === "p2") {
          const defaultP2X = arrow.x1 + dx * (2 / 3);
          const defaultP2Y = arrow.y1 + dy * (2 / 3);
          arrow.cp2_dx = Math.round(x - defaultP2X);
          arrow.cp2_dy = Math.round(y - defaultP2Y);
        } else if (handle === "mid") {
          const straightMidX = arrow.x1 + dx * 0.5;
          const straightMidY = arrow.y1 + dy * 0.5;
          const offsetMidX = x - straightMidX;
          const offsetMidY = y - straightMidY;
          arrow.cp1_dx = Math.round(offsetMidX * 1.33);
          arrow.cp1_dy = Math.round(offsetMidY * 1.33);
          arrow.cp2_dx = Math.round(offsetMidX * 1.33);
          arrow.cp2_dy = Math.round(offsetMidY * 1.33);
        }

        // If persistent arrow, sync curve parameters across all frames
        if (arrow.persistent && arrow.id) {
          currentExercise.keyframes.forEach((otherKf, idx) => {
            if (idx !== currentKeyframeIndex && otherKf.arrows) {
              const matched = otherKf.arrows.find(it => it.id === arrow.id);
              if (matched) {
                matched.cp1_dx = arrow.cp1_dx;
                matched.cp1_dy = arrow.cp1_dy;
                matched.cp2_dx = arrow.cp2_dx;
                matched.cp2_dy = arrow.cp2_dy;
              }
            }
          });
        }

        drawScene();
        return;
      }

      const { handle, fromEl, toEl } = activeCurveDrag;
      const dx = toEl.x - fromEl.x;
      const dy = toEl.y - fromEl.y;

      if (handle === "p1") {
        // P1 offset relative to 1/3 straight position
        const defaultP1X = fromEl.x + dx * (1 / 3);
        const defaultP1Y = fromEl.y + dy * (1 / 3);
        toEl.cp1_dx = Math.round(x - defaultP1X);
        toEl.cp1_dy = Math.round(y - defaultP1Y);
      } else if (handle === "p2") {
        // P2 offset relative to 2/3 straight position
        const defaultP2X = fromEl.x + dx * (2 / 3);
        const defaultP2Y = fromEl.y + dy * (2 / 3);
        toEl.cp2_dx = Math.round(x - defaultP2X);
        toEl.cp2_dy = Math.round(y - defaultP2Y);
      } else if (handle === "mid") {
        // Dragging mid handle moves both control points together (smooth arched curve)
        const straightMidX = fromEl.x + dx * 0.5;
        const straightMidY = fromEl.y + dy * 0.5;
        const offsetMidX = x - straightMidX;
        const offsetMidY = y - straightMidY;
        // In cubic bezier, mid point displacement translates directly to control points offset
        toEl.cp1_dx = Math.round(offsetMidX * 1.33);
        toEl.cp1_dy = Math.round(offsetMidY * 1.33);
        toEl.cp2_dx = Math.round(offsetMidX * 1.33);
        toEl.cp2_dy = Math.round(offsetMidY * 1.33);
      }
      drawScene();
      return;
    }

    // If dragging an element or arrow, set isMovingElement and hide context menus until release
    if (isDragging || isDraggingArrow) {
      if (!isMovingElement) {
        isMovingElement = true;
        hideInspector();
      }
    }

    if (isDragging && selectedElementIds.length > 0) {
      // Dragging entire selected group
      const kf = currentExercise.keyframes[currentKeyframeIndex];
      const draggedElements = kf.elements.filter(it => selectedElementIds.includes(it.id));
      draggedElements.forEach(el => {
        const off = groupDragOffsets[el.id];
        if (off) {
          el.x = Math.max(20, Math.min(VIRTUAL_WIDTH - 20, x - off.dx));
          el.y = Math.max(20, Math.min(VIRTUAL_HEIGHT - 20, y - off.dy));
        }
      });

      // Synchronize stationary equipment across all other keyframes!
      draggedElements.forEach(el => {
        if (isEquipment(el.type)) {
          currentExercise.keyframes.forEach((otherKf, idx) => {
            if (idx !== currentKeyframeIndex) {
              const matched = otherKf.elements.find(it => it.id === el.id);
              if (matched) {
                matched.x = el.x;
                matched.y = el.y;
                if (el.rotation !== undefined) matched.rotation = el.rotation;
              }
            }
          });
        }
      });

      drawScene();
      updateActionPopupPosition();
    } else if (isDragging && selectedElementId) {
      const kf = currentExercise.keyframes[currentKeyframeIndex];
      const el = kf.elements.find(it => it.id === selectedElementId);
      if (el) {
        el.x = Math.max(20, Math.min(VIRTUAL_WIDTH - 20, x - dragStartX));
        el.y = Math.max(20, Math.min(VIRTUAL_HEIGHT - 20, y - dragStartY));

        // Synchronize stationary equipment across all other keyframes!
        if (isEquipment(el.type)) {
          currentExercise.keyframes.forEach((otherKf, idx) => {
            if (idx !== currentKeyframeIndex) {
              const matched = otherKf.elements.find(it => it.id === el.id);
              if (matched) {
                matched.x = el.x;
                matched.y = el.y;
                if (el.rotation !== undefined) matched.rotation = el.rotation;
              }
            }
          });
        }

        drawScene();
        updateActionPopupPosition();
      }
    } else if (isLassoSelecting) {
      // Append point to lasso if moved significantly
      const lastPoint = lassoPoints[lassoPoints.length - 1];
      if (!lastPoint || Math.hypot(x - lastPoint.x, y - lastPoint.y) > 6) {
        lassoPoints.push({ x, y });
        drawScene();
      }
    } else if (isDraggingArrow && selectedArrowIndex !== null) {
      const kf = currentExercise.keyframes[currentKeyframeIndex];
      const arr = kf.arrows ? kf.arrows[selectedArrowIndex] : null;
      if (arr) {
        if (selectedArrowPart === "start") {
          arr.x1 = Math.max(10, Math.min(VIRTUAL_WIDTH - 10, x));
          arr.y1 = Math.max(10, Math.min(VIRTUAL_HEIGHT - 10, y));
        } else if (selectedArrowPart === "end") {
          arr.x2 = Math.max(10, Math.min(VIRTUAL_WIDTH - 10, x));
          arr.y2 = Math.max(10, Math.min(VIRTUAL_HEIGHT - 10, y));
        } else if (selectedArrowPart === "body") {
          const dx = x - arrowDragOffsetX;
          const dy = y - arrowDragOffsetY;
          arr.x1 = Math.max(10, Math.min(VIRTUAL_WIDTH - 10, arr.x1 + dx));
          arr.y1 = Math.max(10, Math.min(VIRTUAL_HEIGHT - 10, arr.y1 + dy));
          arr.x2 = Math.max(10, Math.min(VIRTUAL_WIDTH - 10, arr.x2 + dx));
          arr.y2 = Math.max(10, Math.min(VIRTUAL_HEIGHT - 10, arr.y2 + dy));
          if (arr.raw_points && arr.raw_points.length > 0) {
            for (const pt of arr.raw_points) {
              pt.x += dx;
              pt.y += dy;
            }
          }
          arrowDragOffsetX = x;
          arrowDragOffsetY = y;
        }

        // If this arrow is persistent across all steps, synchronize updated position to all keyframes
        if (arr.persistent && arr.id) {
          currentExercise.keyframes.forEach((otherKf, idx) => {
            if (idx !== currentKeyframeIndex && otherKf.arrows) {
              const matched = otherKf.arrows.find(it => it.id === arr.id);
              if (matched) {
                matched.x1 = arr.x1;
                matched.y1 = arr.y1;
                matched.x2 = arr.x2;
                matched.y2 = arr.y2;
                matched.cp1_dx = arr.cp1_dx;
                matched.cp1_dy = arr.cp1_dy;
                matched.cp2_dx = arr.cp2_dx;
                matched.cp2_dy = arr.cp2_dy;
              }
            }
          });
        }

        drawScene();
        updateActionPopupPosition();
      }
    } else if (isDrawingArrow) {
      arrowCurrentX = x;
      arrowCurrentY = y;
      const lastPt = arrowDrawStrokePoints[arrowDrawStrokePoints.length - 1];
      if (!lastPt || Math.hypot(x - lastPt.x, y - lastPt.y) >= 4) {
        arrowDrawStrokePoints.push({ x, y });
      }
      drawScene();
    }
  };

  const onEnd = (e) => {
    if (activeCurveDrag) {
      activeCurveDrag = null;
      drawScene();
      updateActionPopupPosition();
      // Record history if curve handle was moved
      if (dragInitialSnapshot && dragInitialSnapshot !== JSON.stringify(currentExercise)) {
        recordHistory();
      }
      dragInitialSnapshot = null;
      return;
    }

    const wasMoving = isMovingElement;
    isMovingElement = false;

    if (isPanning) {
      if (!e.touches || e.touches.length < 2) {
        isPanning = false;
        initialPinchDistance = null;
      }
    }
    if (isDragging) {
      isDragging = false;
      groupDragOffsets = {};
    }
    if (isDraggingArrow) {
      isDraggingArrow = false;
    }
    if (isLassoSelecting) {
      isLassoSelecting = false;
      const kf = currentExercise.keyframes[currentKeyframeIndex];

      // Check if lasso was actually a drawn loop (at least 3 points and covering some area)
      if (lassoPoints.length >= 3 && kf && kf.elements.length > 0) {
        // Find all elements that fall inside the polygon or bounding area
        const enclosedIds = [];
        kf.elements.forEach(el => {
          if (pointInPolygon({ x: el.x, y: el.y }, lassoPoints)) {
            enclosedIds.push(el.id);
          }
        });

        if (enclosedIds.length > 1) {
          selectedElementIds = enclosedIds;
          selectedElementId = null;
          showGroupInspector(enclosedIds.length);
          updateActionPopupPosition();
        } else if (enclosedIds.length === 1) {
          selectedElementId = enclosedIds[0];
          selectedElementIds = [];
          const singleEl = kf.elements.find(it => it.id === selectedElementId);
          if (singleEl) showInspector(singleEl);
          updateActionPopupPosition();
        } else {
          selectedElementIds = [];
          selectedElementId = null;
          hideInspector();
          updateActionPopupPosition();
        }
      } else {
        selectedElementIds = [];
        selectedElementId = null;
        hideInspector();
        updateActionPopupPosition();
      }

      lassoPoints = [];
      drawScene();
    }
    if (isDrawingArrow) {
      isDrawingArrow = false;
      const dist = Math.hypot(arrowCurrentX - arrowStartX, arrowCurrentY - arrowStartY);
      if (dist > 15) {
        const kf = currentExercise.keyframes[currentKeyframeIndex];
        if (!kf.arrows) kf.arrows = [];
        const aType = (activeTool === "pass") ? "pass" : ((activeTool === "guide") ? "guide" : "run");
        const col = (activeTool === "pass") ? "#facc15" : ((activeTool === "guide") ? "#fbbf24" : "#38bdf8");

        // Fit smooth Bezier curve parameters from recorded stroke points (if in freehand mode)
        const fittedCurve = (lineDrawMode === "freehand") ? fitCubicBezierToStroke(arrowDrawStrokePoints) : null;

        const newArrow = {
          id: `arr_${Math.random().toString(36).substr(2, 7)}`,
          type: aType,
          x1: arrowStartX,
          y1: arrowStartY,
          x2: arrowCurrentX,
          y2: arrowCurrentY,
          color: col,
          persistent: false
        };

        if (lineDrawMode === "raw_freehand" && arrowDrawStrokePoints && arrowDrawStrokePoints.length >= 2) {
          // Store exact user stroke points for full freehand
          newArrow.raw_points = arrowDrawStrokePoints.map(p => ({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 }));
        } else if (fittedCurve && (fittedCurve.cp1_dx !== 0 || fittedCurve.cp1_dy !== 0 || fittedCurve.cp2_dx !== 0 || fittedCurve.cp2_dy !== 0)) {
          newArrow.cp1_dx = fittedCurve.cp1_dx;
          newArrow.cp1_dy = fittedCurve.cp1_dy;
          newArrow.cp2_dx = fittedCurve.cp2_dx;
          newArrow.cp2_dy = fittedCurve.cp2_dy;
        }

        kf.arrows.push(newArrow);
        selectedArrowIndex = kf.arrows.length - 1;
        selectedArrowPart = "body";
        showArrowInspector(newArrow);
        updateActionPopupPosition();
      }
      arrowDrawStrokePoints = [];
      drawScene();
    }

    // When mouse/touch finishes moving, restore the context menus over the released element
    if (wasMoving) {
      const kf = currentExercise.keyframes[currentKeyframeIndex];
      if (selectedElementIds.length > 0) {
        showGroupInspector(selectedElementIds.length);
        updateActionPopupPosition();
      } else if (selectedElementId && kf) {
        const el = kf.elements.find(it => it.id === selectedElementId);
        if (el) showInspector(el);
        updateActionPopupPosition();
      } else if (selectedArrowIndex !== null && kf && kf.arrows && kf.arrows[selectedArrowIndex]) {
        showArrowInspector(kf.arrows[selectedArrowIndex]);
        updateActionPopupPosition();
      }
    }

    // Record history if state changed during pointer session (dragging element, arrow, or drawing arrow)
    if (dragInitialSnapshot && dragInitialSnapshot !== JSON.stringify(currentExercise)) {
      recordHistory();
    }
    dragInitialSnapshot = null;
  };

  canvas.addEventListener("mousedown", onStart);
  canvas.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onEnd);

  canvas.addEventListener("touchstart", onStart, { passive: false });
  canvas.addEventListener("touchmove", onMove, { passive: false });
  window.addEventListener("touchend", onEnd);
  window.addEventListener("touchcancel", onEnd);

  // Prevent scroll gestures on body while dragging or panning
  document.body.addEventListener("touchmove", (e) => {
    if (isDragging || isDrawingArrow || isPanning) {
      if (e.cancelable) e.preventDefault();
    }
  }, { passive: false });

  // Keyboard Shortcuts (Undo, Redo, Delete, Play, etc.)
  window.addEventListener("keydown", (e) => {
    // Don't intercept when user is typing in an input or textarea
    const tag = e.target.tagName.toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return;

    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === "z" || e.key === "Z")) {
      e.preventDefault();
      undo();
    } else if ((e.ctrlKey || e.metaKey) && (e.key === "y" || e.key === "Y" || (e.shiftKey && (e.key === "z" || e.key === "Z")))) {
      e.preventDefault();
      redo();
    } else if (e.key === "Delete" || e.key === "Backspace") {
      if (selectedElementId || selectedElementIds.length > 0) {
        e.preventDefault();
        deleteSelectedElement();
      } else if (selectedArrowIndex !== null) {
        e.preventDefault();
        deleteSelectedElement();
      }
    } else if (e.key === " " && !e.repeat) {
      e.preventDefault();
      togglePlayAnimation();
    }
  });
}

// Position the Action Popup directly over the currently selected element or center of selected group
function toggleFocusSelectedElement() {
  const kf = currentExercise.keyframes[currentKeyframeIndex];
  if (!kf) return;

  if (selectedElementIds.length > 0) {
    const players = kf.elements.filter(it => selectedElementIds.includes(it.id));
    const anyFocused = players.some(it => it.focus);
    players.forEach(it => {
      it.focus = !anyFocused;
    });
    drawScene();
    updateFocusButtonState();
    recordHistory();
    return;
  }

  if (selectedElementId) {
    const el = kf.elements.find(it => it.id === selectedElementId);
    if (el) {
      el.focus = !el.focus;
      drawScene();
      updateFocusButtonState();
      recordHistory();
    }
  }
}

function updateFocusButtonState() {
  const kf = currentExercise.keyframes[currentKeyframeIndex];
  const btn = document.getElementById("actionPopupFocusBtn");
  if (!btn || !kf) return;

  let isFocused = false;
  if (selectedElementIds.length > 0) {
    isFocused = kf.elements.some(it => selectedElementIds.includes(it.id) && it.focus);
  } else if (selectedElementId) {
    const el = kf.elements.find(it => it.id === selectedElementId);
    isFocused = el ? !!el.focus : false;
  }

  if (isFocused) {
    btn.className = "w-8 h-8 rounded-lg bg-yellow-500 text-black active:scale-90 flex items-center justify-center text-xs transition shadow-md shadow-yellow-500/30";
    btn.title = "Fokus aufheben";
  } else {
    btn.className = "w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 active:scale-90 text-yellow-400 flex items-center justify-center text-xs transition";
    btn.title = "Spieler in Fokus setzen (Spotlight)";
  }

  // Update Jump Button State
  const jumpBtn = document.getElementById("actionPopupJumpBtn");
  if (jumpBtn) {
    let isJumping = false;
    if (selectedElementId) {
      const el = kf.elements.find(it => it.id === selectedElementId);
      if (el && el.jump) isJumping = true;
    }
    if (isJumping) {
      jumpBtn.className = "w-8 h-8 rounded-lg bg-purple-600 text-white active:scale-90 flex items-center justify-center text-xs transition shadow-md shadow-purple-500/30";
      jumpBtn.title = "Hüpfen aktiv (klicken zum Deaktivieren)";
    } else {
      jumpBtn.className = "w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 active:scale-90 text-purple-400 flex items-center justify-center text-xs transition";
      jumpBtn.title = "Hüpfen / Größensprung aktivieren";
    }
  }

  // Update Reset Curve Button visibility
  const resetCurveBtn = document.getElementById("actionPopupResetCurveBtn");
  if (resetCurveBtn) {
    let hasCurvedTrajectory = false;
    if (selectedElementId && currentKeyframeIndex > 0) {
      const el = kf.elements.find(it => it.id === selectedElementId);
      if (el && (el.cp1_dx !== undefined || el.cp1_dy !== undefined || el.cp2_dx !== undefined || el.cp2_dy !== undefined)) {
        hasCurvedTrajectory = true;
      }
    }
    if (hasCurvedTrajectory) {
      resetCurveBtn.classList.remove("hidden");
    } else {
      resetCurveBtn.classList.add("hidden");
    }
  }
}

function toggleSelectedElementJump() {
  const kf = currentExercise.keyframes[currentKeyframeIndex];
  if (!kf || !selectedElementId) return;
  const el = kf.elements.find(it => it.id === selectedElementId);
  if (el) {
    el.jump = !el.jump;
    drawScene();
    updateFocusButtonState();
    recordHistory();
  }
}

function resetSelectedElementCurve() {
  const kf = currentExercise.keyframes[currentKeyframeIndex];
  if (!kf || !selectedElementId) return;
  const el = kf.elements.find(it => it.id === selectedElementId);
  if (el) {
    delete el.cp1_dx;
    delete el.cp1_dy;
    delete el.cp2_dx;
    delete el.cp2_dy;
    drawScene();
    updateFocusButtonState();
    updateActionPopupPosition();
    recordHistory();
  }
}

// Position the Action Popup directly over the currently selected element, arrow or center of selected group
function updateActionPopupPosition() {
  const popup = document.getElementById("elementActionPopup");
  if (!popup) return;

  // While element or arrow is actively being moved, hide the context popup completely
  if (isMovingElement) {
    popup.classList.add("hidden");
    return;
  }

  const kf = currentExercise.keyframes[currentKeyframeIndex];
  if (!kf) {
    popup.classList.add("hidden");
    return;
  }

  const elControls = document.getElementById("actionPopupElementControls");
  const arrowControls = document.getElementById("actionPopupArrowControls");

  let posX = 0;
  let posY = 0;

  if (selectedElementIds.length > 0) {
    // Multi-selected group: place popup at average center of all selected elements
    const elements = kf.elements.filter(it => selectedElementIds.includes(it.id));
    if (elements.length === 0) {
      popup.classList.add("hidden");
      return;
    }
    let avgX = 0, avgY = 0;
    elements.forEach(it => { avgX += it.x; avgY += it.y; });
    avgX /= elements.length;
    avgY /= elements.length;

    const screenPos = getScreenCoords(avgX, avgY);
    posX = screenPos.x;
    posY = screenPos.y - 38;

    if (elControls) elControls.classList.remove("hidden");
    if (arrowControls) arrowControls.classList.add("hidden");
  } else if (selectedElementId) {
    const el = kf.elements.find(it => it.id === selectedElementId);
    if (!el) {
      popup.classList.add("hidden");
      return;
    }
    const screenPos = getScreenCoords(el.x, el.y);
    posX = screenPos.x;
    posY = screenPos.y - 32;

    if (elControls) elControls.classList.remove("hidden");
    if (arrowControls) arrowControls.classList.add("hidden");
  } else if (selectedArrowIndex !== null && kf.arrows && kf.arrows[selectedArrowIndex]) {
    const arr = kf.arrows[selectedArrowIndex];
    // Position context popup directly above the midpoint of the selected arrow / guide line
    const { p1, p2 } = getArrowCurveControlPoints(arr);
    const mid = getCubicBezierPoint(0.5, { x: arr.x1, y: arr.y1 }, p1, p2, { x: arr.x2, y: arr.y2 });
    const screenPos = getScreenCoords(mid.x, mid.y);
    posX = screenPos.x;
    posY = screenPos.y - 32;

    if (elControls) elControls.classList.add("hidden");
    if (arrowControls) arrowControls.classList.remove("hidden");
    updateArrowPersistentButtonState(arr);
  } else {
    popup.classList.add("hidden");
    return;
  }

  // Ensure popup stays fully within screen viewport bounds (no left/right/top cutoff on mobile)
  const popupWidth = popup.offsetWidth || 220;
  const halfW = popupWidth / 2;
  const padding = 10;
  const clampedX = Math.max(halfW + padding, Math.min(window.innerWidth - halfW - padding, posX));
  const clampedY = Math.max(50, posY);

  popup.style.left = `${clampedX}px`;
  popup.style.top = `${clampedY}px`;
  popup.classList.remove("hidden");
  updateFocusButtonState();
}

function updateArrowPersistentButtonState(arr) {
  const btn = document.getElementById("actionPopupPersistentBtn");
  const label = document.getElementById("actionPopupPersistentLabel");
  const resetCurveBtn = document.getElementById("actionPopupArrowResetCurveBtn");

  if (resetCurveBtn) {
    const hasCurve = (arr.cp1_dx !== undefined && arr.cp1_dx !== 0) ||
                     (arr.cp1_dy !== undefined && arr.cp1_dy !== 0) ||
                     (arr.cp2_dx !== undefined && arr.cp2_dx !== 0) ||
                     (arr.cp2_dy !== undefined && arr.cp2_dy !== 0);
    if (hasCurve) {
      resetCurveBtn.classList.remove("hidden");
    } else {
      resetCurveBtn.classList.add("hidden");
    }
  }

  if (!btn || !label || !arr) return;

  if (arr.persistent) {
    btn.className = "h-8 px-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white active:scale-90 flex items-center gap-1 text-[11px] font-bold transition shadow-md shadow-emerald-500/30";
    label.innerText = "Alle Schritte ✓";
    btn.title = "Linie ist auf allen Schritten aktiv (Klicken, um nur in diesem Schritt zu behalten)";
  } else {
    btn.className = "h-8 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 active:scale-90 text-amber-400 flex items-center gap-1 text-[11px] font-bold transition border border-slate-700";
    label.innerText = "Dauerhaft machen";
    btn.title = "Linie über alle Schritte hinweg beibehalten";
  }
}

function resetSelectedArrowCurve() {
  const kf = currentExercise.keyframes[currentKeyframeIndex];
  if (!kf || selectedArrowIndex === null || !kf.arrows || !kf.arrows[selectedArrowIndex]) return;
  const arr = kf.arrows[selectedArrowIndex];
  delete arr.cp1_dx;
  delete arr.cp1_dy;
  delete arr.cp2_dx;
  delete arr.cp2_dy;

  if (arr.persistent && arr.id) {
    currentExercise.keyframes.forEach((otherKf, idx) => {
      if (idx !== currentKeyframeIndex && otherKf.arrows) {
        const matched = otherKf.arrows.find(it => it.id === arr.id);
        if (matched) {
          delete matched.cp1_dx;
          delete matched.cp1_dy;
          delete matched.cp2_dx;
          delete matched.cp2_dy;
        }
      }
    });
  }

  drawScene();
  updateActionPopupPosition();
  recordHistory();
}

function toggleArrowPersistent() {
  const kf = currentExercise.keyframes[currentKeyframeIndex];
  if (!kf || selectedArrowIndex === null || !kf.arrows || !kf.arrows[selectedArrowIndex]) return;

  const arr = kf.arrows[selectedArrowIndex];
  if (!arr.id) {
    arr.id = `arr_${Math.random().toString(36).substr(2, 7)}`;
  }

  const newState = !arr.persistent;
  arr.persistent = newState;

  if (newState) {
    // Copy/sync this arrow into all other keyframes with identical ID and properties
    currentExercise.keyframes.forEach((otherKf, idx) => {
      if (idx !== currentKeyframeIndex) {
        if (!otherKf.arrows) otherKf.arrows = [];
        const existingIdx = otherKf.arrows.findIndex(it => it.id === arr.id);
        const clone = JSON.parse(JSON.stringify(arr));
        if (existingIdx >= 0) {
          otherKf.arrows[existingIdx] = clone;
        } else {
          otherKf.arrows.push(clone);
        }
      }
    });
  } else {
    // Remove persistent flag; keep it only in the current step and remove from other steps
    currentExercise.keyframes.forEach((otherKf, idx) => {
      if (idx !== currentKeyframeIndex && otherKf.arrows) {
        otherKf.arrows = otherKf.arrows.filter(it => it.id !== arr.id);
      }
    });
  }

  updateArrowPersistentButtonState(arr);
  drawScene();
  recordHistory();
}

function rotateSelectedElement(deltaDeg = 45) {
  const kf = currentExercise.keyframes[currentKeyframeIndex];
  if (!kf) return;

  if (selectedElementIds.length > 0) {
    // Rotate all elements in group around their collective center
    const elements = kf.elements.filter(it => selectedElementIds.includes(it.id));
    if (elements.length > 0) {
      let avgX = 0, avgY = 0;
      elements.forEach(it => { avgX += it.x; avgY += it.y; });
      avgX /= elements.length;
      avgY /= elements.length;

      const rad = (deltaDeg * Math.PI) / 180;
      const cosA = Math.cos(rad);
      const sinA = Math.sin(rad);

      elements.forEach(el => {
        // Rotate position around center
        const dx = el.x - avgX;
        const dy = el.y - avgY;
        el.x = Math.max(20, Math.min(VIRTUAL_WIDTH - 20, Math.round(avgX + dx * cosA - dy * sinA)));
        el.y = Math.max(20, Math.min(VIRTUAL_HEIGHT - 20, Math.round(avgY + dx * sinA + dy * cosA)));
        // Rotate element self orientation
        el.rotation = ((el.rotation || 0) + deltaDeg) % 360;
        if (el.rotation < 0) el.rotation += 360;

        // Synchronize equipment across all other keyframes
        if (isEquipment(el.type)) {
          currentExercise.keyframes.forEach((otherKf, idx) => {
            if (idx !== currentKeyframeIndex) {
              const matched = otherKf.elements.find(it => it.id === el.id);
              if (matched) {
                matched.x = el.x;
                matched.y = el.y;
                matched.rotation = el.rotation;
              }
            }
          });
        }
      });
      drawScene();
      updateActionPopupPosition();
      recordHistory();
      return;
    }
  }

  if (!selectedElementId) return;
  const el = kf.elements.find(it => it.id === selectedElementId);
  if (!el) return;

  el.rotation = ((el.rotation || 0) + deltaDeg) % 360;
  if (el.rotation < 0) el.rotation += 360;

  // Synchronize equipment across all other keyframes
  if (isEquipment(el.type)) {
    currentExercise.keyframes.forEach((otherKf, idx) => {
      if (idx !== currentKeyframeIndex) {
        const matched = otherKf.elements.find(it => it.id === el.id);
        if (matched) {
          matched.x = el.x;
          matched.y = el.y;
          matched.rotation = el.rotation;
        }
      }
    });
  }

  drawScene();
  updateActionPopupPosition();
  recordHistory();
}

function getForwardOffset(distance = 45) {
  // Screen "forward" (nach oben auf dem Bildschirm):
  // Auf dem Bildschirm ist "oben" delta_screen = (0, -distance).
  // Wir transformieren diesen Bildschirm-Vektor zurück in das virtuelle Koordinatensystem (vx, vy):
  // 1. Zoom/Pan betrifft die Vektor-Richtung nicht.
  // 2. Das Bild ist um fieldRotation gedreht, die Umkehrung ist -fieldRotation:
  //    vx = 0 * cos(-R) - (-distance) * sin(-R) = distance * sin(-R) = -distance * sin(R)
  //    vy = 0 * sin(-R) + (-distance) * cos(-R) = -distance * cos(-R) = -distance * cos(R)
  const rad = (fieldRotation * Math.PI) / 180;
  let dx = -distance * Math.sin(rad);
  let dy = -distance * Math.cos(rad);

  return { dx: Math.round(dx), dy: Math.round(dy) };
}

function duplicateSelectedElement() {
  const kf = currentExercise.keyframes[currentKeyframeIndex];
  if (!kf) return;

  const offset = getForwardOffset(45);

  if (selectedElementIds.length > 0) {
    // Duplicate all elements in group together
    const newGroupIds = [];
    const elementsToClone = kf.elements.filter(it => selectedElementIds.includes(it.id));
    elementsToClone.forEach(el => {
      const newId = `${el.type}_${Math.random().toString(36).substr(2, 6)}`;
      const clone = JSON.parse(JSON.stringify(el));
      clone.id = newId;
      clone.x = Math.max(30, Math.min(970, (clone.x || 500) + offset.dx));
      clone.y = Math.max(30, Math.min(670, (clone.y || 350) + offset.dy));

      if (clone.type === "player") {
        const existingNums = kf.elements
          .filter(e => e.type === "player" && e.team === clone.team && e.number)
          .map(e => parseInt(e.number))
          .filter(n => !isNaN(n));
        const nextNum = existingNums.length > 0 ? Math.max(...existingNums) + 1 : 1;
        clone.number = String(nextNum);
      }

      kf.elements.push(clone);
      newGroupIds.push(newId);

      // If it's stationary equipment, clone it into ALL other keyframes with identical ID and coordinates!
      if (isEquipment(clone.type)) {
        currentExercise.keyframes.forEach((otherKf, idx) => {
          if (idx !== currentKeyframeIndex) {
            const exists = otherKf.elements.some(it => it.id === newId);
            if (!exists) {
              otherKf.elements.push(JSON.parse(JSON.stringify(clone)));
            }
          }
        });
      }
    });

    selectedElementIds = newGroupIds;
    selectedElementId = null;
    showGroupInspector(newGroupIds.length);
    drawScene();
    updateActionPopupPosition();
    recordHistory();
    return;
  }

  if (!selectedElementId) return;
  const el = kf.elements.find(it => it.id === selectedElementId);
  if (!el) return;

  const newId = `${el.type}_${Math.random().toString(36).substr(2, 6)}`;
  const clone = JSON.parse(JSON.stringify(el));
  clone.id = newId;

  // Offset position directly forward on screen (nach oben / vorne je nach Spielfelddrehung)
  clone.x = Math.max(30, Math.min(970, (clone.x || 500) + offset.dx));
  clone.y = Math.max(30, Math.min(670, (clone.y || 350) + offset.dy));

  // If cloning a player, assign next available number
  if (clone.type === "player") {
    const existingNums = kf.elements
      .filter(e => e.type === "player" && e.team === clone.team && e.number)
      .map(e => parseInt(e.number))
      .filter(n => !isNaN(n));
    const nextNum = existingNums.length > 0 ? Math.max(...existingNums) + 1 : 1;
    clone.number = String(nextNum);
  }

  kf.elements.push(clone);
  selectedElementId = newId;
  selectedElementIds = [];

  // If it's stationary equipment, clone it into ALL other keyframes with identical ID and coordinates!
  if (isEquipment(clone.type)) {
    currentExercise.keyframes.forEach((otherKf, idx) => {
      if (idx !== currentKeyframeIndex) {
        const exists = otherKf.elements.some(it => it.id === newId);
        if (!exists) {
          otherKf.elements.push(JSON.parse(JSON.stringify(clone)));
        }
      }
    });
  }

  showInspector(clone);
  drawScene();
  updateActionPopupPosition();
  recordHistory();
  return;
  }

  // Duplicate selected arrow/guide line
  if (selectedArrowIndex !== null && kf.arrows && kf.arrows[selectedArrowIndex]) {
  const arr = kf.arrows[selectedArrowIndex];
  const clone = JSON.parse(JSON.stringify(arr));
  clone.id = `arr_${Math.random().toString(36).substr(2, 7)}`;
  // Offset slightly forward / down
  clone.x1 = Math.max(10, Math.min(VIRTUAL_WIDTH - 10, clone.x1 + offset.dx));
  clone.y1 = Math.max(10, Math.min(VIRTUAL_HEIGHT - 10, clone.y1 + offset.dy));
  clone.x2 = Math.max(10, Math.min(VIRTUAL_WIDTH - 10, clone.x2 + offset.dx));
  clone.y2 = Math.max(10, Math.min(VIRTUAL_HEIGHT - 10, clone.y2 + offset.dy));

  kf.arrows.push(clone);
  selectedArrowIndex = kf.arrows.length - 1;
  selectedArrowPart = "body";

  // If original was persistent, also add duplicate across all keyframes
  if (clone.persistent) {
    currentExercise.keyframes.forEach((otherKf, idx) => {
      if (idx !== currentKeyframeIndex) {
        if (!otherKf.arrows) otherKf.arrows = [];
        otherKf.arrows.push(JSON.parse(JSON.stringify(clone)));
      }
    });
  }

  showArrowInspector(clone);
  drawScene();
  updateActionPopupPosition();
  recordHistory();
}

function showGroupInspector(count) {
  const bar = document.getElementById("floatingElementBar");
  const nameLabel = document.getElementById("floatingElementName");
  const numInput = document.getElementById("floatingPropNumber");
  const nameInput = document.getElementById("floatingPropName");
  if (!bar) return;
  if (!isMovingElement) bar.classList.remove("hidden"); else bar.classList.add("hidden");
  nameLabel.textContent = `Gruppe (${count} Objekte)`;
  numInput.classList.add("hidden");
  nameInput.classList.add("hidden");
}

function showInspector(el) {
  const bar = document.getElementById("floatingElementBar");
  const nameLabel = document.getElementById("floatingElementName");
  const numInput = document.getElementById("floatingPropNumber");
  const nameInput = document.getElementById("floatingPropName");
  if (!bar) return;
  if (!isMovingElement) bar.classList.remove("hidden"); else bar.classList.add("hidden");
  if (el.type === "player") {
    nameLabel.textContent = (el.team === "blue" ? "Blau" : el.team === "red" ? "Rot" : "Joker");
    numInput.classList.remove("hidden");
    nameInput.classList.remove("hidden");
    numInput.value = el.number || "";
    nameInput.value = el.name || "";
  } else {
    nameLabel.textContent = el.type === "ball" ? "Ball" : el.type === "cone" ? "Hütchen" : el.type === "minigoal" ? "Minitor" : el.type === "goal_5m" ? "5m Tor (E-Jugend)" : el.type === "pole" ? "Stange" : el.type === "ladder" ? "Leiter" : el.type === "dummy" ? "Dummy" : el.type === "ring" ? "Ring" : el.type === "hurdle" ? "Hürde" : "Objekt";
    numInput.classList.add("hidden");
    nameInput.classList.add("hidden");
  }
}

function showArrowInspector(arr) {
  const bar = document.getElementById("floatingElementBar");
  const nameLabel = document.getElementById("floatingElementName");
  const numInput = document.getElementById("floatingPropNumber");
  const nameInput = document.getElementById("floatingPropName");
  if (!bar) return;
  if (!isMovingElement) bar.classList.remove("hidden"); else bar.classList.add("hidden");
  nameLabel.textContent = arr.type === "pass" ? "Passweg" : (arr.type === "guide" ? "Hilfslinie" : "Laufweg");
  numInput.classList.add("hidden");
  nameInput.classList.add("hidden");
}

function hideInspector() {
  const bar = document.getElementById("floatingElementBar");
  if (bar) bar.classList.add("hidden");
  const popup = document.getElementById("elementActionPopup");
  if (popup) popup.classList.add("hidden");
}

function deselectElement() {
  selectedElementId = null;
  selectedElementIds = [];
  selectedArrowIndex = null;
  selectedArrowPart = null;
  hideInspector();
  updateActionPopupPosition();
  drawScene();
}

function syncFloatingProps() {
  if (!selectedElementId) return;
  const kf = currentExercise.keyframes[currentKeyframeIndex];
  const el = kf.elements.find(it => it.id === selectedElementId);
  if (el && el.type === "player") {
    el.number = document.getElementById("floatingPropNumber").value;
    el.name = document.getElementById("floatingPropName").value;
    drawScene();
    recordHistory();
  }
}

// Modal Details helpers
function openDetailsModal() {
  document.getElementById("detailsModal").classList.remove("hidden");
}

function closeDetailsModal() {
  const getVal = (id) => {
    const el = document.getElementById(id);
    return el ? el.value : "";
  };
  const mTitle = getVal("modalExTitle");
  if (mTitle) document.getElementById("exTitle").value = mTitle;
  const mAge = getVal("modalExAgeGroup");
  if (mAge) document.getElementById("exAgeGroup").value = mAge;
  const mFocus = getVal("modalExFocus");
  if (mFocus) document.getElementById("exFocus").value = mFocus;
  const mPl = getVal("modalExPlayers");
  if (mPl) document.getElementById("exPlayers").value = mPl;
  const mDim = getVal("modalExDimensions");
  if (mDim) document.getElementById("exDimensions").value = mDim;
  const mDesc = getVal("modalExDescription");
  if (mDesc) document.getElementById("exDescription").value = mDesc;
  const mCoach = getVal("modalExCoaching");
  if (mCoach) document.getElementById("exCoaching").value = mCoach;

  syncFormToState();
  document.getElementById("detailsModal").classList.add("hidden");
}

function deleteSelectedElement() {
  const kf = currentExercise.keyframes[currentKeyframeIndex];
  if (!kf) return;

  if (selectedElementIds.length > 0) {
    const idsToDelete = [...selectedElementIds];
    kf.elements = kf.elements.filter(it => !idsToDelete.includes(it.id));

    // Delete stationary equipment across ALL keyframes
    currentExercise.keyframes.forEach((otherKf, idx) => {
      if (idx !== currentKeyframeIndex) {
        otherKf.elements = otherKf.elements.filter(it => !(idsToDelete.includes(it.id) && isEquipment(it.type)));
      }
    });

    selectedElementIds = [];
    selectedElementId = null;
    hideInspector();
    updateActionPopupPosition();
    drawScene();
    recordHistory();
    return;
  }

  if (selectedElementId) {
    const idToDelete = selectedElementId;
    const elToDelete = kf.elements.find(it => it.id === idToDelete);
    const wasEquipment = elToDelete ? isEquipment(elToDelete.type) : false;

    kf.elements = kf.elements.filter(it => it.id !== idToDelete);

    if (wasEquipment) {
      currentExercise.keyframes.forEach((otherKf, idx) => {
        if (idx !== currentKeyframeIndex) {
          otherKf.elements = otherKf.elements.filter(it => it.id !== idToDelete);
        }
      });
    }

    selectedElementId = null;
    hideInspector();
    updateActionPopupPosition();
    drawScene();
    recordHistory();
  } else if (selectedArrowIndex !== null && kf.arrows) {
    const arrToDelete = kf.arrows[selectedArrowIndex];
    const isPersist = arrToDelete ? arrToDelete.persistent : false;
    const arrId = arrToDelete ? arrToDelete.id : null;

    kf.arrows.splice(selectedArrowIndex, 1);

    // If persistent, also remove from all other keyframes
    if (isPersist && arrId) {
      currentExercise.keyframes.forEach((otherKf, idx) => {
        if (idx !== currentKeyframeIndex && otherKf.arrows) {
          otherKf.arrows = otherKf.arrows.filter(it => it.id !== arrId);
        }
      });
    }

    selectedArrowIndex = null;
    selectedArrowPart = null;
    hideInspector();
    updateActionPopupPosition();
    drawScene();
    recordHistory();
  }
}

function spawnElement(type, options = {}) {
  const kf = currentExercise.keyframes[currentKeyframeIndex];
  const id = `${type}_${Math.random().toString(36).substr(2, 6)}`;
  
  // Wenn bereits ein Element ausgewählt ist, platziere das neue direkt davor
  let spawnX = 500;
  let spawnY = 350;
  if (selectedElementId) {
    const prevEl = kf.elements.find(it => it.id === selectedElementId);
    if (prevEl) {
      const offset = getForwardOffset(45);
      spawnX = Math.max(30, Math.min(970, (prevEl.x || 500) + offset.dx));
      spawnY = Math.max(30, Math.min(670, (prevEl.y || 350) + offset.dy));
    }
  }

  const newEl = {
    id,
    type,
    x: spawnX,
    y: spawnY,
    ...options
  };
  if (type === "player" && !newEl.number) {
    const existingNums = kf.elements
      .filter(e => e.type === "player" && e.team === newEl.team && e.number)
      .map(e => parseInt(e.number))
      .filter(n => !isNaN(n));
    const nextNum = existingNums.length > 0 ? Math.max(...existingNums) + 1 : 1;
    newEl.number = String(nextNum);
  }
  kf.elements.push(newEl);
  selectedElementId = id;

  // Stationary Training Equipment propagates to ALL keyframes in the exercise!
  if (isEquipment(type)) {
    currentExercise.keyframes.forEach((otherKf, idx) => {
      if (idx !== currentKeyframeIndex) {
        const exists = otherKf.elements.some(it => it.id === id);
        if (!exists) {
          otherKf.elements.push(JSON.parse(JSON.stringify(newEl)));
        }
      }
    });
  }

  showInspector(newEl);
  drawScene();
  updateActionPopupPosition();
  recordHistory();

  // Mobile HUD Feedback for spawned elements
  if (type === "player") {
    const teamName = options.team === "blue" ? "Blauer Spieler" : (options.team === "red" ? "Roter Spieler" : "Joker (Gelb)");
    const badgeColor = options.team === "blue" ? "bg-blue-600 text-white" : (options.team === "red" ? "bg-red-600 text-white" : "bg-yellow-400 text-black");
    const num = newEl.number || "";
    showMobileSelectionHUD(teamName, `Nummer ${num} platziert`, `<div class="w-8 h-8 rounded-full ${badgeColor} border-2 border-white flex items-center justify-center font-bold text-sm shadow-lg">${num || 'P'}</div>`);
  } else if (type === "ball") {
    showMobileSelectionHUD("Fußball", "Ball auf dem Spielfeld platziert", `<span class="text-3xl leading-none">⚽</span>`);
  } else if (isEquipment(type)) {
    const equipNames = {
      minigoal: "Minitor",
      goal_5m: "5m Jugendtor",
      cone: "Hütchen",
      pole: "Slalomstange",
      ladder: "Koordinationsleiter",
      dummy: "Freistoß-Dummy",
      ring: "Reifen / Ring",
      hurdle: "Minifußball-Hürde"
    };
    const equipIcons = {
      minigoal: '<i class="fa-solid fa-bullseye text-white text-2xl"></i>',
      goal_5m: '<i class="fa-solid fa-border-all text-emerald-400 text-2xl"></i>',
      cone: '<i class="fa-solid fa-shapes text-orange-500 text-2xl"></i>',
      pole: '<i class="fa-solid fa-grip-lines-vertical text-yellow-400 text-2xl"></i>',
      ladder: '<i class="fa-solid fa-bars text-yellow-300 text-2xl"></i>',
      dummy: '<i class="fa-solid fa-person-shelter text-yellow-400 text-2xl"></i>',
      ring: '<i class="fa-regular fa-circle-dot text-cyan-400 text-2xl"></i>',
      hurdle: '<i class="fa-solid fa-square-minus text-orange-400 text-2xl"></i>'
    };
    showMobileSelectionHUD(equipNames[type] || "Material", "Trainingsgerät hinzugefügt", equipIcons[type] || '<i class="fa-solid fa-shapes text-amber-400 text-2xl"></i>');
  }
}

function setActiveTool(tool) {
  activeTool = tool;
  ["toolSelectBtn", "toolPassBtn", "toolRunBtn", "toolGuideBtn"].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) {
      btn.className = "px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center gap-1 border border-slate-700 transition text-[11px] font-medium";
    }
  });

  const activeBtnId = (tool === "select") ? "toolSelectBtn" : (tool === "pass" ? "toolPassBtn" : (tool === "run" ? "toolRunBtn" : "toolGuideBtn"));
  const activeBtn = document.getElementById(activeBtnId);
  if (activeBtn) {
    if (tool === "guide") {
      activeBtn.className = "px-2 py-1 rounded-md bg-amber-600 text-white flex items-center gap-1 border border-amber-400 transition text-[11px] font-semibold shadow-lg ring-1 ring-amber-300";
    } else {
      activeBtn.className = "px-2 py-1 rounded-md bg-emerald-600 text-white flex items-center gap-1 border border-emerald-500 transition text-[11px] font-semibold";
    }
  }

  // Mobile HUD Feedback
  if (tool === "select") {
    showMobileSelectionHUD("Verschieben", "Elemente berühren & bewegen", '<i class="fa-solid fa-hand text-emerald-400"></i>');
  } else if (tool === "pass") {
    showMobileSelectionHUD("Passweg", "Gepunktete Linie ziehen", '<i class="fa-solid fa-ellipsis text-yellow-400"></i>');
  } else if (tool === "run") {
    showMobileSelectionHUD("Laufweg", "Lauf- oder Dribbelspur ziehen", '<i class="fa-solid fa-arrow-right text-cyan-400"></i>');
  } else if (tool === "guide") {
    showMobileSelectionHUD("Hilfslinie", "Begrenzung / Zonenlinie ziehen", '<i class="fa-solid fa-border-none text-amber-400"></i>');
  }
}

function changePitchType(type) {
  currentExercise.pitch_type = type;
  drawScene();
  recordHistory();
}

function clearCurrentCanvas() {
  openClearConfirmModal();
}

let clearConfirmResolve = null;
function openClearConfirmModal() {
  const modal = document.getElementById("clearConfirmModal");
  if (!modal) {
    if (confirm("Möchtest du alle Elemente und Wege aus diesem Schritt entfernen?")) {
      executeClearCurrentCanvas();
    }
    return;
  }
  modal.classList.remove("hidden");
}

function closeClearConfirmModal(proceed = false) {
  const modal = document.getElementById("clearConfirmModal");
  if (modal) modal.classList.add("hidden");
  if (proceed) {
    executeClearCurrentCanvas();
  }
}

function executeClearCurrentCanvas() {
  const kf = currentExercise.keyframes[currentKeyframeIndex];
  if (!kf) return;
  // Remove arrows and dynamic elements (players/balls) from current step
  kf.arrows = [];
  kf.elements = kf.elements.filter(el => isEquipment(el.type)); // Keep equipment structure!
  selectedElementId = null;
  selectedElementIds = [];
  hideInspector();
  drawScene();
  recordHistory();
  saveLocalDraft();
  showToast("🧹 Schritt geleert!");
}

// Keyframes Management
let draggedKfIndex = null;

function renderKeyframeTabs() {
  const list = document.getElementById("keyframesList");
  if (!list) return;
  list.innerHTML = "";

  currentExercise.keyframes.forEach((kf, idx) => {
    const container = document.createElement("div");
    const isActive = idx === currentKeyframeIndex;
    container.draggable = true;
    container.className = `rounded-lg text-xs font-semibold whitespace-nowrap transition flex items-center gap-1 px-1.5 py-0.5 cursor-grab active:cursor-grabbing ${
      isActive
        ? "bg-emerald-600 text-white shadow ring-1 ring-emerald-400"
        : "bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
    }`;

    // Drag and Drop events to reorder steps
    container.ondragstart = (e) => {
      draggedKfIndex = idx;
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", idx);
      container.classList.add("opacity-50");
    };

    container.ondragend = () => {
      draggedKfIndex = null;
      container.classList.remove("opacity-50");
    };

    container.ondragover = (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      container.classList.add("ring-2", "ring-cyan-400");
    };

    container.ondragleave = () => {
      container.classList.remove("ring-2", "ring-cyan-400");
    };

    container.ondrop = (e) => {
      e.preventDefault();
      container.classList.remove("ring-2", "ring-cyan-400");
      if (draggedKfIndex !== null && draggedKfIndex !== idx) {
        moveKeyframeToIndex(draggedKfIndex, idx);
      }
    };

    // Move Left Button
    if (idx > 0) {
      const moveLeftBtn = document.createElement("button");
      moveLeftBtn.className = "text-[9px] px-0.5 text-slate-400 hover:text-white transition";
      moveLeftBtn.title = "Schritt nach links verschieben";
      moveLeftBtn.innerHTML = `<i class="fa-solid fa-chevron-left"></i>`;
      moveLeftBtn.onclick = (e) => {
        e.stopPropagation();
        moveKeyframeToIndex(idx, idx - 1);
      };
      container.appendChild(moveLeftBtn);
    }

    // Clickable Tab Button (Double click to rename as well)
    const btn = document.createElement("button");
    btn.className = "flex items-center gap-1 outline-none py-0.5";
    btn.innerHTML = `<span class="max-w-[105px] truncate" title="${kf.title || 'Schritt ' + (idx + 1)}">${kf.title || "Schritt " + (idx + 1)}</span>`;
    btn.onclick = () => selectKeyframe(idx);
    btn.ondblclick = (e) => {
      e.stopPropagation();
      editKeyframeTitle(idx);
    };
    container.appendChild(btn);

    // Edit Title Button (Pen Icon)
    const editBtn = document.createElement("button");
    editBtn.className = `p-0.5 rounded hover:bg-black/20 ${isActive ? "text-emerald-100 hover:text-white" : "text-slate-400 hover:text-slate-200"}`;
    editBtn.title = "Schrittname umbenennen";
    editBtn.innerHTML = `<i class="fa-solid fa-pen text-[9px]"></i>`;
    editBtn.onclick = (e) => {
      e.stopPropagation();
      editKeyframeTitle(idx);
    };
    container.appendChild(editBtn);

    // Move Right Button
    if (idx < currentExercise.keyframes.length - 1) {
      const moveRightBtn = document.createElement("button");
      moveRightBtn.className = "text-[9px] px-0.5 text-slate-400 hover:text-white transition";
      moveRightBtn.title = "Schritt nach rechts verschieben";
      moveRightBtn.innerHTML = `<i class="fa-solid fa-chevron-right"></i>`;
      moveRightBtn.onclick = (e) => {
        e.stopPropagation();
        moveKeyframeToIndex(idx, idx + 1);
      };
      container.appendChild(moveRightBtn);
    }

    list.appendChild(container);
  });
}

function moveKeyframeToIndex(fromIdx, toIdx) {
  if (fromIdx === toIdx || fromIdx < 0 || toIdx < 0) return;
  const kfList = currentExercise.keyframes;
  if (fromIdx >= kfList.length || toIdx >= kfList.length) return;

  const [movedItem] = kfList.splice(fromIdx, 1);
  kfList.splice(toIdx, 0, movedItem);

  if (currentKeyframeIndex === fromIdx) {
    currentKeyframeIndex = toIdx;
  } else if (fromIdx < currentKeyframeIndex && toIdx >= currentKeyframeIndex) {
    currentKeyframeIndex--;
  } else if (fromIdx > currentKeyframeIndex && toIdx <= currentKeyframeIndex) {
    currentKeyframeIndex++;
  }

  renderKeyframeTabs();
  drawScene();
  recordHistory();
}

function insertKeyframeAfterCurrent() {
  const curr = currentExercise.keyframes[currentKeyframeIndex];
  const nextKf = currentExercise.keyframes[currentKeyframeIndex + 1];

  const copy = JSON.parse(JSON.stringify(curr));
  copy.title = `Schritt ${currentKeyframeIndex + 2} (Zwischenschritt)`;

  // If there's a next keyframe, place elements halfway between current and next for a smooth intermediate step
  if (nextKf && nextKf.elements) {
    const nextMap = new Map(nextKf.elements.map(e => [e.id, e]));
    copy.elements.forEach(el => {
      const target = nextMap.get(el.id);
      if (target) {
        el.x = Math.round(el.x + (target.x - el.x) * 0.5);
        el.y = Math.round(el.y + (target.y - el.y) * 0.5);
      }
      delete el.cp1_dx;
      delete el.cp1_dy;
      delete el.cp2_dx;
      delete el.cp2_dy;
      delete el.jump;
    });
  } else if (copy.elements) {
    copy.elements.forEach(el => {
      delete el.cp1_dx;
      delete el.cp1_dy;
      delete el.cp2_dx;
      delete el.cp2_dy;
      delete el.jump;
    });
  }

  // Preserve persistent arrows
  copy.arrows = (curr.arrows || []).filter(a => a.persistent).map(a => JSON.parse(JSON.stringify(a)));

  // Insert directly behind current keyframe
  currentExercise.keyframes.splice(currentKeyframeIndex + 1, 0, copy);
  currentKeyframeIndex = currentKeyframeIndex + 1;
  renderKeyframeTabs();
  drawScene();
  recordHistory();
}

function editKeyframeTitle(idx) {
  const kf = currentExercise.keyframes[idx];
  const currentTitle = kf.title || `Schritt ${idx + 1}`;
  const newTitle = prompt("Name für diesen Schritt eingeben:", currentTitle);
  if (newTitle !== null) {
    const trimmed = newTitle.trim();
    kf.title = trimmed || `Schritt ${idx + 1}`;
    renderKeyframeTabs();
    drawScene();
    recordHistory();
  }
}

function selectKeyframe(idx) {
  if (isPlaying) stopAnimation();
  currentKeyframeIndex = idx;
  selectedElementId = null;
  hideInspector();
  renderKeyframeTabs();
  drawScene();
}

function duplicateKeyframe() {
  const curr = currentExercise.keyframes[currentKeyframeIndex];
  const copy = JSON.parse(JSON.stringify(curr));
  copy.title = `Schritt ${currentExercise.keyframes.length + 1}`;
  // Reset any curve offsets or jump flags on elements so subsequent steps start with a straight normal trajectory
  if (copy.elements) {
    copy.elements.forEach(el => {
      delete el.cp1_dx;
      delete el.cp1_dy;
      delete el.cp2_dx;
      delete el.cp2_dy;
      delete el.jump;
    });
  }
  // Keep persistent arrows/guidelines for the next phase, only clear temporary phase arrows
  copy.arrows = (curr.arrows || []).filter(a => a.persistent).map(a => JSON.parse(JSON.stringify(a)));
  currentExercise.keyframes.push(copy);
  currentKeyframeIndex = currentExercise.keyframes.length - 1;
  renderKeyframeTabs();
  drawScene();
  recordHistory();
}

function deleteCurrentKeyframe() {
  if (currentExercise.keyframes.length <= 1) {
    alert("Die Übung muss mindestens einen Schritt enthalten.");
    return;
  }
  currentExercise.keyframes.splice(currentKeyframeIndex, 1);
  if (currentKeyframeIndex >= currentExercise.keyframes.length) {
    currentKeyframeIndex = currentExercise.keyframes.length - 1;
  }
  renderKeyframeTabs();
  drawScene();
  recordHistory();
}

// Live Animation Playback
function togglePlayAnimation() {
  if (isPlaying) {
    stopAnimation();
  } else {
    startAnimation();
  }
}

function toggleGhostLayer() {
  if (isGhostMode === "off") {
    isGhostMode = "prev";
  } else if (isGhostMode === "prev") {
    isGhostMode = "all";
  } else {
    isGhostMode = "off";
  }

  const btn = document.getElementById("ghostToggleBtn");
  const label = document.getElementById("ghostToggleLabel");
  const icon = document.getElementById("ghostToggleIcon");

  if (btn && label && icon) {
    if (isGhostMode === "prev") {
      btn.className = "px-1.5 py-1 bg-cyan-950/70 hover:bg-cyan-900/70 active:scale-95 text-cyan-300 font-bold text-[11px] rounded-md border border-cyan-500/60 shadow transition flex items-center gap-1";
      icon.className = "fa-solid fa-ghost text-[10px] text-cyan-400";
      label.innerText = "Ghost: 1";
      btn.title = "Ghost: Nur vorheriger Schritt sichtbar (Klicken für Alle vorherigen Schritte)";
    } else if (isGhostMode === "all") {
      btn.className = "px-1.5 py-1 bg-purple-950/80 hover:bg-purple-900/80 active:scale-95 text-purple-200 font-bold text-[11px] rounded-md border border-purple-500/70 shadow-lg shadow-purple-900/30 transition flex items-center gap-1";
      icon.className = "fa-solid fa-layer-group text-[10px] text-purple-300";
      label.innerText = "Ghost: Alle";
      btn.title = "Ghost: Alle vorherigen Schritte als Gesamtweg sichtbar (Klicken zum Deaktivieren)";
    } else {
      btn.className = "px-1.5 py-1 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-400 font-bold text-[11px] rounded-md border border-slate-700 transition flex items-center gap-1";
      icon.className = "fa-solid fa-ghost text-[10px]";
      label.innerText = "Ghost";
      btn.title = "Vorherige Schritte als transparente Geister einblenden (Aus -> 1 Schritt -> Alle Schritte)";
    }
  }
  drawScene();
}

function toggleLoopMode() {
  isLoopMode = !isLoopMode;
  const btn = document.getElementById("loopToggleBtn");
  const label = document.getElementById("loopToggleLabel");
  const icon = document.getElementById("loopToggleIcon");

  if (!btn || !label || !icon) return;

  if (isLoopMode) {
    btn.className = "px-1.5 py-1 bg-emerald-950/60 hover:bg-emerald-900/60 active:scale-95 text-emerald-400 font-bold text-[11px] rounded-md border border-emerald-600/60 transition flex items-center gap-1";
    label.innerText = "Loop";
    icon.className = "fa-solid fa-repeat text-[10px]";
    btn.title = "Endlos-Schleife aktiv (Klicken für 1x Abspielen)";
  } else {
    btn.className = "px-1.5 py-1 bg-slate-800 hover:bg-slate-700 active:scale-95 text-amber-300 font-bold text-[11px] rounded-md border border-slate-700 transition flex items-center gap-1";
    label.innerText = "1x";
    icon.className = "fa-solid fa-arrow-right-to-bracket text-[10px]";
    btn.title = "1x Abspielen aktiv (Stoppt nach dem letzten Schritt)";
  }
}

function startAnimation() {
  if (!currentExercise || !Array.isArray(currentExercise.keyframes) || currentExercise.keyframes.length < 2) {
    alert("Füge mindestens 2 Schritte hinzu, um eine Animation abzuspielen.");
    return;
  }

  // Falls vorher noch ein alter Loop oder Rest-State aktiv war, erst sauber beenden
  if (isPlaying || animReqId) {
    stopAnimation();
  }

  // Alle Kontext-Menüs, Auswahlen und Overlays sofort sauber schließen/ausblenden
  selectedElementId = null;
  selectedElementIds = [];
  selectedArrowIndex = null;
  selectedArrowPart = null;
  hideInspector();
  updateActionPopupPosition();

  // Auch evtl. offene Drawer / Popover im Header schließen
  const viewControlsDrawer = document.getElementById("viewControlsDrawer");
  if (viewControlsDrawer) {
    viewControlsDrawer.classList.add("hidden");
    viewControlsDrawer.style.left = "";
    isViewControlsOpen = false;
  }

  isPlaying = true;
  const playIcon = document.getElementById("playIcon");
  const playText = document.getElementById("playText");
  const playingBadge = document.getElementById("playingBadge");

  if (playIcon) playIcon.className = "fa-solid fa-pause";
  if (playText) playText.innerText = "Pause";
  if (playingBadge) playingBadge.classList.remove("hidden");

  animStartTime = performance.now();

  function loop(now) {
    if (!isPlaying) return;

    const totalSteps = currentExercise && Array.isArray(currentExercise.keyframes) ? currentExercise.keyframes.length : 0;
    if (totalSteps < 2) {
      stopAnimation();
      return;
    }

    const speed = (typeof currentSpeed === "number" && currentSpeed > 0) ? currentSpeed : 1.0;
    const stepDuration = 2000 / speed;
    const rawElapsed = now - animStartTime;

    // Wenn 1x-Modus aktiv ist: Prüfen, ob der Durchlauf komplett fertig ist
    // Bei totalSteps Keyframes gibt es (totalSteps - 1) Übergänge bis zum Endzustand
    if (!isLoopMode) {
      const fullDuration = (totalSteps - 1) * stepDuration;
      if (rawElapsed >= fullDuration) {
        // Zeige den finalen Keyframe sauber an und stoppe
        selectKeyframe(totalSteps - 1);
        stopAnimation();
        return;
      }
    }

    const totalDuration = totalSteps * stepDuration;
    const elapsed = isLoopMode ? (rawElapsed % totalDuration) : rawElapsed;
    const stepIdx = Math.min(totalSteps - 1, Math.floor(elapsed / stepDuration));
    const nextStepIdx = isLoopMode ? ((stepIdx + 1) % totalSteps) : Math.min(totalSteps - 1, stepIdx + 1);
    const stepProgress = (elapsed % stepDuration) / stepDuration;

    // Interpolation (Ease-in-out)
    const smoothT = 0.5 - 0.5 * Math.cos(Math.PI * stepProgress);

    const kf1 = currentExercise.keyframes[stepIdx] || { elements: [], arrows: [] };
    const kf2 = currentExercise.keyframes[nextStepIdx] || { elements: [], arrows: [] };

    const map1 = new Map((kf1.elements || []).map(e => [e.id, e]));
    const map2 = new Map((kf2.elements || []).map(e => [e.id, e]));

    const interpolatedElements = [];
    const allIds = new Set([...map1.keys(), ...map2.keys()]);

    for (const id of allIds) {
      const el1 = map1.get(id);
      const el2 = map2.get(id);
      if (el1 && el2) {
        // If el2 has curved trajectory defined from el1:
        let posX, posY;
        if (el2.cp1_dx !== undefined || el2.cp1_dy !== undefined || el2.cp2_dx !== undefined || el2.cp2_dy !== undefined) {
          const { p1, p2 } = getEffectiveCurveControlPoints(el1, el2);
          const pt = getCubicBezierPoint(smoothT, el1, p1, p2, el2);
          posX = pt.x;
          posY = pt.y;
        } else {
          posX = el1.x + (el2.x - el1.x) * smoothT;
          posY = el1.y + (el2.y - el1.y) * smoothT;
        }

        let scaleMult = 1.0;
        if (el2.jump) {
          // Parabolic jump arc: scale up to 1.45 at t=0.5 and back down to 1.0 at t=1.0
          const jumpFactor = Math.sin(smoothT * Math.PI); // 0 -> 1 -> 0
          scaleMult = 1.0 + jumpFactor * 0.45;
        }

        interpolatedElements.push({
          ...el1,
          x: posX,
          y: posY,
          scaleMultiplier: scaleMult
        });
      } else if (el1) {
        interpolatedElements.push(el1);
      } else if (el2 && smoothT > 0.5) {
        interpolatedElements.push(el2);
      }
    }

    drawScene(interpolatedElements, kf1.arrows, null);
    if (isPlaying) {
      animReqId = requestAnimationFrame(loop);
    }
  }

  animReqId = requestAnimationFrame(loop);
}

function stopAnimation() {
  isPlaying = false;
  if (animReqId) {
    cancelAnimationFrame(animReqId);
    animReqId = null;
  }
  const playIcon = document.getElementById("playIcon");
  const playText = document.getElementById("playText");
  const playingBadge = document.getElementById("playingBadge");

  if (playIcon) playIcon.className = "fa-solid fa-play";
  if (playText) playText.innerText = "Play";
  if (playingBadge) playingBadge.classList.add("hidden");
  drawScene();
}

// Exercise Storage & API
async function saveCurrentExercise() {
  syncFormToState();
  try {
    const res = await fetch("/api/exercises", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...currentExercise,
        render_video_async: true
      })
    });
    const data = await res.json();
    if (data.status === "ok") {
      currentExercise.id = data.id;
      saveLocalDraft();
      updateUrlForExercise(data.id);
      showToast("✅ Übung erfolgreich gespeichert!");
      refreshExerciseBadge();
    }
  } catch (err) {
    showToast("Fehler beim Speichern: " + err.message, true);
  }
}

async function refreshExerciseBadge() {
  try {
    const res = await fetch("/api/exercises");
    const list = await res.json();
    document.getElementById("exerciseCountBadge").innerText = list.length;
  } catch (e) {}
}

function createNewExercise() {
  if (confirm("Neue leere Übung anlegen? Nicht gespeicherte Änderungen gehen verloren.")) {
    if (isPlaying) {
      stopAnimation();
    }
    currentExercise = createEmptyExercise();
    currentKeyframeIndex = 0;
    selectedElementId = null;
    selectedElementIds = [];
    selectedArrowIndex = null;
    selectedArrowPart = null;
    hideInspector();
    updateActionPopupPosition();

    updateFormFields();
    renderKeyframeTabs();
    drawScene();
    resetUndoRedo();
    saveLocalDraft();
    if (window.location.pathname !== "/") {
      window.history.pushState({}, "", "/");
    }
  }
}

// Catalog Modal
function openExerciseCatalog() {
  if (window.TacticalCoach?.popovers?.openExerciseCatalog) {
    window.TacticalCoach.popovers.openExerciseCatalog();
  } else {
    document.getElementById("catalogModal").classList.remove("hidden");
  }
  loadCatalogExercises();
}

function closeCatalogModal() {
  if (window.TacticalCoach?.popovers?.closeCatalogModal) {
    window.TacticalCoach.popovers.closeCatalogModal();
  } else {
    document.getElementById("catalogModal").classList.add("hidden");
  }
}

async function loadCatalogExercises(search = "") {
  try {
    const exercises = await (window.TacticalCoach?.client?.fetchExercises ? window.TacticalCoach.client.fetchExercises(search) : fetch(search ? `/api/exercises?search=${encodeURIComponent(search)}` : "/api/exercises").then(r => r.json()));
    const container = document.getElementById("catalogList");
    container.innerHTML = "";

    if (exercises.length === 0) {
      container.innerHTML = `<div class="text-center py-8 text-xs text-slate-400">Keine Übungen gefunden.</div>`;
      return;
    }

    exercises.forEach(ex => {
      const item = document.createElement("div");
      item.className = "p-2.5 sm:p-3 bg-slate-800/90 hover:bg-slate-750 border border-slate-700/80 rounded-xl flex items-center justify-between gap-2 transition";
      item.innerHTML = `
        <div class="flex items-center gap-2.5 min-w-0 flex-1">
          <div class="w-10 h-10 shrink-0 bg-emerald-950/70 rounded-lg border border-emerald-700/60 flex items-center justify-center text-emerald-400 font-bold text-[11px] leading-tight text-center px-1">
            ${(ex.age_group || "").split(" ")[0] || "U"}
          </div>
          <div class="min-w-0 flex-1">
            <h4 class="text-xs font-bold text-white truncate" title="${ex.title}">${ex.title}</h4>
            <div class="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-slate-400 mt-0.5">
              <span class="truncate">🎯 ${ex.focus}</span>
              <span class="truncate">👥 ${ex.player_count}</span>
              <span class="truncate">📐 ${ex.dimensions}</span>
            </div>
          </div>
        </div>
        <div class="flex items-center gap-1.5 shrink-0">
          <button onclick="loadExerciseFromCatalog('${ex.id}')" class="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-xs font-semibold rounded-lg shadow transition">
            Öffnen
          </button>
          <button onclick="deleteExerciseFromCatalog('${ex.id}')" class="p-1.5 text-slate-400 hover:text-rose-400 text-xs transition" title="Löschen">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      `;
      container.appendChild(item);
    });
  } catch (err) {
    console.error(err);
  }
}

function filterCatalog() {
  const query = document.getElementById("catalogSearch").value;
  loadCatalogExercises(query);
}

async function loadExerciseFromCatalog(id, updateUrl = true) {
  try {
    // Falls gerade eine Animation läuft, vorher zwingend anhalten und säubern
    if (isPlaying) {
      stopAnimation();
    }

    const data = await (window.TacticalCoach?.client?.fetchExerciseById ? window.TacticalCoach.client.fetchExerciseById(id) : fetch(`/api/exercises/${id}`).then(r => {
      if (!r.ok) throw new Error(`Übung mit ID "${id}" wurde nicht gefunden.`);
      return r.json();
    }));
    if (!data || !data.keyframes || data.keyframes.length === 0) {
      throw new Error("Ungültiges Übungsformat empfangen.");
    }

    currentExercise = data;
    currentKeyframeIndex = 0;
    selectedElementId = null;
    selectedElementIds = [];
    selectedArrowIndex = null;
    selectedArrowPart = null;
    hideInspector();
    updateActionPopupPosition();

    updateFormFields();
    renderKeyframeTabs();
    drawScene();
    resetUndoRedo();
    closeCatalogModal();
    closeSidebarMenu();
    saveLocalDraft();

    if (updateUrl) {
      updateUrlForExercise(data.id);
    }
  } catch (err) {
    showToast("Fehler beim Laden: " + err.message, true);
    console.error("Fehler beim Laden der Übung:", err);
  }
}

async function deleteExerciseFromCatalog(id) {
  if (confirm("Übung wirklich löschen?")) {
    if (window.TacticalCoach?.client?.deleteExercise) {
      await window.TacticalCoach.client.deleteExercise(id);
    } else {
      await fetch(`/api/exercises/${id}`, { method: "DELETE" });
    }
    await loadCatalogExercises();
    refreshExerciseBadge();
  }
}

// Export Modal & Functions
let currentExportVideoUrl = null;
let currentExportSnapshotBlob = null;

function openExportModal() {
  if (isPlaying) {
    stopAnimation();
  }
  // Sync screen orientation & parameters before rendering
  syncFormToState();
  document.getElementById("exportModal").classList.remove("hidden");
  document.getElementById("videoResultBox").classList.add("hidden");
  document.getElementById("videoRenderStatus").classList.add("hidden");
  // Pre-generate snapshot
  preparePhotoSnapshot();
}

function closeExportModal() {
  const modal = document.getElementById("exportModal");
  modal.classList.add("hidden");
  // Pause video if playing
  const player = document.getElementById("exportVideoPlayer");
  if (player) {
    player.pause();
  }
}

function preparePhotoSnapshot() {
  const previewBox = document.getElementById("photoPreviewBox");
  const imgEl = document.getElementById("exportSnapshotImg");
  const dataUrl = canvas.toDataURL("image/png");
  imgEl.src = dataUrl;
  previewBox.classList.remove("hidden");

  canvas.toBlob((blob) => {
    currentExportSnapshotBlob = blob;
  }, "image/png");
}

async function triggerServerVideoRender() {
  syncFormToState();
  const statusBox = document.getElementById("videoRenderStatus");
  const resultBox = document.getElementById("videoResultBox");
  statusBox.classList.remove("hidden");
  resultBox.classList.add("hidden");

  try {
    // 1. Save state
    const saveRes = await fetch("/api/exercises", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...currentExercise, render_video_async: false })
    });
    const saveData = await saveRes.json();
    if (saveData && saveData.id) {
      currentExercise.id = saveData.id;
    }

    // 2. Trigger synchronous render via client module
    let data;
    if (window.TacticalCoach?.client?.renderExerciseVideo) {
      data = await window.TacticalCoach.client.renderExerciseVideo(currentExercise.id);
    } else {
      const res = await fetch(`/api/exercises/${encodeURIComponent(currentExercise.id)}/render?sync=true`, { method: "POST" });
      if (!res.ok) {
        const errDetail = await res.text();
        throw new Error(`Serverfehler (${res.status}): ${errDetail}`);
      }
      data = await res.json();
    }
    
    statusBox.classList.add("hidden");
    if (data.status === "ok" && data.exercise) {
      resultBox.classList.remove("hidden");
      currentExportVideoUrl = data.exercise.video_mp4;

      const player = document.getElementById("exportVideoPlayer");
      if (player) {
        player.src = `${data.exercise.video_mp4}?t=${Date.now()}`;
        player.load();
      }

      const mp4Link = document.getElementById("downloadMp4Link");
      const gifLink = document.getElementById("downloadGifLink");
      if (mp4Link) {
        mp4Link.href = data.exercise.video_mp4;
        mp4Link.download = `${(currentExercise.title || "taktik").replace(/[^a-zA-Z0-9_\u00C0-\u017F-]/g, "_")}.mp4`;
      }
      if (gifLink) {
        gifLink.href = data.exercise.video_gif;
        gifLink.download = `${(currentExercise.title || "taktik").replace(/[^a-zA-Z0-9_\u00C0-\u017F-]/g, "_")}.gif`;
      }
    } else {
      throw new Error(data.detail || "Rendering fehlgeschlagen");
    }
  } catch (e) {
    statusBox.classList.add("hidden");
    alert("Renderfehler: " + e.message);
  }
}

async function downloadBlobFile(url, filename) {
  if (!url) return;
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename || "taktik_datei";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    }, 100);
  } catch (e) {
    window.open(url, "_blank");
  }
}

// OS Share API (Web Share API for iOS / Android / Desktop)
async function shareMedia(type) {
  const title = currentExercise.title || "Fußball-Taktik";
  const text = `${title} (${currentExercise.age_group || "Jugend"}) - Erstellt mit Tactical Coach`;
  const cleanTitle = (title).replace(/[^a-zA-Z0-9_\u00C0-\u017F-]/g, "_");

  try {
    if (type === "video") {
      if (!currentExportVideoUrl) {
        alert("Bitte zuerst das Video rendern.");
        return;
      }
      
      // Fetch file to blob for native sharing
      const resp = await fetch(currentExportVideoUrl);
      const blob = await resp.blob();
      const file = new File([blob], `${cleanTitle}.mp4`, { type: "video/mp4" });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: title,
          text: text
        });
      } else if (navigator.share) {
        await navigator.share({
          title: title,
          text: text,
          url: window.location.origin + currentExportVideoUrl
        });
      } else {
        // Fallback: trigger safe blob download without leaving the app
        await downloadBlobFile(currentExportVideoUrl, `${cleanTitle}.mp4`);
      }

    } else if (type === "photo") {
      // Photo snapshot sharing
      if (!currentExportSnapshotBlob) {
        // regenerate
        await new Promise((resolve) => canvas.toBlob((b) => { currentExportSnapshotBlob = b; resolve(); }, "image/png"));
      }

      if (currentExportSnapshotBlob) {
        const file = new File([currentExportSnapshotBlob], `${cleanTitle}.png`, { type: "image/png" });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: title,
            text: text
          });
        } else if (navigator.share) {
          await navigator.share({
            title: title,
            text: text,
            url: `${window.location.origin}/exercise/${encodeURIComponent(currentExercise.id)}`
          });
        } else {
          exportCanvasPNG();
        }
      } else {
        exportCanvasPNG();
      }
    }
  } catch (err) {
    if (err.name !== "AbortError") {
      console.warn("Share abgebrochen oder nicht unterstützt:", err);
      // If user cancelled, do nothing. If actual error, offer direct link
      alert("Weiterleiten: " + err.message);
    }
  }
}

function exportCanvasPNG() {
  const link = document.createElement("a");
  link.download = `${currentExercise.title.replace(/\s+/g, "_")}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

function printExerciseSheet() {
  const dataUrl = canvas.toDataURL("image/png");
  const win = window.open("", "_blank");
  win.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>${currentExercise.title} - Trainingsblatt</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 20px; color: #111; max-width: 800px; margin: auto; }
        h1 { font-size: 20px; margin-bottom: 4px; }
        .meta { font-size: 13px; color: #555; margin-bottom: 15px; border-bottom: 1px solid #ccc; padding-bottom: 8px; }
        img { width: 100%; border: 1px solid #aaa; border-radius: 6px; margin-bottom: 15px; }
        .section { margin-bottom: 12px; }
        .section-title { font-weight: bold; font-size: 13px; text-transform: uppercase; color: #2d6a4f; margin-bottom: 4px; }
        .section-text { font-size: 13px; white-space: pre-wrap; line-height: 1.5; }
      </style>
    </head>
    <body>
      <h1>${currentExercise.title}</h1>
      <div class="meta">
        <strong>Altersklasse:</strong> ${currentExercise.age_group} | 
        <strong>Schwerpunkt:</strong> ${currentExercise.focus} | 
        <strong>Spieler:</strong> ${currentExercise.player_count} | 
        <strong>Feld:</strong> ${currentExercise.dimensions}
      </div>
      <img src="${dataUrl}" />
      <div class="section">
        <div class="section-title">Aufbau & Ablauf</div>
        <div class="section-text">${currentExercise.description || "Keine Beschreibung angegeben."}</div>
      </div>
      <div class="section">
        <div class="section-title">Coaching-Punkte (Trainerhinweise)</div>
        <div class="section-text">${currentExercise.coaching_points || "Keine Coaching-Punkte hinterlegt."}</div>
      </div>
      <script>window.onload = function() { window.print(); }<\/script>
    </body>
    </html>
  `);
  win.document.close();
}

// ----------------------------------------------------
// UI Navigation & Popover Menus / Modal Dialogs
// ----------------------------------------------------
function togglePlaybackSettingsMenu(event) {
  if (event) event.stopPropagation();
  const popup = document.getElementById("playbackSettingsPopup");
  if (!popup) return;
  const isHidden = popup.classList.contains("hidden");
  closeEquipmentMenu();
  closeLineModeMenu();
  if (isHidden) {
    popup.classList.remove("hidden");
  } else {
    popup.classList.add("hidden");
  }
}

function closePlaybackSettingsMenu() {
  const popup = document.getElementById("playbackSettingsPopup");
  if (popup && !popup.classList.contains("hidden")) {
    popup.classList.add("hidden");
  }
}

function toggleLineModeMenu(event) {
  if (event) event.stopPropagation();
  const modal = document.getElementById("lineModeMenuModal");
  if (!modal) return;
  const isHidden = modal.classList.contains("hidden");
  closeEquipmentMenu();
  closePlaybackSettingsMenu();
  if (isHidden) {
    modal.classList.remove("hidden");
  } else {
    modal.classList.add("hidden");
  }
}

function closeLineModeMenu() {
  const modal = document.getElementById("lineModeMenuModal");
  if (modal && !modal.classList.contains("hidden")) {
    modal.classList.add("hidden");
  }
}

function toggleEquipmentMenu(event) {
  if (event) event.stopPropagation();
  const modal = document.getElementById("equipmentMenuModal");
  if (!modal) return;
  const isHidden = modal.classList.contains("hidden");
  closePlaybackSettingsMenu();
  closeLineModeMenu();
  if (isHidden) {
    modal.classList.remove("hidden");
  } else {
    modal.classList.add("hidden");
  }
}

function closeEquipmentMenu() {
  const modal = document.getElementById("equipmentMenuModal");
  if (modal && !modal.classList.contains("hidden")) {
    modal.classList.add("hidden");
  }
}

function setLineDrawMode(mode) {
  lineDrawMode = mode;
  closeLineModeMenu();

  const label = document.getElementById("lineModeCurrentLabel");
  const icon = document.getElementById("lineModeCurrentIcon");
  const checkRawFreehand = document.getElementById("lineModeCheckRawFreehand");
  const checkFreehand = document.getElementById("lineModeCheckFreehand");
  const checkBezier = document.getElementById("lineModeCheckBezier");
  const checkStraight = document.getElementById("lineModeCheckStraight");

  const optRawFreehand = document.getElementById("lineModeOptRawFreehand");
  const optFreehand = document.getElementById("lineModeOptFreehand");
  const optBezier = document.getElementById("lineModeOptBezier");
  const optStraight = document.getElementById("lineModeOptStraight");

  // Reset all option styles
  [optRawFreehand, optFreehand, optBezier, optStraight].forEach(opt => {
    if (opt) {
      opt.className = "w-full text-left px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-transparent text-slate-300 flex items-center justify-between text-xs transition";
    }
  });
  if (checkRawFreehand) checkRawFreehand.classList.add("hidden");
  if (checkFreehand) checkFreehand.classList.add("hidden");
  if (checkBezier) checkBezier.classList.add("hidden");
  if (checkStraight) checkStraight.classList.add("hidden");

  if (mode === "raw_freehand") {
    if (label) label.innerText = "Full Freihand";
    if (icon) icon.className = "fa-solid fa-pen-nib text-[11px] text-amber-400";
    if (optRawFreehand) optRawFreehand.className = "w-full text-left px-2 py-1.5 rounded-lg bg-amber-950/60 border border-amber-500/50 text-amber-300 hover:bg-amber-900/60 flex items-center justify-between text-xs transition";
    if (checkRawFreehand) checkRawFreehand.classList.remove("hidden");
  } else if (mode === "freehand") {
    if (label) label.innerText = "Freihand";
    if (icon) icon.className = "fa-solid fa-signature text-[11px] text-emerald-400";
    if (optFreehand) optFreehand.className = "w-full text-left px-2 py-1.5 rounded-lg bg-emerald-950/60 border border-emerald-500/50 text-emerald-300 hover:bg-emerald-900/60 flex items-center justify-between text-xs transition";
    if (checkFreehand) checkFreehand.classList.remove("hidden");
  } else if (mode === "bezier") {
    if (label) label.innerText = "Bézier";
    if (icon) icon.className = "fa-solid fa-bezier-curve text-[11px] text-cyan-400";
    if (optBezier) optBezier.className = "w-full text-left px-2 py-1.5 rounded-lg bg-cyan-950/60 border border-cyan-500/50 text-cyan-300 hover:bg-cyan-900/60 flex items-center justify-between text-xs transition";
    if (checkBezier) checkBezier.classList.remove("hidden");
  } else if (mode === "straight") {
    if (label) label.innerText = "Gerade";
    if (icon) icon.className = "fa-solid fa-minus text-[11px] text-slate-300";
    if (optStraight) optStraight.className = "w-full text-left px-2 py-1.5 rounded-lg bg-slate-700/60 border border-slate-500/50 text-white hover:bg-slate-700 flex items-center justify-between text-xs transition";
    if (checkStraight) checkStraight.classList.remove("hidden");
  }

  // If user is currently in select mode, switch to Laufweg for convenient drawing
  if (activeTool === "select") {
    setActiveTool("run");
  }

  // Mobile HUD Feedback for line mode
  const modeTitles = {
    raw_freehand: "Full Freihand",
    freehand: "Freihand (Auto-Fit)",
    bezier: "Bézier (Griffe)",
    straight: "Immer Gerade"
  };
  const modeSubtitles = {
    raw_freehand: "1:1 exakt wie gezeichnet",
    freehand: "Bogen zeichnen & automatisch glätten",
    bezier: "Start/Ende + Steuerpunkte biegen",
    straight: "Klassische Direktlinie"
  };
  const modeIcons = {
    raw_freehand: '<i class="fa-solid fa-pen-nib text-amber-400 text-2xl"></i>',
    freehand: '<i class="fa-solid fa-signature text-emerald-400 text-2xl"></i>',
    bezier: '<i class="fa-solid fa-bezier-curve text-cyan-400 text-2xl"></i>',
    straight: '<i class="fa-solid fa-minus text-slate-300 text-2xl"></i>'
  };
  showMobileSelectionHUD(modeTitles[mode] || "Linienmodus", modeSubtitles[mode] || "", modeIcons[mode] || "");
}

// Bottom Dock, HUD & Tooltip helpers now provided by ESM module (static/js/ui/hud.js)


