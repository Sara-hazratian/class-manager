/* ============================================================
   DASHBOARD (Phase 3) — today's date/schedule, tasks, notes.
   Stat cards read real data (students/tasks) as soon as later
   phases populate those collections; nothing here needs to
   change when Students/Attendance/Lessons ship.
   ============================================================ */
import {
  getStudents, getActiveStudents, getSchedule, getTasks, setTasks, uid, subjectById,
  todayDayIndex, DAYS, getGeneralNotes, setGeneralNotes,
} from "./store.js";
import { $, $$, toast, debounce } from "./ui.js";
import { fa } from "./jalali.js";
import { registerTitle, onViewChange } from "./router.js";
import { updateHeaderDate } from "./header.js";
import { todayAttendanceRate } from "./attendance.js";
import { openLesson } from "./evaluations.js";

registerTitle("dashboard", "داشبورد");

function renderStats() {
  const dayIdx = todayDayIndex();
  const lessons = dayIdx >= 0 ? (getSchedule()[dayIdx] || []).filter(Boolean) : [];
  const pending = getTasks().filter(t => !t.done).length;

  $("#stat-students").textContent = fa(getActiveStudents().length);
  $("#stat-lessons").textContent = fa(lessons.length);
  $("#stat-pending-tasks").textContent = fa(pending);
  const rate = todayAttendanceRate();
  $("#stat-attendance").textContent = rate === null ? "—" : `${fa(rate)}٪`;
}

function renderTodaySchedule() {
  const dayIdx = todayDayIndex();
  const wrap = $("#today-schedule");
  $("#today-day-name").textContent = dayIdx >= 0 ? `درس‌های امروز — ${DAYS[dayIdx]}` : "برنامه امروز";

  if (dayIdx < 0) {
    wrap.innerHTML = "";
    return;
  }
  const lessons = (getSchedule()[dayIdx] || []).filter(Boolean);
  if (!lessons.length) {
    wrap.innerHTML = `<p class="empty-state empty-state--inline">برای امروز درسی در برنامه ثبت نشده است.</p>`;
    return;
  }
  wrap.innerHTML = lessons.map((id, i) => {
    const s = subjectById(id);
    return `<div class="today-schedule__item today-schedule__item--clickable" data-lesson="${id}" role="button" tabindex="0">
      <span class="today-schedule__period">${fa(i + 1)}</span>
      <div>
        <p class="today-schedule__name">${s?.name || id}</p>
        <p class="today-schedule__meta">برای ثبت ارزشیابی کلیک کنید</p>
      </div>
    </div>`;
  }).join("");

  $$("[data-lesson]", wrap).forEach(el => {
    el.addEventListener("click", () => openLesson(el.dataset.lesson));
    el.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openLesson(el.dataset.lesson); } });
  });
}

function renderTasks() {
  const wrap = $("#task-list");
  const tasks = getTasks();
  if (!tasks.length) { wrap.innerHTML = `<p class="empty-state empty-state--inline">کاری ثبت نشده است.</p>`; return; }
  wrap.innerHTML = tasks.map(t => `
    <label class="task-item ${t.done ? "is-done" : ""}">
      <input type="checkbox" data-task="${t.id}" ${t.done ? "checked" : ""} />
      <span style="flex:1">${t.text}</span>
      <button type="button" class="btn btn--ghost btn--sm" data-del-task="${t.id}"><svg class="icon"><use href="#i-trash"/></svg></button>
    </label>`).join("");

  $$("[data-task]", wrap).forEach(cb => cb.addEventListener("change", () => {
    const list = getTasks();
    const t = list.find(x => x.id === cb.dataset.task);
    if (t) { t.done = cb.checked; setTasks(list); renderTasks(); renderStats(); }
  }));
  $$("[data-del-task]", wrap).forEach(b => b.addEventListener("click", () => {
    setTasks(getTasks().filter(x => x.id !== b.dataset.delTask));
    renderTasks(); renderStats();
  }));
}

const saveNotes = debounce(text => setGeneralNotes(text), 400);

export function renderDashboard() {
  updateHeaderDate();
  renderStats();
  renderTodaySchedule();
  renderTasks();
  $("#dashboard-notes").value = getGeneralNotes();
}

export function initDashboard() {
  $("#btn-add-task")?.addEventListener("click", () => {
    const text = $("#new-task-input").value.trim();
    if (!text) return;
    setTasks([...getTasks(), { id: uid("tk"), text, done: false }]);
    $("#new-task-input").value = "";
    renderTasks(); renderStats(); toast("کار اضافه شد");
  });
  $("#new-task-input")?.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); $("#btn-add-task").click(); } });

  $("#dashboard-notes")?.addEventListener("input", e => saveNotes(e.target.value));

  onViewChange(name => { if (name === "dashboard") renderDashboard(); });
  document.addEventListener("data:changed", () => {
    if (!$("#view-dashboard").hidden) renderDashboard();
  });

  renderDashboard();
}
