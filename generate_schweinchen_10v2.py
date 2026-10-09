"""
generate_schweinchen_10v2.py
Erstellt die Übung:
"Schweinchen in der Mitte (10 gegen 2 Rondo)"
- 10 Außenspieler (Team Blau) gleichmäßig im Kreis (Radius ~ 235 px, Center 500, 350)
- 2 Spieler in der Mitte (Team Rot - Verteidiger / Jäger)
- Unvorhersehbare Ballzirkulation, Dreiecksbildung, Doppelpressing im Zentrum
- Schritt 14: Schnittstellenpass-Versuch
- Schritt 15: Balleroberung durch Rot 1, Rot 1 und Rot 2 schalten um, Rollenwechsel!
- Durchläuft tactics_evaluator zur Plausibilitätsprüfung
"""

import math
import json
import sqlite3
import uuid
import sys
import os

sys.path.insert(0, "/root/.hermes/tactics")
from generator import create_tactical_exercise
from tactics_evaluator import evaluate_tactical_exercise, auto_correct_tactical_exercise
from db import save_exercise, get_exercise
from renderer import render_exercise_video, render_frame

CENTER_X = 500.0
CENTER_Y = 350.0
RADIUS = 235.0  # Kreisradius für 10 Außenspieler (Feld 1000x700 -> Y [115..585], X [265..735])

def get_outer_positions():
    """Berechnet 10 gleichmäßige Positionen im Kreis (36° Schritte, Start bei -90° = oben)."""
    positions = []
    for i in range(10):
        angle_deg = -90.0 + i * (360.0 / 10.0)
        angle_rad = math.radians(angle_deg)
        x = round(CENTER_X + RADIUS * math.cos(angle_rad), 1)
        y = round(CENTER_Y + RADIUS * math.sin(angle_rad), 1)
        # Blickrichtung zum Zentrum
        rot = round(angle_deg + 180.0, 1)
        positions.append((x, y, rot))
    return positions

