// Responsibility: format numbers in owner-facing Persian messages (Persian digits, Persian decimal mark).
const FA = '۰۱۲۳۴۵۶۷۸۹';

export function faNum(n: number | string, decimals?: number): string {
  const s = typeof n === 'number' && decimals !== undefined ? n.toFixed(decimals) : String(n);
  return s.replace(/[0-9]/g, (d) => FA[Number(d)]!).replace(/\./g, '٫');
}
