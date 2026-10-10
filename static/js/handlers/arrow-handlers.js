// arrow-handlers.js
// ES-Modul (importiert von app-module.js). Funktionskoerper byte-identisch aus app.js.
// app-module.js haengt die Exports an window.* fuer die onclick=""-Bindings.
const TC = () => window.TacticalCoach;
const S = () => window.TacticalCoach?.state;

export function resetSelectedArrowCurve() {
  const s = S();
  const kf = TC().getCurrentKeyframe();
  if (!kf || s.selectedArrowIndex === null || !kf.arrows[s.selectedArrowIndex]) return;
  const arr = kf.arrows[s.selectedArrowIndex];
  delete arr.cp1_dx; delete arr.cp1_dy; delete arr.cp2_dx; delete arr.cp2_dy;
  window.drawScene();
  window.updateArrowPersistentButtonState(arr);
  window.recordHistory();
  window.showToast("Pfeilkurve begradigt");
};

export function copyArrowToNextKeyframe() {
  const s = S();
  const ex = s.currentExercise;
  const kf = TC().getCurrentKeyframe();
  if (!kf || s.selectedArrowIndex === null || !kf.arrows || !kf.arrows[s.selectedArrowIndex]) return;
  if (!ex || !Array.isArray(ex.keyframes)) return;

  const sourceArrow = kf.arrows[s.selectedArrowIndex];
  const currentIndex = s.currentKeyframeIndex;

  // Wenn es noch keinen nächsten Schritt gibt, neuen Schritt erzeugen
  if (currentIndex >= ex.keyframes.length - 1) {
    if (typeof window.duplicateKeyframe === "function") {
      window.duplicateKeyframe();
    } else {
      window.showToast("Kein nächster Schritt vorhanden");
      return;
    }
  }

  const nextIndex = currentIndex + 1;
  const nextKf = ex.keyframes[nextIndex];
  if (!nextKf) return;
  if (!nextKf.arrows) nextKf.arrows = [];

  // Erstelle eine saubere Kopie der Linie mit neuer ID
  const copiedArrow = JSON.parse(JSON.stringify(sourceArrow));
  copiedArrow.id = "arrow_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
  nextKf.arrows.push(copiedArrow);

  // Optional: Direkt in den nächsten Schritt wechseln und die kopierte Linie markieren
  TC().selectKeyframe(nextIndex);
  s.selectedArrowIndex = nextKf.arrows.length - 1;
  s.selectedArrowPart = null;
  s.selectedElementId = null;
  s.selectedElementIds = [];

  window.drawScene();
  window.updateActionPopupPosition();
  window.recordHistory();
  window.showToast(`Linie in Schritt ${nextIndex + 1} übernommen`);
};

export function toggleArrowPersistent() {
  const s = S();
  const kf = TC().getCurrentKeyframe();
  if (!kf || s.selectedArrowIndex === null || !kf.arrows[s.selectedArrowIndex]) return;
  const arr = kf.arrows[s.selectedArrowIndex];
  arr.persistent = !arr.persistent;
  window.updateArrowPersistentButtonState(arr);
  window.drawScene();
  window.recordHistory();
};

export function updateArrowPersistentButtonState(arr) {
  const btn = document.getElementById("actionPopupPersistentBtn");
  const lbl = document.getElementById("actionPopupPersistentLabel");
  const rBtn = document.getElementById("actionPopupArrowResetCurveBtn");
  if (rBtn) {
    const hasCurve = (arr.cp1_dx !== undefined && arr.cp1_dx !== 0) || (arr.cp1_dy !== undefined && arr.cp1_dy !== 0) ||
                     (arr.cp2_dx !== undefined && arr.cp2_dx !== 0) || (arr.cp2_dy !== undefined && arr.cp2_dy !== 0);
    rBtn.classList.toggle("hidden", !hasCurve);
  }
  if (!btn || !lbl || !arr) return;
  if (arr.persistent) {
    btn.className = "h-8 px-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1 text-[11px] font-bold shadow-md shadow-emerald-500/30";
    lbl.innerText = "Alle Schritte ✓";
  } else {
    btn.className = "h-8 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-400 flex items-center gap-1 text-[11px] font-bold border border-slate-700";
    lbl.innerText = "Dauerhaft machen";
  }
};
