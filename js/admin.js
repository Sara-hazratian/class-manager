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
import { getProfile, loadAdminData, loadOversightData, getStudents, findTeacherForSchool, addTeacherToMySchool, findPersonForAccessGrant, grantSchoolAccess, loadTeacherSchedule, applyTeacherSchedule, DAYS, PERIODS, SUBJECTS } from "./store.js";
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
  // Report UI lives inside the "کلاس‌ها" tab's markup — force that tab
  // active so the report is actually visible, even when reached via
  // «مدارس» → a specific school → a class.
  $$("button[data-admin-view]").forEach(x => x.classList.toggle("is-active", x.dataset.adminView === "classes"));
  $$("section.admin-view[data-admin-view]").forEach(v => { v.hidden = v.dataset.adminView !== "classes"; });

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

/* ---------- «مدارس» (oversight mode only): مدرسه را انتخاب کن، بعد
   کلاس‌های همان مدرسه را ببین — همان داده‌ی «کلاس‌ها» فقط گروه‌بندی‌شده
   بر اساس مدرسه، به‌جای یک لیست تخت. ---------- */
function renderSchoolsView() {
  const bySchool = new Map();
  teachers.forEach(t => {
    const key = t.schoolId || t.schoolName || "نامشخص";
    if (!bySchool.has(key)) bySchool.set(key, { name: t.schoolName || "نامشخص", teachers: [] });
    bySchool.get(key).teachers.push(t);
  });

  const wrap = $("#admin-school-list");
  const schools = [...bySchool.entries()];
  $("#admin-schools-empty").hidden = schools.length > 0;
  wrap.innerHTML = schools.map(([key, s]) => `
    <button type="button" class="card card--interactive" data-school="${key}" style="text-align:center;aspect-ratio:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;padding:var(--space-2)">
      <svg class="icon" style="width:24px;height:24px;color:var(--color-primary)"><use href="#i-map"/></svg>
      <p style="font-weight:700;font-size:12.5px">${s.name}</p>
      <p style="font-size:10px;color:var(--color-ink-soft)">${fa(s.teachers.length)} کلاس</p>
    </button>`).join("");

  $$("[data-school]", wrap).forEach(b => b.addEventListener("click", () => {
    const s = bySchool.get(b.dataset.school);
    $("#admin-school-picker").hidden = true;
    $("#admin-school-classes-picker").hidden = false;
    $("#admin-selected-school-name").textContent = s.name;

    const listWrap = $("#admin-school-teacher-list");
    listWrap.innerHTML = s.teachers.map(t => `
      <button type="button" class="card card--interactive" data-teacher="${t.id}" style="text-align:center;aspect-ratio:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;padding:var(--space-2)">
        <svg class="icon" style="width:22px;height:22px;color:var(--color-primary)"><use href="#i-users"/></svg>
        <p style="font-weight:700;font-size:12px;line-height:1.3">${t.fullName || t.username}</p>
        <p style="font-size:10px;color:var(--color-ink-soft)">${GRADE_LABELS[t.grade] || ""} · ${t.className || ""}</p>
      </button>`).join("");
    $$("[data-teacher]", listWrap).forEach(tb => tb.addEventListener("click", () => {
      selectedTeacherId = tb.dataset.teacher; selectedStudentId = null;
      renderStudentList();
    }));
  }));

  $("#admin-back-to-schools")?.addEventListener("click", () => {
    $("#admin-school-picker").hidden = false;
    $("#admin-school-classes-picker").hidden = true;
  });
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
    ${isOversightMode ? "" : `
    <section class="panel">
      <div class="panel__header"><h2>حضور و غیاب</h2></div>
      ${attendanceHTML}
    </section>`}`;
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

/* ---------- برنامه‌ی هفتگی توسط مدیر/معاون — می‌سازند/ویرایش می‌کنند،
   «تأیید و اعمال» مستقیم در صفحه‌ی همان معلم قابل مشاهده می‌شود.
   معلم همچنان می‌تواند فقط برنامه‌ی خودش را (از صفحه‌ی تنظیمات) ویرایش
   کند — این تغییری در آن دسترسی نمی‌دهد. ---------- */
let adminScheduleDraft = null;
let adminScheduleTeacherId = null;

function renderAdminScheduleGrid() {
  const grid = $("#admin-schedule-grid");
  if (!grid || !adminScheduleDraft) return;
  let html = `<div class="cell cell--head">زنگ</div>` + DAYS.map(d => `<div class="cell cell--head">${d}</div>`).join("");
  for (let p = 0; p < PERIODS; p++) {
    html += `<div class="cell cell--head">زنگ ${fa(p + 1)}</div>`;
    for (let d = 0; d < DAYS.length; d++) {
      const current = adminScheduleDraft[d]?.[p] || "";
      html += `<div class="cell"><select data-day="${d}" data-period="${p}">
        <option value="">—</option>
        ${SUBJECTS.map(s => `<option value="${s.id}" ${s.id === current ? "selected" : ""}>${s.name}</option>`).join("")}
      </select></div>`;
    }
  }
  grid.innerHTML = html;
  $$("select[data-day]", grid).forEach(sel => sel.addEventListener("change", () => {
    const d = sel.dataset.day, p = Number(sel.dataset.period);
    if (!adminScheduleDraft[d]) adminScheduleDraft[d] = [];
    adminScheduleDraft[d][p] = sel.value;
  }));
}

async function renderAdminScheduleTab() {
  const sel = $("#admin-schedule-teacher-select");
  sel.innerHTML = teachers.map(t => `<option value="${t.id}">${t.fullName || t.username} — ${GRADE_LABELS[t.grade] || ""} ${t.className || ""}</option>`).join("");
  if (!teachers.length) { $("#admin-schedule-grid").innerHTML = ""; return; }

  const loadFor = async teacherId => {
    adminScheduleTeacherId = teacherId;
    adminScheduleDraft = await loadTeacherSchedule(teacherId);
    renderAdminScheduleGrid();
    $("#admin-schedule-status").textContent = "";
  };

  sel.addEventListener("change", () => loadFor(sel.value));
  await loadFor(sel.value || teachers[0]?.id);

  $("#admin-schedule-apply-btn").addEventListener("click", async () => {
    if (!adminScheduleTeacherId) return;
    try {
      await applyTeacherSchedule(adminScheduleTeacherId, adminScheduleDraft);
      $("#admin-schedule-status").textContent = "برنامه با موفقیت اعمال شد و در صفحه‌ی معلم قابل مشاهده است.";
      toast("برنامه اعمال شد");
    } catch (err) {
      $("#admin-schedule-status").style.color = "var(--color-danger)";
      $("#admin-schedule-status").textContent = translateError(err);
    }
  });
}

/* ---------- «همه‌ی دانش‌آموزان» — لیست تخت با جستجو، کلیک روی هرکدوم
   مستقیم گزارش همان دانش‌آموز را باز می‌کند (بدون نیاز به رفتن به تب
   «کلاس‌ها» و انتخاب معلم اول). ---------- */
function renderAllStudentsList(filterText = "") {
  const wrap = $("#admin-all-students-list");
  const allStudents = getStudents();
  const teacherById = new Map(teachers.map(t => [t.id, t]));
  const q = filterText.trim().toLowerCase();
  const filtered = q ? allStudents.filter(s => s.name.toLowerCase().includes(q)) : allStudents;

  $("#admin-all-students-empty").hidden = filtered.length > 0;
  wrap.innerHTML = filtered.map(s => {
    const t = teacherById.get(s.teacherId);
    return `
    <button type="button" class="card card--interactive" data-all-student="${s.id}" data-owner-teacher="${s.teacherId}" style="text-align:center;aspect-ratio:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;padding:var(--space-2)">
      <svg class="icon" style="width:22px;height:22px;color:var(--color-primary)"><use href="#i-users"/></svg>
      <p style="font-weight:700;font-size:12px;line-height:1.3">${s.name}</p>
      <p style="font-size:10px;color:var(--color-ink-soft)">${t ? `${GRADE_LABELS[t.grade] || ""} · ${t.className || ""}` : ""}</p>
    </button>`;
  }).join("");

  $$("[data-all-student]", wrap).forEach(b => b.addEventListener("click", () => {
    selectedTeacherId = b.dataset.ownerTeacher;
    selectedStudentId = b.dataset.allStudent;
    renderStudentList();
    // یک دانش‌آموز مشخص از قبل انتخاب شده — مستقیم گزارشش را نشان بده.
    $$("[data-student]", $("#admin-student-list")).forEach(x => x.classList.toggle("is-active", x.dataset.student === selectedStudentId));
    renderStudentReport();
  }));
}

function renderAllStudentsTab() {
  renderAllStudentsList();
  $("#admin-all-students-search").addEventListener("input", e => renderAllStudentsList(e.target.value));
}

/* ---------- init ---------- */
export function initAdmin(oversightMode = false) {
  isOversightMode = oversightMode;

  // Wire the sidebar navigation FIRST, before anything else — this way,
  // even if a later step throws for an unrelated reason, clicking between
  // "کلاس‌ها" / "افزودن معلم" / "افزودن راهبر/سرگروه" always still works.
  $$("button[data-admin-view]").forEach(b => b.addEventListener("click", () => {
    if (b.hidden) return;
    $$("button[data-admin-view]").forEach(x => x.classList.toggle("is-active", x === b));
    $$("section.admin-view[data-admin-view]").forEach(v => { v.hidden = v.dataset.adminView !== b.dataset.adminView; });
  }));

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
  const addTeacherNav = $("#admin-nav-add-teacher");
  const addLeaderNav = $("#admin-nav-add-leader");
  const schoolsNav = $("#admin-nav-schools");
  const scheduleNav = $("#admin-nav-schedule");
  const allStudentsNav = $("#admin-nav-all-students");
  if (addTeacherNav) addTeacherNav.hidden = !canManageSchoolRoles;
  if (addLeaderNav) addLeaderNav.hidden = !canManageSchoolRoles;
  if (scheduleNav) scheduleNav.hidden = !canManageSchoolRoles;
  if (allStudentsNav) allStudentsNav.hidden = !canManageSchoolRoles;
  // «مدارس» فقط برای راهبر/سرگروه معنا دارد — مدیر/معاون خودش یک مدرسه
  // است، چیزی برای گروه‌بندی وجود ندارد.
  if (schoolsNav) schoolsNav.hidden = !oversightMode;
  if (canManageSchoolRoles) renderAddTeacherPanel();

  renderTeacherList().then(() => {
    renderPromotePanel();
    if (oversightMode) renderSchoolsView();
    if (canManageSchoolRoles) { renderAdminScheduleTab(); renderAllStudentsTab(); }
  });

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
