/* ============================================================
   طرح‌ها و اشتراک — نمایش قیمت‌ها، وضعیت اشتراک، شروع پرداخت و پیام بعد از برگشت از درگاه.
   هیچ‌چیز اینجا Pro را فعال نمی‌کند: فعال‌سازی فقط وقتی انجام می‌شود که سرور پرداخت را
   از خود درگاه تأیید کرده باشد؛ این فایل فقط وضعیتِ ثبت‌شده در دیتابیس را می‌خواند.
   قیمت‌ها به تومان‌اند؛ تبدیل به ریال فقط در سرور و هنگام تماس با درگاه انجام می‌شود.
   ============================================================ */
import {
  getSubscription, refreshSubscription, fetchPlans, startPayment, getPaymentStatus, recheckPayment, getProfile,
} from "./store.js";
import { $, esc, toast } from "./ui.js";
import { fa, formatJalaliLong } from "./jalali.js";

export const tomanText = n => `${fa(Number(n).toLocaleString("en-US").replace(/,/g, "٬"))} تومان`;

const PLAN_NOTE = {
  term1: "از شروع اشتراک تا پایان نیمسال اول (۳۰ دی)",
  term2: "از شروع اشتراک تا پایان نیمسال دوم (۳۱ خرداد)",
  annual: "تمام سال تحصیلی؛ بهترین قیمت",
};
const PAYMENT_ERRORS = {
  PAYMENTS_NOT_CONFIGURED: "پرداخت آنلاین هنوز فعال نشده است. لطفاً بعداً دوباره تلاش کنید.",
  IN_PROGRESS_RETRY: "درخواست قبلی شما در حال آماده‌شدن است؛ چند لحظه بعد دوباره تلاش کنید.",
  GATEWAY_ERROR: "ارتباط با درگاه پرداخت برقرار نشد. چیزی از حساب شما کم نشده؛ کمی بعد دوباره تلاش کنید.",
  ROLE_NOT_ALLOWED: "فقط حساب معلم می‌تواند اشتراک بخرد.",
  AUTH_REQUIRED: "ابتدا وارد حساب خود شوید.",
};

function statusHTML() {
  const s = getSubscription();
  const end = s.endsAt ? formatJalaliLong(new Date(s.endsAt)) : null;
  if (s.state === "active") {
    return `<div class="plan-status plan-status--active"><strong>اشتراک Pro فعال است</strong>${end ? `<span>تا ${end}</span>` : "<span>بدون تاریخ پایان</span>"}
      ${s.upcomingStartsAt ? `<span>دورهٔ بعدی از ${formatJalaliLong(new Date(s.upcomingStartsAt))} شروع می‌شود</span>` : ""}</div>`;
  }
  if (s.state === "pending") {
    return `<div class="plan-status plan-status--pending"><strong>پرداخت شما در حال بررسی است</strong><span>پس از تأیید درگاه، اشتراک خودکار فعال می‌شود. اگر پرداخت کرده‌اید، چند دقیقه بعد دوباره سر بزنید.</span></div>`;
  }
  if (s.state === "expired") {
    return `<div class="plan-status plan-status--expired"><strong>اشتراک شما به پایان رسیده است</strong><span>اطلاعات شما حفظ شده؛ با تمدید، تحلیل‌ها و پنل اولیا دوباره فعال می‌شوند.</span></div>`;
  }
  return `<div class="plan-status"><strong>نسخهٔ رایگان</strong><span>ثبت حضور و غیاب، ارزشیابی، تکلیف، گزارش و بقیهٔ امکانات پایه رایگان است.</span></div>`;
}

const FEATURES = [
  ["تحلیل عملکرد کلاس", false, true],
  ["روند پیشرفت دانش‌آموزان", false, true],
  ["پنل اولیا", false, true],
  ["«کارهای فردا» برای اولیا", false, true],
  ["حضور و غیاب، ارزشیابی، تکلیف، گزارش‌ها", true, true],
];

