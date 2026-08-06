/* ============================================================
   THEME — applies the teacher's chosen theme color (from Setup
   or Settings) as a single data-theme attribute on <html>.
   ============================================================ */
import { getProfile } from "./store.js";

export function applyTheme(themeId) {
  document.documentElement.dataset.theme = themeId || "blue";
}

/** Call once at boot — reads the saved profile, or falls back to blue before Setup runs. */
export function initTheme() {
  applyTheme(getProfile()?.themeColor);
}
