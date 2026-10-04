// canvas/elements.js - Zeichnen von Spielern, Trainingsgeräten, Bällen & Spotlight
import { COLORS } from "../core/constants.js";

export function drawElementOnCanvas(ctx, el, isSelected = false, fieldRotation = 0, globalElementScale = 1.0) {
  const x = el.x;
  const y = el.y;

  ctx.save();
  ctx.translate(x, y);

  // Counter-rotate element around its own center so numbers, text, goals & cones stay upright and legible
  if (fieldRotation !== 0) {
    ctx.rotate((-fieldRotation * Math.PI) / 180);
  }

  // Apply element's own local rotation (in degrees)
  if (el.rotation) {
    ctx.rotate((el.rotation * Math.PI) / 180);
  }

  // Apply global element scale slider (resizes all players, cones, goals, balls) & optional Jump scale
  const jumpScale = (el.scaleMultiplier !== undefined) ? el.scaleMultiplier : 1.0;
  const elScale = (globalElementScale || 1.0) * jumpScale;
  ctx.scale(elScale, elScale);

  if (isSelected) {
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 26, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Spotlight / Focus Highlighting (optischer Scheinwerfer & pulsierender Ring)
  if (el.focus) {
    // 1. Großflächiger weicher Schein (Spotlight Aura)
    const grad = ctx.createRadialGradient(0, 0, 10, 0, 0, 48);
    grad.addColorStop(0, "rgba(250, 204, 21, 0.45)"); // Warmer Gold-Schein
    grad.addColorStop(0.6, "rgba(250, 204, 21, 0.2)");
    grad.addColorStop(1, "rgba(250, 204, 21, 0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, 48, 0, Math.PI * 2);
    ctx.fill();

    // 2. Markanter goldener Fokus-Ring mit Akzent
    ctx.strokeStyle = "#facc15";
    ctx.lineWidth = 3.5;
    ctx.setLineDash([6, 3]);
    ctx.beginPath();
    ctx.arc(0, 0, 28, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // 3. Kleiner leuchtender Fokus-Stern/Badge oben rechts
    ctx.fillStyle = "#facc15";
    ctx.beginPath();
    ctx.arc(18, -18, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  if (el.type === "player") {
    const radius = 18;
    let fill = COLORS.TEAM_BLUE;
    let textCol = "#ffffff";
    if (el.team === "red") fill = COLORS.TEAM_RED;
    if (el.team === "yellow") { fill = COLORS.TEAM_YELLOW; textCol = "#000000"; }
    if (el.team === "green") fill = "#16a34a";

    // Shadow
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.arc(2, 3, radius, 0, Math.PI * 2);
    ctx.fill();

    // Body
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Number (always readable upright!)
    ctx.fillStyle = textCol;
    ctx.font = "bold 13px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(el.number || "1", 0, 0);

    // Name label (upright below player)
    if (el.name) {
      ctx.fillStyle = "rgba(0,0,0,0.75)";
      const nw = ctx.measureText(el.name).width + 8;
      ctx.fillRect(-nw / 2, radius + 3, nw, 14);
      ctx.fillStyle = "#ffffff";
      ctx.font = "10px sans-serif";
      ctx.fillText(el.name, 0, radius + 10);
    }

  } else if (el.type === "ball") {
    const radius = 10;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = "#111827";
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, Math.PI * 2);
    ctx.fill();

  } else if (el.type === "cone") {
    ctx.fillStyle = "#f97316";
    ctx.beginPath();
    ctx.moveTo(0, -14);
    ctx.lineTo(14, 14);
    ctx.lineTo(-14, 14);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.stroke();

  } else if (el.type === "pole") {
    ctx.fillStyle = "#eab308";
    ctx.fillRect(-3, -24, 6, 32);
    ctx.fillStyle = "#000000";
    ctx.beginPath();
    ctx.arc(0, 8, 6, 0, Math.PI * 2);
    ctx.fill();

  } else if (el.type === "minigoal") {
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3;
    ctx.strokeRect(-18, -11, 36, 22);
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.fillRect(-18, -11, 36, 22);

  } else if (el.type === "goal_5m") {
    // 5m x 2m Jugendtor (E-Jugend / Kleinfeldtor)
    const gw = 70;
    const gh = 30;
    // Goal net background
    ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
    ctx.fillRect(-gw / 2, -gh / 2, gw, gh);
    // Net pattern (cross hatch)
    ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
    ctx.lineWidth = 1;
    for (let gx = -gw / 2 + 10; gx < gw / 2; gx += 10) {
      ctx.beginPath();
      ctx.moveTo(gx, -gh / 2);
      ctx.lineTo(gx, gh / 2);
      ctx.stroke();
    }
    for (let gy = -gh / 2 + 10; gy < gh / 2; gy += 10) {
      ctx.beginPath();
      ctx.moveTo(-gw / 2, gy);
      ctx.lineTo(gw / 2, gy);
      ctx.stroke();
    }
    // Goal frame (post and crossbar)
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 4;
    ctx.strokeRect(-gw / 2, -gh / 2, gw, gh);
    // Post markings
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(-gw / 2 - 3, -gh / 2 - 3, 6, 6);
    ctx.fillRect(gw / 2 - 3, -gh / 2 - 3, 6, 6);
    // Label "5m Tor" inside net
    ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
    ctx.font = "bold 10px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("5m Tor", 0, 0);

  } else if (el.type === "ladder") {
    ctx.strokeStyle = "#facc15";
    ctx.lineWidth = 2;
    ctx.strokeRect(-40, -10, 80, 20);
    for (let i = 1; i < 5; i++) {
      ctx.beginPath();
      ctx.moveTo(-40 + i * 16, -10);
      ctx.lineTo(-40 + i * 16, 10);
      ctx.stroke();
    }

  } else if (el.type === "dummy") {
    // Freistoß-Dummy / Trainingsfigur (Silhouette mit breiter Brust & Standfuß)
    // Standfuß
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.beginPath();
    ctx.ellipse(0, 16, 14, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Körper / Torso (Gelb/Schwarz)
    ctx.fillStyle = "#eab308";
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 2;

    // Schultern/Torso Schild
    ctx.beginPath();
    ctx.roundRect(-12, -10, 24, 24, [4, 4, 8, 8]);
    ctx.fill();
    ctx.stroke();

    // Dummy Kopf
    ctx.beginPath();
    ctx.arc(0, -16, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Brust-Rippen / Muster
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-8, -4);
    ctx.lineTo(8, -4);
    ctx.moveTo(-8, 2);
    ctx.lineTo(8, 2);
    ctx.moveTo(-6, 8);
    ctx.lineTo(6, 8);
    ctx.stroke();

  } else if (el.type === "ring") {
    // Koordinationsring / Agility Ring (Durchmesser ca. 36px)
    ctx.strokeStyle = "#06b6d4"; // Cyan / leuchtend
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, 16, 0, Math.PI * 2);
    ctx.stroke();

    // Innen transparenter leichter Schein
    ctx.fillStyle = "rgba(6, 182, 212, 0.15)";
    ctx.fill();

  } else if (el.type === "hurdle") {
    // Agility-Hürde / Mini-Hürde
    // Schatten
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.fillRect(-22, 1, 44, 4);

    // Füße / Standkufen
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(-22, -6, 5, 12);
    ctx.fillRect(17, -6, 5, 12);

    // Hürden-Querbalken (Signal-Orange / Neon-Gelb gestreift)
    ctx.fillStyle = "#f97316";
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1;
    ctx.fillRect(-20, -3, 40, 6);
    ctx.strokeRect(-20, -3, 40, 6);

    // Reflektor-Streifen
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(-8, -3, 4, 6);
    ctx.fillRect(4, -3, 4, 6);
  }

  ctx.restore();
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
