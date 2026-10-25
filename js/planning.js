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
import { SUBJECTS, DAYS, PERIODS, getSchedule, setSchedule, getAnnualPlan, setAnnualPlan, getProfile, SUBJECT_PAGE_COUNTS, subjectById, isPro, rpcClassPerformance } from "./store.js";
import { $, $$, toast, debounce, esc, proLockHTML } from "./ui.js";
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

/* ============================================================
   تحلیل عملکرد کلاس (نه بودجه‌بندی) — بر اساس ارزشیابی‌های ثبت‌شده،
   نه یک فهرست صفحات. هر سطح کیفی (عالی/خوب/قابل قبول/نیاز به تلاش)
   به یک امتیاز عددی تبدیل می‌شود تا بشود میانگین گرفت، دقیقاً مثل
   مثال‌های سند: «کسرها → ۴۳٪ → نیاز به تقویت».
   ============================================================ */
const NEEDS_IMPROVEMENT_THRESHOLD = 50;

function performanceLabel(score) {
  if (score < NEEDS_IMPROVEMENT_THRESHOLD) return { label: "نیاز به تقویت", cls: "chip--danger" };
  if (score < 70) return { label: "متوسط", cls: "chip--warning" };
  return { label: "خوب", cls: "chip--excellent" };
}

let perfToken = 0;
function perfMessage(text) {
  $("#performance-summary").innerHTML = `<p class="empty-state empty-state--inline">${text}</p>`;
  $("#performance-insights").innerHTML = "";
  $("#performance-subjects").innerHTML = "";
}

/** داده‌ی تحلیل از سرور می‌آید (class_performance_analysis)؛ برچسب‌ها و یافته‌های متنی فقط از روی اعداد ساخته می‌شوند. */
function shapeAnalysis(raw) {
  const subjects = (raw?.subjects || []).map(s => ({
    subjectId: s.subject_id,
    subjectName: subjectById(s.subject_id)?.name || s.subject_id,
    avg: s.avg,
    ...(s.avg !== null && s.avg !== undefined ? performanceLabel(s.avg) : { label: "—", cls: "" }),
    topics: (s.topics || []).map(t => ({
      topic: t.topic, avg: t.avg, ...performanceLabel(t.avg),
      studentCount: t.student_count, needingPct: t.needing_pct,
    })),
  }));
  const insights = [];
  subjects.forEach(s => {
    const weakest = s.topics[0];
    if (weakest && weakest.avg < NEEDS_IMPROVEMENT_THRESHOLD) {
      insights.push(`ضعیف‌ترین موضوع در «${s.subjectName}»، «${weakest.topic}» است (${fa(weakest.avg)}٪).`);
    }
    s.topics.forEach(t => {
      if (t.needingPct >= 50) {
        insights.push(`${fa(t.needingPct)}٪ از دانش‌آموزان به تمرین بیشتر در «${t.topic}» (${s.subjectName}) نیاز دارند.`);
      }
    });
  });
  return { subjects, insights, overallAvg: raw?.overall_avg ?? null };
}

async function renderClassPerformance() {
  if (!isPro()) {
    $("#performance-summary").innerHTML = proLockHTML("تحلیل عملکرد کلاس");
    $("#performance-insights").innerHTML = "";
    $("#performance-subjects").innerHTML = "";
    return;
  }
  const token = ++perfToken;
  perfMessage("در حال محاسبه…");
  const { data: raw, error } = await rpcClassPerformance();
  if (token !== perfToken) return;
  if (error) {
    if (error.code === "PRO_REQUIRED") { $("#performance-summary").innerHTML = proLockHTML("تحلیل عملکرد کلاس"); $("#performance-insights").innerHTML = ""; $("#performance-subjects").innerHTML = ""; return; }
    perfMessage(error.code === "PREVIEW" ? "در حالت پیش‌نمایش، این تحلیل در دسترس نیست." : "دریافت تحلیل ممکن نشد. اتصال اینترنت را بررسی کنید و دوباره تلاش کنید.");
    return;
  }
  const data = shapeAnalysis(raw);


  const summaryBox = $("#performance-summary");
  summaryBox.innerHTML = `
    <div class="panel__header"><h2>خلاصه‌ی عملکرد کلاس</h2></div>
    ${data.overallAvg !== null ? `
      <p style="font-size:15px">میانگین کلی کلاس: <strong>${fa(data.overallAvg)}٪</strong>
        <span class="chip ${performanceLabel(data.overallAvg).cls}" style="margin-inline-start:8px">${performanceLabel(data.overallAvg).label}</span>
      </p>` : `<p class="empty-state empty-state--inline">هنوز ارزشیابی‌ای با موضوع مشخص ثبت نشده — از صفحه‌ی «ارزشیابی درس»، فیلد «موضوع» را پر کنید تا این تحلیل نمایش داده شود.</p>`}
  `;

  const insightsBox = $("#performance-insights");
  insightsBox.innerHTML = data.insights.length ? `
    <section class="panel">
      <div class="panel__header"><h2>یافته‌های خودکار</h2></div>
      ${data.insights.map(i => `<p style="font-size:13.5px;margin-bottom:6px">💡 ${esc(i)}</p>`).join("")}
    </section>` : "";

  const subjectsBox = $("#performance-subjects");
  subjectsBox.innerHTML = data.subjects.map(s => `
    <section class="panel" style="margin-bottom:var(--space-4)">
      <div class="panel__header">
        <h2>${s.subjectName}</h2>
        ${s.avg !== null ? `<span class="chip ${s.cls}">${fa(s.avg)}٪ · ${s.label}</span>` : ""}
      </div>
      ${s.topics.length ? `
        <div class="eval-table-wrap">
          <table class="eval-table">
            <thead><tr><th>موضوع</th><th>میانگین</th><th>وضعیت</th><th>نیاز به تمرین بیشتر</th></tr></thead>
            <tbody>${s.topics.map(t => `
              <tr>
                <td>${esc(t.topic)}</td>
                <td>${fa(t.avg)}٪</td>
                <td><span class="chip ${t.cls}">${t.label}</span></td>
                <td>${t.needingPct > 0 ? `${fa(t.needingPct)}٪ از ${fa(t.studentCount)} دانش‌آموز` : "—"}</td>
              </tr>`).join("")}</tbody>
          </table>
        </div>` : `<p class="empty-state empty-state--inline">ارزشیابی‌ای با موضوع مشخص برای این درس ثبت نشده است.</p>`}
    </section>`).join("") || `<p class="empty-state empty-state--inline">هنوز داده‌ای برای تحلیل وجود ندارد.</p>`;
}

export function initPlanning() {
  $$("#plan-tabs .pill-tab").forEach(b => b.addEventListener("click", () => {
    $$("#plan-tabs .pill-tab").forEach(x => x.classList.toggle("is-active", x === b));
    const tab = b.dataset.planTab;
    $("#plan-weekly").hidden = tab !== "weekly";
    $("#plan-performance").hidden = tab !== "performance";
    $("#plan-budget").hidden = tab !== "budget";
    if (tab === "performance") renderClassPerformance();
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
    if (!$("#plan-performance").hidden) renderClassPerformance();
  });
  document.addEventListener("pro:changed", () => { if (!$("#plan-performance").hidden) renderClassPerformance(); });
  renderSchedule();
  renderBudgetSubjectDropdown();
  renderBudget();
}
