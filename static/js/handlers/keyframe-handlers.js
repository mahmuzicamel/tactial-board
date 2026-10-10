// keyframe-handlers.js
// ES-Modul (importiert von app-module.js). Funktionskoerper byte-identisch aus app.js.
// app-module.js haengt die Exports an window.* fuer die onclick=""-Bindings.
const TC = () => window.TacticalCoach;
const S = () => window.TacticalCoach?.state;

function prepareNextKeyframeWithAutoPass(sourceKf, newKf) {
  if (!sourceKf || !newKf || !Array.isArray(sourceKf.arrows)) return;
  
  const passArrows = sourceKf.arrows.filter(a => a.type === "pass");
  if (passArrows.length === 0) return;
  
  const balls = (newKf.elements || []).filter(e => e.type === "ball");
  if (balls.length === 0) return;

  // Ordne jeden Pass-Pfeil dem Ball zu, an dem er tatsächlich gestartet ist (Startpunkt x1, y1 nahe Ball)
  const assignedBalls = new Set();
  passArrows.forEach(pass => {
    // Finde den Ball im Quell-Schritt, der dem Startpunkt des Passes am nächsten liegt
    let closestBall = null;
    let minDistance = 50; // Max Fang-Radius: Pass muss beim Ball starten

    balls.forEach(b => {
      if (assignedBalls.has(b.id)) return;
      const srcB = (sourceKf.elements || []).find(e => e.id === b.id);
      const refX = srcB ? srcB.x : b.x;
      const refY = srcB ? srcB.y : b.y;
      const d = Math.hypot(pass.x1 - refX, pass.y1 - refY);
      if (d < minDistance) {
        minDistance = d;
        closestBall = b;
      }
    });

    // Wenn ein zugehöriger Ball gefunden wurde, wandert GENAU dieser Ball an das Ziel seines Passes
    if (closestBall) {
      closestBall.x = Math.round(pass.x2);
      closestBall.y = Math.round(pass.y2);
      delete closestBall.cp1_dx;
      delete closestBall.cp1_dy;
      delete closestBall.cp2_dx;
      delete closestBall.cp2_dy;
      assignedBalls.add(closestBall.id);
    }
  });
}

export function renderKeyframeTabs() {
  TC().timeline.renderKeyframeTabs(window.selectKeyframe, window.editKeyframeTitle, window.moveKeyframeToIndex);
};

export function insertKeyframeAfterCurrent() {
  const s = S();
  const ex = s.currentExercise;
  const curKf = TC().getCurrentKeyframe();
  const newKf = JSON.parse(JSON.stringify(curKf));
  newKf.title = `Schritt ${s.currentKeyframeIndex + 2}`;
  prepareNextKeyframeWithAutoPass(curKf, newKf);
  ex.keyframes.splice(s.currentKeyframeIndex + 1, 0, newKf);
  s.currentKeyframeIndex++;
  window.renderKeyframeTabs();
  window.drawScene();
  window.recordHistory();
  window.saveLocalDraft();
};

export function duplicateKeyframe() {
  const s = S();
  const ex = s.currentExercise;
  const curKf = TC().getCurrentKeyframe();
  const newKf = JSON.parse(JSON.stringify(curKf));
  newKf.title = `Schritt ${ex.keyframes.length + 1}`;
  prepareNextKeyframeWithAutoPass(curKf, newKf);
  ex.keyframes.push(newKf);
  s.currentKeyframeIndex = ex.keyframes.length - 1;
  window.renderKeyframeTabs();
  window.drawScene();
  window.recordHistory();
  window.saveLocalDraft();
};

export function deleteCurrentKeyframe() {
  const s = S();
  const ex = s.currentExercise;
  if (ex.keyframes.length <= 1) {
    window.showToast("Die Übung muss mindestens einen Schritt enthalten.", true);
    return;
  }
  ex.keyframes.splice(s.currentKeyframeIndex, 1);
  s.currentKeyframeIndex = Math.max(0, s.currentKeyframeIndex - 1);
  window.deselectElement();
  window.renderKeyframeTabs();
  window.drawScene();
  window.recordHistory();
  window.saveLocalDraft();
};

export function editKeyframeTitle(index) {
  const ex = S().currentExercise;
  const kf = ex.keyframes[index];
  if (!kf) return;
  const newTitle = prompt("Name für diesen Schritt:", kf.title || `Schritt ${index + 1}`);
  if (newTitle !== null && newTitle.trim()) {
    kf.title = newTitle.trim();
    window.renderKeyframeTabs();
    window.recordHistory();
    window.saveLocalDraft();
  }
};

export function moveKeyframeToIndex(fromIdx, toIdx) {
  const ex = S().currentExercise;
  if (fromIdx === toIdx || fromIdx < 0 || toIdx < 0 || fromIdx >= ex.keyframes.length || toIdx >= ex.keyframes.length) return;
  const [moved] = ex.keyframes.splice(fromIdx, 1);
  ex.keyframes.splice(toIdx, 0, moved);
  S().currentKeyframeIndex = toIdx;
  window.renderKeyframeTabs();
  window.drawScene();
  window.recordHistory();
  window.saveLocalDraft();
};

export function clearCurrentCanvas() {
  TC().popovers.openClearConfirmModal();
};

export function closeClearConfirmModal(proceed = false) {
  TC().popovers.closeClearConfirmModal();
  if (proceed) {
    const s = S();
    const kf = TC().getCurrentKeyframe();
    if (!kf) return;
    kf.arrows = [];
    kf.elements = kf.elements.filter(el => TC().constants.isEquipment(el.type));
    s.selectedElementId = null;
    s.selectedElementIds = [];
    TC().inspectors.hideInspector();
    window.drawScene();
    window.recordHistory();
    window.saveLocalDraft();
    window.showToast("🧹 Schritt geleert!");
  }
};
