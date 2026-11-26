// Transactions: every spend and every payment received, grouped by day, with search, filters and editing.
// Filtering happens in place as you type, without redrawing the page or losing focus.

import { $, html, icon } from '../dom.js';
import { money } from '../money.js';
import { dayLabel, monthLabel } from '../dates.js';
import { categoryById } from '../store.js';
import { bindTxRows, empty, pageHead, txRow } from './parts.js';

const filters = { q: '', kind: 'all', cat: 'all', scope: 'month', sort: 'new' };

function matches(t, ctx) {
  if (filters.scope === 'month' && !t.date.startsWith(ctx.month)) return false;
  if (filters.kind !== 'all' && t.kind !== filters.kind) return false;
  if (filters.cat !== 'all' && t.catId !== filters.cat) return false;
  if (filters.q) {
    const hay = `${t.note} ${categoryById(t.catId)?.name || ''} ${t.amount} ${t.date}`.toLowerCase();
    return filters.q.toLowerCase().split(/\s+/).every((w) => hay.includes(w));
  }
  return true;
}

function sortList(list) {
  const by = {
    new: (a, b) => b.date.localeCompare(a.date),
    old: (a, b) => a.date.localeCompare(b.date),
    big: (a, b) => b.amount - a.amount,
  }[filters.sort];
  return list.sort(by);
}

/** A day's heading figure: what went out, or what came in on a day with no spending. */
function dayTotal(items) {
  const total = (k) => items.filter((t) => t.kind === k).reduce((a, t) => a + t.amount, 0);
  const out = total('expense');
  return out > 0 ? `−${money(out)}` : `+${money(total('income'))}`;
}

function results(ctx) {
  const list = sortList(ctx.state.transactions.filter((t) => matches(t, ctx)));
  const out = list.filter((t) => t.kind === 'expense').reduce((a, t) => a + t.amount, 0);
  const inn = list.filter((t) => t.kind === 'income').reduce((a, t) => a + t.amount, 0);
  if (!list.length) {
    const anyAtAll = ctx.state.transactions.length > 0;
    return html`<p class="result-sum" aria-live="polite">No matches</p>${anyAtAll
      ? empty('Nothing matches', 'Try another word, or clear the filters.', html`<button type="button" class="btn btn-small" data-clear>Clear filters</button>`)
      : empty('No transactions yet', 'Press + to add your first spend or payday. It takes three taps.')}`;
  }
  let groups;
  if (filters.sort === 'big') groups = [[null, list]];
  else {
    const map = new Map();
    list.forEach((t) => { if (!map.has(t.date)) map.set(t.date, []); map.get(t.date).push(t); });
    groups = [...map.entries()];
  }
  return html`<p class="result-sum" aria-live="polite">${list.length} transaction${list.length === 1 ? '' : 's'} · <span class="amt-in">+${money(inn)}</span> in · −${money(out)} out</p>
    ${groups.map(([day, items]) => html`<section class="day">${day ? html`<h2 class="day-h"><span>${dayLabel(day, ctx.locale)}</span><span class="muted">${dayTotal(items)}</span></h2>` : ''}
      <ul class="txs card">${items.map((t) => txRow(t, { showDate: !day }))}</ul></section>`)}`;
}

export function render(ctx) {
  if (ctx.params.get('cat')) { filters.cat = ctx.params.get('cat'); filters.scope = 'month'; }
  const opt = (v, label, cur) => html`<option value="${v}" ${v === cur ? 'selected' : ''}>${label}</option>`;
  return html`${pageHead('Transactions', `${filters.scope === 'month' ? monthLabel(ctx.month, ctx.locale) : 'All time'} · tap a row to edit it`,
    html`<button type="button" class="btn" data-add-income>${icon('plus')} Income</button><button type="button" class="btn btn-primary" data-add-spend>${icon('plus')} Spend</button>`)}
    <form class="filters card" role="search" aria-label="Search and filter transactions">
      <div class="field search-field"><label for="search" class="sr-only">Search</label>${icon('search')}
        <input id="search" type="search" placeholder="Search notes, envelopes, amounts" value="${filters.q}" autocomplete="off"></div>
      <div class="field"><label for="f-kind">Type</label><select id="f-kind" name="kind">${opt('all', 'All', filters.kind)}${opt('expense', 'Spending', filters.kind)}${opt('income', 'Income', filters.kind)}</select></div>
      <div class="field"><label for="f-cat">Envelope</label><select id="f-cat" name="cat">${opt('all', 'All envelopes', filters.cat)}${ctx.state.categories.map((c) => opt(c.id, c.name, filters.cat))}</select></div>
      <div class="field"><label for="f-scope">Period</label><select id="f-scope" name="scope">${opt('month', 'This month', filters.scope)}${opt('all', 'All time', filters.scope)}</select></div>
      <div class="field"><label for="f-sort">Sort</label><select id="f-sort" name="sort">${opt('new', 'Newest first', filters.sort)}${opt('old', 'Oldest first', filters.sort)}${opt('big', 'Largest first', filters.sort)}</select></div>
    </form>
    <div id="results">${results(ctx)}</div>`;
}

export function bind(root, ctx) {
  const redraw = () => {
    $('#results', root).innerHTML = results(ctx).s;
    bindTxRows($('#results', root), ctx);
    $('[data-clear]', root)?.addEventListener('click', clear);
  };
  const clear = () => {
    Object.assign(filters, { q: '', kind: 'all', cat: 'all', scope: 'all' });
    const f = $('.filters', root);
    f.reset();
    $('#search', root).value = '';
    ['kind', 'cat'].forEach((n) => { f.elements[n].value = 'all'; });
    f.elements.scope.value = 'all';
    redraw();
  };
  const form = $('.filters', root);
  form.addEventListener('submit', (e) => e.preventDefault());
  $('#search', root).addEventListener('input', (e) => { filters.q = e.target.value.trim(); redraw(); });
  form.addEventListener('change', (e) => {
    if (e.target.name) filters[e.target.name] = e.target.value;
    redraw();
  });
  $('[data-add-spend]', root).addEventListener('click', () => ctx.openEntry(null, 'expense'));
  $('[data-add-income]', root).addEventListener('click', () => ctx.openEntry(null, 'income'));
  bindTxRows(root, ctx);
  $('[data-clear]', root)?.addEventListener('click', clear);
}
