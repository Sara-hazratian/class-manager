/* ============================================================
   ATTENDANCE (Phase 5) — recorded ONCE per day, for today only.
   Late -> delay minutes. Left school -> exit period/time.
   ============================================================ */
import { getStudents, getAttendance, setAttendance, uid } from "./store.js";
import { $, $$, initials } from "./ui.js";
import { todayISO, formatJalaliLong, weekdayName, fa } from "./jalali.js";
import { registerTitle, onViewChange } from "./router.js";

registerTitle("attendance", "حضور و غیاب");

const STATUSES = [
  { id: "present", label: "حاضر" },
  { id: "absent",  label: "غایب" },
  { id: "late",    label: "تأخیر" },
  { id: "left",    label: "خروج از مدرسه" },
];
const date = todayISO(); // this phase only handles today; historical dates arrive with Reports (Phase 13)

function recordFor(studentId) {
  return getAttendance().find(a => a.studentId === studentId && a.date === date);
}
function upsert(studentId, patch) {
  const list = getAttendance();
  const i = list.findIndex(a => a.studentId === studentId && a.date === date);
  if (i >= 0) list[i] = { ...list[i], ...patch };
  else list.push({ id: uid("at"), studentId, date, status: null, minutes: null, exit: "", ...patch });
  setAttendance(list);
  document.dispatchEvent(new Event("data:changed"));
}

export function renderAttendance() {
  const tbody = $("#att-tbody"), empty = $("#att-empty");
  if (!tbody) return;

  const now = new Date();
  $("#att-date").textContent = formatJalaliLong(now);
  $("#att-weekday").textContent = weekdayName(now);

  const students = getStudents();
  empty.hidden = students.length > 0;
  $("#btn-all-present").disabled = students.length === 0;
  if (!students.length) { tbody.innerHTML = ""; updateCounts(); return; }

  tbody.innerHTML = students.map(s => {
    const r = recordFor(s.id);
    let detail = '<span style="color:var(--color-ink-faint);font-size:12px">—</span>';
    if (r?.status === "late") {
      detail = `<input type="number" min="1" class="inline-input" data-min="${s.id}" value="${r.minutes ?? ""}" placeholder="دقیقه تأخیر" />`;
    } else if (r?.status === "left") {
      detail = `<input type="text" class="inline-input" style="width:130px" data-exit="${s.id}" value="${r.exit || ""}" placeholder="زنگ یا ساعت خروج" />`;
    }
    return `<tr>
      <td class="eval-table__student"><span class="student-card__avatar" style="width:30px;height:30px;font-size:12px">${initials(s.name)}</span>${s.name}</td>
      <td><div class="attendance-select">
        ${STATUSES.map(st => `<button type="button" class="chip-btn ${r?.status === st.id ? "is-active" : ""}" data-att="${st.id}" data-student="${s.id}">${st.label}</button>`).join("")}
      </div></td>
      <td>${detail}</td>
    </tr>`;
  }).join("");

  $$("[data-att]", tbody).forEach(b => {
    b.addEventListener("click", () => { upsert(b.dataset.student, { status: b.dataset.att }); renderAttendance(); });
  });
  $$("[data-min]", tbody).forEach(inp => inp.addEventListener("change", () => upsert(inp.dataset.min, { minutes: Number(inp.value) || null })));
  $$("[data-exit]", tbody).forEach(inp => inp.addEventListener("change", () => upsert(inp.dataset.exit, { exit: inp.value.trim() })));

  updateCounts();
}

function updateCounts() {
  const recs = getAttendance().filter(a => a.date === date);
  const n = st => fa(recs.filter(r => r.status === st).length);
  $("#c-present").textContent = n("present");
  $("#c-absent").textContent  = n("absent");
  $("#c-late").textContent    = n("late");
  $("#c-left").textContent    = n("left");
}

export function todayAttendanceRate() {
  const students = getStudents();
  const recs = getAttendance().filter(a => a.date === todayISO());
  if (!students.length || !recs.length) return null;
  const present = recs.filter(r => r.status === "present" || r.status === "late").length;
  return Math.round((present / students.length) * 100);
}

function markAllPresent() {
  const list = getAttendance();
  getStudents().forEach(s => {
    const i = list.findIndex(a => a.studentId === s.id && a.date === date);
    if (i >= 0) list[i] = { ...list[i], status: "present" };
    else list.push({ id: uid("at"), studentId: s.id, date, status: "present", minutes: null, exit: "" });
  });
  setAttendance(list);
  document.dispatchEvent(new Event("data:changed"));
  renderAttendance();
}

export function initAttendance() {
  $("#btn-all-present")?.addEventListener("click", () => {
    if (!getStudents().length) return;
    if (confirm("وضعیت همه دانش‌آموزان برای امروز «حاضر» ثبت شود؟ می‌توانید بعداً موارد استثنا را تغییر دهید.")) markAllPresent();
  });
  onViewChange(name => { if (name === "attendance") renderAttendance(); });
  renderAttendance();
}
