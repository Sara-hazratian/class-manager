/* ============================================================
   HOMEWORK (Phase 7) — per subject, per day, 3 states.
   One-click apply to the whole class; teacher only edits the
   exceptions afterward.
   ============================================================ */
import { getStudents, getHomework, setHomework, uid, SUBJECTS } from "./store.js";
import { $, $$, toast, initials } from "./ui.js";
import { todayISO, formatJalaliLong } from "./jalali.js";
import { registerTitle, onViewChange } from "./router.js";

registerTitle("homework", "تکالیف");

const STATES = [
  { id: "completed",     label: "انجام شده" },
  { id: "partial",       label: "ناقص" },
  { id: "not-completed", label: "انجام نشده" },
];

let subjectId = SUBJECTS[0].id;
const date = todayISO(); // today only — matches Attendance's Phase-5 scope decision

function recordFor(studentId) {
  return getHomework().find(h => h.studentId === studentId && h.subjectId === subjectId && h.date === date);
}
function upsert(studentId, status) {
  const list = getHomework();
  const i = list.findIndex(h => h.studentId === studentId && h.subjectId === subjectId && h.date === date);
  if (i >= 0) list[i] = { ...list[i], status };
  else list.push({ id: uid("hw"), studentId, subjectId, date, status });
  setHomework(list);
  document.dispatchEvent(new Event("data:changed"));
}

export function renderHomework() {
  const tbody = $("#hw-tbody"), empty = $("#hw-empty");
  if (!tbody) return;
  $("#hw-date").textContent = formatJalaliLong(new Date());

  const students = getStudents();
  empty.hidden = students.length > 0;
  $$("[data-hw-all]").forEach(b => { b.disabled = students.length === 0; });
  if (!students.length) { tbody.innerHTML = ""; return; }

  tbody.innerHTML = students.map(s => {
    const r = recordFor(s.id);
    return `<tr>
      <td class="eval-table__student"><span class="student-card__avatar" style="width:30px;height:30px;font-size:12px">${initials(s.name)}</span>${s.name}</td>
      <td><div class="attendance-select">
        ${STATES.map(st => `<button type="button" class="chip-btn ${r?.status === st.id ? "is-active" : ""}" data-hw="${st.id}" data-student="${s.id}">${st.label}</button>`).join("")}
      </div></td>
    </tr>`;
  }).join("");

  $$("[data-hw]", tbody).forEach(b => b.addEventListener("click", () => { upsert(b.dataset.student, b.dataset.hw); renderHomework(); }));
}

function markAll(status) {
  const students = getStudents();
  if (!students.length) return;
  const label = STATES.find(s => s.id === status).label;
  if (!confirm(`تکلیف «${label}» برای همه دانش‌آموزان این درس ثبت شود؟`)) return;
  const list = getHomework();
  students.forEach(s => {
    const i = list.findIndex(h => h.studentId === s.id && h.subjectId === subjectId && h.date === date);
    if (i >= 0) list[i] = { ...list[i], status };
    else list.push({ id: uid("hw"), studentId: s.id, subjectId, date, status });
  });
  setHomework(list);
  document.dispatchEvent(new Event("data:changed"));
  renderHomework();
  toast("برای کل کلاس ثبت شد");
}

/** How many students still have no homework record for today's selected subject. */
export function pendingHomeworkCount() {
  const students = getStudents();
  const recs = getHomework().filter(h => h.date === todayISO() && h.subjectId === subjectId);
  return Math.max(0, students.length - recs.length);
}

export function initHomework() {
  const sel = $("#hw-subject");
  sel.innerHTML = SUBJECTS.map(s => `<option value="${s.id}">${s.name}</option>`).join("");
  sel.value = subjectId;
  sel.addEventListener("change", () => { subjectId = sel.value; renderHomework(); });

  $$("[data-hw-all]").forEach(b => b.addEventListener("click", () => markAll(b.dataset.hwAll)));

  onViewChange(name => { if (name === "homework") renderHomework(); });
  renderHomework();
}
