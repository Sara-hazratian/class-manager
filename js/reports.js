/* ============================================================
   REPORTS (rewritten again per feedback) —
   Descriptive text is now grouped by the ACTUAL page range the
   teacher recorded at evaluation time (see evaluations.js), not
   guessed from the calendar month. A teacher reviewing Mehr's
   material in Aban no longer produces a wrong/misleading
   descriptive sentence — each distinct range evaluated gets its
   own sentence, so the report can say e.g. "learned pages 1–3
   well, but needs practice on pages 4–6" within the same subject.
   ============================================================ */
import { getStudents, getEvaluations, getAttendance, getDiscipline, getProfile, SUBJECTS } from "./store.js";
import { $, $$, toast } from "./ui.js";
import { fa, termOf, toJalali, isoToDate, formatJalaliLong, formatJalali, todayISO, JMONTHS } from "./jalali.js";
import { registerTitle, onViewChange } from "./router.js";

registerTitle("reports", "گزارش‌ها");

const SCORE = { excellent: 4, good: 3, acceptable: 2, "needs-improvement": 1 };
const LABEL = { 4: "عالی", 3: "خوب", 2: "قابل قبول", 1: "نیاز به تلاش بیشتر" };

const MONTH_KEY_BY_JM = { 7: "mehr", 8: "aban", 9: "azar", 10: "dey", 11: "bahman", 12: "esfand", 1: "farvardin", 2: "ordibehesht", 3: "khordad" };
const ACADEMIC_MONTHS = [["mehr","مهر"],["aban","آبان"],["azar","آذر"],["dey","دی"],["bahman","بهمن"],["esfand","اسفند"],["farvardin","فروردین"],["ordibehesht","اردیبهشت"],["khordad","خرداد"]];

/* ---------- date-range filters ---------- */
function inWeek(iso) {
  const d = isoToDate(iso), today = new Date(); today.setHours(0,0,0,0);
  const start = new Date(today); start.setDate(start.getDate() - 6);
  return d >= start && d <= today;
}
function inTerm(iso, term) { return termOf(isoToDate(iso)) === term; }
function inMonth(iso, monthKey) { return MONTH_KEY_BY_JM[toJalali(isoToDate(iso)).jm] === monthKey; }

function matchesPeriod(iso, period, monthKey) {
  if (period === "weekly") return inWeek(iso);
  if (period === "monthly") return inMonth(iso, monthKey);
  if (period === "term1") return inTerm(iso, 1);
  return inTerm(iso, 2);
}

function periodLabel(period, monthKey) {
  if (period === "weekly") return "هفته اخیر (۷ روز گذشته)";
  if (period === "monthly") return `ماه ${ACADEMIC_MONTHS.find(m => m[0] === monthKey)?.[1] || monthKey}`;
  if (period === "term1") return "نیمسال اول (مهر تا دی)";
  return "نیمسال دوم (بهمن تا خرداد)";
}

function clampLevel(avg) { return Math.max(1, Math.min(4, Math.round(avg))); }

/* ---------- descriptive text, informed by the page range recorded on the evaluation itself ---------- */
function formatTopic(subjectName, pageFrom, pageTo) {
  if (pageFrom && pageTo) return `صفحه ${fa(pageFrom)} تا ${fa(pageTo)} کتاب ${subjectName}`;
  if (pageFrom) return `صفحه ${fa(pageFrom)} به بعد کتاب ${subjectName}`;
  return `درس ${subjectName}`;
}
function describe(subjectName, avg, pageFrom, pageTo) {
  const rounded = clampLevel(avg);
  const topic = formatTopic(subjectName, pageFrom, pageTo);
  const templates = {
    4: `دانش‌آموز ${topic} را به‌خوبی یاد گرفته و در فعالیت‌های کلاسی مشارکت فعال دارد.`,
    3: `دانش‌آموز ${topic} را خوب یاد گرفته و در بیشتر فعالیت‌ها شرکت می‌کند.`,
    2: `دانش‌آموز در ${topic} پیشرفت قابل قبولی داشته، اما نیاز به تمرین بیشتر دارد.`,
    1: `دانش‌آموز در ${topic} ضعیف عمل کرده و نیاز به تمرین و پشتیبانی بیشتری دارد.`,
  };
  return { label: LABEL[rounded], text: templates[rounded] };
}

