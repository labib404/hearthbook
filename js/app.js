// Hearthbook's shell: boots the data, draws the navigation and month switcher, routes between pages
// (#/budget, #/bills …) and loads each page's module only when it is first opened.

import { getState, hasData, lastSaveError, replaceAll, reset, subscribe } from './store.js';
import { currency, setCurrency } from './money.js';
import { addMonths, monthLabel, monthOf, todayISO } from './dates.js';
import { $, $$, confirmBox, html, icon, toast } from './dom.js';
import { openEntry } from './entry.js';

export const ROUTES = [
  { path: 'home', label: 'Overview', icon: 'home', load: () => import('./views/home.js') },
  { path: 'budget', label: 'Budget', icon: 'envelope', load: () => import('./views/budget.js') },
  { path: 'activity', label: 'Transactions', short: 'Activity', icon: 'list', load: () => import('./views/activity.js') },
  { path: 'bills', label: 'Bills', icon: 'calendar', load: () => import('./views/bills.js') },
  { path: 'goals', label: 'Goals', icon: 'target', load: () => import('./views/goals.js') },
  { path: 'reports', label: 'Reports', icon: 'chart', load: () => import('./views/reports.js') },
  { path: 'settings', label: 'Settings', icon: 'gear', load: () => import('./views/settings.js') },
];

/** sessionStorage can throw when a browser blocks storage; the month picker then just isn't remembered. */
const session = {
  get: (k) => { try { return sessionStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { sessionStorage.setItem(k, v); } catch { /* not remembered */ } },
};

const ui = {
  month: session.get('hearthbook.month') || monthOf(todayISO()),
  route: null,
  renderId: 0,
};

/** Where the page is: route name and its query (#/activity?cat=groceries). */
function parseHash() {
  const [path, query = ''] = location.hash.replace(/^#\/?/, '').split('?');
  const route = ROUTES.find((r) => r.path === path) || ROUTES[0];
  return { route, params: new URLSearchParams(query) };
}

export function go(path) {
  location.hash = `#/${path}`;
}

export function setMonth(key) {
  ui.month = key;
  session.set('hearthbook.month', key);
  render();
}

function applyTheme() {
  const pref = getState().settings.theme;
  const dark = pref === 'dark' || (pref === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  $('meta[name="theme-color"]').content = dark ? '#16201b' : '#f4efe4';
}

function drawNav(active) {
  const link = (r, cls) => html`<a href="#/${r.path}" class="${cls}" ${r === active ? html`aria-current="page"` : ''}>${icon(r.icon)}<span>${r.short && cls === 'tab' ? r.short : r.label}</span></a>`;
  $('#side-nav').innerHTML = html`${ROUTES.map((r) => link(r, 'side-link'))}`.s;
  $('#tab-nav').innerHTML = html`${ROUTES.slice(0, 5).map((r) => link(r, 'tab'))}`.s;
  $('#top-reports').toggleAttribute('aria-current', active.path === 'reports');
  $('#top-settings').toggleAttribute('aria-current', active.path === 'settings');
}

function drawMonth() {
  const now = monthOf(todayISO());
  $('#month-label').textContent = monthLabel(ui.month, currency().locale);
  $('#month-today').hidden = ui.month === now;
}

function drawBanner() {
  const s = getState().settings;
  const box = $('#banner');
  box.hidden = !s.sample;
  if (s.sample) {
    box.innerHTML = html`${icon('spark')}<p><strong>You’re exploring a sample household.</strong> <span class="banner-more">Every figure is made up, and every button works. When you’re ready, start your own.</span></p>
      <button type="button" class="btn btn-small" id="start-own">Start my own budget</button>`.s;
    $('#start-own').addEventListener('click', startOwn);
  }
}

async function startOwn() {
  const ok = await confirmBox('Start your own budget?', 'This clears the sample household from this device. Your envelopes are kept, ready for your own limits.', 'Clear sample & start', false);
  if (!ok) return;
  reset();
  ui.month = monthOf(todayISO());
  go('budget');
  toast('Fresh start. Set a limit for each envelope to begin.');
}

/** Draw the current page. Each page module exports render(ctx) and, if it needs events, bind(root, ctx). */
export async function render() {
  const { route, params } = parseHash();
  const id = ++ui.renderId;
  const state = getState();
  setCurrency(state.settings.currency);
  applyTheme();
  drawNav(route);
  drawMonth();
  drawBanner();
  document.body.dataset.route = route.path;
  const view = await route.load();
  if (id !== ui.renderId) return;
  const root = $('#view');
  const ctx = { state, month: ui.month, today: todayISO(), params, locale: currency().locale, go, setMonth, openEntry: (tx, k) => openEntry(tx, ui.month, k) };
  const changedPage = ui.route !== route.path;
  root.innerHTML = view.render(ctx).s;
  view.bind?.(root, ctx);
  document.title = `${route.label} · Hearthbook`;
  if (changedPage) {
    ui.route = route.path;
    window.scrollTo(0, 0);
    if (ui.booted) $('#view-title', root)?.focus({ preventScroll: true });
  }
  ui.booted = true;
  if (lastSaveError()) toast('Could not save on this device — storage is full or blocked. Export a backup from Settings.');
}

function bindShell() {
  $('#month-prev').addEventListener('click', () => setMonth(addMonths(ui.month, -1)));
  $('#month-next').addEventListener('click', () => setMonth(addMonths(ui.month, 1)));
  $('#month-today').addEventListener('click', () => setMonth(monthOf(todayISO())));
  $('#fab').addEventListener('click', () => openEntry(null, ui.month));
  window.addEventListener('hashchange', render);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || $('dialog[open]')) return;
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
    if (e.key === 'n') { e.preventDefault(); openEntry(null, ui.month); }
    else if (e.key === '[') setMonth(addMonths(ui.month, -1));
    else if (e.key === ']') setMonth(addMonths(ui.month, 1));
    else if (e.key === '/' && $('#search')) { e.preventDefault(); $('#search').focus(); }
  });
  // Clicking the dimmed backdrop closes a sheet, as people expect on a phone.
  $$('dialog').forEach((d) => d.addEventListener('click', (e) => { if (e.target === d) d.close(); }));
}

async function boot() {
  if (!hasData()) {
    // First visit: show a full, realistic household straight away rather than an empty shell.
    const { sampleHousehold } = await import('./sample.js');
    replaceAll(sampleHousehold('USD'));
  }
  subscribe(render);
  bindShell();
  await render();
  document.body.classList.add('ready');
}

boot();
