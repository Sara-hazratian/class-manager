/* ============================================================
   SUPER ADMIN PANEL — completely separate page (superadmin.html),
   never linked from or reachable through the main school app.
   Three tabs: dashboard (platform stats), registration requests
   (approve / reject-with-required-reason / needs-correction-
   with-required-reason), and full user management. Every action
   is enforced by the database itself (review_registration_request
   RPC requires a reason for reject/correction server-side too,
   not just in this UI) — this file cannot grant privilege or
   skip the reason requirement beyond what the database allows.
   ============================================================ */
import { loadPendingApprovals, reviewRegistrationRequest, loadPlatformStats, loadAllUsers, changeUserRole, setUserActive, deleteUser } from "./store.js";
import { $, $$, toast, translateError } from "./ui.js";
import { fa } from "./jalali.js";
import { sb } from "./supabase-client.js";

const ROLE_LABELS = { teacher: "معلم", admin: "مدیر", vice_principal: "معاون", parent: "ولی", super_admin: "سوپر ادمین", rahbar: "راهبر", group_leader: "سرگروه آموزشی" };

const REASON_SUGGESTIONS = [
  "تصویر حکم خوانا نیست.",
  "حکم منقضی شده است.",
  "اطلاعات حکم با اطلاعات ثبت‌نام مطابقت ندارد.",
  "کد پرسنلی صحیح نیست.",
  "مدرک ناقص است.",
  "اطلاعات مدرسه نیاز به اصلاح دارد.",
];

/* ---------- Tab: dashboard ---------- */
async function renderDashboard() {
  const stats = await loadPlatformStats();
  const cardsWrap = $("#sa-stat-cards");
  const cards = [
    { label: "کل مدارس", value: stats.totalSchools },
    { label: "کل معلم‌ها", value: stats.totalTeachers },
    { label: "کل مدیران", value: stats.totalManagers },
    { label: "کل معاونان", value: stats.totalAssistants },
    { label: "کل اولیا", value: stats.totalParents },
    { label: "درخواست‌های مدیر در انتظار", value: stats.pendingManagers },
    { label: "درخواست‌های معاون در انتظار", value: stats.pendingAssistants },
  ];
  cardsWrap.innerHTML = cards.map(c => `
    <div class="card">
      <p style="font-size:26px;font-weight:800;font-family:var(--font-mono);color:var(--color-primary)">${fa(c.value)}</p>
      <p style="font-size:12.5px;color:var(--color-ink-soft);margin-top:4px">${c.label}</p>
    </div>`).join("");

  const recent = await loadPendingApprovals();
  const recentWrap = $("#sa-recent-list");
  const recentTop = recent.slice(0, 5);
  $("#sa-recent-empty").hidden = recentTop.length > 0;
  recentWrap.innerHTML = recentTop.map(p => `
    <article class="card" style="margin-bottom:var(--space-2)">
      <p style="font-weight:700;font-size:13.5px">${p.fullName || "(بدون نام)"} — ${ROLE_LABELS[p.role]}</p>
      <p style="font-size:11.5px;color:var(--color-ink-soft)">${p.schoolName || ""}</p>
    </article>`).join("");
}

/* ---------- Reason modal (shared by «رد» و «نیازمند اصلاح») ---------- */
let reasonModalContext = null; // { profileId, action }

function openReasonModal(profileId, action) {
  reasonModalContext = { profileId, action };
  const isReject = action === "rejected";
  $("#sa-reason-modal-title").textContent = isReject ? "رد درخواست" : "نیازمند اصلاح";
  $("#sa-reason-modal-label").textContent = isReject ? "علت رد درخواست" : "علت نیاز به اصلاح";
  $("#sa-reason-input").placeholder = isReject ? "علت رد درخواست را وارد کنید..." : "توضیح دهید متقاضی چه چیزی را باید اصلاح کند...";
  $("#sa-reason-input").value = "";
  $("#sa-reason-error").textContent = "";
  $("#sa-reason-confirm").textContent = isReject ? "رد درخواست" : "ارسال برای اصلاح";
  $("#sa-reason-confirm").className = isReject ? "btn btn--danger" : "btn btn--primary";
  $("#sa-reason-suggestions").innerHTML = REASON_SUGGESTIONS.map(r => `<button type="button" class="reason-suggestion" data-fill="${r}">${r}</button>`).join("");
  $$("[data-fill]", $("#sa-reason-suggestions")).forEach(b => b.addEventListener("click", () => { $("#sa-reason-input").value = b.dataset.fill; }));
  $("#sa-reason-modal").hidden = false;
  $("#sa-reason-input").focus();
}
function closeReasonModal() {
  $("#sa-reason-modal").hidden = true;
  reasonModalContext = null;
}

