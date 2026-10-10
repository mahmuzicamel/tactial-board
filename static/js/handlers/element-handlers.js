// static/js/handlers/element-handlers.js
// Extrahiert aus app.js (verhaltenserhaltend, byte-identische Funktionskörper).
// Handler bleiben an window.* gebunden, damit die onclick="..."-Bindings in index.html funktionieren.
const TC = () => window.TacticalCoach;
const S = () => window.TacticalCoach?.state;


  function getForwardOffset(distance = 45) {
    const s = S();
    const rad = ((s.fieldRotation || 0) * Math.PI) / 180;
    const dx = -distance * Math.sin(rad);
    const dy = -distance * Math.cos(rad);
    return { dx: Math.round(dx), dy: Math.round(dy) };
  }

  function hexToRgba(hex, alpha = 0.2) {
    if (!hex) return `rgba(56, 189, 248, ${alpha})`;
    let c = hex.replace("#", "");
    if (c.length === 3) c = c.split("").map(x => x + x).join("");
    const num = parseInt(c, 16);
    if (isNaN(num)) return `rgba(56, 189, 248, ${alpha})`;
    const r = (num >> 16) & 255;
    const g = (num >> 8) & 255;
    const b = num & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function syncEquipmentElementAcrossAllKeyframes(element) {
    if (!element || !TC().constants.isEquipment(element.type)) return;
    const ex = S().currentExercise;
    if (!ex || !Array.isArray(ex.keyframes)) return;
    ex.keyframes.forEach(otherKf => {
      const match = (otherKf.elements || []).find(it => it.id === element.id);
      if (match) {
        match.x = element.x;
        match.y = element.y;
        if (element.rotation !== undefined) match.rotation = element.rotation;
        if (element.scale !== undefined) match.scale = element.scale;
        if (element.width !== undefined) match.width = element.width;
        if (element.height !== undefined) match.height = element.height;
        if (element.radius !== undefined) match.radius = element.radius;
        if (element.size !== undefined) match.size = element.size;
        if (element.color !== undefined) match.color = element.color;
        if (element.fillColor !== undefined) match.fillColor = element.fillColor;
      }
    });
  }

  window.spawnElement = function (type, options = {}) {
    const s = S();
    const kf = TC().getCurrentKeyframe();
    let x = 500, y = 350;
    if (s.selectedElementId) {
      const prevEl = kf.elements.find(it => it.id === s.selectedElementId);
      if (prevEl) {
        const offset = getForwardOffset(45);
        x = Math.max(30, Math.min(970, (prevEl.x || 500) + offset.dx));
        y = Math.max(30, Math.min(670, (prevEl.y || 350) + offset.dy));
      }
    } else if (type === "player") {
      const existing = kf.elements.filter(e => e.type === "player" && e.team === (options.team || "blue"));
      x = 350 + (existing.length % 5) * 60;
      y = 200 + Math.floor(existing.length / 5) * 70;
    } else if (type === "ball") {
      x = 500; y = 350;
    }
    const newEl = {
      id: "el_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
      type,
      x: Math.round(x),
      y: Math.round(y),
      rotation: 0,
      ...options
    };
    if (type === "player" && !newEl.number) {
      const sameTeam = kf.elements.filter(e => e.type === "player" && e.team === newEl.team);
      newEl.number = (sameTeam.length + 1).toString();
    }
    kf.elements.push(newEl);
    s.selectedElementId = newEl.id;
    s.selectedElementIds = [];
    s.selectedArrowIndex = null;

    // Elements (Player, Ball, Equipment) propagate automatically to ALL keyframes in the exercise!
    // So the trainer never loses newly added players/balls in other steps.
    if (s.currentExercise && Array.isArray(s.currentExercise.keyframes)) {
      s.currentExercise.keyframes.forEach((otherKf, idx) => {
        if (idx !== s.currentKeyframeIndex) {
          if (!otherKf.elements) otherKf.elements = [];
          const exists = otherKf.elements.some(it => it.id === newEl.id);
          if (!exists) {
            otherKf.elements.push(JSON.parse(JSON.stringify(newEl)));
          }
        }
      });
    }

    TC().inspectors.showInspector(newEl);
    window.drawScene();
    window.updateActionPopupPosition();
    window.recordHistory();
  };

  window.duplicateSelectedElement = function () {
    const s = S();
    const kf = TC().getCurrentKeyframe();
    if (!kf) return;
    const offset = getForwardOffset(45);
    if (s.selectedElementIds.length > 0) {
      const newIds = [];
      kf.elements.forEach(el => {
        if (s.selectedElementIds.includes(el.id)) {
          const clone = JSON.parse(JSON.stringify(el));
          clone.id = "el_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
          clone.x = Math.max(30, Math.min(970, clone.x + offset.dx));
          clone.y = Math.max(30, Math.min(670, clone.y + offset.dy));
          kf.elements.push(clone);
          newIds.push(clone.id);

          // Propagate cloned element to all other keyframes
          if (s.currentExercise && Array.isArray(s.currentExercise.keyframes)) {
            s.currentExercise.keyframes.forEach((otherKf, oIdx) => {
              if (oIdx !== s.currentKeyframeIndex) {
                if (!otherKf.elements) otherKf.elements = [];
                otherKf.elements.push(JSON.parse(JSON.stringify(clone)));
              }
            });
          }
        }
      });
      s.selectedElementIds = newIds;
      TC().inspectors.showGroupInspector(newIds.length);
      window.drawScene();
      window.updateActionPopupPosition();
      window.recordHistory();
      return;
    }
    if (s.selectedElementId) {
      const el = kf.elements.find(it => it.id === s.selectedElementId);
      if (el) {
        const clone = JSON.parse(JSON.stringify(el));
        clone.id = "el_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
        clone.x = Math.max(30, Math.min(970, clone.x + offset.dx));
        clone.y = Math.max(30, Math.min(670, clone.y + offset.dy));
        if (clone.type === "player" && clone.number) {
          const num = parseInt(clone.number, 10);
          if (!isNaN(num)) clone.number = (num + 1).toString();
        }
        kf.elements.push(clone);
        s.selectedElementId = clone.id;

        // Propagate cloned element to all other keyframes
        if (s.currentExercise && Array.isArray(s.currentExercise.keyframes)) {
          s.currentExercise.keyframes.forEach((otherKf, oIdx) => {
            if (oIdx !== s.currentKeyframeIndex) {
              if (!otherKf.elements) otherKf.elements = [];
              otherKf.elements.push(JSON.parse(JSON.stringify(clone)));
            }
          });
        }

        TC().inspectors.showInspector(clone);
        window.drawScene();
        window.updateActionPopupPosition();
        window.recordHistory();
      }
    }
  };

  window.deleteSelectedElement = function () {
    const s = S();
    const kf = TC().getCurrentKeyframe();
    if (!kf) return;
    if (s.selectedElementIds.length > 0) {
      const idsToDelete = [...s.selectedElementIds];
      kf.elements = kf.elements.filter(el => !idsToDelete.includes(el.id));
      if (s.currentExercise && Array.isArray(s.currentExercise.keyframes)) {
        s.currentExercise.keyframes.forEach(otherKf => {
          otherKf.elements = otherKf.elements.filter(el => !(idsToDelete.includes(el.id) && TC().constants.isEquipment(el.type)));
        });
      }
      s.selectedElementIds = [];
      s.selectedElementId = null;
    } else if (s.selectedElementId) {
      const idToDelete = s.selectedElementId;
      const elToDelete = kf.elements.find(el => el.id === idToDelete);
      kf.elements = kf.elements.filter(el => el.id !== idToDelete);
      if (elToDelete && TC().constants.isEquipment(elToDelete.type) && s.currentExercise && Array.isArray(s.currentExercise.keyframes)) {
        s.currentExercise.keyframes.forEach(otherKf => {
          otherKf.elements = otherKf.elements.filter(el => el.id !== idToDelete);
        });
      }
      s.selectedElementId = null;
    } else if (s.selectedArrowIndex !== null) {
      kf.arrows.splice(s.selectedArrowIndex, 1);
      s.selectedArrowIndex = null;
      s.selectedArrowPart = null;
    }
    TC().inspectors.hideInspector();
    window.drawScene();
    window.updateActionPopupPosition();
    window.recordHistory();
  };

  window.rotateSelectedElement = function (deltaDeg = 45) {
    const s = S();
    const kf = TC().getCurrentKeyframe();
    if (!kf) return;
    if (s.selectedElementIds.length > 0) {
      kf.elements.forEach(it => {
        if (s.selectedElementIds.includes(it.id)) {
          it.rotation = ((it.rotation || 0) + deltaDeg + 360) % 360;
          syncEquipmentElementAcrossAllKeyframes(it);
        }
      });
    } else if (s.selectedElementId) {
      const el = kf.elements.find(it => it.id === s.selectedElementId);
      if (el) {
        el.rotation = ((el.rotation || 0) + deltaDeg + 360) % 360;
        syncEquipmentElementAcrossAllKeyframes(el);
      }
    }
    window.drawScene();
    window.recordHistory();
  };

  window.scaleSelectedElement = function (delta = 0.15) {
    const s = S();
    const kf = TC().getCurrentKeyframe();
    if (!kf) return;
    const factor = 1 + delta;
    const items = s.selectedElementIds.length > 0
      ? kf.elements.filter(it => s.selectedElementIds.includes(it.id))
      : (s.selectedElementId ? [kf.elements.find(it => it.id === s.selectedElementId)].filter(Boolean) : []);

    items.forEach(el => {
      if (el.type === "zone_rect") {
        el.width = Math.max(30, Math.min(800, Math.round((el.width || 120) * factor)));
        el.height = Math.max(20, Math.min(600, Math.round((el.height || 80) * factor)));
      } else if (el.type === "zone_circle") {
        el.radius = Math.max(15, Math.min(400, Math.round((el.radius || 50) * factor)));
      } else if (el.type === "zone_triangle") {
        el.size = Math.max(25, Math.min(500, Math.round((el.size || 70) * factor)));
      } else {
        el.scale = Math.max(0.4, Math.min(3.0, (el.scale || 1.0) * factor));
      }
      syncEquipmentElementAcrossAllKeyframes(el);
    });

    window.drawScene();
    window.updateActionPopupPosition();
    window.recordHistory();
  };

  window.toggleFocusSelectedElement = function () {
    const s = S();
    const kf = TC().getCurrentKeyframe();
    if (!kf) return;
    if (s.selectedElementIds.length > 0) {
      const items = kf.elements.filter(it => s.selectedElementIds.includes(it.id));
      const anyF = items.some(it => it.focus);
      items.forEach(it => { it.focus = !anyF; });
    } else if (s.selectedElementId) {
      const el = kf.elements.find(it => it.id === s.selectedElementId);
      if (el) el.focus = !el.focus;
    }
    window.drawScene();
    window.updateFocusButtonState();
    window.recordHistory();
  };

  window.toggleSelectedElementJump = function () {
    const s = S();
    const kf = TC().getCurrentKeyframe();
    if (!kf || !s.selectedElementId) return;
    const el = kf.elements.find(it => it.id === s.selectedElementId);
    if (el) {
      el.jump = !el.jump;
      window.drawScene();
      window.updateFocusButtonState();
      window.recordHistory();
    }
  };

  window.resetSelectedElementCurve = function () {
    const s = S();
    const kf = TC().getCurrentKeyframe();
    if (!kf || !s.selectedElementId) return;
    const el = kf.elements.find(it => it.id === s.selectedElementId);
    if (el) {
      delete el.cp1_dx; delete el.cp1_dy; delete el.cp2_dx; delete el.cp2_dy;
      window.drawScene();
      window.updateFocusButtonState();
      window.recordHistory();
      window.showToast("Bogen begradigt");
    }
  };

  window.toggleZoneColorMenu = function (e) {
    if (e) e.stopPropagation();
    const sub = document.getElementById("actionPopupZoneColorSubmenu");
    if (!sub) return;
    sub.classList.toggle("hidden");
  };

  window.setSelectedZoneColor = function (colorHex) {
    const s = S();
    const kf = TC().getCurrentKeyframe();
    if (!kf) return;
    const items = s.selectedElementIds.length > 0
      ? kf.elements.filter(it => s.selectedElementIds.includes(it.id))
      : (s.selectedElementId ? [kf.elements.find(it => it.id === s.selectedElementId)].filter(Boolean) : []);

    items.forEach(el => {
      if (el.type === "zone_rect" || el.type === "zone_circle" || el.type === "zone_triangle") {
        el.color = colorHex;
        el.fillColor = hexToRgba(colorHex, 0.2);
        syncEquipmentElementAcrossAllKeyframes(el);
      }
    });

    const sub = document.getElementById("actionPopupZoneColorSubmenu");
    if (sub) sub.classList.add("hidden");

    window.drawScene();
    window.updateFocusButtonState();
    window.recordHistory();
  };

  window.onElementScaleChange = function (val) {
    const s = S();
    s.globalElementScale = parseFloat(val) || 1.0;
    s.currentExercise.element_scale = s.globalElementScale;
    const pStr = `${Math.round(s.globalElementScale * 100)}%`;
    const s1 = document.getElementById("elementScaleSlider");
    const l1 = document.getElementById("elementScaleLabel");
    const s2 = document.getElementById("sidebarElementScaleSlider");
    const l2 = document.getElementById("sidebarElementScaleLabel");
    if (s1) s1.value = s.globalElementScale;
    if (l1) l1.textContent = pStr;
    if (s2) s2.value = s.globalElementScale;
    if (l2) l2.textContent = pStr;
    window.drawScene();
    window.updateActionPopupPosition();
  };

  window.propagateSelectedElementToAllKeyframes = function () {
    const s = S();
    const ex = s.currentExercise;
    const kf = TC().getCurrentKeyframe();
    if (!kf || !ex || !Array.isArray(ex.keyframes)) return;

    const items = s.selectedElementIds.length > 0
      ? kf.elements.filter(it => s.selectedElementIds.includes(it.id))
      : (s.selectedElementId ? [kf.elements.find(it => it.id === s.selectedElementId)].filter(Boolean) : []);

    if (items.length === 0) return;

    let addedCount = 0;
    let updatedCount = 0;

    ex.keyframes.forEach((otherKf, idx) => {
      if (!otherKf.elements) otherKf.elements = [];

      items.forEach(sourceEl => {
        const existingIdx = otherKf.elements.findIndex(it => it.id === sourceEl.id);
        const clone = JSON.parse(JSON.stringify(sourceEl));

        // Wenn der Keyframe nicht der aktuelle Bearbeitungsschritt ist, Kurvenabweichungen entfernen,
        // damit das Element an seiner definierten Position stabil steht.
        if (idx !== s.currentKeyframeIndex) {
          delete clone.cp1_dx;
          delete clone.cp1_dy;
          delete clone.cp2_dx;
          delete clone.cp2_dy;
        }

        if (existingIdx >= 0) {
          // Nur überschreiben wenn nicht der aktuelle Ausgangsframe
          if (idx !== s.currentKeyframeIndex) {
            otherKf.elements[existingIdx] = clone;
            updatedCount++;
          }
        } else {
          otherKf.elements.push(clone);
          addedCount++;
        }
      });
    });

    window.drawScene();
    window.updateActionPopupPosition();
    window.recordHistory();

    const name = items.length === 1 ? (items[0].label || items[0].number || "Element") : `${items.length} Elemente`;
    window.showToast(`${name} in alle ${ex.keyframes.length} Schritte übernommen`);
  };

  window.deselectElement = function (skipDraw = false) {
    const s = S();
    if (!s) return;
    s.selectedElementId = null;
    s.selectedElementIds = [];
    s.selectedArrowIndex = null;
    s.selectedArrowPart = null;
    TC()?.inspectors?.hideInspector();
    window.updateActionPopupPosition();
    if (!skipDraw) {
      window.drawScene();
    }
  };

  window.updateFocusButtonState = function () {
    const s = S();
    const kf = TC().getCurrentKeyframe();
    const btn = document.getElementById("actionPopupFocusBtn");
    if (!btn || !kf) return;
    let isFocused = false;
    if (s.selectedElementIds.length > 0) isFocused = kf.elements.some(it => s.selectedElementIds.includes(it.id) && it.focus);
    else if (s.selectedElementId) {
      const el = kf.elements.find(it => it.id === s.selectedElementId);
      isFocused = el ? !!el.focus : false;
    }
    if (isFocused) {
      btn.className = "w-8 h-8 rounded-lg bg-yellow-500 text-black flex items-center justify-center text-xs shadow-md shadow-yellow-500/30";
    } else {
      btn.className = "w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-yellow-400 flex items-center justify-center text-xs";
    }

    const jBtn = document.getElementById("actionPopupJumpBtn");
    if (jBtn) {
      let isJumping = false;
      if (s.selectedElementId) {
        const el = kf.elements.find(it => it.id === s.selectedElementId);
        if (el && el.jump) isJumping = true;
      }
      if (isJumping) jBtn.className = "w-8 h-8 rounded-lg bg-purple-600 text-white flex items-center justify-center text-xs shadow-md shadow-purple-500/30";
      else jBtn.className = "w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-purple-400 flex items-center justify-center text-xs";
    }

    const rBtn = document.getElementById("actionPopupResetCurveBtn");
    if (rBtn) {
      let hasCurve = false;
      if (s.selectedElementId && s.currentKeyframeIndex > 0) {
        const el = kf.elements.find(it => it.id === s.selectedElementId);
        if (el && (el.cp1_dx !== undefined || el.cp1_dy !== undefined || el.cp2_dx !== undefined || el.cp2_dy !== undefined)) hasCurve = true;
      }
      rBtn.classList.toggle("hidden", !hasCurve);
    }

    // Zone Color Palette visibility & active color indicator
    const zoneColorWrapper = document.getElementById("actionPopupZoneColorWrapper");
    const zoneColorDot = document.getElementById("actionPopupZoneColorDot");
    const zoneColorSubmenu = document.getElementById("actionPopupZoneColorSubmenu");
    if (zoneColorWrapper) {
      const curEl = s.selectedElementId ? kf.elements.find(it => it.id === s.selectedElementId) : null;
      const isZone = curEl && (curEl.type === "zone_rect" || curEl.type === "zone_circle" || curEl.type === "zone_triangle");
      zoneColorWrapper.classList.toggle("hidden", !isZone);

      if (!isZone && zoneColorSubmenu) {
        zoneColorSubmenu.classList.add("hidden");
      }

      if (isZone) {
        const curColor = curEl.color ? curEl.color.toLowerCase() : "#38bdf8";
        if (zoneColorDot) {
          zoneColorDot.style.backgroundColor = curColor;
        }
        if (zoneColorSubmenu) {
          zoneColorSubmenu.querySelectorAll("[data-zone-color]").forEach(dot => {
            const c = dot.getAttribute("data-zone-color").toLowerCase();
            if (c === curColor) {
              dot.classList.add("ring-2", "ring-white", "scale-110");
            } else {
              dot.classList.remove("ring-2", "ring-white", "scale-110");
            }
          });
        }
      }
    }
  };

  window.syncFloatingProps = function () {
    const s = S();
    const kf = TC().getCurrentKeyframe();
    if (!kf || !s.selectedElementId) return;
    const el = kf.elements.find(it => it.id === s.selectedElementId);
    if (el) {
      el.number = document.getElementById("floatingPropNumber")?.value || "";
      el.name = document.getElementById("floatingPropName")?.value || "";
      window.drawScene();
      window.recordHistory();
    }
  };
