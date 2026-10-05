// core/constants.js - Geometrie, Spielfeld-Definitionen und Farben

export const VIRTUAL_WIDTH = 1000;
export const VIRTUAL_HEIGHT = 700;

export const EQUIPMENT_TYPES = [
  "cone", "pole", "ladder", "minigoal", "goal_mini", "goal_5m", "goal_large", "dummy", "ring", "hurdle",
  "zone_rect", "zone_circle", "zone_triangle"
];

export function isEquipment(type) {
  return EQUIPMENT_TYPES.includes(type);
}

export function isMobileScreen() {
  return typeof window !== "undefined" && (window.innerWidth <= 768 || ('ontouchstart' in window) || (navigator.maxTouchPoints > 0));
}

export const COLORS = {
  PITCH_GRASS_LIGHT: "#1e3a2b",
  PITCH_GRASS_DARK: "#193225",
  PITCH_LINE: "rgba(255, 255, 255, 0.45)",
  SELECTION_GLOW: "rgba(56, 189, 248, 0.4)",
  TEAM_BLUE: "#2563eb",
  TEAM_RED: "#ef4444",
  TEAM_YELLOW: "#eab308",
  BALL: "#f8fafc",
  PASS_ARROW: "#facc15",
  RUN_ARROW: "#38bdf8",
  GUIDE_ARROW: "#fbbf24"
};

export const MAX_HISTORY = 40;
export const MIN_SCALE = 0.5;
export const MAX_SCALE = 3.0;
