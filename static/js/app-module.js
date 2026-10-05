// static/js/app-module.js - ESM Adapter & Bridge
// Imports all structured clean sub-modules and exports functions globally for HTML inline handlers

import * as constants from "./core/constants.js?v=134";
import * as geometry from "./core/geometry.js?v=134";
import * as pitch from "./core/pitch.js?v=134";
import * as elements from "./canvas/elements.js?v=134";
import * as arrows from "./canvas/arrows.js?v=134";
import * as viewport from "./canvas/viewport.js?v=134";
import { View3DManager } from "./canvas/view3d.js?v=134";
import { PlaybackController } from "./canvas/playback.js?v=134";
import * as popovers from "./ui/popovers.js?v=134";
import * as hud from "./ui/hud.js?v=134";
import * as inspectors from "./ui/inspectors.js?v=134";
import * as timeline from "./ui/timeline.js?v=134";
import * as tools from "./interaction/tools.js?v=134";
import * as curveEditor from "./interaction/curve-editor.js?v=134";
import * as pointer from "./interaction/pointer.js?v=134";
import * as client from "./api/client.js?v=134";
import { state, createEmptyExercise, getCurrentKeyframe, getCurrentExercise, setCurrentExercise } from "./state/store.js?v=134";
import { HistoryManager } from "./state/history.js?v=134";

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



