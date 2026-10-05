// ui/popovers.js - Steuerung von Popover-Menüs (Material-Drawer, Linien-Modus, Settings)

export function toggleTopMenu() {
  const drawer = document.getElementById("topDrawerMenu");
  const overlay = document.getElementById("sidebarOverlay");
  if (!drawer) return;
  const isCollapsed = drawer.classList.contains("collapsed");
  if (isCollapsed) {
    drawer.classList.remove("collapsed");
    if (overlay) overlay.classList.remove("collapsed");
    if (typeof window.loadCatalogExercises === "function") {
      window.loadCatalogExercises();
    }
  } else {
    closeSidebarMenu();
  }
}

export function closeSidebarMenu() {
  const drawer = document.getElementById("topDrawerMenu");
  const overlay = document.getElementById("sidebarOverlay");
  if (drawer) drawer.classList.add("collapsed");
  if (overlay) overlay.classList.add("collapsed");
}

export function openExportModal() {
  const modal = document.getElementById("exportModal");
  if (modal) modal.classList.remove("hidden");
}

export function closeExportModal() {
  const modal = document.getElementById("exportModal");
  if (modal) modal.classList.add("hidden");
}

export function openExerciseCatalog() {
  const modal = document.getElementById("catalogModal");
  if (modal) modal.classList.remove("hidden");
}

export function closeCatalogModal() {
  const modal = document.getElementById("catalogModal");
  if (modal) modal.classList.add("hidden");
}

export function openClearConfirmModal() {
  const modal = document.getElementById("clearConfirmModal");
  if (modal) modal.classList.remove("hidden");
}

export function closeClearConfirmModal() {
  const modal = document.getElementById("clearConfirmModal");
  if (modal) modal.classList.add("hidden");
}

