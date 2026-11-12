// Responsibility: the app frame: the first-run wizard while onboarding is not done, otherwise the sidebar plus the screen for the current hash route (new video, in progress, a job, archive, library, settings).
import { useEffect, useState } from 'react';
import { api, type JobSummary } from './api';
import { BrandProvider } from './brand';
import { GuideProvider } from './guide/Guide';
import { EventTips } from './guide/EventTips';
import { go, usePoll, useRoute } from './hooks';
import { Sidebar } from './Sidebar';
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
import { Welcome } from './screens/Welcome';

export function App() {
  const route = useRoute();
  const { data } = usePoll<{ jobs: JobSummary[] }>('/api/jobs', 10000);
  const jobs = data?.jobs ?? [];
  const job = /^\/jobs\/([a-z0-9][a-z0-9._-]*)$/.exec(route)?.[1];
  // A fresh profile (no `onboarding_done`) opens the wizard first; an unreachable server keeps the normal screens.
  const [onboarded, setOnboarded] = useState<boolean | null>(null);
  useEffect(() => { api.get<{ done: boolean }>('/api/onboarding').then((r) => setOnboarded(r.done), () => setOnboarded(true)); }, []);
  useEffect(() => { if (onboarded === false && route !== '/welcome') go('/welcome'); }, [onboarded, route]);

  if (onboarded === null) return null;
  if (route === '/welcome') return <Welcome onDone={() => setOnboarded(true)} />;

  let screen;
  if (route === '/new') screen = <NewVideo />;
  else if (route === '/progress') screen = <ProgressList jobs={jobs} />;
  else if (job) screen = <Job slug={job} />;
  else if (route === '/archive') screen = <Archive jobs={jobs} />;
  else if (route === '/library') screen = <Library />;
  else if (route === '/automation') screen = <Automation />;
  else if (route === '/brand/new') screen = <NewBrand />;
  else if (route === '/brand') screen = <BrandPage />;
  else if (route === '/settings') screen = <Settings />;
  else screen = <Placeholder title="این بخش به‌زودی ساخته می‌شود" />;

  return (
    <BrandProvider>
      <GuideProvider>
      <div className="shell">
        <Sidebar route={route} jobs={jobs} />
        <main className="main" id="main"><AutomationOffBanner onAutomation={route === '/automation'} /><EventTips jobs={jobs} />{screen}</main>
      </div>
      </GuideProvider>
    </BrandProvider>
  );
}
