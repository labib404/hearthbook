// Small page helpers: an escaping html`` template, toasts, a confirm dialog and focus handling.

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const RAW = Symbol('raw');

export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

/** Mark a string as already-safe markup. */
export const raw = (s) => ({ [RAW]: true, s: String(s) });

function part(v) {
  if (v == null || v === false) return '';
  if (Array.isArray(v)) return v.map(part).join('');
  if (typeof v === 'object' && v[RAW]) return v.s;
  return esc(v);
}

/** Tagged template: interpolated values are escaped, arrays are joined, html`` results nest. */
export function html(strings, ...values) {
  let out = strings[0];
  values.forEach((v, i) => { out += part(v) + strings[i + 1]; });
  return raw(out);
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** An inline SVG icon from the sprite in index.html. */
export const icon = (name, cls = '') => raw(`<svg class="i ${cls}" aria-hidden="true"><use href="#i-${name}"></use></svg>`);

// ---- toasts ----

let toastTimer;
/** A short message at the foot of the screen, read out by screen readers, with an optional action button. */
export function toast(message, action) {
  const box = $('#toast');
  clearTimeout(toastTimer);
  box.innerHTML = html`<span>${message}</span>${action ? html`<button type="button" class="btn-link">${action.label}</button>` : ''}`.s;
  box.hidden = false;
  if (action) $('button', box).addEventListener('click', () => { box.hidden = true; action.run(); }, { once: true });
  toastTimer = setTimeout(() => { box.hidden = true; }, action ? 7000 : 3200);
}

// ---- confirm ----

/** A real modal question; resolves true when the person confirms. */
export function confirmBox(title, body, okLabel = 'Confirm', danger = true) {
  return new Promise((resolve) => {
    const dlg = $('#confirm');
    dlg.innerHTML = html`<form method="dialog" class="sheet-body">
      <h2 class="sheet-title">${title}</h2>
      <p class="muted">${body}</p>
      <div class="row-end">
        <button value="no" class="btn">Cancel</button>
        <button value="yes" class="btn ${danger ? 'btn-danger' : 'btn-primary'}">${okLabel}</button>
      </div></form>`.s;
    dlg.addEventListener('close', () => resolve(dlg.returnValue === 'yes'), { once: true });
    dlg.showModal();
    $('.btn', dlg).focus();
  });
}

/** Open a modal dialog and return focus to whatever opened it once it closes. */
export function openModal(dlg) {
  const opener = document.activeElement;
  dlg.addEventListener('close', () => opener?.focus?.(), { once: true });
  dlg.showModal();
}

/** Show a field's validation message under it and mark it invalid for assistive tech. */
export function fieldError(input, message) {
  const hint = input.closest('.field')?.querySelector('.field-error');
  input.setAttribute('aria-invalid', message ? 'true' : 'false');
  if (hint) hint.textContent = message || '';
  if (message) input.focus();
  return !message;
}

/** Save a text file through the browser's download, entirely on the device. */
export function downloadText(filename, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
