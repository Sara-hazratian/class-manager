/* ============================================================
   ADMIN VIEW — regular admin/vice_principal see ONLY the Classes
   tab (browsing their school's teachers/students, read-only).
   Approving/rejecting admin & vice-principal sign-ups and all
   user management (role changes, activate/deactivate, delete)
   are exclusively a super_admin's job — those two tabs are
   hidden entirely for anyone else, both in the UI and (more
   importantly) enforced by the database trigger regardless of
   what the UI shows.
   ============================================================ */
import { loadPendingApprovals, approveAccount, rejectAccount, getProfile, loadAdminData, getStudents } from "./store.js";
import { buildStudentReport } from "./reports.js";
import { $, $$, toast, translateError } from "./ui.js";
import { fa } from "./jalali.js";
import { signOut } from "./auth.js";
import { sb } from "./supabase-client.js";

const GRADE_LABELS = { grade1: "پایه اول", grade2: "پایه دوم", grade3: "پایه سوم", grade4: "پایه چهارم", grade5: "پایه پنجم", grade6: "پایه ششم" };

let teachers = [];
let selectedTeacherId = null;
let selectedStudentId = null;
let selectedPeriod = "term1";

/* ---------- Tab 1: approval queue ---------- */
async function renderQueue() {
  const wrap = $("#admin-pending-list");
  const list = await loadPendingApprovals();
  $("#admin-pending-empty").hidden = list.length > 0;

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
      const { data, error } = await sb.storage.from("verification-documents").createSignedUrl(b.dataset.viewDoc, 300); // link works for 5 minutes
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

/* ---------- Tab 2: classes browser ---------- */
async function renderTeacherList() {
  teachers = await loadAdminData();
  const wrap = $("#admin-teacher-list");
  $("#admin-teachers-empty").hidden = teachers.length > 0;

  wrap.innerHTML = teachers.map(t => `
    <button type="button" class="card card--interactive" data-teacher="${t.id}" style="text-align:right;width:100%;margin-bottom:var(--space-2);display:block">
      <p style="font-weight:700;font-size:14px">${t.fullName || t.username}</p>
      <p style="font-size:12px;color:var(--color-ink-soft)">${t.schoolName || ""} · ${GRADE_LABELS[t.grade] || ""} · کلاس ${t.className || ""}</p>
    </button>`).join("");

  $$("[data-teacher]", wrap).forEach(b => b.addEventListener("click", () => {
    selectedTeacherId = b.dataset.teacher; selectedStudentId = null;
    renderStudentList();
  }));
}

function renderStudentList() {
  $("#admin-teacher-picker").hidden = true;
  $("#admin-student-picker").hidden = false;
  const teacher = teachers.find(t => t.id === selectedTeacherId);
  $("#admin-selected-teacher-name").textContent = teacher?.fullName || teacher?.username || "";

  const students = getStudents().filter(s => s.teacherId === selectedTeacherId);
  const wrap = $("#admin-student-list");
  $("#admin-students-empty").hidden = students.length > 0;
  wrap.innerHTML = students.map(s => `<button type="button" class="pill-tab" data-student="${s.id}">${s.name}</button>`).join("");
  $$("[data-student]", wrap).forEach(b => b.addEventListener("click", () => {
    selectedStudentId = b.dataset.student;
    $$("[data-student]", wrap).forEach(x => x.classList.toggle("is-active", x === b));
    renderStudentReport();
  }));
}

function renderStudentReport() {
  const box = $("#admin-student-report");
  if (!selectedStudentId) { box.innerHTML = ""; return; }
  const data = buildStudentReport(selectedStudentId, selectedPeriod, null);
  if (!data) { box.innerHTML = ""; return; }

  const attendanceHTML = data.attendanceByMonth.length ? data.attendanceByMonth.map(m => `
    <p style="margin-bottom:6px;font-size:13.5px"><strong>${m.label}:</strong> حاضر ${fa(m.present)} روز
      ${m.absentDates.length ? ` · ${fa(m.absentDates.length)} بار غیبت` : ""}
      ${m.lateEntries.length ? ` · ${fa(m.lateEntries.length)} بار تأخیر` : ""}</p>`).join("")
    : `<p class="empty-state empty-state--inline">حضوری برای این بازه ثبت نشده است.</p>`;

  box.innerHTML = `
    <section class="panel" style="margin-bottom:var(--space-4)">
      <div class="panel__header"><h2>${data.student.name}</h2></div>
      ${data.subjectRows.length ? `
        <div class="eval-table-wrap">
          <table class="eval-table">
            <thead><tr><th>درس</th><th>سطح</th><th>تعداد</th></tr></thead>
            <tbody>${data.subjectRows.map(r => `<tr><td>${r.subject.name}</td><td>${r.label}</td><td>${fa(r.count)}</td></tr>`).join("")}</tbody>
          </table>
        </div>` : `<p class="empty-state empty-state--inline">هنوز ارزشیابی‌ای ثبت نشده است.</p>`}
    </section>
    <section class="panel">
      <div class="panel__header"><h2>حضور و غیاب</h2></div>
      ${attendanceHTML}
    </section>`;
}

/* ---------- Tab 3 (super_admin only): user management ---------- */
const ROLE_LABELS = { teacher: "معلم", admin: "مدیر", vice_principal: "معاون", parent: "ولی", super_admin: "سوپر ادمین" };

async function renderUserManagement() {
  const { loadAllUsers } = await import("./store.js");
  const users = await loadAllUsers();
  const wrap = $("#admin-user-list");
  $("#admin-users-empty").hidden = users.length > 0;

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
    const { changeUserRole } = await import("./store.js");
    if (!confirm(`نقش این کاربر به «${ROLE_LABELS[sel.value]}» تغییر کند؟`)) { renderUserManagement(); return; }
    try { await changeUserRole(sel.dataset.roleSelect, sel.value); toast("نقش تغییر کرد"); renderUserManagement(); }
    catch (err) { alert("تغییر نقش ناموفق بود: " + translateError(err)); renderUserManagement(); }
  }));
  $$("[data-toggle-active]", wrap).forEach(b => b.addEventListener("click", async () => {
    const { setUserActive } = await import("./store.js");
    const willActivate = b.dataset.current !== "true";
    if (!confirm(willActivate ? "این حساب فعال شود؟" : "این حساب غیرفعال شود؟")) return;
    try { await setUserActive(b.dataset.toggleActive, willActivate); toast(willActivate ? "حساب فعال شد" : "حساب غیرفعال شد"); renderUserManagement(); }
    catch (err) { alert("عملیات ناموفق بود: " + translateError(err)); }
  }));
  $$("[data-delete-user]", wrap).forEach(b => b.addEventListener("click", async () => {
    const { deleteUser } = await import("./store.js");
    if (!confirm("این کاربر برای همیشه حذف شود؟ این کار قابل بازگشت نیست.")) return;
    try { await deleteUser(b.dataset.deleteUser); toast("کاربر حذف شد", "error"); renderUserManagement(); }
    catch (err) { alert("حذف ناموفق بود: " + translateError(err)); }
  }));
}