/* ---------- Tab: registration requests ---------- */
async function renderQueue() {
  const wrap = $("#sa-pending-list");
  const list = await loadPendingApprovals();
  $("#sa-pending-empty").hidden = list.length > 0;

  wrap.innerHTML = list.map(p => `
    <article class="card" style="margin-bottom:var(--space-3)">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap">
        <div>
          <p style="font-weight:700;font-size:14.5px">${p.fullName || "(بدون نام)"}</p>
          <p style="font-size:12.5px;color:var(--color-ink-soft)">${p.position || (p.role === "vice_principal" ? "معاون" : "مدیر")} · ${p.schoolName || ""}</p>
          <p style="font-size:11.5px;color:var(--color-ink-faint);font-family:var(--font-mono)">کد پرسنلی: ${p.username} ${p.phoneNumber ? "· موبایل: " + p.phoneNumber : ""}</p>
          ${p.documentPath ? `<button type="button" class="btn btn--secondary btn--sm" data-view-doc="${p.documentPath}" style="margin-top:6px">📎 مشاهده‌ی فایل ابلاغ</button>` : `<p style="font-size:11.5px;color:var(--color-danger);margin-top:4px">⚠️ فایلی آپلود نشده</p>`}
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0;flex-wrap:wrap">
          <button type="button" class="btn btn--primary btn--sm" data-approve="${p.id}">تأیید درخواست</button>
          <button type="button" class="btn btn--secondary btn--sm" data-correction="${p.id}">نیازمند اصلاح</button>
          <button type="button" class="btn btn--danger btn--sm" data-reject="${p.id}">رد درخواست</button>
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
    if (!confirm("آیا از تأیید این درخواست مطمئن هستید؟")) return;
    try { await reviewRegistrationRequest(b.dataset.approve, "approved"); toast("حساب تأیید شد"); renderQueue(); renderDashboard(); }
    catch (err) { alert("تأیید ناموفق بود: " + translateError(err)); }
  }));
  $$("[data-reject]", wrap).forEach(b => b.addEventListener("click", () => openReasonModal(b.dataset.reject, "rejected")));
  $$("[data-correction]", wrap).forEach(b => b.addEventListener("click", () => openReasonModal(b.dataset.correction, "needs_correction")));
}

function initReasonModal() {
  $("#sa-reason-cancel").addEventListener("click", closeReasonModal);
  $("#sa-reason-confirm").addEventListener("click", async () => {
    if (!reasonModalContext) return;
    const reason = $("#sa-reason-input").value.trim();
    if (!reason) { $("#sa-reason-error").textContent = "وارد کردن دلیل الزامی است."; return; }
    try {
      await reviewRegistrationRequest(reasonModalContext.profileId, reasonModalContext.action, reason);
      toast(reasonModalContext.action === "rejected" ? "درخواست رد شد" : "برای اصلاح ارسال شد", reasonModalContext.action === "rejected" ? "error" : "success");
      closeReasonModal();
      renderQueue();
      renderDashboard();
    } catch (err) {
      $("#sa-reason-error").textContent = translateError(err);
    }
  });
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
  initReasonModal();
  $$("#sa-tabs .pill-tab").forEach(b => b.addEventListener("click", () => {
    $$("#sa-tabs .pill-tab").forEach(x => x.classList.toggle("is-active", x === b));
    const tab = b.dataset.saTab;
    $("#sa-tab-dashboard").hidden = tab !== "dashboard";
    $("#sa-tab-queue").hidden = tab !== "queue";
    $("#sa-tab-users").hidden = tab !== "users";
    if (tab === "users") renderUserManagement();
    if (tab === "queue") renderQueue();
    if (tab === "dashboard") renderDashboard();
  }));
  renderDashboard();
}
