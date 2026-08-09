/* ============================================================
   PROGRESS (Phase 11) — a per-student dashboard: overall stats
   (attendance, discipline) plus subject charts, built purely by
   aggregating collections that already exist (Evaluations from
   Phase 6, Attendance from Phase 5, Discipline from Phase 9) —
   no new schema needed.
   ============================================================ */
import { getStudents, getEvaluations, getAttendance, getDiscipline, SUBJECTS, subjectById } from "./store.js";
import { $, $$ } from "./ui.js";
import { fa, toJalali, isoToDate, JMONTHS } from "./jalali.js";
import { registerTitle, onViewChange } from "./router.js";

registerTitle("progress", "پیشرفت");

const SCORE = { excellent: 4, good: 3, acceptable: 2, "needs-improvement": 1 };
let mode = "subjects"; // "subjects" | "trend"
let trendSubjectId = SUBJECTS[0].id;

function avgScore(evs) {
  if (!evs.length) return null;
  const avg = evs.reduce((s, e) => s + (SCORE[e.level] || 0), 0) / evs.length;
  return Math.round((avg / 4) * 100);
}

function refreshStudentSelect() {
  const sel = $("#pr-student");
  const students = getStudents();
  const keep = sel.value;
  sel.innerHTML = students.map(s => `<option value="${s.id}">${s.name}</option>`).join("");
  sel.value = students.some(s => s.id === keep) ? keep : (students[0]?.id || "");
}

function renderMiniStats(studentId) {
  const att = getAttendance().filter(a => a.studentId === studentId);
  const presentLike = att.filter(a => a.status === "present").length;
  const attRate = att.length ? Math.round((presentLike / att.length) * 100) : null;

  const evalCount = getEvaluations().filter(e => e.studentId === studentId).length;

  const dp = getDiscipline().filter(d => d.studentId === studentId);
  const positives = dp.filter(d => d.type === "positive").length;
  const warnings = dp.filter(d => d.type === "warning").length;

  $("#pr-stat-attendance").textContent = attRate === null ? "—" : `${fa(attRate)}٪`;
  $("#pr-stat-evals").textContent = fa(evalCount);
  $("#pr-stat-positive").textContent = fa(positives);
  $("#pr-stat-warning").textContent = fa(warnings);
}

function renderSubjectBars(studentId) {
  const wrap = $("#progress-bars");
  const rows = SUBJECTS.map(s => ({
    subject: s,
    score: avgScore(getEvaluations().filter(e => e.studentId === studentId && e.subjectId === s.id)),
  })).filter(r => r.score !== null);

  if (!rows.length) { wrap.innerHTML = `<p class="empty-state empty-state--inline">هنوز ارزشیابی‌ای برای این دانش‌آموز ثبت نشده است.</p>`; return; }

  wrap.innerHTML = rows.map(r => `
    <div style="margin-bottom:14px">
      <div style="display:flex;justify-content:space-between;font-size:13px;font-weight:700;margin-bottom:5px">
        <span>${r.subject.name}</span><span style="font-family:var(--font-mono);color:var(--color-ink-soft)">${fa(r.score)}٪</span>
      </div>
      <div style="height:10px;background:var(--color-surface-alt);border-radius:999px;overflow:hidden">
        <div style="height:100%;width:${r.score}%;background:${r.subject.color};border-radius:999px;transition:width .4s"></div>
      </div>
    </div>`).join("");
}

function lastNMonthlyBuckets(n = 8) {
  const { jy, jm } = toJalali(new Date());
  let y = jy, m = jm;
  const out = [];
  for (let i = 0; i < n; i++) {
    out.unshift({ jy: y, jm: m, label: JMONTHS[m - 1] });
    m--; if (m < 1) { m = 12; y--; }
  }
  return out;
}

/** A small, dependency-free SVG line chart: smoothed curve + gradient
    fill + dots + value labels — built to read as a genuine trend chart,
    not a bare polyline. */
