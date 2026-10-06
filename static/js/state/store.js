// state/store.js - Zentraler reaktiver Zustand für Taktik-Übungen

export function createEmptyExercise() {
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
    field_rotation: 0,
    playback_speed: 1.0,
    keyframes: [
      {
        title: "Schritt 1: Startaufstellung",
        elements: [],
        arrows: []
      }
    ]
  };
}

export const state = {
  currentExercise: createEmptyExercise(),

  currentKeyframeIndex: 0,
  globalElementScale: 1.0,
  activeTool: "select", // 'select', 'pass', 'run', 'guide'
  selectedElementId: null,
  selectedElementIds: [],
  isLassoSelecting: false,
  lassoPoints: [],
  selectedArrowIndex: null,
  selectedArrowPart: null, // 'start', 'end', 'body'
  activeCurveDrag: null,

  // Pointer & Dragging
  isDragging: false,
  isDraggingArrow: false,
  isMovingElement: false,
  dragStartX: 0,
  dragStartY: 0,
  groupDragOffsets: {},
  arrowDragOffsetX: 0,
  arrowDragOffsetY: 0,

  // Arrow Drawing
  isDrawingArrow: false,
  arrowStartX: 0,
  arrowStartY: 0,
  arrowCurrentX: 0,
  arrowCurrentY: 0,
  arrowDrawStrokePoints: [],
  lineDrawMode: "freehand", // 'raw_freehand', 'freehand', 'bezier', 'straight'

  // In-flight Shape Drawing (Rectangle, Circle, Triangle)
  isDrawingShape: false,
  shapeStartX: 0,
  shapeStartY: 0,
  shapeCurrentX: 0,
  shapeCurrentY: 0,
  selectedShapeType: "rect", // 'rect', 'circle', 'triangle'

  // Zone Resizing
  isResizingZone: false,
  resizeZoneId: null,
  resizeZoneCorner: null,
  resizeInitialState: null,

  // Playback & Animation
  isPlaying: false,
  isLoopMode: true,
  isGhostMode: "all", // 'off', 'prev', 'all'
  isDebugHitAreas: false, // Debug-Modus: Hitboxen & Auswahlflächen dezent umranden
  animReqId: null,
  animStartTime: null,
  currentSpeed: 1.0,

  // Viewport Transform
  is3DMode: false,
  viewScale: 1.0,
  viewPanX: 0,
  viewPanY: 0,
  fieldRotation: 270, // 0, 90, 180, 270
  isPanning: false,
  panStartX: 0,
  panStartY: 0
};

// Hilfsmethoden für bequemen Zugriff auf den aktiven Keyframe
export function getCurrentKeyframe() {
  if (!state.currentExercise || !state.currentExercise.keyframes) return { elements: [], arrows: [] };
  return state.currentExercise.keyframes[state.currentKeyframeIndex] || { elements: [], arrows: [] };
}

export function getCurrentExercise() {
  return state.currentExercise;
}

export function setCurrentExercise(ex) {
  state.currentExercise = ex;
}
