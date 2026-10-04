// canvas/arrows.js - Zeichnen von Pässen, Laufwegen, Hilfslinien, Bézier- und Freihandkurven
import { getCubicBezierPoint } from "../core/geometry.js";

export function drawArrow(ctx, x1, y1, x2, y2, type = "pass", color = "#facc15", isSelected = false, animTime = null, cp1 = null, cp2 = null, rawPoints = null) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.hypot(dx, dy);
  if (dist < 5 && !(rawPoints && rawPoints.length >= 2)) return;

  const isRaw = (rawPoints && rawPoints.length >= 2);
  const isCurved = (!isRaw && cp1 && cp2 && (Math.hypot(cp1.x - (x1 + dx * (1 / 3)), cp1.y - (y1 + dy * (1 / 3))) > 1 || Math.hypot(cp2.x - (x1 + dx * (2 / 3)), cp2.y - (y1 + dy * (2 / 3))) > 1));

  ctx.save();

  // If selected, highlight glow background
  if (isSelected) {
    ctx.strokeStyle = "rgba(56, 189, 248, 0.4)";
    ctx.lineWidth = 14;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    if (isRaw) {
      ctx.moveTo(rawPoints[0].x, rawPoints[0].y);
      for (let p = 1; p < rawPoints.length; p++) ctx.lineTo(rawPoints[p].x, rawPoints[p].y);
    } else {
      ctx.moveTo(x1, y1);
      if (isCurved) {
        ctx.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, x2, y2);
      } else {
        ctx.lineTo(x2, y2);
      }
    }
    ctx.stroke();
  }

  // Calculate tangent angle at tip (t = 1) for the arrowhead
  let tipAngle = Math.atan2(dy, dx);
  if (isRaw) {
    const pLast = rawPoints[rawPoints.length - 1];
    const pPrev = rawPoints[Math.max(0, rawPoints.length - 4)];
    const pdx = pLast.x - pPrev.x;
    const pdy = pLast.y - pPrev.y;
    if (Math.hypot(pdx, pdy) > 0.001) {
      tipAngle = Math.atan2(pdy, pdx);
    }
  } else if (isCurved) {
    // Tangent vector of cubic bezier at t = 1 is 3 * (p3 - p2)
    const tdx = x2 - cp2.x;
    const tdy = y2 - cp2.y;
    if (Math.hypot(tdx, tdy) > 0.001) {
      tipAngle = Math.atan2(tdy, tdx);
    }
  }

  // Type: "guide" -> Blinking / Pulsing dashed Hilfslinie
  if (type === "guide") {
    const t = (animTime !== null) ? animTime : (performance.now() / 1000);
    // Pulsing opacity between 0.35 and 1.0 (blinking rhythm ~2Hz)
    const pulseAlpha = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * Math.PI * 3.5));
    // Moving animated dash march
    const dashOffset = -(t * 35) % 24;

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // Soft outer neon glow aura
    ctx.strokeStyle = `rgba(245, 158, 11, ${pulseAlpha * 0.45})`;
    ctx.lineWidth = 8;
    ctx.setLineDash([12, 8]);
    ctx.lineDashOffset = dashOffset;
    ctx.beginPath();
    if (isRaw) {
      ctx.moveTo(rawPoints[0].x, rawPoints[0].y);
      for (let p = 1; p < rawPoints.length; p++) ctx.lineTo(rawPoints[p].x, rawPoints[p].y);
    } else {
      ctx.moveTo(x1, y1);
      if (isCurved) {
        ctx.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, x2, y2);
      } else {
        ctx.lineTo(x2, y2);
      }
    }
    ctx.stroke();

    // Sharp bright core line (Amber/Gold or custom color)
    ctx.strokeStyle = color || "#fbbf24";
    ctx.fillStyle = color || "#fbbf24";
    ctx.globalAlpha = pulseAlpha;
    ctx.lineWidth = 3.5;
    ctx.setLineDash([12, 8]);
    ctx.lineDashOffset = dashOffset;
    ctx.beginPath();
    if (isRaw) {
      ctx.moveTo(rawPoints[0].x, rawPoints[0].y);
      for (let p = 1; p < rawPoints.length; p++) ctx.lineTo(rawPoints[p].x, rawPoints[p].y);
    } else {
      ctx.moveTo(x1, y1);
      if (isCurved) {
        ctx.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, x2, y2);
      } else {
        ctx.lineTo(x2, y2);
      }
    }
    ctx.stroke();

    // Symmetrical diamond / indicator at both endpoints
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(x1, y1, 5, 0, Math.PI * 2);
    ctx.arc(x2, y2, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  } else {
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 4;

    if (type === "pass") {
      ctx.setLineDash([10, 8]);
      ctx.beginPath();
      if (isRaw) {
        ctx.moveTo(rawPoints[0].x, rawPoints[0].y);
        for (let p = 1; p < rawPoints.length; p++) ctx.lineTo(rawPoints[p].x, rawPoints[p].y);
      } else {
        ctx.moveTo(x1, y1);
        if (isCurved) {
          ctx.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, x2, y2);
        } else {
          ctx.lineTo(x2, y2);
        }
      }
      ctx.stroke();
    } else {
      // Run / dribble solid line
      ctx.beginPath();
      if (isRaw) {
        ctx.moveTo(rawPoints[0].x, rawPoints[0].y);
        for (let p = 1; p < rawPoints.length; p++) ctx.lineTo(rawPoints[p].x, rawPoints[p].y);
      } else {
        ctx.moveTo(x1, y1);
        if (isCurved) {
          ctx.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, x2, y2);
        } else {
          ctx.lineTo(x2, y2);
        }
      }
      ctx.stroke();
    }

    // Arrow tip oriented along tipAngle
    ctx.setLineDash([]);
    const arrowSize = 14;
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - arrowSize * Math.cos(tipAngle - Math.PI / 6), y2 - arrowSize * Math.sin(tipAngle - Math.PI / 6));
    ctx.lineTo(x2 - arrowSize * Math.cos(tipAngle + Math.PI / 6), y2 - arrowSize * Math.sin(tipAngle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
  }

  // Draw interactive handle rings when selected
  if (isSelected) {
    // Start handle
    ctx.fillStyle = "#38bdf8";
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x1, y1, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // End handle (tip)
    ctx.beginPath();
    ctx.arc(x2, y2, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Interactive Curve Control Handles (mid, p1, p2)
    if (cp1 && cp2) {
      const p0 = { x: x1, y: y1 };
      const p3 = { x: x2, y: y2 };
      const pMid = getCubicBezierPoint(0.5, p0, cp1, cp2, p3);

      // Dotted tangent arms
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = "rgba(56, 189, 248, 0.4)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(cp1.x, cp1.y);
      ctx.moveTo(x2, y2);
      ctx.lineTo(cp2.x, cp2.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // P1 handle (cyan)
      ctx.fillStyle = "#06b6d4";
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cp1.x, cp1.y, 6.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // P2 handle (cyan)
      ctx.beginPath();
      ctx.arc(cp2.x, cp2.y, 6.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Midpoint handle (Amber/Yellow curve crown handle)
      ctx.fillStyle = "#f59e0b";
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(pMid.x, pMid.y, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  ctx.restore();
}
