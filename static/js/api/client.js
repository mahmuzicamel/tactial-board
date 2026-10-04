// api/client.js - API-Kommunikation für Übungen & Video-Rendering

export async function fetchExercises(search = "") {
  const url = search ? `/api/exercises?search=${encodeURIComponent(search)}` : "/api/exercises";
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

export async function fetchExerciseById(id) {
  const res = await fetch(`/api/exercises/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

export async function saveExercise(exerciseData) {
  const res = await fetch("/api/exercises", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...exerciseData,
      render_video_async: true
    })
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

export async function deleteExercise(id) {
  const res = await fetch(`/api/exercises/${encodeURIComponent(id)}`, {
    method: "DELETE"
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

export async function renderExerciseVideo(id) {
  const res = await fetch(`/api/exercises/${encodeURIComponent(id)}/render?sync=true`, {
    method: "POST"
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}
