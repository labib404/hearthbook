// Export and import: the whole household as JSON, and transactions as CSV a spreadsheet can open.
// Everything happens on the device; files are read with FileReader and saved through a Blob download.

import { appendTransactions, categoryById, getState, normalize, replaceAll, slug, uid } from './store.js';
import { downloadText } from './dom.js';
import { todayISO } from './dates.js';

const CSV_HEAD = ['date', 'type', 'category', 'amount', 'note'];

export function exportJSON() {
  downloadText(`hearthbook-${todayISO()}.json`, JSON.stringify(getState(), null, 2), 'application/json');
}

const cell = (v) => {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function transactionsCSV(list) {
  const rows = [...list]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((t) => [t.date, t.kind, categoryById(t.catId)?.name || t.catId, t.amount, t.note].map(cell).join(','));
  return [CSV_HEAD.join(','), ...rows].join('\r\n');
}

export function exportCSV() {
  downloadText(`hearthbook-transactions-${todayISO()}.csv`, transactionsCSV(getState().transactions), 'text/csv');
}

/** Split CSV text into rows of cells, honouring quotes, doubled quotes and newlines inside quotes. */
export function parseCSV(text) {
  const rows = [];
  let row = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',' || ch === ';') { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); rows.push(row); row = []; cur = '';
    } else cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}

/**
 * Turn CSV rows into transactions. Needs date and amount columns; type, category and note are optional.
 * A negative amount with no type column reads as spending. Unknown categories go to 'Other'.
 */
export function csvToTransactions(text) {
  const rows = parseCSV(text.replace(/^﻿/, ''));
  if (rows.length < 2) throw new Error('The CSV has no rows under its header.');
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const col = (...names) => head.findIndex((h) => names.includes(h));
  const iDate = col('date', 'day');
  const iAmt = col('amount', 'value', 'sum');
  if (iDate < 0 || iAmt < 0) throw new Error('The CSV needs a "date" and an "amount" column.');
  const iType = col('type', 'kind');
  const iCat = col('category', 'envelope');
  const iNote = col('note', 'description', 'memo', 'payee');
  const state = getState();
  const byName = new Map(state.categories.map((c) => [c.name.toLowerCase(), c.id]));
  const out = [];
  const skipped = [];
  rows.slice(1).forEach((r, n) => {
    const date = (r[iDate] || '').trim();
    const rawAmt = Number(String(r[iAmt] || '').replace(/[^\d.-]/g, ''));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(rawAmt) || rawAmt === 0) { skipped.push(n + 2); return; }
    const typed = (r[iType] || '').trim().toLowerCase();
    const kind = typed ? (typed.startsWith('inc') ? 'income' : 'expense') : rawAmt < 0 ? 'expense' : 'income';
    const catName = (r[iCat] || '').trim().toLowerCase();
    let catId = byName.get(catName) || (catName && state.categories.find((c) => c.id === slug(catName))?.id);
    if (!catId || categoryById(catId)?.kind !== kind) catId = kind === 'income' ? 'other-income' : 'other';
    out.push({ id: uid(), kind, amount: Math.abs(rawAmt), catId, date, note: (r[iNote] || '').trim() });
  });
  return { list: out, skipped };
}

function readFile(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(new Error('That file could not be read.'));
    fr.readAsText(file);
  });
}

/** Import a .json backup (replaces everything) or a .csv of transactions (added to what is there). */
export async function importFile(file) {
  if (file.size > 8 * 1024 * 1024) throw new Error('That file is over 8 MB, which is larger than any household backup.');
  const text = await readFile(file);
  if (/\.json$/i.test(file.name) || text.trim().startsWith('{')) {
    let data;
    try { data = JSON.parse(text); } catch { throw new Error('That JSON file is not valid.'); }
    replaceAll(normalize(data));
    return `Restored ${getState().transactions.length} transactions, ${getState().bills.length} bills and ${getState().goals.length} goals.`;
  }
  const { list, skipped } = csvToTransactions(text);
  if (!list.length) throw new Error('No rows could be read: each needs a YYYY-MM-DD date and an amount.');
  appendTransactions(list);
  return `Added ${list.length} transactions${skipped.length ? `, skipped ${skipped.length} unreadable row${skipped.length > 1 ? 's' : ''}` : ''}.`;
}
