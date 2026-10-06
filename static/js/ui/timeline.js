// ui/timeline.js - Keyframe Tabs, Schritte hinzufügen, verschieben, umbenennen (Responsive: Mobile horizontal, Desktop vertikal)
import { state, getCurrentExercise } from "../state/store.js";

let draggedKfIndex = null;

// Aktualisiert den fließenden Indikator (animierte grüne Umrandung) und die Tab-Zustände
export function updateKeyframeActiveTabs(activeIndex) {
  const listMobile = document.getElementById("keyframesList");
  const listDesktop = document.getElementById("keyframesListDesktop");

  if (listMobile) {
    const items = listMobile.children;
    for (let i = 0; i < items.length; i++) {
      const el = items[i];
      const isActive = (i === activeIndex);
      el.className = `rounded-lg text-xs font-semibold whitespace-nowrap flex items-center gap-1 px-2 py-1 shrink-0 ${
        isActive
          ? "bg-emerald-600 text-white shadow ring-1 ring-emerald-400"
          : "bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
      }`;
      const editBtn = el.querySelector(".keyframe-edit-btn");
      if (editBtn) {
        editBtn.className = `keyframe-edit-btn p-0.5 rounded hover:bg-black/20 ${isActive ? "text-emerald-100 hover:text-white" : "text-slate-400 hover:text-slate-200"}`;
      }
    }
  }

  if (listDesktop) {
    const cards = listDesktop.querySelectorAll(".keyframe-desktop-card");
    const indicator = document.getElementById("desktopKeyframeIndicator");

    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      const isActive = (i === activeIndex);
      const badge = card.querySelector(".keyframe-index-badge");
      if (badge) {
        badge.className = `keyframe-index-badge w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 transition-colors duration-200 ${
          isActive
            ? "bg-emerald-500 text-white shadow-sm"
            : "bg-slate-800 text-slate-400 group-hover:text-slate-200"
        }`;
      }
      const titleSpan = card.querySelector(".keyframe-title-span");
      if (titleSpan) {
        titleSpan.className = `keyframe-title-span text-xs font-medium truncate flex-1 transition-colors duration-200 ${
          isActive ? "text-white font-semibold" : "text-slate-300"
        }`;
      }
    }

    if (indicator && cards[activeIndex]) {
      const targetCard = cards[activeIndex];
      indicator.style.display = "block";
      indicator.style.transform = `translateY(${targetCard.offsetTop}px)`;
      indicator.style.height = `${targetCard.offsetHeight}px`;
    }
  }
}