/* ---------- attendance, grouped by the real months present in the filtered data ---------- */
function groupAttendanceByMonth(records) {
  const groups = {};
  records.forEach(r => {
    const { jy, jm } = toJalali(isoToDate(r.date));
    const key = `${jy}-${jm}`;
    if (!groups[key]) groups[key] = { jy, jm, label: JMONTHS[jm - 1], present: 0, absentDates: [], lateEntries: [], leftDates: [] };
    const g = groups[key];
    if (r.status === "present") g.present++;
    else if (r.status === "absent") g.absentDates.push(formatJalali(isoToDate(r.date)));
    else if (r.status === "late") g.lateEntries.push(`${formatJalali(isoToDate(r.date))}${r.minutes ? ` (${fa(r.minutes)} دقیقه)` : ""}`);
    else if (r.status === "left") g.leftDates.push(formatJalali(isoToDate(r.date)));
  });
  return Object.values(groups).sort((a, b) => a.jy - b.jy || a.jm - b.jm);
}

/* ---------- group a subject's evaluations by the ACTUAL page range recorded on each one ---------- */
function groupByRange(evaluations) {
  const groups = {};
  evaluations.forEach(e => {
    const key = `${e.pageFrom ?? "x"}-${e.pageTo ?? "x"}`;
    if (!groups[key]) groups[key] = { pageFrom: e.pageFrom || null, pageTo: e.pageTo || null, items: [] };
    groups[key].items.push(e);
  });
  return Object.values(groups).sort((a, b) => (a.pageFrom || 0) - (b.pageFrom || 0));
}

/* ---------- build one student's report ---------- */
export function buildStudentReport(studentId, period, monthKey) {
  const student = getStudents().find(s => s.id === studentId);
  if (!student) return null;

  const evs = getEvaluations().filter(e => e.studentId === studentId && matchesPeriod(e.date, period, monthKey));
  const subjectRows = SUBJECTS.map(s => {
    const list = evs.filter(e => e.subjectId === s.id);
    if (!list.length) return null;
    const avg = list.reduce((sum, e) => sum + (SCORE[e.level] || 0), 0) / list.length;

    const ranges = groupByRange(list).map(g => {
      const rAvg = g.items.reduce((sum, e) => sum + (SCORE[e.level] || 0), 0) / g.items.length;
      return { pageFrom: g.pageFrom, pageTo: g.pageTo, count: g.items.length, avg: rAvg, ...describe(s.name, rAvg, g.pageFrom, g.pageTo) };
    });

    return { subject: s, count: list.length, avg, label: LABEL[clampLevel(avg)], ranges };
  }).filter(Boolean);

  const attRecords = getAttendance().filter(a => a.studentId === studentId && matchesPeriod(a.date, period, monthKey));
  const attendanceByMonth = groupAttendanceByMonth(attRecords);

  const disciplineRecords = getDiscipline()
    .filter(d => d.studentId === studentId && matchesPeriod(d.date, period, monthKey))
    .sort((a, b) => a.date.localeCompare(b.date));

  const overall = subjectRows.length ? subjectRows.reduce((s, r) => s + r.avg, 0) / subjectRows.length : null;
  return { student, subjectRows, attendanceByMonth, disciplineRecords, overall };
}

