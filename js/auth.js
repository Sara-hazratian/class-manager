/* ============================================================
   AUTH (v9) — ورود یکپارچه (SSO) با Google از طریق Supabase OAuth.
   ------------------------------------------------------------
   جریان: انتخاب نقش (معلم / اولیا) → «ورود با Google» → بازگشت به
   برنامه (PKCE) → app.js پروفایل را می‌خواند؛ اگر هنوز نبود، با
   ensureProfile() یکی می‌سازد (RPC در sso-setup.sql).
   ورود پیامکی/OTP و دکمه‌های پیش‌نمایش تستی حذف شده‌اند.
   ============================================================ */
import { sb } from "./supabase-client.js";
import { $, $$ } from "./ui.js";

const ROLE_KEY = "classpilot.pendingRole";

const ROLE_TABS = [
  { id: "teacher", label: "معلم" },
  { id: "parent", label: "اولیا" },
];

let role = "teacher";

function readStoredRole() {
  try { const r = localStorage.getItem(ROLE_KEY); return r === "parent" ? "parent" : "teacher"; }
  catch { return "teacher"; }
}
function storeRole(r) { try { localStorage.setItem(ROLE_KEY, r); } catch { /* ignore */ } }
function clearStoredRole() { try { localStorage.removeItem(ROLE_KEY); } catch { /* ignore */ } }

export async function signInWithGoogle(selectedRole) {
  storeRole(selectedRole);
  const { error } = await sb.auth.signInWithOAuth({
    provider: "google",
    options: {
      // به همان صفحه‌ی برنامه برمی‌گردد (بدون query/hash قبلی)
      redirectTo: window.location.origin + window.location.pathname,
      queryParams: { prompt: "select_account" },
    },
  });
  if (error) throw error;
}

export async function signOut() {
  await sb.auth.signOut();
}

export async function getSession() {
  const { data, error } = await sb.auth.getSession();
  if (error) { console.error("ClassPilot: getSession failed", error); return null; }
  return data.session;
}

/** اگر کاربر تازه با Google آمده و ردیف پروفایل ندارد، می‌سازد.
    نقش از انتخاب صفحه‌ی ورود (ذخیره‌شده قبل از ریدایرکت) می‌آید. */
export async function ensureProfile() {
  const wanted = readStoredRole();
  const { error } = await sb.rpc("ensure_profile", { p_role: wanted });
  if (error) throw error;
  clearStoredRole();
}

/** پاک‌کردن پارامترهای OAuth (?code=…) از آدرس بعد از بازگشت. */
export function cleanOAuthParams() {
  const u = new URL(window.location.href);
  if (!u.searchParams.has("code") && !u.hash.includes("access_token")) return;
  history.replaceState(null, "", u.pathname);
}

function renderAuthForm(errorMsg = "") {
  const root = $("#auth-screen");
  root.innerHTML = `
    <div class="panel setup-card animate-in">
      <span class="brand__mark" style="margin:0 auto var(--space-4);width:56px;height:56px">
        <img src="icons/icon-192.png" alt="ClassPilot" style="width:100%;height:100%;object-fit:contain;border-radius:inherit" />
      </span>
      <h1 style="font-size:21px;text-align:center;margin-bottom:4px">ورود به ClassPilot</h1>
      <p style="text-align:center;color:var(--color-ink-faint);font-size:11.5px;margin-bottom:var(--space-4)">دفتر مدیریت کلاسی</p>

      <p style="text-align:center;font-size:12.5px;color:var(--color-ink-soft);margin-bottom:var(--space-2)">ورود به‌عنوان:</p>
      <div class="pill-tabs" id="role-tabs" style="width:100%;justify-content:center;margin-bottom:var(--space-4)">
        ${ROLE_TABS.map(t => `<button type="button" class="pill-tab ${t.id === role ? "is-active" : ""}" data-role="${t.id}" style="flex:1">${t.label}</button>`).join("")}
      </div>

      <button type="button" class="btn btn--primary btn--lg btn--block" id="google-btn">ورود با Google</button>
      <p id="auth-error" style="color:var(--color-danger);font-size:12.5px;text-align:right;min-height:1em;margin-top:8px">${errorMsg}</p>
      <p style="text-align:center;font-size:11px;color:var(--color-ink-faint);margin-top:var(--space-2)">
        اولین ورود، حساب شما را به‌صورت خودکار می‌سازد.
      </p>
    </div>`;

  $$("#role-tabs .pill-tab", root).forEach(b => b.addEventListener("click", () => {
    role = b.dataset.role; storeRole(role); renderAuthForm();
  }));

  $("#google-btn").addEventListener("click", async e => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = "در حال انتقال به Google…";
    try { await signInWithGoogle(role); }
    catch (err) {
      btn.disabled = false;
      btn.textContent = "ورود با Google";
      $("#auth-error").textContent = err.message || "خطایی رخ داد. دوباره تلاش کنید.";
    }
  });
}

export function initAuth() {
  role = readStoredRole();
  renderAuthForm();
}
