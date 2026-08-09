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
import { buildStudentReport, renderStudentReportHTML } from "./reports.js";
import { $, $$, toast, translateError } from "./ui.js";
import { fa } from "./jalali.js";
import { signOut } from "./auth.js";

let selectedChildId = null;
let selectedPeriod = "all";

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
  const box = $("#parent-report");
  // null period = the FULL history (daily through semester-level, everything
  // ever recorded) — a parent should see all of it, not just one term at a
  // time. The term1/term2 pill-tabs still let them narrow it down if they want.
  const data = buildStudentReport(selectedChildId, selectedPeriod === "all" ? null : selectedPeriod, null);
  if (!data) { box.innerHTML = ""; return; }
  // Same detailed renderer the teacher/admin views use — full per-topic
  // breakdown, strengths/needs-work, dated attendance and discipline entries.
  box.innerHTML = `<section class="panel">${renderStudentReportHTML(data)}</section>`;
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
