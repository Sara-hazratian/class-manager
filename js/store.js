/* ============================================================
   STORE — the ONLY file that talks to Supabase.
   ------------------------------------------------------------
   Every getX() is SYNCHRONOUS on purpose (reads an in-memory
   cache) so none of the ~20 other modules that call these
   functions need to change. Every setX() is ASYNC: it updates
   the cache immediately (so the very next line of UI code sees
   the change with no await needed), then pushes the diff to
   Supabase in the background. loadAllCollections() fills every
   cache right after sign-in (see app.js).
   ============================================================ */

export function uid(_prefix) {
  // Real UUIDs — every table's "id" column in schema.sql is typed `uuid`.
  // The prefix argument is kept so existing call sites (uid("st"), uid("ev"), …)
  // still work unchanged; it's just ignored now.
  return crypto.randomUUID();
}

let currentUserId = null;
async function requireUserId() {
  if (currentUserId) return currentUserId;
  const { sb } = await import("./supabase-client.js");
  const { data } = await sb.auth.getUser();
  if (!data?.user) throw new Error("not signed in");
  currentUserId = data.user.id;
  return currentUserId;
}

/* ---------- generic list diff/sync engine, shared by every collection below ---------- */
async function diffAndSync(table, oldList, newList, toDbRow) {
  const teacherId = await requireUserId();
  const { sb } = await import("./supabase-client.js");

  const oldById = new Map(oldList.map(r => [r.id, r]));
  const newIds = new Set(newList.map(r => r.id));

  const toDeleteIds = [...oldById.keys()].filter(id => !newIds.has(id));
  const toInsert = newList.filter(r => !oldById.has(r.id));
  const toUpdate = newList.filter(r => {
    const prev = oldById.get(r.id);
    return prev && JSON.stringify(prev) !== JSON.stringify(r);
  });

  if (toDeleteIds.length) {
    const { error } = await sb.from(table).delete().in("id", toDeleteIds);
    if (error) throw error;
  }
  if (toInsert.length) {
    const { error } = await sb.from(table).insert(toInsert.map(r => toDbRow(r, teacherId)));
    if (error) throw error;
  }
  for (const row of toUpdate) {
    const { error } = await sb.from(table).update(toDbRow(row, teacherId)).eq("id", row.id);
    if (error) throw error;
  }
}

function logSyncError(collection, err) {
  console.error(`ClassPilot: failed to sync "${collection}" to the database`, err);
}

/* ---------- Teacher profile + theme (Setup / Settings) ---------- */
export const THEME_COLORS = [
  { id: "blue",   label: "آبی" },
  { id: "green",  label: "سبز" },
  { id: "purple", label: "بنفش" },
  { id: "orange", label: "نارنجی" },
  { id: "teal",   label: "فیروزه‌ای" },
];

let profileCache = null;
export const getProfile = () => profileCache;
export const isSetupComplete = () => Boolean(profileCache?.schoolName);

function dbRowToProfile(row) {
  if (!row) return null;
  return {
    fullName: row.full_name || "", schoolName: row.school_name || "", grade: row.grade || "",
    className: row.class_name || "", academicYear: row.academic_year || "",
    themeColor: row.theme_color || "blue", role: row.role,
    username: row.username || "", personnelCode: row.personnel_code || "",
    verified: row.verified,
  };
}

/** Fetches the signed-in user's profile row and fills the cache. Called once right
    after sign-in — see app.js's afterAuthSuccess(). */
export async function loadProfile() {
  const { sb } = await import("./supabase-client.js");
  const { data: userData } = await sb.auth.getUser();
  if (!userData?.user) { profileCache = null; return null; }
  currentUserId = userData.user.id;

  const { data, error } = await sb.from("profiles").select("*").eq("id", userData.user.id).single();
  if (error) { console.error("ClassPilot: could not load profile", error); profileCache = null; return null; }

  profileCache = dbRowToProfile(data);
  return profileCache;
}

