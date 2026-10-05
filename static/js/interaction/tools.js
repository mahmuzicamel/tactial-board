// interaction/tools.js - Werkzeug-Management (Select, Pass, Run, Guide, Freihand)
import { state } from "../state/store.js";
import { hideInspector } from "../ui/inspectors.js";

export function setActiveTool(tool, onToolChange = null) {
  state.activeTool = tool;

  const toolBtns = [
    { id: "toolSelectBtn", name: "select" },
    { id: "toolPassBtn", name: "pass" },
    { id: "toolRunBtn", name: "run" },
    { id: "toolGuideBtn", name: "guide" }
  ];

  toolBtns.forEach(t => {
    const btn = document.getElementById(t.id);
    if (!btn) return;
    if (t.name === tool) {
      btn.className = "px-2 py-1 rounded-md bg-emerald-600 text-white flex items-center gap-1 border border-emerald-500 transition text-[11px] font-semibold";
    } else {
      btn.className = "px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center gap-1 border border-slate-700 transition text-[11px] font-medium";
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
