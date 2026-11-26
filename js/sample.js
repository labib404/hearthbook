// The demo household: six months of believable figures for a family of four, built relative to today
// so the sample always looks current. A seeded random generator keeps it the same on every load.

import { blankState, uid } from './store.js';
import { addDays, addMonths, daysInMonth, monthOf, todayISO } from './dates.js';
import { dueDates } from './calc.js';

// Rough purchasing-power scale, so the rupiah sample reads like a real Jakarta household, not '$54' in Rp.
const SCALE = { USD: 1, IDR: 15000, EUR: 0.93, GBP: 0.79, JPY: 150, INR: 83, AUD: 1.52, CAD: 1.37, SGD: 1.34, MYR: 4.6 };

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Build the sample household in a currency (amounts scaled to fit it). */
export function sampleHousehold(currencyCode = 'USD') {
  const k = SCALE[currencyCode] ?? 1;
  const zeroDec = ['IDR', 'JPY'].includes(currencyCode);
  const money = (usd) => {
    const v = usd * k;
    if (currencyCode === 'IDR') return Math.round(v / 500) * 500;
    return zeroDec ? Math.round(v) : Math.round(v * 100) / 100;
  };
  const rand = rng(20261126);
  const pick = (list) => list[Math.floor(rand() * list.length)];
  const between = (a, b) => a + rand() * (b - a);

  const state = blankState();
  state.settings = { ...state.settings, currency: currencyCode, household: 'The Marlow–Reyes household', sample: true, welcomed: true };

  const limits = {
    housing: 1720, groceries: 720, utilities: 260, transport: 300, 'dining-out': 220, health: 140,
    'kids-and-school': 210, 'fun-and-hobbies': 160, subscriptions: 70, 'gifts-and-giving': 90, household: 130, other: 60,
  };
  for (const c of state.categories) if (c.kind === 'expense') c.limit = money(limits[c.id] || 0);

  const today = todayISO();
  const thisMonth = monthOf(today);
  const first = addMonths(thisMonth, -5);
  const start = `${first}-01`;
  const tx = [];
  const add = (kind, usd, catId, date, note) => { if (date <= today) tx.push({ id: uid(), kind, amount: money(usd), catId, date, note }); };

  // Recurring bills: paid automatically for every past due date, except a couple left open this week.
  const bill = (name, usd, catId, cadence, anchor) => ({ id: uid(), name, amount: money(usd), catId, cadence, anchor, paid: {} });
  const dayIn = (d) => `${first}-${String(d).padStart(2, '0')}`;
  state.bills = [
    bill('Rent — Linden St flat', 1650, 'housing', 'monthly', dayIn(1)),
    bill('Electricity', 96, 'utilities', 'monthly', dayIn(12)),
    bill('Water & sewer', 48, 'utilities', 'monthly', dayIn(6)),
    bill('Home internet', 60, 'utilities', 'monthly', dayIn(18)),
    bill('Two phone lines', 72, 'utilities', 'monthly', dayIn(22)),
    bill('Car insurance', 118, 'transport', 'monthly', dayIn(27)),
    bill('Film & music streaming', 23, 'subscriptions', 'monthly', dayIn(9)),
    bill('Cloud photo backup', 3, 'subscriptions', 'monthly', dayIn(14)),
    bill('Maya’s swim class', 18, 'kids-and-school', 'weekly', addDays(start, (6 - new Date(`${start}T12:00`).getDay() + 7) % 7)),
    bill('Contents insurance', 156, 'household', 'yearly', `${addMonths(thisMonth, 1)}-03`),
  ];
  const openThisWeek = new Set();
  for (const b of state.bills) {
    for (const due of dueDates(b, start, addDays(today, 40))) {
      if (due > today) continue;
      const late = due >= addDays(today, -1) && openThisWeek.size < 1 && b.cadence === 'monthly';
      if (late) { openThisWeek.add(b.id); continue; }
      const t = { id: uid(), kind: 'expense', amount: b.amount, catId: b.catId, date: due, note: b.name, billId: b.id, billDue: due };
      tx.push(t);
      b.paid[due] = t.id;
    }
  }

  const shops = {
    groceries: ['Greengrocer on 5th', 'Weekly shop — FreshCart', 'Bakery & milk', 'Farmers market', 'Bulk pantry run'],
    transport: ['Fuel', 'Bus passes', 'Parking downtown', 'Tyre rotation'],
    'dining-out': ['Friday pizza', 'Lunch with Sam', 'Taco Tuesday', 'Coffee & pastries', 'Birthday dinner'],
    health: ['Pharmacy', 'Dentist co-pay', 'Vitamins'],
    'kids-and-school': ['School lunch top-up', 'Field trip', 'Art supplies', 'Shoes for Leo'],
    'fun-and-hobbies': ['Cinema tickets', 'Board game café', 'Library book sale', 'Climbing gym'],
    'gifts-and-giving': ['Gift for Nana', 'Charity — food bank', 'Classmate birthday gift'],
    household: ['Cleaning supplies', 'Hardware store', 'New bath towels', 'Light bulbs & batteries'],
    other: ['Post office', 'Key copies'],
  };
  // Typical monthly spend per envelope as a share of its limit; one or two envelopes run hot to show warnings.
  const heat = { groceries: 0.97, transport: 0.82, 'dining-out': 1.16, health: 0.55, 'kids-and-school': 0.8, 'fun-and-hobbies': 0.74, 'gifts-and-giving': 0.6, household: 0.7, other: 0.4 };

  for (let m = 0; m < 6; m++) {
    const key = addMonths(first, m);
    const days = daysInMonth(key);
    const d = (n) => `${key}-${String(Math.min(n, days)).padStart(2, '0')}`;
    add('income', 2480, 'salary', d(1), 'Ana — payroll');
    add('income', 2480, 'salary', d(15), 'Ana — payroll');
    add('income', 1320, 'salary', d(25), 'Jon — part-time pay');
    if (m % 2 === 0 || m === 5) add('income', Math.round(between(240, 620)), 'side-work', d(Math.floor(between(8, 20))), pick(['Logo design job', 'Weekend tutoring', 'Market stall sales']));
    if (m === 2) add('income', 180, 'benefits', d(10), 'Tax refund');

    const isNow = key === thisMonth;
    for (const [cat, share] of Object.entries(heat)) {
      const limit = limits[cat];
      const swing = m === 5 ? share : share * between(0.82, 1.12);
      const goal = limit * swing;
      const n = cat === 'groceries' ? 9 : cat === 'transport' ? 5 : cat === 'dining-out' ? 6 : 3;
      for (let i = 0; i < n; i++) {
        const day = Math.max(1, Math.round(((i + between(0.1, 0.9)) / n) * days));
        add('expense', Math.round((goal / n) * between(0.75, 1.25) * 100) / 100, cat, d(day), pick(shops[cat]));
      }
    }
    // Savings moved into goals each payday.
    for (const g of [['emergency', 260], ['trip', 180], ['laptop', m < 2 ? 0 : 90]]) {
      if (!g[1]) continue;
      for (const day of [2, 16]) {
        const date = d(day);
        if (date <= today) (state.goalDeposits ||= []).push({ goal: g[0], amount: money(g[1] * between(0.9, 1.1)), date });
      }
    }
    if (isNow) break;
  }

  const deposits = (key) => (state.goalDeposits || []).filter((x) => x.goal === key).map((x) => ({ id: uid(), amount: x.amount, date: x.date }));
  state.goals = [
    { id: uid(), name: 'Emergency fund — 3 months', target: money(9000), targetDate: `${addMonths(thisMonth, 14)}-01`, color: '#2f6f4f', deposits: [{ id: uid(), amount: money(3400), date: addDays(start, -30), opening: true }, ...deposits('emergency')] },
    { id: uid(), name: 'Spring trip to the coast', target: money(4200), targetDate: `${addMonths(thisMonth, 4)}-15`, color: '#3f6fa8', deposits: [{ id: uid(), amount: money(350), date: addDays(start, -20), opening: true }, ...deposits('trip')] },
    { id: uid(), name: 'Family laptop', target: money(1300), targetDate: '', color: '#d9a23a', deposits: deposits('laptop') },
  ];
  delete state.goalDeposits;
  state.transactions = tx.sort((a, b) => a.date.localeCompare(b.date));
  return state;
}
