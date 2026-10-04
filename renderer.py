import os
import math
import subprocess
import tempfile
import shutil
from typing import List, Dict, Any, Tuple
from PIL import Image, ImageDraw, ImageFont

# Dimensions of rendered tactical field
VIRTUAL_W = 1000
VIRTUAL_H = 700

# Color palette matching Web UI
COLOR_GRASS_1 = "#2d6a4f"
COLOR_GRASS_2 = "#285d45"
COLOR_LINES = "#ffffff"
COLOR_BORDER = "#1b4332"

# System font resolution for razor-sharp typography
TTF_BOLD_CANDIDATES = [
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf",
]
TTF_REG_CANDIDATES = [
    "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/freefont/FreeSans.ttf",
]

_font_cache: Dict[Tuple[int, bool], ImageFont.FreeTypeFont] = {}

def get_font(size: int = 14, bold: bool = True) -> ImageFont.ImageFont:
    """Load cached vector TrueType font at requested scale."""
    key = (size, bold)
    if key in _font_cache:
        return _font_cache[key]
    
    candidates = TTF_BOLD_CANDIDATES if bold else TTF_REG_CANDIDATES
    font = None
    for path in candidates:
        if os.path.exists(path):
            try:
                font = ImageFont.truetype(path, size)
                break
            except Exception:
                pass
    if font is None:
        try:
            font = ImageFont.load_default()
        except Exception:
            font = None
    _font_cache[key] = font
    return font

def hex_to_rgb(hex_str: str) -> Tuple[int, int, int]:
    hex_str = hex_str.lstrip('#')
    if len(hex_str) == 8:
        return tuple(int(hex_str[i:i+2], 16) for i in (0, 2, 4))
    return tuple(int(hex_str[i:i+2], 16) for i in (0, 2, 4))

def draw_arrow(draw: ImageDraw.ImageDraw, start: Tuple[float, float], end: Tuple[float, float], color: str = "#f1c40f", width: int = 4, dashed: bool = False, wavy: bool = False, guide: bool = False, anim_t: float = 0.0):
    x1, y1 = start
    x2, y2 = end
    dx = x2 - x1
    dy = y2 - y1
    dist = math.hypot(dx, dy)
    if dist < 5:
        return

    angle = math.atan2(dy, dx)
    
    # Guide / Hilfslinie (blinking / pulsing animated dashed line)
    if guide:
        # Pulsing brightness/color based on anim_t
        pulse = 0.45 + 0.55 * (0.5 + 0.5 * math.sin(anim_t * math.pi * 3.5))
        r, g, b = hex_to_rgb(color or "#fbbf24")
        pr, pg, pb = int(r * pulse), int(g * pulse), int(b * pulse)
        pulse_color = f"#{pr:02x}{pg:02x}{pb:02x}"
        
        # Moving dashes
        dash_len = 12
        gap_len = 8
        dash_cycle = dash_len + gap_len
        phase = -(anim_t * 35.0) % dash_cycle
        
        curr = -dash_cycle + phase
        while curr < dist:
            c_start = max(0.0, curr)
            c_end = min(dist, curr + dash_len)
            if c_end > c_start:
                t1 = c_start / dist
                t2 = c_end / dist
                p1 = (x1 + dx * t1, y1 + dy * t1)
                p2 = (x1 + dx * t2, y1 + dy * t2)
                draw.line([p1, p2], fill=pulse_color, width=width)
            curr += dash_cycle
            
        # Small circles at endpoints
        r_pt = 4
        draw.ellipse([x1 - r_pt, y1 - r_pt, x1 + r_pt, y1 + r_pt], fill=pulse_color)
        draw.ellipse([x2 - r_pt, y2 - r_pt, x2 + r_pt, y2 + r_pt], fill=pulse_color)
        return

    # Draw path
    if wavy:
        # Dribbling wavy line
        steps = max(2, int(dist / 6))
        points = []
        for i in range(steps + 1):
            t = i / steps
            px = x1 + dx * t
            py = y1 + dy * t
            offset = math.sin(t * math.pi * 6) * 5
            wx = px - math.sin(angle) * offset
            wy = py + math.cos(angle) * offset
            points.append((wx, wy))
        if len(points) >= 2:
            draw.line(points, fill=color, width=width)
    elif dashed:
        # Pass dashed line
        dash_len = 10
        gap_len = 8
        curr = 0
        while curr < dist:
            t1 = curr / dist
            t2 = min(curr + dash_len, dist) / dist
            p1 = (x1 + dx * t1, y1 + dy * t1)
            p2 = (x1 + dx * t2, y1 + dy * t2)
            draw.line([p1, p2], fill=color, width=width)
            curr += dash_len + gap_len
    else:
        # Solid run line
        draw.line([(x1, y1), (x2, y2)], fill=color, width=width)

    # Arrowhead
    arrow_size = 14
    arrow_angle = math.pi / 6
    x_tip = x2
    y_tip = y2
    
    left_x = x_tip - arrow_size * math.cos(angle - arrow_angle)
    left_y = y_tip - arrow_size * math.sin(angle - arrow_angle)
    right_x = x_tip - arrow_size * math.cos(angle + arrow_angle)
    right_y = y_tip - arrow_size * math.sin(angle + arrow_angle)
    
    draw.polygon([(x_tip, y_tip), (left_x, left_y), (right_x, right_y)], fill=color)