export async function setProfile(patch) {
  const { sb } = await import("./supabase-client.js");
  const teacherId = await requireUserId();

  const dbPatch = {};
  if (patch.fullName !== undefined) dbPatch.full_name = patch.fullName;
  if (patch.schoolName !== undefined) dbPatch.school_name = patch.schoolName;
  if (patch.grade !== undefined) dbPatch.grade = patch.grade;
  if (patch.className !== undefined) dbPatch.class_name = patch.className;
  if (patch.academicYear !== undefined) dbPatch.academic_year = patch.academicYear;
  if (patch.themeColor !== undefined) dbPatch.theme_color = patch.themeColor;

  const { error } = await sb.from("profiles").update(dbPatch).eq("id", teacherId);
  if (error) throw error;

  profileCache = { ...profileCache, ...patch };
  return profileCache;
}

/* ---------- Fixed subject list (static — no database needed) ---------- */
export const SUBJECTS = [
  { id: "math",       name: "ریاضی",           icon: "i-chart",     color: "var(--color-primary)", tint: "var(--color-primary-tint)" },
  { id: "persian",    name: "فارسی",           icon: "i-book",      color: "var(--color-info)",    tint: "var(--color-info-tint)" },
  { id: "writing",    name: "نگارش",           icon: "i-edit",      color: "var(--color-plum)",    tint: "var(--color-plum-tint)" },
  { id: "science",    name: "علوم",            icon: "i-flask",     color: "var(--color-success)", tint: "var(--color-success-tint)" },
  { id: "quran",      name: "قرآن",            icon: "i-book",      color: "var(--color-warning)", tint: "var(--color-warning-tint)" },
  { id: "religious",  name: "هدیه‌های آسمان",  icon: "i-note",      color: "var(--color-plum)",    tint: "var(--color-plum-tint)" },
  { id: "social",     name: "مطالعات اجتماعی", icon: "i-map",       color: "var(--color-info)",    tint: "var(--color-info-tint)" },
  { id: "cursive",    name: "خط تحریری",       icon: "i-edit",      color: "var(--color-warning)", tint: "var(--color-warning-tint)" },
  { id: "thinking",   name: "تفکر و پژوهش",    icon: "i-clipboard", color: "var(--color-success)", tint: "var(--color-success-tint)" },
  { id: "tech",       name: "کار و فناوری",    icon: "i-clipboard", color: "var(--color-primary)", tint: "var(--color-primary-tint)" },
  { id: "art",        name: "هنر",             icon: "i-image",     color: "var(--color-plum)",    tint: "var(--color-plum-tint)" },
  { id: "sport",      name: "ورزش",            icon: "i-users",     color: "var(--color-success)", tint: "var(--color-success-tint)" },
  { id: "discipline", name: "انضباط",          icon: "i-check-cal", color: "var(--color-warning)", tint: "var(--color-warning-tint)" },
];
export function subjectById(id) { return SUBJECTS.find(s => s.id === id); }

export const SUBJECT_PAGE_COUNTS = {
  grade1: { persian: 114, math: 175, science: 103, quran: 80 },
  grade2: { quran: 110, religious: 95, persian: 114, math: 144, science: 103 },
  grade3: { quran: 113, religious: 128, persian: 128, math: 150, science: 128, social: 98 },
  grade4: { quran: 77, religious: 128, persian: 140, math: 154, science: 119, social: 103, cursive: 64 },
  grade5: { quran: 80, religious: 128, persian: 140, math: 141, science: 104, social: 129, cursive: 88 },
  grade6: { quran: 83, religious: 112, persian: 114, math: 144, science: 106, social: 151, thinking: 112, tech: 127, cursive: 55 },
};

export const DAYS = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه"];
export function todayDayIndex() {
  const map = { 6: 0, 0: 1, 1: 2, 2: 3, 3: 4, 4: -1, 5: -1 }; // JS getDay() -> our index; Thursday & Friday = no school
  return map[new Date().getDay()];
}
export const PERIODS = 5;

/* ================================================================
   STUDENTS
   ================================================================ */
