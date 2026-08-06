/* ============================================================
   RESET — "Start a new school year". Lives only in Settings
   (Phase 14) now — the sidebar shortcut was removed since it
   duplicated the one in Settings' "danger zone".
   ============================================================ */
import { resetEverything } from "./store.js";
import { $ } from "./ui.js";

async function runReset() {
  const sure = confirm(
    "این کار همه‌ی اطلاعات این سال تحصیلی (دانش‌آموزان، حضور و غیاب، " +
    "ارزشیابی‌ها، تکالیف، انضباط، آزمایشگاه، یادداشت‌ها و برنامه) را برای " +
    "همیشه پاک می‌کند و شما را به صفحه‌ی خوش‌آمدگویی برمی‌گرداند تا کلاس " +
    "جدید را (مثلاً پایه‌ی بعدی) بسازید.\n\nقبل از ادامه، اگر لازم دارید " +
    "از کارنامه‌ها خروجی/عکس بگیرید.\n\nآیا مطمئن هستید؟"
  );
  if (!sure) return;
  const sureAgain = confirm("این عمل غیرقابل بازگشت است. برای شروع سال تحصیلی جدید مطمئن هستید؟");
  if (!sureAgain) return;

  try {
    await resetEverything();
  } catch (err) {
    console.error("ClassPilot: reset failed", err);
    alert("پاک کردن اطلاعات با خطا مواجه شد — اتصال اینترنت را چک کنید و دوباره تلاش کنید.");
    return;
  }
  window.location.reload();
}

export function bindResetButton(id) {
  $(`#${id}`)?.addEventListener("click", runReset);
}
