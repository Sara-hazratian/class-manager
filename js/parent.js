/* ============================================================
   PARENT VIEW — read-only. A parent can:
   - add a child by national ID (link_child_to_parent RPC)
   - see each linked child's evaluations, attendance, discipline
     (reusing reports.js's buildStudentReport — the data is
     already scoped correctly by Row Level Security, so the same
     aggregation logic works unchanged for a parent's session)
   - see a per-subject progress trend chart (same chart the
     teacher sees — improvement/decline over time)
   - see tomorrow's class plan, if the teacher has written one
   No edit controls anywhere on this screen, by design.
   ============================================================ */
import { getStudents, addChildByNationalId, unlinkChild, getProfile, getEvaluations, SUBJECTS, loadChildTomorrowPlan } from "./store.js";
import { buildStudentReport, renderStudentReportHTML, ACADEMIC_MONTHS } from "./reports.js";
import { avgScore, lastNMonthlyBuckets, renderLineChart, renderTrendBadge } from "./progress.js";
import { $, $$, toast, translateError } from "./ui.js";
import { fa, formatJalaliLong } from "./jalali.js";
import { signOut } from "./auth.js";

let selectedChildId = null;
let selectedPeriod = "weekly";
let progressSubjectId = SUBJECTS[0].id;

function renderChildTabs() {
  const wrap = $("#parent-child-tabs");
  const students = getStudents();
  if (!students.length) {
    wrap.innerHTML = "";
    $("#parent-empty").hidden = false;
    $("#parent-content").hidden = true;
    return;
  }
  $("#parent-empty").hidden = true;
  $("#parent-content").hidden = false;
  if (!selectedChildId || !students.some(s => s.id === selectedChildId)) selectedChildId = students[0].id;

  wrap.innerHTML = students.map(s => `<button type="button" class="pill-tab ${s.id === selectedChildId ? "is-active" : ""}" data-child="${s.id}">${s.name}</button>`).join("");
  $$("[data-child]", wrap).forEach(b => b.addEventListener("click", () => { selectedChildId = b.dataset.child; renderChildTabs(); renderChildContent(); }));

  const selected = students.find(s => s.id === selectedChildId);
  const unlinkBtn = $("#parent-unlink-btn");
  if (unlinkBtn && selected) unlinkBtn.textContent = `«${selected.name}» اشتباه است؟ قطع ارتباط`;
}

function renderChildContent() {
  if (!selectedChildId) return;
  const box = $("#parent-report");
  const monthKey = selectedPeriod === "monthly" ? $("#parent-month-select")?.value : null;
  const data = buildStudentReport(selectedChildId, selectedPeriod, monthKey);
  if (!data) { box.innerHTML = ""; return; }
  // Same detailed renderer the teacher/admin views use — full per-topic
  // breakdown, strengths/needs-work, dated attendance and discipline entries.
  box.innerHTML = `<section class="panel">${renderStudentReportHTML(data)}</section>`;
  renderProgressChart(selectedChildId);
  renderTomorrowPlanBanner(selectedChildId);
}

async function renderTomorrowPlanBanner(studentId) {
  const banner = $("#parent-tomorrow-plan");
  const student = getStudents().find(s => s.id === studentId);
  if (!student?.teacherId) { banner.hidden = true; return; }
  const text = await loadChildTomorrowPlan(student.teacherId);
  if (!text) { banner.hidden = true; return; }
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  $("#parent-tomorrow-plan-text").textContent = `کارهای فردا (${formatJalaliLong(tomorrow)}): ${text}`;
  banner.hidden = false;
}

/** همون نمودار روندی که معلم برای هر دانش‌آموز می‌بینه — والدین هم
    حق دارن پیشرفت یا پسرفت فرزندشون رو تو هر درس، در طول زمان ببینن. */