let studentsCache = [];
// این تابع همیشه لیست کامل (شامل بایگانی‌شده‌ها) را برمی‌گرداند — چون
// setStudents/setStudentsChecked برای تشخیص «چه چیزی حذف شده»، آن را
// با قبل مقایسه می‌کنند؛ اگر اینجا فیلتر می‌شد، هر بار ذخیره، بایگانی‌شده‌ها
// را به‌اشتباه «حذف‌شده» تشخیص می‌داد. برای صفحات روزمره (حضور و غیاب،
// ارزشیابی، و...) به‌جایش از getActiveStudents() استفاده کنید.
export const getStudents = () => studentsCache;
// برای صفحات روزمره — دانش‌آموز بایگانی‌شده دیگر اینجا ظاهر نمی‌شود.
export const getActiveStudents = () => studentsCache.filter(s => !s.archived);
export const getArchivedStudents = () => studentsCache.filter(s => s.archived);

function studentToDb(s, teacherId) {
  return { id: s.id, teacher_id: teacherId, name: s.name, national_id: s.nationalId, phone: s.phone || null, group_id: s.groupId || null, notes: s.notes || null };
}
function dbToStudent(r) {
  return { id: r.id, name: r.name, nationalId: r.national_id, phone: r.phone || "", groupId: r.group_id, notes: r.notes || "", teacherId: r.teacher_id, archived: r.archived || false };
}

export async function setStudents(newList) {
  const oldList = studentsCache;
  studentsCache = newList;
  try { await diffAndSync("students", oldList, newList, studentToDb); }
  catch (err) { logSyncError("students", err); }
}

/** مثل setStudents، ولی خطا را قورت نمی‌دهد — برای فرم افزودن/ویرایش
    دانش‌آموز، جایی که باید فوراً بفهمیم ذخیره واقعاً موفق بود یا نه
    (مثلاً کد ملی از قبل توسط معلم دیگری ثبت شده — جلوگیری از جعل
    ارزشیابی توسط یک «معلم» ساختگی برای دانش‌آموز واقعی کس دیگری). */
export async function setStudentsChecked(newList) {
  const oldList = studentsCache;
  studentsCache = newList;
  try {
    await diffAndSync("students", oldList, newList, studentToDb);
  } catch (err) {
    studentsCache = oldList; // برگردان به حالت قبل، چون واقعاً ذخیره نشد
    if (err.code === "23505" || (err.message || "").includes("national_id")) {
      throw new Error("این کد ملی قبلاً برای دانش‌آموز دیگری (در کلاس دیگری) ثبت شده است.");
    }
    throw err;
  }
}

/** پایان سال تحصیلی — دانش‌آموز را بایگانی کن. سوابقش (ارزشیابی، حضور،
    گزارش‌ها) دست‌نخورده می‌ماند و خودش/والدینش هنوز می‌توانند ببینندش،
    ولی کد ملی‌اش آزاد می‌شود تا معلم سال بعد بتواند دوباره اضافه‌اش
    کند — بدون این کار، آن کد ملی برای همیشه قفل می‌ماند. */
export async function archiveStudent(studentId) {
  const { sb } = await import("./supabase-client.js");
  const { error } = await sb.from("students").update({ archived: true }).eq("id", studentId);
  if (error) throw error;
  const s = studentsCache.find(x => x.id === studentId);
  if (s) s.archived = true;
}

/* ================================================================
   GROUPS
   ================================================================ */
let groupsCache = [];
export const getGroups = () => groupsCache;

function groupToDb(g, teacherId) { return { id: g.id, teacher_id: teacherId, name: g.name }; }
function dbToGroup(r) { return { id: r.id, name: r.name }; }

export async function setGroups(newList) {
  const oldList = groupsCache;
  groupsCache = newList;
  try { await diffAndSync("groups", oldList, newList, groupToDb); }
  catch (err) { logSyncError("groups", err); }
}

/* ================================================================
   ATTENDANCE
   ================================================================ */
let attendanceCache = [];
export const getAttendance = () => attendanceCache;

function attendanceToDb(a, teacherId) {
  return { id: a.id, teacher_id: teacherId, student_id: a.studentId, date: a.date, status: a.status, late_minutes: a.lateMinutes ?? null, early_exit: !!a.earlyExit, exit_info: a.exit || null };
}
function dbToAttendance(r) {
  return { id: r.id, studentId: r.student_id, date: r.date, status: r.status, lateMinutes: r.late_minutes, earlyExit: !!r.early_exit, exit: r.exit_info || "" };
}