def draw_pitch(draw: ImageDraw.ImageDraw, pitch_type: str = "full"):
    # Striped grass background
    stripes = 12
    stripe_w = VIRTUAL_W / stripes
    for i in range(stripes):
        c = COLOR_GRASS_1 if i % 2 == 0 else COLOR_GRASS_2
        draw.rectangle([i * stripe_w, 0, (i + 1) * stripe_w, VIRTUAL_H], fill=c)

    # Pitch without any lines (plain grass field)
    if pitch_type == "plain":
        return

    margin_x = 30
    margin_y = 25
    w = VIRTUAL_W - 2 * margin_x
    h = VIRTUAL_H - 2 * margin_y

    line_w = 4
    # Pitch boundary
    draw.rectangle([margin_x, margin_y, margin_x + w, margin_y + h], outline=COLOR_LINES, width=line_w)

    if pitch_type == "full":
        # Center line
        mid_x = margin_x + w / 2
        draw.line([(mid_x, margin_y), (mid_x, margin_y + h)], fill=COLOR_LINES, width=line_w)
        # Center circle
        radius = 75
        draw.ellipse([mid_x - radius, margin_y + h / 2 - radius, mid_x + radius, margin_y + h / 2 + radius], outline=COLOR_LINES, width=line_w)
        draw.ellipse([mid_x - 4, margin_y + h / 2 - 4, mid_x + 4, margin_y + h / 2 + 4], fill=COLOR_LINES)

        # Left penalty area
        pen_w = 140
        pen_h = 280
        pen_y = margin_y + (h - pen_h) / 2
        draw.rectangle([margin_x, pen_y, margin_x + pen_w, pen_y + pen_h], outline=COLOR_LINES, width=line_w)
        # Left goal area
        g_w = 50
        g_h = 130
        g_y = margin_y + (h - g_h) / 2
        draw.rectangle([margin_x, g_y, margin_x + g_w, g_y + g_h], outline=COLOR_LINES, width=line_w)
        # Left goal (fine net structure)
        draw.rectangle([margin_x - 22, g_y + 20, margin_x, g_y + g_h - 20], outline=COLOR_LINES, width=3, fill="#ffffff22")
        for gx in range(int(margin_x - 22 + 6), int(margin_x), 6):
            draw.line([(gx, g_y + 20), (gx, g_y + g_h - 20)], fill="#ffffff44", width=1)
        for gy in range(int(g_y + 20 + 8), int(g_y + g_h - 20), 8):
            draw.line([(margin_x - 22, gy), (margin_x, gy)], fill="#ffffff44", width=1)

        # Right penalty area
        draw.rectangle([margin_x + w - pen_w, pen_y, margin_x + w, pen_y + pen_h], outline=COLOR_LINES, width=line_w)
        # Right goal area
        draw.rectangle([margin_x + w - g_w, g_y, margin_x + w, g_y + g_h], outline=COLOR_LINES, width=line_w)
        # Right goal (fine net structure)
        draw.rectangle([margin_x + w, g_y + 20, margin_x + w + 22, g_y + g_h - 20], outline=COLOR_LINES, width=3, fill="#ffffff22")
        for gx in range(int(margin_x + w + 6), int(margin_x + w + 22), 6):
            draw.line([(gx, g_y + 20), (gx, g_y + g_h - 20)], fill="#ffffff44", width=1)
        for gy in range(int(g_y + 20 + 8), int(g_y + g_h - 20), 8):
            draw.line([(margin_x + w, gy), (margin_x + w + 22, gy)], fill="#ffffff44", width=1)

    elif pitch_type == "half":
        # Half pitch: right edge is midfield line
        mid_x = margin_x + w
        draw.line([(mid_x, margin_y), (mid_x, margin_y + h)], fill=COLOR_LINES, width=line_w)
        # Penalty area on left
        pen_w = 220
        pen_h = 360
        pen_y = margin_y + (h - pen_h) / 2
        draw.rectangle([margin_x, pen_y, margin_x + pen_w, pen_y + pen_h], outline=COLOR_LINES, width=line_w)
        # Goal area
        g_w = 80
        g_h = 180
        g_y = margin_y + (h - g_h) / 2
        draw.rectangle([margin_x, g_y, margin_x + g_w, g_y + g_h], outline=COLOR_LINES, width=line_w)
        # Large goal with net structure
        draw.rectangle([margin_x - 25, g_y + 25, margin_x, g_y + g_h - 25], outline=COLOR_LINES, width=3, fill="#ffffff22")
        for gx in range(int(margin_x - 25 + 6), int(margin_x), 6):
            draw.line([(gx, g_y + 25), (gx, g_y + g_h - 25)], fill="#ffffff44", width=1)
        for gy in range(int(g_y + 25 + 10), int(g_y + g_h - 25), 10):
            draw.line([(margin_x - 25, gy), (margin_x, gy)], fill="#ffffff44", width=1)
        # Center circle arc at right edge
        draw.arc([mid_x - 120, margin_y + h / 2 - 120, mid_x + 120, margin_y + h / 2 + 120], 90, 270, fill=COLOR_LINES, width=line_w)

    elif pitch_type == "funino":
        # Funino field with 4 minigoals
        mid_x = margin_x + w / 2
        draw.line([(mid_x, margin_y), (mid_x, margin_y + h)], fill=COLOR_LINES, width=line_w)
        # Dashed shooting lines
        zone_offset = 120
        for x_pos in [margin_x + zone_offset, margin_x + w - zone_offset]:
            curr_y = margin_y
            while curr_y < margin_y + h:
                draw.line([(x_pos, curr_y), (x_pos, min(curr_y + 8, margin_y + h))], fill="#ffffff88", width=2)
                curr_y += 16

        # 4 Mini goals (2 on left, 2 on right)
        goal_w = 15
        goal_h = 50
        # Left top & bottom minigoals
        draw.rectangle([margin_x - goal_w, margin_y + 60, margin_x, margin_y + 60 + goal_h], outline="#e74c3c", width=2, fill="#e74c3c44")
        draw.rectangle([margin_x - goal_w, margin_y + h - 60 - goal_h, margin_x, margin_y + h - 60], outline="#e74c3c", width=2, fill="#e74c3c44")
        # Right top & bottom minigoals
        draw.rectangle([margin_x + w, margin_y + 60, margin_x + w + goal_w, margin_y + 60 + goal_h], outline="#3498db", width=2, fill="#3498db44")
        draw.rectangle([margin_x + w, margin_y + h - 60 - goal_h, margin_x + w + goal_w, margin_y + h - 60], outline="#3498db", width=2, fill="#3498db44")

    elif pitch_type == "rondo":
        # Square practice grid inside pitch
        grid_margin_x = margin_x + 100
        grid_margin_y = margin_y + 50
        gw = w - 200
        gh = h - 100
        draw.rectangle([grid_margin_x, grid_margin_y, grid_margin_x + gw, grid_margin_y + gh], outline="#facc15", width=3)
        # Inner grid cross
        draw.line([(grid_margin_x + gw / 2, grid_margin_y), (grid_margin_x + gw / 2, grid_margin_y + gh)], fill="#facc1566", width=2)
        draw.line([(grid_margin_x, grid_margin_y + gh / 2), (grid_margin_x + gw, grid_margin_y + gh / 2)], fill="#facc1566", width=2)

