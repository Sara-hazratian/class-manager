/* ============================================================
   SCIENCE LABORATORY — separate from Science's evaluation page.
   Records an experiment's title, description and the teacher's
   own notes. (Photo attachment was removed — unused in practice.)
   ============================================================ */
import { getLabs, setLabs, uid } from "./store.js";
import { $, $$, toast, openModal, closeModal, esc } from "./ui.js";
import { todayISO, formatJalaliLong, isoToDate } from "./jalali.js";
import { registerTitle, onViewChange } from "./router.js";

registerTitle("lab", "آزمایشگاه علوم");

let editingId = null;

export function renderLabs() {
  const list = $("#lab-list"), empty = $("#lab-empty");
  if (!list) return;
  const labs = [...getLabs()].sort((a, b) => b.date.localeCompare(a.date));
  empty.hidden = labs.length > 0;
  list.innerHTML = labs.map(l => `
    <article class="card lab-card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
        <div>
          <p class="lab-card__title">${esc(l.title)}</p>
          <p class="lab-card__date">${formatJalaliLong(isoToDate(l.date))}</p>
        </div>
        <div style="display:flex;gap:6px">
          <button type="button" class="btn btn--secondary btn--sm" data-edit-lab="${l.id}"><svg class="icon"><use href="#i-edit"/></svg></button>
          <button type="button" class="btn btn--danger btn--sm" data-del-lab="${l.id}"><svg class="icon"><use href="#i-trash"/></svg></button>
        </div>
      </div>
      ${l.desc ? `<p class="lab-card__desc">${esc(l.desc)}</p>` : ""}
      ${l.notes ? `<p class="lab-card__desc" style="border-top:1px dashed var(--color-border);margin-top:10px;padding-top:8px"><strong>یادداشت معلم:</strong> ${esc(l.notes)}</p>` : ""}
    </article>`).join("");

  $$("[data-edit-lab]", list).forEach(b => b.addEventListener("click", () => openLabModal(b.dataset.editLab)));
  $$("[data-del-lab]", list).forEach(b => b.addEventListener("click", () => {
    if (!confirm("این آزمایش حذف شود؟")) return;
    setLabs(getLabs().filter(l => l.id !== b.dataset.delLab));
    renderLabs(); toast("آزمایش حذف شد", "error");
  }));
}

function openLabModal(id) {
  editingId = id || null;
  $("#lab-form").reset();
  const l = id ? getLabs().find(x => x.id === id) : null;

  $("#lab-modal-title").textContent = id ? "ویرایش آزمایش" : "ثبت آزمایش علوم";
  $("#lab-title").value = l?.title || "";
  $("#lab-desc").value = l?.desc || "";
  $("#lab-notes").value = l?.notes || "";
  $("#lab-date-preview").textContent = formatJalaliLong(isoToDate(l?.date || todayISO()));
  openModal("modal-lab");
}

export function initLab() {
  $("#btn-add-lab")?.addEventListener("click", () => openLabModal(null));

  $("#lab-form")?.addEventListener("submit", e => {
    e.preventDefault();
    const title = $("#lab-title").value.trim();
    if (!title) return;
    const labs = getLabs();

    if (editingId) {
      const l = labs.find(x => x.id === editingId);
      if (l) Object.assign(l, {
        title, desc: $("#lab-desc").value.trim(), notes: $("#lab-notes").value.trim(),
      });
    } else {
      labs.push({
        id: uid("lab"), title,
        desc: $("#lab-desc").value.trim(),
        notes: $("#lab-notes").value.trim(),
        date: todayISO(),
      });
    }
    setLabs(labs);
    editingId = null;
    renderLabs();
    toast("آزمایش ذخیره شد");
    closeModal("modal-lab");
  });

  onViewChange(name => { if (name === "lab") renderLabs(); });
  renderLabs();
}
