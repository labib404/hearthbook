// One reusable modal form for envelopes, bills, goals and deposits: describe the fields, get clean values back.

import { $, fieldError, html, icon, openModal } from './dom.js';
import { decimals, parseAmount } from './money.js';

function fieldHTML(f) {
  const id = `f-${f.name}`;
  const common = { id, name: f.name };
  let control;
  if (f.type === 'select') {
    control = html`<select id="${common.id}" name="${common.name}">${f.options.map((o) => html`<option value="${o.value}" ${String(o.value) === String(f.value) ? 'selected' : ''}>${o.label}</option>`)}</select>`;
  } else if (f.type === 'color') {
    control = html`<div class="swatches" role="radiogroup" aria-label="${f.label}">${f.options.map((c) => html`<label class="swatch" style="--c:${c}"><input type="radio" name="${f.name}" value="${c}" ${c === f.value ? 'checked' : ''} aria-label="${c}"><span></span></label>`)}</div>`;
  } else {
    const type = f.type === 'money' ? 'text' : f.type || 'text';
    const value = f.value ?? '';
    control = html`<input id="${id}" name="${f.name}" type="${type}" value="${value}" ${f.type === 'money' ? html`inputmode="decimal" placeholder="${decimals() ? '0.00' : '0'}"` : ''}
      ${f.min != null ? html`min="${f.min}"` : ''} ${f.max != null ? html`max="${f.max}"` : ''} ${f.maxlength ? html`maxlength="${f.maxlength}"` : ''} ${f.placeholder ? html`placeholder="${f.placeholder}"` : ''} autocomplete="off">`;
  }
  return html`<div class="field ${f.wide ? 'span-2' : ''}">
    ${f.type === 'color' ? html`<span class="label">${f.label}</span>` : html`<label for="${id}">${f.label}${f.optional ? html` <span class="muted">(optional)</span>` : ''}</label>`}
    ${control}${f.hint ? html`<p class="hint">${f.hint}</p>` : ''}<p class="field-error" role="alert"></p></div>`;
}

/**
 * Open a form. fields: [{name, label, type: text|money|date|number|select|color, value, options, optional}].
 * onSubmit(values) returns nothing on success, or {field, message} to show a validation error.
 */
export function openForm({ title, intro, fields, submitLabel = 'Save', onSubmit, onDelete, deleteLabel = 'Delete' }) {
  const dlg = $('#form');
  dlg.innerHTML = html`<form class="sheet-body" novalidate>
    <div class="sheet-head"><h2 class="sheet-title">${title}</h2>
      <button type="button" class="icon-btn" data-close aria-label="Close">${icon('x')}</button></div>
    ${intro ? html`<p class="muted">${intro}</p>` : ''}
    <div class="grid-2">${fields.map(fieldHTML)}</div>
    <div class="row-end">
      ${onDelete ? html`<button type="button" class="btn btn-danger-ghost" data-delete>${icon('trash')} ${deleteLabel}</button>` : ''}
      <button class="btn btn-primary" type="submit">${submitLabel}</button></div></form>`.s;
  const form = $('form', dlg);
  $('[data-close]', dlg).addEventListener('click', () => dlg.close());
  $('[data-delete]', dlg)?.addEventListener('click', async () => { dlg.close(); await onDelete(); });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const values = {};
    for (const f of fields) {
      const el = form.elements[f.name];
      const input = el instanceof RadioNodeList ? el[0] : el;
      fieldError(input, '');
      let v = el.value;
      if (f.type === 'money') {
        if (!v.trim() && f.optional) v = 0;
        else {
          v = f.allowZero && v.trim() === '0' ? 0 : parseAmount(v);
          if (Number.isNaN(v)) return fieldError(input, 'Enter an amount above zero.');
        }
      } else if (f.type === 'number') v = Number(v);
      else v = String(v).trim();
      if (!f.optional && f.type !== 'money' && v === '') return fieldError(input, `${f.label} is needed.`);
      values[f.name] = v;
    }
    const err = onSubmit(values);
    if (err) return fieldError(form.elements[err.field], err.message);
    dlg.close();
  });
  openModal(dlg);
  form.querySelector('input:not([type=radio]),select')?.focus();
}
