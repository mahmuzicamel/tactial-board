import os
import sys
import json
import uuid
import argparse
from typing import Dict, Any

sys.path.insert(0, "/root/.hermes/tactics")
from db import save_exercise, get_exercise
from renderer import render_exercise_video, render_frame

BASE_DIR = "/root/.hermes/tactics"
MEDIA_DIR = os.path.join(BASE_DIR, "media")

def create_tactical_exercise(
    title: str,
    age_group: str = "F-Jugend (U9)",
    focus: str = "Passspiel",
    player_count: str = "6-8 Spieler",
    pitch_type: str = "half",
    dimensions: str = "25x20m",
    description: str = "",
    coaching_points: str = "",
    keyframes: list = None
) -> Dict[str, Any]:
    ex_id = f"ex_{uuid.uuid4().hex[:10]}"
    
    if not keyframes:
        keyframes = [
            {
                "title": "Schritt 1: Ausgangsstellung & Pass",
                "elements": [
                    {"id": "p1", "type": "player", "team": "blue", "number": "4", "x": 200, "y": 350},
                    {"id": "p2", "type": "player", "team": "blue", "number": "7", "x": 450, "y": 200},
                    {"id": "b1", "type": "ball", "x": 225, "y": 350},
                    {"id": "c1", "type": "cone", "x": 300, "y": 150},
                    {"id": "c2", "type": "cone", "x": 300, "y": 550}
                ],
                "arrows": [
                    {"type": "pass", "x1": 225, "y1": 350, "x2": 435, "y2": 215, "color": "#facc15"}
                ]
            },
            {
                "title": "Schritt 2: Annahme & Torschuss",
                "elements": [
                    {"id": "p1", "type": "player", "team": "blue", "number": "4", "x": 320, "y": 350},
                    {"id": "p2", "type": "player", "team": "blue", "number": "7", "x": 650, "y": 230},
                    {"id": "b1", "type": "ball", "x": 665, "y": 235},
                    {"id": "c1", "type": "cone", "x": 300, "y": 150},
                    {"id": "c2", "type": "cone", "x": 300, "y": 550}
                ],
                "arrows": [
                    {"type": "run", "x1": 450, "y1": 200, "x2": 650, "y2": 230, "color": "#38bdf8"}
                ]
            }
        ]

    # Save to SQLite
    data = {
        "id": ex_id,
        "title": title,
        "age_group": age_group,
        "focus": focus,
        "player_count": player_count,
        "pitch_type": pitch_type,
        "dimensions": dimensions,
        "description": description,
        "coaching_points": coaching_points,
        "keyframes_json": json.dumps(keyframes),
        "preview_image": None,
        "video_mp4": None,
        "video_gif": None
    }
    save_exercise(data)

    # Render Preview Image
    preview_filename = f"{ex_id}_preview.png"
    preview_path = os.path.join(MEDIA_DIR, preview_filename)
    first_img = render_frame(pitch_type, keyframes[0].get("elements", []), keyframes[0].get("arrows", []), step_title=keyframes[0].get("title", ""))
    first_img.save(preview_path)

    # Render MP4 and GIF
    mp4_filename = f"{ex_id}.mp4"
    gif_filename = f"{ex_id}.gif"
    mp4_path = os.path.join(MEDIA_DIR, mp4_filename)
    gif_path = os.path.join(MEDIA_DIR, gif_filename)

    render_exercise_video(keyframes, pitch_type=pitch_type, output_mp4=mp4_path, output_gif=gif_path)

    data["preview_image"] = f"/media/{preview_filename}"
    data["video_mp4"] = f"/media/{mp4_filename}"
    data["video_gif"] = f"/media/{gif_filename}"
    save_exercise(data)

    return {
        "id": ex_id,
        "title": title,
        "preview_abs_path": preview_path,
        "mp4_abs_path": mp4_path,
        "gif_abs_path": gif_path,
        "web_url": f"http://100.81.194.35:8090"
    }

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--json", type=str, help="Path to JSON file containing exercise data")
    parser.add_argument("--sample", action="store_true", help="Generate sample 3vs2 exercise")
    args = parser.parse_args()

    if args.sample:
        payload = {
            "title": "3-gegen-2 Umschaltspiel mit Minitoren",
            "age_group": "F-Jugend (U9)",
            "focus": "Umschaltspiel & Schneller Torabschluss",
            "player_count": "5-7 Kinder",
            "pitch_type": "funino",
            "dimensions": "25 x 20 Meter",
            "description": "Blau greift mit 3 Spielern auf 2 Minitore an. Rot verteidigt zu zweit. Bei Ballgewinn schaltet Rot blitzschnell auf die gegenüberliegenden Tore um.",
            "coaching_points": "1. Offene Spielstellung bei Ballannahme.\n2. Kopf hoch vor dem Abspiel.\n3. Sofortiges Nachsetzen bei Ballverlust (Gegenpressing).",
            "keyframes": [
                {
                    "step_name": "Ausgangssituation",
                    "duration": 2.0,
                    "elements": [
                        {"id": "b1", "type": "player", "x": 500, "y": 600, "team": "blue", "number": 1, "name": "Ben"},
                        {"id": "b2", "type": "player", "x": 300, "y": 480, "team": "blue", "number": 2, "name": "Dani"},
                        {"id": "b3", "type": "player", "x": 700, "y": 480, "team": "blue", "number": 3, "name": "Ali"},
                        {"id": "r1", "type": "player", "x": 420, "y": 320, "team": "red", "number": 4, "name": "Leo"},
                        {"id": "r2", "type": "player", "x": 580, "y": 320, "team": "red", "number": 5, "name": "Sam"},
                        {"id": "ball", "type": "ball", "x": 500, "y": 570},
                        {"id": "g1", "type": "minigoal", "x": 200, "y": 70},
                        {"id": "g2", "type": "minigoal", "x": 800, "y": 70},
                        {"id": "g3", "type": "minigoal", "x": 200, "y": 630},
                        {"id": "g4", "type": "minigoal", "x": 800, "y": 630}
                    ],
                    "arrows": [
                        {"id": "a1", "from_x": 500, "from_y": 570, "to_x": 320, "to_y": 480, "type": "pass"}
                    ]
                },
                {
                    "step_name": "Pass auf Flügel & Vorstoß",
                    "duration": 2.0,
                    "elements": [
                        {"id": "b1", "type": "player", "x": 500, "y": 450, "team": "blue", "number": 1, "name": "Ben"},
                        {"id": "b2", "type": "player", "x": 320, "y": 350, "team": "blue", "number": 2, "name": "Dani"},
                        {"id": "b3", "type": "player", "x": 700, "y": 380, "team": "blue", "number": 3, "name": "Ali"},
                        {"id": "r1", "type": "player", "x": 380, "y": 280, "team": "red", "number": 4, "name": "Leo"},
                        {"id": "r2", "type": "player", "x": 540, "y": 320, "team": "red", "number": 5, "name": "Sam"},
                        {"id": "ball", "type": "ball", "x": 320, "y": 350},
                        {"id": "g1", "type": "minigoal", "x": 200, "y": 70},
                        {"id": "g2", "type": "minigoal", "x": 800, "y": 70},
                        {"id": "g3", "type": "minigoal", "x": 200, "y": 630},
                        {"id": "g4", "type": "minigoal", "x": 800, "y": 630}
                    ],
                    "arrows": [
                        {"id": "a2", "from_x": 320, "from_y": 350, "to_x": 500, "to_y": 250, "type": "pass"}
                    ]
                },
                {
                    "step_name": "Abschluss auf Minitor",
                    "duration": 2.5,
                    "elements": [
                        {"id": "b1", "type": "player", "x": 500, "y": 250, "team": "blue", "number": 1, "name": "Ben"},
                        {"id": "b2", "type": "player", "x": 320, "y": 250, "team": "blue", "number": 2, "name": "Dani"},
                        {"id": "b3", "type": "player", "x": 700, "y": 260, "team": "blue", "number": 3, "name": "Ali"},
                        {"id": "r1", "type": "player", "x": 360, "y": 200, "team": "red", "number": 4, "name": "Leo"},
                        {"id": "r2", "type": "player", "x": 500, "y": 220, "team": "red", "number": 5, "name": "Sam"},
                        {"id": "ball", "type": "ball", "x": 200, "y": 70},
                        {"id": "g1", "type": "minigoal", "x": 200, "y": 70},
                        {"id": "g2", "type": "minigoal", "x": 800, "y": 70},
                        {"id": "g3", "type": "minigoal", "x": 200, "y": 630},
                        {"id": "g4", "type": "minigoal", "x": 800, "y": 630}
                    ],
                    "arrows": []
                }
            ]
        }
    elif args.json:
        with open(args.json, "r", encoding="utf-8") as f:
            payload = json.load(f)
    else:
        parser.error("Either --json or --sample must be specified")

    res = create_tactical_exercise(
        title=payload.get("title", "Neue Übung"),
        age_group=payload.get("age_group", "F-Jugend (U9)"),
        focus=payload.get("focus", "Passspiel"),
        player_count=payload.get("player_count", "6-8 Spieler"),
        pitch_type=payload.get("pitch_type", "half"),
        dimensions=payload.get("dimensions", "25x20m"),
        description=payload.get("description", ""),
        coaching_points=payload.get("coaching_points", ""),
        keyframes=payload.get("keyframes", None)
    )

    print(json.dumps(res, indent=2))
