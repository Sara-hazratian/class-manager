/* ============================================================
   DASHBOARD — today's date/schedule, tomorrow's class plan, notes.
   ============================================================ */
import {
  getActiveStudents, getSchedule, subjectById,
  todayDayIndex, DAYS, getGeneralNotes, setGeneralNotes,
  getTomorrowPlan, setTomorrowPlan,
} from "./store.js";
import { $, $$, toast, debounce } from "./ui.js";
import { fa, formatJalaliLong } from "./jalali.js";
import { registerTitle, onViewChange } from "./router.js";
import { updateHeaderDate } from "./header.js";
import { todayAttendanceRate } from "./attendance.js";
import { openLesson } from "./evaluations.js";

registerTitle("dashboard", "داشبورد");

function renderStats() {
  const dayIdx = todayDayIndex();
  const lessons = dayIdx >= 0 ? (getSchedule()[dayIdx] || []).filter(Boolean) : [];

  $("#stat-students").textContent = fa(getActiveStudents().length);
  $("#stat-lessons").textContent = fa(lessons.length);
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

/* «کارهای فردا» به‌صورت لیست: هر خط متنِ ذخیره‌شده = یک کار. */
let planItems = [];
const parsePlan = text => String(text || "").split("\n").map(x => x.trim()).filter(Boolean);

function renderPlanList() {
  const ul = $("#tomorrow-plan-list");
  if (!ul) return;
  ul.innerHTML = "";
  planItems.forEach((item, i) => {
    const li = document.createElement("li");
    li.className = "plan-list__item";
    const span = document.createElement("span");
    span.textContent = item;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "plan-list__del";
    btn.title = "حذف";
    btn.setAttribute("aria-label", "حذف");
    btn.textContent = "✕";
    btn.addEventListener("click", () => removePlanItem(i));
    li.append(span, btn);
    ul.appendChild(li);
  });
  $("#stat-tomorrow-plan").textContent = planItems.length ? `${fa(planItems.length)} مورد` : "—";
}

async function savePlanItems(next, okMsg) {
  const prev = planItems;
  const statusEl = $("#tomorrow-plan-status");
  planItems = next;
  renderPlanList();
  try {
    await setTomorrowPlan(next.join("\n"));
    statusEl.style.color = "var(--color-success)";
    statusEl.textContent = okMsg;
  } catch (err) {
    planItems = prev; // ذخیره نشد؛ به حالت قبل برگرد
    renderPlanList();
    console.error("tomorrow plan save failed:", err);
    const raw = err && (err.code ? err.code + " — " : "") + (err.message || err.details || "");
    statusEl.style.color = "var(--color-danger)";
    statusEl.textContent = "ذخیره ناموفق بود. دوباره تلاش کنید." + (raw ? ` (جزئیات فنی: ${String(raw).slice(0, 160)})` : "");
  }
}

function removePlanItem(i) { savePlanItems(planItems.filter((_, k) => k !== i), "حذف شد"); }

async function renderTomorrowPlan() {
  planItems = parsePlan(await getTomorrowPlan());
  renderPlanList();
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  $("#tomorrow-plan-date").textContent = `(${formatJalaliLong(tomorrow)})`;
}

const saveNotes = debounce(text => setGeneralNotes(text), 400);

export function renderDashboard() {
  updateHeaderDate();
  renderStats();
  renderTodaySchedule();
  renderTomorrowPlan();
  $("#dashboard-notes").value = getGeneralNotes();
}

export function initDashboard() {
  $("#btn-save-tomorrow-plan")?.addEventListener("click", async () => {
    const input = $("#tomorrow-plan-input");
    const text = input.value.replace(/\s+/g, " ").trim();
    if (!text) return;
    if (planItems.includes(text)) { input.value = ""; return; }
    if (planItems.length >= 20) { toast("حداکثر ۲۰ مورد", "error"); return; }
    input.value = "";
    await savePlanItems([...planItems, text], "افزوده شد — برای اولیا قابل مشاهده است");
  });
  $("#tomorrow-plan-input")?.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); $("#btn-save-tomorrow-plan").click(); } });

  $("#dashboard-notes")?.addEventListener("input", e => saveNotes(e.target.value));

  onViewChange(name => { if (name === "dashboard") renderDashboard(); });
  document.addEventListener("data:changed", () => {
    if (!$("#view-dashboard").hidden) renderDashboard();
  });

  renderDashboard();
}