export async function setAttendance(newList) {
  const oldList = attendanceCache;
  attendanceCache = newList;
  try { await diffAndSync("attendance", oldList, newList, attendanceToDb); }
  catch (err) { logSyncError("attendance", err); }
}

/* ================================================================
   EVALUATIONS — page range is stored ON the record (see evaluations.js)
   ================================================================ */
let evaluationsCache = [];
export const getEvaluations = () => evaluationsCache;

function evaluationToDb(e, teacherId) {
  return { id: e.id, teacher_id: teacherId, student_id: e.studentId, subject_id: e.subjectId, period: e.period, kind: e.kind || null, level: e.level, date: e.date, page_from: e.pageFrom ?? null, page_to: e.pageTo ?? null, topic: e.topic || null };
}
function dbToEvaluation(r) {
  return { id: r.id, studentId: r.student_id, subjectId: r.subject_id, period: r.period, kind: r.kind || "", level: r.level, date: r.date, pageFrom: r.page_from, pageTo: r.page_to, topic: r.topic || "" };
}

export async function setEvaluations(newList) {
  const oldList = evaluationsCache;
  evaluationsCache = newList;
  try { await diffAndSync("evaluations", oldList, newList, evaluationToDb); }
  catch (err) { logSyncError("evaluations", err); }
}

/* ================================================================
   HOMEWORK
   ================================================================ */
let homeworkCache = [];
export const getHomework = () => homeworkCache;

function homeworkToDb(h, teacherId) {
  return { id: h.id, teacher_id: teacherId, student_id: h.studentId, subject_id: h.subjectId, date: h.date, status: h.status };
}
function dbToHomework(r) {
  return { id: r.id, studentId: r.student_id, subjectId: r.subject_id, date: r.date, status: r.status };
}

export async function setHomework(newList) {
  const oldList = homeworkCache;
  homeworkCache = newList;
  try { await diffAndSync("homework", oldList, newList, homeworkToDb); }
  catch (err) { logSyncError("homework", err); }
}

/* ================================================================
   DISCIPLINE
   ================================================================ */
let disciplineCache = [];
export const getDiscipline = () => disciplineCache;

function disciplineToDb(d, teacherId) {
  return { id: d.id, teacher_id: teacherId, student_id: d.studentId, date: d.date, type: d.type, subject_id: d.subjectId || null, description: d.description, notes: d.notes || null };
}
function dbToDiscipline(r) {
  return { id: r.id, studentId: r.student_id, date: r.date, type: r.type, subjectId: r.subject_id || "", description: r.description, notes: r.notes || "" };
}

export async function setDiscipline(newList) {
  const oldList = disciplineCache;
  disciplineCache = newList;
  try { await diffAndSync("discipline", oldList, newList, disciplineToDb); }
  catch (err) { logSyncError("discipline", err); }
}

/* ================================================================
   SCIENCE LABS
   ================================================================ */
let labsCache = [];
export const getLabs = () => labsCache;

function labToDb(l, teacherId) {
  return { id: l.id, teacher_id: teacherId, title: l.title, description: l.desc || null, notes: l.notes || null, images: l.images || [], date: l.date };
}
function dbToLab(r) {
  return { id: r.id, title: r.title, desc: r.description || "", notes: r.notes || "", images: r.images || [], date: r.date };
}

export async function setLabs(newList) {
  const oldList = labsCache;
  labsCache = newList;
  try { await diffAndSync("labs", oldList, newList, labToDb); }
  catch (err) { logSyncError("labs", err); }
}

/* ================================================================
   TASKS
   ================================================================ */
let tasksCache = [];
export const getTasks = () => tasksCache;

function taskToDb(t, teacherId) { return { id: t.id, teacher_id: teacherId, text: t.text, done: Boolean(t.done) }; }
function dbToTask(r) { return { id: r.id, text: r.text, done: r.done }; }

