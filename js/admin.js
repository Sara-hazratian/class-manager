/* ============================================================
   ADMIN VIEW — for admin/vice_principal/رahbar/سرگروه آموزشی.
   ONE screen: browse teachers → their students → full read-only
   report (reusing reports.js's buildStudentReport — the RLS
   policies already scope the data correctly per role, so no
   extra filtering is needed client-side). Admin/vice_principal
   can also promote a teacher to رahbar/سرگروه here.

   Super Admin has NO presence in this file or anywhere in the
   main app — that's a fully separate page (superadmin.html +
   js/superadmin.js), per design. Approving accounts, rejecting
   them, and full user management live there exclusively.
   ============================================================ */
import { getProfile, loadAdminData, loadOversightData, getStudents, findTeacherForSchool, addTeacherToMySchool, findPersonForAccessGrant, grantSchoolAccess } from "./store.js";
import { buildStudentReport } from "./reports.js";
import { $, $$, toast, translateError } from "./ui.js";
import { fa } from "./jalali.js";
import { signOut } from "./auth.js";

const GRADE_LABELS = { grade1: "پایه اول", grade2: "پایه دوم", grade3: "پایه سوم", grade4: "پایه چهارم", grade5: "پایه پنجم", grade6: "پایه ششم" };
const ROLE_LABELS = { teacher: "معلم", admin: "مدیر", vice_principal: "معاون", parent: "ولی", rahbar: "راهبر", group_leader: "سرگروه آموزشی" };

let teachers = [];
let selectedTeacherId = null;
let selectedStudentId = null;
let selectedPeriod = "term1";
let isOversightMode = false;