/* ---------- init ---------- */
export function initAdmin() {
  const profile = getProfile();
  const isSuperAdmin = profile?.role === "super_admin";
  const label = $("#admin-role-label");
  if (label) label.textContent = ROLE_LABELS[profile?.role] || "مدیر";

  // Approving/rejecting admin & vice-principal accounts, and all user
  // management, are exclusively the super_admin's job now — a regular
  // admin/vice_principal only ever sees the Classes tab.
  const queueTabBtn = $('[data-admin-tab="queue"]');
  const usersTabBtn = $('[data-admin-tab="users"]');
  if (queueTabBtn) queueTabBtn.hidden = !isSuperAdmin;
  if (usersTabBtn) usersTabBtn.hidden = !isSuperAdmin;

  const defaultTab = isSuperAdmin ? "queue" : "classes";
  $$("#admin-tabs .pill-tab").forEach(b => b.classList.toggle("is-active", b.dataset.adminTab === defaultTab));
  $("#admin-tab-queue").hidden = defaultTab !== "queue";
  $("#admin-tab-classes").hidden = defaultTab !== "classes";
  $("#admin-tab-users").hidden = true;
  if (defaultTab === "classes") renderTeacherList();

  $$("#admin-tabs .pill-tab").forEach(b => b.addEventListener("click", () => {
    if (b.hidden) return; // safety: never activate a tab this role can't see
    $$("#admin-tabs .pill-tab").forEach(x => x.classList.toggle("is-active", x === b));
    const tab = b.dataset.adminTab;
    $("#admin-tab-queue").hidden = tab !== "queue";
    $("#admin-tab-classes").hidden = tab !== "classes";
    $("#admin-tab-users").hidden = tab !== "users";
    if (tab === "classes" && !teachers.length) renderTeacherList();
    if (tab === "users") renderUserManagement();
  }));

  $("#admin-back-to-teachers")?.addEventListener("click", () => {
    $("#admin-teacher-picker").hidden = false;
    $("#admin-student-picker").hidden = true;
    selectedStudentId = null;
  });

  $$("#admin-period-tabs .pill-tab").forEach(b => b.addEventListener("click", () => {
    selectedPeriod = b.dataset.period;
    $$("#admin-period-tabs .pill-tab").forEach(x => x.classList.toggle("is-active", x === b));
    renderStudentReport();
  }));

  $("#admin-sign-out")?.addEventListener("click", async () => {
    await signOut();
    window.location.reload();
  });

  if (isSuperAdmin) renderQueue();
}
