// Reports: six months of income, spending and saving side by side, spending by envelope for the month with
// each envelope's six-month average, and the month's biggest single costs.

import { html } from '../dom.js';
import { money, moneyWhole } from '../money.js';
import { dayLabel, monthLabel, monthRange, monthShort } from '../dates.js';
import { envelopes, inMonth, trend } from '../calc.js';
import { donut, trendChart } from '../charts.js';
import { categoryById } from '../store.js';
import { empty, pageHead, stat } from './parts.js';

export function render(ctx) {
  const months = trend(ctx.state, ctx.month, 6).map((m) => ({ ...m, label: monthShort(m.key, ctx.locale), current: m.key === ctx.month }));
  const active = months.filter((m) => m.count > 0);
  const avg = (k) => (active.length ? active.reduce((a, m) => a + m[k], 0) / active.length : 0);
  const rate = avg('income') > 0 ? Math.round((avg('saved') / avg('income')) * 100) : 0;
  const rows = envelopes(ctx.state, ctx.month).filter((r) => r.spent > 0 || r.limit > 0);
  const total = rows.reduce((a, r) => a + r.spent, 0);
  const keys = monthRange(ctx.month, 6);
  const sixAvg = (catId) => keys.reduce((a, k) => a + inMonth(ctx.state.transactions, k).filter((t) => t.catId === catId && t.kind === 'expense').reduce((s, t) => s + t.amount, 0), 0) / Math.max(active.length, 1);
  const biggest = inMonth(ctx.state.transactions, ctx.month).filter((t) => t.kind === 'expense').sort((a, b) => b.amount - a.amount).slice(0, 5);
  const sorted = [...rows].sort((a, b) => b.spent - a.spent);
  return html`${pageHead('Reports', `Six months to ${monthLabel(ctx.month, ctx.locale)}`)}
    <section class="stats" aria-label="Six-month averages">
      ${stat('Average income', moneyWhole(avg('income')), 'tone-in', 'a month')}
      ${stat('Average spending', moneyWhole(avg('spent')), 'tone-out', 'a month')}
      ${stat('Average saved', moneyWhole(avg('saved')), 'tone-save', 'a month')}
      ${stat('Savings rate', `${rate}%`, rate >= 10 ? 'tone-in' : 'tone-warn', 'of income')}
    </section>
    <section class="card" aria-labelledby="tr-h">
      <div class="card-head"><h2 id="tr-h">Six-month trend</h2>
        <div class="legend"><span class="lg lg-in">Income</span><span class="lg lg-out">Spent</span><span class="lg lg-save">Saved</span></div></div>
      ${active.length ? html`<div class="chart-scroll">${trendChart(months, { width: 980, height: 280 })}</div>
      <div class="table-wrap"><table class="table table-compact"><caption class="sr-only">Monthly figures</caption>
        <thead><tr><th scope="col">Month</th><th scope="col" class="num">Income</th><th scope="col" class="num">Spent</th><th scope="col" class="num">Saved</th><th scope="col" class="num">Net</th></tr></thead>
        <tbody>${months.map((m) => html`<tr ${m.current ? html`class="is-now"` : ''}><th scope="row">${monthLabel(m.key, ctx.locale, 'short')}</th><td class="num">${moneyWhole(m.income)}</td><td class="num">${moneyWhole(m.spent)}</td><td class="num">${moneyWhole(m.saved)}</td><td class="num ${m.net < 0 ? 'warn-text' : ''}">${m.net < 0 ? '−' : ''}${moneyWhole(Math.abs(m.net))}</td></tr>`)}</tbody>
      </table></div>` : empty('Not enough history yet', 'Add a few weeks of transactions to see your trend.')}
    </section>
    <div class="two-col">
      <section class="card" aria-labelledby="cat-h"><div class="card-head"><h2 id="cat-h">Spending by envelope</h2><span class="muted small">${monthLabel(ctx.month, ctx.locale)}</span></div>
        ${total ? html`<div class="donut-wrap donut-lg">${donut(sorted.filter((r) => r.spent > 0).map((r) => ({ label: r.cat.name, value: r.spent, color: r.cat.color })), { size: 220, thickness: 30, centerLabel: 'total', centerValue: moneyWhole(total) })}</div>
        <div class="table-wrap"><table class="table table-compact">
          <thead><tr><th scope="col">Envelope</th><th scope="col" class="num">Spent</th><th scope="col" class="num">Limit</th><th scope="col" class="num">6-mo avg</th></tr></thead>
          <tbody>${sorted.map((r) => html`<tr><th scope="row"><span class="key" style="--c:${r.cat.color}"></span><a href="#/activity?cat=${r.cat.id}">${r.cat.name}</a></th>
            <td class="num ${r.status === 'over' ? 'warn-text' : ''}">${moneyWhole(r.spent)}</td><td class="num muted">${r.limit ? moneyWhole(r.limit) : '—'}</td><td class="num muted">${moneyWhole(sixAvg(r.cat.id))}</td></tr>`)}</tbody>
        </table></div>` : empty('No spending this month', '')}
      </section>
      <section class="card" aria-labelledby="big-h"><div class="card-head"><h2 id="big-h">Biggest costs this month</h2></div>
        ${biggest.length ? html`<ol class="ranked">${biggest.map((t) => html`<li><span><strong>${t.note || categoryById(t.catId)?.name}</strong><span class="muted small">${categoryById(t.catId)?.name} · ${dayLabel(t.date, ctx.locale)}</span></span><b>${money(t.amount)}</b></li>`)}</ol>
          <p class="muted small">${total ? `These five make up ${Math.round((biggest.reduce((a, t) => a + t.amount, 0) / total) * 100)}% of the month’s spending.` : ''}</p>` : empty('Nothing yet', '')}
      </section>
    </div>`;
}
