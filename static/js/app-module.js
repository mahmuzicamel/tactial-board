// static/js/app-module.js - ESM Adapter & Bridge
// Imports all structured clean sub-modules and exports functions globally for HTML inline handlers

import * as constants from "./core/constants.js";
import * as geometry from "./core/geometry.js";
import * as pitch from "./core/pitch.js";
import * as elements from "./canvas/elements.js";
import * as arrows from "./canvas/arrows.js";
import * as viewport from "./canvas/viewport.js";
import { PlaybackController } from "./canvas/playback.js";
import * as popovers from "./ui/popovers.js";
import * as inspectors from "./ui/inspectors.js";
import * as timeline from "./ui/timeline.js";
import * as tools from "./interaction/tools.js";
import * as curveEditor from "./interaction/curve-editor.js";
import * as pointer from "./interaction/pointer.js";
import * as client from "./api/client.js";
import { state, getCurrentKeyframe, getCurrentExercise, setCurrentExercise } from "./state/store.js";
import { HistoryManager } from "./state/history.js";

// Make popover functions globally callable for HTML onclick attributes
window.togglePlaybackSettingsMenu = popovers.togglePlaybackSettingsMenu;
window.closePlaybackSettingsMenu = popovers.closePlaybackSettingsMenu;
window.toggleEquipmentMenu = popovers.toggleEquipmentMenu;
window.closeEquipmentMenu = popovers.closeEquipmentMenu;
window.toggleLineModeMenu = popovers.toggleLineModeMenu;
window.closeLineModeMenu = popovers.closeLineModeMenu;
window.setLineDrawMode = popovers.setLineDrawMode;

// Attach modules to window.TacticalCoach namespace for debugging & gradual migration
window.TacticalCoach = {
  constants,
  geometry,
  pitch,
  elements,
  arrows,
  viewport,
  PlaybackController,
  popovers,
  inspectors,
  timeline,
  tools,
  curveEditor,
  pointer,
  client,
  state,
  getCurrentKeyframe,
  getCurrentExercise,
  setCurrentExercise,
  HistoryManager
};

console.log("✅ TacticalCoach modular architecture (Phase 4 curve & interaction) initialized & active.");



