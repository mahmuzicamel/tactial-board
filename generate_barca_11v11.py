#!/usr/bin/env python3
import json
import math
import os
import sys

sys.path.insert(0, "/root/.hermes/tactics")
from generator import create_tactical_exercise
from renderer import render_exercise_video, render_frame
import sqlite3

def build_barca_tiki_taka():
    # Pitch standard is 1000 x 700.
    # Full pitch layout: 
    # Left goal at x ~ 65, right goal at x ~ 935.
    # Team Blau (Barca, 4-3-3 attacking left to right -> attacking towards right goal):
    # - GK: B1 (x=110, y=350)
    # - Back 4:
    #   * LB: B3 (x=330, y=140)
    #   * LCB: B4 (x=280, y=260)
    #   * RCB: B5 (x=280, y=440)
    #   * RB: B2 (x=330, y=560)
    # - Midfield:
    #   * DM (6er - Busquets): B6 (x=390, y=350)
    #   * LCM (8er - Iniesta): B8 (x=490, y=250)
    #   * RCM (8er - Xavi): B10 (x=500, y=430)
    # - Attack:
    #   * LW: B11 (x=680, y=150)
    #   * False 9 (Messi): B9 (x=660, y=350)
    #   * RW: B7 (x=690, y=550)
    #
    # Team Rot (Gegner 4-4-2 kompakter Block):
    # - GK: R1 (x=920, y=350)
    # - Back 4:
    #   * RB: R2 (x=770, y=180)
    #   * CB1: R4 (x=790, y=290)
    #   * CB2: R5 (x=790, y=410)
    #   * LB: R3 (x=770, y=520)
    # - Midfield 4:
    #   * RM: R7 (x=610, y=200)
    #   * CM1: R6 (x=620, y=300)
    #   * CM2: R8 (x=620, y=400)
    #   * LM: R11 (x=610, y=500)
    # - Strikers 2:
    #   * ST1: R9 (x=460, y=310)
    #   * ST2: R10 (x=460, y=390)

    # 4 Haupt-Phasen:
    # 1. Eröffnung:
    #    B5 (RCB) hat den Ball, passt zu B6 (6er Busquets). B10 (Xavi) und B8 (Iniesta) lassen sich fallen.
    #    R9 & R10 laufen an, R6 schiebt vor.
    # 2. Kombination & Locken:
    #    B6 spielt auf B10 (Xavi). B10 lässt auf den nachrückenden RB (B2) klatschen.
    #    B2 zieht die gegnerische linke Seite (R11, R8) heraus und spielt B10 wieder im Doppelpass an.
    #    Team Rot verschiebt kompakt zur rechten Seite (unten).
    # 3. Verlagerung & Schnittstellenpass:
    #    B10 passt schnell quer ins Zentrum zu B8 (Iniesta).
    #    Die falsche 9 (B9 Messi) lässt sich genau zwischen die Ketten fallen.
    #    B8 spielt einen scharfen Flachpass durch die Schnittstelle auf B9.
    #    Rot rückt hektisch mit R4/R6 auf B9 heraus.
    # 4. Finaler Pass & Abschluss-Aktion:
    #    B9 lässt mit dem ersten Kontakt klatschen auf den nachrückenden B8 (Iniesta).
    #    B8 spielt den tödlichen Diagonalsteckpass hinter die Kette in den Halbraum.
    #    B11 (LW) zieht diagonal von außen in den Strafraum ein und erläuft den Steckpass frei vor R1!

    keyframes = []

    # === SCHRITT 1: Eröffnung ===
    s1_elements = [
        # Blau
        {"id": "b1", "type": "player", "team": "blue", "number": "1", "name": "TW", "x": 110, "y": 350, "rotation": 0},
        {"id": "b3", "type": "player", "team": "blue", "number": "3", "name": "LV", "x": 340, "y": 140, "rotation": 15},
        {"id": "b4", "type": "player", "team": "blue", "number": "4", "name": "IV", "x": 280, "y": 270, "rotation": 10},
        {"id": "b5", "type": "player", "team": "blue", "number": "5", "name": "IV", "x": 290, "y": 430, "rotation": -10},
        {"id": "b2", "type": "player", "team": "blue", "number": "2", "name": "RV", "x": 360, "y": 570, "rotation": -15},
        {"id": "b6", "type": "player", "team": "blue", "number": "6", "name": "6er", "x": 380, "y": 350, "rotation": 0},
        {"id": "b8", "type": "player", "team": "blue", "number": "8", "name": "8er", "x": 480, "y": 250, "rotation": 0},
        {"id": "b10", "type": "player", "team": "blue", "number": "10", "name": "8er", "x": 470, "y": 440, "rotation": -10},
        {"id": "b11", "type": "player", "team": "blue", "number": "11", "name": "LA", "x": 670, "y": 140, "rotation": 0},
        {"id": "b9", "type": "player", "team": "blue", "number": "9", "name": "F9", "x": 670, "y": 350, "rotation": 0},
        {"id": "b7", "type": "player", "team": "blue", "number": "7", "name": "RA", "x": 680, "y": 560, "rotation": 0},
        # Rot
        {"id": "r1", "type": "player", "team": "red", "number": "1", "name": "TW", "x": 920, "y": 350, "rotation": 180},
        {"id": "r2", "type": "player", "team": "red", "number": "2", "name": "RV", "x": 760, "y": 180, "rotation": 180},
        {"id": "r4", "type": "player", "team": "red", "number": "4", "name": "IV", "x": 770, "y": 290, "rotation": 180},
        {"id": "r5", "type": "player", "team": "red", "number": "5", "name": "IV", "x": 770, "y": 410, "rotation": 180},
        {"id": "r3", "type": "player", "team": "red", "number": "3", "name": "LV", "x": 760, "y": 520, "rotation": 180},
        {"id": "r7", "type": "player", "team": "red", "number": "7", "name": "RM", "x": 600, "y": 200, "rotation": 190},
        {"id": "r6", "type": "player", "team": "red", "number": "6", "name": "ZM", "x": 610, "y": 300, "rotation": 180},
        {"id": "r8", "type": "player", "team": "red", "number": "8", "name": "ZM", "x": 610, "y": 400, "rotation": 180},
        {"id": "r11", "type": "player", "team": "red", "number": "11", "name": "LM", "x": 600, "y": 500, "rotation": 170},
        {"id": "r9", "type": "player", "team": "red", "number": "9", "name": "ST", "x": 450, "y": 310, "rotation": 190},
        {"id": "r10", "type": "player", "team": "red", "number": "10", "name": "ST", "x": 440, "y": 410, "rotation": 170},
        # Ball bei B5
        {"id": "ball_1", "type": "ball", "x": 305, "y": 420}
    ]
    s1_arrows = [
        # Pass von B5 zu B6
        {"type": "pass", "x1": 305, "y1": 420, "x2": 370, "y2": 360, "color": "#facc15"},
        # B6 kommt leicht entgegen
        {"type": "run", "x1": 390, "y1": 350, "x2": 375, "y2": 355, "color": "#38bdf8"},
        # R10 läuft an
        {"type": "run", "x1": 440, "y1": 410, "x2": 395, "y2": 375, "color": "#ef4444"}
    ]
    keyframes.append({
        "title": "1. Eröffnung: IV spielt 6er an – Achter staffeln sich in Halbräume",
        "elements": s1_elements,
        "arrows": s1_arrows
    })

    # === SCHRITT 2: Kombination & Locken auf rechts ===
    s2_elements = [
        # Blau
        {"id": "b1", "type": "player", "team": "blue", "number": "1", "name": "TW", "x": 130, "y": 350, "rotation": 0},
        {"id": "b3", "type": "player", "team": "blue", "number": "3", "name": "LV", "x": 370, "y": 140, "rotation": 10},
        {"id": "b4", "type": "player", "team": "blue", "number": "4", "name": "IV", "x": 310, "y": 280, "rotation": 5},
        {"id": "b5", "type": "player", "team": "blue", "number": "5", "name": "IV", "x": 330, "y": 420, "rotation": -5},
        {"id": "b2", "type": "player", "team": "blue", "number": "2", "name": "RV", "x": 480, "y": 580, "rotation": -25},
        {"id": "b6", "type": "player", "team": "blue", "number": "6", "name": "6er", "x": 385, "y": 360, "rotation": -10},
        {"id": "b8", "type": "player", "team": "blue", "number": "8", "name": "8er", "x": 470, "y": 260, "rotation": 5},
        {"id": "b10", "type": "player", "team": "blue", "number": "10", "name": "8er", "x": 510, "y": 460, "rotation": -30},
        {"id": "b11", "type": "player", "team": "blue", "number": "11", "name": "LA", "x": 680, "y": 140, "rotation": 0},
        {"id": "b9", "type": "player", "team": "blue", "number": "9", "name": "F9", "x": 640, "y": 340, "rotation": -20},
        {"id": "b7", "type": "player", "team": "blue", "number": "7", "name": "RA", "x": 730, "y": 570, "rotation": -20},
        # Rot (verschiebt nach rechts unten)
        {"id": "r1", "type": "player", "team": "red", "number": "1", "name": "TW", "x": 920, "y": 350, "rotation": 180},
        {"id": "r2", "type": "player", "team": "red", "number": "2", "name": "RV", "x": 770, "y": 200, "rotation": 170},
        {"id": "r4", "type": "player", "team": "red", "number": "4", "name": "IV", "x": 780, "y": 310, "rotation": 170},
        {"id": "r5", "type": "player", "team": "red", "number": "5", "name": "IV", "x": 780, "y": 430, "rotation": 160},
        {"id": "r3", "type": "player", "team": "red", "number": "3", "name": "LV", "x": 750, "y": 550, "rotation": 160},
        {"id": "r7", "type": "player", "team": "red", "number": "7", "name": "RM", "x": 610, "y": 230, "rotation": 170},
        {"id": "r6", "type": "player", "team": "red", "number": "6", "name": "ZM", "x": 620, "y": 330, "rotation": 160},
        {"id": "r8", "type": "player", "team": "red", "number": "8", "name": "ZM", "x": 580, "y": 450, "rotation": 150},
        {"id": "r11", "type": "player", "team": "red", "number": "11", "name": "LM", "x": 530, "y": 540, "rotation": 150},
        {"id": "r9", "type": "player", "team": "red", "number": "9", "name": "ST", "x": 430, "y": 340, "rotation": 170},
        {"id": "r10", "type": "player", "team": "red", "number": "10", "name": "ST", "x": 420, "y": 430, "rotation": 150},
        # Ball bei B2 / B10 Dreieck
        {"id": "ball_1", "type": "ball", "x": 495, "y": 570}
    ]
    s2_arrows = [
        # Kurzpass B10 zu RV B2, B2 zieht an und spielt direkt zu B10
        {"type": "pass", "x1": 495, "y1": 570, "x2": 515, "y2": 475, "color": "#facc15"},
        # R11 und R8 werden herausgelockt
        {"type": "run", "x1": 530, "y1": 540, "x2": 510, "y2": 555, "color": "#ef4444"},
        {"type": "run", "x1": 580, "y1": 450, "x2": 540, "y2": 465, "color": "#ef4444"}
    ]
    keyframes.append({
        "title": "2. Locken & Dreiecksbildung: RV & 8er ziehen den Block auf die Seite",
        "elements": s2_elements,
        "arrows": s2_arrows
    })

    # === SCHRITT 3: Schnelle Verlagerung & Schnittstellenpass auf Falsche 9 ===
    s3_elements = [
        # Blau
        {"id": "b1", "type": "player", "team": "blue", "number": "1", "name": "TW", "x": 140, "y": 350, "rotation": 0},
        {"id": "b3", "type": "player", "team": "blue", "number": "3", "name": "LV", "x": 400, "y": 140, "rotation": 10},
        {"id": "b4", "type": "player", "team": "blue", "number": "4", "name": "IV", "x": 340, "y": 280, "rotation": 5},
        {"id": "b5", "type": "player", "team": "blue", "number": "5", "name": "IV", "x": 360, "y": 410, "rotation": -5},
        {"id": "b2", "type": "player", "team": "blue", "number": "2", "name": "RV", "x": 510, "y": 570, "rotation": -15},
        {"id": "b6", "type": "player", "team": "blue", "number": "6", "name": "6er", "x": 420, "y": 370, "rotation": -5},
        {"id": "b8", "type": "player", "team": "blue", "number": "8", "name": "8er", "x": 500, "y": 280, "rotation": 15},
        {"id": "b10", "type": "player", "team": "blue", "number": "10", "name": "8er", "x": 510, "y": 450, "rotation": -45},
        {"id": "b11", "type": "player", "team": "blue", "number": "11", "name": "LA", "x": 690, "y": 150, "rotation": 25},
        {"id": "b9", "type": "player", "team": "blue", "number": "9", "name": "F9", "x": 590, "y": 340, "rotation": 180},  # Falsche 9 lässt sich tief fallen!
        {"id": "b7", "type": "player", "team": "blue", "number": "7", "name": "RA", "x": 750, "y": 560, "rotation": -15},
        # Rot (offene Schnittstelle durch Verschieben)
        {"id": "r1", "type": "player", "team": "red", "number": "1", "name": "TW", "x": 920, "y": 350, "rotation": 180},
        {"id": "r2", "type": "player", "team": "red", "number": "2", "name": "RV", "x": 780, "y": 210, "rotation": 170},
        {"id": "r4", "type": "player", "team": "red", "number": "4", "name": "IV", "x": 770, "y": 300, "rotation": 160},
        {"id": "r5", "type": "player", "team": "red", "number": "5", "name": "IV", "x": 790, "y": 420, "rotation": 160},
        {"id": "r3", "type": "player", "team": "red", "number": "3", "name": "LV", "x": 760, "y": 540, "rotation": 160},
        {"id": "r7", "type": "player", "team": "red", "number": "7", "name": "RM", "x": 630, "y": 240, "rotation": 165},
        {"id": "r6", "type": "player", "team": "red", "number": "6", "name": "ZM", "x": 650, "y": 330, "rotation": 160},
        {"id": "r8", "type": "player", "team": "red", "number": "8", "name": "ZM", "x": 570, "y": 440, "rotation": 150},
        {"id": "r11", "type": "player", "team": "red", "number": "11", "name": "LM", "x": 520, "y": 530, "rotation": 150},
        {"id": "r9", "type": "player", "team": "red", "number": "9", "name": "ST", "x": 440, "y": 350, "rotation": 160},
        {"id": "r10", "type": "player", "team": "red", "number": "10", "name": "ST", "x": 430, "y": 440, "rotation": 150},
        # Ball bei B8
        {"id": "ball_1", "type": "ball", "x": 510, "y": 290}
    ]
    s3_arrows = [
        # B8 spielt den scharfen Schnittstellenpass auf B9 (Falsche 9)
        {"type": "pass", "x1": 510, "y1": 290, "x2": 585, "y2": 335, "color": "#facc15"},
        # B9 kommt noch 2 Schritte entgegen
        {"type": "run", "x1": 610, "y1": 340, "x2": 590, "y2": 340, "color": "#38bdf8"},
        # R4 (IV) will herausrücken, zögert aber
        {"type": "run", "x1": 770, "y1": 300, "x2": 720, "y2": 315, "color": "#ef4444"}
    ]
    keyframes.append({
        "title": "3. Zentrum-Verlagerung: Schnittstellenpass auf die absinkende Falsche 9",
        "elements": s3_elements,
        "arrows": s3_arrows
    })

    # === SCHRITT 4: Finaler Pass – Klatschen lassen & Steckpass in die Tiefe ===
    s4_elements = [
        # Blau
        {"id": "b1", "type": "player", "team": "blue", "number": "1", "name": "TW", "x": 150, "y": 350, "rotation": 0},
        {"id": "b3", "type": "player", "team": "blue", "number": "3", "name": "LV", "x": 430, "y": 140, "rotation": 10},
        {"id": "b4", "type": "player", "team": "blue", "number": "4", "name": "IV", "x": 370, "y": 290, "rotation": 5},
        {"id": "b5", "type": "player", "team": "blue", "number": "5", "name": "IV", "x": 390, "y": 400, "rotation": -5},
        {"id": "b2", "type": "player", "team": "blue", "number": "2", "name": "RV", "x": 540, "y": 560, "rotation": -10},
        {"id": "b6", "type": "player", "team": "blue", "number": "6", "name": "6er", "x": 450, "y": 360, "rotation": 0},
        {"id": "b8", "type": "player", "team": "blue", "number": "8", "name": "8er", "x": 560, "y": 260, "rotation": 30}, # nachgerückt!
        {"id": "b10", "type": "player", "team": "blue", "number": "10", "name": "8er", "x": 540, "y": 440, "rotation": -10},
        {"id": "b11", "type": "player", "team": "blue", "number": "11", "name": "LA", "x": 780, "y": 220, "rotation": 35}, # tief diagonal eingerückt!
        {"id": "b9", "type": "player", "team": "blue", "number": "9", "name": "F9", "x": 600, "y": 330, "rotation": -45},
        {"id": "b7", "type": "player", "team": "blue", "number": "7", "name": "RA", "x": 760, "y": 540, "rotation": -10},
        # Rot (überspielt)
        {"id": "r1", "type": "player", "team": "red", "number": "1", "name": "TW", "x": 880, "y": 330, "rotation": 150},
        {"id": "r2", "type": "player", "team": "red", "number": "2", "name": "RV", "x": 790, "y": 180, "rotation": 140},
        {"id": "r4", "type": "player", "team": "red", "number": "4", "name": "IV", "x": 730, "y": 310, "rotation": 130}, # herausgerückt, Lücke dahinter!
        {"id": "r5", "type": "player", "team": "red", "number": "5", "name": "IV", "x": 790, "y": 400, "rotation": 150},
        {"id": "r3", "type": "player", "team": "red", "number": "3", "name": "LV", "x": 770, "y": 520, "rotation": 150},
        {"id": "r7", "type": "player", "team": "red", "number": "7", "name": "RM", "x": 640, "y": 230, "rotation": 150},
        {"id": "r6", "type": "player", "team": "red", "number": "6", "name": "ZM", "x": 660, "y": 330, "rotation": 150},
        {"id": "r8", "type": "player", "team": "red", "number": "8", "name": "ZM", "x": 600, "y": 420, "rotation": 150},
        {"id": "r11", "type": "player", "team": "red", "number": "11", "name": "LM", "x": 550, "y": 510, "rotation": 150},
        {"id": "r9", "type": "player", "team": "red", "number": "9", "name": "ST", "x": 460, "y": 350, "rotation": 160},
        {"id": "r10", "type": "player", "team": "red", "number": "10", "name": "ST", "x": 450, "y": 430, "rotation": 150},
        # Ball im Strafraum bei B11
        {"id": "ball_1", "type": "ball", "x": 790, "y": 230}
    ]
    s4_arrows = [
        # F9 lässt klatschen auf B8
        {"type": "pass", "x1": 595, "y1": 330, "x2": 560, "y2": 270, "color": "#facc15"},
        # B8 spielt sofort den tödlichen Steckpass in die Tiefe
        {"type": "pass", "x1": 565, "y1": 265, "x2": 780, "y2": 225, "color": "#10b981"},
        # B11 Diagonalsprint hinter die Kette
        {"type": "run", "x1": 690, "y1": 150, "x2": 780, "y2": 220, "color": "#38bdf8"}
    ]
    keyframes.append({
        "title": "4. Finaler Pass: Falsche 9 lässt klatschen – Steckpass in die Tiefe auf LA",
        "elements": s4_elements,
        "arrows": s4_arrows
    })

    exercise_data = {
        "title": "FC Barcelona Tiki-Taka Spielaufbau (11 gegen 11)",
        "age_group": "U17 / U19 & Senioren",
        "focus": "Tiki-Taka Spielaufbau, Raumüberladung, Falsche 9 & Tiefenlauf",
        "player_count": "22 Spieler (11v11)",
        "pitch_type": "full",
        "dimensions": "Großfeld (105x68m)",
        "description": (
            "Aufbau:\n"
            "• Vollständiges Großfeld mit zwei Toren.\n"
            "• Team Blau (FC Barcelona): 4-3-3 mit tiefer Sechs, zwei Achtern und absinkender Falscher 9.\n"
            "• Team Rot (Gegner): Kompakter 4-4-2 Defensivblock im Mittelfeldpressing.\n\n"
            "Ablauf in 4 Phasen:\n"
            "1. Eröffnung: Innenverteidiger eröffnet auf den defensiven 6er; die beiden Achter lassen sich versetzt in die Halbräume fallen.\n"
            "2. Locken & Überladung: Schnelles 1-2-Kontakt-Spiel auf dem rechten Flügel (RV, 8er, 6er). Der gegnerische Block verschiebt ballorientiert auf die Seite.\n"
            "3. Verlagerung & Schnittstellenpass: Schnelle Verlagerung ins Zentrum. Die Falsche 9 lässt sich genau in den Zwischenlinienraum fallen und wird scharf flach angespielt.\n"
            "4. Finaler Pass: Falsche 9 lässt mit einem Kontakt auf den nachrückenden Achter klatschen. Dieser spielt den tödlichen Diagonalsteckpass in den Rücken der Kette auf den einrückenden Flügelstürmer (LA)."
        ),
        "coaching_points": (
            "• Dreiecks- und Rautenbildung: Jeder Ballführende muss jederzeit mindestens zwei flache Anspielstationen haben.\n"
            "• Balltempo & 1-Kontakt: In der engen Überladungszone das Tempo hochhalten, um Gegenspieler aus der Kette zu ziehen.\n"
            "• Timing der Falschen 9: Nicht zu früh abkippen! Erst im Moment des offenen Fußes des ZMs explosiv zwischen die Ketten fordern.\n"
            "• Gegenpressing-Absicherung: Bei jedem Vorwärtsangriff rücken die ballfernen Spieler (LV, zweiter 6er) sofort ein, um bei Ballverlust nachzupressen."
        ),
        "keyframes": keyframes
    }

    return exercise_data

