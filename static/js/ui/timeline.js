// ui/timeline.js - Keyframe Tabs, Schritte hinzufügen, verschieben, umbenennen
import { state, getCurrentExercise } from "../state/store.js";

let draggedKfIndex = null;

export function renderKeyframeTabs(onSelect, onEditTitle, onMove) {
  const list = document.getElementById("keyframesList");
  if (!list) return;
  list.innerHTML = "";

  const ex = getCurrentExercise();
  if (!ex || !Array.isArray(ex.keyframes)) return;

  ex.keyframes.forEach((kf, idx) => {
    const container = document.createElement("div");
    const isActive = idx === state.currentKeyframeIndex;
    container.className = `rounded-lg text-xs font-semibold whitespace-nowrap transition flex items-center gap-1 px-2 py-1 shrink-0 ${
      isActive
        ? "bg-emerald-600 text-white shadow ring-1 ring-emerald-400"
        : "bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
    }`;

    // Desktop only draggable; on touch devices draggable interferes with horizontal touch swipe
    if (typeof window !== "undefined" && window.matchMedia && window.matchMedia("(pointer: fine)").matches) {
      container.draggable = true;
    } else {
      container.draggable = false;
    }

    // Drag and Drop events to reorder steps
    container.ondragstart = (e) => {
      draggedKfIndex = idx;
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", idx);
      container.classList.add("opacity-50");
    };

    container.ondragend = () => {
      draggedKfIndex = null;
      container.classList.remove("opacity-50");
    };

    container.ondragover = (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      container.classList.add("ring-2", "ring-cyan-400");
    };

    container.ondragleave = () => {
      container.classList.remove("ring-2", "ring-cyan-400");
    };

    container.ondrop = (e) => {
      e.preventDefault();
      container.classList.remove("ring-2", "ring-cyan-400");
      if (draggedKfIndex !== null && draggedKfIndex !== idx) {
        if (onMove) onMove(draggedKfIndex, idx);
      }
    };

    // Move Left Button
    if (idx > 0) {
      const moveLeftBtn = document.createElement("button");
      moveLeftBtn.className = "text-[9px] px-0.5 text-slate-400 hover:text-white transition";
      moveLeftBtn.title = "Schritt nach links verschieben";
      moveLeftBtn.innerHTML = `<i class="fa-solid fa-chevron-left"></i>`;
      moveLeftBtn.onclick = (e) => {
        e.stopPropagation();
        if (onMove) onMove(idx, idx - 1);
      };
      container.appendChild(moveLeftBtn);
    }

    // Clickable Tab Button
    const btn = document.createElement("button");
    btn.className = "flex items-center gap-1 outline-none py-0.5";
    btn.innerHTML = `<span class="max-w-[105px] truncate" title="${kf.title || 'Schritt ' + (idx + 1)}">${kf.title || "Schritt " + (idx + 1)}</span>`;
    btn.onclick = () => { if (onSelect) onSelect(idx); };
    btn.ondblclick = (e) => {
      e.stopPropagation();
      if (onEditTitle) onEditTitle(idx);
    };
    container.appendChild(btn);

    // Edit Title Button (Pen Icon)
    const editBtn = document.createElement("button");
    editBtn.className = `p-0.5 rounded hover:bg-black/20 ${isActive ? "text-emerald-100 hover:text-white" : "text-slate-400 hover:text-slate-200"}`;
    editBtn.title = "Schrittname umbenennen";
    editBtn.innerHTML = `<i class="fa-solid fa-pen text-[9px]"></i>`;
    editBtn.onclick = (e) => {
      e.stopPropagation();
      if (onEditTitle) onEditTitle(idx);
    };
    container.appendChild(editBtn);

    // Move Right Button
    if (idx < ex.keyframes.length - 1) {
      const moveRightBtn = document.createElement("button");
      moveRightBtn.className = "text-[9px] px-0.5 text-slate-400 hover:text-white transition";
      moveRightBtn.title = "Schritt nach rechts verschieben";
      moveRightBtn.innerHTML = `<i class="fa-solid fa-chevron-right"></i>`;
      moveRightBtn.onclick = (e) => {
        e.stopPropagation();
        if (onMove) onMove(idx, idx + 1);
      };
      container.appendChild(moveRightBtn);
    }

    list.appendChild(container);
  });
}