def build_keyframes():
    # 10 Basispositionen: P1 bis P10
    base_pos = get_outer_positions()
    
    # Passabfolge über 15 Schritte (variabel & unvorhersehbar quer und kurz):
    # P1 (oben) -> P3 (rechts oben) -> P4 (rechts) -> P7 (unten links) -> P9 (links oben)
    # -> P10 -> P2 -> P6 -> P8 -> P5 -> P1 -> P4 -> P7 -> P8 (versuchter Schnittstellenpass) -> Abfang durch R1
    
    # Sequenzbeschreibung:
    # Schritt 1: Start. P1 hat den Ball. Passt diagonal zu P3. R1 und R2 laufen an.
    # Schritt 2: P3 nimmt an. Spielt kurz weiter zu P4. R1 presst P3, R2 stellt das Zentrum zu.
    # Schritt 3: P4 verlagert quer durchs Zentrum zu P7. R2 spekuliert, kommt aber knapp zu spät.
    # Schritt 4: P7 spielt steil zu P9.
    # Schritt 5: P9 tippt kurz auf P10.
    # Schritt 6: P10 spielt einen langen Diagonalpass zu P2.
    # Schritt 7: P2 lässt klatschen auf P1.
    # Schritt 8: P1 spielt scharf zu P6 (unten).
    # Schritt 9: P6 tippt zu P8. Beide Schweinchen verschieben extrem nach unten.
    # Schritt 10: P8 dreht auf und spielt zu P5.
    # Schritt 11: P5 verlagert hoch zu P1.
    # Schritt 12: P1 spielt zu P4.
    # Schritt 13: P4 spielt flach zu P7.
    # Schritt 14: P7 versucht einen riskanten Schnittstellenpass durchs Zentrum zu P9! R1 antizipiert.
    # Schritt 15: R1 fängt den Ball ab! Rollenwechsel: Passgeber P7 wird neues Schweinchen.

    # Definition der Schritte: (pass_from_idx, pass_to_idx, r1_pos, r2_pos, desc)
    # Schritt 8: R1 und R2 dürfen nicht in die senkrechte Passlinie (x=500) laufen!
    # P1 (oben) spielt zu P6 (unten). R1 (links, x=430) und R2 (rechts, x=560) laufen an,
    # lassen aber einen sauberen Schnittstellen-Korridor frei.
    sequence = [
        (0, 2, (460.0, 310.0), (530.0, 360.0), "Schritt 1: Eröffnung durch P1. Scharfer Pass zu P3. R1 läuft P1 an, R2 sichert das Zentrum."),
        (2, 3, (540.0, 280.0), (510.0, 350.0), "Schritt 2: P3 lässt schnell auf P4 klatschen. R1 attackiert P3, R2 verschiebt Richtung P4."),
        (3, 6, (570.0, 370.0), (490.0, 380.0), "Schritt 3: P4 verlagert mit starkem Flachpass quer zu P7. R2 spekuliert, verpasst den Ball knapp."),
        (6, 8, (460.0, 420.0), (440.0, 340.0), "Schritt 4: P7 spielt die Außenlinie hoch zu P9. R2 setzt nach, R1 schiebt rüber."),
        (8, 9, (420.0, 290.0), (460.0, 320.0), "Schritt 5: P9 tippt kurz weiter auf P10. Schnelle 1-Kontakt-Kombination."),
        (9, 1, (430.0, 250.0), (510.0, 270.0), "Schritt 6: P10 spielt einen präzisen Diagonalpass auf die andere Seite zu P2."),
        (1, 0, (480.0, 250.0), (530.0, 280.0), "Schritt 7: P2 spielt direkt zu P1 (oben). R1 und R2 müssen nach oben nachrücken."),
        (0, 5, (430.0, 290.0), (560.0, 320.0), "Schritt 8: P1 überrascht die Mitte mit einem Schnittstellenpass durch das Zentrum zu P6. R1 und R2 laufen seitlich an."),
        (5, 7, (430.0, 430.0), (560.0, 430.0), "Schritt 9: P6 tippt quer zu P8. Beide Verteidiger attackieren im Verbund unten."),
        (7, 4, (440.0, 410.0), (530.0, 400.0), "Schritt 10: P8 löst den Druck mit einem Pass auf P5. R2 eilt hinterher."),
        (4, 0, (530.0, 350.0), (500.0, 310.0), "Schritt 11: P5 verlagert wieder hoch zu P1. Das Tempo bleibt hoch."),
        (0, 3, (490.0, 280.0), (530.0, 320.0), "Schritt 12: P1 zieht die Abwehr an und passt auf P4 nach rechts."),
        (3, 6, (550.0, 360.0), (490.0, 380.0), "Schritt 13: P4 spielt quer zu P7 nach links unten."),
        (6, 8, (450.0, 400.0), (440.0, 340.0), "Schritt 14: P7 versucht einen riskanten Pass zu P9. R1 hat den Passweg antizipiert und spritzt dazwischen!"),
        (None, None, (445.0, 370.0), (470.0, 350.0), "Schritt 15: Balleroberung durch R1! Rollenwechsel startet: R1 hat den Ball erobert, P7 hat es verbockt."),
        ("swap", None, (361.9, 540.1), (470.0, 350.0), "Schritt 16: Tausch vollzogen! R1 übernimmt den Kreisplatz von P7 (wird blau). P7 geht als neues Schweinchen ins Zentrum (wird rot).")
    ]

    keyframes = []

    for step_num, (from_idx, to_idx, (r1_x, r1_y), (r2_x, r2_y), desc) in enumerate(sequence, start=1):
        elements = []
        arrows = []

        # 10 Außenspieler platzieren
        is_swap_step = (from_idx == "swap")
        p7_pos = base_pos[6]

        for idx in range(10):
            bx, by, brot = base_pos[idx]
            
            if is_swap_step and idx == 6:
                # P7 ist nun in der Mitte, R1 hat dessen Platz im Kreis eingenommen!
                elements.append({
                    "id": "r1",  # R1 steht jetzt außen im Kreis
                    "type": "player",
                    "x": bx,
                    "y": by,
                    "team": "blue",
                    "number": "R1",
                    "name": "R1",
                    "rotation": brot
                })
            else:
                elements.append({
                    "id": f"p_{idx+1}",
                    "type": "player",
                    "x": bx,
                    "y": by,
                    "team": "blue",
                    "number": str(idx + 1),
                    "name": f"P{idx+1}",
                    "rotation": brot
                })

        # 2 Schweinchen in der Mitte
        if is_swap_step:
            # P7 ist das neue Schweinchen im Zentrum!
            elements.append({
                "id": "p_7",
                "type": "player",
                "x": CENTER_X - 30.0,
                "y": CENTER_Y,
                "team": "red",
                "number": "7",
                "name": "P7",
                "rotation": 0.0
            })
            elements.append({
                "id": "r2",
                "type": "player",
                "x": r2_x,
                "y": r2_y,
                "team": "red",
                "number": "R2",
                "name": "R2",
                "rotation": 0.0
            })
        else:
            elements.append({
                "id": "r1",
                "type": "player",
                "x": r1_x,
                "y": r1_y,
                "team": "red",
                "number": "R1",
                "name": "R1",
                "rotation": 0.0
            })
            elements.append({
                "id": "r2",
                "type": "player",
                "x": r2_x,
                "y": r2_y,
                "team": "red",
                "number": "R2",
                "name": "R2",
                "rotation": 0.0
            })

        # Ball und Passpfeile
        if from_idx not in [None, "swap"] and to_idx is not None:
            # Ball liegt beim Start des Schritts beim Passgeber
            from_x, from_y, _ = base_pos[from_idx]
            to_x, to_y, _ = base_pos[to_idx]
            
            # Ball-Offset leicht vor den Spieler
            dx = to_x - from_x
            dy = to_y - from_y
            dist = math.hypot(dx, dy)
            b_offset_x = from_x + (dx / dist) * 16.0
            b_offset_y = from_y + (dy / dist) * 16.0

            elements.append({
                "id": "ball",
                "type": "ball",
                "x": b_offset_x,
                "y": b_offset_y,
                "team": "blue",
                "number": "1",
                "name": None,
                "rotation": 0.0
            })

            # Pass-Pfeil
            arrows.append({
                "type": "pass",
                "x1": round(b_offset_x, 1),
                "y1": round(b_offset_y, 1),
                "x2": round(to_x, 1),
                "y2": round(to_y, 1),
                "color": "#facc15"
            })

            # Pressing-Laufweg der Verteidiger
            arrows.append({
                "type": "run",
                "x1": round(r1_x, 1),
                "y1": round(r1_y, 1),
                "x2": round(r1_x + (to_x - r1_x) * 0.25, 1),
                "y2": round(r1_y + (to_y - r1_y) * 0.25, 1),
                "color": "#ef4444"
            })
        elif from_idx is None:
            # Schritt 15: Ball erobert bei R1
            elements.append({
                "id": "ball",
                "type": "ball",
                "x": round(r1_x + 14.0, 1),
                "y": round(r1_y, 1),
                "team": "blue",
                "number": "1",
                "name": None,
                "rotation": 0.0
            })
            # Tausch-Laufwege: P7 läuft in die Mitte, R1 läuft auf den Platz von P7
            p7_x, p7_y, _ = base_pos[6]
            arrows.append({
                "type": "run",
                "x1": round(p7_x, 1),
                "y1": round(p7_y, 1),
                "x2": round(CENTER_X - 30.0, 1),
                "y2": round(CENTER_Y, 1),
                "color": "#ef4444"
            })
            arrows.append({
                "type": "run",
                "x1": round(r1_x, 1),
                "y1": round(r1_y, 1),
                "x2": round(p7_x, 1),
                "y2": round(p7_y, 1),
                "color": "#38bdf8"
            })
        else:
            # Schritt 16: Tausch abgeschlossen! Ball liegt bei R1 an der Außenlinie bereit für nächste Runde
            p7_x, p7_y, _ = base_pos[6]
            elements.append({
                "id": "ball",
                "type": "ball",
                "x": round(p7_x + 14.0, 1),
                "y": round(p7_y, 1),
                "team": "blue",
                "number": "1",
                "name": None,
                "rotation": 0.0
            })

        keyframes.append({
            "step": step_num,
            "description": desc,
            "elements": elements,
            "arrows": arrows
        })

    return keyframes

