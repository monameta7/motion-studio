// Responsibility: read one job's raw Claude stream logs (logs/<stage>-<n>.jsonl) and report what each call and each stage cost: tokens, plan-window points from Anthropic's own percentages, context growth and rework (docs/04 TokenLedger).
import fs from 'node:fs';
import path from 'node:path';
import { STOPPED_BY_OWNER, modelMatches, readRateLimit, readUsage } from '../ai/claudeRunner.js';
import { TokenLedger, writeJson, type LedgerCall, type LedgerSum, type LedgerTokens } from '../contracts/index.js';

const CALL_LOG = /^(.+)-(\d+)\.jsonl$/;
const REJECTIONS = /^(.+)-rejections\.jsonl$/;

/**
 * Two calls further apart than this are not chained: the plan's percentage may have moved for another reason
 * (the owner's own Claude Code work uses the same plan). Then only the call's own first-to-last change is counted.
 */
export const NEXT_CALL_GAP_MS = 15 * 60 * 1000;

/** The pipeline stage a Claude call belongs to (the log and usage rows name the Claude stage). */
export const pipelineStage = (claudeStage: string): string => (claudeStage.startsWith('content') ? 'content' : claudeStage);

export const ledgerFile = (jobDir: string): string => path.join(jobDir, 'logs', 'token-ledger.json');

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {});
const arr = (v: unknown): Obj[] => (Array.isArray(v) ? v.map(obj) : []);
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const points = (delta: number): number => Math.max(0, Math.round(delta * 100));

/** One plan window followed through a call: first and last value, and the change summed inside each window (a reset in the middle starts a new one). */
interface Meter { start: number | null; end: number | null; resetsAt: number | null; endResetsAt: number | null; inCall: number }
const newMeter = (): Meter => ({ start: null, end: null, resetsAt: null, endResetsAt: null, inCall: 0 });

function track(m: Meter, u: number | null, resetsAt: number | null): void {
  if (u === null) return;
  if (m.start === null) { m.start = u; m.resetsAt = resetsAt; }
  else if (resetsAt === m.endResetsAt) m.inCall += u - (m.end ?? u);
  m.end = u;
  m.endResetsAt = resetsAt;
}

interface ParsedCall { call: LedgerCall; five: Meter; seven: Meter }

/** Reads one call's stream log. Unreadable lines are skipped, as the runner does. */
export function readCall(file: string): ParsedCall {
  const name = path.basename(file);
  const m = CALL_LOG.exec(name);
  if (!m) throw new Error(`not a Claude call log: ${name}`);
  const claudeStage = m[1]!;
  let model: string | null = null;
  let started: string | null = null;
  let ended: string | null = null;
  let result: Obj | null = null;
  let quotaStopped = false;
  let images = 0;
  const context = new Map<string, number>();
  const toolIds = new Set<string>();
  const tools: Record<string, number> = {};
  const five = newMeter();
  const seven = newMeter();

  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    let e: Obj;
    try { e = obj(JSON.parse(line)); } catch { continue; }
    if (typeof e.timestamp === 'string') { started ??= e.timestamp; ended = e.timestamp; }
    if (e.type === 'system' && e.subtype === 'init') {
      model = typeof e.model === 'string' ? e.model : null;
    } else if (e.type === 'assistant') {
      const msg = obj(e.message);
      // A sub-agent's messages carry their parent's tool id: they are not requests of this conversation.
      if (e.parent_tool_use_id == null && typeof msg.id === 'string') {
        const u = readUsage(msg.usage);
        context.set(msg.id, u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens);
      }
      for (const c of arr(msg.content)) {
        if (c.type !== 'tool_use' || typeof c.name !== 'string' || typeof c.id !== 'string' || toolIds.has(c.id)) continue;
        toolIds.add(c.id);
        tools[c.name] = (tools[c.name] ?? 0) + 1;
      }
    } else if (e.type === 'user') {
      for (const c of arr(obj(e.message).content)) {
        if (c.type === 'tool_result') images += arr(c.content).filter((p) => p.type === 'image').length;
      }
    } else if (e.type === 'rate_limit_event') {
      const info = readRateLimit(obj(e.rate_limit_info));
      track(five, info.windows.fiveHour, info.windows.fiveHourResetsAt);
      track(seven, info.windows.sevenDay, info.windows.sevenDayResetsAt);
      if (info.status === 'rejected') quotaStopped = true;
    } else if (e.type === 'result') {
      result = e;
    }
  }

  const usage = readUsage(result?.usage);
  const byModel = Object.entries(obj(result?.modelUsage)).map(([k, v]) => ({ k, thinking: num(obj(v).thinkingTokens) }));
  const own = byModel.filter((x) => model !== null && modelMatches(x.k, model));
  const sent = [...context.values()];
  const sorted = [...sent].sort((a, b) => a - b);
  const call: LedgerCall = {
    file: name, claude_stage: claudeStage, stage: pipelineStage(claudeStage), attempt: Number(m[2]),
    model, started_at: started, ended_at: ended,
    outcome: !result ? 'no_result' : result.is_error === true ? 'error' : 'ok',
    quota_stopped: quotaStopped,
    turns: num(result?.num_turns), api_calls: sent.length,
    tokens: {
      input: usage.input_tokens, output: usage.output_tokens, thinking: (own.length ? own : byModel).reduce((n, x) => n + x.thinking, 0),
      cache_read: usage.cache_read_input_tokens, cache_write: usage.cache_creation_input_tokens,
    },
    cost_usd_est: num(result?.total_cost_usd),
    context: { first: sent[0] ?? 0, median: sorted[Math.floor(sorted.length / 2)] ?? 0, max: sorted.at(-1) ?? 0, resent_total: sent.reduce((a, b) => a + b, 0) },
    five_hour: { start: five.start, end: five.end, resets_at: five.resetsAt },
    seven_day: { start: seven.start, end: seven.end, resets_at: seven.resetsAt },
    points: points(five.inCall), points_method: five.start === null ? 'none' : 'in_call', weekly_points: points(seven.inCall),
    tools, images, rejected: null, rework: null,
  };
  return { call, five, seven };
}

