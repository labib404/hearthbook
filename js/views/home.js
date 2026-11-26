// Overview: the month at a glance — summary, what is safe to spend, bills due this week, envelopes running
// hot, where the money went, recent activity and how the savings goals are coming along.

import { html, icon } from '../dom.js';
import { money, moneyWhole } from '../money.js';
import { dayLabel, daysInMonth, monthLabel, monthOf, relativeDay } from '../dates.js';
import { billsInMonth, budgetTotals, cumulativeSpend, daysLeft, envelopes, goalProgress, monthTotals, upcomingBills } from '../calc.js';
import { donut, paceChart, ring } from '../charts.js';
import { bindPayButtons, bindTxRows, billRow, empty, envelopeBar, monthSummary, pageHead, txRow } from './parts.js';

function greeting(today) {
  const h = new Date().getHours();
  return `${h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'} · ${dayLabel(today)}`;
}

function safeToSpend(ctx, rows) {
  const totals = budgetTotals(rows);
  const left = daysLeft(ctx.month, ctx.today);
  const isNow = ctx.month === monthOf(ctx.today);
  const perDay = left > 0 ? Math.max(totals.remaining, 0) / left : 0;
  const days = daysInMonth(ctx.month);
  const upto = isNow ? +ctx.today.slice(8) : ctx.month < monthOf(ctx.today) ? days : 0;
  const pct = totals.limit ? Math.round((totals.spent / totals.limit) * 100) : 0;
  const unpaid = billsInMonth(ctx.state, ctx.month).filter((b) => !b.paid).reduce((a, b) => a + b.bill.amount, 0);
  if (!totals.limit) {
    return html`<section class="card hero">${empty('No budget set for this month', 'Give each envelope a monthly limit and this card shows what is safe to spend each day.', html`<a class="btn btn-primary" href="#/budget">Set limits</a>`)}</section>`;
  }
  return html`<section class="card hero" aria-labelledby="safe-h">
    <div class="hero-main">
      <h2 id="safe-h" class="card-k">${totals.remaining >= 0 ? 'Left to spend' : 'Over budget by'}</h2>
      <p class="hero-v ${totals.remaining < 0 ? 'warn-text' : ''}">${moneyWhole(Math.abs(totals.remaining))}</p>
      <p class="muted">${pct}% of ${moneyWhole(totals.limit)} used${isNow && left > 0 ? html` · <strong>${moneyWhole(perDay)}</strong> a day for the ${left} days left` : ''}</p>
    </div>
    <dl class="hero-facts">
      <div><dt>Budgeted</dt><dd>${moneyWhole(totals.limit)}</dd></div>
      <div><dt>Spent so far</dt><dd>${moneyWhole(totals.spent)}</dd></div>
      <div><dt>Bills still due</dt><dd>${moneyWhole(unpaid)}</dd></div>
      <div><dt>Free after bills</dt><dd class="${totals.remaining - unpaid < 0 ? 'warn-text' : ''}">${moneyWhole(totals.remaining - unpaid)}</dd></div>
    </dl>
    <figure class="hero-chart">${paceChart(cumulativeSpend(ctx.state, ctx.month, upto), totals.limit, days)}
      <figcaption class="legend"><span class="lg lg-line">Spent so far</span><span class="lg lg-dash">Even pace</span></figcaption></figure>
  </section>`;
}

function warnings(rows) {
  const over = rows.filter((r) => r.status === 'over');
  const near = rows.filter((r) => r.status === 'near');
  if (!over.length && !near.length) return '';
  return html`<section class="alert" role="status">${icon('alert')}<div>
    ${over.length ? html`<p><strong>${over.length === 1 ? `${over[0].cat.name} is over budget` : `${over.length} envelopes are over budget`}</strong> — ${over.map((r) => `${r.cat.name} by ${moneyWhole(-r.remaining)}`).join(', ')}.</p>` : ''}
    ${near.length ? html`<p class="muted">Nearly used: ${near.map((r) => `${r.cat.name} (${moneyWhole(r.remaining)} left)`).join(', ')}.</p>` : ''}
  </div><a class="btn btn-small" href="#/budget">Review</a></section>`;
}

function upcoming(ctx) {
  const items = upcomingBills(ctx.state, ctx.today, 7);
  const due = items.filter((i) => !i.paid).reduce((a, i) => a + i.bill.amount, 0);
  return html`<section class="card" aria-labelledby="up-h">
    <div class="card-head"><h2 id="up-h">Upcoming this week</h2><a href="#/bills" class="btn-link">All bills</a></div>
    ${items.length ? html`<p class="muted small">${due > 0 ? `${money(due)} still to pay in the next 7 days` : 'Everything due this week is paid.'}</p>
      <ul class="bills">${items.slice(0, 4).map((i) => billRow(i, ctx.today))}</ul>
      ${items.length > 4 ? html`<a class="btn-link" href="#/bills">${items.length - 4} more this week</a>` : ''}`
    : empty('Nothing due this week', 'Bills you add show here a week before they are due.', html`<a class="btn btn-small" href="#/bills">Add a bill</a>`)}
  </section>`;
}

