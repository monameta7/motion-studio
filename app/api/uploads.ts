// Responsibility: keep the owner's images added with «+» in a staging folder until a job is created from them (docs/11 §1, D42), checking type and size like intake does.
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { IntakeError, imageKind, type IntakeLimits } from '../intake/index.js';

export interface Upload { id: string; name: string; bytes: number; kind: 'png' | 'jpg' | 'webp' }

const ID = /^[0-9a-f-]{36}$/;

/** Keeps only the file name (no folders) and characters every file system accepts; the Persian name stays readable. */
export function safeName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  const clean = [...base].map((ch) => (ch.charCodeAt(0) < 32 || '<>:"|?*'.includes(ch) ? '_' : ch)).join('').replace(/^\.+/, '').trim().slice(0, 120);
  return clean || 'image';
}

/** Saves one image as `<root>/<uuid>/<name>`, so intake later keeps the original name. Rejects anything that is not a PNG, JPG or WebP within the size limit. */
export function saveUpload(root: string, name: string, data: Buffer, limits: IntakeLimits): Upload {
  const kind = imageKind(data.subarray(0, 16));
  if (!kind) throw new IntakeError(`«${safeName(name)}» تصویر PNG، JPG یا WebP نیست.`, name);
  if (data.length > limits.max_image_mb * 1024 * 1024) throw new IntakeError(`«${safeName(name)}» بزرگ‌تر از ${limits.max_image_mb} مگابایت است.`, `${data.length} bytes`);
  const id = randomUUID();
  const dir = path.join(root, id);
  fs.mkdirSync(dir, { recursive: true });
  const file = safeName(name);
  fs.writeFileSync(path.join(dir, file), data);
  return { id, name: file, bytes: data.length, kind };
}

/** Path of a staged image, or null for an unknown or malformed id. */
export function uploadPath(root: string, id: string): string | null {
  if (!ID.test(id)) return null;
  const dir = path.join(root, id);
  let files: string[];
  try { files = fs.readdirSync(dir); } catch { return null; }
  return files.length === 1 ? path.join(dir, files[0]!) : null;
}

/** Removes staged images once a job has its own copies, and any older than `maxAgeH` (abandoned forms). */
export function removeUploads(root: string, ids: string[], maxAgeH = 24, now = Date.now()): void {
  for (const id of ids) if (ID.test(id)) fs.rmSync(path.join(root, id), { recursive: true, force: true });
  let dirs: string[];
  try { dirs = fs.readdirSync(root); } catch { return; }
  for (const d of dirs) {
    const full = path.join(root, d);
    try { if (now - fs.statSync(full).mtimeMs > maxAgeH * 3600000) fs.rmSync(full, { recursive: true, force: true }); } catch { /* already gone */ }
  }
}
