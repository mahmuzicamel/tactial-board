// core/geometry.js - Mathematische Hilfsfunktionen, Bézier-Berechnung & Curve-Fitting

export function distToSegment(px, py, x1, y1, x2, y2) {
  const l2 = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
  if (l2 === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
  t = Math.max(0, Math.min(1, t));
  const projX = x1 + t * (x2 - x1);
  const projY = y1 + t * (y2 - y1);
  return Math.hypot(px - projX, py - projY);
}

export function distToPolyline(px, py, points) {
  if (!points || points.length < 2) return Infinity;
  let minDist = Infinity;
  for (let i = 1; i < points.length; i++) {
    const d = distToSegment(px, py, points[i - 1].x, points[i - 1].y, points[i].x, points[i].y);
    if (d < minDist) minDist = d;
  }
  return minDist;
}

// Point in Polygon algorithm (Ray-Casting) to detect elements inside lasso loop
export function pointInPolygon(point, vs) {
  const x = point.x, y = point.y;
  let inside = false;
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    const xi = vs[i].x, yi = vs[i].y;
    const xj = vs[j].x, yj = vs[j].y;
    const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

export function getCubicBezierPoint(t, p0, p1, p2, p3) {
  const u = 1 - t;
  const tt = t * t;
  const uu = u * u;
  const uuu = uu * u;
  const ttt = tt * t;

  return {
    x: uuu * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + ttt * p3.x,
    y: uuu * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + ttt * p3.y
  };
}

export function distToCubicBezier(px, py, p0, p1, p2, p3, samples = 20) {
  let minDist = Infinity;
  let prevPt = p0;
  for (let i = 1; i <= samples; i++) {
    const t = i / samples;
    const currPt = getCubicBezierPoint(t, p0, p1, p2, p3);
    const d = distToSegment(px, py, prevPt.x, prevPt.y, currPt.x, currPt.y);
    if (d < minDist) minDist = d;
    prevPt = currPt;
  }
  return minDist;
}

export function getEffectiveCurveControlPoints(fromEl, toEl) {
  const dx = toEl.x - fromEl.x;
  const dy = toEl.y - fromEl.y;

  const p1 = {
    x: fromEl.x + dx * (1 / 3) + (toEl.cp1_dx || 0),
    y: fromEl.y + dy * (1 / 3) + (toEl.cp1_dy || 0)
  };
  const p2 = {
    x: fromEl.x + dx * (2 / 3) + (toEl.cp2_dx || 0),
    y: fromEl.y + dy * (2 / 3) + (toEl.cp2_dy || 0)
  };
  return { p1, p2 };
}

export function getArrowCurveControlPoints(arr) {
  const dx = arr.x2 - arr.x1;
  const dy = arr.y2 - arr.y1;
  const p1 = {
    x: arr.x1 + dx * (1 / 3) + (arr.cp1_dx || 0),
    y: arr.y1 + dy * (1 / 3) + (arr.cp1_dy || 0)
  };
  const p2 = {
    x: arr.x1 + dx * (2 / 3) + (arr.cp2_dx || 0),
    y: arr.y1 + dy * (2 / 3) + (arr.cp2_dy || 0)
  };
  return { p1, p2 };
}

export function fitCubicBezierToStroke(points) {
  if (!points || points.length < 3) return null;
  const p0 = points[0];
  const p3 = points[points.length - 1];
  const chordDx = p3.x - p0.x;
  const chordDy = p3.y - p0.y;
  const chordLen = Math.hypot(chordDx, chordDy);
  if (chordLen < 15) return null;

  const cumDists = [0];
  for (let i = 1; i < points.length; i++) {
    cumDists.push(cumDists[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
  }
  const totalStrokeLen = cumDists[cumDists.length - 1];
  if (totalStrokeLen < 15) return null;

  let maxDeviation = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const dev = distToSegment(points[i].x, points[i].y, p0.x, p0.y, p3.x, p3.y);
    if (dev > maxDeviation) maxDeviation = dev;
  }

  if (maxDeviation < 6 || maxDeviation / chordLen < 0.04) {
    return { cp1_dx: 0, cp1_dy: 0, cp2_dx: 0, cp2_dy: 0 };
  }

  // Tangenten an den Enden (Start und Ende) robust schätzen
  const n = points.length;
  const kStart = Math.min(n - 1, Math.max(2, Math.floor(n * 0.18)));
  const kEnd = Math.max(0, Math.min(n - 3, Math.floor(n * 0.82)));

  let t1x = points[kStart].x - p0.x;
  let t1y = points[kStart].y - p0.y;
  const t1Len = Math.hypot(t1x, t1y);
  if (t1Len > 0.001) { t1x /= t1Len; t1y /= t1Len; } else { t1x = chordDx / chordLen; t1y = chordDy / chordLen; }

  let t2x = p3.x - points[kEnd].x;
  let t2y = p3.y - points[kEnd].y;
  const t2Len = Math.hypot(t2x, t2y);
  if (t2Len > 0.001) { t2x /= t2Len; t2y /= t2Len; } else { t2x = chordDx / chordLen; t2y = chordDy / chordLen; }

  // Initiales t-Array basierend auf Bogenlänge
  let uArr = points.map((_, i) => Math.max(0.001, Math.min(0.999, cumDists[i] / totalStrokeLen)));

  let bestFit = null;

  // 2 Iterationen: Least Squares Fit + Newton-Raphson Reparametrisierung
  for (let iter = 0; iter < 2; iter++) {
    let c11 = 0, c12 = 0, c22 = 0;
    let rx1 = 0, ry1 = 0, rx2 = 0, ry2 = 0;

    for (let i = 0; i < points.length; i++) {
      const t = uArr[i];
      const u = 1 - t;
      const b0 = u * u * u;
      const b1 = 3 * u * u * t;
      const b2 = 3 * u * t * t;
      const b3 = t * t * t;

      const targetX = points[i].x - b0 * p0.x - b3 * p3.x;
      const targetY = points[i].y - b0 * p0.y - b3 * p3.y;

      c11 += b1 * b1;
      c12 += b1 * b2;
      c22 += b2 * b2;

      rx1 += b1 * targetX;
      ry1 += b1 * targetY;
      rx2 += b2 * targetX;
      ry2 += b2 * targetY;
    }

    const det = c11 * c22 - c12 * c12;
    if (Math.abs(det) < 1e-6) break;

    let fitP1X = (c22 * rx1 - c12 * rx2) / det;
    let fitP1Y = (c22 * ry1 - c12 * ry2) / det;
    let fitP2X = (c11 * rx2 - c12 * rx1) / det;
    let fitP2Y = (c11 * ry2 - c12 * ry1) / det;

    bestFit = {
      p1: { x: fitP1X, y: fitP1Y },
      p2: { x: fitP2X, y: fitP2Y }
    };

    if (iter === 0) {
      // Reparametrisiere uArr mit Newton-Raphson für engere Annäherung
      uArr = points.map((pt, i) => {
        let u = uArr[i];
        for (let step = 0; step < 2; step++) {
          const om = 1 - u;
          // P(u)
          const px = om * om * om * p0.x + 3 * om * om * u * fitP1X + 3 * om * u * u * fitP2X + u * u * u * p3.x;
          const py = om * om * om * p0.y + 3 * om * om * u * fitP1Y + 3 * om * u * u * fitP2Y + u * u * u * p3.y;
          // P'(u)
          const dpx = 3 * om * om * (fitP1X - p0.x) + 6 * om * u * (fitP2X - fitP1X) + 3 * u * u * (p3.x - fitP2X);
          const dpy = 3 * om * om * (fitP1Y - p0.y) + 6 * om * u * (fitP2Y - fitP1Y) + 3 * u * u * (p3.y - fitP2Y);
          const num = (px - pt.x) * dpx + (py - pt.y) * dpy;
          const denom = dpx * dpx + dpy * dpy;
          if (Math.abs(denom) < 1e-6) break;
          u = Math.max(0.001, Math.min(0.999, u - num / denom));
        }
        return u;
      });
    }
  }

  if (!bestFit) {
    return { cp1_dx: 0, cp1_dy: 0, cp2_dx: 0, cp2_dy: 0 };
  }

  // Endtangenten-Schutz: Verhindere unnatürliches Überschlagen am Pfeilende
  const p1 = bestFit.p1;
  const p2 = bestFit.p2;

  // Begrenze maximale Auslenkung auf das 2-fache der Sehnenlänge
  const defaultP1X = p0.x + chordDx * (1 / 3);
  const defaultP1Y = p0.y + chordDy * (1 / 3);
  const defaultP2X = p0.x + chordDx * (2 / 3);
  const defaultP2Y = p0.y + chordDy * (2 / 3);

  return {
    cp1_dx: Math.round(p1.x - defaultP1X),
    cp1_dy: Math.round(p1.y - defaultP1Y),
    cp2_dx: Math.round(p2.x - defaultP2X),
    cp2_dy: Math.round(p2.y - defaultP2Y)
  };
}
