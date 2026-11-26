// Figures derived from the stored data: month totals, envelope balances, bill due dates and goal projections.
// Pure functions only: they read state and return numbers, nothing here touches the page.

import { addDays, addMonths, daysBetween, daysInMonth, fromISO, monthOf, monthRange, toISO } from './dates.js';

const sum = (list, pick = (x) => x.amount) => list.reduce((acc, x) => acc + (+pick(x) || 0), 0);

export const inMonth = (list, key) => list.filter((x) => x.date.startsWith(key));

/** Income, spending, savings and what is left over in one month. */
export function monthTotals(state, key) {
  const txs = inMonth(state.transactions, key);
  const income = sum(txs.filter((t) => t.kind === 'income'));
  const spent = sum(txs.filter((t) => t.kind === 'expense'));
  const saved = sum(state.goals.flatMap((g) => inMonth(g.deposits.filter((d) => !d.opening), key)));
  return { income, spent, saved, net: income - spent - saved, count: txs.length };
}

/** Spending per envelope in a month, as a Map of category id to amount. */
export function spendByCategory(state, key) {
  const map = new Map();
  for (const t of inMonth(state.transactions, key)) {
    if (t.kind === 'expense') map.set(t.catId, (map.get(t.catId) || 0) + t.amount);
  }
  return map;
}

/** One row per spending envelope: its limit, what went out, what is left and how worried to be. */
export function envelopes(state, key) {
  const spent = spendByCategory(state, key);
  return state.categories
    .filter((c) => c.kind === 'expense')
    .map((c) => {
      const out = spent.get(c.id) || 0;
      const limit = +c.limit || 0;
      const pct = limit > 0 ? out / limit : out > 0 ? 1.01 : 0;
      const status = limit === 0 ? (out > 0 ? 'unbudgeted' : 'idle') : pct > 1 ? 'over' : pct >= 0.85 ? 'near' : 'ok';
      return { cat: c, limit, spent: out, remaining: limit - out, pct, status };
    });
}

/** The whole month's budget against what has gone out of it so far. */
export function budgetTotals(rows) {
  const limit = sum(rows, (r) => r.limit);
  const spent = sum(rows, (r) => r.spent);
  return { limit, spent, remaining: limit - spent, over: rows.filter((r) => r.status === 'over') };
}

/** Days left in the month counting today (or all of it for a future month, none for a past one). */
export function daysLeft(key, today) {
  const tKey = monthOf(today);
  if (key < tKey) return 0;
  if (key > tKey) return daysInMonth(key);
  return daysInMonth(key) - fromISO(today).getDate() + 1;
}

// ---- recurring bills ----

/** Every due date of a bill between two ISO dates, inclusive. */
export function dueDates(bill, from, to) {
  const out = [];
  const anchor = bill.anchor;
  if (!anchor) return out;
  if (bill.cadence === 'weekly' || bill.cadence === 'fortnightly') {
    const step = bill.cadence === 'weekly' ? 7 : 14;
    let d = anchor;
    const gap = daysBetween(anchor, from);
    if (gap > 0) d = addDays(anchor, Math.ceil(gap / step) * step);
    for (; d <= to; d = addDays(d, step)) if (d >= anchor) out.push(d);
    return out;
  }
  const stepMonths = bill.cadence === 'yearly' ? 12 : bill.cadence === 'quarterly' ? 3 : 1;
  const day = fromISO(anchor).getDate();
  let key = monthOf(anchor);
  // Jump close to the window instead of walking from a far-back anchor.
  const ahead = (y) => +y.slice(0, 4) * 12 + +y.slice(5, 7);
  const skip = Math.max(0, Math.floor((ahead(monthOf(from)) - ahead(key)) / stepMonths) - 1);
  key = addMonths(key, skip * stepMonths);
  for (let guard = 0; guard < 400; guard++, key = addMonths(key, stepMonths)) {
    const d = `${key}-${String(Math.min(day, daysInMonth(key))).padStart(2, '0')}`;
    if (d > to) break;
    if (d >= from && d >= anchor) out.push(d);
  }
  return out;
}

/** Bills due in the next `days` days, plus any unpaid ones already past due this month. */
export function upcomingBills(state, today, days = 7) {
  const end = addDays(today, days - 1);
  const start = `${monthOf(today)}-01`;
  const items = [];
  for (const bill of state.bills) {
    for (const due of dueDates(bill, start, end)) {
      const paid = Boolean(bill.paid[due]);
      if (due < today && paid) continue;
      items.push({ bill, due, paid, late: due < today && !paid });
    }
  }
  return items.sort((a, b) => a.due.localeCompare(b.due));
}

/** Every due date of every bill in one month, with whether it is paid. */
export function billsInMonth(state, key) {
  const from = `${key}-01`;
  const to = `${key}-${String(daysInMonth(key)).padStart(2, '0')}`;
  return state.bills
    .flatMap((bill) => dueDates(bill, from, to).map((due) => ({ bill, due, paid: Boolean(bill.paid[due]) })))
    .sort((a, b) => a.due.localeCompare(b.due));
}

/** The next due date on or after a day. */
export function nextDue(bill, today) {
  return dueDates(bill, today, addDays(today, 400))[0] || null;
}

/** A bill's cost spread over a month, for the 'fixed costs' figure. */
export function monthlyEquivalent(bill) {
  const per = { weekly: 52 / 12, fortnightly: 26 / 12, monthly: 1, quarterly: 1 / 3, yearly: 1 / 12 }[bill.cadence] || 1;
  return bill.amount * per;
}

// ---- savings goals ----

/**
 * Where a goal stands: saved so far, the monthly pace of the last three months, the date that pace reaches the
 * target, and what it takes each month to hit the target date if one is set.
 */
export function goalProgress(goal, today) {
  const saved = sum(goal.deposits);
  const target = goal.target || 0;
  const left = Math.max(0, target - saved);
  const pct = target > 0 ? Math.min(1, saved / target) : 0;
  const since = addDays(today, -91);
  // An opening balance ('already saved') is not saving done this quarter, so it does not set the pace.
  const recent = sum(goal.deposits.filter((d) => !d.opening && d.date >= since && d.date <= today));
  const pace = recent / 3;
  let projected = null;
  if (left === 0) projected = today;
  else if (pace > 0) {
    const d = fromISO(today);
    d.setDate(d.getDate() + Math.ceil((left / pace) * 30.44));
    projected = toISO(d);
  }
  let needed = null;
  let status = left === 0 ? 'done' : pace > 0 ? 'moving' : 'stalled';
  if (goal.targetDate && left > 0) {
    const months = Math.max(daysBetween(today, goal.targetDate) / 30.44, 0);
    needed = months > 0 ? left / months : left;
    if (months <= 0) status = 'late';
    else status = projected && projected <= goal.targetDate ? 'on-track' : 'behind';
  }
  return { saved, target, left, pct, pace, projected, needed, status };
}

// ---- history ----

/** Income, spending and savings for the n months ending at key, oldest first. */
export function trend(state, key, n = 6) {
  return monthRange(key, n).map((k) => ({ key: k, ...monthTotals(state, k) }));
}

/** Running total of spending through the month, one point per day up to `untilDay`. */
export function cumulativeSpend(state, key, untilDay) {
  const perDay = new Array(daysInMonth(key)).fill(0);
  for (const t of inMonth(state.transactions, key)) if (t.kind === 'expense') perDay[+t.date.slice(8) - 1] += t.amount;
  let run = 0;
  return perDay.slice(0, untilDay).map((v) => (run += v));
}
