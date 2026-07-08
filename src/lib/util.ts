/** Small shared helpers: ids, money rounding/formatting, date math. */

let counter = 0;
export function uid(): string {
  counter = (counter + 1) % 10000;
  return `${Date.now().toString(36)}-${counter.toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 7)}`;
}

/** Round to cents. All engine math funnels through this. */
export function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function clampMin0(n: number): number {
  return n < 0 ? 0 : n;
}

/* ---------------------- money formatting ---------------------- */

const intFmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const centFmt = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/* ---------------------- privacy (shoulder-surfing) ---------------------- */
/**
 * A global toggle that masks every money figure with dots ("$••••"), for when
 * someone's beside you. Because all money rendering funnels through fmt/
 * fmtExact, gating here covers the whole app. State lives in this module; the
 * store keeps React re-rendering in sync.
 */
let _hidden = false;

export function setPrivacy(hidden: boolean): void {
  _hidden = hidden;
}
export function isPrivacyOn(): boolean {
  return _hidden;
}

/** "$1,400" — whole dollars for display; used for the big numbers. */
export function fmt(n: number, symbol = "$"): string {
  if (_hidden) return `${symbol}••••`;
  const sign = n < 0 ? "−" : "";
  return `${sign}${symbol}${intFmt.format(Math.abs(Math.round(n)))}`;
}

/** "$1,400.00" — exact cents; used in the ledger and receipts. */
export function fmtExact(n: number, symbol = "$"): string {
  if (_hidden) return `${symbol}••••••`;
  const sign = n < 0 ? "−" : "";
  return `${sign}${symbol}${centFmt.format(Math.abs(n))}`;
}

/* ---------------------- dates ---------------------- */

export const DAY_MS = 86_400_000;
export const WEEK_MS = 7 * DAY_MS;
/** Average month length in days — used to turn date spans into "months". */
export const MONTH_DAYS = 30.44;

/** Monday 00:00 local time of the week containing d. */
export function startOfWeek(d: Date): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (out.getDay() + 6) % 7; // Mon=0 … Sun=6
  out.setDate(out.getDate() - dow);
  return out;
}

export function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

export function addMonths(d: Date, months: number): Date {
  const out = new Date(d);
  out.setMonth(out.getMonth() + months);
  return out;
}

/** Fractional months between two dates (can be negative). */
export function monthsBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / (MONTH_DAYS * DAY_MS);
}

export function parseISO(s: string): Date {
  // Date-only strings are treated as local midnight, not UTC.
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(s);
}

export function toISODate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const dateFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});
const monthFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  year: "numeric",
});

export function fmtDate(d: Date | string): string {
  return dateFmt.format(typeof d === "string" ? parseISO(d) : d);
}

export function fmtMonth(d: Date | string): string {
  return monthFmt.format(typeof d === "string" ? parseISO(d) : d);
}

/** "3 days", "1 day" */
export function plural(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? "" : "s"}`;
}
