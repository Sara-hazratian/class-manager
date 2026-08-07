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

/** Turns any error (Supabase/Postgres, network, or otherwise) into a plain-
    Persian message — used everywhere an error might be shown to the person,
    so no raw English/technical text ever leaks into the UI. */
export function translateError(err) {
  const msg = (err && err.message) || (typeof err === "string" ? err : "") || "";
  if (!msg) return "خطایی رخ داد. لطفاً دوباره تلاش کنید.";
  // Already a Persian message (e.g. a custom database function's own error
  // text, like link_child_to_parent's) — pass it through untouched.
  if (/[\u0600-\u06FF]/.test(msg)) return msg;
  if (msg.includes("Invalid login credentials")) return "کد ورود یا رمز عبور اشتباه است.";
  if (msg.includes("User already registered")) return "این ایمیل قبلاً ثبت‌نام کرده است.";
  if (msg.includes("Password should be at least")) return "رمز عبور باید حداقل ۶ کاراکتر باشد.";
  if (msg.includes("duplicate key") || msg.toLowerCase().includes("already exists")) return "این مورد قبلاً ثبت شده است.";
  if (msg.toLowerCase().includes("row-level security") || msg.toLowerCase().includes("permission denied")) return "شما اجازه‌ی انجام این کار را ندارید.";
  if (msg.toLowerCase().includes("not found")) return "مورد مورد نظر پیدا نشد.";
  if (msg.toLowerCase().includes("network") || msg.toLowerCase().includes("fetch failed") || msg.toLowerCase().includes("failed to fetch")) return "خطا در اتصال به اینترنت. اتصال خود را بررسی و دوباره تلاش کنید.";
  // Never show a raw English/technical message — fall back to a generic Persian one.
  return "خطایی در ارتباط با سرور رخ داد. لطفاً دوباره تلاش کنید.";
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
