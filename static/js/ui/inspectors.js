// ui/inspectors.js - Element- und Gruppen-Inspektoren, Floating Action Bars
import { state } from "../state/store.js";
import { isEquipment } from "../core/constants.js";

export function showGroupInspector(count) {
  const bar = document.getElementById("floatingElementBar");
  const nameLabel = document.getElementById("floatingElementName");
  const numInput = document.getElementById("floatingPropNumber");
  const nameInput = document.getElementById("floatingPropName");

  if (!bar) return;
  if (!state.isMovingElement) {
    bar.classList.remove("hidden");
  } else {
    bar.classList.add("hidden");
  }
  nameLabel.textContent = `Gruppe (${count} Objekte)`;
  numInput.classList.add("hidden");
  nameInput.classList.add("hidden");
}

export function showInspector(el) {
  const bar = document.getElementById("floatingElementBar");
  const nameLabel = document.getElementById("floatingElementName");
  const numInput = document.getElementById("floatingPropNumber");
  const nameInput = document.getElementById("floatingPropName");

  if (!bar) return;
  // Für Zonen brauchen wir die redundante Text-Box oben links gar nicht
  const isZone = (el.type === "zone_rect" || el.type === "zone_circle" || el.type === "zone_triangle");
  if (isZone) {
    bar.classList.add("hidden");
    return;
  }

  if (!state.isMovingElement) {
    bar.classList.remove("hidden");
  } else {
    bar.classList.add("hidden");
  }

  if (el.type === "player") {
    nameLabel.textContent = (el.team === "blue" ? "Blau" : el.team === "red" ? "Rot" : "Joker");
    numInput.classList.remove("hidden");
    nameInput.classList.remove("hidden");
    numInput.value = el.number || "";
    nameInput.value = el.name || "";
  } else {
    nameLabel.textContent = el.type === "ball" ? "Ball" : el.type === "cone" ? "Hütchen" : el.type === "minigoal" ? "Minitor" : el.type === "goal_5m" ? "5m Tor (E-Jugend)" : el.type === "pole" ? "Stange" : el.type === "ladder" ? "Leiter" : el.type === "dummy" ? "Dummy" : el.type === "ring" ? "Ring" : el.type === "hurdle" ? "Hürde" : el.type === "zone_rect" ? "Rechteck-Zone" : el.type === "zone_circle" ? "Kreis-Zone" : el.type === "zone_triangle" ? "Dreieck-Zone" : "Objekt";
    numInput.classList.add("hidden");
    nameInput.classList.add("hidden");
  }
}

export function showArrowInspector(arr) {
  const bar = document.getElementById("floatingElementBar");
  const nameLabel = document.getElementById("floatingElementName");
  const numInput = document.getElementById("floatingPropNumber");
  const nameInput = document.getElementById("floatingPropName");

  if (!bar) return;
  if (!state.isMovingElement) {
    bar.classList.remove("hidden");
  } else {
    bar.classList.add("hidden");
  }
  nameLabel.textContent = arr.type === "pass" ? "Passweg" : (arr.type === "guide" ? "Hilfslinie" : "Laufweg");
  numInput.classList.add("hidden");
  nameInput.classList.add("hidden");
}

export function hideInspector() {
  const bar = document.getElementById("floatingElementBar");
  if (bar) bar.classList.add("hidden");
  const popup = document.getElementById("elementActionPopup");
  if (popup) popup.classList.add("hidden");
}
