/* ============================================================
   UI HELPERS — toasts, modal open/close, small DOM utilities.
   Shared by every later phase.
   ============================================================ */
export const $  = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function toast(message, type = "success") {
  const c = $("#toast-container"); if (!c) return;
  const el = document.createElement("div");
  el.className = `toast toast--${type}`;
  el.textContent = message;
  c.appendChild(el);
  setTimeout(() => {
    el.style.transition = "opacity .2s, transform .2s";
    el.style.opacity = "0"; el.style.transform = "translateY(6px)";
    setTimeout(() => el.remove(), 220);
  }, 2600);
}

export function openModal(id) { document.getElementById(id)?.showModal(); }
export function closeModal(id) { document.getElementById(id)?.close(); }

export function initModals() {
  $$("[data-close]").forEach(btn => btn.addEventListener("click", () => btn.closest("dialog")?.close()));
  $$("dialog.modal").forEach(d => d.addEventListener("click", e => {
    const r = d.getBoundingClientRect();
    const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if (!inside) d.close();
  }));
}

export function initials(name) {
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join("");
}

/** Debounce helper — used for auto-save-on-type fields (e.g. general notes). */
export function debounce(fn, ms = 400) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
