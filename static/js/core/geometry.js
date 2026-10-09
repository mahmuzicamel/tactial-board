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

// Interpoliert die Elemente zweier Keyframes an einem geglätteten Zeitpunkt smoothT (0..1).
// Einzige Wahrheit für die Animations-Mathematik (Position/Bézier/Jump/Rotation),
// genutzt von 2D-Playback (playback.js) und 3D-Playback (view3d.js) gleichermaßen.
// includeRotation=true aktiviert die Winkel-Interpolation (nur für die 3D-Szene relevant).
export function interpolateKeyframeElements(kf1, kf2, smoothT, { includeRotation = false } = {}) {
  const map1 = new Map((kf1.elements || []).map((e) => [e.id, e]));
  const map2 = new Map((kf2.elements || []).map((e) => [e.id, e]));
  const interpolated = [];
  const allIds = new Set([...map1.keys(), ...map2.keys()]);

  for (const id of allIds) {
    const el1 = map1.get(id);
    const el2 = map2.get(id);

    if (el1 && el2) {
      let posX, posY;
      if (el2.cp1_dx !== undefined || el2.cp1_dy !== undefined || el2.cp2_dx !== undefined || el2.cp2_dy !== undefined) {
        const { p1, p2 } = getEffectiveCurveControlPoints(el1, el2);
        const pt = getCubicBezierPoint(smoothT, el1, p1, p2, el2);
        posX = pt.x;
        posY = pt.y;
      } else {
        posX = el1.x + (el2.x - el1.x) * smoothT;
        posY = el1.y + (el2.y - el1.y) * smoothT;
      }

      let scaleMult = 1.0;
      let jumpOffset = 0;
      if (el2.jump) {
        const jumpFactor = Math.sin(smoothT * Math.PI);
        scaleMult = 1.0 + jumpFactor * 0.45;
        jumpOffset = jumpFactor;
      }

      const merged = {
        ...el1,
        ...el2,
        x: posX,
        y: posY,
        scaleMultiplier: scaleMult,
        jumpProgress: jumpOffset
      };

      if (includeRotation) {
        const rot1 = el1.rotation || 0;
        const rot2 = el2.rotation !== undefined ? el2.rotation : rot1;
        let diffRot = (rot2 - rot1) % 360;
        if (diffRot > 180) diffRot -= 360;
        if (diffRot < -180) diffRot += 360;
        merged.rotation = rot1 + diffRot * smoothT;
      }

      interpolated.push(merged);
    } else if (el1) {
      interpolated.push(el1);
    } else if (el2 && smoothT > 0.5) {
      interpolated.push(el2);
    }
  }

  return interpolated;
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

// Ramer-Douglas-Peucker (RDP) Pfad-Vereinfachung zur Reduktion von Jitter / Rauschen
export function simplifyPathRDP(points, epsilon = 2.5) {
  if (!points || points.length <= 2) return points ? [...points] : [];
  let maxDist = 0;
  let index = 0;
  const p0 = points[0];
  const pEnd = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const d = distToSegment(points[i].x, points[i].y, p0.x, p0.y, pEnd.x, pEnd.y);
    if (d > maxDist) {
      maxDist = d;
      index = i;
    }
  }

  if (maxDist > epsilon) {
    const rec1 = simplifyPathRDP(points.slice(0, index + 1), epsilon);
    const rec2 = simplifyPathRDP(points.slice(index), epsilon);
    return rec1.slice(0, rec1.length - 1).concat(rec2);
  } else {
    return [p0, pEnd];
  }
}