def draw_element(draw: ImageDraw.ImageDraw, el: Dict[str, Any], scale: float = 1.0, field_rotation: int = 0):
    x = el.get("x", 0)
    y = el.get("y", 0)
    el_type = el.get("type", "player")
    rot = float(el.get("rotation", 0))

    # Net rotation for element's sub-image:
    # In HTML canvas, ctx.rotate(fieldRotation) is applied globally to the pitch,
    # then for each element, ctx.rotate(-fieldRotation) and ctx.rotate(el.rotation) are applied.
    # In renderer.py, the final image is transposed at the end:
    # - If field_rotation == 270: final_rgb is rotated 90° clockwise (ROTATE_90).
    # - If field_rotation == 90: final_rgb is rotated 270° clockwise (ROTATE_270).
    # - If field_rotation == 180: final_rgb is rotated 180°.
    # A clockwise transpose by T degrees rotates everything on the canvas by +T.
    # To keep an element oriented upright (or at el.rotation) on the final viewer screen,
    # the element on the unrotated canvas must be rotated by -T = -(-field_rotation) = +field_rotation?
    # NO: if final transpose rotates by +90 (for 270° field_rotation), any unrotated text (at 0°)
    # gets rotated by +90° (turned sideways).
    # To compensate, the element must be pre-rotated by -90° (i.e. +270°)!
    # Previously, adding field_rotation resulted in 180° inversion (upside down).
    # The correct pre-rotation so that the element ends up upright after transpose is:
    # effective_rot = (rot - (field_rotation or 0)) % 360
    effective_rot = (rot - (field_rotation or 0)) % 360

    # Dedicated transparent sub-surface rendering for equipment AND players
    # When rot != 0 or player needs local rotation, render to sub-surface
    if el_type in ["player", "ball", "ladder", "goal_5m", "minigoal", "pole", "cone", "dummy", "ring", "hurdle"]:
        size = int(160 * max(1.0, scale))
        sub_img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        sub_draw = ImageDraw.Draw(sub_img)
        el_centered = dict(el)
        el_centered["x"] = size / 2
        el_centered["y"] = size / 2
        el_centered["rotation"] = 0
        
        # Render centered without rotation/scaling
        _draw_element_direct(sub_draw, el_centered, scale=1.0)
        
        if scale != 1.0:
            new_w = max(4, int(size * scale))
            new_h = max(4, int(size * scale))
            sub_img = sub_img.resize((new_w, new_h), resample=Image.Resampling.LANCZOS)
            size = new_w
            
        if effective_rot != 0:
            sub_img = sub_img.rotate(-effective_rot, resample=Image.Resampling.BICUBIC)
            
        # Paste centered at (x, y)
        px = int(x - size / 2)
        py = int(y - size / 2)
        draw._image.paste(sub_img, (px, py), sub_img)
        return

    _draw_element_direct(draw, el, scale=scale)

