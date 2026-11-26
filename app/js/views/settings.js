// Settings: the household's name, currency and theme; backups (JSON), spreadsheets (CSV), importing,
// the sample household and a full reset. Nothing here leaves the device.

import { $, confirmBox, html, icon, toast } from '../dom.js';
import { CURRENCIES, money } from '../money.js';
import { getState, incomeCategories, replaceAll, reset, setSetting } from '../store.js';

export function render(ctx) {
  const s = ctx.state.settings;
  const n = ctx.state.transactions.length;
  const bytes = new Blob([JSON.stringify(ctx.state)]).size;
  return html`<header class="page-head"><div><h1 id="view-title" tabindex="-1">Settings</h1><p class="muted">Your data stays in this browser on this device.</p></div></header>
    <div class="two-col">
      <section class="card" aria-labelledby="hh-h"><h2 id="hh-h">Household</h2>
        <form class="stack" id="prefs">
          <div class="field"><label for="s-name">Household name</label>
            <input id="s-name" name="household" maxlength="48" value="${s.household}" placeholder="e.g. The Rivera household" autocomplete="off"></div>
          <div class="field"><label for="s-cur">Currency</label>
            <select id="s-cur" name="currency">${CURRENCIES.map((c) => html`<option value="${c.code}" ${c.code === s.currency ? 'selected' : ''}>${c.code} — ${c.label}</option>`)}</select>
            <p class="hint">Example: ${money(1234567.5)}. Changes how amounts are written, not their value.</p></div>
          <fieldset class="field"><legend>Appearance</legend>
            <div class="seg">${['system', 'light', 'dark'].map((t) => html`<label><input type="radio" name="theme" value="${t}" ${s.theme === t ? 'checked' : ''}><span>${t[0].toUpperCase() + t.slice(1)}</span></label>`)}</div></fieldset>
        </form>
      </section>
      <section class="card" aria-labelledby="data-h"><h2 id="data-h">Your data</h2>
        <p class="muted small">${n} transactions · ${ctx.state.bills.length} bills · ${ctx.state.goals.length} goals · ${(bytes / 1024).toFixed(1)} KB stored</p>
        <div class="btn-grid">
          <button type="button" class="btn" data-act="json">${icon('download')} Back up (JSON)</button>
          <button type="button" class="btn" data-act="csv">${icon('download')} Transactions (CSV)</button>
          <label class="btn file-btn">${icon('upload')} Import JSON or CSV<input type="file" id="import" accept=".json,.csv,application/json,text/csv" class="sr-only"></label>
        </div>
        <p class="hint">A JSON backup restores everything. A CSV adds transactions; it needs <code>date</code> (YYYY-MM-DD) and <code>amount</code> columns, with optional <code>type</code>, <code>category</code> and <code>note</code>.</p>
        <p class="import-msg" id="import-msg" role="status"></p>
      </section>
      <section class="card" aria-labelledby="demo-h"><h2 id="demo-h">Sample household</h2>
        <p class="muted">Six months of a family of four’s money — paydays, groceries, bills and goals — to explore every page.</p>
        <button type="button" class="btn" data-act="sample">${icon('spark')} Load sample household</button>
      </section>
      <section class="card danger-zone" aria-labelledby="rs-h"><h2 id="rs-h">Start over</h2>
        <p class="muted">Erase every transaction, bill and goal on this device. Export a backup first if you might want it back.</p>
        <button type="button" class="btn btn-danger" data-act="reset">${icon('trash')} Reset all data</button>
      </section>
      <section class="card" aria-labelledby="kb-h"><h2 id="kb-h">Keyboard shortcuts</h2>
        <dl class="keys-list"><dt><kbd>N</kbd></dt><dd>Add a transaction</dd><dt><kbd>[</kbd> <kbd>]</kbd></dt><dd>Previous / next month</dd><dt><kbd>/</kbd></dt><dd>Search transactions</dd><dt><kbd>Esc</kbd></dt><dd>Close a sheet</dd></dl>
      </section>
      <section class="card" aria-labelledby="inc-h"><h2 id="inc-h">Income sources</h2>
        <p class="muted small">${incomeCategories().map((c) => c.name).join(' · ')}</p>
        <p class="hint">Hearthbook works offline from its own files, and keeps no account and sends nothing anywhere.</p>
      </section>
    </div>`;
}

export function bind(root) {
  const form = $('#prefs', root);
  form.addEventListener('submit', (e) => e.preventDefault());
  form.household.addEventListener('change', (e) => { setSetting('household', e.target.value.trim()); toast('Household name saved'); });
  form.currency.addEventListener('change', (e) => { setSetting('currency', e.target.value); toast(`Currency set to ${e.target.value}`); });
  form.querySelectorAll('[name="theme"]').forEach((r) => r.addEventListener('change', () => setSetting('theme', r.value)));

  root.querySelector('[data-act="json"]').addEventListener('click', async () => { (await import('../io.js')).exportJSON(); toast('Backup saved to your downloads'); });
  root.querySelector('[data-act="csv"]').addEventListener('click', async () => { (await import('../io.js')).exportCSV(); toast('CSV saved to your downloads'); });
  $('#import', root).addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const msg = $('#import-msg', root);
    const isJSON = /\.json$/i.test(file.name);
    if (isJSON && !(await confirmBox('Restore this backup?', 'Everything currently on this device is replaced by the file’s contents.', 'Replace my data'))) { e.target.value = ''; return; }
    try {
      const { importFile } = await import('../io.js');
      toast(await importFile(file));
    } catch (err) {
      msg.textContent = err.message;
      msg.classList.add('warn-text');
    }
  });
  root.querySelector('[data-act="sample"]').addEventListener('click', async () => {
    if (getState().transactions.length && !(await confirmBox('Load the sample household?', 'It replaces what is on this device. Export a backup first to keep your own data.', 'Load sample'))) return;
    const { sampleHousehold } = await import('../sample.js');
    replaceAll(sampleHousehold(getState().settings.currency));
    location.hash = '#/home';
    toast('Sample household loaded');
  });
  root.querySelector('[data-act="reset"]').addEventListener('click', async () => {
    if (!(await confirmBox('Reset all data?', 'This erases every transaction, bill and goal on this device. It cannot be undone.', 'Erase everything'))) return;
    const keep = getState().settings;
    reset();
    setSetting('currency', keep.currency);
    setSetting('theme', keep.theme);
    location.hash = '#/home';
    toast('All data erased');
  });
}