if __name__ == "__main__":
    data = build_barca_tiki_taka()
    res = create_tactical_exercise(
        title=data["title"],
        age_group=data["age_group"],
        focus=data["focus"],
        player_count=data["player_count"],
        pitch_type=data["pitch_type"],
        dimensions=data["dimensions"],
        description=data["description"],
        coaching_points=data["coaching_points"],
        keyframes=data["keyframes"]
    )
    print("Exercise created:", json.dumps(res, indent=2))
    
    # Ensure field_rotation is 0 for standard Großfeld orientation
    conn = sqlite3.connect('/root/.hermes/tactics/tactics.db')
    cur = conn.cursor()
    cur.execute('UPDATE exercises SET field_rotation = 0 WHERE id = ?', (res['id'],))
    conn.commit()

    # Re-render with field_rotation=0
    render_exercise_video(data["keyframes"], pitch_type="full", output_mp4=res["mp4_abs_path"], output_gif=res["gif_abs_path"], field_rotation=0, duration_per_step=2.4)
    first_img = render_frame("full", data["keyframes"][0]["elements"], data["keyframes"][0]["arrows"], step_title=data["keyframes"][0]["title"], field_rotation=0)
    first_img.save(res["preview_abs_path"])
    print("Successfully rendered video and preview for:", res['id'])
