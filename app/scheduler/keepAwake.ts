// Responsibility: keep Windows from sleeping while a film is being made (docs/08 «Keep awake»): a tiny PowerShell helper calls SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED) and waits; ending it releases the request. Power plans are never changed.
import { startHelper, type Helper } from '../proc.js';

/**
 * The helper script (ASCII only: Windows PowerShell 5.1 reads scripts in the ANSI code page). 0x80000001 = ES_CONTINUOUS | ES_SYSTEM_REQUIRED.
 * It blocks on stdin; when the app closes stdin (or dies), ReadLine returns, the process ends and Windows drops the request.
 */
export const KEEP_AWAKE_PS = [
  "$sig = '[DllImport(\"kernel32.dll\")] public static extern uint SetThreadExecutionState(uint esFlags);'",
  '$k = Add-Type -MemberDefinition $sig -Name Power -Namespace MahdiyarKeepAwake -PassThru',
  '[void]$k::SetThreadExecutionState([uint32]2147483649)',
  '[void][Console]::In.ReadLine()',
  '[void]$k::SetThreadExecutionState([uint32]2147483648)',
].join('\n');

/** `-EncodedCommand` takes the script as base64 UTF-16LE, so no quoting reaches a command line. */
export const keepAwakeArgs = (): string[] => ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(KEEP_AWAKE_PS, 'utf16le').toString('base64')];

export type StartHelper = (cmd: string, args: string[]) => Helper;

export class KeepAwake {
  private helper: Helper | null = null;

  /** `start` is replaced in tests; off Windows nothing is started. */
  constructor(private readonly start: StartHelper | null = process.platform === 'win32' ? startHelper : null) {}

  active(): boolean { return this.helper !== null; }

  /** Asks Windows to stay awake (does nothing when already asked). */
  hold(): void {
    if (this.helper || !this.start) return;
    const h = this.start('powershell.exe', keepAwakeArgs());
    this.helper = h;
    // A helper that ended by itself (killed from outside) is started again by the next hold().
    void h.exited.then(() => { if (this.helper === h) this.helper = null; });
  }

  /** Lets Windows sleep again. */
  release(): void {
    const h = this.helper;
    this.helper = null;
    h?.stop();
  }
}