export function renderKeyframeTabs(onSelect, onEditTitle, onMove) {
  const listMobile = document.getElementById("keyframesList");
  const listDesktop = document.getElementById("keyframesListDesktop");
  const countBadge = document.getElementById("desktopKeyframesCount");

  if (listMobile) listMobile.innerHTML = "";
  if (listDesktop) listDesktop.innerHTML = "";

  const ex = getCurrentExercise();
  if (!ex || !Array.isArray(ex.keyframes)) return;

  if (countBadge) {
    countBadge.innerText = `${ex.keyframes.length} Schritt${ex.keyframes.length === 1 ? "" : "e"}`;
  }

  // 1. Rendere Mobile Horizontal Tabs
  if (listMobile) {
    ex.keyframes.forEach((kf, idx) => {
      const container = document.createElement("div");
      const isActive = idx === state.currentKeyframeIndex;
      container.className = `rounded-lg text-xs font-semibold whitespace-nowrap flex items-center gap-1 px-2 py-1 shrink-0 ${
        isActive
          ? "bg-emerald-600 text-white shadow ring-1 ring-emerald-400"
          : "bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
      }`;

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
      editBtn.className = `keyframe-edit-btn p-0.5 rounded hover:bg-black/20 ${isActive ? "text-emerald-100 hover:text-white" : "text-slate-400 hover:text-slate-200"}`;
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

      listMobile.appendChild(container);
    });
  }

  // 2. Rendere Desktop Vertical Cards (mit animiertem schwebendem grünen Indikator)
  if (listDesktop) {
  // Schwebender grüner Rahmen-Indikator, der geschmeidig von oben nach unten gleitet
  const indicator = document.createElement("div");
  indicator.id = "desktopKeyframeIndicator";
  indicator.className = "absolute left-2 right-2 top-0 rounded-xl pointer-events-none border-2 border-emerald-500 bg-emerald-500/10 shadow-lg shadow-emerald-500/20 z-10 transition-all duration-300 ease-out";
  indicator.style.display = "none";
  listDesktop.appendChild(indicator);

    ex.keyframes.forEach((kf, idx) => {
      const card = document.createElement("div");
      const isActive = idx === state.currentKeyframeIndex;
      card.className = "keyframe-desktop-card group relative rounded-xl p-2.5 cursor-pointer border border-slate-800 bg-slate-900/80 hover:bg-slate-800/80 flex items-center justify-between gap-2 text-slate-300 transition-colors duration-150";

      // Desktop Drag & Drop
      card.draggable = true;
      card.ondragstart = (e) => {
        draggedKfIndex = idx;
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", idx);
        card.classList.add("opacity-40");
      };
      card.ondragend = () => {
        draggedKfIndex = null;
        card.classList.remove("opacity-40");
      };
      card.ondragover = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        card.classList.add("ring-2", "ring-cyan-400");
      };
      card.ondragleave = () => {
        card.classList.remove("ring-2", "ring-cyan-400");
      };
      card.ondrop = (e) => {
        e.preventDefault();
        card.classList.remove("ring-2", "ring-cyan-400");
        if (draggedKfIndex !== null && draggedKfIndex !== idx) {
          if (onMove) onMove(draggedKfIndex, idx);
        }
      };

      // Klick wählt Schritt aus
      card.onclick = () => {
        if (onSelect) onSelect(idx);
      };

      // Linke Spalte: Index-Badge + Titel
      const leftCol = document.createElement("div");
      leftCol.className = "flex items-center gap-2.5 min-w-0 flex-1 relative z-20";

      const badge = document.createElement("span");
      badge.className = `keyframe-index-badge w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 transition-colors duration-200 ${
        isActive
          ? "bg-emerald-500 text-white shadow-sm"
          : "bg-slate-800 text-slate-400 group-hover:text-slate-200"
      }`;
      badge.innerText = idx + 1;
      leftCol.appendChild(badge);

      const titleSpan = document.createElement("span");
      titleSpan.className = `keyframe-title-span text-xs font-medium truncate flex-1 transition-colors duration-200 ${
        isActive ? "text-white font-semibold" : "text-slate-300"
      }`;
      titleSpan.innerText = kf.title || `Schritt ${idx + 1}`;
      titleSpan.title = kf.title || `Schritt ${idx + 1}`;
      leftCol.appendChild(titleSpan);

      card.appendChild(leftCol);

      // Rechte Spalte: Actions (Up / Down & Rename)
      const actions = document.createElement("div");
      actions.className = "flex items-center gap-1 shrink-0 opacity-70 group-hover:opacity-100 transition relative z-20";

      // Edit Button
      const editBtn = document.createElement("button");
      editBtn.className = "p-1 rounded hover:bg-slate-700/80 text-slate-400 hover:text-white transition";
      editBtn.title = "Schritt umbenennen";
      editBtn.innerHTML = `<i class="fa-solid fa-pen text-[10px]"></i>`;
      editBtn.onclick = (e) => {
        e.stopPropagation();
        if (onEditTitle) onEditTitle(idx);
      };
      actions.appendChild(editBtn);

      // Move Up Button
      if (idx > 0) {
        const moveUpBtn = document.createElement("button");
        moveUpBtn.className = "p-1 rounded hover:bg-slate-700/80 text-slate-400 hover:text-white transition";
        moveUpBtn.title = "Nach oben schieben";
        moveUpBtn.innerHTML = `<i class="fa-solid fa-chevron-up text-[10px]"></i>`;
        moveUpBtn.onclick = (e) => {
          e.stopPropagation();
          if (onMove) onMove(idx, idx - 1);
        };
        actions.appendChild(moveUpBtn);
      }

      // Move Down Button
      if (idx < ex.keyframes.length - 1) {
        const moveDownBtn = document.createElement("button");
        moveDownBtn.className = "p-1 rounded hover:bg-slate-700/80 text-slate-400 hover:text-white transition";
        moveDownBtn.title = "Nach unten schieben";
        moveDownBtn.innerHTML = `<i class="fa-solid fa-chevron-down text-[10px]"></i>`;
        moveDownBtn.onclick = (e) => {
          e.stopPropagation();
          if (onMove) onMove(idx, idx + 1);
        };
        actions.appendChild(moveDownBtn);
      }

      card.appendChild(actions);
      listDesktop.appendChild(card);
    });

    // Initialen Indikator auf aktiven Keyframe ausrichten
    requestAnimationFrame(() => {
      const cards = listDesktop.querySelectorAll(".keyframe-desktop-card");
      const activeIdx = state.currentKeyframeIndex || 0;
      if (indicator && cards[activeIdx]) {
        const targetCard = cards[activeIdx];
        indicator.style.display = "block";
        indicator.style.transform = `translateY(${targetCard.offsetTop}px)`;
        indicator.style.height = `${targetCard.offsetHeight}px`;
      }
    });
  }
}
