// Charts drawn as inline SVG strings, no library: a spending donut, a six-month trend, a progress ring
// and a month-pace line. Colours come from CSS variables so light and dark mode both read well.

import { esc, raw } from './dom.js';
import { moneyCompact, moneyWhole } from './money.js';

const f = (n) => Math.round(n * 10) / 10;

/** Donut of spending by envelope. segments: [{label, value, color}]. */
export function donut(segments, { size = 200, thickness = 26, centerLabel = '', centerValue = '' } = {}) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  const r = (size - thickness) / 2;
  const c = size / 2;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  const gap = segments.length > 1 ? 2 : 0;
  const arcs = total > 0
    ? segments.map((s) => {
      const len = (s.value / total) * circ;
      const dash = Math.max(len - gap, 0.5);
      const el = `<circle r="${f(r)}" cx="${c}" cy="${c}" fill="none" stroke="${esc(s.color)}" stroke-width="${thickness}"
        stroke-dasharray="${f(dash)} ${f(circ - dash)}" stroke-dashoffset="${f(-offset)}"><title>${esc(s.label)}: ${esc(moneyWhole(s.value))}</title></circle>`;
      offset += len;
      return el;
    }).join('')
    : `<circle r="${f(r)}" cx="${c}" cy="${c}" fill="none" stroke="var(--line)" stroke-width="${thickness}"/>`;
  const label = segments.map((s) => `${s.label} ${moneyWhole(s.value)}`).join(', ');
  return raw(`<svg class="donut" viewBox="0 0 ${size} ${size}" role="img" aria-label="${esc(`Spending by envelope: ${label || 'nothing yet'}`)}">
    <g transform="rotate(-90 ${c} ${c})">${arcs}</g>
    <text x="${c}" y="${c - 6}" text-anchor="middle" class="donut-k">${esc(centerLabel)}</text>
    <text x="${c}" y="${c + 18}" text-anchor="middle" class="donut-v">${esc(centerValue)}</text></svg>`);
}

/** Paired bars of income and spending per month with a line for what was saved. months: [{label, income, spent, saved}]. */
export function trendChart(months, { width = 640, height = 240 } = {}) {
  const pad = { t: 16, r: 8, b: 28, l: 52 };
  const w = width - pad.l - pad.r;
  const h = height - pad.t - pad.b;
  const max = Math.max(1, ...months.flatMap((m) => [m.income, m.spent]));
  const nice = niceCeil(max);
  const y = (v) => pad.t + h - (v / nice) * h;
  const slot = w / months.length;
  const bw = Math.min(44, slot / 3.4);
  const grid = [0, 0.25, 0.5, 0.75, 1].map((p) => {
    const v = nice * p;
    return `<line x1="${pad.l}" x2="${width - pad.r}" y1="${f(y(v))}" y2="${f(y(v))}" class="grid"/>
      <text x="${pad.l - 8}" y="${f(y(v) + 4)}" text-anchor="end" class="axis">${esc(moneyCompact(v))}</text>`;
  }).join('');
  const bars = months.map((m, i) => {
    const cx = pad.l + slot * i + slot / 2;
    const bar = (v, dx, cls, name) => `<rect x="${f(cx + dx)}" y="${f(y(v))}" width="${f(bw)}" height="${f(Math.max(0, pad.t + h - y(v)))}" rx="4" class="${cls}"><title>${esc(m.label)} ${name}: ${esc(moneyWhole(v))}</title></rect>`;
    return `${bar(m.income, -bw - 2, 'bar-in', 'income')}${bar(m.spent, 2, 'bar-out', 'spent')}
      <text x="${f(cx)}" y="${height - 8}" text-anchor="middle" class="axis${m.current ? ' axis-now' : ''}">${esc(m.label)}</text>`;
  }).join('');
  const pts = months.map((m, i) => `${f(pad.l + slot * i + slot / 2)},${f(y(Math.max(0, m.saved)))}`);
  const dots = pts.map((p, i) => `<circle cx="${p.split(',')[0]}" cy="${p.split(',')[1]}" r="4" class="dot-save"><title>${esc(months[i].label)} saved: ${esc(moneyWhole(months[i].saved))}</title></circle>`).join('');
  const summary = months.map((m) => `${m.label}: in ${moneyWhole(m.income)}, out ${moneyWhole(m.spent)}, saved ${moneyWhole(m.saved)}`).join('; ');
  return raw(`<svg class="trend" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(`Six-month trend. ${summary}`)}">
    ${grid}${bars}<polyline points="${pts.join(' ')}" class="line-save" fill="none"/>${dots}</svg>`);
}

/** Circular progress for a savings goal. */
export function ring(pct, color, size = 76) {
  const r = size / 2 - 7;
  const circ = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, pct));
  return raw(`<svg class="ring" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true">
    <circle cx="${size / 2}" cy="${size / 2}" r="${f(r)}" class="ring-track" fill="none" stroke-width="8"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${f(r)}" fill="none" stroke="${esc(color)}" stroke-width="8" stroke-linecap="round"
      stroke-dasharray="${f(circ * p)} ${f(circ)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
    <text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle" class="ring-t">${Math.round(p * 100)}%</text></svg>`);
}

/** Spending so far this month against an even pace to the budget. */
export function paceChart(cumulative, budget, days, { width = 320, height = 90 } = {}) {
  const max = Math.max(budget, cumulative[cumulative.length - 1] || 0, 1) * 1.08;
  const x = (d) => (d / Math.max(days - 1, 1)) * (width - 4) + 2;
  const y = (v) => height - 4 - (v / max) * (height - 10);
  const line = cumulative.map((v, i) => `${f(x(i))},${f(y(v))}`).join(' ');
  const area = cumulative.length ? `M${f(x(0))},${height - 4} L${line.replace(/ /g, ' L')} L${f(x(cumulative.length - 1))},${height - 4}Z` : '';
  return raw(`<svg class="pace" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">
    <line x1="${x(0)}" y1="${f(y(0))}" x2="${f(x(days - 1))}" y2="${f(y(budget))}" class="pace-even"/>
    <line x1="0" x2="${width}" y1="${f(y(budget))}" y2="${f(y(budget))}" class="pace-cap"/>
    ${area ? `<path d="${area}" class="pace-area"/><polyline points="${line}" class="pace-line" fill="none"/>` : ''}</svg>`);
}

function niceCeil(v) {
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}
