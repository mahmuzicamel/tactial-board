// state/store.js - Zentraler reaktiver Zustand für Taktik-Übungen

export const state = {
  currentExercise: {
    id: "ex_initial",
    title: "3-gegen-2 Umschaltspiel nach Ballgewinn",
    age_group: "F-Jugend (U9)",
    focus: "Umschaltspiel",
    player_count: "6-8 Spieler",
    pitch_type: "half",
    dimensions: "25x20m",
    description: "Zwei Teams (3 Angreifer Blau gegen 2 Verteidiger Rot). Blau eröffnet mit schnellem Pass in die Schnittstelle. Rot versucht den Ball abzufangen und auf die Minitore zu kontern.",
    coaching_points: "• Offene Spielstellung vor der Annahme\n• Erster Kontakt direkt nach vorne in den freien Raum\n• Schnelles Nachrücken und Dreiecksbildung",
    keyframes: [
      {
        title: "Schritt 1: Ausgangsstellung & Pass",
        elements: [
          { id: "b1", type: "player", team: "blue", number: "4", name: "Daniel", x: 200, y: 350 },
          { id: "b2", type: "player", team: "blue", number: "7", name: "Ben", x: 450, y: 200 },
          { id: "b3", type: "player", team: "blue", number: "9", name: "Ayla", x: 450, y: 500 },
          { id: "r1", type: "player", team: "red", number: "2", name: "", x: 380, y: 300 },
          { id: "r2", type: "player", team: "red", number: "5", name: "", x: 380, y: 400 },
          { id: "ball", type: "ball", x: 225, y: 350 },
          { id: "c1", type: "cone", x: 300, y: 150 },
          { id: "c2", type: "cone", x: 300, y: 550 },
          { id: "m1", type: "minigoal", x: 100, y: 150 },
          { id: "m2", type: "minigoal", x: 100, y: 550 }
        ],
        arrows: [
          { type: "pass", x1: 225, y1: 350, x2: 435, y2: 215, color: "#facc15" }
        ]
      },
      {
        title: "Schritt 2: Annahme & Pass in Tiefe",
        elements: [
          { id: "b1", type: "player", team: "blue", number: "4", name: "Daniel", x: 350, y: 350 },
          { id: "b2", type: "player", team: "blue", number: "7", name: "Ben", x: 550, y: 220 },
          { id: "b3", type: "player", team: "blue", number: "9", name: "Ayla", x: 620, y: 450 },
          { id: "r1", type: "player", team: "red", number: "2", name: "", x: 480, y: 270 },
          { id: "r2", type: "player", team: "red", number: "5", name: "", x: 450, y: 380 },
          { id: "ball", type: "ball", x: 565, y: 225 },
          { id: "c1", type: "cone", x: 300, y: 150 },
          { id: "c2", type: "cone", x: 300, y: 550 },
          { id: "m1", type: "minigoal", x: 100, y: 150 },
          { id: "m2", type: "minigoal", x: 100, y: 550 }
        ],
        arrows: [
          { type: "run", x1: 450, y1: 500, x2: 620, y2: 450, color: "#38bdf8" }
        ]
      }
    ]
  },

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

  // Playback & Animation
  isPlaying: false,
  isLoopMode: true,
  isGhostMode: "off", // 'off', 'prev', 'all'
  animReqId: null,
  animStartTime: null,
  currentSpeed: 0.5,

  // Viewport Transform
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
