/* ============================================================
   AUTH — sign-up (3 role-specific forms) + username-based
   sign-in for everyone (Teacher / Admin / Vice-Principal / Parent).
   ------------------------------------------------------------
   Supabase Auth is email-based under the hood, so a username is
   silently converted to a fake-but-stable email
   (username@classpilot.local) — the person never sees or types
   an email anywhere. Uniqueness of "username" is enforced by two
   layers: the database's own `unique` constraint on
   profiles.username, AND Supabase's native unique-email
   constraint on the derived address.
   ============================================================ */
import { sb } from "./supabase-client.js";
import { $, $$ } from "./ui.js";

function usernameToEmail(username) {
  return `${username.trim().toLowerCase()}@classpilot.local`;
}

export async function signUp({ username, password, role, meta }) {
  const { data, error } = await sb.auth.signUp({
    email: usernameToEmail(username),
    password,
    options: { data: { role, username: username.trim().toLowerCase(), ...meta } },
  });
  if (error) throw error;
  return data;
}

export async function signIn(username, password) {
  const { data, error } = await sb.auth.signInWithPassword({
    email: usernameToEmail(username),
    password,
  });
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

/* ---------- Sign-up / Sign-in screen ---------- */
let mode = "signin"; // "signin" | "signup"
let signupRole = "teacher"; // "teacher" | "admin_vp" | "parent"
let pendingDocumentFile = null;

const ROLE_TABS = [
  { id: "teacher", label: "معلم" },
  { id: "admin_vp", label: "مدیر / معاون" },
  { id: "parent", label: "ولی" },
];

function signupFieldsHTML() {
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
      <label for="su-personnel">کد پرسنلی</label>
      <input type="text" id="su-personnel" />`;
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
      <label for="su-personnel">کد پرسنلی</label>
      <input type="text" id="su-personnel" required />
      <label for="su-document">آپلود آخرین حکم یا ابلاغ کارگزینی (PDF یا تصویر)</label>
      <input type="file" id="su-document" accept="application/pdf,image/*" required />
      <p style="font-size:11px;color:var(--color-ink-faint);margin-top:4px">
        حساب شما پس از ثبت‌نام، تا زمان بررسی و تأیید توسط مدیریت سامانه، غیرفعال می‌ماند.
      </p>`;
  }
  // parent
  return `
    <label for="su-fullname">نام و نام خانوادگی دانش‌آموز</label>
    <input type="text" id="su-fullname" required placeholder="نام و نام خانوادگی فرزندتان را بنویسید" />`;
}