def _draw_element_direct(draw: ImageDraw.ImageDraw, el: Dict[str, Any], scale: float = 1.0):
    x = el.get("x", 0)
    y = el.get("y", 0)
    el_type = el.get("type", "player")

    if el_type == "player":
        team = el.get("team", "blue")
        num = str(el.get("number", "1"))
        radius = int(18 * scale)
        is_focused = bool(el.get("focus", False))

        # Focus / Spotlight Highlighting (Aura + gold ring + badge)
        if is_focused:
            aura_r = int(radius * 2.4)
            # Soft yellow halo
            draw.ellipse([x - aura_r, y - aura_r, x + aura_r, y + aura_r], fill="#facc1533", outline=None)
            # Accent dashed-style ring
            draw.ellipse([x - radius - 5, y - radius - 5, x + radius + 5, y + radius + 5], outline="#facc15", width=max(2, int(3 * scale)))
            # Star badge
            badge_r = int(4 * scale)
            draw.ellipse([x + radius - 2, y - radius + 2, x + radius + badge_r * 2 - 2, y - radius + badge_r * 2 + 2], fill="#facc15", outline="#000000", width=1)
        
        # Team color scheme
        if team == "blue":
            fill_c = "#2563eb"
            border_c = "#ffffff"
            text_color = "#ffffff"
        elif team == "red":
            fill_c = "#dc2626"
            border_c = "#ffffff"
            text_color = "#ffffff"
        elif team == "yellow":
            fill_c = "#eab308"
            border_c = "#000000"
            text_color = "#000000"
        elif team == "green":
            fill_c = "#16a34a"
            border_c = "#ffffff"
            text_color = "#ffffff"
        else:
            fill_c = "#475569"
            border_c = "#ffffff"
            text_color = "#ffffff"

        # Shadow
        draw.ellipse([x - radius + 2, y - radius + 3, x + radius + 2, y + radius + 3], fill="#00000044")
        # Body circle
        border_w = max(2, int(2.5 * scale))
        draw.ellipse([x - radius, y - radius, x + radius, y + radius], fill=fill_c, outline=border_c, width=border_w)
        
        # TrueType Vector Font for Jersey Number
        font_size = max(9, int(13 * scale))
        font = get_font(font_size, bold=True)
        
        text_bbox = draw.textbbox((0, 0), num, font=font)
        tw = text_bbox[2] - text_bbox[0]
        th = text_bbox[3] - text_bbox[1]
        
        # Exact optical center
        draw.text((x - tw / 2 - text_bbox[0], y - th / 2 - text_bbox[1]), num, fill=text_color, font=font)

        # Name label underneath player if provided
        name = el.get("name")
        if name:
            name_font = get_font(max(8, int(10 * scale)), bold=False)
            n_bbox = draw.textbbox((0, 0), name, font=name_font)
            nw = n_bbox[2] - n_bbox[0]
            nh = n_bbox[3] - n_bbox[1]
            pad_x = 4
            pad_y = 2
            box_y = y + radius + 3
            draw.rectangle([x - nw/2 - pad_x, box_y, x + nw/2 + pad_x, box_y + nh + pad_y * 2], fill="#000000cc", outline=None)
            draw.text((x - nw / 2 - n_bbox[0], box_y + pad_y - n_bbox[1]), name, fill="#ffffff", font=name_font)

    elif el_type == "ball":
        radius = int(10 * scale)
        draw.ellipse([x - radius + 2, y - radius + 2, x + radius + 2, y + radius + 2], fill="#00000044")
        draw.ellipse([x - radius, y - radius, x + radius, y + radius], fill="#ffffff", outline="#111827", width=max(1, int(2 * scale)))
        # Inner soccer pattern pentagon
        p_size = int(5 * scale)
        draw.polygon([
            (x, y - p_size),
            (x + p_size, y - int(2 * scale)),
            (x + int(3 * scale), y + int(4 * scale)),
            (x - int(3 * scale), y + int(4 * scale)),
            (x - p_size, y - int(2 * scale))
        ], fill="#111827")

    elif el_type == "cone":
        # Practice cone (orange cone)
        size = 14
        draw.polygon([
            (x, y - size),
            (x + size, y + size),
            (x - size, y + size)
        ], fill="#f97316", outline="#ffffff", width=2)

    elif el_type == "pole":
        # Slalom pole
        draw.rectangle([x - 3, y - 24, x + 3, y + 8], fill="#eab308", outline="#000000", width=1)
        draw.ellipse([x - 6, y + 6, x + 6, y + 12], fill="#000000")

    elif el_type == "minigoal":
        # Refined minigoal: semi-transparent net pattern with crisp white posts
        gw = 36
        gh = 22
        # Net fill
        draw.rectangle([x - gw/2, y - gh/2, x + gw/2, y + gh/2], fill="#ffffff33", outline="#ffffff", width=3)
        # Net cross lines
        for net_x in [x - 6, x + 6]:
            draw.line([(net_x, y - gh/2), (net_x, y + gh/2)], fill="#ffffff55", width=1)
        draw.line([(x - gw/2, y), (x + gw/2, y)], fill="#ffffff55", width=1)

    elif el_type == "goal_5m":
        # 5m x 2m Jugendtor (E-Jugend / Kleinfeldtor)
        gw = 70
        gh = 30
        draw.rectangle([x - gw/2, y - gh/2, x + gw/2, y + gh/2], fill="#ffffff26", outline="#ffffff", width=4)
        # Net grid lines
        for gx in range(int(x - gw/2 + 10), int(x + gw/2), 10):
            draw.line([(gx, y - gh/2), (gx, y + gh/2)], fill="#ffffff55", width=1)
        for gy in range(int(y - gh/2 + 10), int(y + gh/2), 10):
            draw.line([(x - gw/2, gy), (x + gw/2, gy)], fill="#ffffff55", width=1)
        # Post markings
        draw.rectangle([x - gw/2 - 3, y - gh/2 - 3, x - gw/2 + 3, y - gh/2 + 3], fill="#ffffff")
        draw.rectangle([x + gw/2 - 3, y - gh/2 - 3, x + gw/2 + 3, y - gh/2 + 3], fill="#ffffff")
        # Text label
        lbl_font = get_font(9, bold=True)
        lbl_bbox = draw.textbbox((0, 0), "5m Tor", font=lbl_font)
        lw = lbl_bbox[2] - lbl_bbox[0]
        lh = lbl_bbox[3] - lbl_bbox[1]
        draw.text((x - lw / 2 - lbl_bbox[0], y - lh / 2 - lbl_bbox[1]), "5m Tor", fill="#ffffffd9", font=lbl_font)

    elif el_type == "ladder":
        # Coordination ladder
        lw = 80
        lh = 20
        draw.rectangle([x - lw/2, y - lh/2, x + lw/2, y + lh/2], outline="#facc15", width=2)
        rungs = 5
        step = lw / rungs
        for i in range(1, rungs):
            rx = x - lw/2 + i * step
            draw.line([(rx, y - lh/2), (rx, y + lh/2)], fill="#facc15", width=2)

    elif el_type == "dummy":
        # Freistoß-Dummy / Trainingsfigur
        draw.ellipse([x - 14, y + 11, x + 14, y + 21], fill="#00000066")
        draw.rounded_rectangle([x - 12, y - 10, x + 12, y + 14], radius=4, fill="#eab308", outline="#000000", width=2)
        draw.ellipse([x - 7, y - 23, x + 7, y - 9], fill="#eab308", outline="#000000", width=2)
        draw.line([(x - 8, y - 4), (x + 8, y - 4)], fill="#000000aa", width=1)
        draw.line([(x - 8, y + 2), (x + 8, y + 2)], fill="#000000aa", width=1)
        draw.line([(x - 6, y + 8), (x + 6, y + 8)], fill="#000000aa", width=1)

    elif el_type == "ring":
        # Koordinationsring
        rw = 16
        draw.ellipse([x - rw, y - rw, x + rw, y + rw], fill="#06b6d422", outline="#06b6d4", width=3)

    elif el_type == "hurdle":
        # Agility-Hürde
        hw = 20
        hh = 3
        draw.rectangle([x - hw - 2, y - 6, x - hw + 3, y + 6], fill="#1e293b")
        draw.rectangle([x + hw - 3, y - 6, x + hw + 2, y + 6], fill="#1e293b")
        draw.rectangle([x - hw, y - hh, x + hw, y + hh], fill="#f97316", outline="#ffffff", width=1)
        draw.rectangle([x - 8, y - hh, x - 4, y + hh], fill="#ffffff")
        draw.rectangle([x + 4, y - hh, x + 8, y + hh], fill="#ffffff")

