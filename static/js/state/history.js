// state/history.js - Undo / Redo Stack Management
import { MAX_HISTORY } from "../core/constants.js";

export class HistoryManager {
  constructor(getState, applyState, onUpdateUI) {
    this.getState = getState;
    this.applyState = applyState;
    this.onUpdateUI = onUpdateUI;
    this.undoStack = [];
    this.redoStack = [];
    this.isUndoRedoAction = false;
  }

  record() {
    if (this.isUndoRedoAction) return;
    const snap = this.getState();
    if (this.undoStack.length > 0) {
      const last = this.undoStack[this.undoStack.length - 1];
      if (JSON.stringify(last.exercise) === JSON.stringify(snap.exercise) && last.keyframeIndex === snap.keyframeIndex) {
        return;
      }
    }
    this.undoStack.push(snap);
    if (this.undoStack.length > MAX_HISTORY) this.undoStack.shift();
    this.redoStack = [];
    this.updateUI();
  }

  undo() {
    if (this.undoStack.length <= 1) return;
    this.isUndoRedoAction = true;
    const currentSnap = this.undoStack.pop();
    this.redoStack.push(currentSnap);

    const prevSnap = this.undoStack[this.undoStack.length - 1];
    this.applyState(prevSnap);

    this.isUndoRedoAction = false;
    this.updateUI();
  }

  redo() {
    if (this.redoStack.length === 0) return;
    this.isUndoRedoAction = true;
    const nextSnap = this.redoStack.pop();
    this.undoStack.push(nextSnap);

    this.applyState(nextSnap);

    this.isUndoRedoAction = false;
    this.updateUI();
  }

  updateUI() {
    const uBtn = document.getElementById("undoBtn");
    const rBtn = document.getElementById("redoBtn");
    if (uBtn) uBtn.disabled = (this.undoStack.length <= 1);
    if (rBtn) rBtn.disabled = (this.redoStack.length === 0);
    if (this.onUpdateUI) this.onUpdateUI(this);
  }

  clear() {
    this.undoStack = [];
    this.redoStack = [];
    this.updateUI();
  }
}
