// core/pitch.js - Spielfeld-Rendering (Gras-Streifen, Markierungen, Feldtypen)
import { VIRTUAL_WIDTH, VIRTUAL_HEIGHT } from "./constants.js";

export function drawPitchBackground(ctx, pitchType) {
  const w = VIRTUAL_WIDTH;
  const h = VIRTUAL_HEIGHT;

  // Dynamic stripes covering virtual field + margins
  const stripes = 12;
  const sw = (w + 400) / stripes;
  for (let i = 0; i < stripes; i++) {
    ctx.fillStyle = (i % 2 === 0) ? "#2d6a4f" : "#285d45";
    ctx.fillRect(-200 + i * sw, -200, sw, h + 400);
  }

  // If "plain" / grass only without lines:
  if (pitchType === "plain") {
    return;
  }

  // Pitch boundary lines (margin around the pitch for goals, benches, runout)
  const mx = 65; // vorher 30 (mehr Auslauf an den Toren links/rechts bzw. oben/unten)
  const my = 40; // vorher 25
  const pw = w - 2 * mx;
  const ph = h - 2 * my;

  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 4;
  ctx.strokeRect(mx, my, pw, ph);

  if (pitchType === "full") {
    const midX = mx + pw / 2;
    ctx.beginPath();
    ctx.moveTo(midX, my);
    ctx.lineTo(midX, my + ph);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(midX, my + ph / 2, 75, 0, Math.PI * 2);
    ctx.stroke();

    // Penalty areas
    ctx.strokeRect(mx, my + (ph - 280) / 2, 140, 280);
    ctx.strokeRect(mx + pw - 140, my + (ph - 280) / 2, 140, 280);
  } else if (pitchType === "half") {
    // Goal & penalty area on left
    ctx.strokeRect(mx, my + (ph - 360) / 2, 220, 360);
    ctx.strokeRect(mx, my + (ph - 180) / 2, 80, 180);
    // Center circle arc
    ctx.beginPath();
    ctx.arc(mx + pw, my + ph / 2, 120, Math.PI * 0.5, Math.PI * 1.5);
    ctx.stroke();
  } else if (pitchType === "funino") {
    // Center line
    const midX = mx + pw / 2;
    ctx.beginPath();
    ctx.moveTo(midX, my);
    ctx.lineTo(midX, my + ph);
    ctx.stroke();

    // 6m shooting lines (dashed)
    ctx.setLineDash([8, 8]);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
    ctx.beginPath();
    ctx.moveTo(mx + 120, my);
    ctx.lineTo(mx + 120, my + ph);
    ctx.moveTo(mx + pw - 120, my);
    ctx.lineTo(mx + pw - 120, my + ph);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = "#ffffff";

    // 4 Minigoals
    ctx.fillStyle = "rgba(231, 76, 60, 0.6)";
    ctx.fillRect(mx - 15, my + 60, 15, 50);
    ctx.fillRect(mx - 15, my + ph - 110, 15, 50);
    ctx.fillStyle = "rgba(52, 152, 219, 0.6)";
    ctx.fillRect(mx + pw, my + 60, 15, 50);
    ctx.fillRect(mx + pw, my + ph - 110, 15, 50);
  } else if (pitchType === "rondo") {
    ctx.strokeStyle = "#facc15";
    ctx.lineWidth = 3;
    const rmx = mx + 100;
    const rmy = my + 50;
    const rw = pw - 200;
    const rh = ph - 100;
    ctx.strokeRect(rmx, rmy, rw, rh);
    ctx.beginPath();
    ctx.moveTo(rmx + rw / 2, rmy);
    ctx.lineTo(rmx + rw / 2, rmy + rh);
    ctx.moveTo(rmx, rmy + rh / 2);
    ctx.lineTo(rmx + rw, rmy + rh / 2);
    ctx.stroke();
  }
}
