// Pieces several pages share: page header, stat tiles, envelope bars, transaction rows, bill rows, empty states.

import { html, icon } from '../dom.js';
import { money, moneySigned, moneyWhole } from '../money.js';
import { dayLabel, relativeDay } from '../dates.js';
import { categoryById, markBillPaid, unmarkBillPaid } from '../store.js';

export function pageHead(title, sub, actions = '') {
  return html`<header class="page-head">
    <div><h1 id="view-title" tabindex="-1">${title}</h1>${sub ? html`<p class="muted">${sub}</p>` : ''}</div>
    ${actions ? html`<div class="page-actions">${actions}</div>` : ''}</header>`;
}

export function stat(label, value, tone = '', note = '') {
  return html`<div class="stat ${tone}"><span class="stat-k">${label}</span><strong class="stat-v">${value}</strong>${note ? html`<span class="stat-n">${note}</span>` : ''}</div>`;
}

/** The four numbers every month comes down to. */
export function monthSummary(t) {
  return html`<section class="stats" aria-label="Month summary">
    ${stat('Income', moneyWhole(t.income), 'tone-in')}
    ${stat('Spent', moneyWhole(t.spent), 'tone-out')}
    ${stat('Saved', moneyWhole(t.saved), 'tone-save')}
    ${stat('Net', `${t.net < 0 ? '−' : ''}${moneyWhole(Math.abs(t.net))}`, t.net < 0 ? 'tone-warn' : 'tone-net', t.net < 0 ? 'more out than in' : 'left over')}
  </section>`;
}

const STATUS_TEXT = { over: 'Over budget', near: 'Almost used', ok: 'On track', unbudgeted: 'No limit set', idle: 'No limit set' };

/** An envelope's bar: how much of its limit has gone, with the overspend shown past the end. */
export function envelopeBar(row, { compact = false, editable = false } = {}) {
  const width = Math.min(row.pct, 1) * 100;
  const left = row.remaining;
  const sub = row.limit > 0
    ? left >= 0 ? `${moneyWhole(left)} left of ${moneyWhole(row.limit)}` : `${moneyWhole(-left)} over ${moneyWhole(row.limit)}`
    : row.spent > 0 ? `${moneyWhole(row.spent)} spent · no limit` : 'No limit yet';
  return html`<li class="env env-${row.status}" style="--c:${row.cat.color}">
    <div class="env-top">
      <span class="env-name"><span class="glyph" aria-hidden="true">${row.cat.glyph}</span>${row.cat.name}</span>
      <span class="env-spent">${moneyWhole(row.spent)}</span>
    </div>
    <div class="meter" role="meter" aria-label="${row.cat.name} used" aria-valuemin="0" aria-valuemax="${Math.max(row.limit, row.spent)}" aria-valuenow="${row.spent}" aria-valuetext="${sub}"><span style="width:${width}%"></span></div>
    <div class="env-foot"><span class="${row.status === 'over' ? 'warn-text' : 'muted'}">${row.status === 'over' ? icon('alert', 'i-sm') : ''}${sub}</span>
      ${compact ? '' : html`<span class="pill pill-${row.status}">${STATUS_TEXT[row.status]}</span>`}
      ${editable ? html`<button type="button" class="btn-link" data-edit-env="${row.cat.id}" aria-label="Edit ${row.cat.name}">Edit</button>` : ''}</div>
  </li>`;
}

export function txRow(t, { showDate = true } = {}) {
  const cat = categoryById(t.catId);
  return html`<li><button type="button" class="tx" data-tx="${t.id}" aria-label="Edit ${t.note || cat?.name || 'transaction'}, ${money(t.amount)} on ${t.date}">
    <span class="tx-glyph" style="--c:${cat?.color || '#888'}" aria-hidden="true">${cat?.glyph || '•'}</span>
    <span class="tx-main"><span class="tx-note">${t.note || cat?.name || 'Transaction'}</span>
      <span class="tx-meta">${cat?.name || 'Uncategorised'}${showDate ? html` · ${dayLabel(t.date)}` : ''}${t.billId ? html` · <span class="tag">bill</span>` : ''}</span></span>
    <span class="tx-amt ${t.kind === 'income' ? 'amt-in' : ''}">${moneySigned(t.amount, t.kind === 'income')}</span>
  </button></li>`;
}

/** Opening a transaction row edits it. */
export function bindTxRows(root, ctx) {
  root.querySelectorAll('[data-tx]').forEach((b) => b.addEventListener('click', () => {
    const tx = ctx.state.transactions.find((t) => t.id === b.dataset.tx);
    if (tx) ctx.openEntry(tx);
  }));
}

export function billRow(item, today) {
  const { bill, due, paid } = item;
  const cat = categoryById(bill.catId);
  const late = !paid && due < today;
  return html`<li class="bill ${paid ? 'is-paid' : ''} ${late ? 'is-late' : ''}">
    <span class="bill-date"><b>${due.slice(8)}</b><small>${dayLabel(due, undefined, true).split(',')[0]}</small></span>
    <span class="bill-main"><span class="bill-name">${bill.name}</span>
      <span class="muted">${cat?.name || ''} · ${paid ? 'paid' : late ? html`<span class="warn-text">${relativeDay(due, today)}</span>` : `due ${relativeDay(due, today)}`}</span></span>
    <span class="bill-amt">${money(bill.amount)}</span>
    <button type="button" class="pay ${paid ? 'pay-done' : ''}" data-pay="${bill.id}" data-due="${due}" aria-pressed="${String(paid)}" aria-label="${paid ? `Mark ${bill.name} as not paid` : `Mark ${bill.name} paid`}">
      ${icon('check')}<span>${paid ? 'Paid' : 'Mark paid'}</span></button>
  </li>`;
}

/**
 * Paying a bill records the spend today (early or late). A due date in an earlier month is dated on the due
 * date instead, so catching up on old bills does not inflate this month. Tapping again undoes it.
 */
export function bindPayButtons(root, ctx) {
  root.querySelectorAll('[data-pay]').forEach((b) => b.addEventListener('click', () => {
    const { pay, due } = b.dataset;
    if (b.getAttribute('aria-pressed') === 'true') unmarkBillPaid(pay, due);
    else markBillPaid(pay, due, due.slice(0, 7) < ctx.today.slice(0, 7) ? due : ctx.today);
  }));
}

export function empty(title, body, action = '') {
  return html`<div class="empty">${icon('leaf', 'i-xl')}<h3>${title}</h3><p class="muted">${body}</p>${action}</div>`;
}
