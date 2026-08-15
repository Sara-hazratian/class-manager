/* ============================================================
   STUDENTS — list, add, edit, delete, plus a SEPARATE Groups
   tab. Groups are defined independently and students are
   assigned to them any time afterward — not forced at creation.
   ============================================================ */
import { getStudents, setStudents, setStudentsChecked, getGroups, setGroups, uid } from "./store.js";
import { $, $$, toast, openModal, initials } from "./ui.js";
import { registerTitle, onViewChange } from "./router.js";

registerTitle("students", "دانش‌آموزان");

const listeners = [];
export function onStudentsChange(fn) { listeners.push(fn); }
function notify() {
  listeners.forEach(fn => fn());
  document.dispatchEvent(new Event("data:changed"));
}

function groupName(groupId) {
  return getGroups().find(g => g.id === groupId)?.name || null;
}

function filtered() {
  const q = ($("#st-search")?.value || "").trim();
  const g = $("#st-group-filter")?.value || "";
  return getStudents()
    .filter(s => !q || s.name.includes(q) || (s.nationalId || "").includes(q))
    .filter(s => !g || s.groupId === g);
}

/* ---------- Students tab ---------- */
export function renderStudents() {
  const grid = $("#student-grid"), empty = $("#st-empty");
  if (!grid) return;

  const sel = $("#st-group-filter");
  if (sel) {
    const keep = sel.value;
    const groups = getGroups();
    sel.innerHTML = `<option value="">همه گروه‌ها</option>` + groups.map(g => `<option value="${g.id}">${g.name}</option>`).join("");
    sel.value = groups.some(g => g.id === keep) ? keep : "";
  }

  const list = filtered();
  empty.hidden = list.length > 0;
  grid.innerHTML = list.map(s => `
    <article class="card student-card">
      <div class="student-card__top">
        <span class="student-card__avatar">${initials(s.name)}</span>
        <div>
          <p class="student-card__name">${s.name}</p>
          <p class="student-card__group">${groupName(s.groupId) || "بدون گروه"}</p>
        </div>
      </div>
      <div class="student-card__id">کد ملی: ${s.nationalId ? fa2(s.nationalId) : "—"}</div>
      <div style="display:flex;gap:6px;margin-top:auto">
        <button type="button" class="btn btn--secondary btn--sm" data-edit="${s.id}"><svg class="icon"><use href="#i-edit"/></svg>ویرایش</button>
        <button type="button" class="btn btn--danger btn--sm" data-del="${s.id}"><svg class="icon"><use href="#i-trash"/></svg>حذف</button>
      </div>
    </article>`).join("");

  $$("[data-edit]", grid).forEach(b => b.addEventListener("click", () => openStudentModal(b.dataset.edit)));
  $$("[data-del]", grid).forEach(b => b.addEventListener("click", () => removeStudent(b.dataset.del)));
}

function fa2(s) { return String(s).replace(/[0-9]/g, d => "۰۱۲۳۴۵۶۷۸۹"[d]); }

function openStudentModal(id) {
  const f = $("#student-form"); f.reset();
  $("#student-error").textContent = "";
  $("#student-id").value = id || "";
  $("#student-modal-title").textContent = id ? "ویرایش دانش‌آموز" : "افزودن دانش‌آموز";
  if (id) {
    const s = getStudents().find(x => x.id === id);
    if (s) {
      $("#student-name").value = s.name;
      $("#student-national-id").value = s.nationalId || "";
      $("#student-phone").value = s.phone || "";
      $("#student-notes").value = s.notes || "";
    }
  }
  openModal("modal-student");
}

function validNationalId(id) { return /^\d{10}$/.test(id); }

function removeStudent(id) {
  const s = getStudents().find(x => x.id === id);
  if (!s || !confirm(`حذف «${s.name}»؟ این کار قابل بازگشت نیست.`)) return;
  setStudents(getStudents().filter(x => x.id !== id));
  renderStudents(); notify(); toast("دانش‌آموز حذف شد", "error");
}

/* ---------- Groups tab ---------- */
export function renderGroups() {
  const list = $("#group-list"); if (!list) return;
  const groups = getGroups();
  const students = getStudents();

  $("#group-list-empty").hidden = groups.length > 0;
  list.innerHTML = groups.map(g => {
    const members = students.filter(s => s.groupId === g.id);
    return `
    <div class="plan-row" style="grid-template-columns:1fr auto">
      <div>
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
          <input type="text" class="inline-input" style="width:auto;text-align:right" data-rename="${g.id}" value="${g.name}" />
          <span class="chip chip--good">${fa2(members.length)} دانش‌آموز</span>
        </div>
        ${members.length
          ? `<div style="display:flex;gap:6px;flex-wrap:wrap">${members.map(m => `<span class="chip" style="background:var(--color-surface);border:1px solid var(--color-border-strong)">${m.name}</span>`).join("")}</div>`
          : `<p style="font-size:11.5px;color:var(--color-ink-faint)">هنوز دانش‌آموزی در این گروه نیست — از بخش «تخصیص دانش‌آموزان» پایین اضافه کنید.</p>`}
      </div>
      <button type="button" class="btn btn--danger btn--sm" data-del-group="${g.id}"><svg class="icon"><use href="#i-trash"/></svg></button>
    </div>`;
  }).join("");

  $$("[data-rename]", list).forEach(inp => inp.addEventListener("blur", () => {
    const groups = getGroups();
    const g = groups.find(x => x.id === inp.dataset.rename);
    if (g && inp.value.trim()) { g.name = inp.value.trim(); setGroups(groups); toast("نام گروه ذخیره شد"); renderStudents(); }
  }));
  $$("[data-del-group]", list).forEach(b => b.addEventListener("click", () => {
    if (!confirm("این گروه حذف شود؟ دانش‌آموزان آن «بدون گروه» می‌شوند.")) return;
    setGroups(getGroups().filter(g => g.id !== b.dataset.delGroup));
    const students = getStudents().map(s => s.groupId === b.dataset.delGroup ? { ...s, groupId: null } : s);
    setStudents(students);
    renderGroups(); renderAssignList(); renderStudents(); notify();
    toast("گروه حذف شد", "error");
  }));

  renderAssignList();
}

