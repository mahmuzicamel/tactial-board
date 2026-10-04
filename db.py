import os
import json
import sqlite3
from typing import Optional, List, Dict, Any

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "tactics.db")

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with get_db() as conn:
        conn.execute("""
        CREATE TABLE IF NOT EXISTS exercises (\n            id TEXT PRIMARY KEY,\n            title TEXT NOT NULL,\n            age_group TEXT NOT NULL DEFAULT 'F-Jugend',\n            focus TEXT NOT NULL DEFAULT 'Passspiel',\n            player_count TEXT DEFAULT '6-8 Spieler',\n            pitch_type TEXT NOT NULL DEFAULT 'half',\n            dimensions TEXT DEFAULT '25x20m',\n            description TEXT,\n            coaching_points TEXT,\n            element_scale REAL DEFAULT 1.0,\n            field_rotation INTEGER DEFAULT 270,\n            playback_speed REAL DEFAULT 0.5,\n            keyframes_json TEXT NOT NULL,\n            preview_image TEXT,\n            video_mp4 TEXT,\n            video_gif TEXT,\n            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,\n            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP\n        );\n        """)
        # Migration for existing table
        try:
            conn.execute("ALTER TABLE exercises ADD COLUMN element_scale REAL DEFAULT 1.0")
        except Exception:
            pass
        try:
            conn.execute("ALTER TABLE exercises ADD COLUMN field_rotation INTEGER DEFAULT 270")
        except Exception:
            pass
        try:
            conn.execute("ALTER TABLE exercises ADD COLUMN playback_speed REAL DEFAULT 0.5")
        except Exception:
            pass
        conn.commit()

def save_exercise(data: Dict[str, Any]) -> str:
    if "element_scale" not in data or data["element_scale"] is None:
        data["element_scale"] = 1.0
    if "field_rotation" not in data or data["field_rotation"] is None:
        data["field_rotation"] = 270
    if "playback_speed" not in data or data["playback_speed"] is None:
        data["playback_speed"] = 0.5
    with get_db() as conn:
        conn.execute("""
        INSERT INTO exercises (
            id, title, age_group, focus, player_count, pitch_type,
            dimensions, description, coaching_points, element_scale, field_rotation, playback_speed, keyframes_json,
            preview_image, video_mp4, video_gif, updated_at
        ) VALUES (
            :id, :title, :age_group, :focus, :player_count, :pitch_type,
            :dimensions, :description, :coaching_points, :element_scale, :field_rotation, :playback_speed, :keyframes_json,
            :preview_image, :video_mp4, :video_gif, CURRENT_TIMESTAMP
        )
        ON CONFLICT(id) DO UPDATE SET
            title = excluded.title,
            age_group = excluded.age_group,
            focus = excluded.focus,
            player_count = excluded.player_count,
            pitch_type = excluded.pitch_type,
            dimensions = excluded.dimensions,
            description = excluded.description,
            coaching_points = excluded.coaching_points,
            element_scale = excluded.element_scale,
            field_rotation = excluded.field_rotation,
            playback_speed = excluded.playback_speed,
            keyframes_json = excluded.keyframes_json,
            preview_image = COALESCE(excluded.preview_image, exercises.preview_image),
            video_mp4 = COALESCE(excluded.video_mp4, exercises.video_mp4),
            video_gif = COALESCE(excluded.video_gif, exercises.video_gif),
            updated_at = CURRENT_TIMESTAMP
        """, data)
        conn.commit()
    return data["id"]

def get_exercise(exercise_id: str) -> Optional[Dict[str, Any]]:
    with get_db() as conn:
        row = conn.execute("SELECT * FROM exercises WHERE id = ?", (exercise_id,)).fetchone()
        if not row:
            return None
        res = dict(row)
        res["keyframes"] = json.loads(res["keyframes_json"])
        return res

def list_exercises(search: Optional[str] = None, focus: Optional[str] = None, age_group: Optional[str] = None) -> List[Dict[str, Any]]:
    query = "SELECT id, title, age_group, focus, player_count, pitch_type, dimensions, preview_image, video_mp4, video_gif, created_at FROM exercises WHERE 1=1"
    params = []
    if search:
        query += " AND (title LIKE ? OR description LIKE ? OR focus LIKE ?)"
        s = f"%{search}%"
        params.extend([s, s, s])
    if focus:
        query += " AND focus = ?"
        params.append(focus)
    if age_group:
        query += " AND age_group = ?"
        params.append(age_group)
    query += " ORDER BY updated_at DESC"
    
    with get_db() as conn:
        rows = conn.execute(query, params).fetchall()
        return [dict(r) for r in rows]

def delete_exercise(exercise_id: str) -> bool:
    with get_db() as conn:
        cur = conn.execute("DELETE FROM exercises WHERE id = ?", (exercise_id,))
        conn.commit()
        return cur.rowcount > 0

if __name__ == "__main__":
    init_db()
    print("Database initialized successfully at:", DB_PATH)
