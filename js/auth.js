/* ============================================================
   AUTH (v3) — real email is now the actual account identity
   (so native password-reset emails genuinely work), while the
   person only ever types "کد پرسنلی" (teacher/admin/VP) or
   "کد ملی" (parent) to log in — a secure database lookup
   (get_email_for_username) resolves that to their real email
   behind the scenes.
   ============================================================ */
import { sb } from "./supabase-client.js";
import { $, $$ } from "./ui.js";

async function resolveEmail(username) {
  const { data, error } = await sb.rpc("get_email_for_username", { p_username: username });
  if (error || !data) throw new Error("Invalid login credentials");
  return data;
}

export async function signUp({ username, email, password, role, meta }) {
  const { data, error } = await sb.auth.signUp({
    email: email.trim(),
    password,
    options: { data: { role, username: username.trim(), ...meta } },
  });
  if (error) throw error;
  return data;
}

export async function signIn(username, password) {
  const email = await resolveEmail(username.trim());
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function forgotPassword(email) {
  const { error } = await sb.auth.resetPasswordForEmail(email.trim());
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

/* ---------- Sign-up / Sign-in / Forgot-password screen ---------- */
let mode = "signin"; // "signin" | "signup" | "forgot"
let signupRole = "teacher"; // "teacher" | "admin_vp" | "parent"
let pendingDocumentFile = null;

const ROLE_TABS = [
  { id: "teacher", label: "معلم" },
  { id: "admin_vp", label: "مدیر / معاون" },
  { id: "parent", label: "ولی" },
];

function usernameFieldMeta() {
  // What the login-code field should say, per role — used in both signup and signin.
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
      <input type="tel" id="su-phone" required inputmode="numeric" placeholder="09xxxxxxxxx" />
      <label for="su-email">ایمیل (برای بازیابی رمز عبور)</label>
      <input type="email" id="su-email" required placeholder="you@example.com" />`;
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
      <label for="su-email">ایمیل (برای بازیابی رمز عبور)</label>
      <input type="email" id="su-email" required placeholder="you@example.com" />
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
    <label for="su-email">ایمیل (برای بازیابی رمز عبور)</label>
    <input type="email" id="su-email" required placeholder="you@example.com" />`;
}

function renderForgotForm() {
  const root = $("#auth-screen");
  root.innerHTML = `
    <div class="panel setup-card animate-in">
      <span class="brand__mark" style="margin:0 auto var(--space-4);width:56px;height:56px">
        <img src="icons/icon-192.png" alt="ClassPilot" style="width:100%;height:100%;object-fit:contain;border-radius:inherit" />
      </span>
      <h1 style="font-size:19px;text-align:center;margin-bottom:4px">بازیابی رمز عبور</h1>
      <p style="text-align:center;color:var(--color-ink-faint);font-size:11.5px;margin-bottom:var(--space-4)">ایمیلی که هنگام ثبت‌نام وارد کردید را بنویسید</p>
      <form id="forgot-form">
        <label for="forgot-email">ایمیل</label>
        <input type="email" id="forgot-email" required placeholder="you@example.com" />
        <p id="auth-error" style="color:var(--color-danger);font-size:12.5px;text-align:right;min-height:1em;margin-top:8px"></p>
        <p id="auth-success" style="color:var(--color-success);font-size:12.5px;text-align:right;min-height:1em"></p>
        <button type="submit" class="btn btn--primary btn--lg btn--block" style="margin-top:var(--space-4)" id="auth-submit-btn">ارسال لینک بازیابی</button>
      </form>
      <button type="button" id="auth-toggle-mode" class="btn btn--ghost btn--block" style="margin-top:var(--space-3)">بازگشت به ورود</button>
    </div>`;

  $("#auth-toggle-mode").addEventListener("click", () => { mode = "signin"; renderAuthForm(); });
  $("#forgot-form").addEventListener("submit", async e => {
    e.preventDefault();
    const email = $("#forgot-email").value.trim();
    const btn = $("#auth-submit-btn");
    const errorEl = $("#auth-error"), successEl = $("#auth-success");
    errorEl.textContent = ""; successEl.textContent = "";
    btn.disabled = true;
    try {
      await forgotPassword(email);
      successEl.textContent = "لینک بازیابی رمز عبور به ایمیل شما ارسال شد — صندوق ورودی (و پوشه‌ی اسپم) را چک کنید.";
    } catch (err) {
      errorEl.textContent = "ارسال ناموفق بود. دوباره تلاش کنید.";
    } finally {
      btn.disabled = false;
    }
  });
}

function renderAuthForm() {
  if (mode === "forgot") { renderForgotForm(); return; }

  const root = $("#auth-screen");
  const un = usernameFieldMeta();
  root.innerHTML = `
    <div class="panel setup-card animate-in">
      <span class="brand__mark" style="margin:0 auto var(--space-4);width:56px;height:56px">
        <img src="icons/icon-192.png" alt="ClassPilot" style="width:100%;height:100%;object-fit:contain;border-radius:inherit" />
      </span>
      <h1 style="font-size:21px;text-align:center;margin-bottom:4px">${mode === "signin" ? "ورود به ClassPilot" : "ثبت‌نام"}</h1>
      <p style="text-align:center;color:var(--color-ink-faint);font-size:11.5px;margin-bottom:var(--space-4)">دفتر مدیریت کلاسی</p>

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
  $("#auth-forgot")?.addEventListener("click", () => { mode = "forgot"; renderAuthForm(); });

  $$("#signup-role-tabs .pill-tab", root).forEach(b => b.addEventListener("click", () => {
    signupRole = b.dataset.role; pendingDocumentFile = null; renderAuthForm();
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
        const email = $("#su-email").value.trim();
        const meta = { full_name: $("#su-fullname").value.trim() };
        if (signupRole === "teacher") {
          meta.school_name = $("#su-school").value.trim();
          meta.grade = $("#su-grade").value;
          meta.class_name = $("#su-class").value.trim();
          meta.personnel_code = username;
          meta.phone_number = $("#su-phone").value.trim();
        }
        if (signupRole === "admin_vp") {
          meta.school_name = $("#su-school").value.trim();
          meta.position = $("#su-position").value;
          meta.personnel_code = username;
          meta.phone_number = $("#su-phone").value.trim();
          if (!pendingDocumentFile) { errorEl.textContent = "آپلود حکم یا ابلاغ کارگزینی الزامی است."; btn.disabled = false; btn.textContent = "ثبت‌نام"; return; }
        }

        const result = await signUp({ username, email, password, role, meta });

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
  if (msg.includes("User already registered")) {
    return signupRole === "parent"
      ? "این ایمیل قبلاً ثبت‌نام کرده — از «ورود» استفاده کنید."
      : "این ایمیل قبلاً ثبت‌نام کرده — از «ورود» استفاده کنید.";
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
