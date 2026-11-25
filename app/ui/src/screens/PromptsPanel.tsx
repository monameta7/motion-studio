// Responsibility: the clip prompts of a video film, shown so a person can read them: per clip its time in the reel, start image, goal, on-screen terms and beats at a glance, with the full prompt in a dialog to read, copy or download.
import { useEffect, useRef, useState } from 'react';
import { fileUrl, type JobDetail } from '../api';
import { faNum } from '../fa';
import { Modal } from '../Modal';

type Prompt = JobDetail['prompts'][number];

/** Copies a text and says so for two seconds. */
function useCopy(): [(text: string) => void, boolean] {
  const [copied, setCopied] = useState(false);
  const copy = (text: string) => {
    void navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }, () => setCopied(false));
  };
  return [copy, copied];
}

/** «0–10 s» → «۰ تا ۱۰ ثانیه». */
const faRange = (r: string) => r.replace(/\s*s$/, '').split(/\s*[–-]\s*/).map((x) => faNum(Number(x), x.includes('.') ? 1 : 0)).join(' تا ') + ' ثانیه';

function FullPrompt({ p, count, onClose }: { p: Prompt; count: number; onClose: () => void }) {
  const [copy, copied] = useCopy();
  const lines = p.text.split(/\r?\n/);
  const focus = p.glance.focus_line;
  const mark = useRef<HTMLSpanElement>(null);
  useEffect(() => { mark.current?.scrollIntoView({ block: 'start' }); }, []);
  const download = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([p.text], { type: 'text/plain;charset=utf-8' }));
    a.download = p.file.split('/').pop() ?? 'prompt.txt';
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <Modal title={`پرامپت کامل کلیپ ${faNum(p.index)} از ${faNum(count)}`} onClose={onClose}>
      <p className="small muted">{faNum(p.text.length)} حرف، {faNum(lines.length)} خط. {focus !== null ? 'از بخش مخصوص همین کلیپ باز شده؛ بالاتر قالب مشترک همه‌ی کلیپ‌هاست.' : ''}</p>
      <pre className="prompt-full" dir="ltr">
        {focus === null ? p.text : (
          <>{lines.slice(0, focus).join('\n')}{'\n'}<span ref={mark} className="prompt-focus">{lines.slice(focus).join('\n')}</span></>
        )}
      </pre>
      <div className="row-between">
        <div className="actions">
          <button type="button" className="btn primary" onClick={() => copy(p.text)}>{copied ? 'کپی شد' : 'کپی پرامپت'}</button>
          <button type="button" className="btn" onClick={download}>دانلود <span className="latin">.txt</span></button>
        </div>
        <button type="button" className="btn" onClick={onClose}>بستن</button>
      </div>
    </Modal>
  );
}

function PromptCard({ p, count, slug, format, clipFile }: { p: Prompt; count: number; slug: string; format: string; clipFile: string | null }) {
  const [open, setOpen] = useState(false);
  const [copy, copied] = useCopy();
  const g = p.glance;
  const glanced = g.goal !== null || g.terms.length > 0 || g.beats.length > 0;
  return (
    <li className="prompt-card">
      <div className={`prompt-thumb f${format}`}>
        {clipFile ? <video src={`${fileUrl(slug, clipFile)}#t=1`} poster={p.start_frame ? fileUrl(slug, p.start_frame) : undefined} preload="metadata" muted controls aria-label={`کلیپ ${faNum(p.index)}`} />
          : p.start_frame ? <img src={fileUrl(slug, p.start_frame)} alt={`تصویر شروع کلیپ ${faNum(p.index)}`} loading="lazy" />
            : <span className="muted small">کلیپ {faNum(p.index)}</span>}
      </div>
      <div className="stack-sm prompt-body">
        <div className="prompt-head">
          <b>کلیپ {faNum(p.index)} از {faNum(count)}</b>
          {g.range && <span className="pill">{faRange(g.range)}</span>}
          <span className="pill">{p.start_frame || (g.start && !/^none\b/i.test(g.start)) ? 'از آخرین فریم کلیپ قبل' : 'شروع تازه'}</span>
        </div>
        {g.goal && <p className="prompt-goal latin" dir="ltr">{g.goal}</p>}
        {g.terms.length > 0 && (
          <div className="stack-sm">
            <span className="field-label small">نوشته‌های روی صفحه</span>
            <ul className="term-list">{g.terms.map((t) => <li key={t.text} className="term-chip" title={t.when}><span className="latin">{t.text}</span></li>)}</ul>
          </div>
        )}
        {g.beats.length > 0 && (
          <details className="beats">
            <summary>زمان‌بندی ({faNum(g.beats.length)} ضرب)</summary>
            <ol className="beat-list" dir="ltr">{g.beats.map((b) => <li key={b.at}><span className="beat-at">{b.at}</span><span>{b.text}</span></li>)}</ol>
          </details>
        )}
        {!glanced && <p className="small muted">این پرامپت خلاصه‌ی جدا ندارد؛ متن کامل را ببین.</p>}
        <div className="actions">
          <button type="button" className="btn" onClick={() => setOpen(true)}>دیدن پرامپت کامل</button>
          <button type="button" className="btn" onClick={() => copy(p.text)} aria-label={`کپی پرامپت کلیپ ${faNum(p.index)}`}>{copied ? 'کپی شد' : 'کپی'}</button>
          <span className="muted small">{faNum(p.text.length)} حرف</span>
        </div>
      </div>
      {open && <FullPrompt p={p} count={count} onClose={() => setOpen(false)} />}
    </li>
  );
}

/** The prompts of a video job; `withClips` shows each finished clip next to its prompt. */
export function PromptsPanel({ job, withClips = true }: { job: JobDetail; withClips?: boolean }) {
  if (job.prompts.length === 0) return <p className="muted small">پرامپت کلیپ‌ها بعد از مرحله‌ی پرامپت ساخته می‌شوند.</p>;
  const clipOf = (i: number) => (withClips ? job.clips?.clips.find((c) => c.index === i)?.file ?? null : null);
  return (
    <ol className="prompt-cards">
      {job.prompts.map((p) => <PromptCard key={p.file} p={p} count={job.prompts.length} slug={job.slug} format={job.format} clipFile={clipOf(p.index)} />)}
    </ol>
  );
}