function renderAuthForm() {
  const root = $("#auth-screen");
  root.innerHTML = `
    <div class="panel setup-card animate-in">
      <span class="brand__mark" style="margin:0 auto var(--space-4);width:56px;height:56px">
        <svg class="icon" style="width:28px;height:28px"><use href="#i-book"/></svg>
      </span>
      <h1 style="font-size:21px;text-align:center;margin-bottom:4px">${mode === "signin" ? "ورود به ClassPilot" : "ثبت‌نام"}</h1>
      <p style="text-align:center;color:var(--color-ink-faint);font-size:11.5px;margin-bottom:var(--space-4)">دفتر مدیریت کلاسی</p>

      ${mode === "signup" ? `
        <div class="pill-tabs" id="signup-role-tabs" style="width:100%;justify-content:center;margin-bottom:var(--space-4)">
          ${ROLE_TABS.map(t => `<button type="button" class="pill-tab ${t.id === signupRole ? "is-active" : ""}" data-role="${t.id}" style="flex:1">${t.label}</button>`).join("")}
        </div>` : ""}

      <form id="auth-form">
        ${mode === "signup" ? signupFieldsHTML() : ""}

        <label for="auth-username">${mode === "signup" && signupRole === "parent" ? "کد ملی دانش‌آموز (به‌عنوان نام کاربری شما)" : "نام کاربری"}</label>
        <input type="text" id="auth-username" required placeholder="${mode === "signup" && signupRole === "parent" ? "۱۰ رقم" : "مثلاً sara.ahmadi"}" autocomplete="username" inputmode="${mode === "signup" && signupRole === "parent" ? "numeric" : "text"}" />

        <label for="auth-password">رمز عبور</label>
        <input type="password" id="auth-password" required minlength="6" placeholder="حداقل ۶ کاراکتر" autocomplete="${mode === "signin" ? "current-password" : "new-password"}" />

        <p id="auth-error" style="color:var(--color-danger);font-size:12.5px;text-align:right;min-height:1em;margin-top:8px"></p>

        <button type="submit" class="btn btn--primary btn--lg btn--block" style="margin-top:var(--space-4)" id="auth-submit-btn">
          ${mode === "signin" ? "ورود" : "ثبت‌نام"}
        </button>
      </form>

      <button type="button" id="auth-toggle-mode" class="btn btn--ghost btn--block" style="margin-top:var(--space-3)">
        ${mode === "signin" ? "حساب ندارید؟ ثبت‌نام کنید" : "قبلاً ثبت‌نام کردید؟ وارد شوید"}
      </button>
    </div>`;

  $("#auth-toggle-mode").addEventListener("click", () => { mode = mode === "signin" ? "signup" : "signin"; renderAuthForm(); });

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

    const isParentSignup = mode === "signup" && signupRole === "parent";
    if (isParentSignup) {
      if (!/^\d{10}$/.test(username)) {
        errorEl.textContent = "کد ملی دانش‌آموز باید دقیقاً ۱۰ رقم باشد.";
        return;
      }
    } else if (!/^[a-zA-Z0-9._-]{3,30}$/.test(username)) {
      errorEl.textContent = "نام کاربری فقط می‌تواند شامل حروف انگلیسی، عدد، نقطه، خط تیره باشد (۳ تا ۳۰ کاراکتر).";
      return;
    }

    btn.disabled = true;
    btn.textContent = "لطفاً صبر کنید…";

    try {
      if (mode === "signup") {
        const role = signupRole === "admin_vp" ? ($("#su-position").value === "معاون" ? "vice_principal" : "admin") : signupRole;
        const meta = { full_name: $("#su-fullname").value.trim() };
        if (signupRole === "teacher") {
          meta.school_name = $("#su-school").value.trim();
          meta.grade = $("#su-grade").value;
          meta.class_name = $("#su-class").value.trim();
          meta.personnel_code = $("#su-personnel").value.trim();
        }
        if (signupRole === "admin_vp") {
          meta.school_name = $("#su-school").value.trim();
          meta.position = $("#su-position").value;
          meta.personnel_code = $("#su-personnel").value.trim();
          if (!pendingDocumentFile) { errorEl.textContent = "آپلود حکم یا ابلاغ کارگزینی الزامی است."; btn.disabled = false; btn.textContent = "ثبت‌نام"; return; }
        }

        const result = await signUp({ username, password, role, meta });

        if (signupRole === "admin_vp" && pendingDocumentFile && result.user) {
          try {
            const path = `${result.user.id}/${Date.now()}-${pendingDocumentFile.name}`;
            const { error: uploadError } = await sb.storage.from("verification-documents").upload(path, pendingDocumentFile);
            if (uploadError) throw uploadError;
            await sb.from("profiles").update({ document_path: path }).eq("id", result.user.id);
          } catch (uploadErr) {
            console.error("ClassPilot: document upload failed", uploadErr);
            // Account still exists (pending review) — the admin reviewing it can ask for the document again.
          }
        }

        if (isParentSignup) {
          // The national ID they used as their username IS their first child —
          // link it immediately so they don't have to re-enter it after logging in.
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
  if (msg.includes("Invalid login credentials")) return "نام کاربری یا رمز عبور اشتباه است.";
  if (msg.includes("User already registered")) {
    return mode === "signup" && signupRole === "parent"
      ? "برای این دانش‌آموز قبلاً یک حساب ولی ثبت شده (مثلاً توسط پدر یا مادر دیگر). برای ورود، از «ورود» استفاده کنید؛ یا اگر می‌خواهید حساب دومی برای همین فرزند بسازید، فعلاً این امکان پشتیبانی نمی‌شود."
      : "این نام کاربری قبلاً ثبت‌نام کرده — از «ورود» استفاده کنید.";
  }
  if (msg.includes("Password should be at least")) return "رمز عبور باید حداقل ۶ کاراکتر باشد.";
  if (msg.includes("duplicate key") && msg.includes("username")) return "این نام کاربری قبلاً استفاده شده — یکی دیگر انتخاب کنید.";
  return msg;
}

let onAuthSuccess = async () => {};
export function initAuth(onSuccess) {
  onAuthSuccess = onSuccess;
  renderAuthForm();
}
