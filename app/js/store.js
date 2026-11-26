// The household's data: one plain object kept in localStorage under a single key.
// Every change goes through a function here, which saves and then tells subscribers to redraw.

const KEY = 'hearthbook.v1';
const listeners = new Set();
let state = load();

export const PALETTE = ['#c8553d', '#2f6f4f', '#d9a23a', '#3f6fa8', '#8d5aa6', '#5b8c85', '#b8616e', '#7a7f3a', '#cf7a2e', '#4c5b8f', '#9a6b4f', '#5f8f3e'];

/** A brand-new, empty household with a sensible starter set of envelopes. */
export function blankState() {
  const env = (name, limit, glyph) => ({ name, limit, glyph });
  const expense = [
    env('Housing', 0, '⌂'), env('Groceries', 0, '◍'), env('Utilities', 0, 'ϟ'), env('Transport', 0, '➜'),
    env('Dining out', 0, '◒'), env('Health', 0, '✚'), env('Kids & school', 0, '✎'), env('Fun & hobbies', 0, '♪'),
    env('Subscriptions', 0, '↻'), env('Gifts & giving', 0, '♡'), env('Household', 0, '⚒'), env('Other', 0, '•'),
  ].map((c, i) => ({ id: slug(c.name), kind: 'expense', color: PALETTE[i % PALETTE.length], ...c }));
  const income = ['Salary', 'Side work', 'Benefits', 'Other income'].map((name, i) => ({
    id: slug(name), kind: 'income', name, limit: 0, glyph: '+', color: ['#2f6f4f', '#5b8c85', '#7a7f3a', '#3f6fa8'][i],
  }));
  return {
    version: 1,
    settings: { currency: 'USD', theme: 'system', household: '', sample: false, welcomed: false },
    categories: [...expense, ...income],
    transactions: [],
    bills: [],
    goals: [],
  };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return normalize(JSON.parse(raw));
  } catch {
    /* unreadable or blocked storage: start fresh in memory */
  }
  return null;
}

/** Fill in anything an older or hand-edited file leaves out, so the views can trust the shape. */
export function normalize(data) {
  const base = blankState();
  if (!data || typeof data !== 'object') throw new Error('Not a Hearthbook file');
  const out = {
    version: 1,
    settings: { ...base.settings, ...(data.settings || {}) },
    categories: Array.isArray(data.categories) && data.categories.length ? data.categories : base.categories,
    transactions: Array.isArray(data.transactions) ? data.transactions : [],
    bills: Array.isArray(data.bills) ? data.bills : [],
    goals: Array.isArray(data.goals) ? data.goals : [],
  };
  out.transactions = out.transactions
    .filter((t) => t && Number.isFinite(+t.amount) && /^\d{4}-\d{2}-\d{2}$/.test(t.date))
    .map((t) => ({ id: t.id || uid(), kind: t.kind === 'income' ? 'income' : 'expense', amount: Math.abs(+t.amount), catId: t.catId || 'other', date: t.date, note: String(t.note || ''), ...(t.billId ? { billId: t.billId } : {}) }));
  out.bills = out.bills.map((b) => ({ paid: {}, cadence: 'monthly', ...b, amount: Math.abs(+b.amount || 0) }));
  out.goals = out.goals.map((g) => ({ deposits: [], targetDate: '', ...g, target: Math.abs(+g.target || 0) }));
  return out;
}

export const getState = () => state;
export const hasData = () => state !== null;

/** Redraw on every change. Returns an unsubscribe function. */
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

let saveError = null;
export const lastSaveError = () => saveError;

function commit() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    saveError = null;
  } catch (err) {
    saveError = err;
  }
  listeners.forEach((fn) => fn(state));
}

export function uid() {
  return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
}

export function slug(text) {
  return String(text).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || uid();
}

/** Replace everything (import, sample, reset). */
export function replaceAll(next) {
  state = normalize(next);
  commit();
}

export function reset() {
  state = blankState();
  state.settings.welcomed = true;
  commit();
}

export function setSetting(key, value) {
  state.settings[key] = value;
  commit();
}

