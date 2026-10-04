// ui/popovers.js - Steuerung von Popover-Menüs (Material-Drawer, Linien-Modus, Settings)

export function togglePlaybackSettingsMenu(event) {
  if (event) event.stopPropagation();
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
  const popup = document.getElementById("lineModeMenuPopup");
  if (!popup) return;
  const isHidden = popup.classList.contains("hidden");
  closeEquipmentMenu();
  closePlaybackSettingsMenu();
  if (isHidden) {
    popup.classList.remove("hidden");
  } else {
    popup.classList.add("hidden");
  }
}

export function closeLineModeMenu() {
  const popup = document.getElementById("lineModeMenuPopup");
  if (popup && !popup.classList.contains("hidden")) {
    popup.classList.add("hidden");
  }
}

export function toggleEquipmentMenu(event) {
  if (event) event.stopPropagation();
  const popup = document.getElementById("equipmentMenuPopup");
  if (!popup) return;
  const isHidden = popup.classList.contains("hidden");
  closePlaybackSettingsMenu();
  closeLineModeMenu();
  if (isHidden) {
    popup.classList.remove("hidden");
  } else {
    popup.classList.add("hidden");
  }
}

export function closeEquipmentMenu() {
  const popup = document.getElementById("equipmentMenuPopup");
  if (popup && !popup.classList.contains("hidden")) {
    popup.classList.add("hidden");
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

    const equipPopup = document.getElementById("equipmentMenuPopup");
    const equipBtn = document.getElementById("equipmentMenuBtn");
    if (equipPopup && !equipPopup.classList.contains("hidden")) {
      if (!equipPopup.contains(e.target) && !equipBtn?.contains(e.target)) {
        equipPopup.classList.add("hidden");
      }
    }

    const lineModePopup = document.getElementById("lineModeMenuPopup");
    const lineModeBtn = document.getElementById("lineModeMenuBtn");
    if (lineModePopup && !lineModePopup.classList.contains("hidden")) {
      if (!lineModePopup.contains(e.target) && !lineModeBtn?.contains(e.target)) {
        lineModePopup.classList.add("hidden");
      }
    }
  });
}
