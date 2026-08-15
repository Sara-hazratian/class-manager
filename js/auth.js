/* ============================================================
   AUTH (v8) — کاملاً پیامکی، بدون رمز عبور.
   ------------------------------------------------------------
   پیش‌فرض: فرم ورود (فقط شماره موبایل / برای اولیا کد ملی + موبایل)
   با یک لینک زیرش: «ثبت‌نام نکرده‌اید؟» — با کلیک روی آن، فرم کامل
   ثبت‌نام (اسم، کد پرسنلی، مدرسه، استان، منطقه، و...) نمایش داده
   می‌شود. کاربر خودش تصمیم می‌گیرد، نه سیستم حدس بزند.
   ============================================================ */
import { sb } from "./supabase-client.js";
import { $, $$ } from "./ui.js";

/** فعلاً غیرفعال — سرویس پیامکی (کاوه‌نگار) هنوز وصل نشده. وقتی وصل
    شد، فقط این را true کنید؛ هیچ تغییر دیگری لازم نیست. تا آن‌وقت،
    کد تأیید همیشه «۱۱۱۱۱۱» است — هیچ پیامکی واقعاً فرستاده نمی‌شود. */
export const SMS_ENABLED = false;

function toE164(phone) {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("98")) return "+" + digits;
  if (digits.startsWith("0")) return "+98" + digits.slice(1);
  return "+98" + digits;
}

export async function sendOtp(phone, meta = {}) {
  const e164 = toE164(phone);
  if (!SMS_ENABLED) return e164;
  const { error } = await sb.auth.signInWithOtp({ phone: e164, options: { data: meta } });
  if (error) throw error;
  return e164;
}

