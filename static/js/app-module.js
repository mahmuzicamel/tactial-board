// static/js/app-module.js - ESM Adapter & Bridge
// Imports all structured clean sub-modules and exports functions globally for HTML inline handlers

import * as constants from "./core/constants.js";
import * as geometry from "./core/geometry.js";
import * as pitch from "./core/pitch.js";
import * as elements from "./canvas/elements.js";
import * as arrows from "./canvas/arrows.js";
import * as viewport from "./canvas/viewport.js";
import * as scene from "./canvas/scene.js";
import { View3DManager } from "./canvas/view3d.js?v=b202610101054";
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
import * as miscHandlers from "./handlers/misc-handlers.js";
import * as arrowHandlers from "./handlers/arrow-handlers.js";
import * as elementHandlers from "./handlers/element-handlers.js";
import * as exerciseIo from "./handlers/exercise-io.js";
import * as exportHandlers from "./handlers/export-handlers.js";
import * as keyframeHandlers from "./handlers/keyframe-handlers.js";
import * as viewHandlers from "./handlers/view-handlers.js";

// Handler-Module (ESM): Exports an window.* fuer onclick=""-Bindings in index.html.
// Jedes Handler-Modul ist ein isolierter ESM-Scope -> keine const-Kollision/State-Sharing.
window.showToast = miscHandlers.showToast;
window.syncFormToState = miscHandlers.syncFormToState;
window.updateFormFields = miscHandlers.updateFormFields;
window.resetSelectedArrowCurve = arrowHandlers.resetSelectedArrowCurve;
window.copyArrowToNextKeyframe = arrowHandlers.copyArrowToNextKeyframe;
window.toggleArrowPersistent = arrowHandlers.toggleArrowPersistent;
window.updateArrowPersistentButtonState = arrowHandlers.updateArrowPersistentButtonState;
window.spawnElement = elementHandlers.spawnElement;
window.duplicateSelectedElement = elementHandlers.duplicateSelectedElement;
window.deleteSelectedElement = elementHandlers.deleteSelectedElement;
window.rotateSelectedElement = elementHandlers.rotateSelectedElement;
window.scaleSelectedElement = elementHandlers.scaleSelectedElement;
window.toggleFocusSelectedElement = elementHandlers.toggleFocusSelectedElement;
window.toggleSelectedElementJump = elementHandlers.toggleSelectedElementJump;
window.resetSelectedElementCurve = elementHandlers.resetSelectedElementCurve;
window.toggleZoneColorMenu = elementHandlers.toggleZoneColorMenu;
window.setSelectedZoneColor = elementHandlers.setSelectedZoneColor;
window.onElementScaleChange = elementHandlers.onElementScaleChange;
window.propagateSelectedElementToAllKeyframes = elementHandlers.propagateSelectedElementToAllKeyframes;
window.deselectElement = elementHandlers.deselectElement;
window.updateFocusButtonState = elementHandlers.updateFocusButtonState;
window.syncFloatingProps = elementHandlers.syncFloatingProps;
window.syncEquipmentElementAcrossAllKeyframes = elementHandlers.syncEquipmentElementAcrossAllKeyframes;
window.getExerciseIdFromUrl = exerciseIo.getExerciseIdFromUrl;
window.updateUrlForExercise = exerciseIo.updateUrlForExercise;
window.copyExerciseShareLink = exerciseIo.copyExerciseShareLink;
window.saveLocalDraft = exerciseIo.saveLocalDraft;
window.loadLocalDraft = exerciseIo.loadLocalDraft;
window.saveCurrentExercise = exerciseIo.saveCurrentExercise;
window.createNewExercise = exerciseIo.createNewExercise;
window.refreshExerciseBadge = exerciseIo.refreshExerciseBadge;
window.openExerciseCatalog = exerciseIo.openExerciseCatalog;
window.closeCatalogModal = exerciseIo.closeCatalogModal;
window.loadCatalogExercises = exerciseIo.loadCatalogExercises;
window.filterCatalog = exerciseIo.filterCatalog;
window.loadExerciseFromCatalog = exerciseIo.loadExerciseFromCatalog;
window.deleteExerciseFromCatalog = exerciseIo.deleteExerciseFromCatalog;
window.openExportModal = exportHandlers.openExportModal;
window.openDetailsModal = exportHandlers.openDetailsModal;
window.closeDetailsModal = exportHandlers.closeDetailsModal;
window.switchSidebarTab = exportHandlers.switchSidebarTab;
window.setVideoRenderMode = exportHandlers.setVideoRenderMode;
window.triggerVideoRender = exportHandlers.triggerVideoRender;
window.trigger3DVideoRender = exportHandlers.trigger3DVideoRender;
window.downloadBlobFile = exportHandlers.downloadBlobFile;
window.downloadCurrentVideo = exportHandlers.downloadCurrentVideo;
window.renderKeyframeTabs = keyframeHandlers.renderKeyframeTabs;
window.insertKeyframeAfterCurrent = keyframeHandlers.insertKeyframeAfterCurrent;
window.duplicateKeyframe = keyframeHandlers.duplicateKeyframe;
window.deleteCurrentKeyframe = keyframeHandlers.deleteCurrentKeyframe;
window.editKeyframeTitle = keyframeHandlers.editKeyframeTitle;
window.moveKeyframeToIndex = keyframeHandlers.moveKeyframeToIndex;
window.clearCurrentCanvas = keyframeHandlers.clearCurrentCanvas;
window.closeClearConfirmModal = keyframeHandlers.closeClearConfirmModal;
window.ensureView3DManager = viewHandlers.ensureView3DManager;
window.toggle3DView = viewHandlers.toggle3DView;
window.set3DCameraPreset = viewHandlers.set3DCameraPreset;
window.toggle3DNames = viewHandlers.toggle3DNames;
window.set3DDisplayMode = viewHandlers.set3DDisplayMode;
window.toggleLoopMode = viewHandlers.toggleLoopMode;
window.toggleGhostLayer = viewHandlers.toggleGhostLayer;
window.toggleDebugHitAreas = viewHandlers.toggleDebugHitAreas;
window.cyclePlaybackSpeed = viewHandlers.cyclePlaybackSpeed;
window.rotatePitch = viewHandlers.rotatePitch;
window.resetZoom = viewHandlers.resetZoom;
window.toggleViewControls = viewHandlers.toggleViewControls;
window.changePitchType = viewHandlers.changePitchType;

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



