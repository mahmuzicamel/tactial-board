// exercise-io.js
// ES-Modul (importiert von app-module.js). Funktionskoerper byte-identisch aus app.js.
// app-module.js haengt die Exports an window.* fuer die onclick=""-Bindings.
const TC = () => window.TacticalCoach;
const S = () => window.TacticalCoach?.state;

export function getExerciseIdFromUrl() {
  const match = window.location.pathname.match(/\/exercise\/([a-zA-Z0-9_-]+)/);
  if (match) return match[1];
  return new URLSearchParams(window.location.search).get("id");
};

export function updateUrlForExercise(id, replace = false) {
  if (!id) return;
  const currentParams = new URLSearchParams(window.location.search);
  let queryString = currentParams.toString();
  if (queryString) queryString = `?${queryString}`;
  const url = `/exercise/${encodeURIComponent(id)}${queryString}`;
  if (replace) window.history.replaceState({ exerciseId: id }, "", url);
  else if (window.location.pathname !== `/exercise/${encodeURIComponent(id)}`) window.history.pushState({ exerciseId: id }, "", url);
};

export async function copyExerciseShareLink() {
  const s = S();
  const id = s?.currentExercise?.id;
  if (!id || id === "ex_initial") {
    window.showToast("Bitte speichere die Übung zuerst!", true);
    return;
  }
  const url = `${window.location.origin}/exercise/${encodeURIComponent(id)}`;
  try {
    await navigator.clipboard.writeText(url);
    window.showToast("🔗 Link kopiert!");
  } catch {
    window.showToast("Link konnte nicht kopiert werden.", true);
  }
};

export function saveLocalDraft() {
  try {
    const s = S();
    if (!s) return;
    localStorage.setItem("tactical_coach_draft", JSON.stringify({
      exercise: s.currentExercise,
      keyframeIndex: s.currentKeyframeIndex
    }));
  } catch (e) {}
};

export function loadLocalDraft() {
  try {
    const draft = localStorage.getItem("tactical_coach_draft");
    return draft ? JSON.parse(draft) : null;
  } catch {
    return null;
  }
};

export async function saveCurrentExercise() {
  window.syncFormToState();
  try {
    const res = await TC().client.saveExercise(S().currentExercise);
    if (res.status === "ok") {
      S().currentExercise.id = res.id;
      window.saveLocalDraft();
      window.updateUrlForExercise(res.id);
      window.showToast("✅ Übung erfolgreich gespeichert!");
      window.refreshExerciseBadge();
    }
  } catch (err) {
    window.showToast("Fehler beim Speichern: " + err.message, true);
  }
};

export function createNewExercise() {
  if (confirm("Neue leere Übung anlegen? Nicht gespeicherte Änderungen gehen verloren.")) {
    if (S().isPlaying) window.stopAnimation();
    S().currentExercise = TC().store.createEmptyExercise();
    S().currentKeyframeIndex = 0;
    window.deselectElement();
    window.updateFormFields();
    window.renderKeyframeTabs();
    window.drawScene();
    window.resetUndoRedo();
    window.saveLocalDraft();
    if (window.location.pathname !== "/") window.history.pushState({}, "", "/");
  }
};

export async function refreshExerciseBadge() {
  try {
    const list = await TC().client.fetchExercises();
    const badge = document.getElementById("exerciseCountBadge");
    if (badge && Array.isArray(list)) badge.innerText = list.length;
  } catch {}
};

export function openExerciseCatalog() {
  TC().popovers.openExerciseCatalog();
  window.loadCatalogExercises();
};

export function closeCatalogModal() {
  TC().popovers.closeCatalogModal();
};

export async function loadCatalogExercises(search = "") {
  try {
    const list = await TC().client.fetchExercises(search);
    const container = document.getElementById("catalogList");
    if (!container) return;
    container.innerHTML = "";
    if (list.length === 0) {
      container.innerHTML = `<div class="text-center py-8 text-xs text-slate-400">Keine Übungen gefunden.</div>`;
      return;
    }
    list.forEach(ex => {
      const item = document.createElement("div");
      item.className = "p-2.5 sm:p-3 bg-slate-800/90 hover:bg-slate-750 border border-slate-700/80 rounded-xl flex items-center justify-between gap-2 transition";
      item.innerHTML = `
        <div class="flex items-center gap-2.5 min-w-0 flex-1">
          <div class="w-10 h-10 shrink-0 bg-emerald-950/70 rounded-lg border border-emerald-700/60 flex items-center justify-center text-emerald-400 font-bold text-base shadow-inner">
            <i class="fa-solid fa-futbol text-emerald-400 text-lg"></i>
          </div>
          <div class="min-w-0 flex-1">
            <h4 class="text-xs font-bold text-white truncate" title="${ex.title}">${ex.title}</h4>
            <div class="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-slate-400 mt-0.5">
              <span class="truncate">🎯 ${ex.focus}</span>
              <span class="truncate">👥 ${ex.player_count}</span>
              <span class="truncate">📐 ${ex.dimensions}</span>
            </div>
          </div>
        </div>
        <div class="flex items-center gap-1.5 shrink-0">
          <button onclick="loadExerciseFromCatalog('${ex.id}')" class="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-xs font-semibold rounded-lg shadow transition">
            Öffnen
          </button>
          <button onclick="deleteExerciseFromCatalog('${ex.id}')" class="p-1.5 text-slate-400 hover:text-rose-400 text-xs transition" title="Löschen">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      `;
      container.appendChild(item);
    });
  } catch (err) {
    console.error(err);
  }
};

export function filterCatalog() {
  const query = document.getElementById("catalogSearch")?.value || "";
  window.loadCatalogExercises(query);
};

export async function loadExerciseFromCatalog(id, updateUrl = true) {
  try {
    if (S().isPlaying) window.stopAnimation();
    const data = await TC().client.fetchExerciseById(id);
    if (!data || !data.keyframes) throw new Error("Ungültiges Übungsformat");
    S().currentExercise = data;
    S().currentKeyframeIndex = 0;
    window.deselectElement();
    window.updateFormFields();
    window.renderKeyframeTabs();
    window.drawScene();
    window.resetUndoRedo();
    window.closeCatalogModal();
    TC().popovers.closeSidebarMenu();
    window.saveLocalDraft();
    if (updateUrl) window.updateUrlForExercise(data.id);
  } catch (err) {
    window.showToast("Fehler beim Laden: " + err.message, true);
  }
};

export async function deleteExerciseFromCatalog(id) {
  if (confirm("Übung wirklich löschen?")) {
    await TC().client.deleteExercise(id);
    await window.loadCatalogExercises();
    window.refreshExerciseBadge();
  }
};
