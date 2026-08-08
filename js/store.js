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
    position: row.position || "", verified: row.verified, documentPath: row.document_path || "",
    assignedGrade: row.assigned_grade || "", phoneNumber: row.phone_number || "", schoolId: row.school_id || "",
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
  // Whether the account's phone number has been confirmed via SMS OTP —
  // read straight from Supabase Auth's own user record, not a custom column.
  profileCache.phoneVerified = Boolean(userData.user.phone_confirmed_at);
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
export const getStudents = () => studentsCache;

function studentToDb(s, teacherId) {
  return { id: s.id, teacher_id: teacherId, name: s.name, national_id: s.nationalId, phone: s.phone || null, group_id: s.groupId || null, notes: s.notes || null };
}
function dbToStudent(r) {
  return { id: r.id, name: r.name, nationalId: r.national_id, phone: r.phone || "", groupId: r.group_id, notes: r.notes || "", teacherId: r.teacher_id };
}

export async function setStudents(newList) {
  const oldList = studentsCache;
  studentsCache = newList;
  try { await diffAndSync("students", oldList, newList, studentToDb); }
  catch (err) { logSyncError("students", err); }
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
  return { id: a.id, teacher_id: teacherId, student_id: a.studentId, date: a.date, status: a.status, minutes: a.minutes ?? null, exit_info: a.exit || null };
}
function dbToAttendance(r) {
  return { id: r.id, studentId: r.student_id, date: r.date, status: r.status, minutes: r.minutes, exit: r.exit_info || "" };
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
  return { id: e.id, teacher_id: teacherId, student_id: e.studentId, subject_id: e.subjectId, period: e.period, kind: e.kind || null, level: e.level, date: e.date, page_from: e.pageFrom ?? null, page_to: e.pageTo ?? null };
}
function dbToEvaluation(r) {
  return { id: r.id, studentId: r.student_id, subjectId: r.subject_id, period: r.period, kind: r.kind || "", level: r.level, date: r.date, pageFrom: r.page_from, pageTo: r.page_to };
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
   LOAD EVERYTHING — called once right after loadProfile() succeeds.
   ================================================================ */
export async function loadAllCollections() {
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

/** Admin/vice_principal: look up a teacher by EXACT personnel code + phone
    match (both required) before adding them — never a free browse/search
    of the teacher list. See migration-add-teacher.sql's find_teacher_for_school. */
export async function findTeacherForSchool(personnelCode, phone) {
  const { sb } = await import("./supabase-client.js");
  const { data, error } = await sb.rpc("find_teacher_for_school", { p_personnel_code: personnelCode, p_phone: phone });
  if (error) throw error;
  if (!data.success) throw new Error(data.error || "معلمی با این مشخصات پیدا نشد.");
  return data;
}

/** Admin/vice_principal: add that same matched teacher to their own school.
    Re-verifies the exact match server-side — never trusts a previously
    fetched ID alone, and can never link a teacher already at another school. */
export async function addTeacherToMySchool(personnelCode, phone) {
  const { sb } = await import("./supabase-client.js");
  const { data, error } = await sb.rpc("add_teacher_to_my_school", { p_personnel_code: personnelCode, p_phone: phone });
  if (error) throw error;
  if (!data.success) throw new Error(data.error || "افزودن معلم ناموفق بود.");
  return data;
}

/* ================================================================
   ADMIN — the approval queue (pending admin/vice_principal accounts)
   and approve/reject actions. Only works for a caller who is already
   a verified admin (enforced by RLS + the trigger, not just this code).
   ================================================================ */
/** Loads every teacher's data an admin/vice_principal is allowed to see
    (enforced by the *_admin_select RLS policies in schema-v2.sql — this
    function itself applies no filtering, same principle as loadParentData).
    Returns the list of teachers for the admin's "Classes" browser. */
export async function loadAdminData() {
  const { sb } = await import("./supabase-client.js");
  const [students, attendance, evaluations, homework, discipline, groups, teachers] = await Promise.all([
    sb.from("students").select("*"),
    sb.from("attendance").select("*"),
    sb.from("evaluations").select("*"),
    sb.from("homework").select("*"),
    sb.from("discipline").select("*"),
    sb.from("groups").select("*"),
    sb.from("profiles").select("*").eq("role", "teacher"),
  ]);
  const check = (res, label) => { if (res.error) console.error(`ClassPilot: failed to load "${label}" for admin`, res.error); return res.data || []; };

  studentsCache = check(students, "students").map(dbToStudent);
  attendanceCache = check(attendance, "attendance").map(dbToAttendance);
  evaluationsCache = check(evaluations, "evaluations").map(dbToEvaluation);
  homeworkCache = check(homework, "homework").map(dbToHomework);
  disciplineCache = check(discipline, "discipline").map(dbToDiscipline);
  groupsCache = check(groups, "groups").map(dbToGroup);

  const teacherRows = check(teachers, "teachers");
  return teacherRows.map(row => ({ id: row.id, ...dbRowToProfile(row) }));
}

export async function loadPendingApprovals() {
  const { sb } = await import("./supabase-client.js");
  const { data, error } = await sb.from("profiles").select("*")
    .in("role", ["admin", "vice_principal"]).eq("verified", false);
  if (error) { console.error("ClassPilot: could not load pending approvals", error); return []; }
  return data.map(row => ({ id: row.id, ...dbRowToProfile(row) }));
}

export async function approveAccount(userId) {
  const { sb } = await import("./supabase-client.js");
  const { error } = await sb.from("profiles").update({ verified: true }).eq("id", userId);
  if (error) throw error;
}

export async function rejectAccount(userId) {
  const { sb } = await import("./supabase-client.js");
  // "Reject" = delete the profile row; the auth.users row is left alone
  // (deleting auth users requires the service_role key, out of scope for
  // the client) — a rejected person simply can never pass the pending
  // screen again since their profile row is gone. Revisit with an Edge
  // Function later if full account deletion is needed.
  const { error } = await sb.from("profiles").delete().eq("id", userId);
  if (error) throw error;
}

/* ================================================================
   SUPER ADMIN — every function here relies entirely on the database's
   own rules (is_super_admin() / protect_role_and_verified trigger in
   schema-v3.sql) to actually work; a non-super-admin calling these
   gets a silently-reverted no-op or an RLS-denied error, not a real
   change — this file doesn't (and can't) grant privilege on its own.
   ================================================================ */
export async function loadAllUsers() {
  const { sb } = await import("./supabase-client.js");
  const { data, error } = await sb.from("profiles").select("*");
  if (error) { console.error("ClassPilot: could not load all users", error); return []; }
  return data.map(row => ({ id: row.id, ...dbRowToProfile(row) }));
}

export async function changeUserRole(userId, newRole) {
  const { sb } = await import("./supabase-client.js");
  const { error } = await sb.from("profiles").update({ role: newRole }).eq("id", userId);
  if (error) throw error;
}

/** Admin/vice_principal/rahbar-scoped action: promote a teacher to رahbar
    (whole-school view) or سرگروه آموزشی (grade-scoped view), or demote back
    to teacher. Only 'teacher' <-> 'rahbar'/'group_leader' is actually
    permitted by the database trigger — anything else silently reverts. */
export async function setTeacherLeaderRole(teacherId, role, assignedGrade = null) {
  const { sb } = await import("./supabase-client.js");
  const patch = { role };
  if (role === "group_leader") patch.assigned_grade = assignedGrade;
  if (role === "teacher") patch.assigned_grade = null;
  const { error } = await sb.from("profiles").update(patch).eq("id", teacherId);
  if (error) throw error;
}

export async function setUserActive(userId, active) {
  const { sb } = await import("./supabase-client.js");
  const { error } = await sb.from("profiles").update({ verified: active }).eq("id", userId);
  if (error) throw error;
}

export async function deleteUser(userId) {
  const { sb } = await import("./supabase-client.js");
  // Same limitation as rejectAccount(): removes the profile row (blocking
  // all app access), not the underlying auth.users row (needs service_role).
  const { error } = await sb.from("profiles").delete().eq("id", userId);
  if (error) throw error;
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