/* ---------- rendering ---------- */
function renderStudentReportHTML(data) {
  if (!data.subjectRows.length && !data.attendanceByMonth.length && !data.disciplineRecords.length) {
    return `<h3>${data.student.name}</h3><p style="font-size:13.5px;color:var(--color-ink-soft);margin-top:8px">برای این بازه هنوز اطلاعاتی ثبت نشده است.</p>`;
  }

  const strengths = data.subjectRows.filter(r => r.avg >= 3.5).map(r => r.subject.name);
  const needsWork = data.subjectRows.filter(r => r.avg < 2.5).map(r => r.subject.name);
  const allDescriptions = data.subjectRows.flatMap(r => r.ranges);

  const attendanceHTML = data.attendanceByMonth.length ? data.attendanceByMonth.map(m => `
    <p style="margin-bottom:6px;font-size:13.5px">
      <strong>${m.label}:</strong>
      حاضر ${fa(m.present)} روز
      ${m.absentDates.length ? ` · ${fa(m.absentDates.length)} بار غیبت (${m.absentDates.join("، ")})` : ""}
      ${m.lateEntries.length ? ` · ${fa(m.lateEntries.length)} بار تأخیر (${m.lateEntries.join("، ")})` : ""}
      ${m.leftDates.length ? ` · ${fa(m.leftDates.length)} بار خروج زودتر (${m.leftDates.join("، ")})` : ""}
    </p>`).join("") : `<p style="font-size:13px;color:var(--color-ink-faint)">حضوری برای این بازه ثبت نشده است.</p>`;

  const disciplineHTML = data.disciplineRecords.length ? `
    <ul style="padding-inline-start:18px;list-style:disc">
      ${data.disciplineRecords.map(d => `<li style="margin-bottom:4px;font-size:13px">
        <span class="chip ${d.type === "positive" ? "chip--excellent" : "chip--danger"}">${d.type === "positive" ? "مثبت" : "تذکر"}</span>
        ${formatJalali(isoToDate(d.date))} — ${d.description}</li>`).join("")}
    </ul>` : `<p style="font-size:13px;color:var(--color-ink-faint)">موردی ثبت نشده است.</p>`;

  return `
    <h3>${data.student.name}</h3>
    ${data.overall !== null ? `<p style="margin:8px 0 14px"><strong>ارزیابی کلی:</strong> ${LABEL[clampLevel(data.overall)]}</p>` : ""}

    ${data.subjectRows.length ? `
      <div class="eval-table-wrap" style="margin-bottom:16px">
        <table class="eval-table">
          <thead><tr><th>درس</th><th>سطح کلی</th><th>تعداد ارزشیابی</th></tr></thead>
          <tbody>${data.subjectRows.map(r => `<tr><td>${r.subject.name}</td><td>${r.label}</td><td>${fa(r.count)}</td></tr>`).join("")}</tbody>
        </table>
      </div>
      ${strengths.length ? `<p style="margin-bottom:6px"><strong>نقاط قوت:</strong> ${strengths.join("، ")}</p>` : ""}
      ${needsWork.length ? `<p style="margin-bottom:6px"><strong>نیازمند تلاش بیشتر:</strong> ${needsWork.join("، ")}</p>` : ""}
      <p style="margin:12px 0 6px"><strong>توصیف عملکرد به تفکیک مبحث ارزشیابی‌شده:</strong></p>
      <ul style="padding-inline-start:18px;list-style:disc;margin-bottom:16px">
        ${allDescriptions.map(r => `<li style="margin-bottom:5px;font-size:13.5px;color:var(--color-ink-soft)">${r.text}</li>`).join("")}
      </ul>` : ""}

    <p style="margin-bottom:6px"><strong>حضور و غیاب:</strong></p>
    ${attendanceHTML}

    <p style="margin:12px 0 6px"><strong>انضباط:</strong></p>
    ${disciplineHTML}
  `;
}

const GRADE_LABELS = { grade1: "پایه اول", grade2: "پایه دوم", grade3: "پایه سوم", grade4: "پایه چهارم", grade5: "پایه پنجم", grade6: "پایه ششم" };

export function renderReport() {
  const box = $("#report-preview"); if (!box) return;
  const scope = $("#rp-scope")?.value || "student";
  const period = $("#rp-period")?.value || "term1";
  const monthKey = $("#rp-month")?.value;

  const students = scope === "class" ? getStudents() : [getStudents().find(s => s.id === $("#rp-student")?.value)].filter(Boolean);
  if (!students.length) { box.innerHTML = `<p class="empty-state empty-state--inline">ابتدا از صفحه‌ی «دانش‌آموزان» دانش‌آموزان کلاس را اضافه کنید.</p>`; return; }

  const profile = getProfile();
  const letterhead = profile ? `
    <div class="report-letterhead">
      <div>
        <p class="report-letterhead__school">${profile.schoolName || ""}</p>
        <p class="report-letterhead__meta">${profile.fullName || ""} · ${GRADE_LABELS[profile.grade] || ""} · کلاس ${profile.className || ""} · سال تحصیلی ${profile.academicYear || ""}</p>
      </div>
      <img src="icons/logo-horizontal.png" alt="ClassPilot" style="height:38px;width:auto" />
    </div>` : "";

  const header = `
    <p style="font-family:var(--font-mono);font-size:12px;color:var(--color-ink-faint);margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid var(--color-border)">
      ${periodLabel(period, monthKey)} · تاریخ صدور: ${formatJalaliLong(isoToDate(todayISO()))}
    </p>`;

  const sections = students.map(s => buildStudentReport(s.id, period, monthKey)).filter(Boolean)
    .map(data => `<div class="report-student-section">${renderStudentReportHTML(data)}</div>`);
  box.innerHTML = letterhead + header + sections.join("");
}

/* ---------- export ---------- */
function currentReportData() {
  const scope = $("#rp-scope")?.value || "student";
  const period = $("#rp-period")?.value || "term1";
  const monthKey = $("#rp-month")?.value;
  const students = scope === "class" ? getStudents() : [getStudents().find(s => s.id === $("#rp-student")?.value)].filter(Boolean);
  return students.map(s => buildStudentReport(s.id, period, monthKey)).filter(Boolean);
}

