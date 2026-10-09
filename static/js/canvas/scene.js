// canvas/scene.js - 2D-Szenen-Rendering (Pitch, Ghosts, Pfeile, Elemente, Handles, Overlays)
//
// Mechanisch aus app.js extrahiert (verhaltenserhaltend, keine Logikänderung).
// Alle vormals impliziten app.js-Scope-Abhängigkeiten werden explizit übergeben:
//   ctx, canvas          - 2D-Canvas-Kontext + Element
//   S                    - () => globaler State
//   TC                   - () => window.TacticalCoach (Modul-Namespace)
//   view3dManager        - aktive 3D-Ansicht oder null (für Scene-Sync)
//   customElements/Arrows - optionale Overrides (z. B. während Playback-Interpolation)
export function drawScene(ctx, canvas, S, TC, view3dManager, customElements = null, customArrows = null) {
  if (!ctx || !canvas || !TC()) return;
  const s = S();

    // 3D Scene Synchronisation, wenn aktiv
    if (s.is3DMode && view3dManager && view3dManager.isActive) {
      view3dManager.syncScene(customElements, customArrows);
    }

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
        TC().elements.drawElementOnCanvas(ctx, el, isSel, s.fieldRotation, s.globalElementScale, s.viewScale);
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
              const teamCol = toEl.type === "ball" ? "#facc15" : (toEl.team === "red" ? "#f87171" : toEl.team === "blue" ? "#60a5fa" : (toEl.team === "orange" ? "#fb923c" : "#34d399"));
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

              // Zeichne die Ghost-Silhouette des Elements am Startpunkt (fromKf)
              ctx.save();
              ctx.globalAlpha = Math.max(0.2, trailAlpha * 0.45);
              TC().elements.drawElementOnCanvas(ctx, fromEl, false, s.fieldRotation, s.globalElementScale);
              ctx.restore();

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
                const invScale = Math.max(0.4, Math.min(2.5, 1 / (s.viewScale || 1.0)));
                const handleR = Math.max(3.5, 6 * invScale);

                // Gestrichelte Leitlinien zu den Ghost-Kurven-Griffen
                ctx.save();
                ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
                ctx.lineWidth = 1.2 * invScale;
                ctx.setLineDash([3 * invScale, 3 * invScale]);
                ctx.beginPath();
                ctx.moveTo(fromEl.x, fromEl.y);
                ctx.lineTo(p1.x, p1.y);
                ctx.moveTo(toEl.x, toEl.y);
                ctx.lineTo(p2.x, p2.y);
                ctx.stroke();
                ctx.restore();

                ctx.fillStyle = "#ffffff";
                ctx.strokeStyle = teamCol;
                ctx.lineWidth = 2 * invScale;
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
            TC().arrows.drawArrow(ctx, arr.x1, arr.y1, arr.x2, arr.y2, arr.type, arr.color, isSel, null, p1, p2, arr.raw_points, s.viewScale, true);
          }
        });
      });
    }

    // 4. Current Keyframe Arrows (Linienkörper und Spitzen unter den Spielern zeichnen, Handles werden darüber gerendert)
    const nowTime = performance.now() / 1000;
    arrows.forEach((arr, idx) => {
      const isSel = (s.selectedArrowIndex === idx);
      const { p1, p2 } = TC().geometry.getArrowCurveControlPoints(arr);
      TC().arrows.drawArrow(ctx, arr.x1, arr.y1, arr.x2, arr.y2, arr.type, arr.color, isSel, arr.type === "guide" ? nowTime : null, p1, p2, arr.raw_points, s.viewScale, true);
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
        TC().elements.drawElementOnCanvas(ctx, el, isSel, s.fieldRotation, s.globalElementScale, s.viewScale);
      }
    });

    // 6-ballAnchor. Feiner magnetischer Ankerpunkt über dem Ball anzeigen (wenn Pass aktiv ist oder Ball hovered)
    if (!s.isPlaying && (s.activeTool === "pass" || s.hoveredBallAnchorId)) {
      elements.forEach(el => {
        if (el.type === "ball") {
          const isHovered = (s.hoveredBallAnchorId === el.id);
          const invZoom = 1 / (s.viewScale || 1.0);
          const anchorRadius = (isHovered ? 4 : 3) * Math.max(0.7, invZoom);

          ctx.save();
          // Feiner Anker-Punkt zentriert auf dem Ball (Gelb mit dezentem dunklem Rand)
          ctx.fillStyle = "#facc15";
          ctx.strokeStyle = "rgba(15, 23, 42, 0.85)";
          ctx.lineWidth = 1.2 * Math.max(0.7, invZoom);
          ctx.beginPath();
          ctx.arc(el.x, el.y, anchorRadius, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          // Bei Maus-Hover: dezenter gelber Ring zur Bestätigung
          if (isHovered) {
            ctx.strokeStyle = "rgba(250, 204, 21, 0.8)";
            ctx.lineWidth = 1.5 * Math.max(0.7, invZoom);
            ctx.beginPath();
            ctx.arc(el.x, el.y, 8 * Math.max(0.7, invZoom), 0, Math.PI * 2);
            ctx.stroke();
          }
          ctx.restore();
        }
      });
    }

    // 6a-ghost. Ghost-Kurven-Griffe (P1, P2, Mid) für selektierte Elemente (Spieler/Ball) ÜBER den Elementen rendern!
    // So kann man auch bei Dribblings oder Ball am Fuß den Wölbungs-Griff direkt greifen, selbst wenn er unter/auf dem Spieler liegt.
    if (s.isGhostMode !== "off" && !s.isPlaying && s.currentKeyframeIndex > 0) {
      const selElemIds = s.selectedElementIds.length > 0 ? s.selectedElementIds : (s.selectedElementId ? [s.selectedElementId] : []);
      const prevKf = s.currentExercise.keyframes[s.currentKeyframeIndex - 1];
      if (prevKf && selElemIds.length > 0) {
        const invScale = Math.max(0.4, Math.min(2.5, 1 / (s.viewScale || 1.0)));
        const handleR = Math.max(4, 7 * invScale);
        const midHandleR = Math.max(4.5, 8 * invScale);

        selElemIds.forEach(selId => {
          const currEl = (elements || []).find(it => it.id === selId);
          if (!currEl || (currEl.type !== "player" && currEl.type !== "ball")) return;
          const prevEl = (prevKf.elements || []).find(it => it.id === selId);
          if (!prevEl || Math.hypot(currEl.x - prevEl.x, currEl.y - prevEl.y) <= 8) return;

          const teamCol = currEl.type === "ball" ? "#facc15" : (currEl.team === "red" ? "#f87171" : currEl.team === "blue" ? "#60a5fa" : (currEl.team === "orange" ? "#fb923c" : "#34d399"));
          const { p1, p2 } = TC().geometry.getEffectiveCurveControlPoints(prevEl, currEl);
          const pMid = TC().geometry.getCubicBezierPoint(0.5, prevEl, p1, p2, currEl);

          ctx.save();
          // Gestrichelte Leitlinien
          ctx.strokeStyle = "rgba(255, 255, 255, 0.65)";
          ctx.lineWidth = 1.4 * invScale;
          ctx.setLineDash([3 * invScale, 3 * invScale]);
          ctx.beginPath();
          ctx.moveTo(prevEl.x, prevEl.y);
          ctx.lineTo(p1.x, p1.y);
          ctx.lineTo(pMid.x, pMid.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.lineTo(currEl.x, currEl.y);
          ctx.stroke();

          // P1 Wölbungsgriff
          ctx.fillStyle = "#ffffff";
          ctx.strokeStyle = teamCol;
          ctx.lineWidth = 2.2 * invScale;
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.arc(p1.x, p1.y, handleR, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          // Midpoint Kurvenkrone / Dribbel-Bogen-Griff (Bernsteinfarben für intuitive Bogenkrümmung)
          ctx.fillStyle = "#f59e0b";
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 2.5 * invScale;
          ctx.beginPath();
          ctx.arc(pMid.x, pMid.y, midHandleR, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          // P2 Wölbungsgriff
          ctx.fillStyle = "#ffffff";
          ctx.strokeStyle = teamCol;
          ctx.lineWidth = 2.2 * invScale;
          ctx.beginPath();
          ctx.arc(p2.x, p2.y, handleR, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          ctx.restore();
        });
      }
    }

    // 6b. Interactive Handles für selektierte Linien/Pfeile (ÜBER den Spielern zeichnen, damit man verdeckte Punkte direkt greifen und positionieren kann!)
    if (s.selectedArrowIndex !== null && arrows && arrows[s.selectedArrowIndex]) {
      const selArr = arrows[s.selectedArrowIndex];
      const { p1, p2 } = TC().geometry.getArrowCurveControlPoints(selArr);
      TC().arrows.drawArrowHandles(ctx, selArr.x1, selArr.y1, selArr.x2, selArr.y2, p1, p2, s.viewScale);
    }

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

    // 8. Debug Overlay: Subtile Umrandung aller interaktiven Hitboxen / Auswahlflächen
    if (s.isDebugHitAreas && !s.isPlaying) {
      ctx.save();
      const invZoom = 1 / (s.viewScale || 1.0);
      const effectiveElScale = Math.max(0.6, s.globalElementScale || 1.0);
      const baseHitRadius = Math.max(26 * effectiveElScale, Math.min(65, (30 * effectiveElScale) * invZoom));
      const playerBodyRadius = 22 * effectiveElScale;
      const arrowHitThreshold = Math.max(12, Math.min(35, 16 * invZoom));
      const handleThreshold = Math.max(14, Math.min(45, 18 * invZoom));

      // Elemente / Spieler: Kern-Hitbox (grün) und Toleranz-Zone (gepunktet cyan)
      (elements || []).forEach(el => {
        const isZone = (el.type === "zone_rect" || el.type === "zone_circle" || el.type === "zone_triangle");
        if (isZone) return;
        const r = (el.type === "ball" ? 14 : playerBodyRadius);

        // Direkte Klick-Fläche (Spieler-Körper)
        ctx.strokeStyle = "rgba(16, 185, 129, 0.75)";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(el.x, el.y, r, 0, Math.PI * 2);
        ctx.stroke();

        // Erweiterte Toleranzzone
        ctx.strokeStyle = "rgba(56, 189, 248, 0.35)";
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(el.x, el.y, baseHitRadius, 0, Math.PI * 2);
        ctx.stroke();
      });

      // Linien & Pfeile: Klick-Hitboxen für Start/Ende (orange) und Pfad (gelb gepunktet)
      (arrows || []).forEach(arr => {
        const { p1, p2 } = TC().geometry.getArrowCurveControlPoints(arr);

        // Start Handle Hitbox
        ctx.strokeStyle = "rgba(249, 115, 22, 0.7)";
        ctx.fillStyle = "rgba(249, 115, 22, 0.12)";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(arr.x1, arr.y1, handleThreshold, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // End Handle Hitbox
        ctx.beginPath();
        ctx.arc(arr.x2, arr.y2, handleThreshold, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Linienkörper Hitbox-Schlauch
        ctx.strokeStyle = "rgba(234, 179, 8, 0.3)";
        ctx.lineWidth = arrowHitThreshold * 2;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        if (arr.raw_points && arr.raw_points.length >= 2) {
          ctx.moveTo(arr.raw_points[0].x, arr.raw_points[0].y);
          for (let i = 1; i < arr.raw_points.length; i++) ctx.lineTo(arr.raw_points[i].x, arr.raw_points[i].y);
        } else {
          ctx.moveTo(arr.x1, arr.y1);
          ctx.bezierCurveTo(p1.x, p1.y, p2.x, p2.y, arr.x2, arr.y2);
        }
        ctx.stroke();
      });

      ctx.restore();
    }

    ctx.restore();
}