export async function setTasks(newList) {
  const oldList = tasksCache;
  tasksCache = newList;
  try { await diffAndSync("tasks", oldList, newList, taskToDb); }
  catch (err) { logSyncError("tasks", err); }
}

/* ================================================================
   TEACHER SETTINGS — one row per teacher: general notes, weekly
   schedule, annual budgeting. A simple upsert, not a list diff.
   ================================================================ */
function defaultSchedule() {
  return {
    0: ["quran", "math", "persian", "science", "art"],
    1: ["math", "persian", "writing", "social", "sport"],
    2: ["science", "math", "quran", "persian", "art"],
    3: ["persian", "math", "religious", "writing", "sport"],
    4: ["math", "science", "social", "persian", "thinking"],
  };
}

let settingsCache = { generalNotes: "", schedule: defaultSchedule(), annualPlan: {} };

export const getGeneralNotes = () => settingsCache.generalNotes;
export const getSchedule = () => settingsCache.schedule;
export const getAnnualPlan = () => settingsCache.annualPlan;

async function upsertTeacherSettings(patch) {
  const teacherId = await requireUserId();
  const { sb } = await import("./supabase-client.js");
  const { error } = await sb.from("teacher_settings").upsert({ teacher_id: teacherId, ...patch });
  if (error) throw error;
}

export async function setGeneralNotes(text) {
  settingsCache.generalNotes = text;
  try { await upsertTeacherSettings({ general_notes: text }); }
  catch (err) { logSyncError("generalNotes", err); }
}
export async function setSchedule(schedule) {
  settingsCache.schedule = schedule;
  try { await upsertTeacherSettings({ schedule }); }
  catch (err) { logSyncError("schedule", err); }
}
export async function setAnnualPlan(plan) {
  settingsCache.annualPlan = plan;
  try { await upsertTeacherSettings({ annual_plan: plan }); }
  catch (err) { logSyncError("annualPlan", err); }
}

/* ================================================================
   PREVIEW MODE — لغو کامل ورود واقعی، برای دیدن سریع ظاهر هر صفحه
   با داده‌ی نمونه. هیچ تماسی با Supabase نمی‌گیرد. فقط برای بررسی
   طراحی صفحات است — قبل از استفاده‌ی واقعی باید خاموش/حذف شود.
   ================================================================ */
let previewModeActive = false;
const _previewToday = new Date().toISOString().slice(0, 10);

const PREVIEW_STUDENTS = [
  { id: "prev-s1", name: "آرمان کریمی", nationalId: "1111111111", phone: "", groupId: null, notes: "", teacherId: "prev-teacher" },
  { id: "prev-s2", name: "ستایش رضایی", nationalId: "2222222222", phone: "", groupId: null, notes: "", teacherId: "prev-teacher" },
  { id: "prev-s3", name: "پارسا احمدی", nationalId: "3333333333", phone: "", groupId: null, notes: "", teacherId: "prev-teacher" },
];
const PREVIEW_EVALUATIONS = [
  { id: "prev-e1", studentId: "prev-s1", subjectId: "math", period: "daily", kind: "participation", level: "excellent", date: _previewToday, topic: "کسرها", pageFrom: 1, pageTo: 10 },
  { id: "prev-e2", studentId: "prev-s2", subjectId: "persian", period: "daily", kind: "oral", level: "good", date: _previewToday, topic: "شعرخوانی", pageFrom: 5, pageTo: 12 },
  { id: "prev-e3", studentId: "prev-s3", subjectId: "science", period: "daily", kind: "activity", level: "needs-improvement", date: _previewToday, topic: "آزمایش آب", pageFrom: 20, pageTo: 25 },
];
const PREVIEW_ATTENDANCE = [
  { id: "prev-a1", studentId: "prev-s1", date: _previewToday, status: "present" },
  { id: "prev-a2", studentId: "prev-s2", date: _previewToday, status: "present", lateMinutes: 10 },
  { id: "prev-a3", studentId: "prev-s3", date: _previewToday, status: "absent" },
];
const PREVIEW_DISCIPLINE = [
  { id: "prev-d1", studentId: "prev-s1", date: _previewToday, type: "positive", subjectId: "", description: "کمک به هم‌کلاسی", notes: "" },
];

