// interaction/pointer.js - Pointerdown/move/up Ereignisbehandlung für Canvas, Lasso & Drag-and-Drop
import { state, getCurrentExercise, getCurrentKeyframe } from "../state/store.js";
import { VIRTUAL_WIDTH, VIRTUAL_HEIGHT, isEquipment } from "../core/constants.js";
import {
  distToSegment,
  distToPolyline,
  distToCubicBezier,
  pointInPolygon,
  getEffectiveCurveControlPoints,
  getArrowCurveControlPoints,
  getCubicBezierPoint,
  fitTo3PointCurve,
  fitCubicBezierToStroke,
  fitCatmullRomPoints
} from "../core/geometry.js";
import { handleCurvePointerDown, updateCurveDrag } from "./curve-editor.js";
import { showInspector, showGroupInspector, showArrowInspector, hideInspector } from "../ui/inspectors.js";
import { setActiveTool } from "./tools.js";

export function handleCanvasPointerDown(e, canvas, getCanvasCoords, callbacks = {}) {
  // Wenn der Touch auf einem UI-Element / Dock / Buttons liegt, nicht das Canvas blockieren!
  if (e.target && e.target.closest && e.target.closest("#bottomDockScrollContainer, #keyframesList, #keyframesListDesktop, #desktopTimelineSidebar, #dockScrollLeftHint, #dockScrollRightHint, .touch-pan-x")) {
    return;
  }
  if (state.isPlaying) return;
  if (e.cancelable) e.preventDefault();

  const {
    drawScene = () => {},
    updateActionPopupPosition = () => {},
    recordHistory = () => {}
  } = callbacks;

  // Snapshot before action begins for undo
  state.dragInitialSnapshot = JSON.stringify(getCurrentExercise());

  // Multi-touch pinch zoom & pan
  if (e.touches && e.touches.length >= 2) {
    state.isDragging = false;
    state.isDrawingArrow = false;
    state.isPanning = true;

    const t1 = e.touches[0];
    const t2 = e.touches[1];
    state.initialPinchDistance = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
    state.initialPinchScale = state.viewScale;
    state.panStartX = (t1.clientX + t2.clientX) / 2 - state.viewPanX;
    state.panStartY = (t1.clientY + t2.clientY) / 2 - state.viewPanY;
    return;
  }

  const { x, y } = getCanvasCoords(e);
  const kf = getCurrentKeyframe();
  if (!kf) return;

  const prevKf = state.currentKeyframeIndex > 0 ? getCurrentExercise().keyframes[state.currentKeyframeIndex - 1] : null;
  // Zoom-invarianter Fangradius: Bleibt auf dem physischen Bildschirm konstant (z.B. ca. 24-28 Bildschirm-Pixel),
  // wächst also in virtuellen Koordinaten beim Rauszoomen, schrumpft beim Reinzoomen!
  const invZoom = 1 / (state.viewScale || 1.0);
  const handleHitRadius = Math.max(16, Math.min(60, 24 * invZoom));

  // 1. Check curve editor handles (ghost or selected arrow) - Höchste Priorität!
  const curveHit = handleCurvePointerDown(x, y, kf, prevKf, handleHitRadius);
  if (curveHit) {
    state.activeCurveDrag = curveHit;
    state.isDragging = false;
    state.isDraggingArrow = false;
    hideInspector();
    return;
  }

  // 1b. Check selected arrow start/end handles directly
  if (state.selectedArrowIndex !== null && kf.arrows && kf.arrows[state.selectedArrowIndex]) {
    const selArr = kf.arrows[state.selectedArrowIndex];
    const distStart = Math.hypot(selArr.x1 - x, selArr.y1 - y);
    const distEnd = Math.hypot(selArr.x2 - x, selArr.y2 - y);
    if (distStart <= handleHitRadius) {
      state.isDraggingArrow = true;
      state.selectedArrowPart = "start";
      state.arrowDragOffsetX = x;
      state.arrowDragOffsetY = y;
      showArrowInspector(selArr);
      drawScene();
      return;
    }
    if (distEnd <= handleHitRadius) {
      state.isDraggingArrow = true;
      state.selectedArrowPart = "end";
      state.arrowDragOffsetX = x;
      state.arrowDragOffsetY = y;
      showArrowInspector(selArr);
      drawScene();
      return;
    }
  }

  // 1c. Check if clicked a resize handle of a selected zone element
  if (state.selectedElementId) {
    const selEl = kf.elements.find(it => it.id === state.selectedElementId);
    if (selEl && (selEl.type === "zone_rect" || selEl.type === "zone_circle" || selEl.type === "zone_triangle")) {
      // Zoom-invarianter Touch-Toleranz-Radius für Zonen-Handles (Resize-Bubbles)
      const zHitR = Math.max(14, Math.min(50, 22 * invZoom));

      // Bei Zonen (Rechteck, Kreis, Dreieck) rotiert das Element mit dem Spielfeld mit (kein Counter-Rotate)
      // Daher ist die Ausrichtung auf dem Canvas gleich el.rotation (ohne -fieldRotation)
      const totalRotDeg = selEl.rotation || 0;
      const totalRotRad = (totalRotDeg * Math.PI) / 180;
      const cosA = Math.cos(totalRotRad);
      const sinA = Math.sin(totalRotRad);

      const toWorldCoord = (lx, ly) => ({
        x: selEl.x + (lx * cosA - ly * sinA),
        y: selEl.y + (lx * sinA + ly * cosA)
      });

      if (selEl.type === "zone_rect") {
        const w = selEl.width || 120;
        const h = selEl.height || 80;
        // 4 Ecken + 4 Kantenmitten in lokalen Koordinaten
        const localHandles = [
          // Ecken
          { name: "tl", lx: -w/2, ly: -h/2 },
          { name: "tr", lx: w/2, ly: -h/2 },
          { name: "br", lx: w/2, ly: h/2 },
          { name: "bl", lx: -w/2, ly: h/2 },
          // Kantenmitten (jede Seite einzeln)
          { name: "t", lx: 0, ly: -h/2 },
          { name: "r", lx: w/2, ly: 0 },
          { name: "b", lx: 0, ly: h/2 },
          { name: "l", lx: -w/2, ly: 0 }
        ];

        const handles = localHandles.map(hItem => {
          const wPos = toWorldCoord(hItem.lx, hItem.ly);
          return { name: hItem.name, x: wPos.x, y: wPos.y, lx: hItem.lx, ly: hItem.ly };
        });

        const hitHandle = handles.find(c => Math.hypot(c.x - x, c.y - y) <= zHitR);
        if (hitHandle) {
          state.isResizingZone = true;
          state.resizeZoneId = selEl.id;
          state.resizeZoneCorner = hitHandle.name;
          state.resizeInitialState = {
            centerX: selEl.x,
            centerY: selEl.y,
            width: w,
            height: h,
            totalRotRad: totalRotRad,
            startMouseX: x,
            startMouseY: y,
            // Offset zwischen Touch/Klick und exaktem Handle-Mittelpunkt speichern
            handleOffsetX: x - hitHandle.x,
            handleOffsetY: y - hitHandle.y
          };
          return;
        }
      } else if (selEl.type === "zone_circle") {
        const radius = selEl.radius || 50;
        const localHandles = [
          { name: "r", lx: radius, ly: 0 },
          { name: "b", lx: 0, ly: radius },
          { name: "l", lx: -radius, ly: 0 },
          { name: "t", lx: 0, ly: -radius }
        ];
        const handles = localHandles.map(hItem => {
          const wPos = toWorldCoord(hItem.lx, hItem.ly);
          return { name: hItem.name, x: wPos.x, y: wPos.y };
        });
        const hitHandle = handles.find(hItem => Math.hypot(hItem.x - x, hItem.y - y) <= zHitR);
        if (hitHandle) {
          state.isResizingZone = true;
          state.resizeZoneId = selEl.id;
          state.resizeZoneCorner = hitHandle.name;
          state.resizeInitialState = {
            x: selEl.x,
            y: selEl.y,
            radius,
            handleOffsetX: x - hitHandle.x,
            handleOffsetY: y - hitHandle.y
          };
          return;
        }
      } else if (selEl.type === "zone_triangle") {
        const size = selEl.size || 70;
        const triH = size * 0.866;
        const localTips = [
          { name: "top", lx: 0, ly: -triH * 0.6 },
          { name: "br", lx: size * 0.5, ly: triH * 0.4 },
          { name: "bl", lx: -size * 0.5, ly: triH * 0.4 }
        ];
        const tips = localTips.map(tItem => {
          const wPos = toWorldCoord(tItem.lx, tItem.ly);
          return { name: tItem.name, x: wPos.x, y: wPos.y };
        });
        const hitTip = tips.find(tItem => Math.hypot(tItem.x - x, tItem.y - y) <= zHitR);
        if (hitTip) {
          state.isResizingZone = true;
          state.resizeZoneId = selEl.id;
          state.resizeZoneCorner = hitTip.name;
          state.resizeInitialState = {
            x: selEl.x,
            y: selEl.y,
            size,
            handleOffsetX: x - hitTip.x,
            handleOffsetY: y - hitTip.y
          };
          return;
        }
      }
    }
  }

  // 1c. Wenn Pass-, Lauf- oder Hilfslinien-Werkzeug aktiv ist: NICHT das Element greifen/verschieben,
  // sondern direkt die Linie vom Klickpunkt (bzw. vom Ball angedockt) starten!
  if (state.activeTool !== "select" && state.activeTool !== "shape") {
    state.selectedElementId = null;
    state.selectedElementIds = [];
    state.selectedArrowIndex = null;
    state.selectedArrowPart = null;
    hideInspector();
    updateActionPopupPosition();

    let startX = x;
    let startY = y;

    // Wenn der Klick in der Nähe des Balls startet (Radius ~32px), docke exakt an das Ball-Zentrum an!
    const nearBall = (kf.elements || []).find(el => el.type === "ball" && Math.hypot(el.x - x, el.y - y) <= 32);
    if (nearBall) {
      startX = nearBall.x;
      startY = nearBall.y;
    }

    state.isDrawingArrow = true;
    state.arrowStartX = startX;
    state.arrowStartY = startY;
    state.arrowCurrentX = x;
    state.arrowCurrentY = y;
    state.arrowDrawStrokePoints = [{ x: startX, y: startY }];
    drawScene();
    return;
  }

  // 2. Element (Spieler, Bälle, Hütchen, Tore, etc.) oder Linie prüfen:
  // Wenn der Klick direkt auf den Körper eines Spielers/Balls/Geräts zielt, hat der Spieler IMMER Vorrang!
  const effectiveElScale = Math.max(0.6, state.globalElementScale || 1.0);
  const playerBodyRadius = 22 * effectiveElScale; // Reeller Spielerkreis
  const baseHitRadius = Math.max(26 * effectiveElScale, Math.min(65, (30 * effectiveElScale) * invZoom));

  // 2a. Zuerst exakten Treffer auf ein reales Element (Spieler, Ball etc.) prüfen:
  const directHitElement = [...(kf.elements || [])]
    .filter(el => el.type !== "zone_rect" && el.type !== "zone_circle" && el.type !== "zone_triangle")
    .reverse()
    .find(el => {
      // Wenn der Klick innerhalb des sichtbaren Spieler-/Ball-Kreises liegt:
      const r = (el.type === "ball" ? 14 : playerBodyRadius);
      return Math.hypot(el.x - x, el.y - y) <= r;
    });

  // Wenn direkt auf den Spieler geklickt wurde, SOFORT Spieler auswählen (keine Pfeile fangen das ab!):
  if (directHitElement) {
    if (state.activeTool !== "select") {
      setActiveTool("select");
    }
    if (state.selectedElementIds.includes(directHitElement.id)) {
      state.isDragging = true;
      state.isDraggingArrow = false;
      state.groupDragOffsets = {};
      kf.elements.filter(it => state.selectedElementIds.includes(it.id)).forEach(it => {
        state.groupDragOffsets[it.id] = { dx: x - it.x, dy: y - it.y };
      });
      drawScene();
      updateActionPopupPosition();
      return;
    }
    state.selectedElementIds = [];
    state.selectedElementId = directHitElement.id;
    state.selectedArrowIndex = null;
    state.selectedArrowPart = null;
    state.isDragging = true;
    state.isDraggingArrow = false;
    state.dragStartX = x - directHitElement.x;
    state.dragStartY = y - directHitElement.y;
    showInspector(directHitElement);
    drawScene();
    updateActionPopupPosition();
    return;
  }

  // 2b. Wenn kein direkter Treffer auf den Spielerkörper: Linien/Pfeile prüfen
  if (kf.arrows && kf.arrows.length > 0) {
    const arrowHitThreshold = Math.max(12, Math.min(35, 16 * invZoom));
    const handleThreshold = Math.max(14, Math.min(45, 18 * invZoom));

    for (let i = kf.arrows.length - 1; i >= 0; i--) {
      const arr = kf.arrows[i];
      const { p1, p2 } = getArrowCurveControlPoints(arr);
      const distStart = Math.hypot(arr.x1 - x, arr.y1 - y);
      const distEnd = Math.hypot(arr.x2 - x, arr.y2 - y);

      const hitsHandle = (distEnd <= handleThreshold) || (distStart <= handleThreshold);
      const hitsBody = (arr.raw_points && distToPolyline(x, y, arr.raw_points) <= arrowHitThreshold) ||
                       (!arr.raw_points && distToCubicBezier(x, y, { x: arr.x1, y: arr.y1 }, p1, p2, { x: arr.x2, y: arr.y2 }) <= arrowHitThreshold);

      if (hitsHandle || hitsBody) {
        if (state.activeTool !== "select") setActiveTool("select");
        state.selectedArrowIndex = i;
        state.selectedArrowPart = (distEnd <= handleThreshold) ? "end" : ((distStart <= handleThreshold) ? "start" : "body");
        state.selectedElementId = null;
        state.selectedElementIds = [];
        state.isDraggingArrow = true;
        state.isDragging = false;
        state.arrowDragOffsetX = x;
        state.arrowDragOffsetY = y;
        showArrowInspector(arr);
        drawScene();
        updateActionPopupPosition();
        return;
      }
    }
  }

  // 2c. Erweiterte Toleranz-Trefferzone für Elemente (z.B. knapp neben den Spieler getippt):
  const clickedRealElement = [...(kf.elements || [])]
    .filter(el => el.type !== "zone_rect" && el.type !== "zone_circle" && el.type !== "zone_triangle")
    .reverse()
    .find(el => {
      // Ball bekommt eine kompaktere Toleranzzone (max 18px), Spieler behält baseHitRadius
      const rHit = (el.type === "ball") ? Math.max(14 * effectiveElScale, 18) : baseHitRadius;
      return Math.hypot(el.x - x, el.y - y) <= rHit;
    });

  // 2b. Falls kein Spieler/Element angeklickt wurde: Zonen (Flächen) prüfen
  const clickedZoneElement = !clickedRealElement
    ? [...(kf.elements || [])]
        .filter(el => el.type === "zone_rect" || el.type === "zone_circle" || el.type === "zone_triangle")
        .reverse()
        .find(el => {
          let hitR = baseHitRadius;
          if (el.type === "zone_rect") {
            hitR = Math.max(baseHitRadius, ((el.width || 120) / 2) * effectiveElScale);
          } else if (el.type === "zone_circle") {
            hitR = Math.max(baseHitRadius, (el.radius || 50) * effectiveElScale);
          } else if (el.type === "zone_triangle") {
            hitR = Math.max(baseHitRadius, ((el.size || 70) * 0.6) * effectiveElScale);
          }
          return Math.hypot(el.x - x, el.y - y) <= hitR;
        })
    : null;

  const clickedElement = clickedRealElement || clickedZoneElement;

  if (clickedElement) {
    if (state.activeTool !== "select") {
      setActiveTool("select");
    }
    if (state.selectedElementIds.includes(clickedElement.id)) {
      state.isDragging = true;
      state.isDraggingArrow = false;
      state.groupDragOffsets = {};
      kf.elements.filter(it => state.selectedElementIds.includes(it.id)).forEach(it => {
        state.groupDragOffsets[it.id] = { dx: x - it.x, dy: y - it.y };
      });
      drawScene();
      updateActionPopupPosition();
      return;
    }
    state.selectedElementIds = [];
    state.selectedElementId = clickedElement.id;
    state.selectedArrowIndex = null;
    state.selectedArrowPart = null;
    state.isDragging = true;
    state.isDraggingArrow = false;
    state.dragStartX = x - clickedElement.x;
    state.dragStartY = y - clickedElement.y;
    showInspector(clickedElement);
    drawScene();
    updateActionPopupPosition();
    return;
  }

  // 3. Check arrows / lines (nur wenn vorher nichts getroffen wurde)
  if (kf.arrows && kf.arrows.length > 0) {
    const arrowHitThreshold = Math.max(12, Math.min(35, 16 * invZoom));
    const handleThreshold = Math.max(14, Math.min(45, 18 * invZoom));

    for (let i = kf.arrows.length - 1; i >= 0; i--) {
      const arr = kf.arrows[i];
      const { p1, p2 } = getArrowCurveControlPoints(arr);
      const distStart = Math.hypot(arr.x1 - x, arr.y1 - y);
      const distEnd = Math.hypot(arr.x2 - x, arr.y2 - y);

      if (distEnd <= handleThreshold) {
        if (state.activeTool !== "select") setActiveTool("select");
        state.selectedArrowIndex = i;
        state.selectedArrowPart = "end";
        state.selectedElementId = null;
        state.selectedElementIds = [];
        state.isDraggingArrow = true;
        state.isDragging = false;
        showArrowInspector(arr);
        drawScene();
        updateActionPopupPosition();
        return;
      } else if (distStart <= handleThreshold) {
        if (state.activeTool !== "select") setActiveTool("select");
        state.selectedArrowIndex = i;
        state.selectedArrowPart = "start";
        state.selectedElementId = null;
        state.selectedElementIds = [];
        state.isDraggingArrow = true;
        state.isDragging = false;
        showArrowInspector(arr);
        drawScene();
        updateActionPopupPosition();
        return;
      } else if ((arr.raw_points && distToPolyline(x, y, arr.raw_points) <= arrowHitThreshold) ||
                 (!arr.raw_points && distToCubicBezier(x, y, { x: arr.x1, y: arr.y1 }, p1, p2, { x: arr.x2, y: arr.y2 }) <= arrowHitThreshold)) {
        if (state.activeTool !== "select") setActiveTool("select");
        state.selectedArrowIndex = i;
        state.selectedArrowPart = "body";
        state.selectedElementId = null;
        state.selectedElementIds = [];
        state.isDraggingArrow = true;
        state.isDragging = false;
        state.arrowDragOffsetX = x;
        state.arrowDragOffsetY = y;
        showArrowInspector(arr);
        drawScene();
        updateActionPopupPosition();
        return;
      }
    }
  }

  // 4. Clicked on empty pitch
  if (state.activeTool === "select") {
    state.selectedElementId = null;
    state.selectedElementIds = [];
    state.selectedArrowIndex = null;
    state.selectedArrowPart = null;
    hideInspector();
    updateActionPopupPosition();

    state.isLassoSelecting = true;
    state.lassoPoints = [{ x, y }];
    drawScene();
  } else if (state.activeTool === "shape") {
    state.selectedElementId = null;
    state.selectedElementIds = [];
    state.selectedArrowIndex = null;
    state.selectedArrowPart = null;
    hideInspector();
    updateActionPopupPosition();

    state.isDrawingShape = true;
    state.shapeStartX = x;
    state.shapeStartY = y;
    state.shapeCurrentX = x;
    state.shapeCurrentY = y;
    drawScene();
  } else {
    state.selectedElementId = null;
    state.selectedElementIds = [];
    state.selectedArrowIndex = null;
    state.selectedArrowPart = null;
    hideInspector();
    updateActionPopupPosition();

    let startX = x;
    let startY = y;

    // Wenn Pass- oder Lauf-Werkzeug aktiv ist und der Klick in der Nähe des Balls startet (Radius ~32px),
    // docke den Pfeilstartpunkt magnetisch exakt an das Ball-Zentrum an!
    if (state.activeTool === "pass" || state.activeTool === "run") {
      const nearBall = (kf.elements || []).find(el => el.type === "ball" && Math.hypot(el.x - x, el.y - y) <= 32);
      if (nearBall) {
        startX = nearBall.x;
        startY = nearBall.y;
      }
    }

    state.isDrawingArrow = true;
    state.arrowStartX = startX;
    state.arrowStartY = startY;
    state.arrowCurrentX = x;
    state.arrowCurrentY = y;
    state.arrowDrawStrokePoints = [{ x: startX, y: startY }];
    drawScene();
  }
}