async function renderPlans() {
  const body = $("#plans-body");
  body.innerHTML = `<p class="empty-state empty-state--inline">در حال دریافت…</p>`;
  const plans = await fetchPlans();
  const t1 = plans.find(p => p.code === "term1"), t2 = plans.find(p => p.code === "term2"), an = plans.find(p => p.code === "annual");
  const saving = t1 && t2 && an ? t1.priceToman + t2.priceToman - an.priceToman : 0;
  const isTeacher = getProfile()?.role !== "parent";
  body.innerHTML = `
    ${statusHTML()}
    <table class="plan-compare"><thead><tr><th></th><th>رایگان</th><th>Pro</th></tr></thead><tbody>
      ${FEATURES.map(([n, f, p]) => `<tr><td>${esc(n)}</td><td>${f ? "✓" : "—"}</td><td>${p ? "✓" : "—"}</td></tr>`).join("")}
    </tbody></table>
    <div class="plan-cards">
      ${plans.map(p => `
        <div class="plan-card ${p.code === "annual" ? "plan-card--best" : ""}">
          ${p.code === "annual" ? `<span class="plan-card__ribbon">بهترین انتخاب${saving > 0 ? ` · ${tomanText(saving)} صرفه‌جویی` : ""}</span>` : ""}
          <h3>${esc(p.title)}</h3>
          <p class="plan-card__price">${tomanText(p.priceToman)}</p>
          <p class="plan-card__note">${esc(PLAN_NOTE[p.code] || "")}</p>
          ${isTeacher ? `<button type="button" class="btn ${p.code === "annual" ? "btn--primary" : "btn--secondary"} btn--sm" data-buy="${esc(p.code)}">خرید</button>` : ""}
        </div>`).join("")}
    </div>
    <p class="plan-footnote">پرداخت از طریق درگاه امن انجام می‌شود و اشتراک فقط پس از تأیید درگاه فعال می‌شود. خرید در حین اشتراک فعال، به‌صورت تمدید پس از پایان دورهٔ فعلی ثبت می‌شود.</p>
    <p class="plan-msg" id="plans-msg" role="status" hidden></p>`;
  body.querySelectorAll("[data-buy]").forEach(btn => btn.addEventListener("click", () => buy(btn.dataset.buy, btn)));
}

function planMsg(text) { const m = $("#plans-msg"); if (m) { m.textContent = text; m.hidden = !text; } }

async function buy(code, btn) {
  document.querySelectorAll("[data-buy]").forEach(b => { b.disabled = true; });
  planMsg("در حال اتصال به درگاه پرداخت…");
  const r = await startPayment(code);
  if (!r.ok) {
    planMsg(PAYMENT_ERRORS[r.error] || "شروع پرداخت ممکن نشد. اتصال اینترنت را بررسی کنید و دوباره تلاش کنید.");
    document.querySelectorAll("[data-buy]").forEach(b => { b.disabled = false; });
    return;
  }
  // فقط به آدرسی می‌رویم که خود سرور ساخته؛ و فقط اگر https باشد.
  try {
    const u = new URL(r.url);
    if (u.protocol !== "https:") throw new Error("insecure");
    location.href = u.href;
  } catch {
    planMsg("آدرس درگاه معتبر نبود. پرداخت انجام نشد.");
    document.querySelectorAll("[data-buy]").forEach(b => { b.disabled = false; });
  }
}

export async function openPlans() {
  await refreshSubscription();
  document.dispatchEvent(new Event("pro:changed"));
  const dlg = $("#modal-plans");
  if (!dlg.open) dlg.showModal();
  renderPlans();
}

/** خلاصهٔ وضعیت در تنظیمات */
export function renderSettingsPlan() {
  const box = $("#settings-plan");
  if (box) box.innerHTML = statusHTML();
}

/** بعد از برگشت از درگاه: آدرس فقط «کجا را نگاه کنیم» می‌گوید؛ نتیجه از دیتابیس خوانده می‌شود. */
export async function handlePaymentReturn() {
  const q = new URLSearchParams(location.search);
  const pid = q.get("pid");
  if (!q.has("payment") && !pid) return;
  history.replaceState(null, "", location.pathname + location.hash);
  if (!pid || !/^[0-9a-f-]{36}$/i.test(pid)) return;

  let st = await getPaymentStatus(pid);
  if (st.status === "pending") {
    await recheckPayment(pid);
    st = await getPaymentStatus(pid);
  }
  await refreshSubscription();
  document.dispatchEvent(new Event("pro:changed"));
  renderSettingsPlan();
  if (st.status === "paid") toast("پرداخت تأیید شد و اشتراک Pro فعال شد. ممنون!", "success");
  else if (st.status === "pending") toast("پرداخت شما هنوز در حال بررسی است. اگر مبلغ کم شده، تا چند دقیقه دیگر خودکار فعال می‌شود.", "info");
  else if (st.status === "cancelled") toast("پرداخت لغو شد و مبلغی کم نشد.", "info");
  else if (st.status === "failed") toast("پرداخت ناموفق بود. اگر مبلغی کم شده، معمولاً تا ۷۲ ساعت به حساب شما برمی‌گردد.", "error");
  else toast("وضعیت پرداخت مشخص نشد. صفحهٔ اشتراک را بررسی کنید.", "info");
}

export function initPlans() {
  document.addEventListener("click", e => {
    const t = e.target.closest?.("[data-open-plans]");
    if (t) { e.preventDefault(); openPlans(); }
  });
  document.addEventListener("pro:changed", renderSettingsPlan);
  renderSettingsPlan();
  handlePaymentReturn();
}