interface Rejection { stage: string; at: string; text: string }

function readRejections(logs: string): Rejection[] {
  const out: Rejection[] = [];
  for (const f of fs.readdirSync(logs).sort()) {
    const m = REJECTIONS.exec(f);
    if (!m) continue;
    for (const line of fs.readFileSync(path.join(logs, f), 'utf8').split('\n')) {
      if (!line.trim()) continue;
      let e: Obj;
      try { e = obj(JSON.parse(line)); } catch { continue; }
      if (typeof e.at !== 'string') continue;
      const text = typeof e.problem === 'string' ? e.problem : Array.isArray(e.problems) ? e.problems.map(String).join('; ') : '';
      out.push({ stage: m[1]!, at: e.at, text: text.slice(0, 300) });
    }
  }
  return out.sort((a, b) => a.at.localeCompare(b.at));
}

/** The next call continues the same five-hour window, right after this one: the plan's change up to it belongs to this call. */
function chained(a: ParsedCall, b: ParsedCall | undefined): b is ParsedCall {
  if (!b || a.five.start === null || b.five.start === null || a.five.resetsAt === null) return false;
  if (a.five.resetsAt !== a.five.endResetsAt || a.five.resetsAt !== b.five.resetsAt || b.five.start < a.five.start) return false;
  if (!a.call.ended_at || !b.call.started_at) return false;
  const gap = Date.parse(b.call.started_at) - Date.parse(a.call.ended_at);
  return gap >= 0 && gap <= NEXT_CALL_GAP_MS;
}

const zeroTokens = (): LedgerTokens => ({ input: 0, output: 0, thinking: 0, cache_read: 0, cache_write: 0 });
const zeroSum = (): LedgerSum => ({ calls: 0, points: 0, weekly_points: 0, points_after_rejection: 0, points_after_owner_stop: 0, points_after_quota_stop: 0, tokens: zeroTokens(), cost_usd_est: 0 });

function add(s: LedgerSum, c: LedgerCall): void {
  s.calls++;
  s.points += c.points;
  s.weekly_points += c.weekly_points;
  if (c.rework === 'after_rejection') s.points_after_rejection += c.points;
  if (c.rework === 'after_owner_stop') s.points_after_owner_stop += c.points;
  if (c.rework === 'after_quota_stop') s.points_after_quota_stop += c.points;
  for (const k of Object.keys(s.tokens) as (keyof LedgerTokens)[]) s.tokens[k] += c.tokens[k];
  s.cost_usd_est = Math.round((s.cost_usd_est + c.cost_usd_est) * 1e4) / 1e4;
}

