// canvas/playback.js - Animation, Interpolation (Bézier & Jump) und Playback-Loop
import { state, getCurrentExercise } from "../state/store.js";
import { getEffectiveCurveControlPoints, getCubicBezierPoint } from "../core/geometry.js";

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
          if (el2.jump) {
            const jumpFactor = Math.sin(smoothT * Math.PI);
            scaleMult = 1.0 + jumpFactor * 0.45;
          }

          interpolatedElements.push({
            ...el1,
            x: posX,
            y: posY,
            scaleMultiplier: scaleMult
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

  stop() {
    state.isPlaying = false;
    if (state.animReqId) {
      cancelAnimationFrame(state.animReqId);
      state.animReqId = null;
    }
    this.updateUI(false);
    this.drawCallback();
  }

  updateUI(playing) {
    const playIcon = document.getElementById("playIcon");
    const playText = document.getElementById("playText");
    const playingBadge = document.getElementById("playingBadge");

    if (playIcon) {
      if (typeof playIcon.className === "string") {
        playIcon.className = playing ? "fa-solid fa-pause text-[10px]" : "fa-solid fa-play text-[10px]";
      } else {
        playIcon.setAttribute("class", playing ? "fa-solid fa-pause text-[10px]" : "fa-solid fa-play text-[10px]");
      }
    }
    if (playText) playText.innerText = playing ? "Pause" : "Play";
    if (playingBadge) {
      if (playing) playingBadge.classList.remove("hidden");
      else playingBadge.classList.add("hidden");
    }
  }
}