/** The "assign every student to a group" list — this is the part that lets
    a teacher organize students into groups whenever they want, not just at creation. */
function renderAssignList() {
  const wrap = $("#group-assign-list"); if (!wrap) return;
  const students = getStudents();
  const groups = getGroups();

  if (!students.length) { wrap.innerHTML = `<p class="empty-state empty-state--inline">ابتدا دانش‌آموزان را اضافه کنید.</p>`; return; }

  wrap.innerHTML = students.map(s => `
    <div class="plan-row" style="grid-template-columns:1fr 180px;align-items:center">
      <div style="display:flex;align-items:center;gap:8px"><span class="student-card__avatar" style="width:30px;height:30px;font-size:12px">${initials(s.name)}</span>${s.name}</div>
      <select class="select-control" data-assign="${s.id}">
        <option value="">بدون گروه</option>
        ${groups.map(g => `<option value="${g.id}" ${s.groupId === g.id ? "selected" : ""}>${g.name}</option>`).join("")}
      </select>
    </div>`).join("");

  $$("[data-assign]", wrap).forEach(sel => sel.addEventListener("change", () => {
    const students = getStudents();
    const s = students.find(x => x.id === sel.dataset.assign);
    if (s) { s.groupId = sel.value || null; setStudents(students); renderStudents(); notify(); toast("گروه دانش‌آموز به‌روزرسانی شد"); }
  }));
}

export function initStudents() {
  $("#btn-add-student")?.addEventListener("click", () => openStudentModal(null));
  $("#st-search")?.addEventListener("input", renderStudents);
  $("#st-group-filter")?.addEventListener("change", renderStudents);

  $("#student-form")?.addEventListener("submit", async e => {
    e.preventDefault();
    const id = $("#student-id").value;
    const name = $("#student-name").value.trim();
    const nationalId = $("#student-national-id").value.trim();
    const errorEl = $("#student-error");
    const submitBtn = $("#student-submit-btn");

    if (!name) { errorEl.textContent = "نام دانش‌آموز را وارد کنید."; return; }
    if (!validNationalId(nationalId)) { errorEl.textContent = "کد ملی باید دقیقاً ۱۰ رقم باشد."; return; }
    const list = getStudents();
    const duplicate = list.find(s => s.nationalId === nationalId && s.id !== id);
    if (duplicate) { errorEl.textContent = `این کد ملی قبلاً برای «${duplicate.name}» ثبت شده است.`; return; }

    const payload = {
      name, nationalId,
      phone: $("#student-phone").value.trim(),
      notes: $("#student-notes").value.trim(),
    };
    const newList = [...list];
    if (id) {
      const s = newList.find(x => x.id === id);
      if (s) Object.assign(s, payload);
    } else {
      newList.push({ id: uid("st"), groupId: null, ...payload });
    }

    errorEl.textContent = "";
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "در حال ذخیره…"; }
    try {
      // این خط واقعاً منتظر تأیید دیتابیس می‌ماند — چون کد ملی باید در
      // کل سامانه یکتا باشد (نه فقط بین دانش‌آموزهای همین معلم)، نباید
      // قبل از تأیید واقعی «ذخیره شد» نشان داده شود.
      await setStudentsChecked(newList);
      renderStudents(); notify(); toast("ذخیره شد");
      $("#modal-student").close();
    } catch (err) {
      errorEl.textContent = err.message || "ذخیره ناموفق بود. دوباره تلاش کنید.";
    } finally {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "ذخیره"; }
    }
  });

  $$("#students-tabs .pill-tab").forEach(b => b.addEventListener("click", () => {
    $$("#students-tabs .pill-tab").forEach(x => x.classList.toggle("is-active", x === b));
    const isList = b.dataset.stTab === "list";
    $("#students-list-tab").hidden = !isList;
    $("#students-groups-tab").hidden = isList;
    if (!isList) renderGroups();
  }));

  $("#btn-add-group")?.addEventListener("click", () => {
    const name = $("#new-group-name").value.trim();
    if (!name) return;
    setGroups([...getGroups(), { id: uid("grp"), name }]);
    $("#new-group-name").value = "";
    renderGroups();
    toast("گروه اضافه شد");
  });

  onViewChange(name => { if (name === "students") { renderStudents(); renderGroups(); } });
  renderStudents();
}
