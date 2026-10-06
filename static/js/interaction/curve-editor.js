// interaction/curve-editor.js - Bézier-Kurven-Griffe (P1, P2, Mid) für Geisterbahnen & Linien
import { state, getCurrentExercise } from "../state/store.js";
import { getEffectiveCurveControlPoints, getArrowCurveControlPoints, getCubicBezierPoint } from "../core/geometry.js";

export function handleCurvePointerDown(x, y, kf, prevKf, handleHitRadius) {
  // 1. Ghost motion curve handles:
  // USABILITY-FIX: Nur aktiv, wenn der zugehörige Spieler aktuell auch markiert/ausgewählt ist!
  // Dadurch blockieren Ghost-Kurvengriffe NIEMALS das Anklicken von Linien oder anderen Spielern.
  if (state.isGhostMode !== "off" && prevKf && state.selectedElementId) {
    const currEl = (kf.elements || []).find(it => it.id === state.selectedElementId);
    if (currEl && (currEl.type === "player" || currEl.type === "ball")) {
      const prevEl = (prevKf.elements || []).find(it => it.id === currEl.id);
      if (prevEl) {
        const dist = Math.hypot(currEl.x - prevEl.x, currEl.y - prevEl.y);
        if (dist > 8) {
          const { p1, p2 } = getEffectiveCurveControlPoints(prevEl, currEl);
          const pMid = getCubicBezierPoint(0.5, prevEl, p1, p2, currEl);
          const ghostHitR = Math.min(handleHitRadius, 20);

          if (Math.hypot(x - p1.x, y - p1.y) <= ghostHitR) {
            return {
              elementId: currEl.id,
              handle: "p1",
              fromEl: { x: prevEl.x, y: prevEl.y },
              toEl: currEl
            };
          }
          if (Math.hypot(x - pMid.x, y - pMid.y) <= ghostHitR) {
            return {
              elementId: currEl.id,
              handle: "mid",
              fromEl: { x: prevEl.x, y: prevEl.y },
              toEl: currEl,
              initialMid: { x: pMid.x, y: pMid.y }
            };
          }
          if (Math.hypot(x - p2.x, y - p2.y) <= ghostHitR) {
            return {
              elementId: currEl.id,
              handle: "p2",
              fromEl: { x: prevEl.x, y: prevEl.y },
              toEl: currEl
            };
          }
        }
      }
    }
  }

  // 2. Selected arrow curve handles
  if (state.selectedArrowIndex !== null && kf.arrows && kf.arrows[state.selectedArrowIndex]) {
    const selArr = kf.arrows[state.selectedArrowIndex];
    const { p1: selP1, p2: selP2 } = getArrowCurveControlPoints(selArr);
    const selPMid = getCubicBezierPoint(0.5, { x: selArr.x1, y: selArr.y1 }, selP1, selP2, { x: selArr.x2, y: selArr.y2 });

    // Zuerst P1 (oberer Kontrollpunkt) und P2 (unterer Kontrollpunkt) mit Prio prüfen
    if (Math.hypot(x - selP1.x, y - selP1.y) <= handleHitRadius) {
      return { arrowIndex: state.selectedArrowIndex, handle: "p1", arrow: selArr };
    }
    if (Math.hypot(x - selP2.x, y - selP2.y) <= handleHitRadius) {
      return { arrowIndex: state.selectedArrowIndex, handle: "p2", arrow: selArr };
    }
    if (Math.hypot(x - selPMid.x, y - selPMid.y) <= handleHitRadius) {
      return { arrowIndex: state.selectedArrowIndex, handle: "mid", arrow: selArr };
    }
  }

  // 3. Fallback: Auch wenn kein Pfeil vor-selektiert ist, Kontrollpunkte aller gekrümmten Pfeile prüfen
  if (kf.arrows && kf.arrows.length > 0) {
    for (let i = kf.arrows.length - 1; i >= 0; i--) {
      if (i === state.selectedArrowIndex) continue;
      const arr = kf.arrows[i];
      const { p1, p2 } = getArrowCurveControlPoints(arr);
      const pMid = getCubicBezierPoint(0.5, { x: arr.x1, y: arr.y1 }, p1, p2, { x: arr.x2, y: arr.y2 });

      if (Math.hypot(x - p1.x, y - p1.y) <= handleHitRadius) {
        state.selectedArrowIndex = i;
        return { arrowIndex: i, handle: "p1", arrow: arr };
      }
      if (Math.hypot(x - p2.x, y - p2.y) <= handleHitRadius) {
        state.selectedArrowIndex = i;
        return { arrowIndex: i, handle: "p2", arrow: arr };
      }
      if (Math.hypot(x - pMid.x, y - pMid.y) <= handleHitRadius) {
        state.selectedArrowIndex = i;
        return { arrowIndex: i, handle: "mid", arrow: arr };
      }
    }
  }

  return null;
}

