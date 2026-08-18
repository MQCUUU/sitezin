"use client";

import { useEffect } from "react";

const MENU_SELECTOR = [
  ".discover-library-status-menu",
  ".library-card-status-menu",
  ".fy-status-menu",
  ".collection-status-menu",
  ".pick-status-menu",
].join(",");

const TRIGGER_SELECTOR = [
  ".discover-library-menu-button",
  ".library-status-action",
  ".fy-status-trigger",
  ".collection-status-trigger",
  ".pick-status-trigger",
  ".pick-status-button",
].join(",");

function findTrigger(menu: HTMLElement) {
  let parent: HTMLElement | null = menu.parentElement;
  while (parent && parent !== document.body) {
    const trigger = parent.querySelector<HTMLElement>(TRIGGER_SELECTOR);
    if (trigger) return trigger;
    parent = parent.parentElement;
  }
  return null;
}

function positionMenu(menu: HTMLElement) {
  const trigger = findTrigger(menu);
  if (!trigger) return;

  const margin = 12;
  const gap = 8;
  const triggerRect = trigger.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();
  const width = Math.min(menuRect.width || 230, window.innerWidth - margin * 2);
  const height = Math.min(menuRect.height || 360, window.innerHeight - margin * 2);

  let left = triggerRect.right - width;
  left = Math.max(margin, Math.min(left, window.innerWidth - width - margin));

  let top = triggerRect.bottom + gap;
  if (top + height > window.innerHeight - margin) {
    top = triggerRect.top - height - gap;
  }
  top = Math.max(margin, Math.min(top, window.innerHeight - height - margin));

  menu.style.setProperty("position", "fixed", "important");
  menu.style.setProperty("inset", "auto", "important");
  menu.style.setProperty("left", `${left}px`, "important");
  menu.style.setProperty("right", "auto", "important");
  menu.style.setProperty("top", `${top}px`, "important");
  menu.style.setProperty("bottom", "auto", "important");
  menu.style.setProperty("width", `${width}px`, "important");
  menu.style.setProperty("max-height", `${window.innerHeight - margin * 2}px`, "important");
  menu.style.setProperty("overflow-y", "auto", "important");
  menu.style.setProperty("z-index", "10060", "important");
}

export function PopoverCollisionGuard() {
  useEffect(() => {
    let frame = 0;
    const positionAll = () => {
      document.querySelectorAll<HTMLElement>(MENU_SELECTOR).forEach(positionMenu);
    };
    const updateOnScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(positionAll);
    };
    // Inserções precisam ser posicionadas antes do próximo frame para o menu
    // não aparecer por um instante recortado dentro do pôster.
    const observer = new MutationObserver(positionAll);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", updateOnScroll);
    document.addEventListener("scroll", updateOnScroll, true);
    positionAll();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", updateOnScroll);
      document.removeEventListener("scroll", updateOnScroll, true);
    };
  }, []);
  return null;
}
