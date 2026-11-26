// Goals: savings targets with progress, the pace of recent deposits and the date that pace gets there.
// Money put into a goal counts as 'Saved' in the month summary.

import { confirmBox, html, icon, toast } from '../dom.js';
import { money, moneyWhole } from '../money.js';
import { dayLabel, fromISO, todayISO } from '../dates.js';
import { goalProgress } from '../calc.js';
import { addDeposit, deleteGoal, PALETTE, saveGoal } from '../store.js';
import { openForm } from '../forms.js';
import { ring } from '../charts.js';
import { empty, pageHead, stat } from './parts.js';

const monthYear = (iso, locale) => fromISO(iso).toLocaleDateString(locale, { month: 'long', year: 'numeric' });

function editGoal(goal) {
  openForm({
    title: goal ? `Edit ${goal.name}` : 'New savings goal',
    fields: [
      { name: 'name', label: 'Goal', value: goal?.name || '', maxlength: 40, placeholder: 'e.g. New washing machine', wide: true },
      { name: 'target', label: 'Target amount', type: 'money', value: goal?.target || '' },
      { name: 'targetDate', label: 'Target date', type: 'date', value: goal?.targetDate || '', optional: true },
      ...(goal ? [] : [{ name: 'start', label: 'Already saved', type: 'money', value: '', optional: true }]),
      { name: 'color', label: 'Colour', type: 'color', value: goal?.color || PALETTE[3], options: PALETTE, wide: true },
    ],
    submitLabel: goal ? 'Save goal' : 'Add goal',
    onSubmit: (v) => {
      if (v.targetDate && v.targetDate <= todayISO()) return { field: 'targetDate', message: 'Pick a date in the future, or leave it empty.' };
      const { start, ...rest } = v;
      saveGoal({ ...(goal ? { id: goal.id } : { deposits: start ? [{ id: `s${Date.now()}`, amount: start, date: todayISO(), opening: true }] : [] }), ...rest });
      toast(goal ? 'Goal saved' : `Added “${v.name}”`);
      return null;
    },
    onDelete: goal ? async () => {
      if (await confirmBox(`Delete “${goal.name}”?`, 'Its deposits are removed from your saved totals too.', 'Delete goal')) { deleteGoal(goal.id); toast('Goal deleted'); }
    } : null,
  });
}

function deposit(goal, withdraw = false) {
  openForm({
    title: withdraw ? `Take money out of ${goal.name}` : `Add to ${goal.name}`,
    fields: [
      { name: 'amount', label: 'Amount', type: 'money', value: '' },
      { name: 'date', label: 'Date', type: 'date', value: todayISO() },
    ],
    submitLabel: withdraw ? 'Withdraw' : 'Add money',
    onSubmit: (v) => {
      const saved = goalProgress(goal, todayISO()).saved;
      if (withdraw && v.amount > saved) return { field: 'amount', message: `Only ${money(saved)} is in this goal.` };
      addDeposit(goal.id, withdraw ? -v.amount : v.amount, v.date);
      toast(withdraw ? `Took ${money(v.amount)} out` : `Saved ${money(v.amount)} towards ${goal.name}`);
      return null;
    },
  });
}

function statusLine(p, goal, locale) {
  if (p.status === 'done') return html`<p class="goal-status ok">${icon('check', 'i-sm')} Reached — well done.</p>`;
  const when = p.projected ? monthYear(p.projected, locale) : null;
  if (goal.targetDate) {
    const by = monthYear(goal.targetDate, locale);
    if (p.status === 'on-track') return html`<p class="goal-status ok">On track for ${by}${when ? ` · at this pace, ${when}` : ''}</p>`;
    if (p.status === 'late') return html`<p class="goal-status warn">The target date has passed · ${moneyWhole(p.left)} to go</p>`;
    return html`<p class="goal-status warn">Behind for ${by} · save <strong>${moneyWhole(p.needed)}</strong> a month to catch up${when ? ` (pace now: ${when})` : ''}</p>`;
  }
  return when ? html`<p class="goal-status">At ${moneyWhole(p.pace)} a month, you’ll get there in <strong>${when}</strong></p>`
    : html`<p class="goal-status muted">Add a deposit to see when you’ll get there.</p>`;
}

export function render(ctx) {
  const goals = ctx.state.goals;
  const all = goals.map((g) => ({ g, p: goalProgress(g, ctx.today) }));
  const saved = all.reduce((a, x) => a + x.p.saved, 0);
  const target = all.reduce((a, x) => a + x.p.target, 0);
  const pace = all.reduce((a, x) => a + x.p.pace, 0);
  return html`${pageHead('Savings goals', 'What you are saving for, and when you will get there', html`<button type="button" class="btn btn-primary" data-new-goal>${icon('plus')} New goal</button>`)}
    ${goals.length ? html`<section class="stats" aria-label="Goal totals">
      ${stat('Saved in goals', moneyWhole(saved), 'tone-save')}
      ${stat('Still to save', moneyWhole(Math.max(0, target - saved)))}
      ${stat('Saving a month', moneyWhole(pace), 'tone-in', 'average of the last 3 months')}
      ${stat('On track', `${all.filter((x) => ['on-track', 'done', 'moving'].includes(x.p.status)).length} of ${all.length}`, all.some((x) => ['behind', 'late'].includes(x.p.status)) ? 'tone-warn' : 'tone-in', 'goals on pace')}
    </section>
    <ul class="goals">${all.map(({ g, p }) => html`<li class="card goal" style="--c:${g.color}">
      <div class="goal-top">${ring(p.pct, g.color, 84)}<div class="goal-txt">
        <h2>${g.name}</h2>
        <p class="goal-fig"><strong>${moneyWhole(p.saved)}</strong> <span class="muted">of ${moneyWhole(p.target)}</span></p>
        ${g.targetDate ? html`<p class="muted small">Target ${dayLabel(g.targetDate, ctx.locale, false)} ${g.targetDate.slice(0, 4)}</p>` : ''}</div></div>
      <div class="meter meter-goal" aria-hidden="true"><span style="width:${p.pct * 100}%"></span></div>
      ${statusLine(p, g, ctx.locale)}
      <div class="row-end">
        <button type="button" class="btn-link" data-edit-goal="${g.id}">Edit</button>
        ${p.saved > 0 ? html`<button type="button" class="btn btn-small" data-withdraw="${g.id}">Withdraw</button>` : ''}
        <button type="button" class="btn btn-small btn-primary" data-deposit="${g.id}">${icon('plus', 'i-sm')} Add money</button></div>
    </li>`)}</ul>`
    : empty('No savings goals yet', 'An emergency fund, a holiday, a new boiler: give it a target and Hearthbook works out when you’ll reach it.', html`<button type="button" class="btn btn-primary" data-new-goal>${icon('plus')} Add a goal</button>`)}`;
}

export function bind(root, ctx) {
  const find = (id) => ctx.state.goals.find((g) => g.id === id);
  root.querySelectorAll('[data-new-goal]').forEach((b) => b.addEventListener('click', () => editGoal(null)));
  root.querySelectorAll('[data-edit-goal]').forEach((b) => b.addEventListener('click', () => editGoal(find(b.dataset.editGoal))));
  root.querySelectorAll('[data-deposit]').forEach((b) => b.addEventListener('click', () => deposit(find(b.dataset.deposit))));
  root.querySelectorAll('[data-withdraw]').forEach((b) => b.addEventListener('click', () => deposit(find(b.dataset.withdraw), true)));
}
