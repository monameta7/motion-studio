// Responsibility: the Windows side of notifications: a SnoreToast toast under the app id Mahdiyar.MotionStudio (node-notifier, docs/09) and opening a route of the app in the default browser when the toast is clicked.
import { WindowsToaster } from 'node-notifier';
import { runTool } from '../proc.js';
import { APP_ID, type ToastFn, type ToastResult } from './index.js';

const RESULTS: ToastResult[] = ['activate', 'dismissed', 'timedout', 'hidden', 'failed'];

/** A toast that resolves when it ends (clicked, swiped away, expired, hidden). Not available off Windows. */
export const windowsToast: ToastFn | null = process.platform !== 'win32' ? null : (() => {
  const toaster = new WindowsToaster({ withFallback: false });
  return (t) => new Promise<ToastResult>((resolve) => {
    toaster.notify({ title: t.title, message: t.message, sound: t.sound, appID: APP_ID }, (err, response) => {
      if (err) { resolve('failed'); return; }
      resolve(RESULTS.find((r) => r === String(response).toLowerCase()) ?? null);
    });
  });
})();

/** Opens `http://localhost:<port>/#<route>` in the default browser (explorer.exe takes a URL; an argument array, no shell). */
export function openRoute(port: number, route: string): void {
  if (process.platform !== 'win32') return;
  void runTool('explorer.exe', [`http://localhost:${port}/#${route}`], { timeoutMs: 10000 });
}
