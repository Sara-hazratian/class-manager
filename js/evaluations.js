/* ============================================================
   LESSON PAGE (Phase 6) — whole-class evaluation in ONE table.
   Periods: daily (participation / activity / oral questioning),
            weekly, monthly (written exam / oral exam).
   ------------------------------------------------------------
   Fixed per feedback: the page range being evaluated is picked
   by the teacher RIGHT HERE, at evaluation time — e.g. "amma
   asking about pages 1–14 today" — instead of being guessed from
   the calendar month via Annual Budgeting. A teacher can review
   Mehr's material in Aban; inferring it from the month was a
   real bug. Reports then group by the ACTUAL range evaluated.
   ============================================================ */
import { getStudents, getEvaluations, setEvaluations, uid, subjectById, getProfile, SUBJECT_PAGE_COUNTS } from "./store.js";
import { $, $$, toast, initials } from "./ui.js";
import { todayISO, formatJalaliLong, fa } from "./jalali.js";
import { switchView, registerTitle } from "./router.js";

registerTitle("lesson", "ارزشیابی درس");

export const LEVELS = [
  { id: "excellent",         label: "عالی" },
  { id: "good",              label: "خوب" },
  { id: "acceptable",        label: "قابل قبول" },
  { id: "needs-improvement", label: "نیاز به تلاش" },
];

const KINDS = {
  daily:   [ { id: "participation", label: "مشارکت کلاسی" }, { id: "activity", label: "فعالیت کلاسی" }, { id: "oral", label: "پرسش شفاهی" } ],
  weekly:  [],
  monthly: [ { id: "written", label: "آزمون کتبی" }, { id: "oralExam", label: "آزمون شفاهی" } ],
};

let subjectId = null;
let period = "daily";
let kind = "participation";

export function openLesson(id) {
  subjectId = id; period = "daily"; kind = KINDS.daily[0].id;
  $("#lesson-title").textContent = subjectById(id)?.name || "";
  $("#lesson-date").textContent = formatJalaliLong(new Date());
  $$("#period-tabs .pill-tab").forEach(b => b.classList.toggle("is-active", b.dataset.period === "daily"));
  renderKindTabs(); renderRangePicker(); defaultTopicForSession(); renderEvalTable();
  switchView("lesson");
}

function renderKindTabs() {
  const wrap = $("#kind-tabs");
  const kinds = KINDS[period];
  wrap.hidden = kinds.length === 0;
  wrap.innerHTML = kinds.map(k =>
    `<button type="button" class="pill-tab ${k.id === kind ? "is-active" : ""}" data-kind="${k.id}">${k.label}</button>`).join("");
  $$("[data-kind]", wrap).forEach(b => b.addEventListener("click", () => {
    kind = b.dataset.kind;
    $$("[data-kind]", wrap).forEach(x => x.classList.toggle("is-active", x === b));
    renderEvalTable();
  }));
}

/* ---------- page-range picker: which pages is THIS evaluation session about? ---------- */
function pageCountForCurrentSubject() {
  const grade = getProfile()?.grade;
  return SUBJECT_PAGE_COUNTS?.[grade]?.[subjectId] || null;
}

function renderRangePicker() {
  const wrap = $("#eval-range-picker"); if (!wrap) return;
  const totalPages = pageCountForCurrentSubject();
  if (!totalPages) { wrap.hidden = true; return; }
  wrap.hidden = false;

  const opts = (selectedVal) => {
    let html = `<option value="">—</option>`;
    for (let p = 1; p <= totalPages; p++) html += `<option value="${p}" ${String(p) === String(selectedVal) ? "selected" : ""}>${fa(p)}</option>`;
    return html;
  };
  // Default to whatever the most recent record in this exact session used, so reopening today's session keeps the range.
  const recent = getEvaluations()
    .filter(e => e.subjectId === subjectId && e.period === period && (e.kind || "") === (kind || "") && e.date === todayISO())
    .slice(-1)[0];

  wrap.innerHTML = `
    <span style="font-size:12.5px;color:var(--color-ink-soft);font-weight:700">این ارزشیابی از چه صفحاتی است؟</span>
    <span style="font-size:12.5px;color:var(--color-ink-soft)">از صفحه</span>
    <select class="select-control" id="eval-page-from" style="width:auto">${opts(recent?.pageFrom)}</select>
    <span style="font-size:12.5px;color:var(--color-ink-soft)">تا صفحه</span>
    <select class="select-control" id="eval-page-to" style="width:auto">${opts(recent?.pageTo)}</select>
  `;
}

function currentRange() {
  const from = $("#eval-page-from")?.value;
  const to = $("#eval-page-to")?.value;
  return { pageFrom: from ? Number(from) : null, pageTo: to ? Number(to) : null };
}

