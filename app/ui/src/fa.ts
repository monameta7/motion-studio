// Responsibility: Persian formatting helpers for the UI: Persian digits everywhere (docs/11), durations, relative times and Jalali dates.
import { APP_TIMEZONE } from '../../calendar/zone';
const DIGITS = '۰۱۲۳۴۵۶۷۸۹';

/** Latin digits → Persian digits, decimal point → «٫». */
export function faNum(v: number | string, decimals?: number): string {
  const s = typeof v === 'number' && decimals !== undefined ? v.toFixed(decimals) : String(v);
  return s.replace(/\d/g, (d) => DIGITS[Number(d)]!).replace(/(\d|[۰-۹])\.(?=[۰-۹])/g, '$1٫');
}

/** Seconds as «۱:۰۷» (minutes:seconds). */
export function faDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return faNum(`${m}:${String(s).padStart(2, '0')}`);
}

/** «۵ دقیقه پیش», «۲ ساعت پیش». */
export function faAgo(minutes: number): string {
  if (minutes < 1) return 'همین الان';
  if (minutes < 60) return `${faNum(Math.round(minutes))} دقیقه پیش`;
  if (minutes < 48 * 60) return `${faNum(Math.round(minutes / 60))} ساعت پیش`;
  return `${faNum(Math.round(minutes / 1440))} روز پیش`;
}

/** Jalali date and time of an ISO timestamp, Persian digits (the app's zone, D63). */
export function faDateTime(iso: string, withTime = true): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
    timeZone: APP_TIMEZONE, year: 'numeric', month: 'long', day: 'numeric', ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(d);
}

export function faTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : new Intl.DateTimeFormat('fa-IR', { timeZone: APP_TIMEZONE, hour: '2-digit', minute: '2-digit' }).format(d);
}
