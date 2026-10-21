/* ============================================================
   DATE PICKER — انتخاب‌گر تاریخ شمسی (بدون هیچ کتابخانه‌ی بیرونی)
   ------------------------------------------------------------
   یک پنجره‌ی ساده با انتخاب سال/ماه و جدول روزهای ماه (هفته از شنبه).
   تاریخ‌ها در برنامه همیشه به‌صورت میلادی ISO ("YYYY-MM-DD") ذخیره
   می‌شوند؛ این ماژول فقط برای نمایش و انتخاب شمسی است و ISO برمی‌گرداند.
   استفاده:
     pickDate({ selectedISO, minISO, maxISO, onSelect: iso => { ... } })
     mountDateNav(container, { getDate, onChange })   ← ناوبری کامل تاریخ برای هر صفحه
   ============================================================ */
import { toJalali, fromJalali, JMONTHS, fa, todayISO, formatJalaliLong, weekdayName, isoToDate } from "./jalali.js";
import { $, $$ } from "./ui.js";

const WEEK_HEADS = ["ش", "ی", "د", "س", "چ", "پ", "ج"]; // شنبه ... جمعه

const pad = n => String(n).padStart(2, "0");
export function dateToISO(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

/** کمترین تاریخ مجاز برای ثبت: اول مهرِ «سال شمسی گذشته».
    مثلاً در سال ۱۴۰۵ تا اول مهر ۱۴۰۴ و در سال ۱۴۰۶ تا اول مهر ۱۴۰۵ — یعنی
    فقط یک سال به عقب، نه بیشتر. */
export function earliestAllowedISO() {
  const { jy } = toJalali(new Date());
  return dateToISO(fromJalali(jy - 1, 7, 1));
}

function daysInJalaliMonth(jy, jm) {
  let n = 29;
  for (const d of [30, 31]) {
    const j = toJalali(fromJalali(jy, jm, d));
    if (j.jy === jy && j.jm === jm && j.jd === d) n = d;
  }
  return n;
}

let view = { jy: 0, jm: 1 };
let selectedISO = null;
let minISO = null;
let maxISO = null;
let onSelectCb = null;
let wired = false;

function render() {
  const dlg = $("#modal-date");
  if (!dlg) return;
  const today = todayISO();
  const { jy: tyJ } = toJalali(new Date());

  // سال‌ها: فقط بازه‌ی مجاز (حداکثر یک سال به عقب تا امروز)
  const minJy = minISO ? toJalali(new Date(minISO + "T00:00:00")).jy : tyJ - 1;
  const years = [];
  for (let y = minJy; y <= tyJ; y++) years.push(y);
  if (!years.includes(view.jy)) years.push(view.jy);
  years.sort((a, b) => a - b);

  $("#date-year").innerHTML = years.map(y => `<option value="${y}" ${y === view.jy ? "selected" : ""}>${fa(y)}</option>`).join("");
  $("#date-month").innerHTML = JMONTHS.map((m, i) => `<option value="${i + 1}" ${i + 1 === view.jm ? "selected" : ""}>${m}</option>`).join("");

  const first = fromJalali(view.jy, view.jm, 1);
  const offset = (first.getDay() + 1) % 7; // شنبه = ۰
  const total = daysInJalaliMonth(view.jy, view.jm);

  let html = WEEK_HEADS.map(h => `<span class="cal-head">${h}</span>`).join("");
  for (let i = 0; i < offset; i++) html += `<span></span>`;
  for (let d = 1; d <= total; d++) {
    const iso = dateToISO(fromJalali(view.jy, view.jm, d));
    const disabled = (maxISO && iso > maxISO) || (minISO && iso < minISO);
    const cls = ["cal-day", iso === selectedISO ? "is-selected" : "", iso === today ? "is-today" : ""].join(" ");
    html += `<button type="button" class="${cls}" data-iso="${iso}" ${disabled ? "disabled" : ""}>${fa(d)}</button>`;
  }
  $("#date-grid").innerHTML = html;

  $$("#date-grid .cal-day").forEach(b => b.addEventListener("click", () => choose(b.dataset.iso)));
}

function choose(iso) {
  $("#modal-date").close();
  if (onSelectCb) onSelectCb(iso);
}

function shiftMonth(delta) {
  let m = view.jm + delta, y = view.jy;
  if (m < 1) { m = 12; y -= 1; }
  if (m > 12) { m = 1; y += 1; }
  view = { jy: y, jm: m };
  render();
}

function wire() {
  if (wired) return;
  wired = true;
  $("#date-year").addEventListener("change", e => { view.jy = Number(e.target.value); render(); });
  $("#date-month").addEventListener("change", e => { view.jm = Number(e.target.value); render(); });
  $("#date-prev-month").addEventListener("click", () => shiftMonth(-1));
  $("#date-next-month").addEventListener("click", () => shiftMonth(1));
  $("#date-today").addEventListener("click", () => choose(todayISO()));
}

export function pickDate({ selectedISO: sel, minISO: min, maxISO: max, onSelect }) {
  const dlg = $("#modal-date");
  if (!dlg) return;
  wire();
  selectedISO = sel || todayISO();
  minISO = min || null;
  maxISO = max || null;
  onSelectCb = onSelect;
  const j = toJalali(new Date(selectedISO + "T00:00:00"));
  view = { jy: j.jy, jm: j.jm };
  render();
  dlg.showModal();
}

/* ---------- ناوبری تاریخ: «روز قبل ‹ تاریخ › روز بعد» + برگشت به امروز ----------
   هر صفحه (ارزشیابی، حضور و غیاب، تکالیف، انضباط) فقط یک کانتینر می‌دهد و
   وقتی کاربر تاریخ را عوض کرد، onChange(iso) صدا زده می‌شود. */
export function mountDateNav(container, { getDate, onChange }) {
  if (!container) return { refresh() {} };
  container.innerHTML = `
    <div class="date-nav">
      <button type="button" class="btn btn--ghost btn--sm" data-nav="prev">روز قبل</button>
      <button type="button" class="date-trigger" data-nav="pick" title="انتخاب تاریخ" style="cursor:pointer">
        <svg class="icon"><use href="#i-calendar"/></svg>
        <span data-nav="label"></span><span data-nav="weekday" style="color:var(--color-ink-faint);margin-inline-start:6px"></span>
      </button>
      <button type="button" class="btn btn--ghost btn--sm" data-nav="next">روز بعد</button>
      <button type="button" class="btn btn--secondary btn--sm" data-nav="today" hidden>برگشت به امروز</button>
      <span class="chip chip--warn" data-nav="past" hidden>تاریخ گذشته</span>
    </div>`;
  const q = name => container.querySelector(`[data-nav="${name}"]`);

  const refresh = () => {
    const iso = getDate();
    const d = isoToDate(iso);
    const today = todayISO(), min = earliestAllowedISO();
    q("label").textContent = formatJalaliLong(d);
    q("weekday").textContent = weekdayName(d);
    q("prev").disabled = iso <= min;
    q("next").disabled = iso >= today;
    q("today").hidden = iso === today;
    q("past").hidden = iso === today;
  };
  const go = iso => {
    if (!iso || iso < earliestAllowedISO() || iso > todayISO()) return;
    onChange(iso);
    refresh();
  };
  const shift = days => { const d = isoToDate(getDate()); d.setDate(d.getDate() + days); go(dateToISO(d)); };

  q("prev").addEventListener("click", () => shift(-1));
  q("next").addEventListener("click", () => shift(1));
  q("today").addEventListener("click", () => go(todayISO()));
  q("pick").addEventListener("click", () =>
    pickDate({ selectedISO: getDate(), minISO: earliestAllowedISO(), maxISO: todayISO(), onSelect: go }));

  refresh();
  return { refresh };
}
