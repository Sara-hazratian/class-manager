/* ============================================================
   PARENT VIEW — read-only. A parent can:
   - add a child by national ID (link_child_to_parent RPC)
   - see each linked child's evaluations, attendance, discipline
     (reusing reports.js's buildStudentReport — the data is
     already scoped correctly by Row Level Security, so the same
     aggregation logic works unchanged for a parent's session)
   - see a simple per-subject progress view
   No edit controls anywhere on this screen, by design.
   ============================================================ */
import { getStudents, addChildByNationalId, getProfile } from "./store.js";
import { buildStudentReport } from "./reports.js";
import { $, $$, toast } from "./ui.js";
import { fa } from "./jalali.js";
import { signOut } from "./auth.js";

const SCORE = { excellent: 4, good: 3, acceptable: 2, "needs-improvement": 1 };
let selectedChildId = null;
let selectedPeriod = "term1";

function subjectScore(studentId, subjectId, evaluations) {
  const list = evaluations.filter(e => e.studentId === studentId && e.subjectId === subjectId);
  if (!list.length) return null;
  const avg = list.reduce((s, e) => s + (SCORE[e.level] || 0), 0) / list.length;
  return Math.round((avg / 4) * 100);
}

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
  $$("[data-child]", wrap).forEach(b => b.addEventListener("click", () => { selectedChildId = b.dataset.child; renderChildContent(); }));
}

function renderChildContent() {
  if (!selectedChildId) return;
  const data = buildStudentReport(selectedChildId, selectedPeriod, null);
  const box = $("#parent-report");
  if (!data) { box.innerHTML = ""; return; }

  const attendanceHTML = data.attendanceByMonth.length ? data.attendanceByMonth.map(m => `
    <p style="margin-bottom:6px;font-size:13.5px">
      <strong>${m.label}:</strong> حاضر ${fa(m.present)} روز
      ${m.absentDates.length ? ` · ${fa(m.absentDates.length)} بار غیبت` : ""}
      ${m.lateEntries.length ? ` · ${fa(m.lateEntries.length)} بار تأخیر` : ""}
    </p>`).join("") : `<p class="empty-state empty-state--inline">حضوری برای این بازه ثبت نشده است.</p>`;

  const disciplineHTML = data.disciplineRecords.length ? `
    <ul style="padding-inline-start:18px;list-style:disc">
      ${data.disciplineRecords.map(d => `<li style="margin-bottom:4px;font-size:13px">
        <span class="chip ${d.type === "positive" ? "chip--excellent" : "chip--danger"}">${d.type === "positive" ? "مثبت" : "تذکر"}</span>
        ${d.description}</li>`).join("")}
    </ul>` : `<p class="empty-state empty-state--inline">موردی ثبت نشده است.</p>`;

  const progressHTML = data.subjectRows.length ? data.subjectRows.map(r => {
    const pct = Math.round((r.avg / 4) * 100);
    return `<div style="margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;font-size:13px;font-weight:700;margin-bottom:4px">
        <span>${r.subject.name}</span><span style="font-family:var(--font-mono);color:var(--color-ink-soft)">${fa(pct)}٪</span>
      </div>
      <div style="height:9px;background:var(--color-surface-alt);border-radius:999px;overflow:hidden">
        <div style="height:100%;width:${pct}%;background:${r.subject.color};border-radius:999px"></div>
      </div>
    </div>`;
  }).join("") : `<p class="empty-state empty-state--inline">هنوز ارزشیابی‌ای ثبت نشده است.</p>`;

  box.innerHTML = `
    <section class="panel" style="margin-bottom:var(--space-4)">
      <div class="panel__header"><h2>وضعیت کلی</h2></div>
      ${data.overall !== null ? `<p style="font-size:13.5px">میانگین عملکرد: <strong>${LABEL(data.overall)}</strong></p>` : `<p class="empty-state empty-state--inline">هنوز ارزشیابی‌ای ثبت نشده است.</p>`}
    </section>
    <section class="panel" style="margin-bottom:var(--space-4)">
      <div class="panel__header"><h2>نمودار پیشرفت هر درس</h2></div>
      ${progressHTML}
    </section>
    <section class="panel" style="margin-bottom:var(--space-4)">
      <div class="panel__header"><h2>حضور و غیاب</h2></div>
      ${attendanceHTML}
    </section>
    <section class="panel">
      <div class="panel__header"><h2>انضباط</h2></div>
      ${disciplineHTML}
    </section>`;
}

function LABEL(avg) {
  const r = Math.max(1, Math.min(4, Math.round(avg)));
  return { 4: "عالی", 3: "خوب", 2: "قابل قبول", 1: "نیاز به تلاش بیشتر" }[r];
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
      errorEl.textContent = err.message || "افزودن فرزند ناموفق بود.";
    }
  });

  $$("#parent-period-tabs .pill-tab").forEach(b => b.addEventListener("click", () => {
    selectedPeriod = b.dataset.period;
    $$("#parent-period-tabs .pill-tab").forEach(x => x.classList.toggle("is-active", x === b));
    renderChildContent();
  }));

  $("#parent-sign-out")?.addEventListener("click", async () => {
    await signOut();
    window.location.reload();
  });

  renderParentView();
}
