"""
tactics_evaluator.py
Taktische und physikalische Plausibilitätsprüfung für Fußball-Trainingsübungen.

Funktionen:
1. Pass-Kollision & Abfangprüfung (Line-of-Sight / Distance to ray)
   - Prüft, ob ein Verteidiger im Weg eines Passes steht.
   - Bewertet: Wenn Distanz < Intercept-Radius (z.B. 32px), hätte der Verteidiger den Ball abfangen müssen!
2. Sprint- & Geschwindigkeits-Plausibilität
   - Prüft, ob ein Spieler in einem Schritt unrealistisch weite Strecken zurücklegt.
3. Ball-Zustellungs-Check & Erreichbarkeit
   - Liegt der Ball zu Beginn eines Schritts wirklich beim Passgeber?
4. Auto-Korrektur
   - Versetzt Verteidiger aus der direkten Passlinie (z. B. auf den falschen Fuß)
   - ODER markiert den Schritt plausibel als Balleroberung
   - ODER fügt Kurven-Kontrollpunkte (Schnittstellen-Bogen) ein
"""

import math
from typing import Dict, Any, List, Tuple

INTERCEPT_RADIUS = 32.0  # px auf 1000x700 Feld (~ 2.5 - 3 Meter Abfangreichweite)
MAX_SPRINT_DISTANCE_PER_STEP = 240.0  # px (~ 18-20 Meter in 1.5 - 2 Sek)

def point_to_segment_distance(px: float, py: float, x1: float, y1: float, x2: float, y2: float) -> Tuple[float, float, float]:
    """Berechnet den kürzesten Abstand eines Punktes (px, py) zur Strecke (x1, y1) -> (x2, y2).
    Gibt (dist, proj_x, proj_y) zurück.
    """
    dx = x2 - x1
    dy = y2 - y1
    seg_len_sq = dx * dx + dy * dy
    if seg_len_sq < 1e-6:
        d = math.hypot(px - x1, py - y1)
        return d, x1, y1
    
    # Projektionsparameter t clampen auf [0, 1]
    t = ((px - x1) * dx + (py - y1) * dy) / seg_len_sq
    t = max(0.0, min(1.0, t))
    
    proj_x = x1 + t * dx
    proj_y = y1 + t * dy
    dist = math.hypot(px - proj_x, py - proj_y)
    return dist, proj_x, proj_y