function currentTopic() {
  const val = $("#eval-topic")?.value?.trim();
  return val || "";
}

function defaultTopicForSession() {
  const recent = getEvaluations()
    .filter(e => e.subjectId === subjectId && e.period === period && (e.kind || "") === (kind || "") && e.date === todayISO())
    .slice(-1)[0];
  const input = $("#eval-topic");
  if (input) input.value = recent?.topic || "";
}

function findRecord(list, studentId, date) {
  return list.find(e => e.studentId === studentId && e.subjectId === subjectId
    && e.period === period && (e.kind || "") === (kind || "") && e.date === date);
}

export function renderEvalTable() {
  const tbody = $("#eval-tbody"), empty = $("#eval-empty");
  const students = getStudents();
  empty.hidden = students.length > 0;
  renderMarkAll();
  if (!students.length) { tbody.innerHTML = ""; return; }

  const date = todayISO();
  const list = getEvaluations();
  tbody.innerHTML = students.map(s => {
    const rec = findRecord(list, s.id, date);
    return `<tr>
      <td class="eval-table__student"><span class="student-card__avatar" style="width:30px;height:30px;font-size:12px">${initials(s.name)}</span>${s.name}</td>
      ${LEVELS.map(l => `<td><button type="button" class="level-btn ${rec?.level === l.id ? "is-active" : ""}"
          data-level="${l.id}" data-student="${s.id}" title="${l.label}">${l.label[0]}</button></td>`).join("")}
    </tr>`;
  }).join("");

  $$(".level-btn", tbody).forEach(btn => btn.addEventListener("click", () => setLevel(btn.dataset.student, btn.dataset.level)));
}

function renderMarkAll() {
  const wrap = $("#eval-mark-all"); if (!wrap) return;
  wrap.innerHTML = LEVELS.map(l => `<button type="button" class="chip-btn" data-mark-all="${l.id}">${l.label}</button>`).join("");
  $$("[data-mark-all]", wrap).forEach(b => b.addEventListener("click", () => setAllLevel(b.dataset.markAll)));
}

function setLevel(studentId, level) {
  const date = todayISO();
  const list = getEvaluations();
  const existing = findRecord(list, studentId, date);

  // Clicking the SAME level again clears the mark — undoing something
  // never needs a topic, only recording a new/changed one does.
  if (existing && existing.level === level) {
    setEvaluations(list.filter(e => e !== existing));
    renderEvalTable();
    document.dispatchEvent(new Event("data:changed"));
    return;
  }

  const topic = currentTopic();
  if (!topic) {
    toast("لطفاً قبل از ثبت، «موضوع این ارزشیابی» را بنویسید — برای تحلیل عملکرد کلاس لازم است.", "error");
    $("#eval-topic")?.focus();
    return;
  }

  const range = currentRange();
  if (existing) { existing.level = level; existing.pageFrom = range.pageFrom; existing.pageTo = range.pageTo; existing.topic = topic; setEvaluations(list); }
  else { list.push({ id: uid("ev"), studentId, subjectId, period, kind: kind || "", level, date, topic, ...range }); setEvaluations(list); }
  renderEvalTable();
  document.dispatchEvent(new Event("data:changed"));
}

function setAllLevel(level) {
  const students = getStudents();
  if (!students.length) return;
  const topic = currentTopic();
  if (!topic) {
    toast("لطفاً قبل از ثبت، «موضوع این ارزشیابی» را بنویسید — برای تحلیل عملکرد کلاس لازم است.", "error");
    $("#eval-topic")?.focus();
    return;
  }
  const levelLabel = LEVELS.find(l => l.id === level).label;
  if (!confirm(`سطح «${levelLabel}» برای همه دانش‌آموزان ثبت شود؟`)) return;
  const date = todayISO();
  const range = currentRange();
  const list = getEvaluations();
  students.forEach(s => {
    const existing = findRecord(list, s.id, date);
    if (existing) { existing.level = level; existing.pageFrom = range.pageFrom; existing.pageTo = range.pageTo; existing.topic = topic; }
    else list.push({ id: uid("ev"), studentId: s.id, subjectId, period, kind: kind || "", level, date, topic, ...range });
  });
  setEvaluations(list);
  renderEvalTable();
  document.dispatchEvent(new Event("data:changed"));
  toast("برای کل کلاس ثبت شد");
}

export function initLesson() {
  $$("#period-tabs .pill-tab").forEach(b => b.addEventListener("click", () => {
    period = b.dataset.period;
    kind = KINDS[period][0]?.id || "";
    $$("#period-tabs .pill-tab").forEach(x => x.classList.toggle("is-active", x === b));
    renderKindTabs(); renderRangePicker(); defaultTopicForSession(); renderEvalTable();
  }));
  $("#btn-back-to-lessons")?.addEventListener("click", () => switchView("lessons"));
}
