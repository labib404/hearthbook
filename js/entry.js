// The quick-entry sheet: tap +, type the amount, tap an envelope, Save. Date defaults to today and the note
// is optional, so a spend is in within three taps. The same sheet edits and deletes an existing transaction.

import { $, $$, esc, fieldError, html, icon, openModal, toast } from './dom.js';
import { addTransaction, deleteTransaction, expenseCategories, getState, incomeCategories, restoreTransaction, updateTransaction } from './store.js';
import { decimals, money, parseAmount } from './money.js';
import { monthOf, todayISO } from './dates.js';

let editing = null;
let kind = 'expense';

/** The envelope used most in the last 60 transactions of a kind, so the likeliest one is already selected. */
function likelyCategory(k) {
  const recent = getState().transactions.filter((t) => t.kind === k).slice(-60);
  const counts = new Map();
  recent.forEach((t) => counts.set(t.catId, (counts.get(t.catId) || 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

function chips(k, selected) {
  const cats = k === 'income' ? incomeCategories() : expenseCategories();
  return cats.map((c) => html`<label class="chip" style="--c:${c.color}">
    <input type="radio" name="catId" value="${c.id}" ${c.id === selected ? 'checked' : ''} required>
    <span><b aria-hidden="true">${c.glyph}</b>${c.name}</span></label>`);
}

function render(dlg, tx, defaultDate) {
  kind = tx?.kind || kind;
  const selected = tx?.catId || likelyCategory(kind);
  const amount = tx ? String(tx.amount) : '';
  dlg.innerHTML = html`<form class="sheet-body" novalidate>
    <div class="sheet-head">
      <h2 class="sheet-title" id="entry-title">${tx ? 'Edit transaction' : 'Add a transaction'}</h2>
      <button type="button" class="icon-btn" data-close aria-label="Close">${icon('x')}</button>
    </div>
    <div class="seg" role="radiogroup" aria-label="Type">
      <label><input type="radio" name="kind" value="expense" ${kind === 'expense' ? 'checked' : ''}><span>Spent</span></label>
      <label><input type="radio" name="kind" value="income" ${kind === 'income' ? 'checked' : ''}><span>Received</span></label>
    </div>
    <div class="field field-amount">
      <label for="tx-amount">Amount</label>
      <input id="tx-amount" name="amount" inputmode="decimal" autocomplete="off" placeholder="${decimals() ? '0.00' : '0'}" value="${amount}" aria-describedby="tx-amount-err" required>
      <p class="field-error" id="tx-amount-err" role="alert"></p>
    </div>
    <fieldset class="field">
      <legend>${kind === 'income' ? 'Source' : 'Envelope'}</legend>
      <div class="chips" id="tx-chips">${chips(kind, selected)}</div>
      <p class="field-error" role="alert"></p>
    </fieldset>
    <div class="grid-2">
      <div class="field"><label for="tx-date">Date</label>
        <input id="tx-date" type="date" name="date" value="${tx?.date || defaultDate}" max="2100-12-31" required>
        <p class="field-error" role="alert"></p></div>
      <div class="field"><label for="tx-note">Note <span class="muted">(optional)</span></label>
        <input id="tx-note" name="note" maxlength="80" autocomplete="off" placeholder="${kind === 'income' ? 'e.g. payroll' : 'e.g. weekly shop'}" value="${tx?.note || ''}"></div>
    </div>
    <div class="row-end">
      ${tx ? html`<button type="button" class="btn btn-danger-ghost" data-delete>${icon('trash')} Delete</button>` : html`<label class="check"><input type="checkbox" name="again"> Add another</label>`}
      <button class="btn btn-primary" type="submit">${tx ? 'Save changes' : 'Save'}</button>
    </div></form>`.s;
}

/** Open the sheet: pass a transaction to edit it, or nothing to add one dated today (or in the month on screen). */
export function openEntry(tx = null, viewMonth = monthOf(todayISO()), presetKind) {
  const dlg = $('#entry');
  editing = tx;
  if (presetKind) kind = presetKind;
  const today = todayISO();
  const defaultDate = viewMonth === monthOf(today) ? today : `${viewMonth}-01`;
  render(dlg, tx, defaultDate);
  bind(dlg, defaultDate, viewMonth);
  openModal(dlg);
  $('#tx-amount', dlg).focus();
}

function bind(dlg, defaultDate, viewMonth) {
  const form = $('form', dlg);
  $('[data-close]', dlg).addEventListener('click', () => dlg.close());
  $$('input[name="kind"]', dlg).forEach((r) => r.addEventListener('change', () => {
    kind = r.value;
    const keep = { amount: form.amount.value, date: form.date.value, note: form.note.value };
    render(dlg, editing ? { ...editing, kind, catId: null, ...keep } : null, keep.date || defaultDate);
    $('#tx-amount', dlg).value = keep.amount;
    $('#tx-note', dlg).value = keep.note;
    bind(dlg, defaultDate, viewMonth);
    $(`input[name="kind"][value="${kind}"]`, dlg).focus();
  }));
  $('[data-delete]', dlg)?.addEventListener('click', () => {
    const removed = deleteTransaction(editing.id);
    dlg.close();
    if (removed) toast(`Deleted ${money(removed.amount)} ${removed.note ? `“${removed.note}”` : ''}`, { label: 'Undo', run: () => restoreTransaction(removed) });
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const amount = parseAmount(form.amount.value);
    const cat = form.querySelector('input[name="catId"]:checked');
    const date = form.date.value;
    const ok = fieldError(form.amount, Number.isNaN(amount) ? 'Enter an amount above zero, like 42.50.' : amount > 1e12 ? 'That amount is too large.' : '')
      && fieldError($('#tx-chips input', dlg), cat ? '' : 'Pick an envelope.')
      && fieldError(form.date, /^\d{4}-\d{2}-\d{2}$/.test(date) ? '' : 'Pick a date.');
    if (!ok) return;
    const tx = { kind, amount, catId: cat.value, date, note: form.note.value.trim() };
    if (editing) {
      updateTransaction(editing.id, tx);
      dlg.close();
      toast('Transaction updated');
      return;
    }
    addTransaction(tx);
    const label = esc(tx.note || '');
    toast(`${kind === 'income' ? 'Received' : 'Spent'} ${money(amount)}${label ? ` · ${tx.note}` : ''}${monthOf(date) !== viewMonth ? ` (in ${date.slice(0, 7)})` : ''}`);
    if (form.again.checked) {
      form.amount.value = '';
      form.note.value = '';
      form.amount.focus();
    } else dlg.close();
  });
}
