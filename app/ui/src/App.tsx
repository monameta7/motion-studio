// Responsibility: the app frame: the first-run wizard while onboarding is not done, otherwise the sidebar (a drawer with a bottom bar on a phone) plus the screen for the current hash route (new video, in progress, a job, archive, library, settings).
import { useEffect, useRef, useState } from 'react';
import { api, type JobSummary } from './api';
import { BrandProvider } from './brand';
import { WorkspaceProvider } from './workspace';
import { GuideProvider } from './guide/Guide';
import { EventTips } from './guide/EventTips';
import { go, usePoll, useRoute } from './hooks';
import { ACTIVE, Sidebar } from './Sidebar';
import { SkeletonCard } from './Skeleton';
import { TabBar } from './TabBar';
import { AutomationOffBanner } from './WarningBanner';
import { Archive } from './screens/Archive';
import { BrandPage } from './screens/BrandPage';
import { NewBrand } from './screens/NewBrand';
import { Automation } from './screens/Automation';
import { Job } from './screens/Job';
import { Library } from './screens/Library';
import { NewVideo } from './screens/NewVideo';
import { ProgressList } from './screens/ProgressList';
import { Settings } from './screens/Settings';
import { Placeholder } from './screens/Placeholder';
import { ForWorkspace } from './screens/VideoSoon';
import { Styles } from './screens/Styles';
import { Welcome } from './screens/Welcome';

export function App() {
  const route = useRoute();
  const { data, reload: reloadJobs } = usePoll<{ jobs: JobSummary[] }>('/api/jobs', 10000);
  const jobs = data?.jobs ?? [];
  const job = /^\/jobs\/([a-z0-9][a-z0-9._-]*)$/.exec(route)?.[1];
  // A fresh profile (no `onboarding_done`) opens the wizard first; an unreachable server keeps the normal screens.
  const [onboarded, setOnboarded] = useState<boolean | null>(null);
  useEffect(() => { api.get<{ done: boolean }>('/api/onboarding').then((r) => setOnboarded(r.done), () => setOnboarded(true)); }, []);
  useEffect(() => { if (onboarded === false && route !== '/welcome') go('/welcome'); }, [onboarded, route]);

  // Phone (Phase 12): the sidebar is a drawer opened by «بیشتر»; going to a screen or Escape closes it and focus returns to the button.
  const [drawer, setDrawer] = useState(false);
  const more = useRef<HTMLButtonElement>(null);
  const closeDrawer = () => { setDrawer(false); more.current?.focus(); };
  useEffect(() => { setDrawer(false); }, [route]);
  useEffect(() => {
    if (!drawer) return;
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { setDrawer(false); more.current?.focus(); } };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [drawer]);

  // The frame in its final shape while the first answer is on its way, so nothing jumps.
  if (onboarded === null) return <div className="shell"><div className="sidebar" aria-hidden="true" /><main className="main"><SkeletonCard block /></main></div>;
  if (route === '/welcome') return <Welcome onDone={() => setOnboarded(true)} />;

  let screen;
  if (route === '/new') screen = <NewVideo />;
  else if (route === '/progress') screen = <ProgressList jobs={jobs} loading={!data} />;
  else if (job) screen = <Job slug={job} />;
  else if (route === '/archive') screen = <Archive jobs={jobs} reload={reloadJobs} loading={!data} />;
  else if (route === '/library') screen = <ForWorkspace motion={<Library />} video={<Styles />} />;
  else if (route === '/automation') screen = <ForWorkspace motion={<Automation />} video={<Automation key="video" workspace="video" />} />;
  else if (route === '/brand/new') screen = <NewBrand />;
  else if (route === '/brand') screen = <BrandPage />;
  else if (route === '/settings') screen = <Settings />;
  else screen = <Placeholder title="این بخش به‌زودی ساخته می‌شود" />;

  return (
    <BrandProvider>
      <WorkspaceProvider>
      <GuideProvider>
      <div className={`shell${drawer ? ' drawer-open' : ''}`}>
        <Sidebar route={route} jobs={jobs} open={drawer} onClose={closeDrawer} />
        <button type="button" className="drawer-dim" tabIndex={-1} aria-label="بستن منو" onClick={closeDrawer} />
        <main className="main" id="main" inert={drawer}><AutomationOffBanner onAutomation={route === '/automation'} /><EventTips jobs={jobs} />{screen}</main>
        <TabBar route={route} active={jobs.filter((j) => ACTIVE.includes(j.status)).length} open={drawer} onMore={() => setDrawer((d) => !d)} moreRef={more} />
      </div>
      </GuideProvider>
      </WorkspaceProvider>
    </BrandProvider>
  );
}