export const categoryById = (id) => state.categories.find((c) => c.id === id);
export const expenseCategories = () => state.categories.filter((c) => c.kind === 'expense');
export const incomeCategories = () => state.categories.filter((c) => c.kind === 'income');

// ---- transactions ----

export function addTransaction(tx) {
  const t = { id: uid(), note: '', ...tx };
  state.transactions.push(t);
  commit();
  return t;
}

export function updateTransaction(id, patch) {
  const t = state.transactions.find((x) => x.id === id);
  if (t) Object.assign(t, patch);
  commit();
}

/** Delete and return the removed transaction (so the caller can offer Undo). */
export function deleteTransaction(id) {
  const i = state.transactions.findIndex((x) => x.id === id);
  if (i < 0) return null;
  const [t] = state.transactions.splice(i, 1);
  for (const b of state.bills) for (const [due, txId] of Object.entries(b.paid)) if (txId === id) delete b.paid[due];
  commit();
  return t;
}

export function restoreTransaction(t) {
  state.transactions.push(t);
  if (t.billId && t.billDue) {
    const b = state.bills.find((x) => x.id === t.billId);
    if (b) b.paid[t.billDue] = t.id;
  }
  commit();
}

export function appendTransactions(list) {
  state.transactions.push(...list);
  commit();
}

// ---- envelopes (categories) ----

export function saveCategory(cat) {
  const existing = state.categories.find((c) => c.id === cat.id);
  if (existing) Object.assign(existing, cat);
  else {
    let id = slug(cat.name);
    while (state.categories.some((c) => c.id === id)) id += '-2';
    state.categories.push({ kind: 'expense', glyph: '•', limit: 0, color: PALETTE[state.categories.length % PALETTE.length], ...cat, id });
  }
  commit();
}

/** Remove an envelope; its transactions and bills move to 'Other' so no money disappears from the totals. */
export function deleteCategory(id) {
  const cat = categoryById(id);
  if (!cat || id === 'other' || id === 'other-income') return;
  const fallback = cat.kind === 'income' ? 'other-income' : 'other';
  state.transactions.forEach((t) => { if (t.catId === id) t.catId = fallback; });
  state.bills.forEach((b) => { if (b.catId === id) b.catId = fallback; });
  state.categories = state.categories.filter((c) => c.id !== id);
  commit();
}

// ---- recurring bills ----

export function saveBill(bill) {
  const existing = state.bills.find((b) => b.id === bill.id);
  if (existing) Object.assign(existing, bill);
  else state.bills.push({ id: uid(), paid: {}, ...bill });
  commit();
}

export function deleteBill(id) {
  state.bills = state.bills.filter((b) => b.id !== id);
  state.transactions.forEach((t) => { if (t.billId === id) delete t.billId; });
  commit();
}

/** Paying a bill records it as a spend in its envelope, dated the day it was paid. */
export function markBillPaid(billId, due, paidOn) {
  const b = state.bills.find((x) => x.id === billId);
  if (!b || b.paid[due]) return;
  const t = { id: uid(), kind: 'expense', amount: b.amount, catId: b.catId, date: paidOn, note: b.name, billId, billDue: due };
  state.transactions.push(t);
  b.paid[due] = t.id;
  commit();
}

export function unmarkBillPaid(billId, due) {
  const b = state.bills.find((x) => x.id === billId);
  if (!b || !b.paid[due]) return;
  const txId = b.paid[due];
  delete b.paid[due];
  state.transactions = state.transactions.filter((t) => t.id !== txId);
  commit();
}

// ---- savings goals ----

export function saveGoal(goal) {
  const existing = state.goals.find((g) => g.id === goal.id);
  if (existing) Object.assign(existing, goal);
  else state.goals.push({ id: uid(), deposits: [], color: PALETTE[(state.goals.length * 3 + 1) % PALETTE.length], ...goal });
  commit();
}

export function deleteGoal(id) {
  state.goals = state.goals.filter((g) => g.id !== id);
  commit();
}

export function addDeposit(goalId, amount, date) {
  const g = state.goals.find((x) => x.id === goalId);
  if (!g) return;
  g.deposits.push({ id: uid(), amount, date });
  commit();
}
