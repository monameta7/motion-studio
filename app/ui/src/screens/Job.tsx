// Responsibility: the screen for one job: follows it live (SSE) and shows In progress until it is done, then Result (a running revision shows there).
import { useJob } from '../hooks';
import { useScreenTour } from '../guide/Guide';
import { Progress } from './Progress';
import { Result } from './Result';

export function Job({ slug }: { slug: string }) {
  const { job, lost } = useJob(slug);
  // In progress and Result have their own tours (Phase 10).
  useScreenTour(job?.status === 'done' ? 'result' : 'progress');
  if (!job) return <div className="card"><p className="muted">{lost ? 'اتصال به سرور قطع است؛ دوباره تلاش می‌کنم…' : 'در حال بارگذاری…'}</p></div>;
  return (
    <>
      {lost && <p className="problem" role="status">اتصال زنده قطع شد؛ دوباره وصل می‌شوم…</p>}
      {job.status === 'done' ? <Result job={job} /> : <Progress job={job} />}
    </>
  );
}