def main():
    keyframes = build_keyframes()
    raw_data = {"keyframes": keyframes}

    print("=== SCHRITT 1: Taktische & geometrische Evaluierung (tactics_evaluator) ===")
    eval_res = evaluate_tactical_exercise(raw_data)
    print(f"Plausibilitäts-Score: {eval_res['score']}/100 (Status: {eval_res['status']})")
    print(f"Gefundene Mängel: {eval_res['total_issues']}")
    for issue in eval_res['issues']:
        print(f" - [{issue['severity']}] {issue['message']}")

    final_keyframes = keyframes
    if not eval_res['is_plausible']:
        print("\n=== SCHRITT 2: Auto-Korrektur anwenden ===")
        corrected = auto_correct_tactical_exercise(raw_data)
        final_keyframes = corrected.get("keyframes", keyframes)
        eval_res2 = evaluate_tactical_exercise({"keyframes": final_keyframes})
        print(f"Neuer Plausibilitäts-Score: {eval_res2['score']}/100, Issues: {eval_res2['total_issues']}")

    # In tactics.db speichern
    title = "Schweinchen in der Mitte (10 gegen 2 Rondo)"
    age_group = "D-Jugend bis Senioren"
    focus = "Kurzpassspiel, Überzahlspiel 10v2, Doppelpressing"
    player_count = "12 Spieler (10 Außen, 2 Innen)"
    pitch_type = "rondo"
    dimensions = "18x18m"
    desc = """## Schweinchen in der Mitte (10 gegen 2 Rondo)

### Aufbau & Teilnehmer
* **10 Außenspieler (Team Blau)** bilden einen gleichmäßigen Kreis mit ca. 18-20m Durchmesser.
* **2 Schweinchen / Jäger (Team Rot)** im Zentrum arbeiten als Doppel-Pressing-Paar zusammen.

### Spielregeln & Ablauf
1. **Kurzpassspiel & Zirkulation**: Maximal 1-2 Ballkontakte pro Außenspieler. Der Ball wird flach und variabel zirkuliert.
2. **Doppelpressing Rot**: Ein Schweinchen attackiert aggressiv den ballführenden Spieler, das zweite Schweinchen stellt den direkten zentralen Passweg (Deckungsschatten) zu.
3. **Abfangen & Rollenwechsel**: Erobert ein Verteidiger den Ball oder berührt ihn, tauscht der verursachende Passgeber die Rolle mit dem erfolgreichen Jäger.
"""
    coaching = """* **Offene Spielstellung**: Die Außenspieler stehen immer seitlich zum Ball, um das gesamte Feld im Blick zu haben.
* **Passqualität & Schärfe**: Pässe flach, präzise und mit dem richtigen Timing in den Fuß des Mitspielers.
* **Kommunikation im Pressing**: Die beiden Verteidiger müssen sich absprechen (wer läuft an, wer sichert ab).
* **Schnelle Handlungsschnelligkeit**: Nach Ballgewinn sofortige Reaktion und Rollenwechsel."""

    print("\n=== SCHRITT 3: In tactics.db persistieren ===")
    ex_id = f"ex_{uuid.uuid4().hex[:10]}"
    
    # Preview Image
    preview_filename = f"{ex_id}_preview.png"
    preview_path = os.path.join("/root/.hermes/tactics/media", preview_filename)
    first_img = render_frame(pitch_type, final_keyframes[0].get("elements", []), final_keyframes[0].get("arrows", []), step_title=final_keyframes[0].get("title", ""))
    first_img.save(preview_path)

    mp4_filename = f"{ex_id}.mp4"
    mp4_path = os.path.join("/root/.hermes/tactics/media", mp4_filename)

    # In DB speichern
    data = {
        "id": ex_id,
        "title": title,
        "age_group": age_group,
        "focus": focus,
        "player_count": player_count,
        "pitch_type": pitch_type,
        "dimensions": dimensions,
        "description": desc,
        "coaching_points": coaching,
        "keyframes_json": json.dumps(final_keyframes),
        "preview_image": f"/media/{preview_filename}",
        "video_mp4": f"/media/{mp4_filename}",
        "video_gif": None,
        "field_rotation": 0,
        "playback_speed": 0.6
    }
    save_exercise(data)
    print(f"Übungs-ID: {ex_id}")

    # Rendern nur der MP4 (fps=30, ohne GIF für maximale Performance)
    print("\n=== SCHRITT 4: Video rendern (MP4) ===")
    render_exercise_video(final_keyframes, pitch_type=pitch_type, output_mp4=mp4_path, fps=30, field_rotation=0, duration_per_step=1.8)
    print(f"Video gerendert: {mp4_path}")

    return ex_id, mp4_path

if __name__ == "__main__":
    main()