function renderLineChart(buckets, scores, color, gradientId) {
  const W = 560, H = 180, PAD = 28;
  const stepX = (W - PAD * 2) / (buckets.length - 1);
  const known = scores.map((s, i) => (s === null ? null : { x: PAD + i * stepX, y: PAD + (100 - s) * ((H - PAD * 2 - 20) / 100), s }));
  const pathPoints = known.filter(Boolean);

  // Smooth the line with simple quadratic midpoint curves instead of straight segments.
  let path = "";
  pathPoints.forEach((p, i) => {
    if (i === 0) { path += `M${p.x.toFixed(1)},${p.y.toFixed(1)}`; return; }
    const prev = pathPoints[i - 1];
    const midX = ((prev.x + p.x) / 2).toFixed(1);
    path += ` Q${prev.x.toFixed(1)},${prev.y.toFixed(1)} ${midX},${((prev.y + p.y) / 2).toFixed(1)}`;
    if (i === pathPoints.length - 1) path += ` T${p.x.toFixed(1)},${p.y.toFixed(1)}`;
  });

  const areaPath = pathPoints.length
    ? `${path} L${pathPoints[pathPoints.length - 1].x.toFixed(1)},${H - PAD} L${pathPoints[0].x.toFixed(1)},${H - PAD} Z`
    : "";

  const gridLines = [0, 25, 50, 75, 100].map(v => {
    const y = PAD + (100 - v) * ((H - PAD * 2 - 20) / 100);
    return `<line x1="${PAD}" y1="${y}" x2="${W - PAD}" y2="${y}" stroke="var(--color-border)" stroke-width="1" stroke-dasharray="${v === 0 ? "0" : "3,3"}" />`;
  }).join("");

  const dots = known.map((p, i) => p ? `
    <circle cx="${p.x}" cy="${p.y}" r="4.5" fill="${color}" stroke="var(--color-surface)" stroke-width="2.5" />
    <text x="${p.x}" y="${p.y - 12}" text-anchor="middle" font-size="10.5" font-weight="700" fill="var(--color-ink)" font-family="var(--font-mono)">${fa(p.s)}٪</text>
  ` : "").join("");

  const xLabels = buckets.map((b, i) => `<text x="${PAD + i * stepX}" y="${H - 4}" text-anchor="middle" font-size="10" fill="var(--color-ink-faint)">${b.label.slice(0, 4)}</text>`).join("");

  return `
    <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;max-width:100%" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="${gradientId}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${color}" stop-opacity="0.28" />
          <stop offset="100%" stop-color="${color}" stop-opacity="0" />
        </linearGradient>
      </defs>
      ${gridLines}
      ${areaPath ? `<path d="${areaPath}" fill="url(#${gradientId})" stroke="none" />` : ""}
      <path d="${path}" fill="none" stroke="${color}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" />
      ${dots}
      ${xLabels}
    </svg>`;
}

/** «↑ ۱۵٪ بهبود» / «↓ ۸٪ افت» — مقایسه‌ی اولین و آخرین امتیاز شناخته‌شده،
    دقیقاً همان چیزی که سند خواسته: نمودار باید «بهبود یا افت را واضح
    نشان دهد»، نه فقط چندتا نقطه‌ی بی‌روایت. */
function renderTrendBadge(scores) {
  const known = scores.filter(s => s !== null);
  if (known.length < 2) return "";
  const first = known[0], last = known[known.length - 1];
  const diff = last - first;
  if (diff === 0) return `<span class="chip" style="margin-inline-start:8px">بدون تغییر</span>`;
  const improving = diff > 0;
  return `<span class="chip ${improving ? "chip--excellent" : "chip--danger"}" style="margin-inline-start:8px">
    ${improving ? "↑" : "↓"} ${fa(Math.abs(diff))}٪ ${improving ? "بهبود" : "افت"} نسبت به ابتدای دوره
  </span>`;
}

function renderTrend(studentId) {
  const wrap = $("#progress-bars");
  const subject = subjectById(trendSubjectId);
  const buckets = lastNMonthlyBuckets(8);
  const scores = buckets.map(b => avgScore(
    getEvaluations().filter(e => {
      if (e.studentId !== studentId || e.subjectId !== trendSubjectId) return false;
      const j = toJalali(isoToDate(e.date));
      return j.jy === b.jy && j.jm === b.jm;
    })
  ));
  const hasAny = scores.filter(s => s !== null).length >= 2; // a line needs at least 2 points to mean anything

  wrap.innerHTML = `
    <div style="display:flex;align-items:center;flex-wrap:wrap;margin-bottom:10px">
      <p style="font-size:13px;font-weight:700;margin:0">روند ۸ ماه اخیر — ${subject.name}</p>
      ${hasAny ? renderTrendBadge(scores) : ""}
    </div>
    ${hasAny ? renderLineChart(buckets, scores, subject.color, `progress-gradient-${trendSubjectId}`) : `<p class="empty-state empty-state--inline">برای رسم نمودار روند، حداقل به ارزشیابی در دو ماه مختلف نیاز است.</p>`}
  `;
}

export function renderProgress() {
  const studentId = $("#pr-student")?.value;
  if (!studentId) {
    $("#progress-bars").innerHTML = `<p class="empty-state empty-state--inline">ابتدا از صفحه‌ی «دانش‌آموزان» دانش‌آموزان کلاس را اضافه کنید.</p>`;
    return;
  }
  renderMiniStats(studentId);
  if (mode === "subjects") renderSubjectBars(studentId);
  else renderTrend(studentId);
}

export function initProgress() {
  const subjSel = $("#pr-subject");
  subjSel.innerHTML = SUBJECTS.map(s => `<option value="${s.id}">${s.name}</option>`).join("");
  subjSel.value = trendSubjectId;
  subjSel.addEventListener("change", () => { trendSubjectId = subjSel.value; renderProgress(); });

  $("#pr-student")?.addEventListener("change", renderProgress);

  $$("#progress-mode-tabs .pill-tab").forEach(b => b.addEventListener("click", () => {
    mode = b.dataset.mode;
    $$("#progress-mode-tabs .pill-tab").forEach(x => x.classList.toggle("is-active", x === b));
    $("#progress-subject-picker").hidden = mode !== "trend";
    renderProgress();
  }));

  onViewChange(name => { if (name === "progress") { refreshStudentSelect(); renderProgress(); } });
  refreshStudentSelect();
  renderProgress();
}
