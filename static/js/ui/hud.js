// ui/hud.js - Mobile Feedback HUD, Bottom Dock Scrolling & Tooltips
import { isMobileScreen } from "../core/constants.js";

let mobileHudTimer = null;

export function showMobileSelectionHUD(title, subtitle = "", iconHtml = "") {
  if (!isMobileScreen()) return;

  const hud = document.getElementById("mobileSelectionHud");
  const titleEl = document.getElementById("mobileSelectionTitle");
  const subtitleEl = document.getElementById("mobileSelectionSubtitle");
  const iconEl = document.getElementById("mobileSelectionIcon");
  if (!hud || !titleEl) return;

  titleEl.textContent = title;
  if (subtitleEl) {
    subtitleEl.textContent = subtitle;
    subtitleEl.style.display = subtitle ? "block" : "none";
  }
  if (iconEl) {
    iconEl.innerHTML = iconHtml;
    iconEl.style.display = iconHtml ? "block" : "none";
  }

  // Animation einblenden
  hud.classList.remove("opacity-0", "pointer-events-none", "scale-90");
  hud.classList.add("opacity-100", "scale-100");

  clearTimeout(mobileHudTimer);
  mobileHudTimer = setTimeout(() => {
    hud.classList.remove("opacity-100", "scale-100");
    hud.classList.add("opacity-0", "pointer-events-none", "scale-90");
  }, 950);
}

export function updateBottomDockScrollHints() {
  const container = document.getElementById("bottomDockScrollContainer");
  const leftHint = document.getElementById("dockScrollLeftHint");
  const rightHint = document.getElementById("dockScrollRightHint");
  if (!container || !leftHint || !rightHint) return;

  const scrollLeft = container.scrollLeft;
  const maxScroll = container.scrollWidth - container.clientWidth;

  if (maxScroll > 6) {
    if (scrollLeft > 6) {
      leftHint.classList.remove("opacity-0", "pointer-events-none");
      leftHint.classList.add("opacity-100", "pointer-events-auto");
    } else {
      leftHint.classList.add("opacity-0", "pointer-events-none");
      leftHint.classList.remove("opacity-100", "pointer-events-auto");
    }

    if (scrollLeft < maxScroll - 6) {
      rightHint.classList.remove("opacity-0", "pointer-events-none");
      rightHint.classList.add("opacity-100", "pointer-events-auto");
    } else {
      rightHint.classList.add("opacity-0", "pointer-events-none");
      rightHint.classList.remove("opacity-100", "pointer-events-auto");
    }
  } else {
    leftHint.classList.add("opacity-0", "pointer-events-none");
    rightHint.classList.add("opacity-0", "pointer-events-none");
  }
}

export function scrollBottomDock(direction) {
  const container = document.getElementById("bottomDockScrollContainer");
  if (!container) return;
  const amount = container.clientWidth * 0.65;
  if (direction === "left") {
    container.scrollBy({ left: -amount, behavior: "smooth" });
  } else {
    container.scrollBy({ left: amount, behavior: "smooth" });
  }
}

let mobileTooltipTimer = null;
let activeTooltipEl = null;

export function showMobileTooltip(text, x, y) {
  const tooltip = document.getElementById("mobileTooltip");
  const textEl = document.getElementById("mobileTooltipText");
  if (!tooltip || !textEl || !text) return;

  textEl.textContent = text;
  tooltip.style.left = `${Math.max(60, Math.min(window.innerWidth - 60, x))}px`;
  tooltip.style.top = `${Math.max(40, y - 10)}px`;
  tooltip.classList.remove("opacity-0", "pointer-events-none");
  tooltip.classList.add("opacity-100");
}

export function hideMobileTooltip() {
  clearTimeout(mobileTooltipTimer);
  mobileTooltipTimer = null;
  activeTooltipEl = null;
  const tooltip = document.getElementById("mobileTooltip");
  if (tooltip) {
    tooltip.classList.add("opacity-0", "pointer-events-none");
    tooltip.classList.remove("opacity-100");
  }
}

export function setupMobileTooltips() {
  document.addEventListener("touchstart", (e) => {
    const target = e.target.closest("[title], [data-title]");
    if (!target) {
      hideMobileTooltip();
      return;
    }

    const titleText = target.getAttribute("title") || target.getAttribute("data-title");
    if (!titleText) return;

    if (!target.hasAttribute("data-title")) {
      target.setAttribute("data-title", titleText);
      target.removeAttribute("title");
    }

    const touch = e.touches[0];
    const touchX = touch.clientX;
    const touchY = touch.clientY;

    clearTimeout(mobileTooltipTimer);
    activeTooltipEl = target;
    mobileTooltipTimer = setTimeout(() => {
      if (activeTooltipEl === target) {
        showMobileTooltip(titleText, touchX, touchY);
      }
    }, 400);
  }, { passive: true });

  document.addEventListener("touchmove", () => {
    clearTimeout(mobileTooltipTimer);
    hideMobileTooltip();
  }, { passive: true });

  document.addEventListener("touchend", () => {
    clearTimeout(mobileTooltipTimer);
    setTimeout(hideMobileTooltip, 1200);
  }, { passive: true });

  document.addEventListener("touchcancel", () => {
    clearTimeout(mobileTooltipTimer);
    hideMobileTooltip();
  }, { passive: true });
}
