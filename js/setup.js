/* ============================================================
   SETUP — shown right after a teacher signs up (or signs in with
   an incomplete profile). Collects school/grade/class/year/theme
   and saves them to Supabase (via store.js's setProfile), then
   hands off to the main app.
   ============================================================ */
import { setProfile, THEME_COLORS } from "./store.js";
import { applyTheme } from "./theme.js";
import { $, $$, toast } from "./ui.js";
import { toJalali, fa } from "./jalali.js";
import { signOut } from "./auth.js";

const GRADES = [
  { id: "grade1", label: "پایه اول" },
  { id: "grade2", label: "پایه دوم" },
  { id: "grade3", label: "پایه سوم" },
  { id: "grade4", label: "پایه چهارم" },
  { id: "grade5", label: "پایه پنجم" },
  { id: "grade6", label: "پایه ششم" },
];

function suggestAcademicYear() {
  const { jy, jm } = toJalali(new Date());
  // Academic year runs Mehr(jy) → Khordad(jy+1). From Tir (month 4) through
  // Esfand (month 12) we're either in the new year or preparing for it, so
  // suggest jy–(jy+1). Only Farvardin–Khordad (months 1–3) are still inside
  // the year that started the PREVIOUS Mehr.
  const start = jm >= 4 ? jy : jy - 1;
  return `${fa(start)}-${fa(start + 1)}`;
}

function renderSetupForm() {
  const root = $("#setup-screen");
  root.innerHTML = `
    <div class="panel setup-card animate-in">
      <span class="brand__mark" style="margin:0 auto var(--space-4);width:56px;height:56px">
        <img src="icons/icon-192.png" alt="ClassPilot" style="width:100%;height:100%;object-fit:contain;border-radius:inherit" />
      </span>
      <h1 style="font-size:21px;text-align:center;margin-bottom:4px">به ClassPilot خوش آمدید</h1>
      <p style="text-align:center;color:var(--color-ink-faint);font-size:11.5px;margin-bottom:var(--space-2)">دفتر مدیریت کلاسی</p>
      <p style="text-align:center;color:var(--color-ink-soft);font-size:13.5px;margin-bottom:var(--space-6)">
        فقط یک بار — اطلاعات کلاس خود را وارد کنید تا شروع کنیم
      </p>

      <form id="setup-form">
        <label for="su-name">نام و نام خانوادگی معلم</label>
        <input type="text" id="su-name" required placeholder="مثلاً سارا احمدی" />

        <label for="su-school">نام مدرسه</label>
        <input type="text" id="su-school" required placeholder="مثلاً دبستان شهید بهشتی" />

        <div class="form-row">
          <div>
            <label for="su-grade">پایه</label>
            <select id="su-grade">${GRADES.map(g => `<option value="${g.id}">${g.label}</option>`).join("")}</select>
          </div>
          <div>
            <label for="su-class">نام کلاس</label>
            <input type="text" id="su-class" required placeholder="مثلاً الف" />
          </div>
        </div>

        <label for="su-year">سال تحصیلی</label>
        <input type="text" id="su-year" required value="${suggestAcademicYear()}" placeholder="۱۴۰۵-۱۴۰۶" />

        <label>رنگ پوسته</label>
        <div class="theme-swatch-row" id="theme-swatches">
          ${THEME_COLORS.map((t, i) => `
            <button type="button" class="theme-swatch ${i === 0 ? "is-active" : ""}" data-theme-id="${t.id}" style="--swatch-color:var(--color-primary)" data-preview="${t.id}" title="${t.label}">
              <span class="theme-swatch__dot" data-swatch-dot="${t.id}"></span>
            </button>`).join("")}
        </div>

        <button type="submit" class="btn btn--primary btn--lg btn--block" style="margin-top:var(--space-6)">
          <svg class="icon"><use href="#i-check"/></svg> شروع کنیم
        </button>
        <p id="setup-error" style="color:var(--color-danger);font-size:12.5px;text-align:right;min-height:1em;margin-top:8px"></p>
      </form>
      <button type="button" id="setup-sign-out" class="btn btn--ghost btn--block" style="margin-top:var(--space-2)">حساب اشتباه است؟ خروج</button>
    </div>`;

  // Give each swatch its real preset color as a background (can't read [data-theme] vars without applying them,
  // so we hardcode the same 5 hex values used in tokens.css just for the little preview dots).
  const HEX = { blue: "#2F6FED", green: "#22A06B", purple: "#7C5CE0", orange: "#E8862F", teal: "#17A2A2" };
  $$("[data-swatch-dot]").forEach(dot => { dot.style.background = HEX[dot.dataset.swatchDot]; });

  let selectedTheme = THEME_COLORS[0].id;
  $$(".theme-swatch", root).forEach(btn => btn.addEventListener("click", () => {
    selectedTheme = btn.dataset.themeId;
    $$(".theme-swatch", root).forEach(b => b.classList.toggle("is-active", b === btn));
    applyTheme(selectedTheme); // live preview
  }));
  applyTheme(selectedTheme);

  $("#setup-form").addEventListener("submit", async e => {
    e.preventDefault();
    const fullName = $("#su-name").value.trim();
    const schoolName = $("#su-school").value.trim();
    const className = $("#su-class").value.trim();
    const academicYear = $("#su-year").value.trim();
    if (!fullName || !schoolName || !className || !academicYear) return;

    const errorEl = $("#setup-error");
    const submitBtn = $("#setup-form button[type=submit]");
    errorEl.textContent = "";
    submitBtn.disabled = true;

    try {
      await setProfile({
        fullName, schoolName, className, academicYear,
        grade: $("#su-grade").value,
        themeColor: selectedTheme,
      });
      toast("خوش آمدید! کلاس شما آماده است");
      await onSetupComplete();
    } catch (err) {
      errorEl.textContent = "ذخیره‌سازی ناموفق بود — اتصال اینترنت را چک کنید و دوباره تلاش کنید.";
      console.error("ClassPilot: setup save failed", err);
      submitBtn.disabled = false;
    }
  });

  $("#setup-sign-out")?.addEventListener("click", async () => {
    await signOut();
    window.location.reload();
  });
}

let onSetupComplete = () => {};
export function initSetup(onComplete) {
  onSetupComplete = onComplete;
  renderSetupForm();
}