export function handleCanvasPointerMove(e, canvas, getCanvasCoords, callbacks = {}) {
  // Wenn der Touch auf einem UI-Element / Dock / Buttons liegt, nicht das Canvas blockieren!
  if (e.target && e.target.closest && e.target.closest("#bottomDockScrollContainer, #keyframesList, #keyframesListDesktop, #desktopTimelineSidebar, #dockScrollLeftHint, #dockScrollRightHint, .touch-pan-x")) {
    return;
  }
  if (state.isPlaying) return;
  if (e.cancelable) e.preventDefault();

  const {
    drawScene = () => {},
    updateZoomUI = () => {},
    updateActionPopupPosition = () => {}
  } = callbacks;

  // Two-finger pinch / pan
  if (state.isPanning && e.touches && e.touches.length >= 2) {
    const t1 = e.touches[0];
    const t2 = e.touches[1];
    const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
    if (state.initialPinchDistance && state.initialPinchDistance > 10) {
      const factor = dist / state.initialPinchDistance;
      state.viewScale = Math.max(0.4, Math.min(2.5, state.initialPinchScale * factor));
    }
    const midX = (t1.clientX + t2.clientX) / 2;
    const midY = (t1.clientY + t2.clientY) / 2;
    state.viewPanX = midX - state.panStartX;
    state.viewPanY = midY - state.panStartY;
    updateZoomUI();
    drawScene();
    return;
  }

  const { x, y } = getCanvasCoords(e);

  // Curve handle drag
  if (state.activeCurveDrag) {
    updateCurveDrag(x, y, state.activeCurveDrag);
    drawScene();
    return;
  }

  // Zone resize drag
  if (state.isResizingZone && state.resizeZoneId) {
    const kf = getCurrentKeyframe();
    const el = kf?.elements?.find(it => it.id === state.resizeZoneId);
    if (el && state.resizeInitialState) {
      if (el.type === "zone_rect") {
        const init = state.resizeInitialState;
        const corner = state.resizeZoneCorner;

        // Ziehe direkt am Handle (korrigiert um den anfänglichen Berührungsoffset, kein Versatz/Springen)
        const effX = x - (init.handleOffsetX || 0);
        const effY = y - (init.handleOffsetY || 0);

        // Transformiere aktuellen Zeiger (effX, effY) in den lokalen Koordinatenraum der Zone
        const totalRotRad = init.totalRotRad || 0;
        const cosA = Math.cos(totalRotRad);
        const sinA = Math.sin(totalRotRad);

        const dxWorld = effX - init.centerX;
        const dyWorld = effY - init.centerY;
        const localMouseX = dxWorld * cosA + dyWorld * sinA;
        const localMouseY = -dxWorld * sinA + dyWorld * cosA;

        let left = -init.width / 2;
        let right = init.width / 2;
        let top = -init.height / 2;
        let bottom = init.height / 2;

        // Jede Seite einzeln ziehbar im lokalen Koordinatensystem (direkt am Griff gebunden)
        if (corner === "l") {
          left = Math.min(localMouseX, right - 20);
        } else if (corner === "r") {
          right = Math.max(localMouseX, left + 20);
        } else if (corner === "t") {
          top = Math.min(localMouseY, bottom - 20);
        } else if (corner === "b") {
          bottom = Math.max(localMouseY, top + 20);
        } else if (corner === "tl") {
          left = Math.min(localMouseX, right - 20);
          top = Math.min(localMouseY, bottom - 20);
        } else if (corner === "tr") {
          right = Math.max(localMouseX, left + 20);
          top = Math.min(localMouseY, bottom - 20);
        } else if (corner === "bl") {
          left = Math.min(localMouseX, right - 20);
          bottom = Math.max(localMouseY, top + 20);
        } else if (corner === "br") {
          right = Math.max(localMouseX, left + 20);
          bottom = Math.max(localMouseY, top + 20);
        }

        const newW = Math.round(right - left);
        const newH = Math.round(bottom - top);
        const localCenterShiftX = (left + right) / 2;
        const localCenterShiftY = (top + bottom) / 2;

        // Verschiebe Mittelpunkt zurück in Weltkoordinaten
        el.x = Math.round(init.centerX + (localCenterShiftX * cosA - localCenterShiftY * sinA));
        el.y = Math.round(init.centerY + (localCenterShiftX * sinA + localCenterShiftY * cosA));
        el.width = newW;
        el.height = newH;
      } else if (el.type === "zone_circle") {
        const init = state.resizeInitialState;
        const effX = x - (init.handleOffsetX || 0);
        const effY = y - (init.handleOffsetY || 0);
        const dist = Math.hypot(effX - el.x, effY - el.y);
        el.radius = Math.max(15, Math.round(dist));
      } else if (el.type === "zone_triangle") {
        const init = state.resizeInitialState;
        const effX = x - (init.handleOffsetX || 0);
        const effY = y - (init.handleOffsetY || 0);
        const dist = Math.hypot(effX - el.x, effY - el.y);
        el.size = Math.max(25, Math.round(dist * 1.2));
      }
      drawScene();
      updateActionPopupPosition();
      return;
    }
  }

  if (state.isDragging || state.isDraggingArrow) {
    if (!state.isMovingElement) {
      state.isMovingElement = true;
      hideInspector();
    }
  }

  // Dragging group
  if (state.isDragging && state.selectedElementIds.length > 0) {
    const kf = getCurrentKeyframe();
    const ex = getCurrentExercise();
    const draggedElements = kf.elements.filter(it => state.selectedElementIds.includes(it.id));
    draggedElements.forEach(el => {
      const off = state.groupDragOffsets[el.id];
      if (off) {
        el.x = Math.max(5, Math.min(VIRTUAL_WIDTH - 5, x - off.dx));
        el.y = Math.max(5, Math.min(VIRTUAL_HEIGHT - 5, y - off.dy));
      }
    });

    draggedElements.forEach(el => {
      if (isEquipment(el.type) && ex && Array.isArray(ex.keyframes)) {
        ex.keyframes.forEach((otherKf, idx) => {
          if (idx !== state.currentKeyframeIndex) {
            const matched = (otherKf.elements || []).find(it => it.id === el.id);
            if (matched) {
              matched.x = el.x;
              matched.y = el.y;
              if (el.rotation !== undefined) matched.rotation = el.rotation;
            }
          }
        });
      }
    });

    drawScene();
    updateActionPopupPosition();
  } else if (state.isDragging && state.selectedElementId) {
    const kf = getCurrentKeyframe();
    const ex = getCurrentExercise();
    const el = (kf.elements || []).find(it => it.id === state.selectedElementId);
    if (el) {
      el.x = Math.max(5, Math.min(VIRTUAL_WIDTH - 5, x - state.dragStartX));
      el.y = Math.max(5, Math.min(VIRTUAL_HEIGHT - 5, y - state.dragStartY));

      if (isEquipment(el.type) && ex && Array.isArray(ex.keyframes)) {
        ex.keyframes.forEach((otherKf, idx) => {
          if (idx !== state.currentKeyframeIndex) {
            const matched = (otherKf.elements || []).find(it => it.id === el.id);
            if (matched) {
              matched.x = el.x;
              matched.y = el.y;
              if (el.rotation !== undefined) matched.rotation = el.rotation;
            }
          }
        });
      }

      drawScene();
      updateActionPopupPosition();
    }
  } else if (state.isLassoSelecting) {
    const lastPoint = state.lassoPoints[state.lassoPoints.length - 1];
    if (!lastPoint || Math.hypot(x - lastPoint.x, y - lastPoint.y) > 6) {
      state.lassoPoints.push({ x, y });
      drawScene();
    }
  } else if (state.isDraggingArrow && state.selectedArrowIndex !== null) {
    const kf = getCurrentKeyframe();
    const ex = getCurrentExercise();
    const arr = kf.arrows ? kf.arrows[state.selectedArrowIndex] : null;
    if (arr) {
      if (state.selectedArrowPart === "start") {
        arr.x1 = Math.max(10, Math.min(VIRTUAL_WIDTH - 10, x));
        arr.y1 = Math.max(10, Math.min(VIRTUAL_HEIGHT - 10, y));
      } else if (state.selectedArrowPart === "end") {
        arr.x2 = Math.max(10, Math.min(VIRTUAL_WIDTH - 10, x));
        arr.y2 = Math.max(10, Math.min(VIRTUAL_HEIGHT - 10, y));
      } else if (state.selectedArrowPart === "body") {
        const dx = x - state.arrowDragOffsetX;
        const dy = y - state.arrowDragOffsetY;
        arr.x1 = Math.max(10, Math.min(VIRTUAL_WIDTH - 10, arr.x1 + dx));
        arr.y1 = Math.max(10, Math.min(VIRTUAL_HEIGHT - 10, arr.y1 + dy));
        arr.x2 = Math.max(10, Math.min(VIRTUAL_WIDTH - 10, arr.x2 + dx));
        arr.y2 = Math.max(10, Math.min(VIRTUAL_HEIGHT - 10, arr.y2 + dy));
        if (arr.raw_points && arr.raw_points.length > 0) {
          for (const pt of arr.raw_points) {
            pt.x += dx;
            pt.y += dy;
          }
        }
        state.arrowDragOffsetX = x;
        state.arrowDragOffsetY = y;
      }

      if (arr.persistent && arr.id && ex && Array.isArray(ex.keyframes)) {
        ex.keyframes.forEach((otherKf, idx) => {
          if (idx !== state.currentKeyframeIndex && otherKf.arrows) {
            const matched = otherKf.arrows.find(it => it.id === arr.id);
            if (matched) {
              matched.x1 = arr.x1;
              matched.y1 = arr.y1;
              matched.x2 = arr.x2;
              matched.y2 = arr.y2;
              matched.cp1_dx = arr.cp1_dx;
              matched.cp1_dy = arr.cp1_dy;
              matched.cp2_dx = arr.cp2_dx;
              matched.cp2_dy = arr.cp2_dy;
            }
          }
        });
      }

      drawScene();
      updateActionPopupPosition();
    }
  } else if (state.isDrawingArrow) {
    state.arrowCurrentX = x;
    state.arrowCurrentY = y;
    const lastPt = state.arrowDrawStrokePoints[state.arrowDrawStrokePoints.length - 1];
    if (!lastPt || Math.hypot(x - lastPt.x, y - lastPt.y) >= 4) {
      state.arrowDrawStrokePoints.push({ x, y });
    }
    drawScene();
  } else if (state.isDrawingShape) {
    state.shapeCurrentX = x;
    state.shapeCurrentY = y;
    drawScene();
  } else if (state.activeTool === "pass" || state.activeTool === "run") {
    // Hover-Feedback: Wenn der Mauszeiger im Pass-Modus über/nahe dem Ball schwebt, Cursor & Ankerpunkt hervorheben
    const kf = getCurrentKeyframe();
    const nearBall = kf && (kf.elements || []).find(el => el.type === "ball" && Math.hypot(el.x - x, el.y - y) <= 32);
    if (nearBall) {
      if (canvas.style.cursor !== "pointer") canvas.style.cursor = "pointer";
      if (!state.hoveredBallAnchorId) {
        state.hoveredBallAnchorId = nearBall.id;
        drawScene();
      }
    } else {
      if (canvas.style.cursor === "pointer") canvas.style.cursor = "";
      if (state.hoveredBallAnchorId) {
        state.hoveredBallAnchorId = null;
        drawScene();
      }
    }
  }
}

