// ui/popovers.js - Steuerung von Popover-Menüs (Material-Drawer, Linien-Modus, Settings)

export function toggleTopMenu() {
  const drawer = document.getElementById("topDrawerMenu");
  const overlay = document.getElementById("sidebarOverlay");
  if (!drawer) return;
  const isCollapsed = drawer.classList.contains("collapsed");
  if (isCollapsed) {
    drawer.classList.remove("collapsed");
    if (overlay) overlay.classList.remove("collapsed");
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

    const lineModeModal = document.getElementById("lineModeMenuModal");
    const lineModeBtn = document.getElementById("lineModeMenuBtn");
    if (lineModeModal && !lineModeModal.classList.contains("hidden")) {
      if (e.target === lineModeModal) {
        lineModeModal.classList.add("hidden");
      }
    }
  });
}
