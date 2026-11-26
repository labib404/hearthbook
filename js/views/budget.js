// Budget: every envelope with its monthly limit, what has gone out and what is left, plus adding, editing and
// removing envelopes. Limits repeat every month; the month switcher shows how each month went against them.

import { confirmBox, html, icon, toast } from '../dom.js';
import { moneyWhole } from '../money.js';
import { monthLabel } from '../dates.js';
import { billsInMonth, budgetTotals, envelopes, monthTotals } from '../calc.js';
import { categoryById, deleteCategory, PALETTE, saveCategory } from '../store.js';
import { openForm } from '../forms.js';
import { empty, envelopeBar, pageHead, stat } from './parts.js';

const GLYPHS = ['⌂', '◍', 'ϟ', '➜', '◒', '✚', '✎', '♪', '↻', '♡', '⚒', '•', '☕', '✈', '❀', '⚑'];

function editEnvelope(cat) {
  openForm({
    title: cat ? `Edit ${cat.name}` : 'New envelope',
    intro: cat ? '' : 'An envelope is a pot of money for one kind of spending, refilled every month.',
    fields: [
      { name: 'name', label: 'Name', value: cat?.name || '', maxlength: 32, placeholder: 'e.g. Pets' },
      { name: 'limit', label: 'Monthly limit', type: 'money', value: cat?.limit || '', optional: true, hint: 'Leave empty for no limit.' },
      { name: 'glyph', label: 'Symbol', type: 'select', value: cat?.glyph || '•', options: GLYPHS.map((g) => ({ value: g, label: g })) },
      { name: 'color', label: 'Colour', type: 'color', value: cat?.color || PALETTE[0], options: PALETTE, wide: true },
    ],
    submitLabel: cat ? 'Save envelope' : 'Add envelope',
    onSubmit: (v) => {
      saveCategory({ ...(cat ? { id: cat.id } : {}), kind: 'expense', name: v.name, limit: v.limit || 0, glyph: v.glyph, color: v.color });
      toast(cat ? 'Envelope saved' : `Added ${v.name}`);
    },
    onDelete: cat && cat.id !== 'other' ? async () => {
      const ok = await confirmBox(`Remove ${cat.name}?`, 'Its transactions and bills move to “Other”, so your totals stay the same.', 'Remove envelope');
      if (ok) { deleteCategory(cat.id); toast(`${cat.name} removed`); }
    } : null,
    deleteLabel: 'Remove',
  });
}

export function render(ctx) {
  const rows = envelopes(ctx.state, ctx.month);
  const totals = budgetTotals(rows);
  const income = monthTotals(ctx.state, ctx.month).income;
  const fixed = billsInMonth(ctx.state, ctx.month).reduce((a, b) => a + b.bill.amount, 0);
  const unplanned = income - totals.limit;
  const budgeted = rows.filter((r) => r.limit > 0).sort((a, b) => b.pct - a.pct);
  const other = rows.filter((r) => r.limit === 0);
  return html`${pageHead('Budget', `${monthLabel(ctx.month, ctx.locale)} · monthly limits for each envelope`,
    html`<button type="button" class="btn" data-new-env>${icon('plus')} New envelope</button>`)}
    <section class="stats" aria-label="Budget totals">
      ${stat('Budgeted', moneyWhole(totals.limit))}
      ${stat('Spent', moneyWhole(totals.spent), 'tone-out')}
      ${stat(totals.remaining >= 0 ? 'Remaining' : 'Over', moneyWhole(Math.abs(totals.remaining)), totals.remaining >= 0 ? 'tone-in' : 'tone-warn')}
      ${stat('Bills this month', moneyWhole(fixed), '', 'fixed costs inside the budget')}
    </section>
    ${income > 0 ? html`<p class="note ${unplanned < 0 ? 'note-warn' : ''}">${icon(unplanned < 0 ? 'alert' : 'spark')}
      <span>${unplanned >= 0 ? html`Income this month is <strong>${moneyWhole(income)}</strong>; envelopes plan <strong>${moneyWhole(totals.limit)}</strong>, leaving <strong>${moneyWhole(unplanned)}</strong> for savings goals.`
      : html`Envelopes plan <strong>${moneyWhole(-unplanned)}</strong> more than this month’s income of ${moneyWhole(income)}. Trim a limit or two.`}</span></p>` : ''}
    ${totals.over.length ? html`<p class="note note-warn" role="status">${icon('alert')} <span><strong>Overspent:</strong> ${totals.over.map((r) => `${r.cat.name} (${moneyWhole(-r.remaining)} over)`).join(', ')}. Move money from an envelope with room left, or raise the limit.</span></p>` : ''}
    ${budgeted.length ? html`<ul class="envs envs-grid">${budgeted.map((r) => envelopeBar(r, { editable: true }))}</ul>`
    : empty('No limits yet', 'Tap Edit on an envelope below to give it a monthly limit.')}
    ${other.length ? html`<h2 class="section-h">Without a limit</h2><ul class="envs envs-grid">${other.map((r) => envelopeBar(r, { editable: true }))}</ul>` : ''}`;
}

export function bind(root) {
  root.querySelector('[data-new-env]').addEventListener('click', () => editEnvelope(null));
  root.querySelectorAll('[data-edit-env]').forEach((b) => b.addEventListener('click', () => editEnvelope(categoryById(b.dataset.editEnv))));
}