// Chaikin's Corner-Cutting Algorithmus (macht harte Winkel & Zickzack-Kanten extrem glatt und rund)
export function chaikinSmooth(points, iterations = 2) {
  if (!points || points.length <= 2) return points ? [...points] : [];
  let current = [...points];

  for (let iter = 0; iter < iterations; iter++) {
    const next = [current[0]];
    for (let i = 0; i < current.length - 1; i++) {
      const p0 = current[i];
      const p1 = current[i + 1];
      // 25% und 75% Punkte
      next.push({
        x: p0.x * 0.75 + p1.x * 0.25,
        y: p0.y * 0.75 + p1.y * 0.25
      });
      next.push({
        x: p0.x * 0.25 + p1.x * 0.75,
        y: p0.y * 0.25 + p1.y * 0.75
      });
    }
    next.push(current[current.length - 1]);
    current = next;
  }
  return current;
}

// Resampling entlang der Bogenlänge mit festem Schrittmaß für gleichmäßige Stützpunkte
export function resamplePath(points, spacing = 20) {
  if (!points || points.length < 2) return points ? [...points] : [];
  const res = [points[0]];
  let prev = points[0];
  let acc = 0;

  for (let i = 1; i < points.length; i++) {
    const curr = points[i];
    const d = Math.hypot(curr.x - prev.x, curr.y - prev.y);
    if (acc + d >= spacing) {
      const remain = spacing - acc;
      const ratio = remain / d;
      const np = {
        x: prev.x + (curr.x - prev.x) * ratio,
        y: prev.y + (curr.y - prev.y) * ratio
      };
      res.push(np);
      prev = np;
      acc = 0;
      i--; // Punkt nochmals verwerten falls Segment lang genug
    } else {
      acc += d;
      prev = curr;
    }
  }

  const lastPt = points[points.length - 1];
  if (Math.hypot(res[res.length - 1].x - lastPt.x, res[res.length - 1].y - lastPt.y) > 5) {
    res.push(lastPt);
  }
  return res;
}

// Catmull-Rom Spline zu zusammengesetzten kubischen Bézier-Segmenten (GoodNotes / Notability Standard)
export function catmullRomToBezier(points, tension = 0.5) {
  if (!points || points.length < 2) return [];
  if (points.length === 2) {
    const p0 = points[0];
    const p1 = points[1];
    return [{
      p0,
      cp1: { x: p0.x + (p1.x - p0.x) / 3, y: p0.y + (p1.y - p0.y) / 3 },
      cp2: { x: p0.x + (p1.x - p0.x) * 2 / 3, y: p0.y + (p1.y - p0.y) * 2 / 3 },
      p3: p1
    }];
  }

  // Für saubere Endpunkte Clamping der Randpunkte (P_{-1} = P_0, P_{n} = P_{n-1})
  const pts = [points[0], ...points, points[points.length - 1]];
  const segments = [];

  for (let i = 1; i < pts.length - 2; i++) {
    const p0 = pts[i - 1];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2];

    // Catmull-Rom Kontrollpunkte zu kubischen Bézier-Kontrollpunkten
    const cp1 = {
      x: p1.x + ((p2.x - p0.x) / 6) * (tension * 2),
      y: p1.y + ((p2.y - p0.y) / 6) * (tension * 2)
    };
    const cp2 = {
      x: p2.x - ((p3.x - p1.x) / 6) * (tension * 2),
      y: p2.y - ((p3.y - p1.y) / 6) * (tension * 2)
    };

    segments.push({
      p0: { x: p1.x, y: p1.y },
      cp1,
      cp2,
      p3: { x: p2.x, y: p2.y }
    });
  }

  return segments;
}

// 1. Finde den Scheitelpunkt S (Punkt mit max. Abstand zur Sehne P0-P2)
export function getPeakPoint(points, p0, p2) {
  let maxDist = -1;
  let peak = points[Math.floor(points.length / 2)]; // Fallback: Mitte nach Index

  for (const p of points) {
    // Normalisierter Abstand zur Linie p0 -> p2
    const dist = Math.abs((p2.y - p0.y) * p.x - (p2.x - p0.x) * p.y + p2.x * p0.y - p2.y * p0.x)
                 / Math.hypot(p2.y - p0.y, p2.x - p0.x);
    if (dist > maxDist) {
      maxDist = dist;
      peak = p;
    }
  }
  return peak;
}