async function renderProgressChart(studentId) {
  const sel = $("#parent-progress-subject");
  if (sel.innerHTML === "") sel.innerHTML = SUBJECTS.map(s => `<option value="${s.id}" ${s.id === progressSubjectId ? "selected" : ""}>${s.name}</option>`).join("");

  const subject = SUBJECTS.find(s => s.id === progressSubjectId) || SUBJECTS[0];
  const buckets = lastNMonthlyBuckets(8);
  const { toJalali } = await import("./jalali.js");
  const scores = buckets.map(b => avgScore(
    getEvaluations().filter(e => {
      if (e.studentId !== studentId || e.subjectId !== subject.id) return false;
      const j = toJalali(new Date(e.date + "T00:00:00"));
      return j.jy === b.jy && j.jm === b.jm;
    })
  ));
  const hasAny = scores.filter(s => s !== null).length >= 2;
  const box = $("#parent-progress-chart");
  box.innerHTML = `
    <div style="display:flex;align-items:center;flex-wrap:wrap;margin-bottom:10px">
      ${hasAny ? renderTrendBadge(scores) : ""}
    </div>
    ${hasAny ? renderLineChart(buckets, scores, subject.color, `parent-progress-gradient-${subject.id}`) : `<p class="empty-state empty-state--inline">برای رسم نمودار روند، حداقل به ارزشیابی در دو ماه مختلف نیاز است.</p>`}
  `;
}

export function renderParentView() {
  renderChildTabs();
  renderChildContent();
}

export function initParent() {
  $("#parent-add-child-form")?.addEventListener("submit", async e => {
    e.preventDefault();
    const nid = $("#parent-national-id").value.trim();
    const errorEl = $("#parent-add-error");
    errorEl.textContent = "";
    if (!/^\d{10}$/.test(nid)) { errorEl.textContent = "کد ملی باید دقیقاً ۱۰ رقم باشد."; return; }

    try {
      await addChildByNationalId(nid);
      const { loadParentData } = await import("./store.js");
      await loadParentData();
      $("#parent-national-id").value = "";
      renderParentView();
      toast("فرزند اضافه شد");
    } catch (err) {
      errorEl.textContent = translateError(err);
    }
  });

  const monthSel = $("#parent-month-select");
  if (monthSel) monthSel.innerHTML = ACADEMIC_MONTHS.map(([key, label]) => `<option value="${key}">${label}</option>`).join("");

  $$("#parent-period-tabs .pill-tab").forEach(b => b.addEventListener("click", () => {
    selectedPeriod = b.dataset.period;
    $$("#parent-period-tabs .pill-tab").forEach(x => x.classList.toggle("is-active", x === b));
    $("#parent-month-picker").hidden = selectedPeriod !== "monthly";
    renderChildContent();
  }));
  monthSel?.addEventListener("change", renderChildContent);

  $("#parent-progress-subject")?.addEventListener("change", e => {
    progressSubjectId = e.target.value;
    if (selectedChildId) renderProgressChart(selectedChildId);
  });

  $("#parent-unlink-btn")?.addEventListener("click", async () => {
    if (!selectedChildId) return;
    const s = getStudents().find(x => x.id === selectedChildId);
    if (!s) return;
    if (!confirm(`ارتباط با «${s.name}» قطع شود؟\n\nاگه اشتباهی این کد ملی وصل شده (مثلاً معلم زیر کلاس اشتباه ثبتش کرده)، با این کار ارتباط قطع می‌شه — می‌تونید بعداً با «افزودن فرزند» دوباره با کد ملی درست وصل بشید.`)) return;
    try {
      await unlinkChild(selectedChildId);
      selectedChildId = null;
      const { loadParentData } = await import("./store.js");
      await loadParentData();
      renderParentView();
      toast("ارتباط قطع شد");
    } catch (err) {
      toast(translateError(err), "error");
    }
  });

  $("#parent-sign-out")?.addEventListener("click", async () => {
    await signOut();
    window.location.reload();
  });

  renderParentView();
}
