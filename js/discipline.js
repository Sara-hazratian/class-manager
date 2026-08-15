/* ============================================================
   DISCIPLINE LOG (Phase 9) — deliberately NOT table-based like
   Evaluations. Teacher picks a student, logs a Positive/Warning
   entry with a reason, and sees that student's full history as
   a timeline.
   ============================================================ */
import { getActiveStudents, getDiscipline, setDiscipline, uid, SUBJECTS } from "./store.js";
import { $, $$, toast } from "./ui.js";
import { todayISO, formatJalaliLong, isoToDate } from "./jalali.js";
import { registerTitle, onViewChange } from "./router.js";

registerTitle("discipline", "انضباط");

let selectedType = "positive";
let selectedStudentId = null;

function refreshStudentSelect() {
  const sel = $("#dp-student");
  const students = getActiveStudents();
  const keep = sel.value || selectedStudentId;
  sel.innerHTML = students.map(s => `<option value="${s.id}">${s.name}</option>`).join("");
  sel.value = students.some(s => s.id === keep) ? keep : (students[0]?.id || "");
  selectedStudentId = sel.value || null;
}

function refreshSubjectSelect() {
  const sel = $("#dp-subject");
  sel.innerHTML = `<option value="">— بدون درس خاص —</option>` + SUBJECTS.map(s => `<option value="${s.id}">${s.name}</option>`).join("");
}

function setType(type) {
  selectedType = type;
  $$("[data-dp-type]").forEach(b => b.classList.toggle("is-active", b.dataset.dpType === type));
}

export function renderHistory() {
  const list = $("#dp-history"); if (!list) return;
  const empty = $("#dp-history-empty");
  if (!selectedStudentId) { list.innerHTML = ""; empty.hidden = false; return; }

  const records = getDiscipline()
    .filter(d => d.studentId === selectedStudentId)
    .sort((a, b) => b.date.localeCompare(a.date));

  empty.hidden = records.length > 0;
  if (!records.length) { list.innerHTML = ""; return; }

  list.innerHTML = records.map(r => {
    const subjectName = r.subjectId ? SUBJECTS.find(s => s.id === r.subjectId)?.name : null;
    return `
    <article class="card discipline-entry discipline-entry--${r.type}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">
        <div style="display:flex;align-items:center;gap:8px">
          <span class="chip ${r.type === "positive" ? "chip--excellent" : "chip--danger"}">${r.type === "positive" ? "مثبت" : "تذکر"}</span>
          ${subjectName ? `<span class="chip chip--good">${subjectName}</span>` : ""}
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <span class="lab-card__date">${formatJalaliLong(isoToDate(r.date))}</span>
          <button type="button" class="btn btn--ghost btn--sm" data-del-dp="${r.id}"><svg class="icon"><use href="#i-trash"/></svg></button>
        </div>
      </div>
      <p class="lab-card__desc" style="margin-top:8px">${r.description}</p>
      ${r.notes ? `<p class="lab-card__desc" style="border-top:1px dashed var(--color-border);margin-top:8px;padding-top:6px"><strong>یادداشت:</strong> ${r.notes}</p>` : ""}
    </article>`;
  }).join("");

  $$("[data-del-dp]", list).forEach(b => b.addEventListener("click", () => {
    if (!confirm("این مورد حذف شود؟")) return;
    setDiscipline(getDiscipline().filter(d => d.id !== b.dataset.delDp));
    renderHistory();
    document.dispatchEvent(new Event("data:changed"));
  }));
}

export function initDiscipline() {
  refreshSubjectSelect();
  refreshStudentSelect();
  setType("positive");
  renderHistory();

  $("#dp-student")?.addEventListener("change", () => { selectedStudentId = $("#dp-student").value; renderHistory(); });
  $$("[data-dp-type]").forEach(b => b.addEventListener("click", () => setType(b.dataset.dpType)));

  $("#discipline-form")?.addEventListener("submit", e => {
    e.preventDefault();
    if (!selectedStudentId) return;
    const description = $("#dp-description").value.trim();
    if (!description) return;

    const records = getDiscipline();
    records.push({
      id: uid("dp"),
      studentId: selectedStudentId,
      date: todayISO(),
      type: selectedType,
      subjectId: $("#dp-subject").value || "",
      description,
      notes: $("#dp-notes").value.trim(),
    });
    setDiscipline(records);
    document.dispatchEvent(new Event("data:changed"));

    $("#dp-description").value = "";
    $("#dp-notes").value = "";
    $("#dp-subject").value = "";
    setType("positive");
    renderHistory();
    toast("ثبت شد");
  });

  onViewChange(name => { if (name === "discipline") { refreshStudentSelect(); renderHistory(); } });
}
