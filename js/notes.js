/* ============================================================
   NOTES (Phase 10) — dedicated full page for the two note types
   that already exist in the schema since Phase 1/3/4:
     - General notes (getGeneralNotes/setGeneralNotes) — the
       same data as the dashboard's quick-note box.
     - Private per-student notes (student.notes) — the same
       field already editable from the student modal; this page
       just gives it a proper full-size writing space.
   ============================================================ */
import { getStudents, setStudents, getGeneralNotes, setGeneralNotes } from "./store.js";
import { $, $$, toast, debounce } from "./ui.js";
import { registerTitle, onViewChange } from "./router.js";

registerTitle("notes", "یادداشت‌ها");

const saveGeneral = debounce(text => setGeneralNotes(text), 400);

function refreshStudentSelect() {
  const sel = $("#note-student");
  const students = getStudents();
  const keep = sel.value;
  sel.innerHTML = students.map(s => `<option value="${s.id}">${s.name}</option>`).join("");
  sel.value = students.some(s => s.id === keep) ? keep : (students[0]?.id || "");
  loadStudentNote();
}

function loadStudentNote() {
  const id = $("#note-student")?.value;
  const s = getStudents().find(x => x.id === id);
  $("#student-note-full").value = s?.notes || "";
}

function saveStudentNote() {
  const id = $("#note-student")?.value;
  const list = getStudents();
  const s = list.find(x => x.id === id);
  if (!s) return;
  s.notes = $("#student-note-full").value;
  setStudents(list);
  toast("یادداشت ذخیره شد");
}

export function initNotes() {
  $("#general-notes-full").value = getGeneralNotes();
  $("#general-notes-full")?.addEventListener("input", e => saveGeneral(e.target.value));

  refreshStudentSelect();
  $("#note-student")?.addEventListener("change", loadStudentNote);
  $("#student-note-full")?.addEventListener("blur", saveStudentNote);

  $$("#notes-tabs .pill-tab").forEach(b => b.addEventListener("click", () => {
    $$("#notes-tabs .pill-tab").forEach(x => x.classList.toggle("is-active", x === b));
    const isGeneral = b.dataset.noteTab === "general";
    $("#notes-general").hidden = !isGeneral;
    $("#notes-private").hidden = isGeneral;
  }));

  onViewChange(name => {
    if (name !== "notes") return;
    $("#general-notes-full").value = getGeneralNotes();
    refreshStudentSelect();
  });
}