// Wendepunkt-Erkennung (Inflection Point) für S-Kurven
export function detectInflection(points) {
  if (!points || points.length < 8) return { hasInflection: false, splitIndex: -1 };
  let signChanges = 0;
  let lastSign = 0;
  let splitIndex = -1;

  for (let i = 2; i < points.length - 2; i++) {
    // Vektor 1: i-2 -> i, Vektor 2: i -> i+2 (geglättet)
    const dx1 = points[i].x - points[i - 2].x;
    const dy1 = points[i].y - points[i - 2].y;
    const dx2 = points[i + 2].x - points[i].x;
    const dy2 = points[i + 2].y - points[i].y;

    const cross = dx1 * dy2 - dy1 * dx2;
    const currentSign = Math.sign(cross);

    if (currentSign !== 0 && lastSign !== 0 && currentSign !== lastSign) {
      signChanges++;
      splitIndex = i;
      break; // Erster Wendepunkt gefunden
    }
    if (currentSign !== 0) lastSign = currentSign;
  }
  return { hasInflection: signChanges > 0, splitIndex };
}

// 2. Erzeuge Kurve beim Loslassen des Stifts (PointerUp) - unterstützt C- und S-Kurven
export function fitTo3PointCurve(rawPoints) {
  if (!rawPoints || rawPoints.length < 2) return null;
  const p0 = rawPoints[0];
  const p2 = rawPoints[rawPoints.length - 1];
  const chordLen = Math.hypot(p2.x - p0.x, p2.y - p0.y);
  if (chordLen < 5) return null;

  const dx = p2.x - p0.x;
  const dy = p2.y - p0.y;
  const defaultP1X = p0.x + dx * (1 / 3);
  const defaultP1Y = p0.y + dy * (1 / 3);
  const defaultP2X = p0.x + dx * (2 / 3);
  const defaultP2Y = p0.y + dy * (2 / 3);

  // Wendepunkt prüfen (S-Kurve)
  const infl = detectInflection(rawPoints);
  if (infl.hasInflection && infl.splitIndex > 2 && infl.splitIndex < rawPoints.length - 3) {
    // S-Kurve: Pfad in 2 Teilbögen splitten
    const pts1 = rawPoints.slice(0, infl.splitIndex + 1);
    const pts2 = rawPoints.slice(infl.splitIndex);
    const s1 = getPeakPoint(pts1, p0, rawPoints[infl.splitIndex]);
    const s2 = getPeakPoint(pts2, rawPoints[infl.splitIndex], p2);

    // Virtuelle kubische Kontrollpunkte aus den beiden Peaks
    const q1 = {
      x: 2 * s1.x - 0.5 * (p0.x + rawPoints[infl.splitIndex].x),
      y: 2 * s1.y - 0.5 * (p0.y + rawPoints[infl.splitIndex].y)
    };
    const q2 = {
      x: 2 * s2.x - 0.5 * (rawPoints[infl.splitIndex].x + p2.x),
      y: 2 * s2.y - 0.5 * (rawPoints[infl.splitIndex].y + p2.y)
    };

    const cp1 = {
      x: p0.x + 0.6 * (q1.x - p0.x) + 0.4 * (rawPoints[infl.splitIndex].x - p0.x),
      y: p0.y + 0.6 * (q1.y - p0.y) + 0.4 * (rawPoints[infl.splitIndex].y - p0.y)
    };
    const cp2 = {
      x: p2.x + 0.6 * (q2.x - p2.x) + 0.4 * (rawPoints[infl.splitIndex].x - p2.x),
      y: p2.y + 0.6 * (q2.y - p2.y) + 0.4 * (rawPoints[infl.splitIndex].y - p2.y)
    };

    return {
      p0, s: rawPoints[infl.splitIndex], p2,
      cp1, cp2,
      cp1_dx: cp1.x - defaultP1X,
      cp1_dy: cp1.y - defaultP1Y,
      cp2_dx: cp2.x - defaultP2X,
      cp2_dy: cp2.y - defaultP2Y
    };
  }

  // C-Kurve (Ein einzelner Bogen mit Scheitelpunkt S)
  const s = getPeakPoint(rawPoints, p0, p2);

  // Virtueller quadratischer Bézier-Kontrollpunkt für den Renderer
  const p1 = {
    x: 2 * s.x - 0.5 * (p0.x + p2.x),
    y: 2 * s.y - 0.5 * (p0.y + p2.y)
  };

  // Exakte Umrechnung von quadratischer Bézier (p0, p1, p2) in kubische Bézier (p0, cp1, cp2, p2)
  const cp1 = {
    x: p0.x + (2 / 3) * (p1.x - p0.x),
    y: p0.y + (2 / 3) * (p1.y - p0.y)
  };
  const cp2 = {
    x: p2.x + (2 / 3) * (p1.x - p2.x),
    y: p2.y + (2 / 3) * (p1.y - p2.y)
  };

  return {
    p0,
    s,
    p2,
    p1,
    cp1,
    cp2,
    cp1_dx: cp1.x - defaultP1X,
    cp1_dy: cp1.y - defaultP1Y,
    cp2_dx: cp2.x - defaultP2X,
    cp2_dy: cp2.y - defaultP2Y
  };
}

