// Responsibility: the screen for one job: follows it live (SSE) and shows In progress until it is done, then Result (a running revision shows there).
import { useRef } from 'react';
import { useJob } from '../hooks';
import { SkeletonCard } from '../Skeleton';
import { useScreenTour } from '../guide/Guide';
import { Progress } from './Progress';
import { Result } from './Result';

export function Job({ slug }: { slug: string }) {
  const { job, lost } = useJob(slug);
  // In progress and Result have their own tours (Phase 10), a video job its own pair (Phase 11.9).
  const ws = job?.workspace === 'video' ? '-video' : '';
  useScreenTour(job?.status === 'done' ? `result${ws}` : `progress${ws}`);
  // The film finished while this screen was open: Result shows its cover with the signature entrance (Phase 12).
  const sawUnfinished = useRef(false);
  if (job && job.status !== 'done') sawUnfinished.current = true;
  if (!job) return lost ? <div className="card"><p className="muted">اتصال به سرور قطع است؛ دوباره تلاش می‌کنم…</p></div> : <div className="stack"><div style={{ viewTransitionName: 'film' }}><SkeletonCard lines={1} /></div><SkeletonCard block lines={2} /></div>;
  return (
    <>
      {lost && <p className="problem" role="status">اتصال زنده قطع شد؛ دوباره وصل می‌شوم…</p>}
      {job.status === 'done' ? <Result job={job} fresh={sawUnfinished.current} /> : <Progress job={job} />}
    </>
  );
}