def interpolate_elements(el_start: Dict[str, Any], el_end: Dict[str, Any], t: float) -> Dict[str, Any]:
    res = dict(el_start)
    
    # Check if a curved trajectory (Cubic Bezier) is defined on el_end
    if any(k in el_end for k in ("cp1_dx", "cp1_dy", "cp2_dx", "cp2_dy")):
        x0, y0 = el_start.get("x", 0), el_start.get("y", 0)
        x3, y3 = el_end.get("x", 0), el_end.get("y", 0)
        dx = x3 - x0
        dy = y3 - y0
        
        x1 = x0 + dx * (1.0 / 3.0) + el_end.get("cp1_dx", 0)
        y1 = y0 + dy * (1.0 / 3.0) + el_end.get("cp1_dy", 0)
        x2 = x0 + dx * (2.0 / 3.0) + el_end.get("cp2_dx", 0)
        y2 = y0 + dy * (2.0 / 3.0) + el_end.get("cp2_dy", 0)
        
        u = 1.0 - t
        tt = t * t
        uu = u * u
        uuu = uu * u
        ttt = tt * t
        
        res["x"] = uuu * x0 + 3.0 * uu * t * x1 + 3.0 * u * tt * x2 + ttt * x3
        res["y"] = uuu * y0 + 3.0 * uu * t * y1 + 3.0 * u * tt * y2 + ttt * y3
    else:
        res["x"] = el_start.get("x", 0) + (el_end.get("x", 0) - el_start.get("x", 0)) * t
        res["y"] = el_start.get("y", 0) + (el_end.get("y", 0) - el_start.get("y", 0)) * t

    # Check if jumping is enabled on el_end
    if el_end.get("jump"):
        import math
        # Sinusoidal jump curve: scale up by up to +45% at midpoint
        jump_mult = 1.0 + math.sin(t * math.pi) * 0.45
        res["scale_multiplier"] = jump_mult
    else:
        res["scale_multiplier"] = 1.0

    return res

