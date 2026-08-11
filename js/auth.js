/* ============================================================
   AUTH (v4) — phone number is now the actual account identity
   for teacher/admin/vice_principal/parent (via Supabase's native
   phone auth + your Kavenegar Send-SMS-Hook) — no email anywhere
   in their sign-up, sign-in, or password recovery. Super Admin
   is the only role that still uses email (per design — it's a
   fully separate account type, created only via direct SQL).
   The person only ever types "کد پرسنلی" (teacher/admin/VP) or
   "کد ملی" (parent) to log in — a secure database lookup
   (get_phone_for_username) resolves that to their real phone
   behind the scenes.
   ============================================================ */
import { sb } from "./supabase-client.js";
import { $, $$ } from "./ui.js";

/** Iranian mobile numbers as typed (09xxxxxxxxx) -> E.164 (+989xxxxxxxxx),
    the format Supabase Auth and Kavenegar's receptor field both expect. */
function toE164(phone) {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("98")) return "+" + digits;
  if (digits.startsWith("0")) return "+98" + digits.slice(1);
  return "+98" + digits;
}

async function resolvePhone(username) {
  const { data, error } = await sb.rpc("get_phone_for_username", { p_username: username });
  if (error || !data) throw new Error("Invalid login credentials");
  return data;
}

// Only used while PHONE_VERIFICATION_ENABLED is false — a placeholder
// identity so signup/login work before your SMS service is active. Once
// you flip the flag to true, this is never called again; every account
// created AFTER that point uses the real phone number as its identity.
function tempFallbackEmail(username) {
  return `${username.trim().toLowerCase()}@classpilot.local`;
}

export async function signUp({ username, phone, password, role, meta }) {
  if (!PHONE_VERIFICATION_ENABLED) {
    const { data, error } = await sb.auth.signUp({
      email: tempFallbackEmail(username),
      password,
      options: { data: { role, username: username.trim(), phone_number: phone.trim(), ...meta } },
    });
    if (error) throw error;
    return data;
  }
  const e164 = toE164(phone);
  const { data, error } = await sb.auth.signUp({
    phone: e164,
    password,
    options: { data: { role, username: username.trim(), phone_number: phone.trim(), ...meta } },
  });
  if (error) throw error;
  return data;
}

export async function signIn(username, password) {
  if (!PHONE_VERIFICATION_ENABLED) {
    const { data, error } = await sb.auth.signInWithPassword({ email: tempFallbackEmail(username), password });
    if (error) throw error;
    return data;
  }
  const phone = await resolvePhone(username.trim());
  const { data, error } = await sb.auth.signInWithPassword({ phone, password });
  if (error) throw error;
  return data;
}

/** Super Admin — تا وقتی پیامک فعال نشده، دقیقاً مثل بقیه‌ی نقش‌ها از
    همین شناسه‌ی داخلی موقت استفاده می‌کند (نیازی به ایمیل واقعی و پنل
    Add User ندارد). وقتی SMS را فعال کردید، همه‌ی نقش‌ها از جمله همین
    یکی به شماره موبایل واقعی منتقل می‌شوند. */
