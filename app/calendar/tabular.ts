// Responsibility: read the owner's table file into rows of text, without a new dependency: CSV (comma, semicolon or tab; quotes; Persian text) and the first sheet of an .xlsx (a zip of XML) — docs/08 «import CSV/XLSX».
import { inflateRawSync } from 'node:zlib';

export class TableError extends Error {}

/** Rows keep their place (a blank row stays a blank row, so a row number matches what the owner sees); only the empty rows at the end go. */
const withoutTrailingBlanks = (rows: string[][]): string[][] => {
  let n = rows.length;
  while (n > 0 && rows[n - 1]!.every((c) => c === '')) n--;
  return rows.slice(0, n);
};

const BOM = String.fromCharCode(0xfeff);

/** CSV text to rows. The delimiter is the most frequent of , ; tab in the first line. */
export function parseCsv(input: string): string[][] {
  const text = input.startsWith(BOM) ? input.slice(1) : input;
  const first = text.split(/\r?\n/, 1)[0] ?? '';
  const delim = [',', ';', '\t'].map((d) => [d, first.split(d).length] as const).sort((a, b) => b[1] - a[1])[0]![0];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false; } else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length > 0) { row.push(cell); rows.push(row); }
  return withoutTrailingBlanks(rows.map((r) => r.map((c) => c.trim())));
}

interface ZipEntry { method: number; size: number; offset: number }
const MAX_UNZIPPED = 20 * 1024 * 1024;

/** The files of a zip, read from its central directory. */
function zipEntries(buf: Buffer): Map<string, ZipEntry> {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new TableError('فایل اکسل خراب است یا فرمتش پشتیبانی نمی‌شود.');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = new Map<string, ZipEntry>();
  for (let n = 0; n < count && p + 46 <= buf.length && buf.readUInt32LE(p) === 0x02014b50; n++) {
    const nameLen = buf.readUInt16LE(p + 28);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    out.set(name, { method: buf.readUInt16LE(p + 10), size: buf.readUInt32LE(p + 20), offset: buf.readUInt32LE(p + 42) });
    p += 46 + nameLen + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
  }
  return out;
}

function zipRead(buf: Buffer, e: ZipEntry): string {
  if (buf.readUInt32LE(e.offset) !== 0x04034b50) throw new TableError('فایل اکسل خراب است.');
  const start = e.offset + 30 + buf.readUInt16LE(e.offset + 26) + buf.readUInt16LE(e.offset + 28);
  const data = buf.subarray(start, start + e.size);
  if (e.method === 0) return data.toString('utf8');
  if (e.method === 8) return inflateRawSync(data, { maxOutputLength: MAX_UNZIPPED }).toString('utf8');
  throw new TableError('فایل اکسل خراب است یا فرمتش پشتیبانی نمی‌شود.');
}

const unxml = (s: string): string => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16))).replace(/&amp;/g, '&');

/** The text of an <si> or <is> element: every <t> in it, joined (rich text splits a string into runs). */
const textOf = (xml: string): string => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => unxml(m[1]!)).join('');

const colIndex = (ref: string): number => [...ref.replace(/\d+/g, '')].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;

/** The first sheet of an .xlsx as rows of text; numbers keep their stored value (a date is its serial number). */
export function parseXlsx(buf: Buffer): string[][] {
  const files = zipEntries(buf);
  const read = (name: string): string | null => { const e = files.get(name); return e ? zipRead(buf, e) : null; };
  const sheets = [...files.keys()].filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort((a, b) => Number(/(\d+)\.xml$/.exec(a)![1]) - Number(/(\d+)\.xml$/.exec(b)![1]));
  const sheet = sheets[0] ? read(sheets[0]) : null;
  if (!sheet) throw new TableError('در فایل اکسل برگه‌ای پیدا نشد.');
  const shared = [...(read('xl/sharedStrings.xml') ?? '').matchAll(/<si>([\s\S]*?)<\/si>|<si\s[^>]*>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1] ?? m[2] ?? ''));
  const rows: string[][] = [];
  for (const r of sheet.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const row: string[] = [];
    for (const c of r[2]!.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1]!;
      const ref = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1];
      if (!ref) continue;
      const type = /\bt="(\w+)"/.exec(attrs)?.[1] ?? 'n';
      const body = c[2] ?? '';
      const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      row[colIndex(ref)] = type === 's' ? (shared[Number(v)] ?? '') : type === 'inlineStr' ? textOf(body) : unxml(v ?? '');
    }
    // A row without cells is not in the file at all; its number (the r attribute) keeps the rows after it in place.
    const at = Number(/\br="(\d+)"/.exec(r[1]!)?.[1]) - 1;
    rows[Number.isInteger(at) && at >= rows.length ? at : rows.length] = Array.from(row, (x) => (x ?? '').trim());
  }
  return withoutTrailingBlanks(Array.from(rows, (r) => r ?? []));
}

/**
 * CSV bytes to text. UTF-8 (with or without BOM: Excel's «CSV UTF-8») is read as it is; a file that is not UTF-8 is Excel's plain «CSV»
 * on a Persian/Arabic Windows (code page 1256) and is read in that code page. On a Windows with another code page Excel has already
 * written every Persian letter as «?»: the letters are gone from the file, so it is refused rather than filling the calendar with «????».
 */
export function decodeCsv(buf: Buffer): string {
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch {
    // Code page 1256 has no Persian yeh or kaf; Windows writes the Arabic letters in their place. Back to the Persian ones.
    text = new TextDecoder('windows-1256').decode(buf).replace(/ي/g, 'ی').replace(/ك/g, 'ک');
  }
  if (text.includes('??')) throw new TableError('حروف فارسی این فایل موقع ذخیره از بین رفته و به «?» تبدیل شده است. در اکسل با «ذخیره به‌عنوان» نوع فایل را «CSV UTF-8» یا «Excel Workbook» بگذار و دوباره وارد کن.');
  return text;
}

/** A table file by its name: .csv or .xlsx. */
export function readTable(name: string, buf: Buffer): string[][] {
  const lower = name.toLowerCase();
  if (lower.endsWith('.xlsx')) return parseXlsx(buf);
  if (lower.endsWith('.csv') || lower.endsWith('.txt')) return parseCsv(decodeCsv(buf));
  throw new TableError('فقط فایل CSV یا اکسل (xlsx) پذیرفته می‌شود.');
}