/** The ledger of one job folder; a job without Claude logs gives an empty ledger. The same logs always give the same ledger. */
export function buildLedger(jobDir: string, slug: string = path.basename(jobDir)): TokenLedger {
  const logs = path.join(jobDir, 'logs');
  const files = fs.existsSync(logs) ? fs.readdirSync(logs).filter((f) => CALL_LOG.test(f)).sort() : [];
  // Time order; a call without any timestamp (nothing ran) goes last, by name.
  const parsed = files.map((f) => readCall(path.join(logs, f)))
    .sort((a, b) => (a.call.started_at ?? '￿').localeCompare(b.call.started_at ?? '￿') || a.call.file.localeCompare(b.call.file));
  const calls = parsed.map((p) => p.call);

  // The app's rejections: the call running last before the rejection is the rejected one, the next call of that stage is its repeat.
  for (const r of fs.existsSync(logs) ? readRejections(logs) : []) {
    const ofStage = calls.filter((c) => c.stage === r.stage && c.started_at !== null);
    const i = ofStage.findLastIndex((c) => (c.started_at as string) <= r.at);
    if (i < 0) continue;
    ofStage[i]!.rejected = r.text;
    const repeat = ofStage[i + 1];
    // The owner's own stop (hold, D45) is written to the same file; its repeat is the owner's choice, not an app rejection.
    if (repeat) repeat.rework = r.text.includes(STOPPED_BY_OWNER) ? 'after_owner_stop' : 'after_rejection';
  }
  // A call whose earlier attempt worked and then stopped at the plan limit continues in a new conversation; not all of it is waste, so it is
  // summed apart. An attempt refused at once (no output) did no work, so the call after it is not a restart.
  for (const c of calls) {
    if (c.rework) continue;
    const before = calls.filter((o) => o.claude_stage === c.claude_stage && o.attempt < c.attempt && o.tokens.output > 0).sort((a, b) => b.attempt - a.attempt)[0];
    if (before?.quota_stopped) c.rework = 'after_quota_stop';
  }

  parsed.forEach((p, i) => {
    const next = parsed[i + 1];
    if (!chained(p, next)) return;
    p.call.points = points(next.five.start! - p.five.start!);
    p.call.points_method = 'to_next_call';
    if (p.seven.start !== null && next.seven.start !== null && p.seven.resetsAt === next.seven.resetsAt) p.call.weekly_points = points(next.seven.start - p.seven.start);
  });

  const stages: Record<string, LedgerSum> = {};
  const totals = zeroSum();
  for (const c of calls) { add((stages[c.stage] ??= zeroSum()), c); add(totals, c); }
  return { slug, calls, stages, totals };
}

/** Writes logs/token-ledger.json (validated, docs/04) and returns it. */
export function writeLedger(jobDir: string, slug?: string): TokenLedger {
  return writeJson(ledgerFile(jobDir), TokenLedger, buildLedger(jobDir, slug));
}

/** The part of the ledger that logs/metrics.json carries next to the app's own counts. */
export function ledgerMetrics(l: TokenLedger): Record<string, unknown> {
  const pick = (s: LedgerSum) => ({ window_points: s.points, weekly_points: s.weekly_points, tokens_thinking: s.tokens.thinking, cache_read: s.tokens.cache_read, cache_write: s.tokens.cache_write });
  return {
    file: 'logs/token-ledger.json', ...pick(l.totals),
    points_after_rejection: l.totals.points_after_rejection, points_after_owner_stop: l.totals.points_after_owner_stop, points_after_quota_stop: l.totals.points_after_quota_stop,
    by_stage: Object.fromEntries(Object.entries(l.stages).map(([k, s]) => [k, pick(s)])),
  };
}

const k = (n: number): string => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n));

/** Plain lines for the terminal: one per stage, then one per call. */
export function ledgerLines(l: TokenLedger): string[] {
  const sum = (name: string, s: LedgerSum) =>
    `${name.padEnd(10)} calls ${String(s.calls).padStart(2)}  window ${String(s.points).padStart(3)}  weekly ${String(s.weekly_points).padStart(2)}  out ${k(s.tokens.output).padStart(6)} (thinking ${k(s.tokens.thinking)})  cache read ${k(s.tokens.cache_read).padStart(6)}  write ${k(s.tokens.cache_write).padStart(6)}  $${s.cost_usd_est.toFixed(2)}`;
  const lines = [`${l.slug}`, ...Object.entries(l.stages).map(([name, s]) => sum(name, s)), sum('TOTAL', l.totals)];
  if (l.totals.points_after_rejection || l.totals.points_after_owner_stop || l.totals.points_after_quota_stop) {
    lines.push(`repeat calls: ${l.totals.points_after_rejection} window points after an app rejection, ${l.totals.points_after_owner_stop} after the owner's own stop, ${l.totals.points_after_quota_stop} in conversations restarted after a plan-limit stop`);
  }
  for (const c of l.calls) {
    const mark = [c.rework ?? '', c.rejected ? 'rejected' : '', c.quota_stopped ? 'quota stop' : '', c.points_method === 'in_call' ? 'lower bound' : ''].filter(Boolean).join(', ');
    lines.push(`  ${c.file.padEnd(30)} window ${String(c.points).padStart(3)}  requests ${String(c.api_calls).padStart(3)}  context median ${k(c.context.median).padStart(5)} max ${k(c.context.max).padStart(5)}  out ${k(c.tokens.output).padStart(5)}${mark ? `  [${mark}]` : ''}`);
  }
  return lines;
}
