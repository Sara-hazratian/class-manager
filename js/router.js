/* ============================================================
   ROUTER — switches between top-level views inside #app.
   View titles are filled in as each phase adds its page; unknown
   views just get a generic title so nothing ever throws.
   ============================================================ */
import { $$ } from "./ui.js";

const TITLES = {
  dashboard: "داشبورد",
  // Later phases register their own titles via registerTitle() below.
};
export function registerTitle(view, title) { TITLES[view] = title; }

const listeners = [];
export function onViewChange(fn) { listeners.push(fn); }

export function switchView(name) {
  $$(".nav-tab[data-view]").forEach(b => b.classList.toggle("is-active", b.dataset.view === name));
  $$(".view").forEach(v => { v.hidden = v.dataset.view !== name; });
  const titleEl = document.getElementById("view-title");
  if (titleEl) titleEl.textContent = TITLES[name] || name;
  window.scrollTo({ top: 0, behavior: "smooth" });
  listeners.forEach(fn => fn(name));
}

export function initRouter() {
  $$(".nav-tab[data-view]").forEach(b => b.addEventListener("click", () => switchView(b.dataset.view)));
  $$("[data-goto]").forEach(b => b.addEventListener("click", () => switchView(b.dataset.goto)));
}
