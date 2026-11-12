// Responsibility: the first-time tips for events the app causes while the owner may be on any screen (Phase 10): the first quota warning, the first scheduled film and the first quota pause, each once.
import type { JobSummary } from '../api';
import { usePoll } from '../hooks';
import type { Notice } from '../NotificationBell';
import { FirstTip, useGuide } from './Guide';

export function EventTips({ jobs }: { jobs: JobSummary[] }) {
  const g = useGuide();
  const quotaSeen = g?.tipSeen('quota_warning') ?? true;
  // The notification list is read only while the quota tip can still be shown.
  const { data } = usePoll<{ items: Notice[] }>(quotaSeen ? null : '/api/notifications', 15000);
  // Only a fresh event: an old warning or an old scheduled film from before this version is not news.
  const fresh = (iso: string, hours: number) => Date.now() - Date.parse(iso) < hours * 3600_000;
  const warned = data?.items.some((n) => n.kind === 'quota_warning' && fresh(n.at, 5)) ?? false;
  const scheduled = jobs.find((j) => j.source === 'schedule' && fresh(j.created_at, 24));
  const paused = jobs.find((j) => j.status === 'paused_quota');
  return (
    <>
      <FirstTip id="quota_warning" when={warned} />
      <FirstTip id="scheduled_run" when={!!scheduled} link={scheduled ? { href: `#/jobs/${scheduled.slug}`, label: 'دیدن همین ویدیو' } : undefined} />
      <FirstTip id="paused_quota" when={!!paused} link={paused ? { href: `#/jobs/${paused.slug}`, label: 'دیدن همین کار' } : undefined} />
    </>
  );
}