function applyPreviewCollections() {
  studentsCache = PREVIEW_STUDENTS;
  evaluationsCache = PREVIEW_EVALUATIONS;
  attendanceCache = PREVIEW_ATTENDANCE;
  disciplineCache = PREVIEW_DISCIPLINE;
  homeworkCache = [];
  groupsCache = [];
  labsCache = [];
  tasksCache = [{ id: "prev-t1", text: "تصحیح دفتر ریاضی", done: false }];
  settingsCache = { generalNotes: "این یک یادداشت نمونه است.", schedule: defaultSchedule(), annualPlan: {} };
}

/** One call: fills the profile + every data cache with realistic sample
    content for the given role, so you can click through that role's real
    screens without any backend/login involved. */
export function enablePreviewMode(role) {
  previewModeActive = true;
  currentUserId = "prev-teacher";

  const base = { username: "PREVIEW", verified: true, themeColor: "blue" };
  if (role === "parent") {
    profileCache = { ...base, role: "parent", fullName: "اولیا نمونه" };
    // یک اولیا فقط باید فرزند خودش را ببیند — نه هر سه دانش‌آموز نمونه.
    applyPreviewCollections();
    studentsCache = PREVIEW_STUDENTS.slice(0, 1);
    const onlyChildId = studentsCache[0].id;
    evaluationsCache = evaluationsCache.filter(e => e.studentId === onlyChildId);
    attendanceCache = attendanceCache.filter(a => a.studentId === onlyChildId);
    disciplineCache = disciplineCache.filter(d => d.studentId === onlyChildId);
    return;
  }
  // teacher (the only other role)
  profileCache = { ...base, role: "teacher", fullName: "خانم رضایی (نمونه)", schoolName: "دبستان نمونه", grade: "grade3", className: "الف", academicYear: "1405-1406" };
  applyPreviewCollections();
}

/* ================================================================
   LOAD EVERYTHING — called once right after loadProfile() succeeds.
   ================================================================ */
export async function loadAllCollections() {
  if (previewModeActive) { applyPreviewCollections(); return; }
  const teacherId = await requireUserId();
  const { sb } = await import("./supabase-client.js");

  const [students, groups, attendance, evaluations, homework, discipline, labs, tasks, settings] = await Promise.all([
    sb.from("students").select("*").eq("teacher_id", teacherId),
    sb.from("groups").select("*").eq("teacher_id", teacherId),
    sb.from("attendance").select("*").eq("teacher_id", teacherId),
    sb.from("evaluations").select("*").eq("teacher_id", teacherId),
    sb.from("homework").select("*").eq("teacher_id", teacherId),
    sb.from("discipline").select("*").eq("teacher_id", teacherId),
    sb.from("labs").select("*").eq("teacher_id", teacherId),
    sb.from("tasks").select("*").eq("teacher_id", teacherId),
    sb.from("teacher_settings").select("*").eq("teacher_id", teacherId).maybeSingle(),
  ]);

  const check = (res, label) => { if (res.error) console.error(`ClassPilot: failed to load "${label}"`, res.error); return res.data || []; };

  studentsCache = check(students, "students").map(dbToStudent);
  groupsCache = check(groups, "groups").map(dbToGroup);
  attendanceCache = check(attendance, "attendance").map(dbToAttendance);
  evaluationsCache = check(evaluations, "evaluations").map(dbToEvaluation);
  homeworkCache = check(homework, "homework").map(dbToHomework);
  disciplineCache = check(discipline, "discipline").map(dbToDiscipline);
  labsCache = check(labs, "labs").map(dbToLab);
  tasksCache = check(tasks, "tasks").map(dbToTask);

  const settingsRow = settings.data;
  settingsCache = {
    generalNotes: settingsRow?.general_notes || "",
    schedule: (settingsRow?.schedule && Object.keys(settingsRow.schedule).length) ? settingsRow.schedule : defaultSchedule(),
    annualPlan: settingsRow?.annual_plan || {},
  };
}

