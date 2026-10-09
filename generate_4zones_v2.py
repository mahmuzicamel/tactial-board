"""
generate_4zones_v2.py
Erstellt Version 2 von:
"Spieleröffnung & Positionsspiel aus 4 Zonen (Kinderfußball / Funino)"
Nutzt das Evaluierungs-Modul (tactics_evaluator) zur Plausibilitäts- & Kollisionsprüfung.
"""

import json
import sqlite3
import sys
import os

sys.path.insert(0, "/root/.hermes/tactics")
from generator import create_tactical_exercise
from tactics_evaluator import evaluate_tactical_exercise, auto_correct_tactical_exercise
from renderer import render_exercise_video

# Canvas & Layout:
# pitch_type: "funino_4zones"
# margin_x: 40, pw: 920 -> mid_x = 500
# margin_y: 40, ph: 620 -> mid_y = 350
#
# 4 Zonen:
# Zone 1 (Hinten Oben / Defensiv Links):   x: [40..500],   y: [40..350]
# Zone 2 (Hinten Unten / Defensiv Rechts):  x: [40..500],   y: [350..660]
# Zone 3 (Vorne Oben / Offensiv Links):    x: [500..960],  y: [40..350]
# Zone 4 (Vorne Unten / Offensiv Rechts):   x: [500..960],  y: [350..660]
#
# Tore:
# Haupttor hinten: goal_5m bei (47, 350)
# Minitor oben vorne: minigoal bei (945, 195)
# Minitor unten vorne: minigoal bei (945, 505)