export async function verifyOtp(phone, code) {
  const e164 = toE164(phone);
  if (!SMS_ENABLED) {
    if (code !== "111111") throw new Error("کد وارد شده اشتباه است.");
    return;
  }
  const { error } = await sb.auth.verifyOtp({ phone: e164, token: code, type: "sms" });
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

/* ---------- Screens: signin (default) ↔ signup (via link) → otp ---------- */
let mode = "signin"; // "signin" | "signup" | "otp"
let signupRole = "teacher"; // "teacher" | "parent"
let pendingPhone = "";
let pendingMeta = {};

const ROLE_TABS = [
  { id: "teacher", label: "معلم" },
  { id: "parent", label: "اولیا" },
];

function signinFieldsHTML() {
  if (signupRole === "teacher") {
    return `
      <label for="auth-phone">شماره موبایل</label>
      <input type="tel" id="auth-phone" required inputmode="numeric" placeholder="09xxxxxxxxx" autocomplete="tel" />`;
  }
  return `
    <label for="auth-nid">کد ملی دانش‌آموز</label>
    <input type="text" id="auth-nid" required inputmode="numeric" maxlength="10" placeholder="کد ملی (۱۰ رقم)" />
    <label for="auth-phone">شماره موبایل</label>
    <input type="tel" id="auth-phone" required inputmode="numeric" placeholder="09xxxxxxxxx" autocomplete="tel" />`;
}

function signupFieldsHTML() {
  if (signupRole === "teacher") {
    return `
      <label for="su-fullname">نام و نام خانوادگی</label>
      <input type="text" id="su-fullname" required />
      <label for="su-personnel">کد پرسنلی</label>
      <input type="text" id="su-personnel" required inputmode="numeric" maxlength="8" placeholder="کد پرسنلی (۸ رقم)" />
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
      <div class="form-row">
        <div><label for="su-province">استان</label><input type="text" id="su-province" required placeholder="مثلاً تهران" /></div>
        <div><label for="su-region">منطقه</label><input type="text" id="su-region" required placeholder="مثلاً منطقه ۲۲ تهران" /></div>
      </div>
      <label for="auth-phone">شماره موبایل</label>
      <input type="tel" id="auth-phone" required inputmode="numeric" placeholder="09xxxxxxxxx" />`;
  }
  return `
    <label for="su-fullname">نام و نام خانوادگی دانش‌آموز</label>
    <input type="text" id="su-fullname" required placeholder="نام و نام خانوادگی فرزندتان را بنویسید" />
    <label for="auth-nid">کد ملی دانش‌آموز</label>
    <input type="text" id="auth-nid" required inputmode="numeric" maxlength="10" placeholder="کد ملی (۱۰ رقم)" />
    <label for="auth-phone">شماره موبایل</label>
    <input type="tel" id="auth-phone" required inputmode="numeric" placeholder="09xxxxxxxxx" />`;
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

function renderOtpForm() {
  const root = $("#auth-screen");
  root.innerHTML = `
    <div class="panel setup-card animate-in">
      <span class="brand__mark" style="margin:0 auto var(--space-4);width:56px;height:56px">
        <img src="icons/icon-192.png" alt="ClassPilot" style="width:100%;height:100%;object-fit:contain;border-radius:inherit" />
      </span>
      <h1 style="font-size:19px;text-align:center;margin-bottom:4px">تأیید شماره موبایل</h1>
      <p style="text-align:center;color:var(--color-ink-faint);font-size:11.5px;margin-bottom:var(--space-4)">
        کد ۶ رقمی ارسال‌شده به ${pendingPhone} را وارد کنید
        ${!SMS_ENABLED ? '<br /><b style="color:var(--color-warning)">حالت آزمایشی — کد: ۱۱۱۱۱۱</b>' : ""}
      </p>
      <form id="otp-form">
        <label for="otp-code">کد تأیید</label>
        <input type="text" id="otp-code" required inputmode="numeric" maxlength="6" placeholder="------" style="text-align:center;letter-spacing:6px;font-size:20px" />
        <p id="auth-error" style="color:var(--color-danger);font-size:12.5px;text-align:right;min-height:1em;margin-top:8px"></p>
        <button type="submit" class="btn btn--primary btn--lg btn--block" style="margin-top:var(--space-4)" id="auth-submit-btn">تأیید و ورود</button>
      </form>
      <button type="button" id="otp-resend-btn" class="btn btn--ghost btn--block" style="margin-top:var(--space-2)">ارسال مجدد کد</button>
      <button type="button" id="otp-back-btn" class="btn btn--ghost btn--block" style="font-size:12.5px">بازگشت</button>
    </div>`;

  $("#otp-form").addEventListener("submit", async e => {
    e.preventDefault();
    const code = $("#otp-code").value.trim();
    const btn = $("#auth-submit-btn");
    const errorEl = $("#auth-error");
    errorEl.textContent = "";
    btn.disabled = true;
    btn.textContent = "در حال بررسی…";
    try {
      await verifyOtp(pendingPhone, code);
      await onAuthSuccess();
    } catch (err) {
      errorEl.textContent = err.message || "خطایی رخ داد.";
      btn.disabled = false;
      btn.textContent = "تأیید و ورود";
    }
  });

  const resendBtn = $("#otp-resend-btn");
  startCooldown(resendBtn);
  resendBtn.addEventListener("click", async () => {
    if (resendBtn.disabled) return;
    try { await sendOtp(pendingPhone, pendingMeta); $("#auth-error").textContent = ""; startCooldown(resendBtn); }
    catch (err) { $("#auth-error").textContent = err.message || "خطایی رخ داد."; }
  });
  $("#otp-back-btn").addEventListener("click", () => { mode = "signin"; renderAuthForm(); });
}

function renderAuthForm() {
  if (mode === "otp") { renderOtpForm(); return; }

  const root = $("#auth-screen");
  const isSignup = mode === "signup";
  root.innerHTML = `
    <div class="panel setup-card animate-in">
      <span class="brand__mark" style="margin:0 auto var(--space-4);width:56px;height:56px">
        <img src="icons/icon-192.png" alt="ClassPilot" style="width:100%;height:100%;object-fit:contain;border-radius:inherit" />
      </span>
      <h1 style="font-size:21px;text-align:center;margin-bottom:4px">${isSignup ? "ثبت‌نام در ClassPilot" : "ورود به ClassPilot"}</h1>
      <p style="text-align:center;color:var(--color-ink-faint);font-size:11.5px;margin-bottom:var(--space-4)">دفتر مدیریت کلاسی</p>

      <div class="pill-tabs" id="signup-role-tabs" style="width:100%;justify-content:center;margin-bottom:var(--space-4)">
        ${ROLE_TABS.map(t => `<button type="button" class="pill-tab ${t.id === signupRole ? "is-active" : ""}" data-role="${t.id}" style="flex:1">${t.label}</button>`).join("")}
      </div>

      <form id="auth-form">
        ${isSignup ? signupFieldsHTML() : signinFieldsHTML()}
        <p id="auth-error" style="color:var(--color-danger);font-size:12.5px;text-align:right;min-height:1em;margin-top:8px"></p>
        <button type="submit" class="btn btn--primary btn--lg btn--block" style="margin-top:var(--space-4)" id="auth-submit-btn">
          ${isSignup ? "ثبت‌نام و ارسال کد" : "ارسال کد تأیید"}
        </button>
      </form>

      <button type="button" id="auth-toggle-mode" class="btn btn--ghost btn--block" style="margin-top:var(--space-2);font-size:12.5px">
        ${isSignup ? "قبلاً ثبت‌نام کرده‌اید؟ وارد شوید" : "ثبت‌نام نکرده‌اید؟ همین‌جا ثبت‌نام کنید"}
      </button>
    </div>`;

  $("#auth-toggle-mode").addEventListener("click", () => { mode = isSignup ? "signin" : "signup"; renderAuthForm(); });
  $$("#signup-role-tabs .pill-tab", root).forEach(b => b.addEventListener("click", () => {
    signupRole = b.dataset.role; renderAuthForm();
  }));

  $("#auth-form").addEventListener("submit", async e => {
    e.preventDefault();
    const errorEl = $("#auth-error");
    const btn = $("#auth-submit-btn");
    errorEl.textContent = "";

    const phone = $("#auth-phone").value.trim();
    let username = null;
    if (signupRole === "parent") {
      username = $("#auth-nid").value.trim();
      if (!/^\d{10}$/.test(username)) { errorEl.textContent = "کد ملی دانش‌آموز باید دقیقاً ۱۰ رقم باشد."; return; }
    }

    const meta = { role: signupRole };
    if (isSignup) {
      meta.full_name = $("#su-fullname").value.trim();
      if (signupRole === "teacher") {
        const code = $("#su-personnel").value.trim();
        if (!/^\d{8}$/.test(code)) { errorEl.textContent = "کد پرسنلی باید دقیقاً ۸ رقم باشد."; return; }
        meta.username = code;
        meta.personnel_code = code;
        meta.school_name = $("#su-school").value.trim();
        meta.grade = $("#su-grade").value;
        meta.class_name = $("#su-class").value.trim();
        meta.province = $("#su-province").value.trim();
        meta.region = $("#su-region").value.trim();
      } else {
        meta.username = username;
      }
    } else if (username) {
      meta.username = username;
    }

    pendingPhone = phone;
    pendingMeta = meta;

    btn.disabled = true;
    btn.textContent = "لطفاً صبر کنید…";
    try {
      await sendOtp(phone, meta);
      mode = "otp";
      renderAuthForm();
    } catch (err) {
      errorEl.textContent = translateAuthError(err.message);
      btn.disabled = false;
      btn.textContent = isSignup ? "ثبت‌نام و ارسال کد" : "ارسال کد تأیید";
    }
  });
}

function translateAuthError(msg) {
  if (!msg) return "خطایی رخ داد. دوباره تلاش کنید.";
  if (msg.includes("duplicate key") && msg.includes("username")) {
    return signupRole === "teacher" ? "این کد پرسنلی قبلاً ثبت شده است." : "این کد ملی قبلاً ثبت شده است.";
  }
  return msg;
}

let onAuthSuccess = async () => {};
export function initAuth(onSuccess) {
  onAuthSuccess = onSuccess;
  mode = "signin"; signupRole = "teacher";
  renderAuthForm();
}
