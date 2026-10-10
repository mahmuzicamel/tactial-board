// static/js/handlers/view-handlers.js
// Extrahiert aus app.js (verhaltenserhaltend, byte-identische Funktionskörper).
// Handler bleiben an window.* gebunden, damit die onclick="..."-Bindings in index.html funktionieren.
(function () {
const TC = () => window.TacticalCoach;
const S = () => window.TacticalCoach?.state;

const SPEED_STEPS = [0.25, 0.5, 0.75, 1.0, 1.5, 2.0];


  window.ensureView3DManager = function () {
    if (!window.view3dManager && TC() && TC().View3DManager) {
      const wrapper = document.getElementById("canvasWrapper");
      window.view3dManager = new (TC().View3DManager)(wrapper, S(), () => S().currentExercise);
      window.view3dManager = window.view3dManager;
    }
    return window.view3dManager;
  };

  window.toggle3DView = function () {
    const s = S();
    s.is3DMode = !s.is3DMode;

    const btn = document.getElementById("view3dToggleBtn");
    const lbl = document.getElementById("view3dToggleLabel");
    const hud = document.getElementById("view3dHud");
    const c2d = document.getElementById("tacticCanvas");

    if (!window.view3dManager && TC().View3DManager) {
      window.ensureView3DManager();
    }

    if (s.is3DMode) {
      if (btn) {
        btn.className = "ml-1 px-2 py-1 bg-cyan-600 hover:bg-cyan-500 active:scale-95 text-white rounded-lg flex items-center gap-1.5 text-[11px] font-bold border border-cyan-400 transition shadow-md shadow-cyan-500/30";
      }
      if (lbl) lbl.innerText = "2D";
      if (hud) hud.classList.remove("hidden");
      if (c2d) c2d.style.opacity = "0.05"; // 2D im Hintergrund schwach halten

      // Schließe 2D Selektions-Popups
      window.deselectElement();

      if (window.view3dManager) {
        window.view3dManager.show();
      }
    } else {
      if (btn) {
        btn.className = "ml-1 px-2 py-1 bg-slate-800 hover:bg-slate-700 active:scale-95 text-cyan-400 hover:text-cyan-300 rounded-lg flex items-center gap-1.5 text-[11px] font-bold border border-slate-700 transition shadow-sm";
      }
      if (lbl) lbl.innerText = "3D";
      if (hud) hud.classList.add("hidden");
      if (c2d) c2d.style.opacity = "1";

      if (window.view3dManager) {
        window.view3dManager.hide();
      }
      window.drawScene();
    }
  };

  window.set3DCameraPreset = function (preset) {
    if (window.view3dManager) {
      window.view3dManager.setCameraPreset(preset);
    }
  };

  window.toggle3DNames = function () {
    if (window.view3dManager) {
      const isVisible = window.view3dManager.toggleNamesVisibility();
      const btn = document.getElementById("view3dToggleNamesBtn");
      const lbl = document.getElementById("view3dToggleNamesLabel");
      const icon = document.getElementById("view3dToggleNamesIcon");
      if (btn && lbl) {
        if (isVisible) {
          btn.className = "px-1.5 py-0.5 rounded bg-cyan-950/70 border border-cyan-500/60 text-cyan-300 text-[11px] font-medium flex items-center gap-1 shadow-sm";
          lbl.innerText = "Namen: An";
          if (icon) icon.className = "fa-solid fa-tag text-[10px]";
          window.showToast("Spielernamen in 3D eingeblendet");
        } else {
          btn.className = "px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white text-[11px] font-medium flex items-center gap-1";
          lbl.innerText = "Namen: Aus";
          if (icon) icon.className = "fa-solid fa-tag-slash text-[10px]";
          window.showToast("Spielernamen in 3D ausgeblendet");
        }
      }
    }
  };

  window.toggleLoopMode = function () {
    const s = S();
    s.isLoopMode = !s.isLoopMode;
    const btn = document.getElementById("loopToggleBtn");
    const lbl = document.getElementById("loopToggleLabel");
    if (btn && lbl) {
      btn.className = s.isLoopMode
        ? "px-1.5 py-1 bg-emerald-950/60 hover:bg-emerald-900/60 active:scale-95 text-emerald-400 font-bold text-[11px] rounded-md border border-emerald-600/60 transition flex items-center gap-1"
        : "px-1.5 py-1 bg-slate-800 hover:bg-slate-700 active:scale-95 text-amber-300 font-bold text-[11px] rounded-md border border-slate-700 transition flex items-center gap-1";
      lbl.innerText = s.isLoopMode ? "Loop" : "1x";
    }
  };

  window.toggleGhostLayer = function () {
    const s = S();
    s.isGhostMode = s.isGhostMode === "off" ? "prev" : (s.isGhostMode === "prev" ? "all" : "off");
    const btn = document.getElementById("ghostToggleBtn");
    const lbl = document.getElementById("ghostToggleLabel");
    if (btn && lbl) {
      if (s.isGhostMode === "prev") {
        btn.className = "px-1.5 py-1 bg-cyan-950/70 text-cyan-300 font-bold text-[11px] rounded-md border border-cyan-500/60 transition flex items-center gap-1";
        lbl.innerText = "Ghost: 1";
      } else if (s.isGhostMode === "all") {
        btn.className = "px-1.5 py-1 bg-purple-950/80 text-purple-200 font-bold text-[11px] rounded-md border border-purple-500/70 transition flex items-center gap-1";
        lbl.innerText = "Ghost: Alle";
      } else {
        btn.className = "px-1.5 py-1 bg-slate-800 text-slate-400 font-bold text-[11px] rounded-md border border-slate-700 transition flex items-center gap-1";
        lbl.innerText = "Ghost";
      }
    }
    window.drawScene();
  };

  window.toggleDebugHitAreas = function () {
    const s = S();
    s.isDebugHitAreas = !s.isDebugHitAreas;
    const btn = document.getElementById("debugHitboxToggleBtn");
    const lbl = document.getElementById("debugHitboxToggleLabel");
    if (btn && lbl) {
      if (s.isDebugHitAreas) {
        btn.className = "px-2 py-0.5 bg-rose-950/70 text-rose-300 font-bold text-[11px] rounded-md border border-rose-600/60 transition flex items-center gap-1";
        lbl.innerText = "Ein";
      } else {
        btn.className = "px-2 py-0.5 bg-slate-800 text-slate-400 font-bold text-[11px] rounded-md border border-slate-700 transition flex items-center gap-1";
        lbl.innerText = "Aus";
      }
    }
    window.drawScene();
  };

  window.cyclePlaybackSpeed = function () {
    const s = S();
    const curIdx = SPEED_STEPS.indexOf(s.currentSpeed);
    s.currentSpeed = SPEED_STEPS[(curIdx + 1) % SPEED_STEPS.length];
    const lbl = document.getElementById("speedToggleLabel");
    if (lbl) lbl.innerText = `${s.currentSpeed.toFixed(1)}x`;
  };

  window.rotatePitch = function () {
    const s = S();
    s.fieldRotation = (s.fieldRotation + 90) % 360;
    const badge = document.getElementById("rotationLevelText");
    if (badge) badge.textContent = `${s.fieldRotation}°`;
    window.resizeCanvasToContainer();
    window.drawScene();
    window.updateActionPopupPosition();
  };

  window.resetZoom = function () {
    const s = S();
    s.viewScale = 1.0;
    s.viewPanX = 0;
    s.viewPanY = 0;
    TC().viewport.updateZoomUI();
    window.drawScene();
  };

  window.toggleViewControls = function () {
    const drawer = document.getElementById("viewControlsDrawer");
    const btn = document.getElementById("viewControlsToggleBtn");
    if (!drawer) return;
    const isHidden = drawer.classList.contains("hidden");
    if (isHidden) {
      drawer.classList.remove("hidden");
      // Intelligente Positionierung: prüfe ob das Popup rechts oder links überläuft
      const rect = btn ? btn.getBoundingClientRect() : null;
      if (rect) {
        const drawerWidth = 288; // w-72 = 18rem = 288px
        const screenWidth = window.innerWidth;
        // Wenn links nicht genug Platz ist oder rechts abgeschnitten wird:
        if (rect.left + drawerWidth > screenWidth - 10) {
          drawer.style.left = "auto";
          drawer.style.right = "0px";
        } else {
          drawer.style.left = "0px";
          drawer.style.right = "auto";
        }
      }
    } else {
      drawer.classList.add("hidden");
    }
  };

  window.changePitchType = function (type) {
    S().currentExercise.pitch_type = type;
    window.drawScene();
    window.recordHistory();
  };
})();
