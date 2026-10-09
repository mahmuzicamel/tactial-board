#!/usr/bin/env python3
import json
import math
import os
import sys

sys.path.insert(0, "/root/.hermes/tactics")
from generator import create_tactical_exercise

def build_schweinchen_rondo():
    cx, cy = 500.0, 350.0
    r = 215.0  # Radius für 7 Außenspieler
    
    # 7 Spieler gleichmäßig auf dem Kreis (-90° oben)
    base_pos = {}
    for i in range(7):
        ang = -90.0 + i * (360.0 / 7.0)
        rad = math.radians(ang)
        x = round(cx + r * math.cos(rad), 1)
        y = round(cy + r * math.sin(rad), 1)
        base_pos[f"p{i+1}"] = (x, y)
    
    # Hütchen zur Kreis-Markierung (8 Hütchen rundherum bei r=235)
    cones = []
    for i in range(8):
        c_ang = i * (360.0 / 8.0)
        c_rad = math.radians(c_ang)
        cones.append({
            "id": f"c_{i+1}",
            "type": "cone",
            "x": round(cx + 245.0 * math.cos(c_rad), 1),
            "y": round(cy + 245.0 * math.sin(c_rad), 1)
        })

    # Geplante Passabfolge über 15 Schritte (unvorhersehbar, variabel, durchgesteckt)
    # Schritt-Titel, Ball-Besitzer (vor Pass), Ziel-Spieler (nach Pass), Mitte-Ziel (wohin das Schweinchen presst)
    pass_sequence = [
        # Schritt 1: Start bei P1, P1 passt flach zu P3 quer durch den rechten Halbraum
        {"step": 1, "holder": "p1", "target": "p3", "pig_target": (560.0, 260.0),
         "title": "Schritt 1: Auftakt – P1 passt flach zu P3, Verteidiger attackiert Passweg"},
        # Schritt 2: P3 nimmt an, P4 und P2 rücken anspielbar nach. P3 spielt direkt kurz zu P4
        {"step": 2, "holder": "p3", "target": "p4", "pig_target": (620.0, 380.0),
         "title": "Schritt 2: P3 lässt klatschen zu P4, Mitte shiftet nach außen"},
        # Schritt 3: P4 dreht auf und spielt einen scharfen Schnittstellenpass quer zu P7!
        {"step": 3, "holder": "p4", "target": "p7", "pig_target": (520.0, 430.0),
         "title": "Schritt 3: Scharfer Diagonalschnittstellenpass von P4 zu P7"},
        # Schritt 4: Verteidiger hechtet nach links Richtung P7. P7 spielt direkt weiter zu P6
        {"step": 4, "holder": "p7", "target": "p6", "pig_target": (410.0, 290.0),
         "title": "Schritt 4: Schneller 1-Kontakt-Pass von P7 auf P6 am Flügel"},
        # Schritt 5: P6 sieht P2 auf der anderen Seite frei – weiter Pass durch das Zentrum!
        {"step": 5, "holder": "p6", "target": "p2", "pig_target": (360.0, 360.0),
         "title": "Schritt 5: P6 spielt mutigen Pass durch das Zentrum zu P2"},
        # Schritt 6: Verteidiger sprintet ins Zentrum und blockt fast. P2 leitet sofort kurz weiter zu P1
        {"step": 6, "holder": "p2", "target": "p1", "pig_target": (580.0, 280.0),
         "title": "Schritt 6: P2 lässt prallen zu P1, Mitte dreht und attackiert P1"},
        # Schritt 7: P1 täuscht Rückpass vor, spielt aber steil flach zu P5 im Rückraum
        {"step": 7, "holder": "p1", "target": "p5", "pig_target": (510.0, 230.0),
         "title": "Schritt 7: Körpertäuschung P1 – Steilpass durch die Mitte zu P5"},
        # Schritt 8: P5 löst sich geschickt und passt mit dem ersten Kontakt zu P6
        {"step": 8, "holder": "p5", "target": "p6", "pig_target": (460.0, 440.0),
         "title": "Schritt 8: P5 spielt kontrolliert zu P6, Verteidiger versucht zu doppeln"},
        # Schritt 9: P6 tippt den Ball zu P7 an, Verteidiger rückt energisch vor
        {"step": 9, "holder": "p6", "target": "p7", "pig_target": (350.0, 370.0),
         "title": "Schritt 9: Kurzer Wandpass von P6 zu P7, Verteidiger macht Druck"},
        # Schritt 10: P7 spielt blitzschnell zu P1 oben
        {"step": 10, "holder": "p7", "target": "p1", "pig_target": (380.0, 270.0),
         "title": "Schritt 10: Schnelles Herauslösen – P7 passt hoch zu P1"},
        # Schritt 11: P1 verlagert das Spiel mit direktem Schnittstellenpass auf P3
        {"step": 11, "holder": "p1", "target": "p3", "pig_target": (480.0, 220.0),
         "title": "Schritt 11: Verlagerung von P1 auf P3, Mitte hechtet in den Raum"},
        # Schritt 12: P3 steckt durch die Nahtstelle zu P5
        {"step": 12, "holder": "p3", "target": "p5", "pig_target": (590.0, 350.0),
         "title": "Schritt 12: Steckpass durch die Nahtstelle von P3 zu P5"},
        # Schritt 13: P5 leitet sofort quer auf P2 weiter
        {"step": 13, "holder": "p5", "target": "p2", "pig_target": (480.0, 460.0),
         "title": "Schritt 13: P5 verlagert quer zu P2, Verteidiger läuft Passweg an"},
        # Schritt 14: P2 passt unter starkem Bedrängnis riskant in die Mitte Richtung P6
        {"step": 14, "holder": "p2", "target": "p6", "pig_target": (540.0, 330.0),
         "title": "Schritt 14: Riskantes Anspiel von P2 – Verteidiger antizipiert!"},
        # Schritt 15: Ballgewinn! Das Schweinchen (Mitte) fängt den Pass ab
        {"step": 15, "holder": "mid", "target": "mid", "pig_target": (460.0, 360.0),
         "title": "Schritt 15: Balleroberung! Schweinchen fängt Ball ab & Rollenwechsel"}
    ]

    # Wir bauen die 15 Keyframes
    keyframes = []
    
    # Initiale Positionen für Spieler
    current_outer_pos = {k: v for k, v in base_pos.items()}
    current_pig_pos = (500.0, 350.0)
    current_ball_pos = (base_pos["p1"][0] + 12.0, base_pos["p1"][1] + 12.0)

    for idx, s in enumerate(pass_sequence):
        step_num = s["step"]
        step_title = s["title"]
        holder = s["holder"]
        target = s["target"]
        pig_target = s["pig_target"]

        # Leichte dynamische Freilauf-/Anbietbewegungen der Außenspieler (Heranrücken)
        # Jeder Spieler bewegt sich je nach Ballnähe leicht vor/zurück
        step_outer_pos = {}
        for p_id, (bx, by) in base_pos.items():
            # Wenn der Spieler Passempfänger oder Passgeber ist, rückt er 15px zur Ballaktion heran
            if p_id == target or p_id == holder:
                dx = (cx - bx) * 0.12
                dy = (cy - by) * 0.12
            else:
                # leichte Drehung / Ausgleichsbewegung
                ang_offset = math.sin(step_num + int(p_id[1])) * 6.0
                dx = ang_offset
                dy = -ang_offset * 0.5
            step_outer_pos[p_id] = (round(bx + dx, 1), round(by + dy, 1))

        # Ballposition am Start des Schrittes
        if holder == "mid":
            # Balleroberung bei der Mitte
            ball_start = (current_pig_pos[0] + 10.0, current_pig_pos[1] + 8.0)
            ball_end = (pig_target[0] + 10.0, pig_target[1] + 8.0)
        else:
            ball_start = (step_outer_pos[holder][0] + 10.0, step_outer_pos[holder][1] + 10.0)
            ball_end = (step_outer_pos[target][0] + 10.0, step_outer_pos[target][1] + 10.0)

        # Elemente für diesen Keyframe
        elements = []
        
        # 1. Hütchen
        for c in cones:
            elements.append(dict(c))

        # 2. Die 7 Außenspieler (Team Blau)
        for i in range(1, 8):
            pid = f"p{i}"
            pos = step_outer_pos[pid]
            # Rotation: schauen Richtung Zentrum (cx, cy)
            dx = cx - pos[0]
            dy = cy - pos[1]
            rot = round(math.degrees(math.atan2(dy, dx)), 1)
            elements.append({
                "id": pid,
                "type": "player",
                "team": "blue",
                "number": str(i),
                "name": f"P{i}",
                "x": pos[0],
                "y": pos[1],
                "rotation": rot
            })

        # 3. Der Verteidiger im Zentrum ("Schweinchen", Team Rot)
        pig_x, pig_y = pig_target
        # Schaut zum Ball / Passgeber
        p_dx = ball_start[0] - pig_x
        p_dy = ball_start[1] - pig_y
        pig_rot = round(math.degrees(math.atan2(p_dy, p_dx)), 1)
        elements.append({
            "id": "p_mid",
            "type": "player",
            "team": "red",
            "number": "8",
            "name": "Mitte",
            "x": pig_x,
            "y": pig_y,
            "rotation": pig_rot
        })

        # 4. Der Ball (am Start des Passes bei P_holder, animiert im Übergang zu P_target)
        elements.append({
            "id": "ball_1",
            "type": "ball",
            "x": ball_start[0],
            "y": ball_start[1]
        })

        # Arrows für diesen Schritt (Pass & Laufwege)
        arrows = []
        if step_num < 15:
            # Passpfeil vom Passgeber zum Empfänger (gelb gestrichelt)
            arrows.append({
                "id": f"arr_pass_{step_num}",
                "type": "pass",
                "x1": ball_start[0],
                "y1": ball_start[1],
                "x2": ball_end[0],
                "y2": ball_end[1],
                "color": "#facc15"
            })
            # Laufweg des Verteidigers (blau / rot durchgezogen)
            arrows.append({
                "id": f"arr_pig_{step_num}",
                "type": "run",
                "x1": current_pig_pos[0],
                "y1": current_pig_pos[1],
                "x2": pig_target[0],
                "y2": pig_target[1],
                "color": "#ef4444"
            })
        else:
            # Schritt 15: Abfangen des Balls durch den Verteidiger
            arrows.append({
                "id": f"arr_intercept_{step_num}",
                "type": "run",
                "x1": current_pig_pos[0],
                "y1": current_pig_pos[1],
                "x2": pig_target[0],
                "y2": pig_target[1],
                "color": "#ef4444"
            })
            arrows.append({
                "id": f"arr_intercept_ball_{step_num}",
                "type": "pass",
                "x1": step_outer_pos["p2"][0],
                "y1": step_outer_pos["p2"][1],
                "x2": pig_target[0],
                "y2": pig_target[1],
                "color": "#facc15"
            })

        keyframes.append({
            "title": step_title,
            "elements": elements,
            "arrows": arrows
        })

        # Update für nächsten Loop
        current_pig_pos = pig_target

    exercise_data = {
        "title": "Schweinchen in der Mitte (7v1 Rondo)",
        "age_group": "F- / E-Jugend & Senioren",
        "focus": "Passspiel, Dreiecksbildung, Freilaufen & Pressing",
        "player_count": "8 Spieler (7 Außen, 1 Mitte)",
        "pitch_type": "rondo",
        "dimensions": "12x12m Kreis / Quadrat",
        "description": (
            "Aufbau:\n"
            "• Ein Kreis oder Quadrat mit ca. 10-12m Durchmesser mit Hütchen markieren.\n"
            "• 7 Außenspieler (Blau P1–P7) positionieren sich gleichmäßig rund um den Kreis.\n"
            "• 1 Spieler im Zentrum (Rot, 'Schweinchen') agiert als aktiver Balljäger.\n\n"
            "Ablauf (15 Schritte animiert):\n"
            "1. Die Außenspieler lassen den Ball flach und variabel mit maximal 1–2 Kontakten zirkulieren.\n"
            "2. Fokus auf Heranrücken der Nachbarn (Dreiecksbildung) und mutiges Durchstecken durchs Zentrum.\n"
            "3. Der Verteidiger im Zentrum presst aggressiv, läuft Passwinkel zu und provoziert Fehler.\n"
            "4. Bei Balleroberung (Schritt 15) wechselt der Passgeber (P2) mit dem Zentrumspieler die Rolle."
        ),
        "coaching_points": (
            "• Offene Spielstellung der Außenspieler (immer Zentrum und beide Nachbarn im Blick)\n"
            "• Präzise Passschärfe auf den richtigen Fuß des Mitspielers\n"
            "• Kurze Freilaufbewegungen: Nicht statisch stehen, sondern dem Passgeber aktiv entgegenkommen\n"
            "• Mutige Schnittstellenpässe durch die Mitte belohnen (z. B. 10 Pässe = 1 Liegestütz für Mitte)\n"
            "• Verteidiger: Auf dem Vorfuß bleiben, Körperhaltung schräg stellen, Passwege geschickt antizipieren"
        ),
        "keyframes": keyframes
    }

    return exercise_data

if __name__ == "__main__":
    data = build_schweinchen_rondo()
    out_file = "/root/.hermes/cache/scratch/exercise_schweinchen_rondo.json"
    os.makedirs(os.path.dirname(out_file), exist_ok=True)
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"Generated exercise json with {len(data['keyframes'])} keyframes at: {out_file}")