/* ---------- teachers → students → report ---------- */
async function renderTeacherList() {
  teachers = isOversightMode ? await loadOversightData() : await loadAdminData();
  const wrap = $("#admin-teacher-list");
  $("#admin-teachers-empty").hidden = teachers.length > 0;

  wrap.innerHTML = teachers.map(t => `
    <button type="button" class="card card--interactive" data-teacher="${t.id}" style="text-align:center;aspect-ratio:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;padding:var(--space-2)">
      <svg class="icon" style="width:22px;height:22px;color:var(--color-primary)"><use href="#i-users"/></svg>
      <p style="font-weight:700;font-size:12px;line-height:1.3">${t.fullName || t.username}</p>
      <p style="font-size:10px;color:var(--color-ink-soft)">${GRADE_LABELS[t.grade] || ""} · ${t.className || ""}</p>
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

/* ---------- اعطای دسترسی نظارتی راهبر/سرگروه (admin/VP only) — دسترسی
   افزوده است، نه جایگزین نقش؛ فرد همچنان معلم/نقش خودش باقی می‌ماند و
   می‌تواند به‌طور همزمان به چند مدرسه‌ی دیگر هم دسترسی نظارتی داشته
   باشد. لازم نیست از قبل معلم همین مدرسه یا حتی معلم باشد. ---------- */
function renderPromotePanel() {
  const toggleGradeVisibility = () => {
    $("#promote-grade-wrap").hidden = $("#promote-role-select").value !== "group_leader";
  };
  $("#promote-role-select").addEventListener("change", toggleGradeVisibility);
  toggleGradeVisibility();
}

/* ---------- افزودن معلم به مدرسه‌ی خودم (admin/VP only) ---------- */
function renderAddTeacherPanel() {
  const resultBox = $("#find-teacher-result");
  const errorEl = $("#find-teacher-error");

  $("#admin-find-teacher-form").addEventListener("submit", async e => {
    e.preventDefault();
    const code = $("#find-teacher-code").value.trim();
    const phone = $("#find-teacher-phone").value.trim();
    errorEl.textContent = "";
    resultBox.innerHTML = "";

    try {
      const found = await findTeacherForSchool(code, phone);
      resultBox.innerHTML = `
        <div class="card" style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
          <div>
            <p style="font-weight:700">${found.full_name || "(بدون نام)"}</p>
            <p style="font-size:12px;color:var(--color-ink-soft)">${found.already_in_school ? "قبلاً به این مدرسه اضافه شده است" : "آماده‌ی افزودن"}</p>
          </div>
          <button type="button" class="btn btn--primary btn--sm" id="confirm-add-teacher" ${found.already_in_school ? "disabled" : ""}>افزودن به مدرسه</button>
        </div>`;

      $("#confirm-add-teacher")?.addEventListener("click", async () => {
        try {
          await addTeacherToMySchool(code, phone);
          toast("معلم با موفقیت اضافه شد");
          resultBox.innerHTML = "";
          $("#admin-find-teacher-form").reset();
          await renderTeacherList();
          renderPromotePanel();
        } catch (err) {
          errorEl.textContent = translateError(err);
        }
      });
    } catch (err) {
      errorEl.textContent = translateError(err);
    }
  });
}

/* ---------- init ---------- */
export function initAdmin(oversightMode = false) {
  isOversightMode = oversightMode;
  const profile = getProfile();
  const canManageSchoolRoles = !oversightMode && ["admin", "vice_principal"].includes(profile?.role);
  const label = $("#admin-role-label");
  if (label) label.textContent = oversightMode ? "نظارت" : (ROLE_LABELS[profile?.role] || "مدیر");

  // Only admin/vice_principal can grant راهبر/سرگروه OR add teachers to
  // the school — not راهبر itself, and not سرگروه, and never in
  // oversight-mode (someone BROWSING via a grant, regardless of their
  // own separate role elsewhere, never manages the granting school).
  // These sidebar entries are entirely hidden for anyone else, not just
  // their content — nothing to click through to in the first place.
  $("#admin-nav-add-teacher").hidden = !canManageSchoolRoles;
  $("#admin-nav-add-leader").hidden = !canManageSchoolRoles;
  if (canManageSchoolRoles) renderAddTeacherPanel();

  $$("button[data-admin-view]").forEach(b => b.addEventListener("click", () => {
    if (b.hidden) return;
    $$("button[data-admin-view]").forEach(x => x.classList.toggle("is-active", x === b));
    $$("section.admin-view[data-admin-view]").forEach(v => { v.hidden = v.dataset.adminView !== b.dataset.adminView; });
  }));

  renderTeacherList().then(renderPromotePanel);

  $("#admin-promote-form")?.addEventListener("submit", async e => {
    e.preventDefault();
    const role = $("#promote-role-select").value;
    const grade = $("#promote-grade-select").value;
    const roleLabel = ROLE_LABELS[role];
    const errorEl = $("#promote-error");
    errorEl.textContent = "";

    // این شخص می‌تواند از هر مدرسه‌ای (یا اصلاً بدون نقش تدریس) باشد —
    // find_person_for_access_grant هیچ محدودیت هم‌مدرسه‌ای ندارد، برخلاف
    // «افزودن معلم» معمولی.
    const code = $("#promote-new-code").value.trim();
    const phone = $("#promote-new-phone").value.trim();
    if (!code || !phone) { errorEl.textContent = "کد پرسنلی و شماره موبایل را وارد کنید."; return; }

    try {
      const found = await findPersonForAccessGrant(code, phone);
      if (!confirm(`«${found.full_name || "این فرد"}» دسترسی «${roleLabel}»${role === "group_leader" ? ` برای پایه‌ی ${GRADE_LABELS[grade]}` : ""} به این مدرسه داده شود؟`)) return;

      await grantSchoolAccess(code, phone, role === "group_leader" ? grade : null);
      toast("دسترسی با موفقیت اعطا شد");
      $("#admin-promote-form").reset();
    } catch (err) {
      errorEl.textContent = translateError(err);
    }
  });

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

  const backBtn = $("#admin-back-to-dashboard");
  if (backBtn) {
    backBtn.hidden = !oversightMode;
    backBtn.addEventListener("click", async () => {
      const { showApp } = await import("./app.js");
      await showApp();
    });
  }
}
