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

  // URL Helpers



  // Local Storage Drafts


  // Form Sync


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
  // Bridge: delegiert an das extrahierte Rendering-Modul (js/canvas/scene.js).
  // drawScene selbst enthält KEINE Rendering-Logik mehr – einzige Wahrheit ist das Modul.
  window.drawScene = function (customElements = null, customArrows = null, customTitle = null) {
    if (!ctx || !canvas || !TC() || !TC().scene) return;
    TC().scene.drawScene(ctx, canvas, S, TC, view3dManager, customElements, customArrows);

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
  let view3dManager = null;
  window.togglePlayAnimation = function () { if (playbackCtrl) playbackCtrl.toggle(); };
  window.startAnimation = function () { if (playbackCtrl) playbackCtrl.start(); };
  window.stopAnimation = function () { if (playbackCtrl) playbackCtrl.stop(); };

  // Helper: Stellt sicher, dass View3DManager erzeugt ist

  // 3D View Bridge






  const SPEED_STEPS = [0.25, 0.5, 0.75, 1.0, 1.5, 2.0];

  // Viewport Controls (Zoom, Pan, Rotate)

  window.zoomIn = function () {
    TC().viewport.zoomAt(canvas, S().viewScale + 0.25, null, window.drawScene);
  };

  window.zoomOut = function () {
    TC().viewport.zoomAt(canvas, S().viewScale - 0.25, null, window.drawScene);
  };


  let isViewControlsOpen = false;



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
      } else if (el.type === "ball") {
        const sp = TC().viewport.getScreenCoords(canvas, el.x, el.y);
        posX = sp.x; posY = sp.y - 26;
      } else {
        const sp = TC().viewport.getScreenCoords(canvas, el.x, el.y);
        posX = sp.x; posY = sp.y - 36;
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
    if (rotateLeftBtn) rotateLeftBtn.classList.remove("hidden");
    if (rotateRightBtn) rotateRightBtn.classList.remove("hidden");

    const halfW = (popup.offsetWidth || 220) / 2;
    const clampedX = Math.max(halfW + 10, Math.min(window.innerWidth - halfW - 10, posX));
    // Nicht zu weit oben am Screenrand abklemmen (mindestens 56px Abstand zur Header-Leiste)
    const clampedY = Math.max(56, posY);
    popup.style.left = `${clampedX}px`;
    popup.style.top = `${clampedY}px`;
    popup.classList.remove("hidden");
    window.updateFocusButtonState();
  };




  // Element Actions





  // Helper to sync equipment properties (rotation, scale, color, position) across all keyframes













  // Canvas Clearing


  // Keyframes Timeline

  window.selectKeyframe = function (index, shouldAnimate = true) {
    const s = S();
    const prevIndex = s.currentKeyframeIndex;
    if (index === prevIndex) return;

    // Wenn gerade Voll-Wiedergabe aktiv ist, stoppen wir sie sofort
    if (s.isPlaying && typeof window.stopAnimation === "function") {
      window.stopAnimation();
    }

    s.currentKeyframeIndex = index;
    window.deselectElement(true);

    if (TC() && TC().timeline && typeof TC().timeline.updateKeyframeActiveTabs === "function") {
      TC().timeline.updateKeyframeActiveTabs(index);
    } else {
      window.renderKeyframeTabs();
    }

    // Wenn ein einzelner Schritt geklickt wurde: weich von prevIndex nach index animieren!
    if (shouldAnimate && playbackCtrl && typeof playbackCtrl.animateStepTransition === "function") {
      playbackCtrl.animateStepTransition(prevIndex, index, () => {
        window.drawScene();
      });
    } else {
      window.drawScene();
    }
  };







  // Exercise API & Catalog









  // Export, Video & Print
  window.currentExportVideoUrl = "";
  window.currentExportVideoBlob = null;
  window.currentExportVideoType = "2d"; // '2d' oder '3d'
  window.currentExportPhotoType = "2d"; // '2d' oder '3d'

  window.closeExportModal = function () {
    TC().popovers.closeExportModal();
    const player = document.getElementById("exportVideoPlayer");
    if (player) { player.pause(); player.src = ""; }
    if (playbackCtrl) playbackCtrl.stop();
  };




  window.preparePhotoSnapshot = function (mode = null) {
    if (mode) window.currentExportPhotoType = mode;
    const is3d = window.currentExportPhotoType === "3d";
    let dataUrl = null;

    if (is3d) {
      const v3d = window.ensureView3DManager();
      if (v3d) {
        if (!v3d.isActive) {
          v3d.init();
          v3d.syncScene();
        }
        dataUrl = v3d.getSnapshotDataURL();
      }
    } else if (canvas) {
      dataUrl = canvas.toDataURL("image/png");
    }

    if (!dataUrl) return;
    const imgEl = document.getElementById("exportSnapshotImg");
    if (imgEl) imgEl.src = dataUrl;
    const box = document.getElementById("photoPreviewBox");
    if (box) box.classList.remove("hidden");

    // Toggle Buttons optisch aktualisieren
    const btn2d = document.getElementById("photoMode2dBtn");
    const btn3d = document.getElementById("photoMode3dBtn");
    if (btn2d && btn3d) {
      if (is3d) {
        btn3d.className = "px-2 py-0.5 rounded text-[11px] font-bold bg-cyan-600 text-white shadow";
        btn2d.className = "px-2 py-0.5 rounded text-[11px] font-medium text-slate-400 hover:text-white";
      } else {
        btn2d.className = "px-2 py-0.5 rounded text-[11px] font-bold bg-blue-600 text-white shadow";
        btn3d.className = "px-2 py-0.5 rounded text-[11px] font-medium text-slate-400 hover:text-white";
      }
    }
  };



  window.trigger2DVideoRender = async function () {
    const s = S();
    const btn = document.getElementById("btnRenderVideo");
    const statusBox = document.getElementById("videoRenderStatus");
    const statusText = document.getElementById("videoRenderStatusText");
    const resultBox = document.getElementById("videoResultBox");

    const currentEx = s.currentExercise;
    if (!currentEx || !Array.isArray(currentEx.keyframes) || currentEx.keyframes.length < 2) {
      window.showToast("Füge mindestens 2 Schritte hinzu, um ein Video aufzunehmen!", true);
      return;
    }

    if (!playbackCtrl) {
      window.showToast("Playback Controller nicht bereit.", true);
      return;
    }

    if (btn) btn.disabled = true;
    if (statusBox) statusBox.classList.remove("hidden");
    if (statusText) statusText.innerText = "Video-Encoder wird vorbereitet...";
    if (resultBox) resultBox.classList.add("hidden");

    try {
      const speed = (typeof s.currentSpeed === "number" && s.currentSpeed > 0) ? s.currentSpeed : 1.0;
      const stepDuration = 2000 / speed;

      const result = await playbackCtrl.recordAnimationVideo({
        durationPerStep: stepDuration,
        fps: 30,
        canvas: canvas,
        onProgress: (p) => {
          if (statusText) statusText.innerText = `2D-Animation wird aufgezeichnet (${Math.round(p * 100)}%)...`;
        }
      });

      // Blob ist bereits H.264-MP4 (direkt im Browser via WebCodecs erzeugt) - keine Server-Konvertierung nötig.
      const finalVideoBlob = result.blob;
      window.currentExportVideoBlob = finalVideoBlob;
      const finalVideoUrl = URL.createObjectURL(finalVideoBlob);
      window.currentExportVideoUrl = finalVideoUrl;

      const player = document.getElementById("exportVideoPlayer");
      if (player) {
        player.src = finalVideoUrl;
        player.load();
      }
      const btnGif = document.getElementById("btnExportGif");
      if (btnGif) btnGif.classList.add("hidden");
      if (resultBox) resultBox.classList.remove("hidden");
      window.showToast("🎬 2D-Video als MP4 erfolgreich generiert!");
    } catch (e) {
      console.error("2D Video Render Error:", e);
      window.showToast("Fehler bei 2D-Aufnahme: " + e.message, true);
    } finally {
      if (btn) btn.disabled = false;
      if (statusBox) statusBox.classList.add("hidden");
    }
  };



  window.shareMedia = async function (type) {
    const s = S();
    const title = s.currentExercise.title || "Taktikübung";
    if (navigator.share) {
      try {
        if (type === "video" && window.currentExportVideoUrl) {
          let blob = window.currentExportVideoBlob;
          if (!blob) {
            const res = await fetch(window.currentExportVideoUrl);
            blob = await res.blob();
          }
          const is3d = window.currentExportVideoType === "3d";
          const ext = blob.type.includes("webm") ? "webm" : "mp4";
          const suffix = is3d ? "_3d" : "";
          const file = new File([blob], `${title}${suffix}.${ext}`, { type: blob.type || "video/mp4" });
          if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({ title, files: [file] });
            return;
          }
        } else if (type === "photo") {
          const is3d = window.currentExportPhotoType === "3d";
          let dataUrl = null;
          if (is3d) {
            const v3d = window.ensureView3DManager();
            if (v3d) dataUrl = v3d.getSnapshotDataURL();
          } else if (canvas) {
            dataUrl = canvas.toDataURL("image/png");
          }
          if (!dataUrl) return;
          const res = await fetch(dataUrl);
          const blob = await res.blob();
          const suffix = is3d ? "_3d" : "";
          const file = new File([blob], `${title}${suffix}.png`, { type: "image/png" });
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
    const is3d = window.currentExportPhotoType === "3d";
    let dataUrl = null;
    if (is3d) {
      const v3d = window.ensureView3DManager();
      if (v3d) dataUrl = v3d.getSnapshotDataURL();
    } else if (canvas) {
      dataUrl = canvas.toDataURL("image/png");
    }
    if (!dataUrl) return;

    const link = document.createElement("a");
    const suffix = is3d ? "_3d" : "";
    link.download = `${(S().currentExercise.title || "taktik").replace(/\s+/g, "_")}${suffix}.png`;
    link.href = dataUrl;
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
      } else if (e.key === "p" || e.key === "P") {
        if (typeof window.setActiveTool === "function") window.setActiveTool("pass");
      } else if (e.key === "l" || e.key === "L") {
        if (typeof window.setActiveTool === "function") window.setActiveTool("run");
      } else if (e.key === "v" || e.key === "V" || e.key === "Escape") {
        if (typeof window.setActiveTool === "function") window.setActiveTool("select");
      } else if (e.altKey && (e.key === "ArrowLeft" || e.key === "PageUp")) {
        e.preventDefault();
        const cur = S().currentKeyframeIndex;
        if (cur > 0) window.selectKeyframe(cur - 1);
      } else if (e.altKey && (e.key === "ArrowRight" || e.key === "PageDown")) {
        e.preventDefault();
        const cur = S().currentKeyframeIndex;
        const total = (S().currentExercise?.keyframes || []).length;
        if (cur < total - 1) window.selectKeyframe(cur + 1);
      } else if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        const s = S();
        const kf = TC().getCurrentKeyframe();
        if (!kf) return;

        // Schrittweite: Normal = 1px (extrem präzise), mit Shift = 8px
        const step = e.shiftKey ? 8 : 1;
        let dx = 0;
        let dy = 0;

        // Berücksichtige die aktuelle Feldrotation (z.B. 270° im Hochformat / Handy),
        // damit Pfeiltaste "Oben" immer nach oben auf dem Bildschirm bewegt!
        const rotRad = ((s.fieldRotation || 0) * Math.PI) / 180;
        let screenDx = 0;
        let screenDy = 0;
        if (e.key === "ArrowUp") screenDy = -step;
        else if (e.key === "ArrowDown") screenDy = step;
        else if (e.key === "ArrowLeft") screenDx = -step;
        else if (e.key === "ArrowRight") screenDx = step;

        // Rücktransformation von Bildschirm-Koordinaten auf virtuelle Spielfeld-Koordinaten
        dx = Math.round(screenDx * Math.cos(-rotRad) - screenDy * Math.sin(-rotRad));
        dy = Math.round(screenDx * Math.sin(-rotRad) + screenDy * Math.cos(-rotRad));
        if (dx === 0 && dy === 0) {
          if (screenDx !== 0) dx = Math.sign(screenDx);
          if (screenDy !== 0) dy = Math.sign(screenDy);
        }

        let moved = false;

        // 1. Wenn eine Linie ausgewählt ist
        if (s.selectedArrowIndex !== null && kf.arrows && kf.arrows[s.selectedArrowIndex]) {
          e.preventDefault();
          const arr = kf.arrows[s.selectedArrowIndex];
          const part = s.selectedArrowPart || "body";

          if (part === "start") {
            arr.x1 = Math.max(5, Math.min(1000 - 5, arr.x1 + dx));
            arr.y1 = Math.max(5, Math.min(700 - 5, arr.y1 + dy));
          } else if (part === "end") {
            arr.x2 = Math.max(5, Math.min(1000 - 5, arr.x2 + dx));
            arr.y2 = Math.max(5, Math.min(700 - 5, arr.y2 + dy));
          } else {
            arr.x1 = Math.max(5, Math.min(1000 - 5, arr.x1 + dx));
            arr.y1 = Math.max(5, Math.min(700 - 5, arr.y1 + dy));
            arr.x2 = Math.max(5, Math.min(1000 - 5, arr.x2 + dx));
            arr.y2 = Math.max(5, Math.min(700 - 5, arr.y2 + dy));
            if (arr.raw_points && arr.raw_points.length > 0) {
              arr.raw_points.forEach(pt => {
                pt.x += dx;
                pt.y += dy;
              });
            }
          }

          if (arr.persistent && arr.id && s.currentExercise && Array.isArray(s.currentExercise.keyframes)) {
            s.currentExercise.keyframes.forEach((otherKf, idx) => {
              if (idx !== s.currentKeyframeIndex && otherKf.arrows) {
                const matched = otherKf.arrows.find(it => it.id === arr.id);
                if (matched) {
                  matched.x1 = arr.x1; matched.y1 = arr.y1;
                  matched.x2 = arr.x2; matched.y2 = arr.y2;
                  matched.raw_points = arr.raw_points ? JSON.parse(JSON.stringify(arr.raw_points)) : null;
                }
              }
            });
          }
          moved = true;

        // 2. Wenn Spieler oder Objekte ausgewählt sind (auch mit Pfeiltasten präzise verschiebbar!)
        } else if (s.selectedElementIds.length > 0) {
          e.preventDefault();
          kf.elements.forEach(el => {
            if (s.selectedElementIds.includes(el.id)) {
              el.x = Math.max(5, Math.min(1000 - 5, el.x + dx));
              el.y = Math.max(5, Math.min(700 - 5, el.y + dy));
              window.syncEquipmentElementAcrossAllKeyframes(el);
            }
          });
          moved = true;
        } else if (s.selectedElementId) {
          e.preventDefault();
          const el = kf.elements.find(it => it.id === s.selectedElementId);
          if (el) {
            el.x = Math.max(5, Math.min(1000 - 5, el.x + dx));
            el.y = Math.max(5, Math.min(700 - 5, el.y + dy));
            window.syncEquipmentElementAcrossAllKeyframes(el);
            moved = true;
          }
        }

        if (moved) {
          window.drawScene();
          window.updateActionPopupPosition();
          window.recordHistory();
        }
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
        if (TC() && TC().timeline && typeof TC().timeline.updateKeyframeActiveTabs === "function") {
          TC().timeline.updateKeyframeActiveTabs(stepIdx);
        } else {
          window.renderKeyframeTabs();
        }
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

    // URL Query Parameter auswerten: view=3d und play=true / autoplay=true
    const urlParams = new URLSearchParams(window.location.search);
    const viewParam = (urlParams.get("view") || "").toLowerCase();
    const playParam = (urlParams.get("play") || urlParams.get("autoplay") || "").toLowerCase();

    if (viewParam === "3d" && !S().is3DMode) {
      window.toggle3DView();
    }

    if (playParam === "true" || playParam === "1" || playParam === "yes") {
      setTimeout(() => {
        if (playbackCtrl) {
          playbackCtrl.start();
        }
      }, 500);
    }

    window.resetUndoRedo();
    window.resizeCanvasToContainer();
    setupEvents();
    window.renderKeyframeTabs();
    window.drawScene();
    window.updateFormFields();
    window.refreshExerciseBadge();
    window.loadCatalogExercises();

    // Bottom dock scroll listeners & touch-drag
    const bDock = document.getElementById("bottomDockScrollContainer");
    if (bDock) {
      bDock.addEventListener("scroll", TC().hud.updateBottomDockScrollHints, { passive: true });
      window.addEventListener("resize", TC().hud.updateBottomDockScrollHints, { passive: true });

      // Touch-Drag-Scrolling für Touch-Geräte & Desktop-Maus
      let isDown = false;
      let startX = 0;
      let scrollLeft = 0;

      bDock.addEventListener("touchstart", (e) => {
        isDown = true;
        startX = e.touches[0].pageX - bDock.offsetLeft;
        scrollLeft = bDock.scrollLeft;
      }, { passive: true });

      bDock.addEventListener("touchmove", (e) => {
        if (!isDown) return;
        const x = e.touches[0].pageX - bDock.offsetLeft;
        const walk = (x - startX);
        bDock.scrollLeft = scrollLeft - walk;
      }, { passive: true });

      const stopTouch = () => { isDown = false; };
      bDock.addEventListener("touchend", stopTouch, { passive: true });
      bDock.addEventListener("touchcancel", stopTouch, { passive: true });
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
    // 3D-Ressourcen im Hintergrund vorladen
    setTimeout(() => {
      if (window.ensureView3DManager) {
        const v = window.ensureView3DManager();
        if (v && v.preloadFootballerAssets) v.preloadFootballerAssets();
      }
    }, 100);
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
