"""
mcp_server.py
Model Context Protocol (MCP) Server für den Tactical Coach.
Ermöglicht Agenten, LLMs und IDEs (VS Code via Hermes ACP, Cursor, Claude Code):
1. 'evaluate_exercise': Analysiert Übungen auf taktische Plausibilität, Kollisionen & unlogische Pässe
2. 'auto_correct_exercise': Korrigiert unplausible Pässe, versetzt Verteidiger oder biegt Kurven
3. 'create_tactical_exercise_full': Erstellt, validiert, korrigiert, speichert in SQLite und rendert Video (MP4/GIF)
4. 'get_exercise_by_id': Ruft eine existierende Übung inklusive Video/Preview-URLs ab
5. 'list_all_exercises': Listet alle gespeicherten Taktikübungen
"""

import sys
import os
import json
import asyncio
from typing import Dict, Any, List, Optional

sys.path.insert(0, "/root/.hermes/tactics")
from db import save_exercise, get_exercise as db_get_exercise, list_exercises as db_list_exercises
from generator import create_tactical_exercise
from tactics_evaluator import evaluate_tactical_exercise, auto_correct_tactical_exercise
from renderer import render_exercise_video, render_frame

from mcp.server.mcpserver import MCPServer

server = MCPServer(name="tactical-coach-mcp")

@server.tool(name="evaluate_exercise", description="Prüft eine Taktikübung auf geometrische, taktische und physikalische Plausibilität (z.B. Pässe durch Verteidiger).")
def evaluate_exercise(exercise_json: str) -> str:
    try:
        data = json.loads(exercise_json) if isinstance(exercise_json, str) else exercise_json
        eval_result = evaluate_tactical_exercise(data)
        return json.dumps(eval_result, indent=2, ensure_ascii=False)
    except Exception as e:
        return json.dumps({"error": str(e)}, indent=2)

@server.tool(name="auto_correct_exercise", description="Korrigiert unplausible Pässe und Stellungsfehler in einer Taktikübung automatisch.")
def auto_correct_exercise(exercise_json: str) -> str:
    try:
        data = json.loads(exercise_json) if isinstance(exercise_json, str) else exercise_json
        corrected = auto_correct_tactical_exercise(data)
        eval_after = evaluate_tactical_exercise(corrected)
        return json.dumps({
            "status": "success",
            "score_after": eval_after["score"],
            "remaining_issues": eval_after["total_issues"],
            "corrected_exercise": corrected
        }, indent=2, ensure_ascii=False)
    except Exception as e:
        return json.dumps({"error": str(e)}, indent=2)

@server.tool(name="create_tactical_exercise_full", description="Vollständiger Workflow: Evaluieren -> Auto-Korrektur -> SQLite speichern -> Video rendern.")
def create_tactical_exercise_full(
    title: str,
    keyframes_json: str,
    pitch_type: str = "full",
    age_group: str = "F-Jugend (U9)",
    focus: str = "Passspiel",
    player_count: str = "8 Spieler",
    dimensions: str = "25x20m",
    description: str = "",
    coaching_points: str = "",
    auto_correct: bool = True
) -> str:
    try:
        keyframes = json.loads(keyframes_json) if isinstance(keyframes_json, str) else keyframes_json
        raw_data = {"keyframes": keyframes}
        
        eval_res = evaluate_tactical_exercise(raw_data)
        final_keyframes = keyframes
        
        if auto_correct and not eval_res["is_plausible"]:
            corrected_data = auto_correct_tactical_exercise(raw_data)
            final_keyframes = corrected_data.get("keyframes", keyframes)
            eval_res = evaluate_tactical_exercise(corrected_data)
            
        result = create_tactical_exercise(
            title=title,
            age_group=age_group,
            focus=focus,
            player_count=player_count,
            pitch_type=pitch_type,
            dimensions=dimensions,
            description=description,
            coaching_points=coaching_points,
            keyframes=final_keyframes
        )
        
        result["plausibility_audit"] = eval_res
        return json.dumps(result, indent=2, ensure_ascii=False)
    except Exception as e:
        return json.dumps({"error": str(e)}, indent=2)

@server.tool(name="get_exercise_by_id", description="Ruft eine existierende Übung aus der Datenbank anhand der ID ab.")
def get_exercise_by_id(exercise_id: str) -> str:
    ex = db_get_exercise(exercise_id)
    if not ex:
        return json.dumps({"error": f"Übung {exercise_id} nicht gefunden."}, indent=2)
    return json.dumps(ex, indent=2, ensure_ascii=False)

@server.tool(name="list_all_exercises", description="Listet alle im Taktikboard gespeicherten Übungen auf.")
def list_all_exercises() -> str:
    exercises = db_list_exercises()
    return json.dumps(exercises, indent=2, ensure_ascii=False)

if __name__ == "__main__":
    asyncio.run(server.run_stdio_async())
