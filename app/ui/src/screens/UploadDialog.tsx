// Responsibility: the dialog for adding a reference motion (docs/07 «Adding a reference»): the owner only picks a video; the app saves it to the library, reads it and names and groups it by itself (D58, D71), from the Library and from New video alike.
import { useRef, useState } from 'react';
import { api, ApiError } from '../api';
import { Modal } from '../Modal';

export interface UploadResult { slug: string; duplicate: boolean }

export function UploadDialog({ onClose, onDone }: { onClose: () => void; onDone: (r: UploadResult) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<string | null>(null);

  const send = async () => {
    if (!file) { setError('اول یک ویدیو انتخاب کن.'); return; }
    setBusy(true); setError(null);
    const form = new FormData();
    form.append('video', file);
    try {
      const r = await api.post<{ slug: string; duplicate: boolean; message_fa?: string }>('/api/references/upload', form);
      onDone({ slug: r.slug, duplicate: r.duplicate });
      if (r.duplicate) setDuplicate(r.message_fa ?? 'این ویدیو از قبل در کتابخانه هست.'); else onClose();
    } catch (e) { setError(e instanceof ApiError ? e.message : 'ارسال انجام نشد؛ دوباره امتحان کن.'); }
    finally { setBusy(false); }
  };

  return (
    <Modal title="افزودن موشن مرجع" onClose={onClose}>
      {duplicate ? (
        <>
          <p>{duplicate}</p>
          <button type="button" className="btn primary" onClick={onClose}>باشه</button>
        </>
      ) : (
        <>
          <div className="stack-sm">
            <input ref={fileRef} type="file" className="visually-hidden" accept=".mp4,.mov,.webm,video/mp4,video/quicktime,video/webm" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setError(null); }} aria-label="انتخاب ویدیو" />
            <button type="button" className="btn" onClick={() => fileRef.current?.click()}>{file ? file.name : 'انتخاب ویدیو'}</button>
            <p className="muted small">MP4، MOV یا WebM؛ حداکثر ۲۰۰ مگابایت و ۹۰ ثانیه.</p>
          </div>
          {error && <div className="problem" role="alert">{error}</div>}
          <div className="row-between">
            <button type="button" className="btn primary" disabled={busy} onClick={() => void send()}>{busy ? 'در حال ارسال…' : 'ارسال'}</button>
            <button type="button" className="btn" disabled={busy} onClick={onClose}>انصراف</button>
          </div>
        </>
      )}
    </Modal>
  );
}
