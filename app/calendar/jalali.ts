// Responsibility: convert between Gregorian and Jalali dates and read a date the owner typed (Persian or Latin digits, Jalali or Gregorian) as a Gregorian ISO date, for the calendar import and paste (docs/08).

const BREAKS = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];
const div = (a: number, b: number): number => Math.trunc(a / b);
const mod = (a: number, b: number): number => a - Math.trunc(a / b) * b;

export interface Ymd { y: number; m: number; d: number }

/** Leap position, the Gregorian year and the March day of Nowruz for a Jalali year (the 33-year arithmetic cycle). */
function jalCal(jy: number): { leap: number; gy: number; march: number } {
  if (jy < BREAKS[0]! || jy >= BREAKS[BREAKS.length - 1]!) throw new RangeError(`Jalali year out of range: ${jy}`);
  const gy = jy + 621;
  let leapJ = -14;
  let jp = BREAKS[0]!;
  let jump = 0;
  for (let i = 1; i < BREAKS.length; i++) {
    const jm = BREAKS[i]!;
    jump = jm - jp;
    if (jy < jm) break;
    leapJ += div(jump, 33) * 8 + div(mod(jump, 33), 4);
    jp = jm;
  }
  let n = jy - jp;
  leapJ += div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;
  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
  let leap = mod(mod(n + 1, 33) - 1, 4);
  if (leap === -1) leap = 4;
  return { leap, gy, march };
}

const g2d = (gy: number, gm: number, gd: number): number => {
  const d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4) + div(153 * mod(gm + 9, 12) + 2, 5) + gd - 34840408;
  return d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
};

const d2g = (jdn: number): Ymd => {
  let j = 4 * jdn + 139361631;
  j += div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = div(mod(j, 1461), 4) * 5 + 308;
  const d = div(mod(i, 153), 5) + 1;
  const m = mod(div(i, 153), 12) + 1;
  return { y: div(j, 1461) - 100100 + div(8 - m, 6), m, d };
};

const j2d = (jy: number, jm: number, jd: number): number => {
  const r = jalCal(jy);
  return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
};

const d2j = (jdn: number): Ymd => {
  const gy = d2g(jdn).y;
  let jy = gy - 621;
  const r = jalCal(jy);
  let k = jdn - g2d(gy, 3, r.march);
  if (k >= 0) {
    if (k <= 185) return { y: jy, m: 1 + div(k, 31), d: mod(k, 31) + 1 };
    k -= 186;
  } else {
    jy -= 1;
    k += 179;
    if (r.leap === 1) k += 1;
  }
  return { y: jy, m: 7 + div(k, 30), d: mod(k, 30) + 1 };
};

export const toJalali = (g: Ymd): Ymd => d2j(g2d(g.y, g.m, g.d));
export const toGregorian = (j: Ymd): Ymd => d2g(j2d(j.y, j.m, j.d));

/** Number of days in a Jalali month (the last month has 30 in a leap year). */
export function jalaliMonthLength(jy: number, jm: number): number {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  return jalCal(jy).leap === 0 ? 30 : 29;
}

const pad = (n: number): string => String(n).padStart(2, '0');
export const isoOf = (g: Ymd): string => `${String(g.y).padStart(4, '0')}-${pad(g.m)}-${pad(g.d)}`;
export const ymdOf = (iso: string): Ymd => ({ y: Number(iso.slice(0, 4)), m: Number(iso.slice(5, 7)), d: Number(iso.slice(8, 10)) });

/** Adds days to an ISO date (UTC arithmetic, so no daylight-saving shifts). */
export function addDays(iso: string, days: number): string {
  const t = Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) + days * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}

/** 0 = Saturday … 6 = Friday (the calendar and schedule order, docs/08). */
export function weekdayIndex(iso: string): number {
  return (new Date(`${iso}T00:00:00Z`).getUTCDay() + 1) % 7;
}

const FA = '۰۱۲۳۴۵۶۷۸۹';
const AR = '٠١٢٣٤٥٦٧٨٩';
/** Persian and Arabic-Indic digits to Latin. */
export const latinDigits = (s: string): string => s.replace(/[۰-۹]/g, (c) => String(FA.indexOf(c))).replace(/[٠-٩]/g, (c) => String(AR.indexOf(c)));

/**
 * Reads «۱۴۰۵/۰۸/۱۲», «1405-8-12», «2026-11-03», «2026/11/3» as a Gregorian ISO date; a year below 1700 is Jalali.
 * A real calendar date only: «1405/12/30» is accepted in a leap year and refused otherwise. Null when it is not a date.
 */
export function parseDate(text: string): string | null {
  const m = /^(\d{4})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{1,2})$/.exec(latinDigits(text.trim()));
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1) return null;
  try {
    if (y < 1700) {
      if (d > jalaliMonthLength(y, mo)) return null;
      return isoOf(toGregorian({ y, m: mo, d }));
    }
    const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    return d <= last ? isoOf({ y, m: mo, d }) : null;
  } catch { return null; }
}

export const JALALI_MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'] as const;
/** Saturday first. */
export const WEEKDAYS_FA = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'] as const;