def build_keyframes():
    # Feste Ausrüstung
    equipment = [
        {"id": "eq_goal_gk", "type": "goal_5m", "x": 47.0, "y": 350.0, "team": "blue", "number": "1", "name": None, "rotation": 0.0, "scale": 1.1},
        {"id": "eq_goal_mini_top", "type": "minigoal", "x": 948.0, "y": 195.0, "team": "blue", "number": "1", "name": None, "rotation": 180.0, "scale": 1.0},
        {"id": "eq_goal_mini_bot", "type": "minigoal", "x": 948.0, "y": 505.0, "team": "blue", "number": "1", "name": None, "rotation": 180.0, "scale": 1.0},
        {"id": "trainer", "type": "player", "x": 500.0, "y": 15.0, "team": "yellow", "number": "T", "name": "Trainer", "rotation": 90.0}
    ]

    # Basispositionen der Akteure:
    # TW: (100, 350)
    # G2 (Zone 1 - Hinten Oben): x=320, y=140
    # G3 (Zone 2 - Hinten Unten): x=320, y=560
    # G4 (Zone 3 - Vorne Oben): x=720, y=160
    # G5 (Zone 4 - Vorne Unten): x=720, y=540
    #
    # Orange 1 (Pressing hinten auf Trennlinie x=280): y variiert zwischen 260 und 440
    # Orange 2 (Pressing vorne auf Trennlinie x=720): y variiert zwischen 260 und 440

    steps = [
        # --- SCHRITT 1: Startaufstellung & Eröffnung TW zu G2 ---
        {
            "desc": "Schritt 1: Torwart eröffnet flach nach außen zu G2 in Zone 1. O1 verschiebt Richtung G2.",
            "elements": {
                "tw": (100.0, 350.0, 30.0),
                "g2": (320.0, 140.0, 20.0),
                "g3": (320.0, 560.0, -20.0),
                "g4": (700.0, 160.0, 0.0),
                "g5": (700.0, 540.0, 0.0),
                "o1": (280.0, 350.0, 0.0),   # Zentral zwischen Z1 und Z2
                "o2": (700.0, 350.0, 0.0),   # Zentral zwischen Z3 und Z4
                "ball": (115.0, 350.0)
            },
            "arrows": [
                {"type": "pass", "x1": 115.0, "y1": 350.0, "x2": 315.0, "y2": 150.0, "color": "#facc15"},
                {"type": "run", "x1": 280.0, "y1": 350.0, "x2": 280.0, "y2": 260.0, "color": "#f97316"}
            ]
        },

        # --- SCHRITT 2: G2 nimmt Ball an, O1 läuft an (Zone 1) ---
        {
            "desc": "Schritt 2: G2 hat den Ball, dreht sich nach vorne auf. O1 attackiert seitlich. O2 stellt Passweg zu G4 zu.",
            "elements": {
                "tw": (115.0, 340.0, 45.0),
                "g2": (325.0, 145.0, 45.0),
                "g3": (310.0, 540.0, 0.0),
                "g4": (720.0, 140.0, 0.0),
                "g5": (680.0, 520.0, 0.0),
                "o1": (280.0, 260.0, 30.0),   # Orange 1 rückt seitlich nach oben
                "o2": (700.0, 270.0, 0.0),   # Orange 2 schiebt ebenfalls seitlich hoch
                "ball": (335.0, 150.0)
            },
            "arrows": [
                {"type": "run", "x1": 280.0, "y1": 260.0, "x2": 300.0, "y2": 200.0, "color": "#f97316"},
                {"type": "run", "x1": 115.0, "y1": 340.0, "x2": 150.0, "y2": 340.0, "color": "#22c55e"}
            ]
        },

        # --- SCHRITT 3: Rückpass zu TW zur Spielverlagerung (Kein Risiko!) ---
        {
            "desc": "Schritt 3: Passweg nach vorne ist durch O2 zugestellt. G2 spielt ruhig zurück zum TW. O1 setzt nach.",
            "elements": {
                "tw": (150.0, 340.0, 30.0),
                "g2": (330.0, 145.0, -140.0),
                "g3": (330.0, 550.0, -30.0),
                "g4": (730.0, 140.0, 0.0),
                "g5": (690.0, 530.0, -10.0),
                "o1": (295.0, 210.0, 45.0),
                "o2": (700.0, 260.0, 0.0),
                "ball": (328.0, 155.0)
            },
            "arrows": [
                {"type": "pass", "x1": 328.0, "y1": 155.0, "x2": 160.0, "y2": 335.0, "color": "#facc15"},
                {"type": "run", "x1": 330.0, "y1": 550.0, "x2": 350.0, "y2": 530.0, "color": "#22c55e"}
            ]
        },

        # --- SCHRITT 4: TW verlagert auf die freie Seite (Zone 2) zu G3 ---
        {
            "desc": "Schritt 4: TW lässt klatschen und verlagert direkt auf die freie Seite zu G3. O1 muss horizontal umschalten.",
            "elements": {
                "tw": (155.0, 345.0, -45.0),
                "g2": (320.0, 140.0, 0.0),
                "g3": (355.0, 525.0, -45.0),
                "g4": (730.0, 150.0, 0.0),
                "g5": (700.0, 510.0, 0.0),
                "o1": (270.0, 280.0, -60.0),  # O1 shiftet nach unten
                "o2": (700.0, 330.0, -45.0),
                "ball": (165.0, 350.0)
            },
            "arrows": [
                {"type": "pass", "x1": 165.0, "y1": 350.0, "x2": 350.0, "y2": 515.0, "color": "#facc15"},
                {"type": "run", "x1": 270.0, "y1": 280.0, "x2": 280.0, "y2": 420.0, "color": "#f97316"}
            ]
        },

        # --- SCHRITT 5: G3 hat Zeit & spielt vertikalen Linienpass zu G5 ---
        {
            "desc": "Schritt 5: G3 nimmt offen an und spielt die Linie hoch zu Spitze G5 (Zone 4). O2 kann den Passweg nicht mehr schließen.",
            "elements": {
                "tw": (140.0, 350.0, 0.0),
                "g2": (320.0, 140.0, 0.0),
                "g3": (360.0, 520.0, 0.0),
                "g4": (720.0, 160.0, 0.0),
                "g5": (710.0, 500.0, -15.0),
                "o1": (280.0, 420.0, -10.0),
                "o2": (700.0, 380.0, -45.0),  # O2 hechtet nach unten, aber zu spät
                "ball": (370.0, 515.0)
            },
            "arrows": [
                {"type": "pass", "x1": 370.0, "y1": 515.0, "x2": 700.0, "y2": 495.0, "color": "#facc15"},
                {"type": "run", "x1": 700.0, "y1": 380.0, "x2": 705.0, "y2": 460.0, "color": "#f97316"}
            ]
        },

        # --- SCHRITT 6: G5 zieht an und spielt Pass/Schuss vor das Minitor ---
        {
            "desc": "Schritt 6: G5 zieht vor und schießt flach in Richtung Minitor.",
            "elements": {
                "tw": (130.0, 350.0, 0.0),
                "g2": (320.0, 140.0, 0.0),
                "g3": (380.0, 510.0, 0.0),
                "g4": (740.0, 170.0, 0.0),
                "g5": (750.0, 490.0, 10.0),
                "o1": (280.0, 440.0, 0.0),
                "o2": (705.0, 460.0, 0.0),
                "ball": (760.0, 490.0)
            },
            "arrows": [
                {"type": "pass", "x1": 760.0, "y1": 490.0, "x2": 948.0, "y2": 505.0, "color": "#22c55e"}
            ]
        },

        # --- SCHRITT 7: Torerfolg Grün! Ball im Minitor ---
        {
            "desc": "Schritt 7: Tor für Grün! Der Ball schlägt im unteren Minitor ein.",
            "elements": {
                "tw": (130.0, 350.0, 0.0),
                "g2": (320.0, 140.0, 0.0),
                "g3": (380.0, 510.0, 0.0),
                "g4": (740.0, 170.0, 0.0),
                "g5": (765.0, 495.0, 10.0),
                "o1": (280.0, 440.0, 0.0),
                "o2": (705.0, 460.0, 0.0),
                "ball": (950.0, 505.0)  # Ball ist im Tor angekommen!
            },
            "arrows": []
        },

        # --- SCHRITT 8: Neuer Durchgang / Umschalt-Situation (Orange erobert Ball) ---
        {
            "desc": "Schritt 8 (Umschalt-Szene): Bei neuer Spieleröffnung fängt Orange 1 einen zu ungenauen Pass im Zentrum ab!",
            "elements": {
                "tw": (120.0, 350.0, 0.0),
                "g2": (330.0, 150.0, 0.0),
                "g3": (330.0, 550.0, 0.0),
                "g4": (700.0, 160.0, 0.0),
                "g5": (700.0, 540.0, 0.0),
                "o1": (270.0, 320.0, 0.0),  # O1 hat im Zentrum gelauert
                "o2": (700.0, 350.0, 0.0),
                "ball": (268.0, 325.0)
            },
            "arrows": [
                {"type": "run", "x1": 120.0, "y1": 350.0, "x2": 90.0, "y2": 350.0, "color": "#22c55e"},
                {"type": "dribble", "x1": 270.0, "y1": 320.0, "x2": 240.0, "y2": 330.0, "color": "#f97316"}
            ]
        },

        # --- SCHRITT 9: Orange 1 zieht sofort ab aufs Großtor! ---
        {
            "desc": "Schritt 9: Orange 1 schließt blitzschnell auf das Großtor ab!",
            "elements": {
                "tw": (90.0, 345.0, 20.0),
                "g2": (310.0, 180.0, -45.0),
                "g3": (310.0, 520.0, 45.0),
                "g4": (680.0, 180.0, 0.0),
                "g5": (680.0, 520.0, 0.0),
                "o1": (230.0, 335.0, 0.0),
                "o2": (680.0, 350.0, 0.0),
                "ball": (220.0, 338.0)
            },
            "arrows": [
                {"type": "pass", "x1": 220.0, "y1": 338.0, "x2": 47.0, "y2": 350.0, "color": "#f97316"}
            ]
        },

        # --- SCHRITT 10: Torerfolg Orange / Ball im Netz! ---
        {
            "desc": "Schritt 10: Der Schuss von Orange schlägt im Großtor ein! Schnelles Umschalten belohnt.",
            "elements": {
                "tw": (70.0, 345.0, 30.0),
                "g2": (300.0, 190.0, -45.0),
                "g3": (300.0, 510.0, 45.0),
                "g4": (670.0, 190.0, 0.0),
                "g5": (670.0, 510.0, 0.0),
                "o1": (210.0, 335.0, 0.0),
                "o2": (670.0, 350.0, 0.0),
                "ball": (45.0, 350.0)  # Ball schlägt im Großtor ein!
            },
            "arrows": []
        }
    ]

    keyframes = []
    for s_idx, s in enumerate(steps):
        el_list = [dict(eq) for eq in equipment]
        coords = s["elements"]

        # TW
        tw_x, tw_y, tw_rot = coords["tw"]
        el_list.append({"id": "p_tw", "type": "player", "x": tw_x, "y": tw_y, "team": "green", "number": "TW", "name": "TW", "rotation": tw_rot})

        # G2, G3, G4, G5
        g2_x, g2_y, g2_rot = coords["g2"]
        el_list.append({"id": "p_g2", "type": "player", "x": g2_x, "y": g2_y, "team": "green", "number": "2", "name": "G2", "rotation": g2_rot})
        g3_x, g3_y, g3_rot = coords["g3"]
        el_list.append({"id": "p_g3", "type": "player", "x": g3_x, "y": g3_y, "team": "green", "number": "3", "name": "G3", "rotation": g3_rot})
        g4_x, g4_y, g4_rot = coords["g4"]
        el_list.append({"id": "p_g4", "type": "player", "x": g4_x, "y": g4_y, "team": "green", "number": "4", "name": "G4", "rotation": g4_rot})
        g5_x, g5_y, g5_rot = coords["g5"]
        el_list.append({"id": "p_g5", "type": "player", "x": g5_x, "y": g5_y, "team": "green", "number": "5", "name": "G5", "rotation": g5_rot})

        # O1, O2
        o1_x, o1_y, o1_rot = coords["o1"]
        el_list.append({"id": "p_o1", "type": "player", "x": o1_x, "y": o1_y, "team": "orange", "number": "1", "name": "O1", "rotation": o1_rot})
        o2_x, o2_y, o2_rot = coords["o2"]
        el_list.append({"id": "p_o2", "type": "player", "x": o2_x, "y": o2_y, "team": "orange", "number": "2", "name": "O2", "rotation": o2_rot})

        # Ball
        bx, by = coords["ball"]
        el_list.append({"id": "ball", "type": "ball", "x": bx, "y": by, "team": "blue", "number": "1", "name": None, "rotation": 0.0})

        keyframes.append({
            "step": s_idx + 1,
            "description": s["desc"],
            "elements": el_list,
            "arrows": s.get("arrows", [])
        })

    return keyframes

