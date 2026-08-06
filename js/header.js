/* ============================================================
   HEADER — fixed on every page once Setup is complete.
   Teacher / school / grade / class / academic year + live
   Jalali date.
   ============================================================ */
import { getProfile } from "./store.js";
import { $ } from "./ui.js";
import { formatJalaliLong, weekdayName } from "./jalali.js";

const GRADE_LABELS = {
  grade1: "پایه اول", grade2: "پایه دوم", grade3: "پایه سوم",
  grade4: "پایه چهارم", grade5: "پایه پنجم", grade6: "پایه ششم",
};

export function renderHeader() {
  const profile = getProfile();
  if (!profile) return;

  $("#header-school").textContent = profile.schoolName;
  $("#header-teacher").textContent = profile.fullName;
  $("#header-meta").innerHTML = `
    <span class="chip chip--good">${GRADE_LABELS[profile.grade] || profile.grade}</span>
    <span class="chip chip--good">کلاس ${profile.className}</span>
    <span class="chip chip--excellent">سال تحصیلی ${profile.academicYear}</span>`;

  updateHeaderDate();
}

export function updateHeaderDate() {
  const el = $("#header-date");
  if (!el) return;
  const now = new Date();
  el.textContent = `${weekdayName(now)} · ${formatJalaliLong(now)}`;
}

export function initHeader() {
  renderHeader();
}
