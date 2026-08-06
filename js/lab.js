/* ============================================================
   SCIENCE LABORATORY (Phase 8) — separate from Science's
   evaluation page. Supports both adding a new experiment and
   editing an existing one (including adding more photos or
   removing individual ones before saving).
   ============================================================ */
import { getLabs, setLabs, uid } from "./store.js";
import { $, $$, toast, openModal, closeModal } from "./ui.js";
import { todayISO, formatJalaliLong, isoToDate } from "./jalali.js";
import { registerTitle, onViewChange } from "./router.js";

registerTitle("lab", "آزمایشگاه علوم");

let pendingImages = [];
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
          <p class="lab-card__title">${l.title}</p>
          <p class="lab-card__date">${formatJalaliLong(isoToDate(l.date))}</p>
        </div>
        <div style="display:flex;gap:6px">
          <button type="button" class="btn btn--secondary btn--sm" data-edit-lab="${l.id}"><svg class="icon"><use href="#i-edit"/></svg></button>
          <button type="button" class="btn btn--danger btn--sm" data-del-lab="${l.id}"><svg class="icon"><use href="#i-trash"/></svg></button>
        </div>
      </div>
      ${l.desc ? `<p class="lab-card__desc">${l.desc}</p>` : ""}
      ${l.images?.length ? `<div class="image-thumbs">${l.images.map(src => `<img src="${src}" alt="" />`).join("")}</div>` : ""}
      ${l.notes ? `<p class="lab-card__desc" style="border-top:1px dashed var(--color-border);margin-top:10px;padding-top:8px"><strong>یادداشت معلم:</strong> ${l.notes}</p>` : ""}
    </article>`).join("");

  $$("[data-edit-lab]", list).forEach(b => b.addEventListener("click", () => openLabModal(b.dataset.editLab)));
  $$("[data-del-lab]", list).forEach(b => b.addEventListener("click", () => {
    if (!confirm("این آزمایش حذف شود؟")) return;
    setLabs(getLabs().filter(l => l.id !== b.dataset.delLab));
    renderLabs(); toast("آزمایش حذف شد", "error");
  }));
}

function renderThumbs() {
  const wrap = $("#lab-thumbs");
  wrap.innerHTML = pendingImages.map((src, i) => `
    <span style="position:relative;display:inline-block">
      <img src="${src}" alt="" />
      <button type="button" data-remove-img="${i}" title="حذف تصویر"
        style="position:absolute;top:-6px;left:-6px;width:20px;height:20px;border-radius:50%;background:var(--color-danger);color:#fff;border:2px solid var(--color-surface);font-size:11px;line-height:1;cursor:pointer">×</button>
    </span>`).join("");
  $$("[data-remove-img]", wrap).forEach(b => b.addEventListener("click", () => {
    pendingImages.splice(Number(b.dataset.removeImg), 1);
    renderThumbs();
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
  pendingImages = l?.images ? [...l.images] : [];
  renderThumbs();
  openModal("modal-lab");
}

/** Reads picked files as data URLs so images survive a page reload (no backend to upload to yet). */
function readFiles(files) {
  return Promise.all([...files].map(file => new Promise(res => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => res(null);
    r.readAsDataURL(file);
  }))).then(list => list.filter(Boolean));
}

export function initLab() {
  $("#btn-add-lab")?.addEventListener("click", () => openLabModal(null));

  $("#lab-images")?.addEventListener("change", async e => {
    const added = await readFiles(e.target.files);
    pendingImages = [...pendingImages, ...added]; // adds to existing photos, doesn't replace them
    renderThumbs();
    e.target.value = ""; // allow picking the same file again later if needed
  });

  $("#lab-form")?.addEventListener("submit", e => {
    e.preventDefault();
    const title = $("#lab-title").value.trim();
    if (!title) return;
    const labs = getLabs();

    if (editingId) {
      const l = labs.find(x => x.id === editingId);
      if (l) Object.assign(l, {
        title, desc: $("#lab-desc").value.trim(), notes: $("#lab-notes").value.trim(), images: pendingImages,
      });
    } else {
      labs.push({
        id: uid("lab"), title,
        desc: $("#lab-desc").value.trim(),
        notes: $("#lab-notes").value.trim(),
        images: pendingImages,
        date: todayISO(),
      });
    }
    setLabs(labs);
    pendingImages = []; editingId = null;
    renderLabs();
    toast("آزمایش ذخیره شد");
    closeModal("modal-lab");
  });

  onViewChange(name => { if (name === "lab") renderLabs(); });
  renderLabs();
}
