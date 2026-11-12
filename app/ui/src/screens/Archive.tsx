// Responsibility: the Archive screen (docs/11): every job in a table (date, topic, brand, reference, status, duration, truth score) with filters; a row opens the job.
import { useState } from 'react';
import type { JobSummary } from '../api';
import { faDateTime, faDuration, faNum } from '../fa';
import { go, useRefName } from '../hooks';
import { STATUS_FA } from '../labels';
import { ACTIVE } from '../Sidebar';
import { EmptyState } from '../guide/EmptyState';
import { HelpButton, useScreenTour } from '../guide/Guide';

const FILTERS = [
  { id: 'all', label: 'همه', match: () => true },
  { id: 'done', label: 'آماده', match: (j: JobSummary) => j.status === 'done' },
  { id: 'active', label: 'در حال ساخت', match: (j: JobSummary) => ACTIVE.includes(j.status) },
  { id: 'cancelled', label: 'لغوشده', match: (j: JobSummary) => j.status === 'cancelled' },
] as const;

export function Archive({ jobs }: { jobs: JobSummary[] }) {
  useScreenTour('archive');
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('all');
  const [format, setFormat] = useState<'all' | '9x16' | '16x9'>('all');
  const [q, setQ] = useState('');
  const refName = useRefName();
  const match = FILTERS.find((f) => f.id === filter)!.match;
  const list = jobs.filter((j) => match(j) && (format === 'all' || j.format === format) && (!q.trim() || j.title.includes(q.trim()) || j.topic.includes(q.trim())));

  return (
    <div className="stack">
      <div className="page-head"><h1>بایگانی ویدیوها</h1><div className="head-side"><span className="muted">{faNum(list.length)} از {faNum(jobs.length)} کار</span><HelpButton /></div></div>
      <section className="card stack-sm" aria-label="فیلتر">
        <div className="filters">
          <div className="chips" role="group" aria-label="وضعیت">
            {FILTERS.map((f) => <button key={f.id} type="button" className={`chip${filter === f.id ? ' on' : ''}`} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>{f.label}</button>)}
          </div>
          <label className="inline-field">قالب
            <select value={format} onChange={(e) => setFormat(e.target.value as typeof format)}>
              <option value="all">همه</option><option value="9x16">عمودی ۹:۱۶</option><option value="16x9">افقی ۱۶:۹</option>
            </select>
          </label>
          <label className="inline-field grow">جست‌وجو
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="بخشی از موضوع" />
          </label>
        </div>
      </section>
      <section className="card" data-tour="archive-list">
        {list.length === 0 ? (jobs.length === 0
          ? <EmptyState text="هنوز ویدیویی ساخته نشده است. هر ویدیویی که بسازی، اینجا می‌ماند." action={{ label: 'ساخت اولین ویدیو', href: '#/new' }} />
          : <EmptyState text="ویدیویی با این فیلتر نیست." action={{ label: 'پاک کردن فیلترها', onClick: () => { setFilter('all'); setFormat('all'); setQ(''); } }} />) : (
          <div className="table-wrap">
            <table className="archive">
              <thead><tr><th scope="col">تاریخ</th><th scope="col">موضوع</th><th scope="col">برند</th><th scope="col">مرجع</th><th scope="col">وضعیت</th><th scope="col">مدت</th><th scope="col">حقیقت‌سنجی</th></tr></thead>
              <tbody>
                {list.map((j) => (
                  <tr key={j.slug} onClick={() => go(`/jobs/${j.slug}`)}>
                    <td className="nowrap">{faDateTime(j.created_at, false)}</td>
                    <td><a href={`#/jobs/${j.slug}`}>{j.title}</a></td>
                    <td className="nowrap">{j.brand_name}</td>
                    <td>{j.references.map(refName).join('، ')}</td>
                    <td className="nowrap">{STATUS_FA[j.status]}</td>
                    <td className="nowrap">{j.duration ? faDuration(j.duration) : '—'}</td>
                    <td>{j.truth_score !== null ? faNum(Math.round(j.truth_score)) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