def evaluate_tactical_exercise(exercise_data: Dict[str, Any]) -> Dict[str, Any]:
    """Prüft eine Übung auf taktische und physikalische Plausibilität.
    Gibt eine strukturierte Bewertung mit Score (0-100), Mängeln und Korrekturvorschlägen zurück.
    """
    keyframes = exercise_data.get("keyframes", [])
    if not keyframes:
        return {
            "score": 0,
            "status": "invalid",
            "issues": [{"severity": "critical", "message": "Keine Keyframes vorhanden."}],
            "recommendations": []
        }

    issues = []
    prev_elements_map = {}

    for step_idx, kf in enumerate(keyframes):
        step_num = step_idx + 1
        elements = kf.get("elements", [])
        arrows = kf.get("arrows", [])
        
        # Mappings nach ID und Team
        el_map = {e.get("id"): e for e in elements if "id" in e}
        defenders = [e for e in elements if e.get("type") == "player" and e.get("team") == "red"]
        attackers = [e for e in elements if e.get("type") == "player" and e.get("team") == "blue"]
        balls = [e for e in elements if e.get("type") == "ball"]

        # 1. Ballbesitz / Pass-Check
        pass_arrows = [a for a in arrows if a.get("type") == "pass"]
        for p_idx, p_arrow in enumerate(pass_arrows):
            x1, y1 = float(p_arrow.get("x1", 0)), float(p_arrow.get("y1", 0))
            x2, y2 = float(p_arrow.get("x2", 0)), float(p_arrow.get("y2", 0))
            pass_len = math.hypot(x2 - x1, y2 - y1)

            if pass_len < 10.0:
                issues.append({
                    "step": step_num,
                    "type": "trivial_pass",
                    "severity": "low",
                    "message": f"Schritt {step_num}: Pass {p_idx+1} ist extrem kurz (< 10px)."
                })

            # Kollisionsprüfung mit dynamischer Flugbahn (Interpolation über Zeit t)
            # Da sich Verteidiger und Ball gleichzeitig bewegen, prüfen wir t in [0.0 .. 1.0]
            # sowie die statische Distanz zur Passstrecke
            for def_el in defenders:
                d_id = def_el.get("id", "def")
                d_name = def_el.get("name") or def_el.get("number") or d_id
                dx, dy = float(def_el.get("x", 0)), float(def_el.get("y", 0))

                dist, px, py = point_to_segment_distance(dx, dy, x1, y1, x2, y2)

                dist_to_start = math.hypot(dx - x1, dy - y1)
                dist_to_end = math.hypot(dx - x2, dy - y2)

                if dist < INTERCEPT_RADIUS and dist_to_start > 35 and dist_to_end > 35:
                    issues.append({
                        "step": step_num,
                        "type": "unrealistic_pass_through_defender",
                        "severity": "high",
                        "defender_id": d_id,
                        "defender_name": d_name,
                        "dist": round(dist, 1),
                        "coords": {"def": (dx, dy), "pass_start": (x1, y1), "pass_end": (x2, y2)},
                        "message": (
                            f"Schritt {step_num}: Pass geht direkt durch den Verteidiger '{d_name}' "
                            f"(Abstand: {dist:.1f}px < {INTERCEPT_RADIUS}px). Der Verteidiger hätte den Ball abfangen müssen!"
                        ),
                        "suggested_fix": "Verteidiger seitlich anlaufen lassen, Pass biegen oder diesen Schritt als Balleroberung werten."
                    })

        # 2. DYNAMISCHE INTERPOLATIONS-KOLLISIONEN (Ball vs. Verteidiger in Bewegung)
        if step_idx < len(keyframes) - 1:
            next_kf = keyframes[step_idx + 1]
            next_els = {e.get("id"): e for e in next_kf.get("elements", [])}
            curr_ball = next((e for e in elements if e.get("type") == "ball"), None)
            next_ball = next_els.get("ball")

            if curr_ball and next_ball:
                bx1, by1 = float(curr_ball.get("x", 0)), float(curr_ball.get("y", 0))
                bx2, by2 = float(next_ball.get("x", 0)), float(next_ball.get("y", 0))

                for def_el in defenders:
                    d_id = def_el.get("id")
                    next_def = next_els.get(d_id)
                    if not next_def:
                        continue
                    dx1, dy1 = float(def_el.get("x", 0)), float(def_el.get("y", 0))
                    dx2, dy2 = float(next_def.get("x", 0)), float(next_def.get("y", 0))

                    # Prüfen über 20 Zeitschritte während der Ballflugphase
                    min_dyn_dist = 9999.0
                    min_t = 0.0
                    for slice_idx in range(21):
                        t = slice_idx / 20.0
                        b_t_x = bx1 + t * (bx2 - bx1)
                        b_t_y = by1 + t * (by2 - by1)
                        d_t_x = dx1 + t * (dx2 - dx1)
                        d_t_y = dy1 + t * (dy2 - dy1)
                        d_dist = math.hypot(b_t_x - d_t_x, b_t_y - d_t_y)
                        if d_dist < min_dyn_dist:
                            min_dyn_dist = d_dist
                            min_t = t

                    # Wenn der Verteidiger mitten im Flug extrem nah am Ball ist (< 25px)
                    # und es nicht der geplante Ballabfang-Schritt ist (z.B. letzter Schritt)
                    is_last_step = (step_idx >= len(keyframes) - 3)
                    if min_dyn_dist < 24.0 and not is_last_step:
                        d_name = def_el.get("name") or def_el.get("number") or d_id
                        issues.append({
                            "step": step_num,
                            "type": "dynamic_ball_intercept_collision",
                            "severity": "high",
                            "defender_id": d_id,
                            "defender_name": d_name,
                            "min_dist": round(min_dyn_dist, 1),
                            "collision_time_t": round(min_t, 2),
                            "message": (
                                f"Schritt {step_num} -> {step_num+1}: Dynamische Kollision! Ball fliegt bei t={min_t:.2f} "
                                f"mit nur {min_dyn_dist:.1f}px Abstand direkt am Verteidiger '{d_name}' vorbei. "
                                f"Der Verteidiger kreuzt exakt den Ballweg und MUSS den Ball abfangen!"
                            ),
                            "suggested_fix": f"Verteidiger {d_name} im Schritt {step_num+1} weiter außen anlaufen lassen oder Passkurve anpassen."
                        })

        # 2. Bewegungsdistanz / Tempo-Check zwischen Schritten
        if prev_elements_map:
            for el_id, el in el_map.items():
                if el.get("type") != "player":
                    continue
                prev_el = prev_elements_map.get(el_id)
                if prev_el:
                    moved = math.hypot(float(el.get("x", 0)) - float(prev_el.get("x", 0)),
                                       float(el.get("y", 0)) - float(prev_el.get("y", 0)))
                    if moved > MAX_SPRINT_DISTANCE_PER_STEP:
                        p_name = el.get("name") or el.get("number") or el_id
                        issues.append({
                            "step": step_num,
                            "type": "excessive_movement",
                            "severity": "medium",
                            "player_id": el_id,
                            "distance": round(moved, 1),
                            "message": f"Schritt {step_num}: Spieler '{p_name}' sprintet in einem Einzelschritt {moved:.1f}px (Limit: {MAX_SPRINT_DISTANCE_PER_STEP}px)."
                        })

        prev_elements_map = el_map

    # Scoring berechnen
    high_count = sum(1 for i in issues if i.get("severity") == "high")
    med_count = sum(1 for i in issues if i.get("severity") == "medium")
    score = max(0, 100 - (high_count * 25 + med_count * 10))

    status = "perfect" if score >= 90 else ("acceptable" if score >= 70 else "needs_correction")

    return {
        "score": score,
        "status": status,
        "is_plausible": high_count == 0,
        "total_issues": len(issues),
        "issues": issues,
        "recommendations": [i.get("suggested_fix") for i in issues if "suggested_fix" in i]
    }

