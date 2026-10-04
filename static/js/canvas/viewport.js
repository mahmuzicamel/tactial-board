// canvas/viewport.js - Zoom, Pan, Rotation und Koordinaten-Transformationen
import { VIRTUAL_WIDTH, VIRTUAL_HEIGHT, MIN_SCALE, MAX_SCALE } from "../core/constants.js";
import { state } from "../state/store.js";

export function getDisplayDimensions(canvas) {
  const rect = canvas.getBoundingClientRect();
  return {
    w: Math.round(rect.width) || VIRTUAL_WIDTH,
    h: Math.round(rect.height) || VIRTUAL_HEIGHT
  };
}

// Convert Virtual Coordinates (1050x680) to Canvas Screen/DOM Pixels
export function getScreenCoords(canvas, vx, vy) {
  const rect = canvas.getBoundingClientRect();
  const dispW = rect.width;
  const dispH = rect.height;

  const isRotated90 = (state.fieldRotation === 90 || state.fieldRotation === 270);
  const effectiveVW = isRotated90 ? VIRTUAL_HEIGHT : VIRTUAL_WIDTH;
  const effectiveVH = isRotated90 ? VIRTUAL_WIDTH : VIRTUAL_HEIGHT;
  const baseScale = Math.min(dispW / effectiveVW, dispH / effectiveVH);

  // Scaled coordinates from virtual center (525, 340)
  let sx = (vx - VIRTUAL_WIDTH / 2) * baseScale;
  let sy = (vy - VIRTUAL_HEIGHT / 2) * baseScale;

  // Rotation
  if (state.fieldRotation !== 0) {
    const rad = (state.fieldRotation * Math.PI) / 180;
    const cosA = Math.cos(rad);
    const sinA = Math.sin(rad);
    const rx = sx * cosA - sy * sinA;
    const ry = sx * sinA + sy * cosA;
    sx = rx;
    sy = ry;
  }

  // Zoom & Pan from display center
  const centerX = dispW / 2;
  const centerY = dispH / 2;
  const screenX = centerX + state.viewPanX + sx * state.viewScale;
  const screenY = centerY + state.viewPanY + sy * state.viewScale;

  return { x: screenX, y: screenY };
}

// Convert Screen/Event Coordinates to Virtual Coordinates (1050x680)
export function getCanvasCoords(canvas, evt) {
  const rect = canvas.getBoundingClientRect();
  const dispW = rect.width;
  const dispH = rect.height;

  let clientX, clientY;
  if (evt.touches && evt.touches.length > 0) {
    clientX = evt.touches[0].clientX;
    clientY = evt.touches[0].clientY;
  } else {
    clientX = evt.clientX;
    clientY = evt.clientY;
  }

  const cx = clientX - rect.left;
  const cy = clientY - rect.top;

  // Invert Zoom & Pan around center of display
  const centerX = dispW / 2;
  const centerY = dispH / 2;

  let unpannedX = (cx - centerX - state.viewPanX) / state.viewScale;
  let unpannedY = (cy - centerY - state.viewPanY) / state.viewScale;

  // Invert rotation around center
  if (state.fieldRotation !== 0) {
    const rad = (-state.fieldRotation * Math.PI) / 180;
    const cosA = Math.cos(rad);
    const sinA = Math.sin(rad);
    const rx = unpannedX * cosA - unpannedY * sinA;
    const ry = unpannedX * sinA + unpannedY * cosA;
    unpannedX = rx;
    unpannedY = ry;
  }

  // Invert virtual fit scale
  const isRotated90 = (state.fieldRotation === 90 || state.fieldRotation === 270);
  const effectiveVW = isRotated90 ? VIRTUAL_HEIGHT : VIRTUAL_WIDTH;
  const effectiveVH = isRotated90 ? VIRTUAL_WIDTH : VIRTUAL_HEIGHT;
  const baseScale = Math.min(dispW / effectiveVW, dispH / effectiveVH);

  return {
    x: unpannedX / baseScale + VIRTUAL_WIDTH / 2,
    y: unpannedY / baseScale + VIRTUAL_HEIGHT / 2
  };
}

export function zoomAt(canvas, targetScale, clientPoint = null, onRedraw = null) {
  const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, targetScale));
  if (newScale === state.viewScale) return;

  const rect = canvas.getBoundingClientRect();
  const centerX = rect.width / 2;
  const centerY = rect.height / 2;

  let cx = centerX;
  let cy = centerY;
  if (clientPoint) {
    cx = clientPoint.x - rect.left;
    cy = clientPoint.y - rect.top;
  }

  const worldX = (cx - centerX - state.viewPanX) / state.viewScale + centerX;
  const worldY = (cy - centerY - state.viewPanY) / state.viewScale + centerY;

  state.viewPanX = cx - centerX - (worldX - centerX) * newScale;
  state.viewPanY = cy - centerY - (worldY - centerY) * newScale;
  state.viewScale = newScale;

  updateZoomUI();
  if (onRedraw) onRedraw();
}

export function updateZoomUI() {
  const badge = document.getElementById("zoomLevelText");
  if (badge) {
    badge.textContent = `${Math.round(state.viewScale * 100)}%`;
  }
}
