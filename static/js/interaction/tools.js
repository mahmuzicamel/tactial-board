// interaction/tools.js - Werkzeug-Management (Select, Pass, Run, Guide, Freihand)
import { state } from "../state/store.js";
import { hideInspector } from "../ui/inspectors.js";

export function setActiveTool(tool, onToolChange = null) {
  state.activeTool = tool;

  const toolBtns = [
    { id: "toolSelect", name: "select" },
    { id: "toolPass", name: "pass" },
    { id: "toolRun", name: "run" },
    { id: "toolGuide", name: "guide" }
  ];

  toolBtns.forEach(t => {
    const btn = document.getElementById(t.id);
    if (!btn) return;
    if (t.name === tool) {
      btn.className = "px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition bg-emerald-600 text-white shadow ring-1 ring-emerald-400";
    } else {
      btn.className = "px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition text-slate-300 hover:text-white hover:bg-slate-800";
    }
  });

  if (tool !== "select") {
    state.selectedElementId = null;
    state.selectedElementIds = [];
    state.selectedArrowIndex = null;
    state.selectedArrowPart = null;
    hideInspector();
  }

  if (onToolChange) onToolChange(tool);
}
