/* ============================================================
   LESSONS LIST (Phase 6) — subject cards; click opens the
   whole-class evaluation page for that subject.
   ============================================================ */
import { SUBJECTS } from "./store.js";
import { $, $$ } from "./ui.js";
import { openLesson } from "./evaluations.js";
import { switchView, registerTitle, onViewChange } from "./router.js";

registerTitle("lessons", "درس‌ها");

export function renderSubjects() {
  const grid = $("#subject-grid"); if (!grid) return;
  grid.innerHTML = SUBJECTS.map(s => `
    <article class="card card--interactive subject-card" data-subject="${s.id}" style="--subject-color:${s.color};--subject-tint:${s.tint}">
      <span class="subject-card__icon"><svg class="icon"><use href="#${s.icon}"/></svg></span>
      <span class="subject-card__name">${s.name}</span>
      <span class="subject-card__meta">ارزشیابی روزانه، هفتگی و ماهانه</span>
      ${s.id === "science" ? `<button type="button" class="btn btn--secondary btn--sm" data-lab style="margin-top:4px;align-self:flex-start">
        <svg class="icon"><use href="#i-flask"/></svg>آزمایشگاه علوم (صفحه‌ی جدا)</button>` : ""}
    </article>`).join("");

  $$("[data-subject]", grid).forEach(card => card.addEventListener("click", () => openLesson(card.dataset.subject)));
  $$("[data-lab]", grid).forEach(b => b.addEventListener("click", e => { e.stopPropagation(); switchView("lab"); }));
}

export function initLessons() {
  onViewChange(name => { if (name === "lessons") renderSubjects(); });
  renderSubjects();
}
