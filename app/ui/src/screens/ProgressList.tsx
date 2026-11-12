// Responsibility: the «در حال ساخت» list: every unfinished job with its brand and status, each opening its In-progress screen.
import type { JobSummary } from '../api';
import { faDateTime } from '../fa';
import { STATUS_FA } from '../labels';
import { ACTIVE } from '../Sidebar';
import { EmptyState } from '../guide/EmptyState';
import { HelpButton, useScreenTour } from '../guide/Guide';

export function ProgressList({ jobs }: { jobs: JobSummary[] }) {
  useScreenTour('jobs');
  const list = jobs.filter((j) => ACTIVE.includes(j.status));
  return (
    <div className="stack">
      <div className="page-head"><h1>در حال ساخت</h1><div className="head-side"><HelpButton /><a className="btn primary" href="#/new" data-tour="jobs-new">ساخت ویدیو</a></div></div>
      {list.length === 0 ? <div className="card" data-tour="jobs-list"><EmptyState text="الان ویدیویی در حال ساخت نیست. ویدیوهایی که شروع کنی تا وقتی تمام شوند اینجا می‌مانند." action={{ label: 'شروع یک ویدیوی تازه', href: '#/new' }} /></div> : (
        <ul className="job-list" data-tour="jobs-list">
          {list.map((j) => (
            <li key={j.slug}>
              <a className="card job-row" href={`#/jobs/${j.slug}`}>
                <b>{j.title}</b>
                <span className="muted small"><span className="brand-chip">برند: {j.brand_name}</span> {STATUS_FA[j.status]}{j.active ? ' · در حال اجرا' : ''} · {faDateTime(j.created_at)}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
