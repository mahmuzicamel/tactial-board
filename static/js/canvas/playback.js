// canvas/playback.js - Animation, Interpolation (Bézier & Jump) und Playback-Loop
import { state, getCurrentExercise } from "../state/store.js";
import { getEffectiveCurveControlPoints, getCubicBezierPoint, interpolateKeyframeElements } from "../core/geometry.js";
import { closeAllContextMenus } from "../ui/popovers.js";

export class PlaybackController {
  constructor(drawCallback, onStepChange = null) {
    this.drawCallback = drawCallback;
    this.onStepChange = onStepChange;
  }

  toggle() {
    if (state.isPlaying) {
      this.stop();
    } else {
      this.start();
    }
  }

  start() {
    const ex = getCurrentExercise();
    if (!ex || !Array.isArray(ex.keyframes) || ex.keyframes.length < 2) {
      if (typeof window.showToast === "function") {
        window.showToast("Füge mindestens 2 Schritte hinzu, um eine Animation abzuspielen.", true);
      } else {
        alert("Füge mindestens 2 Schritte hinzu, um eine Animation abzuspielen.");
      }
      return;
    }

    // Beim Play-Start sofort alle offenen Kontext- und Einstellungsmenüs ausblenden
    closeAllContextMenus();

    this.stop();

    state.isPlaying = true;
    this.updateUI(true);
    state.animStartTime = performance.now();
    let lastRenderedStep = -1;

    const loop = (now) => {
      if (!state.isPlaying) return;

      const currentEx = getCurrentExercise();
      const totalSteps = currentEx && Array.isArray(currentEx.keyframes) ? currentEx.keyframes.length : 0;
      if (totalSteps < 2) {
        this.stop();
        return;
      }

      const speed = (typeof state.currentSpeed === "number" && state.currentSpeed > 0) ? state.currentSpeed : 1.0;
      const stepDuration = 2000 / speed;
      const rawElapsed = now - state.animStartTime;

      if (!state.isLoopMode) {
        const fullDuration = (totalSteps - 1) * stepDuration;
        if (rawElapsed >= fullDuration) {
          if (this.onStepChange) this.onStepChange(totalSteps - 1);
          this.stop();
          return;
        }
      }

      const totalDuration = totalSteps * stepDuration;
      const elapsed = state.isLoopMode ? (rawElapsed % totalDuration) : rawElapsed;
      const stepIdx = Math.min(totalSteps - 1, Math.floor(elapsed / stepDuration));
      const nextStepIdx = state.isLoopMode ? ((stepIdx + 1) % totalSteps) : Math.min(totalSteps - 1, stepIdx + 1);
      const stepProgress = (elapsed % stepDuration) / stepDuration;

      if (stepIdx !== lastRenderedStep) {
        lastRenderedStep = stepIdx;
        if (this.onStepChange) {
          this.onStepChange(stepIdx);
        }
      }

      // Interpolation (Ease-in-out)
      const smoothT = 0.5 - 0.5 * Math.cos(Math.PI * stepProgress);

      const kf1 = currentEx.keyframes[stepIdx] || { elements: [], arrows: [] };
      const kf2 = currentEx.keyframes[nextStepIdx] || { elements: [], arrows: [] };

      const map1 = new Map((kf1.elements || []).map(e => [e.id, e]));
      const map2 = new Map((kf2.elements || []).map(e => [e.id, e]));

      const interpolatedElements = [];
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

          interpolatedElements.push({
            ...el1,
            x: posX,
            y: posY,
            scaleMultiplier: scaleMult,
            jumpProgress: jumpOffset
          });
        } else if (el1) {
          interpolatedElements.push(el1);
        } else if (el2 && smoothT > 0.5) {
          interpolatedElements.push(el2);
        }
      }

      this.drawCallback(interpolatedElements, kf1.arrows);

