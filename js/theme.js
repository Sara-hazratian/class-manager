/* ============================================================
   THEME — رنگ برند (data-theme) + حالت روشن/تیره (data-mode).
   «آبی» رنگ پیش‌فرض قدیمی بود؛ برای همهٔ کاربران قبلی به رنگ
   خاکی جدید (clay) برمی‌گردد. رنگ‌های دیگر هنوز قابل انتخاب‌اند.
   ============================================================ */
import { getProfile } from "./store.js";

const MODE_KEY = "classpilot-mode";

export function applyTheme(themeId) {
  document.documentElement.dataset.theme = !themeId || themeId === "blue" ? "clay" : themeId;
}

function savedMode() {
  try { const v = localStorage.getItem(MODE_KEY); if (v === "dark" || v === "light") return v; } catch (_) { /* ignore */ }
  try { return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light"; } catch (_) { return "light"; }
}

export function applyMode(mode) {
  document.documentElement.dataset.mode = mode;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", mode === "dark" ? "#1E1914" : "#FCF6EE");
  document.querySelectorAll("[data-mode-toggle]").forEach(b => {
    b.setAttribute("aria-pressed", mode === "dark" ? "true" : "false");
    b.setAttribute("aria-label", mode === "dark" ? "تغییر به حالت روشن" : "تغییر به حالت تیره");
  });
}

export function toggleMode() {
  const next = document.documentElement.dataset.mode === "dark" ? "light" : "dark";
  try { localStorage.setItem(MODE_KEY, next); } catch (_) { /* ignore */ }
  applyMode(next);
}

/** Call once at boot — reads the saved profile, or falls back to the default before Setup runs. */
export function initTheme() {
  applyTheme(getProfile()?.themeColor);
  applyMode(savedMode());
  document.querySelectorAll("[data-mode-toggle]").forEach(b => b.addEventListener("click", toggleMode));
}
