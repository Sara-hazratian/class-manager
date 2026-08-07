/* ============================================================
   SUPER ADMIN — entry point for superadmin.html (completely
   separate from the main app's app.js). Sign-in only — there is
   no sign-up path here, matching the requirement that a
   super_admin account can only ever be created directly in the
   database, never through any UI.
   ============================================================ */
import { signIn, signOut, getSession } from "./auth.js";
import { loadProfile, getProfile } from "./store.js";
import { $, translateError } from "./ui.js";
import { initSuperAdminPanel } from "./superadmin.js";

function showScreen(id) {
  ["sa-auth-screen", "sa-denied-screen", "sa-panel-screen"].forEach(s => {
    document.getElementById(s).hidden = (s !== id);
  });
}

async function afterSignIn() {
  const profile = await loadProfile();
  if (!profile || profile.role !== "super_admin") {
    showScreen("sa-denied-screen");
    return;
  }
  if (!profile.verified) {
    // A super_admin row created directly in SQL should already be verified;
    // this is just a safety net in case someone forgets that step.
    $("#sa-auth-error") && ($("#sa-auth-error").textContent = "این حساب Super Admin هنوز verified نشده — از SQL Editor آن را verified=true کنید.");
    showScreen("sa-auth-screen");
    return;
  }
  showScreen("sa-panel-screen");
  initSuperAdminPanel();
}

function bindSignOutButtons() {
  ["sa-denied-sign-out", "sa-sign-out"].forEach(id => {
    document.getElementById(id)?.addEventListener("click", async () => {
      await signOut();
      window.location.reload();
    });
  });
}

async function boot() {
  bindSignOutButtons();

  const session = await getSession();
  if (session) { await afterSignIn(); return; }

  showScreen("sa-auth-screen");
  $("#sa-auth-form").addEventListener("submit", async e => {
    e.preventDefault();
    const username = $("#sa-username").value.trim();
    const password = $("#sa-password").value;
    const btn = $("#sa-auth-submit");
    const errorEl = $("#sa-auth-error");
    errorEl.textContent = "";
    btn.disabled = true;
    btn.textContent = "لطفاً صبر کنید…";
    try {
      await signIn(username, password);
      await afterSignIn();
    } catch (err) {
      errorEl.textContent = translateError(err);
    } finally {
      btn.disabled = false;
      btn.textContent = "ورود";
    }
  });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();
