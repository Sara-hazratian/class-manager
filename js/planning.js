/* ============================================================
   PLANNING (Phase 12) — Weekly Schedule + Annual Budgeting
   (بودجه‌بندی سالانه), refined per feedback:
     - Schedule now has an explicit view/edit toggle + a Save
       button, instead of saving on every dropdown click (too
       easy to change by accident).
     - Budgeting is scoped to the teacher's own grade (read from
       the Setup profile) and starts from an official per-grade
       seed (DEFAULT_BUDGET below) that the teacher can still
       edit — their edits always win over the seed.
   ============================================================ */
import { SUBJECTS, DAYS, PERIODS, getSchedule, setSchedule, getAnnualPlan, setAnnualPlan, getProfile, SUBJECT_PAGE_COUNTS, subjectById } from "./store.js";
import { $, $$, toast, debounce } from "./ui.js";
import { fa } from "./jalali.js";
import { registerTitle, onViewChange } from "./router.js";

registerTitle("planning", "برنامه‌ریزی");

// The 9 academic months, Mehr → Khordad — same order used across the app.
const ACADEMIC_MONTHS = [
  { key: "mehr", label: "مهر" }, { key: "aban", label: "آبان" }, { key: "azar", label: "آذر" },
  { key: "dey", label: "دی" }, { key: "bahman", label: "بهمن" }, { key: "esfand", label: "اسفند" },
  { key: "farvardin", label: "فروردین" }, { key: "ordibehesht", label: "اردیبهشت" }, { key: "khordad", label: "خرداد" },
];

let budgetSubjectId = SUBJECTS[0].id;
let scheduleEditing = false;

/* ---------- Weekly schedule (view + edit modes) ---------- */
export function renderSchedule() {
  const grid = $("#schedule-grid"); if (!grid) return;
  const schedule = getSchedule();

  $("#btn-edit-schedule").hidden = scheduleEditing;
  $("#schedule-edit-actions").hidden = !scheduleEditing;

  let html = `<div class="cell cell--head">زنگ</div>` + DAYS.map(d => `<div class="cell cell--head">${d}</div>`).join("");
  for (let p = 0; p < PERIODS; p++) {
    html += `<div class="cell cell--head">زنگ ${fa(p + 1)}</div>`;
    for (let d = 0; d < DAYS.length; d++) {
      const current = schedule[d]?.[p] || "";
      if (scheduleEditing) {
        html += `<div class="cell"><select data-day="${d}" data-period="${p}">
          <option value="">—</option>
          ${SUBJECTS.map(s => `<option value="${s.id}" ${s.id === current ? "selected" : ""}>${s.name}</option>`).join("")}
        </select></div>`;
      } else {
        const subj = SUBJECTS.find(s => s.id === current);
        html += `<div class="cell" style="${subj ? `background:${subj.tint};color:${subj.color};font-weight:700` : ""}">${subj ? subj.name : "—"}</div>`;
      }
    }
  }
  grid.innerHTML = html;
}

function saveScheduleFromGrid() {
  const grid = $("#schedule-grid");
  const sc = getSchedule();
  $$("select[data-day]", grid).forEach(sel => {
    const d = sel.dataset.day, p = Number(sel.dataset.period);
    if (!sc[d]) sc[d] = [];
    sc[d][p] = sel.value;
  });
  setSchedule(sc);
  document.dispatchEvent(new Event("data:changed"));
}

function enterScheduleEdit() { scheduleEditing = true; renderSchedule(); }
function cancelScheduleEdit() { scheduleEditing = false; renderSchedule(); } // discards unsaved dropdown changes
function commitScheduleEdit() {
  saveScheduleFromGrid();
  scheduleEditing = false;
  renderSchedule();
  toast("برنامه هفتگی ذخیره شد");
}

/* ---------- Annual budgeting (بودجه‌بندی سالانه), scoped to the teacher's grade ---------- */
function currentGrade() { return getProfile()?.grade || "grade3"; }

function pageCountFor(grade, subjectId) {
  return SUBJECT_PAGE_COUNTS?.[grade]?.[subjectId] || null;
}

function saveBudgetCell(grade, subjectId, monthKey, value) {
  const plan = getAnnualPlan();
  if (!plan[grade]) plan[grade] = {};
  if (!plan[grade][subjectId]) plan[grade][subjectId] = {};
  plan[grade][subjectId][monthKey] = value;
  setAnnualPlan(plan);
}
const saveBudgetCellDebounced = debounce(saveBudgetCell, 400);

function budgetValueFor(grade, subjectId, monthKey) {
  return getAnnualPlan()?.[grade]?.[subjectId]?.[monthKey];
}

