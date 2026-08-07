/* ============================================================
   APP ENTRY POINT
   ------------------------------------------------------------
   Boot sequence: Sign in/Sign up (Auth) → route by role:
     - teacher: Setup (if profile incomplete) → main app shell
     - admin / vice_principal, NOT verified: pending-approval screen
     - admin / vice_principal, verified: admin panel
     - parent: read-only parent panel
   ============================================================ */
import { isSetupComplete, loadProfile, loadAllCollections, loadParentData } from "./store.js";
import { initTheme } from "./theme.js";
import { initModals } from "./ui.js";
import { initRouter, switchView } from "./router.js";
import { initAuth, getSession, signOut } from "./auth.js";
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
import { initAdmin } from "./admin.js";

const SCREENS = ["auth-screen", "setup-screen", "pending-screen", "parent-screen", "admin-screen", "app"];

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
  if (!session) {
    showScreen("auth-screen");
    initAuth(afterAuthSuccess);
    return;
  }
  await afterAuthSuccess();
}

/** Runs right after a successful sign-in/sign-up, and on every fresh page
    load where a session already exists. Routes by role. */
async function afterAuthSuccess() {
  const profile = await loadProfile();
  if (!profile) { showScreen("auth-screen"); initAuth(afterAuthSuccess); return; }

  // verified now gates EVERY role — a super_admin can deactivate any account,
  // not just reject a pending admin/VP signup.
  if (!profile.verified) {
    showScreen("pending-screen");
    const isPendingApproval = profile.role === "admin" || profile.role === "vice_principal";
    const heading = document.querySelector("#pending-screen h1");
    const body = document.querySelector("#pending-screen p");
    if (heading) heading.textContent = isPendingApproval ? "حساب شما در انتظار تأیید است" : "حساب شما غیرفعال شده است";
    if (body) body.textContent = isPendingApproval
      ? "درخواست ثبت‌نام شما به‌عنوان مدیر/معاون ثبت شد و برای بررسی مدرک ابلاغ/حکم کارگزینی نزد مدیریت سامانه ارسال شد. پس از تأیید، با همین کد و رمز عبور می‌توانید وارد شوید."
      : "دسترسی شما توسط مدیریت سامانه غیرفعال شده است. برای اطلاعات بیشتر با مدیریت سامانه تماس بگیرید.";
    $bindSignOut("pending-sign-out");
    return;
  }

  if (profile.role === "admin" || profile.role === "vice_principal" || profile.role === "super_admin") {
    showScreen("admin-screen");
    initAdmin();
    return;
  }

  if (profile.role === "parent") {
    await loadParentData();
    showScreen("parent-screen");
    initParent();
    return;
  }

  // Default / "teacher"
  if (!isSetupComplete()) {
    showScreen("setup-screen");
    initSetup(showApp);
    return;
  }
  await showApp();
}

function $bindSignOut(buttonId) {
  document.getElementById(buttonId)?.addEventListener("click", async () => {
    await signOut();
    window.location.reload();
  });
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
  switchView("dashboard");
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();
