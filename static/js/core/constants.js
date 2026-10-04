// core/constants.js - Geometrie, Spielfeld-Definitionen und Farben

export const VIRTUAL_WIDTH = 1050;
export const VIRTUAL_HEIGHT = 680;

export const EQUIPMENT_TYPES = [
  "cone", "pole", "ladder", "minigoal", "goal_5m", "dummy", "ring", "hurdle"
];

export function isEquipment(type) {
  return EQUIPMENT_TYPES.includes(type);
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
