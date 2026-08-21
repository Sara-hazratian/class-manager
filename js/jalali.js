/* ============================================================
   JALALI CALENDAR — dependency-free Gregorian <-> Jalali
   The app stores real Gregorian ISO dates ("YYYY-MM-DD");
   this module is used only for DISPLAY and for figuring out
   which academic month/term a date belongs to.
   ============================================================ */
const div = (a, b) => ~~(a / b);
const mod = (a, b) => a - ~~(a / b) * b;
const BREAKS = [-61,9,38,199,426,686,756,818,1111,1181,1210,1635,2060,2097,2192,2262,2324,2394,2456,3178];

function jalCal(jy) {
  const gy = jy + 621; let leapJ = -14, jp = BREAKS[0], jump = 0;
  for (let i = 1; i < BREAKS.length; i++) {
    const jm = BREAKS[i]; jump = jm - jp;
    if (jy < jm) break;
    leapJ += div(jump, 33) * 8 + div(mod(jump, 33), 4); jp = jm;
  }
  let n = jy - jp;
  leapJ += div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ++;
  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;
  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
  let leap = mod(mod(n + 1, 33) - 1, 4);
  if (leap === -1) leap = 4;
  return { leap, gy, march };
}
function g2d(gy, gm, gd) {
  let d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4) + div(153 * mod(gm + 9, 12) + 2, 5) + gd - 34840408;
  return d - div(div(gy + div(gm - 8, 6) + 100100, 100) * 3, 4) + 752;
}
function d2g(jdn) {
  let j = 4 * jdn + 139361631;
  j += div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = div(mod(j, 1461), 4) * 5 + 308;
  const gd = div(mod(i, 153), 5) + 1;
  const gm = mod(div(i, 153), 12) + 1;
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
  return { gy, gm, gd };
}
function d2j(jdn) {
  const gy = d2g(jdn).gy; let jy = gy - 621;
  const r = jalCal(jy); const jdn1f = g2d(gy, 3, r.march);
  let k = jdn - jdn1f, jm, jd;
  if (k >= 0) {
    if (k <= 185) return { jy, jm: 1 + div(k, 31), jd: mod(k, 31) + 1 };
    k -= 186;
  } else { jy--; k += 179; if (r.leap === 1) k++; }
  jm = 7 + div(k, 30); jd = mod(k, 30) + 1;
  return { jy, jm, jd };
}
function j2d(jy, jm, jd) {
  const r = jalCal(jy);
  return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
}

export function toJalali(date) { return d2j(g2d(date.getFullYear(), date.getMonth() + 1, date.getDate())); }
export function fromJalali(jy, jm, jd) { const { gy, gm, gd } = d2g(j2d(jy, jm, jd)); return new Date(gy, gm - 1, gd); }

export const JMONTHS = ["فروردین","اردیبهشت","خرداد","تیر","مرداد","شهریور","مهر","آبان","آذر","دی","بهمن","اسفند"];
const WEEKDAYS = { 6: "شنبه", 0: "یکشنبه", 1: "دوشنبه", 2: "سه‌شنبه", 3: "چهارشنبه", 4: "پنجشنبه", 5: "جمعه" };

export function fa(n) {
  return String(n).replace(/[0-9]/g, d => "۰۱۲۳۴۵۶۷۸۹"[d]);
}
export function formatJalali(date) {
  const { jy, jm, jd } = toJalali(date);
  return fa(`${jy}/${String(jm).padStart(2,"0")}/${String(jd).padStart(2,"0")}`);
}
export function formatJalaliLong(date) {
  const { jy, jm, jd } = toJalali(date);
  return `${fa(jd)} ${JMONTHS[jm - 1]} ${fa(jy)}`;
}
export function weekdayName(date) { return WEEKDAYS[date.getDay()]; }
export function todayISO() {
  const d = new Date(), p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function tomorrowISO() {
  const d = new Date(); d.setDate(d.getDate() + 1);
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function isoToDate(iso) { return new Date(iso + "T00:00:00"); }

/** Academic term: 1 = Mehr..Dey (jm 7-10), 2 = Bahman..Khordad (jm 11,12,1,2,3) */
export function termOf(date) {
  const { jm } = toJalali(date);
  return (jm >= 7 && jm <= 10) ? 1 : 2;
}
/** Academic month key for a date, e.g. "mehr" */
export const ACADEMIC_MONTHS = { 7:"مهر", 8:"آبان", 9:"آذر", 10:"دی", 11:"بهمن", 12:"اسفند", 1:"فروردین", 2:"اردیبهشت", 3:"خرداد" };
export function academicMonthName(date) { return ACADEMIC_MONTHS[toJalali(date).jm] || JMONTHS[toJalali(date).jm - 1]; }

/** بازه‌ی سال تحصیلی جاری (مهر تا خرداد) — برای نمایش پیش‌فرض صفحه‌ی
    اولیا: از اول مهر، تا وقتی معلم جدید چیزی ثبت نکرده، صفحه طبیعتاً
    خالی می‌ماند (چون هیچ داده‌ای در این بازه هنوز وجود ندارد) — بدون
    نیاز به هیچ عملیات «پاک‌سازی» دستی یا خودکار جداگانه. */
export function currentAcademicYearRange() {
  const { jy, jm } = toJalali(new Date());
  const startJy = jm >= 7 ? jy : jy - 1; // اگر الان تیر/مرداد/شهریور یا فروردین..خرداد باشد، سال تحصیلی از پارسال مهر شروع شده
  const start = fromJalali(startJy, 7, 1);
  const end = fromJalali(startJy + 1, 3, 31);
  const iso = d => { const p = n => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
  return { start: iso(start), end: iso(end) };
}