      if (state.isPlaying) {
        state.animReqId = requestAnimationFrame(loop);
      }
    };

    state.animReqId = requestAnimationFrame(loop);
  }

  // Stoppt Playback und räumt Status auf
  stop() {
    state.isPlaying = false;
    if (state.animReqId) {
      cancelAnimationFrame(state.animReqId);
      state.animReqId = null;
    }
    this.updateUI(false);
    this.drawCallback();
  }

  // Spielt einen einzelnen Schritt-Übergang animiert ab (von fromIdx nach toIdx)
  animateStepTransition(fromIdx, toIdx, onComplete = null) {
    const currentEx = getCurrentExercise();
    if (!currentEx || !Array.isArray(currentEx.keyframes)) return;
    const totalSteps = currentEx.keyframes.length;
    if (fromIdx < 0 || toIdx < 0 || fromIdx >= totalSteps || toIdx >= totalSteps || fromIdx === toIdx) {
      if (onComplete) onComplete();
      return;
    }

    // Laufende Voll-Animationen stoppen
    if (state.isPlaying) {
      this.stop();
    }
    if (state.animReqId) {
      cancelAnimationFrame(state.animReqId);
      state.animReqId = null;
    }

    closeAllContextMenus();

    const speed = (typeof state.currentSpeed === "number" && state.currentSpeed > 0) ? state.currentSpeed : 1.0;
    const transitionDuration = 1200 / speed; // Angenehme, flüssige Animationsdauer
    const startTime = performance.now();

    const kf1 = currentEx.keyframes[fromIdx] || { elements: [], arrows: [] };
    const kf2 = currentEx.keyframes[toIdx] || { elements: [], arrows: [] };

    const transitionLoop = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(1.0, elapsed / transitionDuration);
      const smoothT = 0.5 - 0.5 * Math.cos(Math.PI * progress);

      const interpolatedElements = interpolateKeyframeElements(kf1, kf2, smoothT, { includeRotation: true });

      // Zeige zugehörige Pfeile des Quellschritts (z. B. Passpfeile) während des Übergangs
      const displayArrows = progress < 0.85 ? (kf1.arrows || []) : (kf2.arrows || []);
      this.drawCallback(interpolatedElements, displayArrows);

      if (progress < 1.0) {
        state.animReqId = requestAnimationFrame(transitionLoop);
      } else {
        state.animReqId = null;
        this.drawCallback(); // Finales Zeichnen des Ziel-Schritts
        if (onComplete) onComplete();
      }
    };

    state.animReqId = requestAnimationFrame(transitionLoop);
  }

  // Nimmt eine vollständige 2D-Animation als Video via CCapture.js deterministisch auf (100% flüssig, 0 Framedrops)
  async recordAnimationVideo({ durationPerStep = 2000, fps = 30, onProgress = null, canvas = null }) {
    const currentEx = getCurrentExercise();
    if (!currentEx || !Array.isArray(currentEx.keyframes) || currentEx.keyframes.length < 2) {
      throw new Error("Mindestens 2 Schritte erforderlich für Video.");
    }

    const targetCanvas = canvas || document.getElementById("tacticCanvas") || document.getElementById("tacticsCanvas");
    if (!targetCanvas) {
      throw new Error("2D Taktik-Canvas nicht gefunden.");
    }

    const totalSteps = currentEx.keyframes.length;
    const totalDuration = (totalSteps - 1) * durationPerStep;
    const totalFrames = Math.max(2, Math.round((totalDuration / 1000) * fps));

    if (typeof window.CCapture === "undefined") {
      throw new Error("CCapture.js ist nicht geladen.");
    }

    const capturer = new window.CCapture({
      format: "webm",
      framerate: fps,
      quality: 95,
      verbose: false
    });

    capturer.start();

    return new Promise((resolve, reject) => {
      let frame = 0;

      const captureStep = () => {
        if (frame > totalFrames) {
          if (onProgress) onProgress(1.0);
          capturer.stop();
          capturer.save((blob) => {
            // Nach Aufnahme Standard-Ansicht wiederherstellen
            this.drawCallback();
            resolve({ blob: blob, mimeType: "video/webm" });
          });
          return;
        }

        const progress = frame / totalFrames;
        if (onProgress) onProgress(progress);

        const elapsed = (frame / fps) * 1000;
        const stepIdx = Math.min(totalSteps - 2, Math.floor(elapsed / durationPerStep));
        const stepProgress = Math.min(1.0, (elapsed % durationPerStep) / durationPerStep);
        const smoothT = 0.5 - 0.5 * Math.cos(Math.PI * stepProgress);

        const kf1 = currentEx.keyframes[stepIdx] || { elements: [], arrows: [] };
        const kf2 = currentEx.keyframes[stepIdx + 1] || { elements: [], arrows: [] };

        const interpolated = interpolateKeyframeElements(kf1, kf2, smoothT);

        // Frame synchron im Canvas zeichnen
        this.drawCallback(interpolated, kf1.arrows);

        // Frame in CCapture einspeisen
        capturer.capture(targetCanvas);
        frame++;

        setTimeout(captureStep, 5);
      };

      captureStep();
    });
  }

  updateUI(playing) {
    const playIcon = document.getElementById("playIcon");
    const playText = document.getElementById("playText");
    const desktopPlayBtn = document.getElementById("desktopPlayBtn");
    const playingBadge = document.getElementById("playingBadge");

    if (playIcon) {
      if (typeof playIcon.className === "string") {
        playIcon.className = playing ? "fa-solid fa-pause text-[10px]" : "fa-solid fa-play text-[10px]";
      } else {
        playIcon.setAttribute("class", playing ? "fa-solid fa-pause text-[10px]" : "fa-solid fa-play text-[10px]");
      }
    }
    if (playText) playText.innerText = playing ? "Pause" : "Play";

    if (desktopPlayBtn) {
      desktopPlayBtn.innerHTML = playing
        ? `<i class="fa-solid fa-pause text-[11px]"></i> <span>Pause</span>`
        : `<i class="fa-solid fa-play text-[11px]"></i> <span>Play</span>`;
    }

    if (playingBadge) {
      if (playing) playingBadge.classList.remove("hidden");
      else playingBadge.classList.add("hidden");
    }
  }
}