def render_frame(pitch_type: str, elements: List[Dict[str, Any]], arrows: List[Dict[str, Any]] = None, step_title: str = "", element_scale: float = 1.0, field_rotation: int = 0, anim_t: float = 0.0) -> Image.Image:
    """
    Renders a crystal-clear tactical board frame.
    Supports native orientation matching (e.g. 700x1000 for 90°/270° without letterboxing).
    """
    rot = (field_rotation or 0) % 360
    
    # 1. Base canvas in virtual 1000x700 coordinates
    img = Image.new("RGBA", (VIRTUAL_W, VIRTUAL_H), COLOR_BORDER)
    draw = ImageDraw.Draw(img)

    # 1. Pitch
    draw_pitch(draw, pitch_type)

    # 2. Arrows / tactical routes
    if arrows:
        for arrow in arrows:
            s = (arrow.get("x1", 0), arrow.get("y1", 0))
            e = (arrow.get("x2", 0), arrow.get("y2", 0))
            a_type = arrow.get("type", "pass")
            color = arrow.get("color", "#facc15")
            dashed = (a_type == "pass")
            wavy = (a_type == "dribble")
            guide = (a_type == "guide")
            draw_arrow(draw, s, e, color=color, width=4, dashed=dashed, wavy=wavy, guide=guide, anim_t=anim_t)

    # 3. Static & moving elements (players, cones, balls)
    order_map = {"cone": 1, "pole": 1, "ladder": 1, "ring": 1, "hurdle": 1, "dummy": 1, "minigoal": 2, "goal_5m": 2, "player": 3, "ball": 4}
    sorted_elements = sorted(elements, key=lambda it: order_map.get(it.get("type"), 2))
    
    for el in sorted_elements:
        eff_scale = element_scale * el.get("scale_multiplier", 1.0)
        draw_element(draw, el, scale=eff_scale, field_rotation=rot)

    # Convert to RGB
    final_rgb = Image.new("RGB", img.size, COLOR_BORDER)
    final_rgb.paste(img, mask=img.split()[3])

    # 4. Native Aspect-Ratio Rotation (matching HTML screen orientation)
    if rot != 0:
        if rot == 90:
            final_rgb = final_rgb.transpose(Image.Transpose.ROTATE_270)
        elif rot == 180:
            final_rgb = final_rgb.transpose(Image.Transpose.ROTATE_180)
        elif rot == 270:
            final_rgb = final_rgb.transpose(Image.Transpose.ROTATE_90)
        else:
            final_rgb = final_rgb.rotate(-rot, expand=True, resample=Image.Resampling.BICUBIC)

    return final_rgb

