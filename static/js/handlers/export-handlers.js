// export-handlers.js
// ES-Modul (importiert von app-module.js). Funktionskoerper byte-identisch aus app.js.
// app-module.js haengt die Exports an window.* fuer die onclick=""-Bindings.
const TC = () => window.TacticalCoach;
const S = () => window.TacticalCoach?.state;

export function openExportModal() {
  TC().popovers.openExportModal();
  // Wenn der Nutzer gerade im 3D-Modus war, Export direkt auf 3D vorwählen
  const s = S();
  const initialMode = s.is3DMode ? "3d" : "2d";
  window.setVideoRenderMode(initialMode);
  window.preparePhotoSnapshot(initialMode);
};

export function openDetailsModal() {
  document.getElementById("detailsModal")?.classList.remove("hidden");
};

export function closeDetailsModal() {
  document.getElementById("detailsModal")?.classList.add("hidden");
};

export function switchSidebarTab(tab) {
  const tEx = document.getElementById("sidebarTabExercises");
  const tDet = document.getElementById("sidebarTabDetails");
  const cEx = document.getElementById("sidebarViewExercises");
  const cDet = document.getElementById("sidebarViewDetails");
  if (!tEx || !tDet || !cEx || !cDet) return;
  if (tab === "exercises") {
    tEx.className = "flex-1 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition bg-slate-800 text-emerald-400 shadow";
    tDet.className = "flex-1 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition text-slate-400 hover:text-white";
    cEx.classList.remove("hidden");
    cDet.classList.add("hidden");
    window.loadCatalogExercises();
  } else {
    tDet.className = "flex-1 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition bg-slate-800 text-emerald-400 shadow";
    tEx.className = "flex-1 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition text-slate-400 hover:text-white";
    cDet.classList.remove("hidden");
    cEx.classList.add("hidden");
    window.updateFormFields();
  }
};

export function setVideoRenderMode(mode) {
  window.currentExportVideoType = mode;
  const btn2d = document.getElementById("videoMode2dBtn");
  const btn3d = document.getElementById("videoMode3dBtn");
  const desc = document.getElementById("videoModeDescription");
  if (mode === "3d") {
    if (btn3d) btn3d.className = "px-2 py-0.5 rounded text-[11px] font-bold bg-cyan-600 text-white shadow";
    if (btn2d) btn2d.className = "px-2 py-0.5 rounded text-[11px] font-medium text-slate-400 hover:text-white";
    if (desc) desc.innerHTML = `<i class="fa-solid fa-cube text-cyan-400"></i> Direkter 3D-Stadion-Videomitschnitt mit Three.js`;
  } else {
    if (btn2d) btn2d.className = "px-2 py-0.5 rounded text-[11px] font-bold bg-blue-600 text-white shadow";
    if (btn3d) btn3d.className = "px-2 py-0.5 rounded text-[11px] font-medium text-slate-400 hover:text-white";
    if (desc) desc.innerHTML = `<i class="fa-solid fa-video text-blue-400"></i> Frame-genauer 2D-Export (H.264 MP4, im Browser)`;
  }
};

export function triggerVideoRender() {
  if (window.currentExportVideoType === "3d") {
    window.trigger3DVideoRender();
  } else {
    window.trigger2DVideoRender();
  }
};

export async function trigger3DVideoRender() {
  const s = S();
  const btn = document.getElementById("btnRenderVideo");
  const statusBox = document.getElementById("videoRenderStatus");
  const statusText = document.getElementById("videoRenderStatusText");
  const resultBox = document.getElementById("videoResultBox");

  const currentEx = s.currentExercise;
  if (!currentEx || !Array.isArray(currentEx.keyframes) || currentEx.keyframes.length < 2) {
    window.showToast("Füge mindestens 2 Schritte hinzu, um ein Video aufzunehmen!", true);
    return;
  }

  const v3d = window.ensureView3DManager();
  if (!v3d) {
    window.showToast("3D Manager nicht verfügbar.", true);
    return;
  }

  // Sicherstellen, dass 3D initialisiert ist
  if (!v3d.isActive) {
    v3d.init();
    v3d.syncScene();
  }

  if (btn) btn.disabled = true;
  if (statusBox) statusBox.classList.remove("hidden");
  if (statusText) statusText.innerText = "3D-Animation wird aufgezeichnet (0%)...";
  if (resultBox) resultBox.classList.add("hidden");

  try {
    const speed = (typeof s.currentSpeed === "number" && s.currentSpeed > 0) ? s.currentSpeed : 1.0;
    const stepDuration = 2000 / speed;

    const result = await v3d.recordAnimationVideo({
      durationPerStep: stepDuration,
      fps: 30,
      onProgress: (p) => {
        if (statusText) statusText.innerText = `3D-Animation wird aufgezeichnet (${Math.round(p * 100)}%)...`;
      }
    });

    // Blob ist bereits H.264-MP4 (direkt im Browser via WebCodecs erzeugt) - keine Server-Konvertierung nötig.
    const finalVideoBlob = result.blob;
    window.currentExportVideoBlob = finalVideoBlob;
    const finalVideoUrl = URL.createObjectURL(finalVideoBlob);
    window.currentExportVideoUrl = finalVideoUrl;

    const player = document.getElementById("exportVideoPlayer");
    if (player) {
      player.src = finalVideoUrl;
      player.load();
    }
    const btnGif = document.getElementById("btnExportGif");
    if (btnGif) btnGif.classList.add("hidden");
    if (resultBox) resultBox.classList.remove("hidden");
    window.showToast("🎬 3D-Video als MP4 erfolgreich erstellt!");
  } catch (err) {
    console.error("3D Video Render Error:", err);
    window.showToast("Fehler bei 3D-Aufnahme: " + err.message, true);
  } finally {
    if (btn) btn.disabled = false;
    if (statusBox) statusBox.classList.add("hidden");
  }
};

export async function downloadBlobFile(url, filename) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const bUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = bUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(bUrl);
  } catch {
    window.open(url, "_blank");
  }
};

export function downloadCurrentVideo() {
  if (!window.currentExportVideoUrl) return;
  const title = (S().currentExercise.title || "taktik").replace(/[^a-zA-Z0-9_\u00C0-\u017F-]/g, "_");
  const is3d = window.currentExportVideoType === "3d";
  let ext = "mp4";
  if (window.currentExportVideoBlob && window.currentExportVideoBlob.type.includes("webm")) {
    ext = "webm";
  }
  const suffix = is3d ? "_3d" : "";
  window.downloadBlobFile(window.currentExportVideoUrl, `${title}${suffix}.${ext}`);
};
