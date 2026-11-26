// Currency formatting and parsing. Amounts are stored as plain numbers in the household's currency;
// changing the currency setting changes how they are written, never their value.

export const CURRENCIES = [
  { code: 'USD', label: 'US dollar', locale: 'en-US' },
  { code: 'IDR', label: 'Indonesian rupiah', locale: 'id-ID' },
  { code: 'EUR', label: 'Euro', locale: 'de-DE' },
  { code: 'GBP', label: 'British pound', locale: 'en-GB' },
  { code: 'JPY', label: 'Japanese yen', locale: 'ja-JP' },
  { code: 'INR', label: 'Indian rupee', locale: 'en-IN' },
  { code: 'AUD', label: 'Australian dollar', locale: 'en-AU' },
  { code: 'CAD', label: 'Canadian dollar', locale: 'en-CA' },
  { code: 'SGD', label: 'Singapore dollar', locale: 'en-SG' },
  { code: 'MYR', label: 'Malaysian ringgit', locale: 'ms-MY' },
];

let current = CURRENCIES[0];
const cache = new Map();

/** Switch the active currency by its ISO code. */
export function setCurrency(code) {
  current = CURRENCIES.find((c) => c.code === code) || CURRENCIES[0];
  cache.clear();
}

export const currency = () => current;

/** Decimal places the active currency uses (0 for IDR and JPY, 2 for most). */
export function decimals() {
  return fmt('std').resolvedOptions().maximumFractionDigits;
}

function fmt(kind) {
  if (!cache.has(kind)) {
    const base = { style: 'currency', currency: current.code };
    const opts = {
      std: base,
      whole: { ...base, maximumFractionDigits: 0, minimumFractionDigits: 0 },
      compact: { ...base, notation: 'compact', maximumFractionDigits: 1 },
    }[kind];
    cache.set(kind, new Intl.NumberFormat(current.locale, opts));
  }
  return cache.get(kind);
}

/** '$1,234.50' — exact, in the currency's own decimals. */
export function money(n) {
  return fmt('std').format(n || 0);
}

/** '$1,235' — rounded, for headlines and budgets. */
export function moneyWhole(n) {
  return fmt('whole').format(Math.round(n || 0));
}

/** '$1.2K' / 'Rp 4,5 jt' — compact, for chart axes. */
export function moneyCompact(n) {
  return fmt('compact').format(n || 0);
}

/** Signed form for transaction rows: '+$2,400.00' or '−$54.20'. */
export function moneySigned(n, isIncome) {
  return `${isIncome ? '+' : '−'}${money(Math.abs(n))}`;
}

/**
 * Read a typed amount. Accepts '1,234.56', '1.234,56', '12.5k', 'Rp 150.000' and the like.
 * Returns a positive number or NaN.
 */
export function parseAmount(text) {
  let s = String(text ?? '').trim().toLowerCase().replace(/[^\d.,k-]/g, '');
  if (!s || s.includes('-')) return NaN;
  let mult = 1;
  if (s.endsWith('k')) { mult = 1000; s = s.slice(0, -1); }
  if (s.includes('k')) return NaN;
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  const dec = decimals();
  if (lastDot > -1 && lastComma > -1) {
    // Both separators: whichever comes last is the decimal point.
    const decSep = lastDot > lastComma ? '.' : ',';
    s = s.split(decSep === '.' ? ',' : '.').join('').replace(decSep, '.');
  } else if (lastComma > -1 || lastDot > -1) {
    const parts = s.split(lastComma > -1 ? ',' : '.');
    const tail = parts[parts.length - 1];
    // Repeated separators, or (without a 'k') a zero-decimal currency or exactly three digits after it:
    // digit grouping. '2,5k' is always two and a half thousand.
    const grouping = parts.length > 2 || (mult === 1 && (dec === 0 || tail.length === 3));
    s = grouping ? parts.join('') : `${parts[0] || '0'}.${tail}`;
  }
  const n = Number(s) * mult;
  if (!Number.isFinite(n) || n <= 0) return NaN;
  const f = 10 ** dec;
  return Math.round(n * f) / f;
}