def main():
    keyframes = build_keyframes()
    raw_data = {"keyframes": keyframes}

    # 1. Evaluator laufen lassen
    print("=== SCHRITT 1: Taktische & geometrische Evaluierung ===")
    eval_res = evaluate_tactical_exercise(raw_data)
    print(f"Plausibilitäts-Score: {eval_res['score']}/100 (Status: {eval_res['status']})")
    print(f"Gefundene Mängel: {eval_res['total_issues']}")
    for issue in eval_res['issues']:
        print(f" - [{issue['severity']}] {issue['message']}")

    # 2. Auto-Korrektur falls nötig
    final_keyframes = keyframes
    if not eval_res['is_plausible']:
        print("\n=== SCHRITT 2: Auto-Korrektur anwenden ===")
        corrected = auto_correct_tactical_exercise(raw_data)
        final_keyframes = corrected.get("keyframes", keyframes)
        eval_res2 = evaluate_tactical_exercise({"keyframes": final_keyframes})
        print(f"Neuer Plausibilitäts-Score: {eval_res2['score']}/100")

    # 3. In tactics.db speichern
    title = "4-Zonen Spieleröffnung & Positionsspiel v2 (Kinderfußball)"
    age_group = "F-Jugend (U9)"
    focus = "Spieleröffnung, Positionsspiel, Zonenbreite"
    player_count = "7 Spieler (4 Feld + 1 TW vs 2)"
    pitch_type = "funino_4zones"
    dimensions = "32x25m"
    desc = """## 4-Zonen Spieleröffnung & Positionsspiel v2 (Funino / Kinderfußball)

### Spielfeld & Zonenregeln
* Feld durch rote Kreuzlinien in 4 Zonen unterteilt: 2 Zonen hinten vor dem eigenen Tor, 2 Zonen vorne zu den Minitoren.
* 1 Großtor hinten mit Torwart (TW).
* 2 Minitore vorne auf der Grundlinie.

### Regeln
* **Team Grün (4 + 1 TW)**: Jeder grüne Spieler ist fest in seiner Zone gebunden (Breite & Tiefe halten).
* **Team Orange (2 Pressing-Spieler)**: Dürfen sich nur seitlich/horizontal auf der Trennlinie verschieben.

### Spielablauf & Phasen
1. **Eröffnung TW zu G2**: Sicherer Flachpass nach außen in Zone 1.
2. **Locken & Nachsetzen**: O1 läuft seitlich an, O2 stellt vorderen Passweg zu.
3. **Sicherheitsrückpass**: G2 spielt ruhig zurück zum TW (kein Querpass vor dem Tor!).
4. **Verlagerung auf freie Seite**: TW lässt klatschen zu freiem G3 in Zone 2.
5. **Linienpass in die Tiefe**: G3 spielt flach die Außenlinie hoch zu Spitze G5.
6. **Abschluss Minitor**: G5 schließt direkt ins untere Minitor ab.
7. **Umschaltmoment**: Orange fängt einen Pass im Zentrum ab.
8. **Sofortabschluss Orange**: Schneller Torschuss aufs Großtor gegen TW.
"""
    coaching = """* **Kein Risikopass durchs Zentrum**: Vor dem eigenen Tor wird nicht quer oder blind durch die Mitte gespielt.
* **Breite & Tiefe halten**: Spieler bleiben diszipliniert in ihren Zonen und ballen sich nicht um den Ball.
* **Ruhig bleiben & verlagern**: Wenn die eigene Seite zugestellt ist, den Ball über den Torwart auf die andere Seite bringen.
* **Sofortiges Umschalten**: Bei Ballverlust machen alle das Zentrum dicht, Orange sucht den direkten Abschluss."""

    print("\n=== SCHRITT 3: Übung in tactics.db persistieren ===")
    res = create_tactical_exercise(
        title=title,
        age_group=age_group,
        focus=focus,
        player_count=player_count,
        pitch_type=pitch_type,
        dimensions=dimensions,
        description=desc,
        coaching_points=coaching,
        keyframes=final_keyframes
    )

    ex_id = res["id"]
    print(f"Übungs-ID: {ex_id}")

    # Setze field_rotation = 270 (Standard für Funino 4-Zonen Anzeige) und playback_speed = 0.65
    conn = sqlite3.connect("/root/.hermes/tactics/tactics.db")
    c = conn.cursor()
    c.execute("UPDATE exercises SET field_rotation = 270, playback_speed = 0.65 WHERE id = ?", (ex_id,))
    conn.commit()
    conn.close()

    print("\n=== SCHRITT 4: Video rendern (MP4 & GIF mit field_rotation=270) ===")
    mp4_filename = f"{ex_id}.mp4"
    gif_filename = f"{ex_id}.gif"
    mp4_path = os.path.join("/root/.hermes/tactics/media", mp4_filename)
    gif_path = os.path.join("/root/.hermes/tactics/media", gif_filename)
    render_exercise_video(final_keyframes, pitch_type=pitch_type, output_mp4=mp4_path, output_gif=gif_path, field_rotation=270, duration_per_step=2.4)
    print(f"Video gerendert: {mp4_path}")

    return ex_id, mp4_path

if __name__ == "__main__":
    main()
