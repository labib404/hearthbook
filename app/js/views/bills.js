// Bills: recurring costs with their due dates. This week's are on top; the month's calendar of due dates below;
// then every bill with its schedule. Marking one paid records the spend in its envelope.

import { confirmBox, html, icon, toast } from '../dom.js';
import { money, moneyWhole } from '../money.js';
import { dayLabel, monthLabel, todayISO } from '../dates.js';
import { billsInMonth, monthlyEquivalent, nextDue, upcomingBills } from '../calc.js';
import { deleteBill, expenseCategories, saveBill } from '../store.js';
import { openForm } from '../forms.js';
import { bindPayButtons, billRow, empty, pageHead, stat } from './parts.js';

const CADENCE = [
  { value: 'weekly', label: 'Every week' },
  { value: 'fortnightly', label: 'Every 2 weeks' },
  { value: 'monthly', label: 'Every month' },
  { value: 'quarterly', label: 'Every 3 months' },
  { value: 'yearly', label: 'Every year' },
];

function editBill(bill) {
  openForm({
    title: bill ? `Edit ${bill.name}` : 'New recurring bill',
    fields: [
      { name: 'name', label: 'Bill', value: bill?.name || '', maxlength: 40, placeholder: 'e.g. Electricity', wide: true },
      { name: 'amount', label: 'Amount', type: 'money', value: bill?.amount || '' },
      { name: 'catId', label: 'Envelope', type: 'select', value: bill?.catId || 'utilities', options: expenseCategories().map((c) => ({ value: c.id, label: c.name })) },
      { name: 'cadence', label: 'Repeats', type: 'select', value: bill?.cadence || 'monthly', options: CADENCE },
      { name: 'anchor', label: 'Next due date', type: 'date', value: bill ? nextDue(bill, todayISO()) || bill.anchor : todayISO(), hint: 'Later dates follow from this one.' },
    ],
    submitLabel: bill ? 'Save bill' : 'Add bill',
    onSubmit: (v) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v.anchor)) return { field: 'anchor', message: 'Pick the next due date.' };
      // Keep the original anchor when the schedule has not changed, so past paid dates still line up.
      const sameSchedule = bill && bill.cadence === v.cadence && nextDue(bill, todayISO()) === v.anchor;
      saveBill({ ...(bill ? { id: bill.id } : {}), ...v, anchor: sameSchedule ? bill.anchor : v.anchor });
      toast(bill ? 'Bill saved' : `Added ${v.name}`);
      return null;
    },
    onDelete: bill ? async () => {
      if (await confirmBox(`Delete ${bill.name}?`, 'Payments already recorded stay in your transactions.', 'Delete bill')) { deleteBill(bill.id); toast('Bill deleted'); }
    } : null,
  });
}

export function render(ctx) {
  const bills = ctx.state.bills;
  const week = upcomingBills(ctx.state, ctx.today, 7);
  const month = billsInMonth(ctx.state, ctx.month);
  const monthTotal = month.reduce((a, i) => a + i.bill.amount, 0);
  const paid = month.filter((i) => i.paid).reduce((a, i) => a + i.bill.amount, 0);
  const perMonth = bills.reduce((a, b) => a + monthlyEquivalent(b), 0);
  const label = (c) => CADENCE.find((x) => x.value === c)?.label || c;
  return html`${pageHead('Bills', 'Recurring costs and when they are due', html`<button type="button" class="btn btn-primary" data-new-bill>${icon('plus')} New bill</button>`)}
    ${bills.length ? html`
    <section class="stats" aria-label="Bill totals">
      ${stat(`Due in ${monthLabel(ctx.month, ctx.locale, 'short')}`, moneyWhole(monthTotal))}
      ${stat('Paid so far', moneyWhole(paid), 'tone-in')}
      ${stat('Still to pay', moneyWhole(monthTotal - paid), monthTotal - paid > 0 ? 'tone-out' : 'tone-in')}
      ${stat('Average a month', moneyWhole(perMonth), '', 'all bills spread out')}
    </section>
    <div class="two-col">
      <section class="card" aria-labelledby="wk-h"><div class="card-head"><h2 id="wk-h">Upcoming this week</h2></div>
        ${week.length ? html`<ul class="bills">${week.map((i) => billRow(i, ctx.today))}</ul>` : empty('Nothing due in the next 7 days', 'Enjoy the quiet week.')}</section>
      <section class="card" aria-labelledby="mo-h"><div class="card-head"><h2 id="mo-h">${monthLabel(ctx.month, ctx.locale)}</h2><span class="muted small">${month.filter((i) => i.paid).length} of ${month.length} paid</span></div>
        ${month.length ? html`<ul class="bills">${month.map((i) => billRow(i, ctx.today))}</ul>` : empty('No bills this month', '')}</section>
    </div>
    <section class="card" aria-labelledby="all-h"><div class="card-head"><h2 id="all-h">All recurring bills</h2></div>
      <div class="table-wrap"><table class="table">
        <thead><tr><th scope="col">Bill</th><th scope="col">Repeats</th><th scope="col">Next due</th><th scope="col" class="num">Amount</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead>
        <tbody>${bills.map((b) => { const n = nextDue(b, ctx.today); return html`<tr><th scope="row">${b.name}</th><td>${label(b.cadence)}</td><td>${n ? dayLabel(n, ctx.locale) : '—'}</td><td class="num">${money(b.amount)}</td>
          <td class="num"><button type="button" class="btn-link" data-edit-bill="${b.id}">Edit</button></td></tr>`; })}</tbody>
      </table></div></section>`
    : empty('No recurring bills yet', 'Add rent, utilities, phone plans and subscriptions once; Hearthbook reminds you each time one is due.', html`<button type="button" class="btn btn-primary" data-new-bill>${icon('plus')} Add your first bill</button>`)}`;
}

export function bind(root, ctx) {
  root.querySelectorAll('[data-new-bill]').forEach((b) => b.addEventListener('click', () => editBill(null)));
  root.querySelectorAll('[data-edit-bill]').forEach((b) => b.addEventListener('click', () => editBill(ctx.state.bills.find((x) => x.id === b.dataset.editBill))));
  bindPayButtons(root, ctx);
}
