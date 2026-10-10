// static/js/app-module.js - ESM Adapter & Bridge
// Imports all structured clean sub-modules and exports functions globally for HTML inline handlers

import * as constants from "./core/constants.js";
import * as geometry from "./core/geometry.js";
import * as pitch from "./core/pitch.js";
import * as elements from "./canvas/elements.js";
import * as arrows from "./canvas/arrows.js";
import * as viewport from "./canvas/viewport.js";
import * as scene from "./canvas/scene.js";
import { View3DManager } from "./canvas/view3d.js?v=b202610100702";
import { PlaybackController } from "./canvas/playback.js";
import * as popovers from "./ui/popovers.js";
import * as hud from "./ui/hud.js";
import * as inspectors from "./ui/inspectors.js";
import * as timeline from "./ui/timeline.js";
import * as tools from "./interaction/tools.js";
import * as curveEditor from "./interaction/curve-editor.js";
import * as pointer from "./interaction/pointer.js";
import * as client from "./api/client.js";
import { state, createEmptyExercise, getCurrentKeyframe, getCurrentExercise, setCurrentExercise } from "./state/store.js";
import { HistoryManager } from "./state/history.js";

// Make popover functions globally callable for HTML inline handlers
window.toggleTopMenu = popovers.toggleTopMenu;
window.closeSidebarMenu = popovers.closeSidebarMenu;
window.togglePlaybackSettingsMenu = popovers.togglePlaybackSettingsMenu;
window.closePlaybackSettingsMenu = popovers.closePlaybackSettingsMenu;
window.toggleEquipmentMenu = popovers.toggleEquipmentMenu;
window.closeEquipmentMenu = popovers.closeEquipmentMenu;
window.toggleZoneMenu = popovers.toggleZoneMenu;
window.closeZoneMenu = popovers.closeZoneMenu;
window.selectShapeTool = popovers.selectShapeTool;
window.toggleLineModeMenu = popovers.toggleLineModeMenu;
window.closeLineModeMenu = popovers.closeLineModeMenu;
if (typeof popovers.setLineDrawMode === "function") {
  window.setLineDrawMode = popovers.setLineDrawMode;
}

// Make tools functions globally callable
window.setActiveTool = tools.setActiveTool;

// Expose HUD and Bottom dock helpers globally
window.showMobileSelectionHUD = hud.showMobileSelectionHUD;
window.updateBottomDockScrollHints = hud.updateBottomDockScrollHints;
window.scrollBottomDock = hud.scrollBottomDock;
window.setupMobileTooltips = hud.setupMobileTooltips;
window.showMobileTooltip = hud.showMobileTooltip;
window.hideMobileTooltip = hud.hideMobileTooltip;

// Attach modules to window.TacticalCoach namespace for debugging & gradual migration
window.state = state;
window.TacticalCoach = {
  constants,
  geometry,
  pitch,
  elements,
  arrows,
  viewport,
  scene,
  View3DManager,
  PlaybackController,
  popovers,
  inspectors,
  timeline,
  hud,
  tools,
  curveEditor,
  pointer,
  client,
  store: { createEmptyExercise, getCurrentKeyframe, getCurrentExercise, setCurrentExercise },
  state,
  getCurrentKeyframe,
  getCurrentExercise,
  setCurrentExercise,
  HistoryManager
};

console.log("✅ TacticalCoach modular architecture (Phase 4 curve & interaction) initialized & active.");