export function handleCanvasPointerUp(e, canvas, callbacks = {}) {
  const {
    drawScene = () => {},
    updateActionPopupPosition = () => {},
    recordHistory = () => {}
  } = callbacks;

  if (state.activeCurveDrag) {
    state.activeCurveDrag = null;
    drawScene();
    updateActionPopupPosition();
    if (state.dragInitialSnapshot && state.dragInitialSnapshot !== JSON.stringify(getCurrentExercise())) {
      recordHistory();
    }
    state.dragInitialSnapshot = null;
    return;
  }

  state.isMovingElement = false;

  if (state.isPanning) {
    if (!e.touches || e.touches.length < 2) {
      state.isPanning = false;
      state.initialPinchDistance = null;
    }
  }
  if (state.isDragging) {
    state.isDragging = false;
    state.groupDragOffsets = {};
  }
  if (state.isDraggingArrow) {
    state.isDraggingArrow = false;
  }

  // Lasso finalize
  if (state.isLassoSelecting) {
    state.isLassoSelecting = false;
    const kf = getCurrentKeyframe();

    if (state.lassoPoints.length >= 3 && kf && kf.elements.length > 0) {
      const enclosedIds = [];
      kf.elements.forEach(el => {
        if (pointInPolygon({ x: el.x, y: el.y }, state.lassoPoints)) {
          enclosedIds.push(el.id);
        }
      });

      if (enclosedIds.length > 1) {
        state.selectedElementIds = enclosedIds;
        state.selectedElementId = null;
        showGroupInspector(enclosedIds.length);
      } else if (enclosedIds.length === 1) {
        state.selectedElementId = enclosedIds[0];
        state.selectedElementIds = [];
        const singleEl = kf.elements.find(it => it.id === state.selectedElementId);
        if (singleEl) showInspector(singleEl);
      } else {
        state.selectedElementIds = [];
        state.selectedElementId = null;
        hideInspector();
      }
    } else {
      state.selectedElementIds = [];
      state.selectedElementId = null;
      hideInspector();
    }

    state.lassoPoints = [];
    drawScene();
    updateActionPopupPosition();
  } else if (state.selectedElementId) {
    const kf = getCurrentKeyframe();
    const el = kf?.elements?.find(it => it.id === state.selectedElementId);
    if (el) showInspector(el);
  } else if (state.selectedElementIds.length > 1) {
    showGroupInspector(state.selectedElementIds.length);
  }

  // Zone resizing finalize
  if (state.isResizingZone) {
    state.isResizingZone = false;
    state.resizeZoneId = null;
    state.resizeZoneCorner = null;
    state.resizeInitialState = null;
    recordHistory();
    updateActionPopupPosition();
  }

  // Arrow drawing finalize
  if (state.isDrawingArrow) {
    state.isDrawingArrow = false;
    const dist = Math.hypot(state.arrowCurrentX - state.arrowStartX, state.arrowCurrentY - state.arrowStartY);
    if (dist > 15) {
      const kf = getCurrentKeyframe();
      if (!kf.arrows) kf.arrows = [];
      const aType = (state.activeTool === "pass") ? "pass" : ((state.activeTool === "guide") ? "guide" : "run");
      const col = (state.activeTool === "pass") ? "#facc15" : ((state.activeTool === "guide") ? "#fbbf24" : "#38bdf8");

      let cp1_dx = 0, cp1_dy = 0, cp2_dx = 0, cp2_dy = 0;
      let rawPoints = null;

      if (state.lineDrawMode === "raw_freehand" && state.arrowDrawStrokePoints.length >= 2) {
        rawPoints = state.arrowDrawStrokePoints.map(p => ({ x: Math.round(p.x), y: Math.round(p.y) }));
      } else if (state.lineDrawMode === "freehand" && state.arrowDrawStrokePoints.length >= 3) {
        const fitted = fitCubicBezierToStroke(state.arrowDrawStrokePoints);
        if (fitted) {
          cp1_dx = Math.round(fitted.cp1_dx);
          cp1_dy = Math.round(fitted.cp1_dy);
          cp2_dx = Math.round(fitted.cp2_dx);
          cp2_dy = Math.round(fitted.cp2_dy);
        }
        rawPoints = null;
      }

      const newArrow = {
        id: "arr_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
        type: aType,
        color: col,
        x1: Math.round(state.arrowStartX),
        y1: Math.round(state.arrowStartY),
        x2: Math.round(state.arrowCurrentX),
        y2: Math.round(state.arrowCurrentY),
        cp1_dx,
        cp1_dy,
        cp2_dx,
        cp2_dy,
        persistent: false
      };

      if (rawPoints && rawPoints.length > 0) {
        newArrow.raw_points = rawPoints;
      }

      kf.arrows.push(newArrow);
      state.arrowDrawStrokePoints = [];
      // Nach dem Zeichnen bleibt die Linie unselektiert (kein störender Bearbeitungsmodus),
      // bis der Nutzer sie später gezielt anklickt.
      state.selectedArrowIndex = null;
      state.selectedArrowPart = null;
      hideInspector();
    } else {
      state.arrowDrawStrokePoints = [];
    }

    drawScene();
    updateActionPopupPosition();
  }

  // Shape drawing finalize (Rectangle, Circle, Triangle)
  if (state.isDrawingShape) {
    state.isDrawingShape = false;
    const dx = state.shapeCurrentX - state.shapeStartX;
    const dy = state.shapeCurrentY - state.shapeStartY;
    const dist = Math.hypot(dx, dy);

    if (dist > 15) {
      const kf = getCurrentKeyframe();
      if (!kf.elements) kf.elements = [];

      const shapeType = state.selectedShapeType || "rect";
      let newEl = null;

      if (shapeType === "rect") {
        const w = Math.max(20, Math.round(Math.abs(dx)));
        const h = Math.max(20, Math.round(Math.abs(dy)));
        const cx = Math.round((state.shapeStartX + state.shapeCurrentX) / 2);
        const cy = Math.round((state.shapeStartY + state.shapeCurrentY) / 2);
        newEl = {
          id: "el_zone_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
          type: "zone_rect",
          x: cx,
          y: cy,
          width: w,
          height: h,
          color: "#38bdf8",
          fillColor: "rgba(56, 189, 248, 0.18)",
          rotation: 0
        };
      } else if (shapeType === "circle") {
        const radius = Math.max(12, Math.round(dist / 2));
        const cx = Math.round((state.shapeStartX + state.shapeCurrentX) / 2);
        const cy = Math.round((state.shapeStartY + state.shapeCurrentY) / 2);
        newEl = {
          id: "el_zone_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
          type: "zone_circle",
          x: cx,
          y: cy,
          radius: radius,
          color: "#eab308",
          fillColor: "rgba(234, 179, 8, 0.18)",
          rotation: 0
        };
      } else if (shapeType === "triangle") {
        const size = Math.max(20, Math.round(dist));
        const cx = Math.round((state.shapeStartX + state.shapeCurrentX) / 2);
        const cy = Math.round((state.shapeStartY + state.shapeCurrentY) / 2);
        newEl = {
          id: "el_zone_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
          type: "zone_triangle",
          x: cx,
          y: cy,
          size: size,
          color: "#a855f7",
          fillColor: "rgba(168, 85, 247, 0.18)",
          rotation: 0
        };
      }

      if (newEl) {
        kf.elements.push(newEl);
        // Nach dem Aufziehen bleibt die Form unselektiert (keine Handles / kein Popup),
        // bis der Nutzer sie später gezielt anklickt.
        state.selectedElementId = null;
        state.selectedElementIds = [];
        state.selectedArrowIndex = null;
        hideInspector();
      }
    }

    drawScene();
    updateActionPopupPosition();
  }

  if (state.dragInitialSnapshot && state.dragInitialSnapshot !== JSON.stringify(getCurrentExercise())) {
    recordHistory();
  }
  state.dragInitialSnapshot = null;
}