export function renderBudget() {
  const wrap = $("#budget-rows"); if (!wrap) return;
  const grade = currentGrade();
  const gradeLabelEl = $("#budget-grade-label");
  if (gradeLabelEl) gradeLabelEl.textContent = GRADE_LABELS[grade] || grade;

  const totalPages = pageCountFor(grade, budgetSubjectId);

  if (totalPages) {
    // Page-range mode: two dropdowns per month, exactly like the weekly schedule's pattern.
    const pageOptions = (selected) => {
      let html = `<option value="">—</option>`;
      for (let p = 1; p <= totalPages; p++) html += `<option value="${p}" ${Number(selected) === p ? "selected" : ""}>${fa(p)}</option>`;
      return html;
    };
    wrap.innerHTML = ACADEMIC_MONTHS.map(m => {
      const saved = budgetValueFor(grade, budgetSubjectId, m.key);
      const from = saved && typeof saved === "object" ? saved.from : "";
      const to = saved && typeof saved === "object" ? saved.to : "";
      return `
      <div class="plan-row" style="grid-template-columns:120px 1fr">
        <div class="plan-row__subject">${m.label}</div>
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <span style="font-size:12.5px;color:var(--color-ink-soft)">از صفحه</span>
          <select class="select-control" style="width:auto" data-page-from="${m.key}">${pageOptions(from)}</select>
          <span style="font-size:12.5px;color:var(--color-ink-soft)">تا صفحه</span>
          <select class="select-control" style="width:auto" data-page-to="${m.key}">${pageOptions(to)}</select>
        </div>
      </div>`;
    }).join("");

    const saveFromPair = (monthKey) => {
      const from = $(`[data-page-from="${monthKey}"]`, wrap).value;
      const to = $(`[data-page-to="${monthKey}"]`, wrap).value;
      if (!from && !to) { saveBudgetCell(grade, budgetSubjectId, monthKey, null); return; }
      saveBudgetCell(grade, budgetSubjectId, monthKey, { from: from ? Number(from) : null, to: to ? Number(to) : null });
    };
    $$("[data-page-from]", wrap).forEach(sel => sel.addEventListener("change", () => { saveFromPair(sel.dataset.pageFrom); toast("بودجه‌بندی ذخیره شد"); }));
    $$("[data-page-to]", wrap).forEach(sel => sel.addEventListener("change", () => { saveFromPair(sel.dataset.pageTo); toast("بودجه‌بندی ذخیره شد"); }));
    return;
  }

  // Fallback: free text, for subjects without an official page count yet (Writing, Art, PE, Discipline…).
  wrap.innerHTML = `
    <p class="empty-state empty-state--inline" style="margin-bottom:var(--space-3)">
      برای «${subjectById(budgetSubjectId)?.name}» در پایه‌ی ${GRADE_LABELS[grade]} هنوز تعداد صفحه ثبت نشده — فعلاً به‌صورت متنی بنویسید.
    </p>` +
    ACADEMIC_MONTHS.map(m => {
      const saved = budgetValueFor(grade, budgetSubjectId, m.key);
      const text = typeof saved === "string" ? saved : "";
      return `
      <div class="plan-row">
        <div class="plan-row__subject">${m.label}</div>
        <textarea data-month="${m.key}" rows="2" placeholder="مباحث و سرفصل‌های ${m.label}…">${text}</textarea>
      </div>`;
    }).join("");

  $$("[data-month]", wrap).forEach(ta => ta.addEventListener("input", () => saveBudgetCellDebounced(grade, budgetSubjectId, ta.dataset.month, ta.value)));
}

const GRADE_LABELS = { grade1: "پایه اول", grade2: "پایه دوم", grade3: "پایه سوم", grade4: "پایه چهارم", grade5: "پایه پنجم", grade6: "پایه ششم" };

function renderBudgetSubjectDropdown() {
  const subjSel = $("#budget-subject");
  const grade = currentGrade();
  const gradeSubjectIds = Object.keys(SUBJECT_PAGE_COUNTS?.[grade] || {});
  // Keep them in the same order as the master SUBJECTS list, but only the ones this grade actually teaches.
  const gradeSubjects = SUBJECTS.filter(s => gradeSubjectIds.includes(s.id));

  const keep = subjSel.value || budgetSubjectId;
  subjSel.innerHTML = gradeSubjects.map(s => `<option value="${s.id}">${s.name}</option>`).join("");
  budgetSubjectId = gradeSubjects.some(s => s.id === keep) ? keep : (gradeSubjects[0]?.id || null);
  subjSel.value = budgetSubjectId || "";
}

export function initPlanning() {
  $$("#plan-tabs .pill-tab").forEach(b => b.addEventListener("click", () => {
    $$("#plan-tabs .pill-tab").forEach(x => x.classList.toggle("is-active", x === b));
    const weekly = b.dataset.planTab === "weekly";
    $("#plan-weekly").hidden = !weekly;
    $("#plan-budget").hidden = weekly;
  }));

  $("#btn-edit-schedule")?.addEventListener("click", enterScheduleEdit);
  $("#btn-save-schedule")?.addEventListener("click", commitScheduleEdit);
  $("#btn-cancel-schedule")?.addEventListener("click", cancelScheduleEdit);

  $("#budget-subject")?.addEventListener("change", () => { budgetSubjectId = $("#budget-subject").value; renderBudget(); });

  onViewChange(name => { if (name === "planning") { scheduleEditing = false; renderSchedule(); renderBudgetSubjectDropdown(); renderBudget(); } });
  document.addEventListener("data:changed", () => {
    if ($("#view-planning").hidden) return;
    renderBudgetSubjectDropdown(); // grade may have changed via Settings
    renderBudget();
  });
  renderSchedule();
  renderBudgetSubjectDropdown();
  renderBudget();
}