/* ================================================================
   PARENT — loads whatever RLS allows a parent to see (their linked
   children only) into the SAME caches used above, so the existing
   report-building logic (reports.js) works unchanged for parents too.
   ================================================================ */
export async function loadParentData() {
  if (previewModeActive) { applyPreviewCollections(); return; }
  const { sb } = await import("./supabase-client.js");
  // No .eq("teacher_id", …) filters here on purpose — RLS alone decides
  // what a parent account is allowed to see (their linked children only).
  const [students, attendance, evaluations, homework, discipline] = await Promise.all([
    sb.from("students").select("*"),
    sb.from("attendance").select("*"),
    sb.from("evaluations").select("*"),
    sb.from("homework").select("*"),
    sb.from("discipline").select("*"),
  ]);
  const check = (res, label) => { if (res.error) console.error(`ClassPilot: failed to load "${label}" for parent`, res.error); return res.data || []; };

  studentsCache = check(students, "students").map(dbToStudent);
  attendanceCache = check(attendance, "attendance").map(dbToAttendance);
  evaluationsCache = check(evaluations, "evaluations").map(dbToEvaluation);
  homeworkCache = check(homework, "homework").map(dbToHomework);
  disciplineCache = check(discipline, "discipline").map(dbToDiscipline);
}

/** A parent links themself to a child by national ID — server-side function
    does the lookup (see schema-v2.sql's link_child_to_parent). */
export async function addChildByNationalId(nationalId) {
  const { sb } = await import("./supabase-client.js");
  const { data, error } = await sb.rpc("link_child_to_parent", { p_national_id: nationalId });
  if (error) throw error;
  if (!data.success) throw new Error(data.error || "دانش‌آموزی با این کد ملی پیدا نشد.");
  return data;
}

/* ================================================================
   RESET (Settings → "start over") — deletes every row this teacher
   owns across every table, then clears all local caches.
   ================================================================ */
export async function resetEverything() {
  const teacherId = await requireUserId();
  const { sb } = await import("./supabase-client.js");
  const tables = ["attendance", "evaluations", "homework", "discipline", "labs", "tasks", "parent_links", "students", "groups", "teacher_settings"];
  for (const table of tables) {
    const { error } = await sb.from(table).delete().eq("teacher_id", teacherId);
    if (error) console.error(`ClassPilot: failed to clear "${table}" during reset`, error);
  }
  // Also clear the class-specific profile fields so isSetupComplete() goes
  // false and the teacher lands back on Setup to build the new class —
  // exactly what the confirmation dialog promises.
  const { error: profileError } = await sb.from("profiles")
    .update({ school_name: null, grade: null, class_name: null, academic_year: null })
    .eq("id", teacherId);
  if (profileError) console.error("ClassPilot: failed to clear profile during reset", profileError);

  studentsCache = []; groupsCache = []; attendanceCache = []; evaluationsCache = [];
  homeworkCache = []; disciplineCache = []; labsCache = []; tasksCache = [];
  settingsCache = { generalNotes: "", schedule: defaultSchedule(), annualPlan: {} };
  profileCache = profileCache ? { ...profileCache, schoolName: "", grade: "", className: "", academicYear: "" } : null;
}

/* ================================================================
   BACKUP / RESTORE — exports a snapshot of everything currently
   loaded. (Restoring a backup back into the shared database is a
   bigger, separate feature — not built yet; importBackup() says so
   clearly rather than silently doing nothing.)
   ================================================================ */
export function exportBackup() {
  return {
    app: "ClassPilot", exportedAt: new Date().toISOString(),
    data: {
      profile: profileCache, students: studentsCache, groups: groupsCache,
      attendance: attendanceCache, evaluations: evaluationsCache, homework: homeworkCache,
      discipline: disciplineCache, labs: labsCache, tasks: tasksCache,
      generalNotes: settingsCache.generalNotes, schedule: settingsCache.schedule, annual: settingsCache.annualPlan,
    },
  };
}

export function importBackup() {
  throw new Error("بازیابی از فایل پشتیبان برای حساب‌های آنلاین هنوز پشتیبانی نمی‌شود — این ویژگی به‌زودی اضافه می‌شود.");
}
