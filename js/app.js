/* ============================================================
   APP ENTRY POINT (v2 — نسخه‌ی نهایی، فقط دو نقش)
   ------------------------------------------------------------
   Boot sequence: Sign in/Sign up (Auth) → route by role:
     - teacher: Setup (if profile incomplete) → main app shell
     - parent: read-only parent panel
   هیچ نقش دیگری (مدیر/معاون/راهبر/سرگروه/سوپر ادمین) در این
   برنامه وجود ندارد — طبق تصمیم نهایی محصول. معلم و اولیا هیچ‌کدام
   نیازی به تأیید مدیریتی ندارند، بلافاصله بعد از ثبت‌نام فعال‌اند.
   ============================================================ */
import { initPlans } from "./plans.js";
import { isSetupComplete, loadProfile, loadAllCollections, loadParentData, enablePreviewMode, getProfile, refreshSubscription, refreshParentPro } from "./store.js";
import { initTheme } from "./theme.js";
import { initModals, toast } from "./ui.js";
import { initRouter, switchView } from "./router.js";
import { initAuth, getSession, ensureProfile, cleanOAuthParams } from "./auth.js";
import { initSetup } from "./setup.js";
import { initHeader } from "./header.js";
import { initDashboard } from "./dashboard.js";
import { initStudents } from "./students.js";
import { initAttendance } from "./attendance.js";
import { initLessons } from "./lessons.js";
import { initLesson } from "./evaluations.js";
import { initHomework } from "./homework.js";
import { initLab } from "./lab.js";
import { initDiscipline } from "./discipline.js";
import { initNotes } from "./notes.js";
import { initProgress } from "./progress.js";
import { initPlanning } from "./planning.js";
import { initReports } from "./reports.js";
import { initSettings } from "./settings.js";
import { initParent } from "./parent.js";

const SCREENS = ["auth-screen", "setup-screen", "parent-screen", "app"];

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("sw.js").catch(err => {
    console.error("ClassPilot: service worker registration failed", err);
  });
}

function showScreen(id) {
  SCREENS.forEach(s => { document.getElementById(s).hidden = (s !== id); });
}

async function boot() {
  initTheme();
  initModals();
  registerServiceWorker();

  const session = await getSession();
  cleanOAuthParams();
  if (!session) {
    showScreen("auth-screen");
    initAuth();
    return;
  }
  await afterAuthSuccess();
}

/** Runs right after a successful sign-in/sign-up, and on every fresh page
    load where a session already exists. Only two possible destinations:
    the teacher's own class, or a parent's read-only view of their child. */
async function afterAuthSuccess() {
  let profile = await loadProfile();
  if (!profile) {
    // اولین ورود با SSO: پروفایل را بساز (نقش از صفحه‌ی ورود)
    try { await ensureProfile(); profile = await loadProfile(); }
    catch (err) { console.error("ClassPilot: ensureProfile failed", err); }
  }
  if (!profile) { showScreen("auth-screen"); initAuth(); return; }

  if (profile.role === "parent") {
    await loadParentData();
    showScreen("parent-screen");
    initParent();
    return;
  }

  // Everyone else (teacher — the only other role that exists) lands here.
  if (!isSetupComplete()) {
    showScreen("setup-screen");
    initSetup(showApp);
    return;
  }
  await showApp();
}

export async function showApp() {
  await loadAllCollections();
  showScreen("app");
  initHeader();
  initRouter();
  initDashboard();
  initStudents();
  initAttendance();
  initLessons();
  initLesson();
  initHomework();
  initLab();
  initDiscipline();
  initNotes();
  initProgress();
  initPlanning();
  initReports();
  initSettings();
  initPlans();
  switchView("dashboard");
}

/** بدون هیچ ورود واقعی — مستقیم صفحه‌ی واقعی همون نقش رو با داده‌ی
    نمونه نشون می‌ده. فقط برای بررسی سریع ظاهر صفحات. */
export async function showPreview(role) {
  enablePreviewMode(role);
  if (role === "parent") {
    showScreen("parent-screen");
    initParent();
    return;
  }
  await showApp();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();


// خطای ذخیره‌سازی در دیتابیس را فوراً به کاربر نشان بده.
window.addEventListener("classpilot:sync-error", e => {
  const { collection, raw } = e.detail || {};
  toast(`ذخیره نشد (${collection}): ${raw}`, "error");
  console.warn("ClassPilot sync error:", collection, raw);
});

// پیام سبز: یعنی نوشتن در دیتابیس واقعاً انجام شد.
let lastOkToast = 0;
window.addEventListener("classpilot:sync-ok", () => {
  const now = Date.now();
  if (now - lastOkToast < 1500) return;
  lastOkToast = now;
  toast("ذخیره شد ✓");
});

// وضعیت اشتراک را گاهی دوباره بخوان تا انقضا/فعال‌شدن بدون ورود دوباره اعمال شود.
async function recheckPro() {
  try {
    const role = getProfile()?.role;
    if (!role) return;
    const changed = role === "parent" ? await refreshParentPro() : await refreshSubscription();
    if (changed) document.dispatchEvent(new Event("pro:changed"));
  } catch (_) { /* ignore */ }
}
document.addEventListener("visibilitychange", () => { if (!document.hidden) recheckPro(); });
setInterval(recheckPro, 10 * 60 * 1000);
