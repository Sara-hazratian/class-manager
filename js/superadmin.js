/* ============================================================
   SUPER ADMIN PANEL — completely separate page (superadmin.html),
   never linked from or reachable through the main school app.
   Two tabs: approval queue (admin/vice_principal sign-ups) and
   full user management (any role, any account). Every action
   here is enforced by the database itself (is_super_admin() +
   the protect_role_and_verified trigger) — this file cannot
   grant privilege beyond what the database allows, even if
   someone tampered with the UI.
   ============================================================ */
import { loadPendingApprovals, approveAccount, rejectAccount, loadAllUsers, changeUserRole, setUserActive, deleteUser } from "./store.js";
import { $, $$, toast, translateError } from "./ui.js";
import { sb } from "./supabase-client.js";

const ROLE_LABELS = { teacher: "معلم", admin: "مدیر", vice_principal: "معاون", parent: "ولی", super_admin: "سوپر ادمین", rahbar: "راهبر", group_leader: "سرگروه آموزشی" };

/* ---------- Tab: approval queue ---------- */
async function renderQueue() {
  const wrap = $("#sa-pending-list");
  const list = await loadPendingApprovals();
  $("#sa-pending-empty").hidden = list.length > 0;

  wrap.innerHTML = list.map(p => `
    <article class="card" style="margin-bottom:var(--space-3)">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
        <div>
          <p style="font-weight:700;font-size:14.5px">${p.fullName || "(بدون نام)"}</p>
          <p style="font-size:12.5px;color:var(--color-ink-soft)">${p.position || (p.role === "vice_principal" ? "معاون" : "مدیر")} · ${p.schoolName || ""}</p>
          <p style="font-size:11.5px;color:var(--color-ink-faint);font-family:var(--font-mono)">کد پرسنلی: ${p.username}</p>
          ${p.documentPath ? `<button type="button" class="btn btn--secondary btn--sm" data-view-doc="${p.documentPath}" style="margin-top:6px">📎 مشاهده‌ی فایل ابلاغ</button>` : `<p style="font-size:11.5px;color:var(--color-danger);margin-top:4px">⚠️ فایلی آپلود نشده</p>`}
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0">
          <button type="button" class="btn btn--primary btn--sm" data-approve="${p.id}">تأیید</button>
          <button type="button" class="btn btn--danger btn--sm" data-reject="${p.id}">رد</button>
        </div>
      </div>
    </article>`).join("");

  $$("[data-view-doc]", wrap).forEach(b => b.addEventListener("click", async () => {
    b.disabled = true;
    const originalText = b.textContent;
    b.textContent = "در حال آماده‌سازی…";
    try {
      const { data, error } = await sb.storage.from("verification-documents").createSignedUrl(b.dataset.viewDoc, 300);
      if (error) throw error;
      window.open(data.signedUrl, "_blank");
    } catch (err) {
      alert("نمایش فایل ناموفق بود: " + translateError(err));
    } finally {
      b.disabled = false;
      b.textContent = originalText;
    }
  }));

  $$("[data-approve]", wrap).forEach(b => b.addEventListener("click", async () => {
    if (!confirm("این حساب تأیید و فعال شود؟")) return;
    try { await approveAccount(b.dataset.approve); toast("حساب تأیید شد"); renderQueue(); }
    catch (err) { alert("تأیید ناموفق بود: " + translateError(err)); }
  }));
  $$("[data-reject]", wrap).forEach(b => b.addEventListener("click", async () => {
    if (!confirm("این درخواست رد و حذف شود؟")) return;
    try { await rejectAccount(b.dataset.reject); toast("درخواست رد شد", "error"); renderQueue(); }
    catch (err) { alert("رد کردن ناموفق بود: " + translateError(err)); }
  }));
}

/* ---------- Tab: user management ---------- */
async function renderUserManagement() {
  const users = await loadAllUsers();
  const wrap = $("#sa-user-list");
  $("#sa-users-empty").hidden = users.length > 0;

  wrap.innerHTML = users.map(u => `
    <article class="card" style="margin-bottom:var(--space-3)">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap">
        <div>
          <p style="font-weight:700;font-size:14px">${u.fullName || "(بدون نام)"} <span class="chip ${u.verified ? "chip--excellent" : "chip--danger"}" style="margin-inline-start:6px">${u.verified ? "فعال" : "غیرفعال"}</span></p>
          <p style="font-size:12px;color:var(--color-ink-soft)">${u.schoolName || ""} ${u.className ? "· کلاس " + u.className : ""}</p>
          <p style="font-size:11px;color:var(--color-ink-faint);font-family:var(--font-mono)">کد: ${u.username}</p>
        </div>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
          <select class="select-control" style="width:auto" data-role-select="${u.id}">
            ${Object.entries(ROLE_LABELS).map(([id, label]) => `<option value="${id}" ${u.role === id ? "selected" : ""}>${label}</option>`).join("")}
          </select>
          <button type="button" class="btn ${u.verified ? "btn--secondary" : "btn--primary"} btn--sm" data-toggle-active="${u.id}" data-current="${u.verified}">${u.verified ? "غیرفعال کردن" : "فعال کردن"}</button>
          <button type="button" class="btn btn--danger btn--sm" data-delete-user="${u.id}">حذف</button>
        </div>
      </div>
    </article>`).join("");

  $$("[data-role-select]", wrap).forEach(sel => sel.addEventListener("change", async () => {
    if (!confirm(`نقش این کاربر به «${ROLE_LABELS[sel.value]}» تغییر کند؟`)) { renderUserManagement(); return; }
    try { await changeUserRole(sel.dataset.roleSelect, sel.value); toast("نقش تغییر کرد"); renderUserManagement(); }
    catch (err) { alert("تغییر نقش ناموفق بود: " + translateError(err)); renderUserManagement(); }
  }));
  $$("[data-toggle-active]", wrap).forEach(b => b.addEventListener("click", async () => {
    const willActivate = b.dataset.current !== "true";
    if (!confirm(willActivate ? "این حساب فعال شود؟" : "این حساب غیرفعال شود؟")) return;
    try { await setUserActive(b.dataset.toggleActive, willActivate); toast(willActivate ? "حساب فعال شد" : "حساب غیرفعال شد"); renderUserManagement(); }
    catch (err) { alert("عملیات ناموفق بود: " + translateError(err)); }
  }));
  $$("[data-delete-user]", wrap).forEach(b => b.addEventListener("click", async () => {
    if (!confirm("این کاربر برای همیشه حذف شود؟ این کار قابل بازگشت نیست.")) return;
    try { await deleteUser(b.dataset.deleteUser); toast("کاربر حذف شد", "error"); renderUserManagement(); }
    catch (err) { alert("حذف ناموفق بود: " + translateError(err)); }
  }));
}

export function initSuperAdminPanel() {
  $$("#sa-tabs .pill-tab").forEach(b => b.addEventListener("click", () => {
    $$("#sa-tabs .pill-tab").forEach(x => x.classList.toggle("is-active", x === b));
    const isQueue = b.dataset.saTab === "queue";
    $("#sa-tab-queue").hidden = !isQueue;
    $("#sa-tab-users").hidden = isQueue;
    if (!isQueue) renderUserManagement();
  }));
  renderQueue();
}
