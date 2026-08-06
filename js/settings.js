/* ============================================================
   SETTINGS (Phase 14) — the final planned phase. Teacher can
   edit their profile fields and theme color (same shape as
   Setup/Phase 2), and reach "Start a new school year" (Phase 9
   addition) from here too, in addition to the sidebar shortcut.
   ============================================================ */
import { getProfile, setProfile, THEME_COLORS, exportBackup, importBackup } from "./store.js";
import { $, $$, toast } from "./ui.js";
import { applyTheme } from "./theme.js";
import { registerTitle, onViewChange } from "./router.js";
import { renderHeader } from "./header.js";
import { bindResetButton } from "./reset.js";
import { todayISO } from "./jalali.js";
import { signOut } from "./auth.js";

registerTitle("settings", "تنظیمات");

const GRADES = [
  { id: "grade1", label: "پایه اول" }, { id: "grade2", label: "پایه دوم" }, { id: "grade3", label: "پایه سوم" },
  { id: "grade4", label: "پایه چهارم" }, { id: "grade5", label: "پایه پنجم" }, { id: "grade6", label: "پایه ششم" },
];
const HEX = { blue: "#2F6FED", green: "#22A06B", purple: "#7C5CE0", orange: "#E8862F", teal: "#17A2A2" };

let selectedTheme = "blue";

function fillForm() {
  const p = getProfile(); if (!p) return;
  $("#set-name").value = p.fullName || "";
  $("#set-school").value = p.schoolName || "";
  $("#set-grade").value = p.grade || "grade3";
  $("#set-class").value = p.className || "";
  $("#set-year").value = p.academicYear || "";
  selectedTheme = p.themeColor || "blue";
  $$(".theme-swatch", $("#settings-swatches")).forEach(b => b.classList.toggle("is-active", b.dataset.themeId === selectedTheme));
}

function renderGradeOptions() {
  $("#set-grade").innerHTML = GRADES.map(g => `<option value="${g.id}">${g.label}</option>`).join("");
}

function renderSwatches() {
  const wrap = $("#settings-swatches");
  wrap.innerHTML = THEME_COLORS.map(t => `
    <button type="button" class="theme-swatch" data-theme-id="${t.id}" title="${t.label}">
      <span class="theme-swatch__dot" style="background:${HEX[t.id]}"></span>
    </button>`).join("");

  $$(".theme-swatch", wrap).forEach(btn => btn.addEventListener("click", () => {
    selectedTheme = btn.dataset.themeId;
    $$(".theme-swatch", wrap).forEach(b => b.classList.toggle("is-active", b === btn));
    applyTheme(selectedTheme); // live preview, saved (or reverted) with the rest of the form
  }));
}

function downloadBackup() {
  const backup = exportBackup();
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `classpilot-backup-${todayISO()}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  toast("فایل پشتیبان دانلود شد");
}

function restoreBackup(file) {
  const reader = new FileReader();
  reader.onload = () => {
    let parsed;
    try { parsed = JSON.parse(reader.result); }
    catch { alert("این فایل معتبر نیست (JSON قابل خواندن نیست)."); return; }

    const sure = confirm(
      "بازیابی از فایل پشتیبان، همه‌ی اطلاعات فعلی را با محتوای این فایل جایگزین می‌کند " +
      "و غیرقابل بازگشت است. اگر مطمئن هستید ادامه دهید."
    );
    if (!sure) return;

    try {
      const result = importBackup(parsed);
      // Verify something real actually landed before telling the teacher it worked.
      if (!result.restoredKeys.length || !getProfile()) {
        alert("فایل پشتیبان خالی به نظر می‌رسد یا اطلاعات کلاسی در آن نبود — چیزی بازیابی نشد.");
        return;
      }
      alert(`بازیابی با موفقیت انجام شد (${result.restoredKeys.length} بخش بازیابی شد). صفحه بارگذاری مجدد می‌شود.`);
      window.location.reload();
    } catch (err) {
      console.error("ClassPilot restore failed:", err);
      alert(`بازیابی ناموفق بود: ${err.message}\n\nلطفاً دوباره تلاش کنید یا این پیام را برای بررسی نگه دارید.`);
    }
  };
  reader.readAsText(file);
}

export function initSettings() {
  renderGradeOptions();
  renderSwatches();
  fillForm();

  $("#settings-form")?.addEventListener("submit", async e => {
    e.preventDefault();
    const fullName = $("#set-name").value.trim();
    const schoolName = $("#set-school").value.trim();
    const className = $("#set-class").value.trim();
    const academicYear = $("#set-year").value.trim();
    if (!fullName || !schoolName || !className || !academicYear) return;

    const submitBtn = $("#settings-form button[type=submit]");
    submitBtn.disabled = true;
    try {
      await setProfile({
        fullName, schoolName, className, academicYear,
        grade: $("#set-grade").value,
        themeColor: selectedTheme,
      });
      renderHeader();
      document.dispatchEvent(new Event("data:changed")); // budgeting/etc. re-scope to the (possibly new) grade
      toast("تنظیمات ذخیره شد");
    } catch (err) {
      console.error("ClassPilot: settings save failed", err);
      alert("ذخیره‌سازی ناموفق بود — اتصال اینترنت را چک کنید و دوباره تلاش کنید.");
    } finally {
      submitBtn.disabled = false;
    }
  });

  bindResetButton("btn-new-year-settings");

  $("#btn-sign-out")?.addEventListener("click", async () => {
    if (!confirm("از حساب کاربری خارج شوید؟")) return;
    await signOut();
    window.location.reload();
  });

  $("#btn-export-backup")?.addEventListener("click", downloadBackup);
  $("#btn-import-backup")?.addEventListener("click", () => $("#backup-file-input").click());
  $("#backup-file-input")?.addEventListener("change", e => {
    const file = e.target.files[0];
    if (file) restoreBackup(file);
    e.target.value = "";
  });

  onViewChange(name => { if (name === "settings") { fillForm(); applyTheme(getProfile()?.themeColor); } });
}