function whereItWent(ctx, rows) {
  const used = rows.filter((r) => r.spent > 0).sort((a, b) => b.spent - a.spent);
  const total = used.reduce((a, r) => a + r.spent, 0);
  const top = used.slice(0, 6);
  const rest = used.slice(6).reduce((a, r) => a + r.spent, 0);
  const segs = top.map((r) => ({ label: r.cat.name, value: r.spent, color: r.cat.color }));
  if (rest) segs.push({ label: 'Everything else', value: rest, color: 'var(--muted-2)' });
  return html`<section class="card" aria-labelledby="where-h">
    <div class="card-head"><h2 id="where-h">Where it went</h2><a href="#/reports" class="btn-link">Reports</a></div>
    ${total ? html`<div class="donut-wrap">${donut(segs, { size: 180, thickness: 24, centerLabel: 'spent', centerValue: moneyWhole(total) })}
      <ul class="keys">${segs.map((s) => html`<li><span class="key" style="--c:${s.color}"></span>${s.label}<b>${Math.round((s.value / total) * 100)}%</b></li>`)}</ul></div>`
    : empty('No spending yet', `Nothing has been spent in ${monthLabel(ctx.month, ctx.locale)}.`)}
  </section>`;
}

function recent(ctx) {
  const list = ctx.state.transactions.filter((t) => t.date.startsWith(ctx.month)).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  return html`<section class="card" aria-labelledby="rec-h">
    <div class="card-head"><h2 id="rec-h">Recent activity</h2><a href="#/activity" class="btn-link">See all</a></div>
    ${list.length ? html`<ul class="txs">${list.map((t) => txRow(t))}</ul>`
    : empty('No transactions this month', 'Press + (or the N key) to add the first one.')}
  </section>`;
}

function goals(ctx) {
  const list = ctx.state.goals.slice(0, 3);
  return html`<section class="card" aria-labelledby="goal-h">
    <div class="card-head"><h2 id="goal-h">Savings goals</h2><a href="#/goals" class="btn-link">Goals</a></div>
    ${list.length ? html`<ul class="mini-goals">${list.map((g) => {
      const p = goalProgress(g, ctx.today);
      return html`<li>${ring(p.pct, g.color, 56)}<div><strong>${g.name}</strong>
        <span class="muted small">${moneyWhole(p.saved)} of ${moneyWhole(p.target)}${p.projected && p.left > 0 ? ` · ${relativeDay(p.projected, ctx.today).startsWith('in') ? `done ~${new Date(`${p.projected}T12:00`).toLocaleDateString(ctx.locale, { month: 'short', year: 'numeric' })}` : ''}` : ''}</span></div></li>`;
    })}</ul>` : empty('No goals yet', 'Set a target and see when you will reach it.', html`<a class="btn btn-small" href="#/goals">Add a goal</a>`)}
  </section>`;
}

export function render(ctx) {
  const rows = envelopes(ctx.state, ctx.month);
  const t = monthTotals(ctx.state, ctx.month);
  const name = ctx.state.settings.household || 'Your household';
  return html`${pageHead(name, ctx.month === monthOf(ctx.today) ? greeting(ctx.today) : monthLabel(ctx.month, ctx.locale))}
    ${monthSummary(t)}
    ${warnings(rows)}
    <div class="home-grid">
      ${safeToSpend(ctx, rows)}
      ${upcoming(ctx)}
      <section class="card" aria-labelledby="env-h">
        <div class="card-head"><h2 id="env-h">Envelopes to watch</h2><a href="#/budget" class="btn-link">Budget</a></div>
        ${rows.some((r) => r.limit > 0)
    ? html`<ul class="envs">${rows.filter((r) => r.limit > 0).sort((a, b) => b.pct - a.pct).slice(0, 5).map((r) => envelopeBar(r, { compact: true }))}</ul>`
    : empty('No envelope limits yet', 'Envelopes closest to their limit will show here.', html`<a class="btn btn-small" href="#/budget">Open Budget</a>`)}
      </section>
      ${whereItWent(ctx, rows)}
      ${recent(ctx)}
      ${goals(ctx)}
    </div>`;
}

export function bind(root, ctx) {
  bindPayButtons(root, ctx);
  bindTxRows(root, ctx);
}
