import os
import uuid
import json
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field

from db import init_db, save_exercise, get_exercise, list_exercises, delete_exercise
from renderer import render_frame, render_exercise_video

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")
MEDIA_DIR = os.path.join(BASE_DIR, "media")

os.makedirs(STATIC_DIR, exist_ok=True)
os.makedirs(MEDIA_DIR, exist_ok=True)

app = FastAPI(title="Tactical Coach API", version="1.0.0")

# Models
class ElementModel(BaseModel):
    id: str
    type: str = Field(..., description="player, ball, cone, pole, ladder, minigoal, goal_5m")
    x: float
    y: float
    team: Optional[str] = "blue"
    number: Optional[str] = "1"
    name: Optional[str] = None
    rotation: Optional[float] = 0.0

class ArrowModel(BaseModel):
    type: str = Field(..., description="pass, run, dribble")
    x1: float
    y1: float
    x2: float
    y2: float
    color: Optional[str] = "#facc15"

class KeyframeModel(BaseModel):
    title: str = "Schritt 1"
    elements: List[ElementModel] = []
    arrows: List[ArrowModel] = []

class ExerciseCreateOrUpdate(BaseModel):
    id: Optional[str] = None
    title: str
    age_group: str = "F-Jugend"
    focus: str = "Passspiel"
    player_count: str = "6-8 Spieler"
    pitch_type: str = "half"
    dimensions: str = "25x20m"
    description: Optional[str] = ""
    coaching_points: Optional[str] = ""
    element_scale: Optional[float] = 1.0
    field_rotation: Optional[int] = 270
    playback_speed: Optional[float] = 0.5
    keyframes: List[KeyframeModel] = []
    render_video_async: Optional[bool] = True

# Helper background task for video rendering
def generate_media_for_exercise(exercise_id: str):
    ex = get_exercise(exercise_id)
    if not ex or not ex.get("keyframes"):
        return
    
    keyframes = ex["keyframes"]
    pitch_type = ex.get("pitch_type", "half")
    el_scale = float(ex.get("element_scale") or 1.0)
    field_rot = int(ex.get("field_rotation") if ex.get("field_rotation") is not None else 270)
    speed = float(ex.get("playback_speed") or 0.5)
    duration_per_step = 2.0 / speed if speed > 0 else 4.0

    # 1. Preview PNG of first keyframe
    preview_filename = f"{exercise_id}_preview.png"
    preview_path = os.path.join(MEDIA_DIR, preview_filename)
    first_kf = keyframes[0]
    first_img = render_frame(pitch_type, first_kf.get("elements", []), first_kf.get("arrows", []), step_title="", element_scale=el_scale, field_rotation=field_rot)
    first_img.save(preview_path)

    # 2. Render MP4 and GIF
    mp4_filename = f"{exercise_id}.mp4"
    gif_filename = f"{exercise_id}.gif"
    mp4_path = os.path.join(MEDIA_DIR, mp4_filename)
    gif_path = os.path.join(MEDIA_DIR, gif_filename)

    try:
        render_exercise_video(keyframes, pitch_type=pitch_type, output_mp4=mp4_path, output_gif=gif_path, element_scale=el_scale, field_rotation=field_rot, duration_per_step=duration_per_step)
    except Exception as e:
        print(f"Error rendering video for {exercise_id}: {e}")

    # Update DB with media URLs
    save_data = {
        **ex,
        "keyframes_json": json.dumps(keyframes),
        "preview_image": f"/media/{preview_filename}",
        "video_mp4": f"/media/{mp4_filename}",
        "video_gif": f"/media/{gif_filename}",
    }
    save_exercise(save_data)

@app.on_event("startup")
def startup_event():
    init_db()

@app.get("/api/exercises")
def api_list_exercises(search: Optional[str] = None, focus: Optional[str] = None, age_group: Optional[str] = None):
    return list_exercises(search=search, focus=focus, age_group=age_group)

@app.get("/api/exercises/{exercise_id}")
def api_get_exercise(exercise_id: str):
    ex = get_exercise(exercise_id)
    if not ex:
        raise HTTPException(status_code=404, detail="Exercise not found")
    return ex

@app.post("/api/exercises")
def api_create_or_update_exercise(payload: ExerciseCreateOrUpdate, background_tasks: BackgroundTasks):
    ex_id = payload.id if payload.id else f"ex_{uuid.uuid4().hex[:10]}"
    
    kf_dicts = [kf.dict() for kf in payload.keyframes]
    
    # Store preliminary data
    data = {
        "id": ex_id,
        "title": payload.title,
        "age_group": payload.age_group,
        "focus": payload.focus,
        "player_count": payload.player_count,
        "pitch_type": payload.pitch_type,
        "dimensions": payload.dimensions,
        "description": payload.description,
        "coaching_points": payload.coaching_points,
        "element_scale": payload.element_scale or 1.0,
        "field_rotation": payload.field_rotation if payload.field_rotation is not None else 270,
        "playback_speed": payload.playback_speed or 0.5,
        "keyframes_json": json.dumps(kf_dicts),
        "preview_image": None,
        "video_mp4": None,
        "video_gif": None,
    }
    
    # Check if already exists to preserve media paths if not re-rendered
    existing = get_exercise(ex_id)
    if existing:
        data["preview_image"] = existing.get("preview_image")
        data["video_mp4"] = existing.get("video_mp4")
        data["video_gif"] = existing.get("video_gif")

    save_exercise(data)

    if payload.render_video_async:
        background_tasks.add_task(generate_media_for_exercise, ex_id)
    else:
        generate_media_for_exercise(ex_id)

    return {"status": "ok", "id": ex_id, "exercise": get_exercise(ex_id)}

@app.post("/api/exercises/{exercise_id}/render")
def api_render_exercise(exercise_id: str, background_tasks: BackgroundTasks, sync: bool = False):
    ex = get_exercise(exercise_id)
    if not ex:
        raise HTTPException(status_code=404, detail="Exercise not found")
    
    if sync:
        generate_media_for_exercise(exercise_id)
        return {"status": "ok", "exercise": get_exercise(exercise_id)}
    else:
        background_tasks.add_task(generate_media_for_exercise, exercise_id)
        return {"status": "queued"}

@app.delete("/api/exercises/{exercise_id}")
def api_delete_exercise(exercise_id: str):
    success = delete_exercise(exercise_id)
    if not success:
        raise HTTPException(status_code=404, detail="Exercise not found")
    return {"status": "deleted"}

# Serve Media and Static
app.mount("/media", StaticFiles(directory=MEDIA_DIR), name="media")
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

@app.get("/manifest.json")
def get_manifest():
    return FileResponse(os.path.join(STATIC_DIR, "manifest.json"), media_type="application/manifest+json")

@app.get("/sw.js")
def get_service_worker():
    return FileResponse(os.path.join(STATIC_DIR, "sw.js"), media_type="application/javascript")

@app.get("/")
def index():
    return FileResponse(os.path.join(STATIC_DIR, "index.html"))

@app.get("/exercise/{exercise_id}")
def exercise_view(exercise_id: str):
    return FileResponse(os.path.join(STATIC_DIR, "index.html"))

@app.get("/e/{exercise_id}")
def exercise_view_short(exercise_id: str):
    return FileResponse(os.path.join(STATIC_DIR, "index.html"))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8090)
