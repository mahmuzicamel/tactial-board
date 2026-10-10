// static/js/handlers/misc-handlers.js
// Extrahiert aus app.js (verhaltenserhaltend, byte-identische Funktionskörper).
// Handler bleiben an window.* gebunden, damit die onclick="..."-Bindings in index.html funktionieren.
(function () {
const TC = () => window.TacticalCoach;
const S = () => window.TacticalCoach?.state;


  window.showToast = function (message, isError = false) {
    let container = document.getElementById("toastContainer");
    if (!container) {
      container = document.createElement("div");
      container.id = "toastContainer";
      container.className = "fixed bottom-16 sm:bottom-6 right-4 sm:right-6 z-50 flex flex-col gap-2 pointer-events-none";
      document.body.appendChild(container);
    }
    const toast = document.createElement("div");
    toast.className = `px-3.5 py-2 rounded-xl text-xs font-semibold shadow-xl border flex items-center gap-2 transform transition-all duration-300 translate-y-4 opacity-0 pointer-events-auto ${
      isError
        ? "bg-rose-950/90 text-rose-200 border-rose-500/60 shadow-rose-950/40"
        : "bg-emerald-950/90 text-emerald-200 border-emerald-500/60 shadow-emerald-950/40"
    }`;
    toast.innerHTML = `<i class="fa-solid ${isError ? "fa-circle-exclamation text-rose-400" : "fa-circle-check text-emerald-400"}"></i><span>${message}</span>`;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.remove("translate-y-4", "opacity-0"));
    setTimeout(() => {
      toast.classList.add("translate-y-4", "opacity-0");
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  };

  window.syncFormToState = function () {
    const s = S();
    if (!s) return;
    const get = (id) => document.getElementById(id)?.value || "";
    s.currentExercise.title = get("exTitle") || "Neue Übung";
    s.currentExercise.age_group = get("exAgeGroup");
    s.currentExercise.focus = get("exFocus");
    s.currentExercise.player_count = get("exPlayers");
    s.currentExercise.dimensions = get("exDimensions");
    s.currentExercise.description = get("exDescription");
    s.currentExercise.coaching_points = get("exCoaching");
    window.saveLocalDraft();
  };

  window.updateFormFields = function () {
    const s = S();
    if (!s) return;
    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = val || "";
    };
    const ex = s.currentExercise;
    set("exTitle", ex.title);
    set("exAgeGroup", ex.age_group);
    set("exFocus", ex.focus);
    set("exPlayers", ex.player_count);
    set("exDimensions", ex.dimensions);
    set("exDescription", ex.description);
    set("exCoaching", ex.coaching_points);
    const pSel = document.getElementById("pitchSelect");
    if (pSel && ex.pitch_type) pSel.value = ex.pitch_type;

    // Synchronisiere Wiedergabe-Optionen (Ghost & Speed)
    const ghostBtn = document.getElementById("ghostToggleBtn");
    const ghostLbl = document.getElementById("ghostToggleLabel");
    if (ghostBtn && ghostLbl) {
      if (S().isGhostMode === "prev") {
        ghostBtn.className = "px-1.5 py-1 bg-cyan-950/70 text-cyan-300 font-bold text-[11px] rounded-md border border-cyan-500/60 transition flex items-center gap-1";
        ghostLbl.innerText = "Ghost: 1";
      } else if (S().isGhostMode === "all") {
        ghostBtn.className = "px-1.5 py-1 bg-purple-950/80 text-purple-200 font-bold text-[11px] rounded-md border border-purple-500/70 transition flex items-center gap-1";
        ghostLbl.innerText = "Ghost: Alle";
      } else {
        ghostBtn.className = "px-1.5 py-1 bg-slate-800 text-slate-400 font-bold text-[11px] rounded-md border border-slate-700 transition flex items-center gap-1";
        ghostLbl.innerText = "Ghost";
      }
    }
    const speedLbl = document.getElementById("speedToggleLabel");
    if (speedLbl) {
      speedLbl.innerText = `${(S().currentSpeed || 1.0).toFixed(1)}x`;
    }
  };
})();
