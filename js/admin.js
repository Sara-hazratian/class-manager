/* ============================================================
   ADMIN VIEW — two tabs:
   1. Approval queue (pending admin/vice-principal sign-ups)
   2. Classes browser (every teacher → their students → full
      read-only report, reusing reports.js's buildStudentReport —
      the RLS admin-select policies already scope the data
      correctly, so no extra filtering is needed client-side)
   ============================================================ */
import { loadPendingApprovals, approveAccount, rejectAccount, getProfile, loadAdminData, getStudents } from "./store.js";
import { buildStudentReport } from "./reports.js";
import { $, $$, toast } from "./ui.js";
import { fa } from "./jalali.js";
import { signOut } from "./auth.js";

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
          <p style="font-size:11.5px;color:var(--color-ink-faint);font-family:var(--font-mono)">کد پرسنلی: ${p.personnelCode || "—"} · نام کاربری: ${p.username}</p>
          ${p.documentPath ? `<p style="font-size:11.5px;color:var(--color-info);margin-top:4px">📎 فایل ابلاغ آپلود شده است</p>` : `<p style="font-size:11.5px;color:var(--color-danger);margin-top:4px">⚠️ فایلی آپلود نشده</p>`}
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0">
          <button type="button" class="btn btn--primary btn--sm" data-approve="${p.id}">تأیید</button>
          <button type="button" class="btn btn--danger btn--sm" data-reject="${p.id}">رد</button>
        </div>
      </div>
    </article>`).join("");

  $$("[data-approve]", wrap).forEach(b => b.addEventListener("click", async () => {
    if (!confirm("این حساب تأیید و فعال شود؟")) return;
    try { await approveAccount(b.dataset.approve); toast("حساب تأیید شد"); renderQueue(); }
    catch (err) { alert("تأیید ناموفق بود: " + err.message); }
  }));
  $$("[data-reject]", wrap).forEach(b => b.addEventListener("click", async () => {
    if (!confirm("این درخواست رد و حذف شود؟")) return;
    try { await rejectAccount(b.dataset.reject); toast("درخواست رد شد", "error"); renderQueue(); }
    catch (err) { alert("رد کردن ناموفق بود: " + err.message); }
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

/* ---------- init ---------- */
export function initAdmin() {
  const profile = getProfile();
  const label = $("#admin-role-label");
  if (label) label.textContent = profile?.role === "vice_principal" ? "معاون" : "مدیر";

  $$("#admin-tabs .pill-tab").forEach(b => b.addEventListener("click", () => {
    $$("#admin-tabs .pill-tab").forEach(x => x.classList.toggle("is-active", x === b));
    const isQueue = b.dataset.adminTab === "queue";
    $("#admin-tab-queue").hidden = !isQueue;
    $("#admin-tab-classes").hidden = isQueue;
    if (!isQueue && !teachers.length) renderTeacherList();
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

  renderQueue();
}