def render_exercise_video(keyframes: List[Dict[str, Any]], pitch_type: str = "half", output_mp4: str = None, output_gif: str = None, fps: int = 60, duration_per_step: float = 2.0, element_scale: float = 1.0, field_rotation: int = 0) -> Tuple[str, str]:
    """
    Renders high-framerate (60 FPS default) video with native aspect ratio and lossless compression.
    """
    if not keyframes:
        raise ValueError("No keyframes provided for animation.")

    temp_dir = tempfile.mkdtemp(prefix="tactics_render_")
    frame_idx = 0

    try:
        frames_per_step = max(2, int(fps * duration_per_step))

        for k_idx in range(len(keyframes)):
            curr_kf = keyframes[k_idx]
            curr_elements = {el.get("id", str(i)): el for i, el in enumerate(curr_kf.get("elements", []))}
            curr_arrows = curr_kf.get("arrows", [])

            if k_idx == len(keyframes) - 1:
                # Last keyframe: hold still for 1.5 seconds
                hold_frames = int(fps * 1.5)
                for _ in range(hold_frames):
                    curr_time = frame_idx / float(fps)
                    last_img = render_frame(pitch_type, list(curr_elements.values()), curr_arrows, step_title="", element_scale=element_scale, field_rotation=field_rotation, anim_t=curr_time)
                    frame_path = os.path.join(temp_dir, f"frame_{frame_idx:05d}.png")
                    last_img.save(frame_path)
                    frame_idx += 1
            else:
                next_kf = keyframes[k_idx + 1]
                next_elements = {el.get("id", str(i)): el for i, el in enumerate(next_kf.get("elements", []))}

                for f in range(frames_per_step):
                    t = f / float(frames_per_step)
                    # Smooth ease-in-out curve
                    smooth_t = 0.5 - 0.5 * math.cos(math.pi * t)

                    interpolated = []
                    all_ids = set(curr_elements.keys()).union(set(next_elements.keys()))
                    for el_id in all_ids:
                        el1 = curr_elements.get(el_id)
                        el2 = next_elements.get(el_id)
                        if el1 and el2:
                            interpolated.append(interpolate_elements(el1, el2, smooth_t))
                        elif el1:
                            interpolated.append(el1)
                        elif el2 and t > 0.5:
                            interpolated.append(el2)

                    curr_time = frame_idx / float(fps)
                    img = render_frame(pitch_type, interpolated, curr_arrows, step_title="", element_scale=element_scale, field_rotation=field_rotation, anim_t=curr_time)
                    frame_path = os.path.join(temp_dir, f"frame_{frame_idx:05d}.png")
                    img.save(frame_path)
                    frame_idx += 1

        # Render MP4 via ffmpeg (60 FPS, CRF 18 visually lossless, faststart for instant streaming)
        if not output_mp4:
            output_mp4 = tempfile.mktemp(suffix=".mp4", dir="/root/.hermes/tactics/media")
        
        ffmpeg_cmd = [
            "ffmpeg", "-y",
            "-framerate", str(fps),
            "-i", os.path.join(temp_dir, "frame_%05d.png"),
            "-c:v", "libx264",
            "-profile:v", "high",
            "-pix_fmt", "yuv420p",
            "-movflags", "+faststart",
            "-crf", "18",
            "-preset", "faster",
            output_mp4
        ]
        subprocess.run(ffmpeg_cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

        # Render GIF via ffmpeg with lanczos scaling and high dynamic palette
        if not output_gif:
            output_gif = output_mp4.replace(".mp4", ".gif")

        palette_path = os.path.join(temp_dir, "palette.png")
        # For portrait vs landscape, scale gracefully to max 600px width
        subprocess.run([
            "ffmpeg", "-y", "-i", output_mp4,
            "-vf", "fps=20,scale=min(600\\,iw):-1:flags=lanczos,palettegen=stats_mode=diff",
            palette_path
        ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

        subprocess.run([
            "ffmpeg", "-y", "-i", output_mp4, "-i", palette_path,
            "-filter_complex", "fps=20,scale=min(600\\,iw):-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3",
            output_gif
        ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

        return output_mp4, output_gif

    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)

if __name__ == "__main__":
    # Test sample animation with 270 field rotation
    test_kf = [
        {
            "title": "Phase 1: Pass & Start",
            "elements": [
                {"id": "p1", "type": "player", "number": "4", "team": "blue", "x": 150, "y": 350, "focus": True},
                {"id": "p2", "type": "player", "number": "8", "team": "blue", "x": 450, "y": 200},
                {"id": "d1", "type": "player", "number": "3", "team": "red", "x": 380, "y": 350},
                {"id": "b1", "type": "ball", "x": 175, "y": 350},
                {"id": "c1", "type": "cone", "x": 300, "y": 150},
                {"id": "c2", "type": "minigoal", "x": 300, "y": 550}
            ],
            "arrows": [
                {"type": "pass", "x1": 175, "y1": 350, "x2": 440, "y2": 210, "color": "#facc15"}
            ]
        },
        {
            "title": "Phase 2: Annahme & Dribbling",
            "elements": [
                {"id": "p1", "type": "player", "number": "4", "team": "blue", "x": 300, "y": 350},
                {"id": "p2", "type": "player", "number": "8", "team": "blue", "x": 650, "y": 250, "focus": True},
                {"id": "d1", "type": "player", "number": "3", "team": "red", "x": 500, "y": 300},
                {"id": "b1", "type": "ball", "x": 665, "y": 255},
                {"id": "c1", "type": "cone", "x": 300, "y": 150},
                {"id": "c2", "type": "minigoal", "x": 300, "y": 550}
            ],
            "arrows": [
                {"type": "dribble", "x1": 450, "y1": 200, "x2": 650, "y2": 250, "color": "#38bdf8"}
            ]
        }
    ]

    os.makedirs("/root/.hermes/tactics/media", exist_ok=True)
    mp4, gif = render_exercise_video(test_kf, pitch_type="half", output_mp4="/root/.hermes/tactics/media/test_run.mp4", field_rotation=270, fps=60)
    print(f"Rendered video successfully:\nMP4: {mp4} ({os.path.getsize(mp4)} bytes)\nGIF: {gif} ({os.path.getsize(gif)} bytes)")