export function togglePlaybackSettingsMenu(event) {
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

export function closePlaybackSettingsMenu() {
  const popup = document.getElementById("playbackSettingsPopup");
  if (popup && !popup.classList.contains("hidden")) {
    popup.classList.add("hidden");
  }
}

export function toggleLineModeMenu(event) {
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

export function closeLineModeMenu() {
  const modal = document.getElementById("lineModeMenuModal");
  if (modal && !modal.classList.contains("hidden")) {
    modal.classList.add("hidden");
  }
}

export function selectShapeTool(shapeType) {
  if (window.state) {
    window.state.selectedShapeType = shapeType;
  }
  if (typeof window.setActiveTool === "function") {
    window.setActiveTool("shape");
  }
  closeZoneMenu();
  const label = document.getElementById("toolShapeLabel");
  const icon = document.getElementById("toolShapeIcon");
  if (label) {
    label.textContent = shapeType === "rect" ? "Rechteck" : shapeType === "circle" ? "Kreis" : "Dreieck";
  }
  if (icon) {
    icon.className = shapeType === "rect" ? "fa-regular fa-square text-sky-400 text-[10px]" : shapeType === "circle" ? "fa-regular fa-circle text-amber-400 text-[10px]" : "fa-solid fa-play -rotate-90 text-purple-400 text-[10px]";
  }
}

export function toggleZoneMenu(event) {
  if (event) event.stopPropagation();
  const modal = document.getElementById("zoneMenuModal");
  if (!modal) return;
  const isHidden = modal.classList.contains("hidden");
  closePlaybackSettingsMenu();
  closeLineModeMenu();
  closeEquipmentMenu();
  if (isHidden) {
    modal.classList.remove("hidden");
  } else {
    modal.classList.add("hidden");
  }
}

export function closeZoneMenu() {
  const modal = document.getElementById("zoneMenuModal");
  if (modal && !modal.classList.contains("hidden")) {
    modal.classList.add("hidden");
  }
}

export function toggleEquipmentMenu(event) {
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

export function closeEquipmentMenu() {
  const modal = document.getElementById("equipmentMenuModal");
  if (modal && !modal.classList.contains("hidden")) {
    modal.classList.add("hidden");
  }
}

export function setLineDrawMode(mode) {
  if (window.state) {
    window.state.lineDrawMode = mode;
  }
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

  const setIconClass = (cls) => {
    if (!icon) return;
    if (typeof icon.className === "string") {
      icon.className = cls;
    } else {
      icon.setAttribute("class", cls);
    }
  };

  if (mode === "raw_freehand") {
    if (label) label.innerText = "Full Freihand";
    setIconClass("fa-solid fa-pen-nib text-[11px] text-amber-400");
    if (optRawFreehand) optRawFreehand.className = "w-full text-left px-2 py-1.5 rounded-lg bg-amber-950/60 border border-amber-500/50 text-amber-300 hover:bg-amber-900/60 flex items-center justify-between text-xs transition";
    if (checkRawFreehand) checkRawFreehand.classList.remove("hidden");
  } else if (mode === "freehand") {
    if (label) label.innerText = "Freihand";
    setIconClass("fa-solid fa-signature text-[11px] text-emerald-400");
    if (optFreehand) optFreehand.className = "w-full text-left px-2 py-1.5 rounded-lg bg-emerald-950/60 border border-emerald-500/50 text-emerald-300 hover:bg-emerald-900/60 flex items-center justify-between text-xs transition";
    if (checkFreehand) checkFreehand.classList.remove("hidden");
  } else if (mode === "bezier") {
    if (label) label.innerText = "Bézier";
    setIconClass("fa-solid fa-bezier-curve text-[11px] text-cyan-400");
    if (optBezier) optBezier.className = "w-full text-left px-2 py-1.5 rounded-lg bg-cyan-950/60 border border-cyan-500/50 text-cyan-300 hover:bg-cyan-900/60 flex items-center justify-between text-xs transition";
    if (checkBezier) checkBezier.classList.remove("hidden");
  } else if (mode === "straight") {
    if (label) label.innerText = "Gerade";
    setIconClass("fa-solid fa-minus text-[11px] text-slate-300");
    if (optStraight) optStraight.className = "w-full text-left px-2 py-1.5 rounded-lg bg-slate-700/60 border border-slate-500/50 text-white hover:bg-slate-700 flex items-center justify-between text-xs transition";
    if (checkStraight) checkStraight.classList.remove("hidden");
  }

  if (window.state && window.state.activeTool === "select" && typeof window.setActiveTool === "function") {
    window.setActiveTool("run");
  }
}

export function initGlobalClickDismiss() {
  document.addEventListener("pointerdown", (e) => {
    const playbackPopup = document.getElementById("playbackSettingsPopup");
    const playbackBtn = document.getElementById("playbackSettingsBtn");
    if (playbackPopup && !playbackPopup.classList.contains("hidden")) {
      if (!playbackPopup.contains(e.target) && !playbackBtn?.contains(e.target)) {
        playbackPopup.classList.add("hidden");
      }
    }

    const equipModal = document.getElementById("equipmentMenuModal");
    const equipBtn = document.getElementById("equipmentMenuBtn");
    if (equipModal && !equipModal.classList.contains("hidden")) {
      if (e.target === equipModal) {
        equipModal.classList.add("hidden");
      }
    }

    const zoneModal = document.getElementById("zoneMenuModal");
    const zoneBtn = document.getElementById("zoneMenuBtn");
    if (zoneModal && !zoneModal.classList.contains("hidden")) {
      if (e.target === zoneModal) {
        zoneModal.classList.add("hidden");
      }
    }

    const viewDrawer = document.getElementById("viewControlsDrawer");
    const viewBtn = document.getElementById("viewControlsToggleBtn");
    if (viewDrawer && !viewDrawer.classList.contains("hidden")) {
      if (!viewDrawer.contains(e.target) && !viewBtn?.contains(e.target)) {
        viewDrawer.classList.add("hidden");
      }
    }

    const lineModeModal = document.getElementById("lineModeMenuModal");
    const lineModeBtn = document.getElementById("lineModeMenuBtn");
    if (lineModeModal && !lineModeModal.classList.contains("hidden")) {
      if (e.target === lineModeModal) {
        lineModeModal.classList.add("hidden");
      }
    }
  });
}