export function updateCurveDrag(x, y, activeCurveDrag) {
  if (!activeCurveDrag) return;
  const ex = getCurrentExercise();

  if (activeCurveDrag.arrow) {
    const { handle, arrow } = activeCurveDrag;
    const dx = arrow.x2 - arrow.x1;
    const dy = arrow.y2 - arrow.y1;

    if (handle === "p1") {
      const defaultP1X = arrow.x1 + dx * (1 / 3);
      const defaultP1Y = arrow.y1 + dy * (1 / 3);
      arrow.cp1_dx = Math.round(x - defaultP1X);
      arrow.cp1_dy = Math.round(y - defaultP1Y);
    } else if (handle === "p2") {
      const defaultP2X = arrow.x1 + dx * (2 / 3);
      const defaultP2Y = arrow.y1 + dy * (2 / 3);
      arrow.cp2_dx = Math.round(x - defaultP2X);
      arrow.cp2_dy = Math.round(y - defaultP2Y);
    } else if (handle === "mid") {
      const straightMidX = arrow.x1 + dx * 0.5;
      const straightMidY = arrow.y1 + dy * 0.5;
      const offsetMidX = x - straightMidX;
      const offsetMidY = y - straightMidY;
      arrow.cp1_dx = Math.round(offsetMidX * 1.33);
      arrow.cp1_dy = Math.round(offsetMidY * 1.33);
      arrow.cp2_dx = Math.round(offsetMidX * 1.33);
      arrow.cp2_dy = Math.round(offsetMidY * 1.33);
    }

    if (arrow.persistent && arrow.id && ex && Array.isArray(ex.keyframes)) {
      ex.keyframes.forEach((otherKf, idx) => {
        if (idx !== state.currentKeyframeIndex && otherKf.arrows) {
          const matched = otherKf.arrows.find(it => it.id === arrow.id);
          if (matched) {
            matched.cp1_dx = arrow.cp1_dx;
            matched.cp1_dy = arrow.cp1_dy;
            matched.cp2_dx = arrow.cp2_dx;
            matched.cp2_dy = arrow.cp2_dy;
          }
        }
      });
    }
    return;
  }

  // Ghost trajectory handle drag
  const { handle, fromEl, toEl } = activeCurveDrag;
  const dx = toEl.x - fromEl.x;
  const dy = toEl.y - fromEl.y;

  if (handle === "p1") {
    const defaultP1X = fromEl.x + dx * (1 / 3);
    const defaultP1Y = fromEl.y + dy * (1 / 3);
    toEl.cp1_dx = Math.round(x - defaultP1X);
    toEl.cp1_dy = Math.round(y - defaultP1Y);
  } else if (handle === "p2") {
    const defaultP2X = fromEl.x + dx * (2 / 3);
    const defaultP2Y = fromEl.y + dy * (2 / 3);
    toEl.cp2_dx = Math.round(x - defaultP2X);
    toEl.cp2_dy = Math.round(y - defaultP2Y);
  } else if (handle === "mid") {
    const straightMidX = fromEl.x + dx * 0.5;
    const straightMidY = fromEl.y + dy * 0.5;
    const offsetMidX = x - straightMidX;
    const offsetMidY = y - straightMidY;
    toEl.cp1_dx = Math.round(offsetMidX * 1.33);
    toEl.cp1_dy = Math.round(offsetMidY * 1.33);
    toEl.cp2_dx = Math.round(offsetMidX * 1.33);
    toEl.cp2_dy = Math.round(offsetMidY * 1.33);
  }
}
