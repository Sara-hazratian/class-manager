/* ============================================================
   SUPER ADMIN — entry point for superadmin.html (completely
   separate from the main app's app.js). Sign-in only — there is
   no sign-up path here, matching the requirement that a
   super_admin account can only ever be created directly in the
   database, never through any UI.
   ============================================================ */
import { signInSuperAdmin, signOut, getSession } from "./auth.js";
import { loadProfile, getProfile } from "./store.js";
import { $, translateError } from "./ui.js";
import { initSuperAdminPanel } from "./superadmin.js";
import { sb } from "./supabase-client.js";

function showScreen(id) {
  ["sa-auth-screen", "sa-denied-screen", "sa-panel-screen", "sa-reset-screen"].forEach(s => {
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

  // Supabase's own "Send recovery" email link lands here with
  // "type=recovery" in the URL — check this directly (not just the async
  // PASSWORD_RECOVERY event) so there's no race with getSession() below
  // resolving first and skipping straight past the reset form.
  // Supabase recovery links come in TWO possible formats depending on the
  // auth flow configured: the older implicit flow uses a URL hash like
  // "#access_token=...&type=recovery", while the newer (now default) PKCE
  // flow uses "?code=xxxxx" with no "type=recovery" anywhere. Checking only
  // the old format was the actual bug — it silently let the recovery
  // session log the person straight in without ever changing the password.
  const params = new URLSearchParams(window.location.search);
  const isRecoveryLink =
    window.location.hash.includes("type=recovery") ||
    window.location.search.includes("type=recovery") ||
    params.has("code"); // this page never uses "code" for anything else (no OAuth/magic-link sign-in), so its mere presence here means a recovery link

  sb.auth.onAuthStateChange((event) => {
    if (event === "PASSWORD_RECOVERY") showScreen("sa-reset-screen");
  });

  $("#sa-reset-form")?.addEventListener("submit", async e => {
    e.preventDefault();
    const pw = $("#sa-reset-password").value;
    const pwConfirm = $("#sa-reset-password-confirm").value;
    const btn = $("#sa-reset-submit");
    const errorEl = $("#sa-reset-error");
    errorEl.textContent = "";

    if (pw !== pwConfirm) { errorEl.textContent = "رمز عبور و تکرار آن یکسان نیستند."; return; }

    btn.disabled = true;
    btn.textContent = "لطفاً صبر کنید…";
    try {
      const { error } = await sb.auth.updateUser({ password: pw });
      if (error) throw error;
      await afterSignIn();
    } catch (err) {
      errorEl.textContent = translateError(err);
      btn.disabled = false;
      btn.textContent = "تنظیم رمز جدید و ورود";
    }
  });

  if (isRecoveryLink) {
    showScreen("sa-reset-screen");
    return; // don't fall through to the normal sign-in flow below
  }

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
      await signInSuperAdmin(username, password);
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
