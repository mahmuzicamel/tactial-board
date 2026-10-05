// static/app.js - Tactical Coach Slim Controller & Module Bridge
// All drawing, interaction, physics and calculations are modularized in static/js/

(function () {
  const TC = () => window.TacticalCoach;
  const S = () => window.TacticalCoach?.state;

  // DOM Elements
  let canvas, ctx;

  // Global references for backwards compatibility & window exposure
  window.canvas = null;
  window.ctx = null;
  Object.defineProperty(window, "currentExercise", {
    get: () => S()?.currentExercise,
    set: (val) => { if (S()) S().currentExercise = val; },
    configurable: true
  });
  Object.defineProperty(window, "currentKeyframeIndex", {
    get: () => S()?.currentKeyframeIndex,
    set: (val) => { if (S()) S().currentKeyframeIndex = val; },
    configurable: true
  });
  Object.defineProperty(window, "selectedElementId", {
    get: () => S()?.selectedElementId,
    set: (val) => { if (S()) S().selectedElementId = val; },
    configurable: true
  });

  // Helper: Toast Notifications
  window.showToast = function (message, isError = false) {
    let container = document.getElementById("toastContainer");
    if (!container) {
      container = document.createElement("div");
      container.id = "toastContainer";
      container.className = "fixed bottom-16 sm:bottom-6 right-4 sm:right-6 z-50 flex flex-col gap-2 pointer-events-none";
      document.body.appendChild(container);
    }
    const toast = document.createElement("div");
    toast.className = `px-3.5 py-2 rounded-xl text-xs font-semibold shadow-xl border flex items-center gap-2 transform transition-all duration-300 translate-y-4 opacity-0 pointer-events-auto ${
      isError
        ? "bg-rose-950/90 text-rose-200 border-rose-500/60 shadow-rose-950/40"
        : "bg-emerald-950/90 text-emerald-200 border-emerald-500/60 shadow-emerald-950/40"
    }`;
    toast.innerHTML = `<i class="fa-solid ${isError ? "fa-circle-exclamation text-rose-400" : "fa-circle-check text-emerald-400"}"></i><span>${message}</span>`;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.remove("translate-y-4", "opacity-0"));
    setTimeout(() => {
      toast.classList.add("translate-y-4", "opacity-0");
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  };

  // URL Helpers
  window.getExerciseIdFromUrl = function () {
    const match = window.location.pathname.match(/\/exercise\/([a-zA-Z0-9_-]+)/);
    if (match) return match[1];
    return new URLSearchParams(window.location.search).get("id");
  };

  window.updateUrlForExercise = function (id, replace = false) {
    if (!id) return;
    const url = `/exercise/${encodeURIComponent(id)}`;
    if (replace) window.history.replaceState({ exerciseId: id }, "", url);
    else if (window.location.pathname !== url) window.history.pushState({ exerciseId: id }, "", url);
  };

  window.copyExerciseShareLink = async function () {
    const s = S();
    const id = s?.currentExercise?.id;
    if (!id || id === "ex_initial") {
      window.showToast("Bitte speichere die Übung zuerst!", true);
      return;
    }
    const url = `${window.location.origin}/exercise/${encodeURIComponent(id)}`;
    try {
      await navigator.clipboard.writeText(url);
      window.showToast("🔗 Link kopiert!");
    } catch {
      window.showToast("Link konnte nicht kopiert werden.", true);
    }
  };

  // Local Storage Drafts
  window.saveLocalDraft = function () {
    try {
      const s = S();
      if (!s) return;
      localStorage.setItem("tactical_coach_draft", JSON.stringify({
        exercise: s.currentExercise,
        keyframeIndex: s.currentKeyframeIndex
      }));
    } catch (e) {}
  };

  window.loadLocalDraft = function () {
    try {
      const draft = localStorage.getItem("tactical_coach_draft");
      return draft ? JSON.parse(draft) : null;
    } catch {
      return null;
    }
  };

  // Form Sync
  window.syncFormToState = function () {
    const s = S();
    if (!s) return;
    const get = (id) => document.getElementById(id)?.value || "";
    s.currentExercise.title = get("exTitle") || "Neue Übung";
    s.currentExercise.age_group = get("exAgeGroup");
    s.currentExercise.focus = get("exFocus");
    s.currentExercise.player_count = get("exPlayers");
    s.currentExercise.dimensions = get("exDimensions");
    s.currentExercise.description = get("exDescription");
    s.currentExercise.coaching_points = get("exCoaching");
    window.saveLocalDraft();
  };

  window.updateFormFields = function () {
    const s = S();
    if (!s) return;
    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = val || "";
    };
    const ex = s.currentExercise;
    set("exTitle", ex.title);
    set("exAgeGroup", ex.age_group);
    set("exFocus", ex.focus);
    set("exPlayers", ex.player_count);
    set("exDimensions", ex.dimensions);
    set("exDescription", ex.description);
    set("exCoaching", ex.coaching_points);
    const pSel = document.getElementById("pitchSelect");
    if (pSel && ex.pitch_type) pSel.value = ex.pitch_type;

    // Synchronisiere Wiedergabe-Optionen (Ghost & Speed)
    const ghostBtn = document.getElementById("ghostToggleBtn");
    const ghostLbl = document.getElementById("ghostToggleLabel");
    if (ghostBtn && ghostLbl) {
      if (S().isGhostMode === "prev") {
        ghostBtn.className = "px-1.5 py-1 bg-cyan-950/70 text-cyan-300 font-bold text-[11px] rounded-md border border-cyan-500/60 transition flex items-center gap-1";
        ghostLbl.innerText = "Ghost: 1";
      } else if (S().isGhostMode === "all") {
        ghostBtn.className = "px-1.5 py-1 bg-purple-950/80 text-purple-200 font-bold text-[11px] rounded-md border border-purple-500/70 transition flex items-center gap-1";
        ghostLbl.innerText = "Ghost: Alle";
      } else {
        ghostBtn.className = "px-1.5 py-1 bg-slate-800 text-slate-400 font-bold text-[11px] rounded-md border border-slate-700 transition flex items-center gap-1";
        ghostLbl.innerText = "Ghost";
      }
    }
    const speedLbl = document.getElementById("speedToggleLabel");
    if (speedLbl) {
      speedLbl.innerText = `${(S().currentSpeed || 1.0).toFixed(1)}x`;
    }
  };

  // Canvas Resize & Dimensions
  window.resizeCanvasToContainer = function () {
    const wrapper = document.getElementById("canvasWrapper");
    if (!wrapper || !canvas) return;
    const rect = wrapper.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(rect.width);
    const h = Math.round(rect.height);
    if (w > 0 && h > 0) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  };

  // Main Scene Drawing
  window.drawScene = function (customElements = null, customArrows = null, customTitle = null) {
    if (!ctx || !canvas || !TC()) return;
    const s = S();
    const kf = TC().getCurrentKeyframe();
    const elements = customElements || kf.elements || [];
    const arrows = customArrows || kf.arrows || [];
    const pitchType = s.currentExercise.pitch_type || "half";

    const { w: dispW, h: dispH } = TC().viewport.getDisplayDimensions(canvas);
    const VIRTUAL_WIDTH = TC().constants.VIRTUAL_WIDTH;
    const VIRTUAL_HEIGHT = TC().constants.VIRTUAL_HEIGHT;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();

    ctx.save();
    const isRotated90 = (s.fieldRotation === 90 || s.fieldRotation === 270);
    const effectiveVW = isRotated90 ? VIRTUAL_HEIGHT : VIRTUAL_WIDTH;
    const effectiveVH = isRotated90 ? VIRTUAL_WIDTH : VIRTUAL_HEIGHT;
    const baseScale = Math.min(dispW / effectiveVW, dispH / effectiveVH);

    ctx.translate(dispW / 2 + s.viewPanX, dispH / 2 + s.viewPanY);
    ctx.scale(s.viewScale, s.viewScale);
    if (s.fieldRotation !== 0) ctx.rotate((s.fieldRotation * Math.PI) / 180);
    ctx.scale(baseScale, baseScale);
    ctx.translate(-VIRTUAL_WIDTH / 2, -VIRTUAL_HEIGHT / 2);

    // 1. Draw Pitch
    TC().pitch.drawPitchBackground(ctx, pitchType);

    // 1b. Zonen & Flächen (Rechteck, Kreis, Dreieck) - Unterste Ebene, unter Linien, Spielern und Elementen
    elements.forEach(el => {
      const isZone = (el.type === "zone_rect" || el.type === "zone_circle" || el.type === "zone_triangle");
      if (isZone) {
        const isSel = (s.selectedElementId === el.id || s.selectedElementIds.includes(el.id));
        TC().elements.drawElementOnCanvas(ctx, el, isSel, s.fieldRotation, s.globalElementScale);
      }
    });

    // 2. Ghost Layer
    if (s.isGhostMode !== "off" && !s.isPlaying && s.currentKeyframeIndex > 0) {
      const startIdx = (s.isGhostMode === "all") ? 0 : (s.currentKeyframeIndex - 1);
      ctx.save();
      for (let k = startIdx; k < s.currentKeyframeIndex; k++) {
        const fromKf = s.currentExercise.keyframes[k];
        const toKf = s.currentExercise.keyframes[k + 1];
        if (!fromKf || !toKf) continue;
        const stepsAgo = s.currentKeyframeIndex - (k + 1);
        const trailAlpha = Math.max(0.18, 0.65 - stepsAgo * 0.14);

        for (const toEl of (toKf.elements || [])) {
          if (toEl.type === "player" || toEl.type === "ball") {
            const fromEl = (fromKf.elements || []).find(it => it.id === toEl.id);
            if (fromEl && Math.hypot(toEl.x - fromEl.x, toEl.y - fromEl.y) > 8) {
              const teamCol = toEl.type === "ball" ? "#facc15" : (toEl.team === "red" ? "#f87171" : toEl.team === "blue" ? "#60a5fa" : "#34d399");
              const { p1, p2 } = TC().geometry.getEffectiveCurveControlPoints(fromEl, toEl);

              ctx.save();
              ctx.strokeStyle = teamCol;
              ctx.lineWidth = Math.max(1.8, 2.8 - stepsAgo * 0.3);
              ctx.setLineDash(stepsAgo > 0 ? [4, 4] : [6, 5]);
              ctx.globalAlpha = trailAlpha;
              ctx.beginPath();
              ctx.moveTo(fromEl.x, fromEl.y);
              ctx.bezierCurveTo(p1.x, p1.y, p2.x, p2.y, toEl.x, toEl.y);
              ctx.stroke();

              ctx.fillStyle = teamCol;
              ctx.globalAlpha = trailAlpha * 0.85;
              ctx.beginPath();
              ctx.arc(fromEl.x, fromEl.y, 3.5, 0, Math.PI * 2);
              ctx.fill();

              const angle = Math.atan2(toEl.y - p2.y, toEl.x - p2.x);
              const headLen = Math.max(7, 10 - stepsAgo * 1.0);
              const offsetR = toEl.type === "ball" ? 14 : 20;
              const arrowTipX = toEl.x - Math.cos(angle) * offsetR;
              const arrowTipY = toEl.y - Math.sin(angle) * offsetR;
              ctx.setLineDash([]);
              ctx.globalAlpha = trailAlpha * 1.2;
              ctx.beginPath();
              ctx.moveTo(arrowTipX, arrowTipY);
              ctx.lineTo(arrowTipX - headLen * Math.cos(angle - Math.PI / 6), arrowTipY - headLen * Math.sin(angle - Math.PI / 6));
              ctx.lineTo(arrowTipX - headLen * Math.cos(angle + Math.PI / 6), arrowTipY - headLen * Math.sin(angle + Math.PI / 6));
              ctx.closePath();
              ctx.fill();

              if (k + 1 === s.currentKeyframeIndex && !s.isPlaying) {
                const handleR = Math.max(4.5, 6 / Math.sqrt(s.viewScale));

                // Gestrichelte Leitlinien zu den Ghost-Kurven-Griffen
                ctx.save();
                ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
                ctx.lineWidth = 1.2;
                ctx.setLineDash([3, 3]);
                ctx.beginPath();
                ctx.moveTo(fromEl.x, fromEl.y);
                ctx.lineTo(p1.x, p1.y);
                ctx.moveTo(toEl.x, toEl.y);
                ctx.lineTo(p2.x, p2.y);
                ctx.stroke();
                ctx.restore();

                ctx.fillStyle = "#ffffff";
                ctx.strokeStyle = teamCol;
                ctx.lineWidth = 2;
                ctx.globalAlpha = 0.95;
                ctx.beginPath();
                ctx.arc(p1.x, p1.y, handleR, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(p2.x, p2.y, handleR, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
              }
              ctx.restore();
            }
          }
        }
      }
      ctx.restore();
    }

    // 3. Persistent arrows from other steps
    if (s.currentExercise.keyframes && s.currentExercise.keyframes.length > 1) {
      s.currentExercise.keyframes.forEach((otherKf, idx) => {
        if (idx === s.currentKeyframeIndex) return;
        (otherKf.arrows || []).forEach(arr => {
          if (arr.persistent) {
            const isSel = (idx === s.selectedArrowPersistentKfIdx && arr === s.selectedArrowPersistentObj);
            const { p1, p2 } = TC().geometry.getArrowCurveControlPoints(arr);
            TC().arrows.drawArrow(ctx, arr.x1, arr.y1, arr.x2, arr.y2, arr.type, arr.color, isSel, null, p1, p2, arr.raw_points);
          }
        });
      });
    }

    // 4. Current Keyframe Arrows
    const nowTime = performance.now() / 1000;
    arrows.forEach((arr, idx) => {
      const isSel = (s.selectedArrowIndex === idx);
      const { p1, p2 } = TC().geometry.getArrowCurveControlPoints(arr);
      TC().arrows.drawArrow(ctx, arr.x1, arr.y1, arr.x2, arr.y2, arr.type, arr.color, isSel, arr.type === "guide" ? nowTime : null, p1, p2, arr.raw_points);
    });

    // 5. In-flight Arrow Drawing
    if (s.isDrawingArrow && s.activeTool !== "select") {
      const aType = (s.activeTool === "pass") ? "pass" : ((s.activeTool === "guide") ? "guide" : "run");
      const col = (s.activeTool === "pass") ? "#facc15" : ((s.activeTool === "guide") ? "#fbbf24" : "#38bdf8");

      if ((s.lineDrawMode === "freehand" || s.lineDrawMode === "raw_freehand") && s.arrowDrawStrokePoints && s.arrowDrawStrokePoints.length > 2) {
        // Draw real-time smooth freehand stroke path following the user's hand/pointer
        ctx.save();
        ctx.strokeStyle = col;
        ctx.lineWidth = 4;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        if (aType === "pass") {
          ctx.setLineDash([8, 8]);
        } else if (aType === "guide") {
          ctx.setLineDash([12, 6]);
        }
        ctx.beginPath();
        ctx.moveTo(s.arrowDrawStrokePoints[0].x, s.arrowDrawStrokePoints[0].y);
        for (let i = 1; i < s.arrowDrawStrokePoints.length; i++) {
          ctx.lineTo(s.arrowDrawStrokePoints[i].x, s.arrowDrawStrokePoints[i].y);
        }
        ctx.stroke();

        // Arrow tip at the end of the stroke
        const pLast = s.arrowDrawStrokePoints[s.arrowDrawStrokePoints.length - 1];
        const pPrev = s.arrowDrawStrokePoints[Math.max(0, s.arrowDrawStrokePoints.length - 4)];
        const tipAngle = Math.atan2(pLast.y - pPrev.y, pLast.x - pPrev.x);
        const arrowSize = (aType === "guide") ? 14 : 10;
        ctx.fillStyle = col;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(pLast.x, pLast.y);
        ctx.lineTo(pLast.x - arrowSize * Math.cos(tipAngle - Math.PI / 6), pLast.y - arrowSize * Math.sin(tipAngle - Math.PI / 6));
        ctx.lineTo(pLast.x - arrowSize * Math.cos(tipAngle + Math.PI / 6), pLast.y - arrowSize * Math.sin(tipAngle + Math.PI / 6));
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else {
        TC().arrows.drawArrow(ctx, s.arrowStartX, s.arrowStartY, s.arrowCurrentX, s.arrowCurrentY, aType, col, false, null);
      }
    }

    // 5b. In-flight Shape Drawing (Rectangle, Circle, Triangle)
    if (s.isDrawingShape && s.activeTool === "shape") {
      const shapeType = s.selectedShapeType || "rect";
      const dx = s.shapeCurrentX - s.shapeStartX;
      const dy = s.shapeCurrentY - s.shapeStartY;
      const dist = Math.hypot(dx, dy);

      ctx.save();
      if (shapeType === "rect") {
        const x = Math.min(s.shapeStartX, s.shapeCurrentX);
        const y = Math.min(s.shapeStartY, s.shapeCurrentY);
        const w = Math.abs(dx);
        const h = Math.abs(dy);
        ctx.fillStyle = "rgba(56, 189, 248, 0.22)";
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = "#38bdf8";
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(x, y, w, h);
      } else if (shapeType === "circle") {
        const radius = dist / 2;
        const cx = (s.shapeStartX + s.shapeCurrentX) / 2;
        const cy = (s.shapeStartY + s.shapeCurrentY) / 2;
        ctx.fillStyle = "rgba(234, 179, 8, 0.22)";
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#eab308";
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.stroke();
      } else if (shapeType === "triangle") {
        const size = dist;
        const cx = (s.shapeStartX + s.shapeCurrentX) / 2;
        const cy = (s.shapeStartY + s.shapeCurrentY) / 2;
        const h = size * 0.866;
        ctx.beginPath();
        ctx.moveTo(cx, cy - h * 0.6);
        ctx.lineTo(cx + size * 0.5, cy + h * 0.4);
        ctx.lineTo(cx - size * 0.5, cy + h * 0.4);
        ctx.closePath();
        ctx.fillStyle = "rgba(168, 85, 247, 0.22)";
        ctx.fill();
        ctx.strokeStyle = "#a855f7";
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.stroke();
      }
      ctx.restore();
    }

    // 6. Draw Elements (Spieler, Bälle, Hütchen, Tore etc. - oberhalb von Zonen und Linien!)
    elements.forEach(el => {
      const isZone = (el.type === "zone_rect" || el.type === "zone_circle" || el.type === "zone_triangle");
      if (!isZone) {
        const isSel = (s.selectedElementId === el.id || s.selectedElementIds.includes(el.id));
        TC().elements.drawElementOnCanvas(ctx, el, isSel, s.fieldRotation, s.globalElementScale);
      }
    });

    // 7. Lasso Selection Polygon
    if (s.isLassoSelecting && s.lassoPoints && s.lassoPoints.length > 1) {
      ctx.save();
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 2 / s.viewScale;
      ctx.setLineDash([6, 4]);
      ctx.fillStyle = "rgba(56, 189, 248, 0.15)";
      ctx.beginPath();
      ctx.moveTo(s.lassoPoints[0].x, s.lassoPoints[0].y);
      for (let i = 1; i < s.lassoPoints.length; i++) ctx.lineTo(s.lassoPoints[i].x, s.lassoPoints[i].y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();

    // Check guide pulsing loop
    window.checkGuidePulseLoop();
  };

  // Guide Line Animation Loop
  let guideAnimFrameId = null;
  window.checkGuidePulseLoop = function () {
    const s = S();
    if (!s) return;
    const kf = TC().getCurrentKeyframe();
    const hasGuide = (kf.arrows || []).some(a => a.type === "guide");
    if (hasGuide && !s.isPlaying) {
      if (!guideAnimFrameId) {
        const loop = () => {
          if (!S().isPlaying && (TC().getCurrentKeyframe().arrows || []).some(a => a.type === "guide")) {
            window.drawScene();
            guideAnimFrameId = requestAnimationFrame(loop);
          } else {
            guideAnimFrameId = null;
          }
        };
        guideAnimFrameId = requestAnimationFrame(loop);
      }
    } else if (!hasGuide && guideAnimFrameId) {
      cancelAnimationFrame(guideAnimFrameId);
      guideAnimFrameId = null;
    }
  };

  // History / Undo Redo Bridge
  let historyManager = null;
  window.recordHistory = function () { if (historyManager) historyManager.record(); };
  window.undo = function () { if (historyManager) historyManager.undo(); };
  window.redo = function () { if (historyManager) historyManager.redo(); };
  window.resetUndoRedo = function () { if (historyManager) historyManager.clear(); };

  // Playback Controller Bridge
  let playbackCtrl = null;
  window.togglePlayAnimation = function () { if (playbackCtrl) playbackCtrl.toggle(); };
  window.startAnimation = function () { if (playbackCtrl) playbackCtrl.start(); };
  window.stopAnimation = function () { if (playbackCtrl) playbackCtrl.stop(); };

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

  const SPEED_STEPS = [0.25, 0.5, 0.75, 1.0, 1.5, 2.0];
  window.cyclePlaybackSpeed = function () {
    const s = S();
    const curIdx = SPEED_STEPS.indexOf(s.currentSpeed);
    s.currentSpeed = SPEED_STEPS[(curIdx + 1) % SPEED_STEPS.length];
    const lbl = document.getElementById("speedToggleLabel");
    if (lbl) lbl.innerText = `${s.currentSpeed.toFixed(1)}x`;
  };

  // Viewport Controls (Zoom, Pan, Rotate)
  window.rotatePitch = function () {
    const s = S();
    s.fieldRotation = (s.fieldRotation + 90) % 360;
    const badge = document.getElementById("rotationLevelText");
    if (badge) badge.textContent = `${s.fieldRotation}°`;
    window.resizeCanvasToContainer();
    window.drawScene();
    window.updateActionPopupPosition();
  };

  window.zoomIn = function () {
    TC().viewport.zoomAt(canvas, S().viewScale + 0.25, null, window.drawScene);
  };

  window.zoomOut = function () {
    TC().viewport.zoomAt(canvas, S().viewScale - 0.25, null, window.drawScene);
  };

  window.resetZoom = function () {
    const s = S();
    s.viewScale = 1.0;
    s.viewPanX = 0;
    s.viewPanY = 0;
    TC().viewport.updateZoomUI();
    window.drawScene();
  };

  let isViewControlsOpen = false;
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

  window.onElementScaleChange = function (val) {
    const s = S();
    s.globalElementScale = parseFloat(val) || 1.0;
    s.currentExercise.element_scale = s.globalElementScale;
    const pStr = `${Math.round(s.globalElementScale * 100)}%`;
    const s1 = document.getElementById("elementScaleSlider");
    const l1 = document.getElementById("elementScaleLabel");
    const s2 = document.getElementById("sidebarElementScaleSlider");
    const l2 = document.getElementById("sidebarElementScaleLabel");
    if (s1) s1.value = s.globalElementScale;
    if (l1) l1.textContent = pStr;
    if (s2) s2.value = s.globalElementScale;
    if (l2) l2.textContent = pStr;
    window.drawScene();
    window.updateActionPopupPosition();
  };

  // Context Action Popup & Floating Inspector
  window.updateActionPopupPosition = function () {
    const popup = document.getElementById("elementActionPopup");
    if (!popup || !canvas || !TC()) return;
    const s = S();
    if (s.isMovingElement) { popup.classList.add("hidden"); return; }
    const kf = TC().getCurrentKeyframe();
    if (!kf) { popup.classList.add("hidden"); return; }

    const elControls = document.getElementById("actionPopupElementControls");
    const arrowControls = document.getElementById("actionPopupArrowControls");
    let posX = 0, posY = 0;

    let targetEl = null;

    if (s.selectedElementIds.length > 0) {
      const items = (kf.elements || []).filter(it => s.selectedElementIds.includes(it.id));
      if (items.length === 0) { popup.classList.add("hidden"); return; }
      let avgX = 0, avgY = 0;
      items.forEach(it => { avgX += it.x; avgY += it.y; });
      avgX /= items.length; avgY /= items.length;
      const sp = TC().viewport.getScreenCoords(canvas, avgX, avgY);
      posX = sp.x; posY = sp.y - 38;
      targetEl = items[0];
      if (elControls) elControls.classList.remove("hidden");
      if (arrowControls) arrowControls.classList.add("hidden");
    } else if (s.selectedElementId) {
      const el = (kf.elements || []).find(it => it.id === s.selectedElementId);
      if (!el) { popup.classList.add("hidden"); return; }
      targetEl = el;

      // Wenn es eine Zone ist (Rechteck, Kreis, Dreieck), platziere das Popup ÜBER der Oberkante der Zone
      if (el.type === "zone_rect") {
        const topVirtualY = el.y - (el.height || 80) / 2;
        const sp = TC().viewport.getScreenCoords(canvas, el.x, topVirtualY);
        posX = sp.x; posY = sp.y - 20;
      } else if (el.type === "zone_circle") {
        const topVirtualY = el.y - (el.radius || 50);
        const sp = TC().viewport.getScreenCoords(canvas, el.x, topVirtualY);
        posX = sp.x; posY = sp.y - 20;
      } else if (el.type === "zone_triangle") {
        const triH = (el.size || 70) * 0.866;
        const topVirtualY = el.y - triH * 0.6;
        const sp = TC().viewport.getScreenCoords(canvas, el.x, topVirtualY);
        posX = sp.x; posY = sp.y - 20;
      } else {
        const sp = TC().viewport.getScreenCoords(canvas, el.x, el.y);
        posX = sp.x; posY = sp.y - 32;
      }

      if (elControls) elControls.classList.remove("hidden");
      if (arrowControls) arrowControls.classList.add("hidden");
    } else if (s.selectedArrowIndex !== null && kf.arrows && kf.arrows[s.selectedArrowIndex]) {
      const arr = kf.arrows[s.selectedArrowIndex];
      // Popup am Endpunkt (Pfeilspitze) platzieren mit genügend Abstand, damit keine Kurven-Griffe verdeckt werden
      const sp = TC().viewport.getScreenCoords(canvas, arr.x2, arr.y2);
      posX = sp.x; posY = sp.y - 48;
      if (elControls) elControls.classList.add("hidden");
      if (arrowControls) arrowControls.classList.remove("hidden");
      window.updateArrowPersistentButtonState(arr);
    } else {
      popup.classList.add("hidden");
      return;
    }

    const isZone = targetEl && (targetEl.type === "zone_rect" || targetEl.type === "zone_circle" || targetEl.type === "zone_triangle");

    // Passe Button-Sichtbarkeiten spezifisch für Zonen vs. Spieler/Objekte an
    const focusBtn = document.getElementById("actionPopupFocusBtn");
    const jumpBtn = document.getElementById("actionPopupJumpBtn");
    const rotateLeftBtn = document.getElementById("actionPopupRotateLeftBtn");
    const rotateRightBtn = document.getElementById("actionPopupRotateRightBtn");

    if (focusBtn) focusBtn.classList.toggle("hidden", !!isZone);
    if (jumpBtn) jumpBtn.classList.toggle("hidden", !!isZone);
    if (rotateLeftBtn) rotateLeftBtn.classList.toggle("hidden", !!isZone);
    if (rotateRightBtn) rotateRightBtn.classList.toggle("hidden", !!isZone);

    const halfW = (popup.offsetWidth || 220) / 2;
    const clampedX = Math.max(halfW + 10, Math.min(window.innerWidth - halfW - 10, posX));
    // Nicht zu weit oben am Screenrand abklemmen (mindestens 56px Abstand zur Header-Leiste)
    const clampedY = Math.max(56, posY);
    popup.style.left = `${clampedX}px`;
    popup.style.top = `${clampedY}px`;
    popup.classList.remove("hidden");
    window.updateFocusButtonState();
  };

  window.updateArrowPersistentButtonState = function (arr) {
    const btn = document.getElementById("actionPopupPersistentBtn");
    const lbl = document.getElementById("actionPopupPersistentLabel");
    const rBtn = document.getElementById("actionPopupArrowResetCurveBtn");
    if (rBtn) {
      const hasCurve = (arr.cp1_dx !== undefined && arr.cp1_dx !== 0) || (arr.cp1_dy !== undefined && arr.cp1_dy !== 0) ||
                       (arr.cp2_dx !== undefined && arr.cp2_dx !== 0) || (arr.cp2_dy !== undefined && arr.cp2_dy !== 0);
      rBtn.classList.toggle("hidden", !hasCurve);
    }
    if (!btn || !lbl || !arr) return;
    if (arr.persistent) {
      btn.className = "h-8 px-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1 text-[11px] font-bold shadow-md shadow-emerald-500/30";
      lbl.innerText = "Alle Schritte ✓";
    } else {
      btn.className = "h-8 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-400 flex items-center gap-1 text-[11px] font-bold border border-slate-700";
      lbl.innerText = "Dauerhaft machen";
    }
  };

  window.updateFocusButtonState = function () {
    const s = S();
    const kf = TC().getCurrentKeyframe();
    const btn = document.getElementById("actionPopupFocusBtn");
    if (!btn || !kf) return;
    let isFocused = false;
    if (s.selectedElementIds.length > 0) isFocused = kf.elements.some(it => s.selectedElementIds.includes(it.id) && it.focus);
    else if (s.selectedElementId) {
      const el = kf.elements.find(it => it.id === s.selectedElementId);
      isFocused = el ? !!el.focus : false;
    }
    if (isFocused) {
      btn.className = "w-8 h-8 rounded-lg bg-yellow-500 text-black flex items-center justify-center text-xs shadow-md shadow-yellow-500/30";
    } else {
      btn.className = "w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-yellow-400 flex items-center justify-center text-xs";
    }

    const jBtn = document.getElementById("actionPopupJumpBtn");
    if (jBtn) {
      let isJumping = false;
      if (s.selectedElementId) {
        const el = kf.elements.find(it => it.id === s.selectedElementId);
        if (el && el.jump) isJumping = true;
      }
      if (isJumping) jBtn.className = "w-8 h-8 rounded-lg bg-purple-600 text-white flex items-center justify-center text-xs shadow-md shadow-purple-500/30";
      else jBtn.className = "w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-purple-400 flex items-center justify-center text-xs";
    }

    const rBtn = document.getElementById("actionPopupResetCurveBtn");
    if (rBtn) {
      let hasCurve = false;
      if (s.selectedElementId && s.currentKeyframeIndex > 0) {
        const el = kf.elements.find(it => it.id === s.selectedElementId);
        if (el && (el.cp1_dx !== undefined || el.cp1_dy !== undefined || el.cp2_dx !== undefined || el.cp2_dy !== undefined)) hasCurve = true;
      }
      rBtn.classList.toggle("hidden", !hasCurve);
    }

    // Zone Color Palette visibility & active color indicator
    const zoneColorControls = document.getElementById("actionPopupZoneColorControls");
    if (zoneColorControls) {
      const curEl = s.selectedElementId ? kf.elements.find(it => it.id === s.selectedElementId) : null;
      const isZone = curEl && (curEl.type === "zone_rect" || curEl.type === "zone_circle" || curEl.type === "zone_triangle");
      zoneColorControls.classList.toggle("hidden", !isZone);

      if (isZone) {
        const curColor = curEl.color ? curEl.color.toLowerCase() : "";
        zoneColorControls.querySelectorAll("[data-zone-color]").forEach(dot => {
          const c = dot.getAttribute("data-zone-color").toLowerCase();
          if (c === curColor) {
            dot.classList.add("ring-2", "ring-white", "scale-110");
          } else {
            dot.classList.remove("ring-2", "ring-white", "scale-110");
          }
        });
      }
    }
  };

  function getForwardOffset(distance = 45) {
    const s = S();
    const rad = ((s.fieldRotation || 0) * Math.PI) / 180;
    const dx = -distance * Math.sin(rad);
    const dy = -distance * Math.cos(rad);
    return { dx: Math.round(dx), dy: Math.round(dy) };
  }

  // Element Actions
  window.spawnElement = function (type, options = {}) {
    const s = S();
    const kf = TC().getCurrentKeyframe();
    let x = 500, y = 350;
    if (s.selectedElementId) {
      const prevEl = kf.elements.find(it => it.id === s.selectedElementId);
      if (prevEl) {
        const offset = getForwardOffset(45);
        x = Math.max(30, Math.min(970, (prevEl.x || 500) + offset.dx));
        y = Math.max(30, Math.min(670, (prevEl.y || 350) + offset.dy));
      }
    } else if (type === "player") {
      const existing = kf.elements.filter(e => e.type === "player" && e.team === (options.team || "blue"));
      x = 350 + (existing.length % 5) * 60;
      y = 200 + Math.floor(existing.length / 5) * 70;
    } else if (type === "ball") {
      x = 500; y = 350;
    }
    const newEl = {
      id: "el_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
      type,
      x: Math.round(x),
      y: Math.round(y),
      rotation: 0,
      ...options
    };
    if (type === "player" && !newEl.number) {
      const sameTeam = kf.elements.filter(e => e.type === "player" && e.team === newEl.team);
      newEl.number = (sameTeam.length + 1).toString();
    }
    kf.elements.push(newEl);
    s.selectedElementId = newEl.id;
    s.selectedElementIds = [];
    s.selectedArrowIndex = null;

    // Stationary Training Equipment propagates to ALL keyframes in the exercise!
    if (TC().constants.isEquipment(type) && s.currentExercise && Array.isArray(s.currentExercise.keyframes)) {
      s.currentExercise.keyframes.forEach((otherKf, idx) => {
        if (idx !== s.currentKeyframeIndex) {
          const exists = otherKf.elements.some(it => it.id === newEl.id);
          if (!exists) {
            otherKf.elements.push(JSON.parse(JSON.stringify(newEl)));
          }
        }
      });
    }

    TC().inspectors.showInspector(newEl);
    window.drawScene();
    window.updateActionPopupPosition();
    window.recordHistory();
  };

  window.duplicateSelectedElement = function () {
    const s = S();
    const kf = TC().getCurrentKeyframe();
    if (!kf) return;
    const offset = getForwardOffset(45);
    if (s.selectedElementIds.length > 0) {
      const newIds = [];
      kf.elements.forEach(el => {
        if (s.selectedElementIds.includes(el.id)) {
          const clone = JSON.parse(JSON.stringify(el));
          clone.id = "el_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
          clone.x = Math.max(30, Math.min(970, clone.x + offset.dx));
          clone.y = Math.max(30, Math.min(670, clone.y + offset.dy));
          kf.elements.push(clone);
          newIds.push(clone.id);
        }
      });
      s.selectedElementIds = newIds;
      TC().inspectors.showGroupInspector(newIds.length);
      window.drawScene();
      window.updateActionPopupPosition();
      window.recordHistory();
      return;
    }
    if (s.selectedElementId) {
      const el = kf.elements.find(it => it.id === s.selectedElementId);
      if (el) {
        const clone = JSON.parse(JSON.stringify(el));
        clone.id = "el_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
        clone.x = Math.max(30, Math.min(970, clone.x + offset.dx));
        clone.y = Math.max(30, Math.min(670, clone.y + offset.dy));
        if (clone.type === "player" && clone.number) {
          const num = parseInt(clone.number, 10);
          if (!isNaN(num)) clone.number = (num + 1).toString();
        }
        kf.elements.push(clone);
        s.selectedElementId = clone.id;
        TC().inspectors.showInspector(clone);
        window.drawScene();
        window.updateActionPopupPosition();
        window.recordHistory();
      }
    }
  };

  window.deleteSelectedElement = function () {
    const s = S();
    const kf = TC().getCurrentKeyframe();
    if (!kf) return;
    if (s.selectedElementIds.length > 0) {
      const idsToDelete = [...s.selectedElementIds];
      kf.elements = kf.elements.filter(el => !idsToDelete.includes(el.id));
      if (s.currentExercise && Array.isArray(s.currentExercise.keyframes)) {
        s.currentExercise.keyframes.forEach(otherKf => {
          otherKf.elements = otherKf.elements.filter(el => !(idsToDelete.includes(el.id) && TC().constants.isEquipment(el.type)));
        });
      }
      s.selectedElementIds = [];
      s.selectedElementId = null;
    } else if (s.selectedElementId) {
      const idToDelete = s.selectedElementId;
      const elToDelete = kf.elements.find(el => el.id === idToDelete);
      kf.elements = kf.elements.filter(el => el.id !== idToDelete);
      if (elToDelete && TC().constants.isEquipment(elToDelete.type) && s.currentExercise && Array.isArray(s.currentExercise.keyframes)) {
        s.currentExercise.keyframes.forEach(otherKf => {
          otherKf.elements = otherKf.elements.filter(el => el.id !== idToDelete);
        });
      }
      s.selectedElementId = null;
    } else if (s.selectedArrowIndex !== null) {
      kf.arrows.splice(s.selectedArrowIndex, 1);
      s.selectedArrowIndex = null;
      s.selectedArrowPart = null;
    }
    TC().inspectors.hideInspector();
    window.drawScene();
    window.updateActionPopupPosition();
    window.recordHistory();
  };

  function hexToRgba(hex, alpha = 0.2) {
    if (!hex) return `rgba(56, 189, 248, ${alpha})`;
    let c = hex.replace("#", "");
    if (c.length === 3) c = c.split("").map(x => x + x).join("");
    const num = parseInt(c, 16);
    if (isNaN(num)) return `rgba(56, 189, 248, ${alpha})`;
    const r = (num >> 16) & 255;
    const g = (num >> 8) & 255;
    const b = num & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  window.setSelectedZoneColor = function (colorHex) {
    const s = S();
    const kf = TC().getCurrentKeyframe();
    if (!kf) return;
    const items = s.selectedElementIds.length > 0
      ? kf.elements.filter(it => s.selectedElementIds.includes(it.id))
      : (s.selectedElementId ? [kf.elements.find(it => it.id === s.selectedElementId)].filter(Boolean) : []);

    items.forEach(el => {
      if (el.type === "zone_rect" || el.type === "zone_circle" || el.type === "zone_triangle") {
        el.color = colorHex;
        el.fillColor = hexToRgba(colorHex, 0.2);
      }
    });

    window.drawScene();
    window.updateFocusButtonState();
    window.recordHistory();
  };

  window.rotateSelectedElement = function (deltaDeg = 45) {
    const s = S();
    const kf = TC().getCurrentKeyframe();
    if (!kf) return;
    if (s.selectedElementIds.length > 0) {
      kf.elements.forEach(it => {
        if (s.selectedElementIds.includes(it.id)) it.rotation = ((it.rotation || 0) + deltaDeg + 360) % 360;
      });
    } else if (s.selectedElementId) {
      const el = kf.elements.find(it => it.id === s.selectedElementId);
      if (el) el.rotation = ((el.rotation || 0) + deltaDeg + 360) % 360;
    }
    window.drawScene();
    window.recordHistory();
  };

  window.scaleSelectedElement = function (delta = 0.15) {
    const s = S();
    const kf = TC().getCurrentKeyframe();
    if (!kf) return;
    const factor = 1 + delta;
    const items = s.selectedElementIds.length > 0
      ? kf.elements.filter(it => s.selectedElementIds.includes(it.id))
      : (s.selectedElementId ? [kf.elements.find(it => it.id === s.selectedElementId)].filter(Boolean) : []);

    items.forEach(el => {
      if (el.type === "zone_rect") {
        el.width = Math.max(30, Math.min(800, Math.round((el.width || 120) * factor)));
        el.height = Math.max(20, Math.min(600, Math.round((el.height || 80) * factor)));
      } else if (el.type === "zone_circle") {
        el.radius = Math.max(15, Math.min(400, Math.round((el.radius || 50) * factor)));
      } else if (el.type === "zone_triangle") {
        el.size = Math.max(25, Math.min(500, Math.round((el.size || 70) * factor)));
      } else {
        el.scale = Math.max(0.4, Math.min(3.0, (el.scale || 1.0) * factor));
      }
    });

    window.drawScene();
    window.updateActionPopupPosition();
    window.recordHistory();
  };

  window.toggleFocusSelectedElement = function () {
    const s = S();
    const kf = TC().getCurrentKeyframe();
    if (!kf) return;
    if (s.selectedElementIds.length > 0) {
      const items = kf.elements.filter(it => s.selectedElementIds.includes(it.id));
      const anyF = items.some(it => it.focus);
      items.forEach(it => { it.focus = !anyF; });
    } else if (s.selectedElementId) {
      const el = kf.elements.find(it => it.id === s.selectedElementId);
      if (el) el.focus = !el.focus;
    }
    window.drawScene();
    window.updateFocusButtonState();
    window.recordHistory();
  };

  window.toggleSelectedElementJump = function () {
    const s = S();
    const kf = TC().getCurrentKeyframe();
    if (!kf || !s.selectedElementId) return;
    const el = kf.elements.find(it => it.id === s.selectedElementId);
    if (el) {
      el.jump = !el.jump;
      window.drawScene();
      window.updateFocusButtonState();
      window.recordHistory();
    }
  };

  window.resetSelectedElementCurve = function () {
    const s = S();
    const kf = TC().getCurrentKeyframe();
    if (!kf || !s.selectedElementId) return;
    const el = kf.elements.find(it => it.id === s.selectedElementId);
    if (el) {
      delete el.cp1_dx; delete el.cp1_dy; delete el.cp2_dx; delete el.cp2_dy;
      window.drawScene();
      window.updateFocusButtonState();
      window.recordHistory();
      window.showToast("Bogen begradigt");
    }
  };

  window.resetSelectedArrowCurve = function () {
    const s = S();
    const kf = TC().getCurrentKeyframe();
    if (!kf || s.selectedArrowIndex === null || !kf.arrows[s.selectedArrowIndex]) return;
    const arr = kf.arrows[s.selectedArrowIndex];
    delete arr.cp1_dx; delete arr.cp1_dy; delete arr.cp2_dx; delete arr.cp2_dy;
    window.drawScene();
    window.updateArrowPersistentButtonState(arr);
    window.recordHistory();
    window.showToast("Pfeilkurve begradigt");
  };

  window.toggleArrowPersistent = function () {
    const s = S();
    const kf = TC().getCurrentKeyframe();
    if (!kf || s.selectedArrowIndex === null || !kf.arrows[s.selectedArrowIndex]) return;
    const arr = kf.arrows[s.selectedArrowIndex];
    arr.persistent = !arr.persistent;
    window.updateArrowPersistentButtonState(arr);
    window.drawScene();
    window.recordHistory();
  };

  window.deselectElement = function () {
    const s = S();
    if (!s) return;
    s.selectedElementId = null;
    s.selectedElementIds = [];
    s.selectedArrowIndex = null;
    s.selectedArrowPart = null;
    TC()?.inspectors?.hideInspector();
    window.updateActionPopupPosition();
    window.drawScene();
  };

  window.syncFloatingProps = function () {
    const s = S();
    const kf = TC().getCurrentKeyframe();
    if (!kf || !s.selectedElementId) return;
    const el = kf.elements.find(it => it.id === s.selectedElementId);
    if (el) {
      el.number = document.getElementById("floatingPropNumber")?.value || "";
      el.name = document.getElementById("floatingPropName")?.value || "";
      window.drawScene();
      window.recordHistory();
    }
  };

  // Canvas Clearing
  window.clearCurrentCanvas = function () {
    TC().popovers.openClearConfirmModal();
  };

  window.closeClearConfirmModal = function (proceed = false) {
    TC().popovers.closeClearConfirmModal();
    if (proceed) {
      const s = S();
      const kf = TC().getCurrentKeyframe();
      if (!kf) return;
      kf.arrows = [];
      kf.elements = kf.elements.filter(el => TC().constants.isEquipment(el.type));
      s.selectedElementId = null;
      s.selectedElementIds = [];
      TC().inspectors.hideInspector();
      window.drawScene();
      window.recordHistory();
      window.saveLocalDraft();
      window.showToast("🧹 Schritt geleert!");
    }
  };

  // Keyframes Timeline
  window.renderKeyframeTabs = function () {
    TC().timeline.renderKeyframeTabs(window.selectKeyframe, window.editKeyframeTitle, window.moveKeyframeToIndex);
  };

  window.selectKeyframe = function (index) {
    const s = S();
    if (index === s.currentKeyframeIndex) return;
    s.currentKeyframeIndex = index;
    window.deselectElement();
    window.renderKeyframeTabs();
    window.drawScene();
  };

  window.insertKeyframeAfterCurrent = function () {
    const s = S();
    const ex = s.currentExercise;
    const curKf = TC().getCurrentKeyframe();
    const newKf = JSON.parse(JSON.stringify(curKf));
    newKf.title = `Schritt ${s.currentKeyframeIndex + 2}`;
    ex.keyframes.splice(s.currentKeyframeIndex + 1, 0, newKf);
    s.currentKeyframeIndex++;
    window.renderKeyframeTabs();
    window.drawScene();
    window.recordHistory();
    window.saveLocalDraft();
  };

  window.duplicateKeyframe = function () {
    const s = S();
    const ex = s.currentExercise;
    const curKf = TC().getCurrentKeyframe();
    const newKf = JSON.parse(JSON.stringify(curKf));
    newKf.title = `Schritt ${ex.keyframes.length + 1}`;
    ex.keyframes.push(newKf);
    s.currentKeyframeIndex = ex.keyframes.length - 1;
    window.renderKeyframeTabs();
    window.drawScene();
    window.recordHistory();
    window.saveLocalDraft();
  };

  window.deleteCurrentKeyframe = function () {
    const s = S();
    const ex = s.currentExercise;
    if (ex.keyframes.length <= 1) {
      window.showToast("Die Übung muss mindestens einen Schritt enthalten.", true);
      return;
    }
    ex.keyframes.splice(s.currentKeyframeIndex, 1);
    s.currentKeyframeIndex = Math.max(0, s.currentKeyframeIndex - 1);
    window.deselectElement();
    window.renderKeyframeTabs();
    window.drawScene();
    window.recordHistory();
    window.saveLocalDraft();
  };

  window.editKeyframeTitle = function (index) {
    const ex = S().currentExercise;
    const kf = ex.keyframes[index];
    if (!kf) return;
    const newTitle = prompt("Name für diesen Schritt:", kf.title || `Schritt ${index + 1}`);
    if (newTitle !== null && newTitle.trim()) {
      kf.title = newTitle.trim();
      window.renderKeyframeTabs();
      window.recordHistory();
      window.saveLocalDraft();
    }
  };

  window.moveKeyframeToIndex = function (fromIdx, toIdx) {
    const ex = S().currentExercise;
    if (fromIdx === toIdx || fromIdx < 0 || toIdx < 0 || fromIdx >= ex.keyframes.length || toIdx >= ex.keyframes.length) return;
    const [moved] = ex.keyframes.splice(fromIdx, 1);
    ex.keyframes.splice(toIdx, 0, moved);
    S().currentKeyframeIndex = toIdx;
    window.renderKeyframeTabs();
    window.drawScene();
    window.recordHistory();
    window.saveLocalDraft();
  };

  // Exercise API & Catalog
  window.saveCurrentExercise = async function () {
    window.syncFormToState();
    try {
      const res = await TC().client.saveExercise(S().currentExercise);
      if (res.status === "ok") {
        S().currentExercise.id = res.id;
        window.saveLocalDraft();
        window.updateUrlForExercise(res.id);
        window.showToast("✅ Übung erfolgreich gespeichert!");
        window.refreshExerciseBadge();
      }
    } catch (err) {
      window.showToast("Fehler beim Speichern: " + err.message, true);
    }
  };

  window.refreshExerciseBadge = async function () {
    try {
      const list = await TC().client.fetchExercises();
      const badge = document.getElementById("exerciseCountBadge");
      if (badge && Array.isArray(list)) badge.innerText = list.length;
    } catch {}
  };

  window.createNewExercise = function () {
    if (confirm("Neue leere Übung anlegen? Nicht gespeicherte Änderungen gehen verloren.")) {
      if (S().isPlaying) window.stopAnimation();
      S().currentExercise = TC().store.createEmptyExercise();
      S().currentKeyframeIndex = 0;
      window.deselectElement();
      window.updateFormFields();
      window.renderKeyframeTabs();
      window.drawScene();
      window.resetUndoRedo();
      window.saveLocalDraft();
      if (window.location.pathname !== "/") window.history.pushState({}, "", "/");
    }
  };

  window.openExerciseCatalog = function () {
    TC().popovers.openExerciseCatalog();
    window.loadCatalogExercises();
  };

  window.closeCatalogModal = function () {
    TC().popovers.closeCatalogModal();
  };

  window.loadCatalogExercises = async function (search = "") {
    try {
      const list = await TC().client.fetchExercises(search);
      const container = document.getElementById("catalogList");
      if (!container) return;
      container.innerHTML = "";
      if (list.length === 0) {
        container.innerHTML = `<div class="text-center py-8 text-xs text-slate-400">Keine Übungen gefunden.</div>`;
        return;
      }
      list.forEach(ex => {
        const item = document.createElement("div");
        item.className = "p-2.5 sm:p-3 bg-slate-800/90 hover:bg-slate-750 border border-slate-700/80 rounded-xl flex items-center justify-between gap-2 transition";
        item.innerHTML = `
          <div class="flex items-center gap-2.5 min-w-0 flex-1">
            <div class="w-10 h-10 shrink-0 bg-emerald-950/70 rounded-lg border border-emerald-700/60 flex items-center justify-center text-emerald-400 font-bold text-[11px] leading-tight text-center px-1">
              ${(ex.age_group || "").split(" ")[0] || "U"}
            </div>
            <div class="min-w-0 flex-1">
              <h4 class="text-xs font-bold text-white truncate" title="${ex.title}">${ex.title}</h4>
              <div class="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-slate-400 mt-0.5">
                <span class="truncate">🎯 ${ex.focus}</span>
                <span class="truncate">👥 ${ex.player_count}</span>
                <span class="truncate">📐 ${ex.dimensions}</span>
              </div>
            </div>
          </div>
          <div class="flex items-center gap-1.5 shrink-0">
            <button onclick="loadExerciseFromCatalog('${ex.id}')" class="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-xs font-semibold rounded-lg shadow transition">
              Öffnen
            </button>
            <button onclick="deleteExerciseFromCatalog('${ex.id}')" class="p-1.5 text-slate-400 hover:text-rose-400 text-xs transition" title="Löschen">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        `;
        container.appendChild(item);
      });
    } catch (err) {
      console.error(err);
    }
  };

  window.filterCatalog = function () {
    const query = document.getElementById("catalogSearch")?.value || "";
    window.loadCatalogExercises(query);
  };

  window.loadExerciseFromCatalog = async function (id, updateUrl = true) {
    try {
      if (S().isPlaying) window.stopAnimation();
      const data = await TC().client.fetchExerciseById(id);
      if (!data || !data.keyframes) throw new Error("Ungültiges Übungsformat");
      S().currentExercise = data;
      S().currentKeyframeIndex = 0;
      window.deselectElement();
      window.updateFormFields();
      window.renderKeyframeTabs();
      window.drawScene();
      window.resetUndoRedo();
      window.closeCatalogModal();
      TC().popovers.closeSidebarMenu();
      window.saveLocalDraft();
      if (updateUrl) window.updateUrlForExercise(data.id);
    } catch (err) {
      window.showToast("Fehler beim Laden: " + err.message, true);
    }
  };

  window.deleteExerciseFromCatalog = async function (id) {
    if (confirm("Übung wirklich löschen?")) {
      await TC().client.deleteExercise(id);
      await window.loadCatalogExercises();
      window.refreshExerciseBadge();
    }
  };

  // Export, Video & Print
  window.currentExportVideoUrl = "";
  window.openExportModal = function () {
    TC().popovers.openExportModal();
    window.preparePhotoSnapshot();
  };

  window.closeExportModal = function () {
    TC().popovers.closeExportModal();
    const player = document.getElementById("exportVideoPlayer");
    if (player) { player.pause(); player.src = ""; }
  };

  window.openDetailsModal = function () {
    document.getElementById("detailsModal")?.classList.remove("hidden");
  };

  window.closeDetailsModal = function () {
    document.getElementById("detailsModal")?.classList.add("hidden");
  };

  window.switchSidebarTab = function (tab) {
    const tEx = document.getElementById("sidebarTabExercises");
    const tDet = document.getElementById("sidebarTabDetails");
    const cEx = document.getElementById("sidebarContentExercises");
    const cDet = document.getElementById("sidebarContentDetails");
    if (!tEx || !tDet || !cEx || !cDet) return;
    if (tab === "exercises") {
      tEx.className = "flex-1 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition bg-slate-800 text-emerald-400 shadow";
      tDet.className = "flex-1 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition text-slate-400 hover:text-white";
      cEx.classList.remove("hidden");
      cDet.classList.add("hidden");
      window.loadCatalogExercises();
    } else {
      tDet.className = "flex-1 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition bg-slate-800 text-emerald-400 shadow";
      tEx.className = "flex-1 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition text-slate-400 hover:text-white";
      cDet.classList.remove("hidden");
      cEx.classList.add("hidden");
    }
  };

  window.preparePhotoSnapshot = function () {
    if (!canvas) return;
    const dataUrl = canvas.toDataURL("image/png");
    const imgEl = document.getElementById("exportSnapshotImg");
    if (imgEl) imgEl.src = dataUrl;
    const box = document.getElementById("photoPreviewBox");
    if (box) box.classList.remove("hidden");
  };

  window.triggerServerVideoRender = async function () {
    const s = S();
    const btn = document.getElementById("btnRenderVideo");
    const statusBox = document.getElementById("videoRenderStatus");
    const resultBox = document.getElementById("videoResultBox");
    const exId = s.currentExercise.id;
    if (!exId || exId === "ex_initial") {
      window.showToast("Bitte speichere die Übung zuerst!", true);
      return;
    }
    if (btn) btn.disabled = true;
    if (statusBox) statusBox.classList.remove("hidden");
    if (resultBox) resultBox.classList.add("hidden");
    try {
      const data = await TC().client.renderExerciseVideo(exId);
      const videoUrl = data.video_url || (data.exercise && data.exercise.video_mp4);
      if (data.status === "ok" && videoUrl) {
        window.currentExportVideoUrl = videoUrl;
        const player = document.getElementById("exportVideoPlayer");
        if (player) {
          player.src = `${videoUrl}?t=${Date.now()}`;
          player.load();
        }
        if (resultBox) resultBox.classList.remove("hidden");
        window.showToast("🎬 Video fertig generiert!");
      } else {
        throw new Error(data.detail || "Keine Video-URL zurückerhalten");
      }
    } catch (e) {
      window.showToast("Fehler beim Video-Rendern: " + e.message, true);
    } finally {
      if (btn) btn.disabled = false;
      if (statusBox) statusBox.classList.add("hidden");
    }
  };

  window.downloadBlobFile = async function (url, filename) {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const bUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = bUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(bUrl);
    } catch {
      window.open(url, "_blank");
    }
  };

  window.shareMedia = async function (type) {
    const s = S();
    const title = s.currentExercise.title || "Taktikübung";
    if (navigator.share) {
      try {
        if (type === "video" && window.currentExportVideoUrl) {
          const res = await fetch(window.currentExportVideoUrl);
          const blob = await res.blob();
          const file = new File([blob], `${title}.mp4`, { type: "video/mp4" });
          if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({ title, files: [file] });
            return;
          }
        } else if (type === "photo") {
          const res = await fetch(canvas.toDataURL("image/png"));
          const blob = await res.blob();
          const file = new File([blob], `${title}.png`, { type: "image/png" });
          if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({ title, files: [file] });
            return;
          }
        }
        await navigator.share({ title, url: window.location.href });
      } catch {}
    } else {
      if (type === "photo") window.exportCanvasPNG();
      else if (window.currentExportVideoUrl) window.downloadBlobFile(window.currentExportVideoUrl, `${title}.mp4`);
    }
  };

  window.exportCanvasPNG = function () {
    const link = document.createElement("a");
    link.download = `${(S().currentExercise.title || "taktik").replace(/\s+/g, "_")}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  window.printExerciseSheet = function () {
    const dataUrl = canvas.toDataURL("image/png");
    const ex = S().currentExercise;
    const win = window.open("", "_blank");
    win.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>${ex.title} - Trainingsblatt</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; color: #111; max-width: 800px; margin: auto; }
          h1 { font-size: 20px; margin-bottom: 4px; }
          .meta { font-size: 13px; color: #555; margin-bottom: 15px; border-bottom: 1px solid #ccc; padding-bottom: 8px; }
          img { width: 100%; border: 1px solid #aaa; border-radius: 6px; margin-bottom: 15px; }
          .section { margin-bottom: 12px; }
          .section-title { font-weight: bold; font-size: 13px; text-transform: uppercase; color: #2d6a4f; margin-bottom: 4px; }
          .section-text { font-size: 13px; white-space: pre-wrap; line-height: 1.5; }
        </style>
      </head>
      <body>
        <h1>${ex.title}</h1>
        <div class="meta">
          <strong>Altersklasse:</strong> ${ex.age_group} | 
          <strong>Schwerpunkt:</strong> ${ex.focus} | 
          <strong>Spieler:</strong> ${ex.player_count} | 
          <strong>Feld:</strong> ${ex.dimensions}
        </div>
        <img src="${dataUrl}" />
        <div class="section">
          <div class="section-title">Aufbau & Ablauf</div>
          <div class="section-text">${ex.description || "Keine Beschreibung angegeben."}</div>
        </div>
        <div class="section">
          <div class="section-title">Coaching-Punkte</div>
          <div class="section-text">${ex.coaching_points || "Keine Coaching-Punkte hinterlegt."}</div>
        </div>
        <script>window.onload = function() { window.print(); }<\/script>
      </body>
      </html>
    `);
    win.document.close();
  };

  // Wire Interaction & Pointer Events
  function setupEvents() {
    canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) > 20) {
        TC().viewport.zoomAt(canvas, S().viewScale * (e.deltaY < 0 ? 1.12 : 0.89), { x: e.clientX, y: e.clientY }, window.drawScene);
      } else {
        S().viewPanX -= e.deltaX;
        S().viewPanY -= e.deltaY;
        window.drawScene();
      }
    }, { passive: false });

    const getCoords = (evt) => TC().viewport.getCanvasCoords(canvas, evt);
    const callbacks = {
      drawScene: window.drawScene,
      updateActionPopupPosition: window.updateActionPopupPosition,
      recordHistory: window.recordHistory
    };

    const onDown = (e) => TC().pointer.handleCanvasPointerDown(e, canvas, getCoords, callbacks);
    const onMove = (e) => TC().pointer.handleCanvasPointerMove(e, canvas, getCoords, callbacks);
    const onUp = (e) => TC().pointer.handleCanvasPointerUp(e, canvas, callbacks);

    canvas.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);

    canvas.addEventListener("touchstart", onDown, { passive: false });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onUp, { passive: false });
    window.addEventListener("touchcancel", onUp, { passive: false });

    // Keyboard Shortcuts
    window.addEventListener("keydown", (e) => {
      const tag = e.target.tagName.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === "z" || e.key === "Z")) {
        e.preventDefault(); window.undo();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === "y" || e.key === "Y" || (e.shiftKey && (e.key === "z" || e.key === "Z")))) {
        e.preventDefault(); window.redo();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (S().selectedElementId || S().selectedElementIds.length > 0 || S().selectedArrowIndex !== null) {
          e.preventDefault(); window.deleteSelectedElement();
        }
      } else if (e.key === " " && !e.repeat) {
        e.preventDefault(); window.togglePlayAnimation();
      }
    });

    // Dismiss popovers on outside click
    TC().popovers.initGlobalClickDismiss();
  }

  // Application Initialization
  async function init() {
    canvas = document.getElementById("tacticCanvas") || document.getElementById("tacticsCanvas");
    if (!canvas) {
      console.error("❌ Canvas element not found!");
      return;
    }
    ctx = canvas.getContext("2d");
    window.canvas = canvas;
    window.ctx = ctx;

    // Initialize Subsystems
    historyManager = new (TC().HistoryManager)(
      () => ({ exercise: JSON.parse(JSON.stringify(S().currentExercise)), keyframeIndex: S().currentKeyframeIndex }),
      (snap) => {
        S().currentExercise = JSON.parse(JSON.stringify(snap.exercise));
        S().currentKeyframeIndex = snap.keyframeIndex;
        window.deselectElement();
        window.renderKeyframeTabs();
        window.updateFormFields();
        window.drawScene();
      }
    );

    playbackCtrl = new (TC().PlaybackController)(
      (interpolatedElements, interpolatedArrows) => {
        window.drawScene(interpolatedElements, interpolatedArrows);
      },
      (stepIdx) => {
        S().currentKeyframeIndex = stepIdx;
        window.renderKeyframeTabs();
      }
    );

    // Initial State & Route check
    const routeId = window.getExerciseIdFromUrl();
    if (routeId) {
      await window.loadExerciseFromCatalog(routeId, false);
    } else {
      const savedDraft = window.loadLocalDraft();
      if (savedDraft && savedDraft.exercise) {
        S().currentExercise = savedDraft.exercise;
        S().currentKeyframeIndex = Math.min(savedDraft.keyframeIndex || 0, (savedDraft.exercise.keyframes.length - 1) || 0);
        if (S().currentExercise.id && S().currentExercise.id !== "ex_initial") {
          window.updateUrlForExercise(S().currentExercise.id, true);
        }
      } else {
        S().currentExercise = TC().store.createEmptyExercise();
        S().currentKeyframeIndex = 0;
      }
    }

    window.resetUndoRedo();
    window.resizeCanvasToContainer();
    setupEvents();
    window.renderKeyframeTabs();
    window.drawScene();
    window.updateFormFields();
    window.refreshExerciseBadge();
    window.loadCatalogExercises();

    // Bottom dock scroll listeners
    const bDock = document.getElementById("bottomDockScrollContainer");
    if (bDock) {
      bDock.addEventListener("scroll", TC().hud.updateBottomDockScrollHints, { passive: true });
      window.addEventListener("resize", TC().hud.updateBottomDockScrollHints, { passive: true });
    }

    setTimeout(() => {
      window.resizeCanvasToContainer();
      window.drawScene();
      window.updateActionPopupPosition();
      TC().hud.updateBottomDockScrollHints();
    }, 100);

    setTimeout(() => {
      window.resizeCanvasToContainer();
      window.drawScene();
      window.updateActionPopupPosition();
      TC().hud.updateBottomDockScrollHints();
    }, 350);

    TC().hud.setupMobileTooltips();

    // Visual Viewport & Window Resize
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", () => {
        window.resizeCanvasToContainer();
        window.drawScene();
        window.updateActionPopupPosition();
      });
    }
    window.addEventListener("resize", () => {
      window.resizeCanvasToContainer();
      window.drawScene();
      window.updateActionPopupPosition();
    });

    window.addEventListener("popstate", async () => {
      const rId = window.getExerciseIdFromUrl();
      if (rId) await window.loadExerciseFromCatalog(rId, false);
    });

    console.log("⚡ Tactical Coach unified modular orchestrator initialized.");
  }

  // Wait for DOM & Module load
  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", () => {
      setTimeout(init, 0);
    });
  } else {
    setTimeout(init, 0);
  }
})();