// Perfekt geglätteter Laufweg: RDP Entrauschen -> Äquidistantes Resampling -> Chaikin Rundung -> Stützpunkte
export function fitCatmullRomPoints(rawPoints, epsilon = 6.0, spacing = 22) {
  if (!rawPoints || rawPoints.length < 2) return rawPoints ? [...rawPoints] : [];

  // Schritt 1: RDP filtert Maus-/Finger-Zittern und irrelevante Ausreißer
  const simplified = simplifyPathRDP(rawPoints, epsilon);
  if (simplified.length < 3) return simplified;

  // Schritt 2: Resampling sorgt für harmonische Kurvenstützpunkte ohne Dichte-Unwuchten
  const resampled = resamplePath(simplified, spacing);
  if (resampled.length < 3) return simplified;

  // Schritt 3: Chaikin schneidet harte Kanten ab und erzeugt seidenweiche Rundungen
  const smoothed = chaikinSmooth(resampled, 2);
  return smoothed;
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

  if (maxDeviation < 8 || maxDeviation / chordLen < 0.05) {
    return { cp1_dx: 0, cp1_dy: 0, cp2_dx: 0, cp2_dy: 0 };
  }

  let c11 = 0, c12 = 0, c22 = 0;
  let rx1 = 0, ry1 = 0, rx2 = 0, ry2 = 0;

  for (let i = 0; i < points.length; i++) {
    const t = Math.max(0.001, Math.min(0.999, cumDists[i] / totalStrokeLen));
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
  if (Math.abs(det) < 1e-6) {
    return { cp1_dx: 0, cp1_dy: 0, cp2_dx: 0, cp2_dy: 0 };
  }

  const fitP1X = (c22 * rx1 - c12 * rx2) / det;
  const fitP1Y = (c22 * ry1 - c12 * ry2) / det;
  const fitP2X = (c11 * rx2 - c12 * rx1) / det;
  const fitP2Y = (c11 * ry2 - c12 * ry1) / det;

  const defaultP1X = p0.x + chordDx * (1 / 3);
  const defaultP1Y = p0.y + chordDy * (1 / 3);
  const defaultP2X = p0.x + chordDx * (2 / 3);
  const defaultP2Y = p0.y + chordDy * (2 / 3);

  return {
    cp1_dx: Math.round(fitP1X - defaultP1X),
    cp1_dy: Math.round(fitP1Y - defaultP1Y),
    cp2_dx: Math.round(fitP2X - defaultP2X),
    cp2_dy: Math.round(fitP2Y - defaultP2Y)
  };
}