export async function signInSuperAdmin(username, password) {
  const { data, error } = await sb.auth.signInWithPassword({ email: tempFallbackEmail(username), password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  await sb.auth.signOut();
}

export async function getSession() {
  const { data, error } = await sb.auth.getSession();
  if (error) { console.error("ClassPilot: getSession failed", error); return null; }
  return data.session;
}

export async function isPhoneVerified() {
  const { data } = await sb.auth.getUser();
  return Boolean(data?.user?.phone_confirmed_at);
}

/** Resends the sign-up confirmation OTP (used by the phone-verify screen's
    "ارسال مجدد" button right after signing up). */
export async function resendSignupOtp(phone) {
  const { error } = await sb.auth.resend({ type: "sms", phone: toE164(phone) });
  if (error) throw error;
}

export async function verifyPhoneCode(phone, code) {
  const { error } = await sb.auth.verifyOtp({ phone: toE164(phone), token: code, type: "sms" });
  if (error) throw error;
}

/** Password recovery, entirely via SMS: sends a fresh OTP to an EXISTING
    account's phone (no email anywhere in this flow). */
export async function startPasswordReset(phone) {
  const { error } = await sb.auth.signInWithOtp({ phone: toE164(phone) });
  if (error) throw error;
}

/** Verifying the OTP here also signs the person in (Supabase's normal
    behavior for phone OTP) — we immediately set their new password while
    that session is active, then the caller proceeds into the app. */
export async function completePasswordReset(phone, code, newPassword) {
  const { error: verifyError } = await sb.auth.verifyOtp({ phone: toE164(phone), token: code, type: "sms" });
  if (verifyError) throw verifyError;
  const { error: updateError } = await sb.auth.updateUser({ password: newPassword });
  if (updateError) throw updateError;
}

/* ---------- Sign-up / Sign-in / Reset / Phone-verify screens ---------- */
/* ============================================================
   موقتی — تا وقتی سرویس پیامکی (کاوه‌نگار) را فعال نکرده‌اید:
   این را false بگذارید تا بعد از ثبت‌نام مستقیم وارد برنامه شوید
   (بدون نیاز به کد تأیید که چون سرویس وصل نیست، هیچ‌وقت نمی‌رسد).

   وقتی سرویس پیامکی را وصل کردید، فقط این را به true تغییر دهید —
   هیچ تغییر دیگری در کد لازم نیست، همه‌چیز از قبل آماده است.
   ============================================================ */
export const PHONE_VERIFICATION_ENABLED = false;

let mode = "signin"; // "signin" | "signup" | "reset-request" | "reset-verify" | "phone-verify"
let signupRole = "teacher"; // "teacher" | "admin_vp" | "parent"
let pendingDocumentFile = null;
let pendingPhone = ""; // the phone currently being verified/reset

const ROLE_TABS = [
  { id: "teacher", label: "معلم" },
  { id: "admin_vp", label: "مدیر / معاون" },
  { id: "parent", label: "ولی" },
];

function usernameFieldMeta() {
  if (signupRole === "parent") return { label: "کد ملی دانش‌آموز", placeholder: "کد ملی دانش‌آموز", numeric: true };
  return { label: "کد پرسنلی", placeholder: "کد پرسنلی", numeric: false };
}

function signupFieldsHTML() {
  const un = usernameFieldMeta();
  if (signupRole === "teacher") {
    return `
      <label for="su-fullname">نام و نام خانوادگی</label>
      <input type="text" id="su-fullname" required />
      <label for="su-school">نام مدرسه</label>
      <input type="text" id="su-school" required />
      <div class="form-row">
        <div><label for="su-grade">پایه تدریس</label>
          <select id="su-grade">
            <option value="grade1">پایه اول</option><option value="grade2">پایه دوم</option>
            <option value="grade3">پایه سوم</option><option value="grade4">پایه چهارم</option>
            <option value="grade5">پایه پنجم</option><option value="grade6">پایه ششم</option>
          </select>
        </div>
        <div><label for="su-class">نام کلاس</label><input type="text" id="su-class" required /></div>
      </div>
      <label for="auth-username">${un.label}</label>
      <input type="text" id="auth-username" required placeholder="${un.placeholder}" />
      <label for="su-phone">شماره موبایل</label>
      <input type="tel" id="su-phone" required inputmode="numeric" placeholder="09xxxxxxxxx" />`;
  }
  if (signupRole === "admin_vp") {
    return `
      <label for="su-fullname">نام و نام خانوادگی</label>
      <input type="text" id="su-fullname" required />
      <label for="su-school">نام مدرسه</label>
      <input type="text" id="su-school" required />
      <label for="su-position">سمت</label>
      <select id="su-position">
        <option value="مدیر">مدیر</option>
        <option value="معاون">معاون</option>
      </select>
      <label for="auth-username">${un.label}</label>
      <input type="text" id="auth-username" required placeholder="${un.placeholder}" />
      <label for="su-phone">شماره موبایل</label>
      <input type="tel" id="su-phone" required inputmode="numeric" placeholder="09xxxxxxxxx" />
      <label for="su-document">آپلود آخرین حکم یا ابلاغ کارگزینی (PDF یا تصویر)</label>
      <input type="file" id="su-document" accept="application/pdf,image/*" required />
      <p style="font-size:11px;color:var(--color-ink-faint);margin-top:4px">
        حساب شما پس از ثبت‌نام، تا زمان بررسی و تأیید توسط مدیریت سامانه، غیرفعال می‌ماند.
      </p>`;
  }
  // parent
  return `
    <label for="su-fullname">نام و نام خانوادگی دانش‌آموز</label>
    <input type="text" id="su-fullname" required placeholder="نام و نام خانوادگی فرزندتان را بنویسید" />
    <label for="auth-username">${un.label}</label>
    <input type="text" id="auth-username" required inputmode="numeric" maxlength="10" placeholder="${un.placeholder}" />
    <label for="su-phone">شماره موبایل</label>
    <input type="tel" id="su-phone" required inputmode="numeric" placeholder="09xxxxxxxxx" />`;
}

let resendCooldownTimer = null;
function startCooldown(btn, seconds = 30) {
  let cooldown = seconds;
  btn.disabled = true;
  clearInterval(resendCooldownTimer);
  resendCooldownTimer = setInterval(() => {
    cooldown -= 1;
    btn.textContent = cooldown > 0 ? `ارسال مجدد کد (${cooldown})` : "ارسال مجدد کد";
    if (cooldown <= 0) { clearInterval(resendCooldownTimer); btn.disabled = false; }
  }, 1000);
}

function renderPhoneVerifyForm() {
  const root = $("#auth-screen");
  root.innerHTML = `
    <div class="panel setup-card animate-in">
      <span class="brand__mark" style="margin:0 auto var(--space-4);width:56px;height:56px">
        <img src="icons/icon-192.png" alt="ClassPilot" style="width:100%;height:100%;object-fit:contain;border-radius:inherit" />
      </span>
      <h1 style="font-size:19px;text-align:center;margin-bottom:4px">تأیید شماره موبایل</h1>
      <p style="text-align:center;color:var(--color-ink-faint);font-size:11.5px;margin-bottom:var(--space-4)">
        کد ۶ رقمی ارسال‌شده به ${pendingPhone} را وارد کنید
      </p>
      <form id="phone-verify-form">
        <label for="phone-verify-code">کد تأیید</label>
        <input type="text" id="phone-verify-code" required inputmode="numeric" maxlength="6" placeholder="------" style="text-align:center;letter-spacing:6px;font-size:20px" />
        <p id="auth-error" style="color:var(--color-danger);font-size:12.5px;text-align:right;min-height:1em;margin-top:8px"></p>
        <button type="submit" class="btn btn--primary btn--lg btn--block" style="margin-top:var(--space-4)" id="auth-submit-btn">تأیید کد</button>
      </form>
      <button type="button" id="phone-resend-btn" class="btn btn--ghost btn--block" style="margin-top:var(--space-2)">ارسال مجدد کد</button>
    </div>`;

  $("#phone-verify-form").addEventListener("submit", async e => {
    e.preventDefault();
    const code = $("#phone-verify-code").value.trim();
    const btn = $("#auth-submit-btn");
    const errorEl = $("#auth-error");
    errorEl.textContent = "";
    btn.disabled = true;
    btn.textContent = "در حال بررسی…";
    try {
      await verifyPhoneCode(pendingPhone, code);
      await onAuthSuccess();
    } catch (err) {
      errorEl.textContent = translatePhoneError(err.message);
      btn.disabled = false;
      btn.textContent = "تأیید کد";
    }
  });

  const resendBtn = $("#phone-resend-btn");
  startCooldown(resendBtn);
  resendBtn.addEventListener("click", async () => {
    if (resendBtn.disabled) return;
    try { await resendSignupOtp(pendingPhone); $("#auth-error").textContent = ""; startCooldown(resendBtn); }
    catch (err) { $("#auth-error").textContent = translatePhoneError(err.message); }
  });
}

function renderResetRequestForm() {
  const root = $("#auth-screen");
  root.innerHTML = `
    <div class="panel setup-card animate-in">
      <span class="brand__mark" style="margin:0 auto var(--space-4);width:56px;height:56px">
        <img src="icons/icon-192.png" alt="ClassPilot" style="width:100%;height:100%;object-fit:contain;border-radius:inherit" />
      </span>
      <h1 style="font-size:19px;text-align:center;margin-bottom:4px">بازیابی رمز عبور</h1>
      <p style="text-align:center;color:var(--color-ink-faint);font-size:11.5px;margin-bottom:var(--space-4)">شماره موبایلی که با آن ثبت‌نام کرده‌اید را وارد کنید</p>
      <form id="reset-request-form">
        <label for="reset-phone">شماره موبایل</label>
        <input type="tel" id="reset-phone" required inputmode="numeric" placeholder="09xxxxxxxxx" />
        <p id="auth-error" style="color:var(--color-danger);font-size:12.5px;text-align:right;min-height:1em;margin-top:8px"></p>
        <button type="submit" class="btn btn--primary btn--lg btn--block" style="margin-top:var(--space-4)" id="auth-submit-btn">ارسال کد</button>
      </form>
      <button type="button" id="auth-toggle-mode" class="btn btn--ghost btn--block" style="margin-top:var(--space-2)">بازگشت به ورود</button>
    </div>`;

  $("#auth-toggle-mode").addEventListener("click", () => { mode = "signin"; renderAuthForm(); });
  $("#reset-request-form").addEventListener("submit", async e => {
    e.preventDefault();
    const phone = $("#reset-phone").value.trim();
    const btn = $("#auth-submit-btn");
    const errorEl = $("#auth-error");
    errorEl.textContent = "";
    btn.disabled = true;
    btn.textContent = "لطفاً صبر کنید…";
    try {
      await startPasswordReset(phone);
      pendingPhone = phone;
      mode = "reset-verify";
      renderAuthForm();
    } catch (err) {
      errorEl.textContent = translatePhoneError(err.message);
      btn.disabled = false;
      btn.textContent = "ارسال کد";
    }
  });
}

function renderResetVerifyForm() {
  const root = $("#auth-screen");
  root.innerHTML = `
    <div class="panel setup-card animate-in">
      <span class="brand__mark" style="margin:0 auto var(--space-4);width:56px;height:56px">
        <img src="icons/icon-192.png" alt="ClassPilot" style="width:100%;height:100%;object-fit:contain;border-radius:inherit" />
      </span>
      <h1 style="font-size:19px;text-align:center;margin-bottom:4px">کد و رمز جدید</h1>
      <p style="text-align:center;color:var(--color-ink-faint);font-size:11.5px;margin-bottom:var(--space-4)">کد ارسال‌شده به ${pendingPhone} و رمز عبور تازه را وارد کنید</p>
      <form id="reset-verify-form">
        <label for="reset-code">کد تأیید</label>
        <input type="text" id="reset-code" required inputmode="numeric" maxlength="6" placeholder="------" style="text-align:center;letter-spacing:6px;font-size:20px" />
        <label for="reset-new-password">رمز عبور جدید</label>
        <input type="password" id="reset-new-password" required minlength="6" placeholder="حداقل ۶ کاراکتر" autocomplete="new-password" />
        <p id="auth-error" style="color:var(--color-danger);font-size:12.5px;text-align:right;min-height:1em;margin-top:8px"></p>
        <button type="submit" class="btn btn--primary btn--lg btn--block" style="margin-top:var(--space-4)" id="auth-submit-btn">تنظیم رمز جدید</button>
      </form>
      <button type="button" id="reset-resend-btn" class="btn btn--ghost btn--block" style="margin-top:var(--space-2)">ارسال مجدد کد</button>
    </div>`;

  $("#reset-verify-form").addEventListener("submit", async e => {
    e.preventDefault();
    const code = $("#reset-code").value.trim();
    const newPassword = $("#reset-new-password").value;
    const btn = $("#auth-submit-btn");
    const errorEl = $("#auth-error");
    errorEl.textContent = "";
    btn.disabled = true;
    btn.textContent = "لطفاً صبر کنید…";
    try {
      await completePasswordReset(pendingPhone, code, newPassword);
      await onAuthSuccess();
    } catch (err) {
      errorEl.textContent = translatePhoneError(err.message);
      btn.disabled = false;
      btn.textContent = "تنظیم رمز جدید";
    }
  });

  const resendBtn = $("#reset-resend-btn");
  startCooldown(resendBtn);
  resendBtn.addEventListener("click", async () => {
    if (resendBtn.disabled) return;
    try { await startPasswordReset(pendingPhone); $("#auth-error").textContent = ""; startCooldown(resendBtn); }
    catch (err) { $("#auth-error").textContent = translatePhoneError(err.message); }
  });
}

function translatePhoneError(msg) {
  if (!msg) return "خطایی رخ داد. دوباره تلاش کنید.";
  if (msg.includes("Token has expired") || msg.includes("expired")) return "کد منقضی شده — «ارسال مجدد کد» را بزنید.";
  if (msg.includes("Invalid") || msg.includes("invalid")) return "کد وارد شده اشتباه است.";
  if (msg.toLowerCase().includes("rate limit") || msg.includes("429")) return "درخواست‌های زیاد — کمی صبر کنید و دوباره تلاش کنید.";
  return msg;
}

/* ============================================================
   موقتی — فقط برای ساختن و تست صفحات هر نقش، قبل از فعال‌سازی
   نهایی SMS. با حساب‌های واقعی وارد می‌شود (نه داده‌ی ساختگی) —
   فقط تایپ کردن هر بار را حذف می‌کند. قبل از رفتن به حالت واقعی،
   این آرایه را خالی کنید یا این بخش را حذف کنید.
   ============================================================ */
const DEV_QUICK_LOGINS = [
  { label: "سارا حضرتیان — معلم", username: "94052685", password: "12345" },
  { label: "میلاد محمدیان — مدیر/معاون", username: "12345678", password: "123456" },
  { label: "سارا محمدیان — راهبر/سرگروه", username: "87654321", password: "1234567" },
];

function renderAuthForm() {
  if (mode === "phone-verify") { renderPhoneVerifyForm(); return; }
  if (mode === "reset-request") { renderResetRequestForm(); return; }
  if (mode === "reset-verify") { renderResetVerifyForm(); return; }

  const root = $("#auth-screen");
  const un = usernameFieldMeta();
  root.innerHTML = `
    <div class="panel setup-card animate-in">
      <span class="brand__mark" style="margin:0 auto var(--space-4);width:56px;height:56px">
        <img src="icons/icon-192.png" alt="ClassPilot" style="width:100%;height:100%;object-fit:contain;border-radius:inherit" />
      </span>
      <h1 style="font-size:21px;text-align:center;margin-bottom:4px">${mode === "signin" ? "ورود به ClassPilot" : "ثبت‌نام"}</h1>
      <p style="text-align:center;color:var(--color-ink-faint);font-size:11.5px;margin-bottom:var(--space-4)">دفتر مدیریت کلاسی</p>

      ${mode === "signin" && DEV_QUICK_LOGINS.length ? `
        <div style="margin-bottom:var(--space-4);padding:12px;background:var(--color-warning-tint);border-radius:var(--radius-md)">
          <p style="font-size:11px;color:var(--color-ink-soft);font-weight:700;margin-bottom:8px">ورود سریع (فقط حالت تست)</p>
          <div style="display:flex;flex-direction:column;gap:6px">
            ${DEV_QUICK_LOGINS.map((q, i) => `<button type="button" class="btn btn--secondary btn--sm" data-quick-login="${i}">${q.label}</button>`).join("")}
          </div>
        </div>
        <div style="margin-bottom:var(--space-4);padding:12px;background:var(--color-primary-tint);border-radius:var(--radius-md)">
          <p style="font-size:11px;color:var(--color-ink-soft);font-weight:700;margin-bottom:8px">پیش‌نمایش صفحات (بدون ورود، بدون اینترنت، فقط ظاهر با داده‌ی نمونه)</p>
          <div style="display:flex;flex-direction:column;gap:6px">
            <button type="button" class="btn btn--secondary btn--sm" data-preview="teacher">صفحه‌ی معلم</button>
            <button type="button" class="btn btn--secondary btn--sm" data-preview="admin">صفحه‌ی مدیر/معاون</button>
            <button type="button" class="btn btn--secondary btn--sm" data-preview="rahbar">صفحه‌ی راهبر/سرگروه</button>
            <button type="button" class="btn btn--secondary btn--sm" data-preview="parent">صفحه‌ی ولی</button>
          </div>
        </div>` : ""}

      <div class="pill-tabs" id="signup-role-tabs" style="width:100%;justify-content:center;margin-bottom:var(--space-4)">
        ${ROLE_TABS.map(t => `<button type="button" class="pill-tab ${t.id === signupRole ? "is-active" : ""}" data-role="${t.id}" style="flex:1">${t.label}</button>`).join("")}
      </div>

      <form id="auth-form">
        ${mode === "signup" ? signupFieldsHTML() : `
          <label for="auth-username">${un.label}</label>
          <input type="text" id="auth-username" required placeholder="${un.placeholder}" inputmode="${un.numeric ? "numeric" : "text"}" autocomplete="username" />
        `}

        <label for="auth-password">رمز عبور</label>
        <input type="password" id="auth-password" required minlength="6" placeholder="حداقل ۶ کاراکتر" autocomplete="${mode === "signin" ? "current-password" : "new-password"}" />

        <p id="auth-error" style="color:var(--color-danger);font-size:12.5px;text-align:right;min-height:1em;margin-top:8px"></p>

        <button type="submit" class="btn btn--primary btn--lg btn--block" style="margin-top:var(--space-4)" id="auth-submit-btn">
          ${mode === "signin" ? "ورود" : "ثبت‌نام"}
        </button>
      </form>

      ${mode === "signin" ? `<button type="button" id="auth-forgot" class="btn btn--ghost btn--block" style="margin-top:var(--space-2);font-size:12.5px">رمز عبور را فراموش کرده‌اید؟</button>` : ""}

      <button type="button" id="auth-toggle-mode" class="btn btn--ghost btn--block" style="margin-top:var(--space-2)">
        ${mode === "signin" ? "حساب ندارید؟ ثبت‌نام کنید" : "قبلاً ثبت‌نام کردید؟ وارد شوید"}
      </button>
    </div>`;

  $("#auth-toggle-mode").addEventListener("click", () => { mode = mode === "signin" ? "signup" : "signin"; renderAuthForm(); });
  $("#auth-forgot")?.addEventListener("click", () => {
    if (!PHONE_VERIFICATION_ENABLED) {
      alert("بازیابی رمز عبور با پیامک هنوز فعال نشده — برای کمک با مدیریت سامانه تماس بگیرید.");
      return;
    }
    mode = "reset-request"; renderAuthForm();
  });

  $$("#signup-role-tabs .pill-tab", root).forEach(b => b.addEventListener("click", () => {
    signupRole = b.dataset.role; pendingDocumentFile = null; renderAuthForm();
  }));

  $$("[data-quick-login]", root).forEach(b => b.addEventListener("click", async () => {
    const q = DEV_QUICK_LOGINS[Number(b.dataset.quickLogin)];
    const errorEl = $("#auth-error");
    errorEl.textContent = "";
    b.disabled = true;
    try {
      await signIn(q.username, q.password);
      await onAuthSuccess();
    } catch (err) {
      errorEl.textContent = translateAuthError(err.message);
      b.disabled = false;
    }
  }));

  $$("[data-preview]", root).forEach(b => b.addEventListener("click", async () => {
    const { showPreview } = await import("./app.js");
    await showPreview(b.dataset.preview);
  }));

  $("#su-document")?.addEventListener("change", e => { pendingDocumentFile = e.target.files[0] || null; });

  $("#auth-form").addEventListener("submit", async e => {
    e.preventDefault();
    const username = $("#auth-username").value.trim();
    const password = $("#auth-password").value;
    const btn = $("#auth-submit-btn");
    const errorEl = $("#auth-error");
    errorEl.textContent = "";

    if (mode === "signup" && signupRole === "parent" && !/^\d{10}$/.test(username)) {
      errorEl.textContent = "کد ملی دانش‌آموز باید دقیقاً ۱۰ رقم باشد.";
      return;
    }

    btn.disabled = true;
    btn.textContent = "لطفاً صبر کنید…";

    try {
      if (mode === "signup") {
        const role = signupRole === "admin_vp" ? ($("#su-position").value === "معاون" ? "vice_principal" : "admin") : signupRole;
        const phone = $("#su-phone").value.trim();
        const meta = { full_name: $("#su-fullname").value.trim() };
        if (signupRole === "teacher") {
          meta.school_name = $("#su-school").value.trim();
          meta.grade = $("#su-grade").value;
          meta.class_name = $("#su-class").value.trim();
          meta.personnel_code = username;
        }
        if (signupRole === "admin_vp") {
          meta.school_name = $("#su-school").value.trim();
          meta.position = $("#su-position").value;
          meta.personnel_code = username;
          if (!pendingDocumentFile) { errorEl.textContent = "آپلود حکم یا ابلاغ کارگزینی الزامی است."; btn.disabled = false; btn.textContent = "ثبت‌نام"; return; }
        }

        const result = await signUp({ username, phone, password, role, meta });

        if (signupRole === "admin_vp" && pendingDocumentFile && result.user) {
          try {
            const path = `${result.user.id}/${Date.now()}-${pendingDocumentFile.name}`;
            const { error: uploadError } = await sb.storage.from("verification-documents").upload(path, pendingDocumentFile);
            if (uploadError) throw uploadError;
            await sb.from("profiles").update({ document_path: path }).eq("id", result.user.id);
          } catch (uploadErr) {
            console.error("ClassPilot: document upload failed", uploadErr);
          }
        }

        if (signupRole === "parent") {
          const { addChildByNationalId } = await import("./store.js");
          try { await addChildByNationalId(username); }
          catch (linkErr) { console.error("ClassPilot: auto-link of first child failed", linkErr); }
        }

        if (!PHONE_VERIFICATION_ENABLED) {
          // SMS isn't set up yet — skip straight into the app. Once you
          // flip PHONE_VERIFICATION_ENABLED to true, this branch stops
          // running and every new signup goes through real OTP verification.
          await onAuthSuccess();
          return;
        }

        // signUp({ phone }) already triggered the first OTP automatically —
        // just show the verify screen next (app.js's central routing also
        // re-shows this on any future page load if it's still unconfirmed).
        pendingPhone = phone;
        mode = "phone-verify";
        renderAuthForm();
        return;
      } else {
        await signIn(username, password);
      }
      await onAuthSuccess();
    } catch (err) {
      errorEl.textContent = translateAuthError(err.message);
      btn.disabled = false;
      btn.textContent = mode === "signin" ? "ورود" : "ثبت‌نام";
    }
  });
}

function translateAuthError(msg) {
  if (!msg) return "خطایی رخ داد. دوباره تلاش کنید.";
  if (msg.includes("Invalid login credentials")) return mode === "signin" ? "کد وارد شده یا رمز عبور اشتباه است." : "خطایی رخ داد.";
  if (msg.includes("User already registered") || (msg.includes("phone") && msg.includes("already"))) {
    return "این شماره موبایل قبلاً ثبت‌نام کرده — از «ورود» استفاده کنید.";
  }
  if (msg.includes("Password should be at least")) return "رمز عبور باید حداقل ۶ کاراکتر باشد.";
  if (msg.includes("duplicate key") && msg.includes("username")) return "این کد (پرسنلی/ملی) قبلاً استفاده شده — با فرد مربوطه یا مدیریت سامانه تماس بگیرید.";
  return msg;
}

let onAuthSuccess = async () => {};
export function initAuth(onSuccess) {
  onAuthSuccess = onSuccess;
  mode = "signin"; signupRole = "teacher"; pendingDocumentFile = null;
  renderAuthForm();
}

/** Called by app.js's central routing (covers fresh sign-in AND page
    reloads with an existing but not-yet-phone-confirmed session) to show
    the OTP screen directly, without going through the sign-in form. */
export function initPhoneVerify(phone, onSuccess) {
  onAuthSuccess = onSuccess;
  pendingPhone = phone;
  mode = "phone-verify";
  renderPhoneVerifyForm();
}