function exportExcel() {
  const rows = currentReportData();
  if (!rows.length) return;
  if (typeof XLSX === "undefined") {
    toast("کتابخانه‌ی اکسل هنوز کامل بارگذاری نشده — چند لحظه صبر کنید و دوباره تلاش کنید", "error");
    return;
  }

  // Sheet 1: evaluations — one row per (student, subject, page-range evaluated)
  const evalSheet = [["دانش‌آموز", "درس", "از صفحه", "تا صفحه", "سطح", "تعداد ارزشیابی"]];
  rows.forEach(r => {
    if (!r.subjectRows.length) { evalSheet.push([r.student.name, "—", "", "", "—", 0]); return; }
    r.subjectRows.forEach(sub => sub.ranges.forEach(rg => {
      evalSheet.push([r.student.name, sub.subject.name, rg.pageFrom || "", rg.pageTo || "", rg.label, rg.count]);
    }));
  });

  // Sheet 2: attendance — one row per (student, month)
  const attSheet = [["دانش‌آموز", "ماه", "روزهای حاضر", "تعداد غیبت", "تاریخ‌های غیبت", "تعداد تأخیر", "تاریخ‌های تأخیر"]];
  rows.forEach(r => {
    if (!r.attendanceByMonth.length) { attSheet.push([r.student.name, "—", 0, 0, "", 0, ""]); return; }
    r.attendanceByMonth.forEach(m => attSheet.push([
      r.student.name, m.label, m.present, m.absentDates.length, m.absentDates.join("، "), m.lateEntries.length, m.lateEntries.join("، "),
    ]));
  });

  // Sheet 3: discipline — one row per record
  const dpSheet = [["دانش‌آموز", "تاریخ", "نوع", "شرح"]];
  rows.forEach(r => {
    if (!r.disciplineRecords.length) { dpSheet.push([r.student.name, "—", "—", "—"]); return; }
    r.disciplineRecords.forEach(d => dpSheet.push([r.student.name, formatJalali(isoToDate(d.date)), d.type === "positive" ? "مثبت" : "تذکر", d.description]));
  });

  const wb = XLSX.utils.book_new();
  wb.Workbook = { Views: [{ RTL: true }] }; // opens right-to-left in Excel

  const addSheet = (data, name, colWidths) => {
    const ws = XLSX.utils.aoa_to_sheet(data);
    ws["!cols"] = colWidths.map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, name);
  };
  addSheet(evalSheet, "ارزشیابی‌ها", [18, 14, 9, 9, 16, 14]);
  addSheet(attSheet, "حضور و غیاب", [18, 10, 12, 12, 28, 12, 28]);
  addSheet(dpSheet, "انضباط", [18, 12, 10, 30]);

  XLSX.writeFile(wb, `classpilot-report-${todayISO()}.xlsx`);
  toast("فایل اکسل دانلود شد");
}

function exportPDF() { window.print(); }

/* ---------- init ---------- */
export function refreshReportSelectors() {
  const studentSel = $("#rp-student");
  const students = getStudents();
  const keep = studentSel.value;
  studentSel.innerHTML = students.map(s => `<option value="${s.id}">${s.name}</option>`).join("");
  studentSel.value = students.some(s => s.id === keep) ? keep : (students[0]?.id || "");

  const monthSel = $("#rp-month");
  if (monthSel && !monthSel.dataset.filled) {
    monthSel.innerHTML = ACADEMIC_MONTHS.map(([key, label]) => `<option value="${key}">${label}</option>`).join("");
    monthSel.value = MONTH_KEY_BY_JM[toJalali(new Date()).jm];
    monthSel.dataset.filled = "1";
  }

  renderReport();
}

export function initReports() {
  $("#rp-scope")?.addEventListener("change", () => {
    $("#rp-student-picker").hidden = $("#rp-scope").value !== "student";
    renderReport();
  });
  $("#rp-period")?.addEventListener("change", () => {
    $("#rp-month-picker").hidden = $("#rp-period").value !== "monthly";
    renderReport();
  });
  $("#rp-month")?.addEventListener("change", renderReport);
  $("#rp-student")?.addEventListener("change", renderReport);

  $("#btn-export-excel")?.addEventListener("click", exportExcel);
  $("#btn-export-pdf")?.addEventListener("click", exportPDF);

  onViewChange(name => { if (name === "reports") refreshReportSelectors(); });
  refreshReportSelectors();
}