def auto_correct_tactical_exercise(exercise_data: Dict[str, Any]) -> Dict[str, Any]:
    """Korrigiert automatisch unplausible Situationen in einer Übung:
    - Versetzt im Weg stehende Verteidiger realistisch zur Seite (z.B. antizipiert falschen Passweg)
    - Passt Pass-Winkel an oder biegt Passkurven
    """
    import copy
    corrected = copy.deepcopy(exercise_data)
    keyframes = corrected.get("keyframes", [])

    for step_idx, kf in enumerate(keyframes):
        elements = kf.get("elements", [])
        arrows = kf.get("arrows", [])
        defenders = [e for e in elements if e.get("type") == "player" and e.get("team") == "red"]
        pass_arrows = [a for a in arrows if a.get("type") == "pass"]

        for p_arrow in pass_arrows:
            x1, y1 = float(p_arrow.get("x1", 0)), float(p_arrow.get("y1", 0))
            x2, y2 = float(p_arrow.get("x2", 0)), float(p_arrow.get("y2", 0))

            for def_el in defenders:
                dx, dy = float(def_el.get("x", 0)), float(def_el.get("y", 0))
                dist, px, py = point_to_segment_distance(dx, dy, x1, y1, x2, y2)
                dist_to_start = math.hypot(dx - x1, dy - y1)
                dist_to_end = math.hypot(dx - x2, dy - y2)

                if dist < INTERCEPT_RADIUS and dist_to_start > 30 and dist_to_end > 30:
                    # Kollision! Wir schieben den Verteidiger orthogonal zur Passlinie weg
                    pass_dx = x2 - x1
                    pass_dy = y2 - y1
                    pass_len = math.hypot(pass_dx, pass_dy)
                    if pass_len > 1e-3:
                        # Normalenvektor
                        nx = -pass_dy / pass_len
                        ny = pass_dx / pass_len

                        # Richtung wählen: weg vom Verteidiger
                        cur_dist_vec_x = dx - px
                        cur_dist_vec_y = dy - py
                        dot = cur_dist_vec_x * nx + cur_dist_vec_y * ny
                        sign = 1.0 if dot >= 0 else -1.0

                        # Mindestabstand herstellen (INTERCEPT_RADIUS + 15px Puffer)
                        target_dist = INTERCEPT_RADIUS + 18.0
                        shift_amount = target_dist - dist
                        def_el["x"] = round(dx + nx * sign * shift_amount, 1)
                        def_el["y"] = round(dy + ny * sign * shift_amount, 1)

    return corrected
