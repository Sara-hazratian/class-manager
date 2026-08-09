/* ============================================================
   ATTENDANCE (v2) — recorded ONCE per day, for today only.
   ------------------------------------------------------------
   حالت ترکیبی: هر دانش‌آموز یک وضعیت پایه دارد (حاضر/غایب)، و اگر
   "حاضر" باشد، می‌تواند هم‌زمان «تأخیر داشته» و/یا «زودتر خارج شده»
   هم باشد — این‌ها دو کلید مستقل‌اند، نه گزینه‌ی جداگانه در کنار
   حاضر/غایب. دقیقاً طبق نمونه‌ی موردنیاز: دانش‌آموزی که صبح حاضر
   بوده ولی زنگ سوم زودتر رفته، یک رکورد «حاضر + خروج زودهنگام»
   می‌شود — نه یک رکورد غیبت جدا.
   ============================================================ */
import { getStudents, getAttendance, setAttendance, uid } from "./store.js";
import { $, $$, initials } from "./ui.js";
import { todayISO, formatJalaliLong, weekdayName, fa } from "./jalali.js";
import { registerTitle, onViewChange } from "./router.js";

registerTitle("attendance", "حضور و غیاب");

const BASE_STATUSES = [
  { id: "present", label: "حاضر" },
  { id: "absent", label: "غایب" },
];
const date = todayISO(); // this phase only handles today; historical dates arrive with Reports (Phase 13)

function recordFor(studentId) {
  return getAttendance().find(a => a.studentId === studentId && a.date === date);
}
function upsert(studentId, patch) {
  const list = getAttendance();
  const i = list.findIndex(a => a.studentId === studentId && a.date === date);
  if (i >= 0) list[i] = { ...list[i], ...patch };
  else list.push({ id: uid("at"), studentId, date, status: null, lateMinutes: null, earlyExit: false, exit: "", ...patch });
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
    const isPresent = r?.status === "present";

    // Late/early-exit are only meaningful (and only shown) once "حاضر" is
    // chosen — they're independent toggles, not alternatives to it.
    const modifiersHTML = isPresent ? `
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
        <button type="button" class="chip-btn ${r.lateMinutes != null ? "is-active" : ""}" data-toggle-late="${s.id}">تأخیر</button>
        ${r.lateMinutes != null ? `<input type="number" min="1" class="inline-input" style="width:90px" data-min="${s.id}" value="${r.lateMinutes ?? ""}" placeholder="دقیقه" />` : ""}
        <button type="button" class="chip-btn ${r.earlyExit ? "is-active" : ""}" data-toggle-exit="${s.id}">خروج زودهنگام</button>
        ${r.earlyExit ? `<input type="text" class="inline-input" style="width:130px" data-exit="${s.id}" value="${r.exit || ""}" placeholder="زنگ یا ساعت خروج" />` : ""}
      </div>` : `<span style="color:var(--color-ink-faint);font-size:12px">—</span>`;

    return `<tr>
      <td class="eval-table__student"><span class="student-card__avatar" style="width:30px;height:30px;font-size:12px">${initials(s.name)}</span>${s.name}</td>
      <td><div class="attendance-select">
        ${BASE_STATUSES.map(st => `<button type="button" class="chip-btn ${r?.status === st.id ? "is-active" : ""}" data-att="${st.id}" data-student="${s.id}">${st.label}</button>`).join("")}
      </div></td>
      <td>${modifiersHTML}</td>
    </tr>`;
  }).join("");

  $$("[data-att]", tbody).forEach(b => {
    b.addEventListener("click", () => {
      // Switching to "غایب" clears any late/early-exit modifiers — they
      // only make sense for a student who was actually present.
      const patch = { status: b.dataset.att };
      if (b.dataset.att === "absent") { patch.lateMinutes = null; patch.earlyExit = false; patch.exit = ""; }
      upsert(b.dataset.student, patch);
      renderAttendance();
    });
  });
  $$("[data-toggle-late]", tbody).forEach(b => b.addEventListener("click", () => {
    const r = recordFor(b.dataset.toggleLate);
    upsert(b.dataset.toggleLate, { lateMinutes: r?.lateMinutes != null ? null : 1 });
    renderAttendance();
  }));
  $$("[data-toggle-exit]", tbody).forEach(b => b.addEventListener("click", () => {
    const r = recordFor(b.dataset.toggleExit);
    upsert(b.dataset.toggleExit, { earlyExit: !r?.earlyExit, exit: r?.earlyExit ? "" : (r?.exit || "") });
    renderAttendance();
  }));
  $$("[data-min]", tbody).forEach(inp => inp.addEventListener("change", () => upsert(inp.dataset.min, { lateMinutes: Number(inp.value) || null })));
  $$("[data-exit]", tbody).forEach(inp => inp.addEventListener("change", () => upsert(inp.dataset.exit, { exit: inp.value.trim() })));

  updateCounts();
}

function updateCounts() {
  const recs = getAttendance().filter(a => a.date === date);
  const n = predicate => fa(recs.filter(predicate).length);
  $("#c-present").textContent = n(r => r.status === "present");
  $("#c-absent").textContent = n(r => r.status === "absent");
  $("#c-late").textContent = n(r => r.status === "present" && r.lateMinutes != null);
  $("#c-left").textContent = n(r => r.status === "present" && r.earlyExit);
}

export function todayAttendanceRate() {
  const students = getStudents();
  const recs = getAttendance().filter(a => a.date === todayISO());
  if (!students.length || !recs.length) return null;
  const present = recs.filter(r => r.status === "present").length;
  return Math.round((present / students.length) * 100);
}

function markAllPresent() {
  const list = getAttendance();
  getStudents().forEach(s => {
    const i = list.findIndex(a => a.studentId === s.id && a.date === date);
    if (i >= 0) list[i] = { ...list[i], status: "present" };
    else list.push({ id: uid("at"), studentId: s.id, date, status: "present", lateMinutes: null, earlyExit: false, exit: "" });
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
