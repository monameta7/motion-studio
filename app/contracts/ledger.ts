// Responsibility: the token-ledger contract of docs/04 (logs/token-ledger.json: what every Claude call of a job cost, read back from the raw stream logs).
import { z } from 'zod';

const count = z.number().int().nonnegative();
/** A plan window as Anthropic reports it in `rate_limit_event`: utilization 0–1 (1.01 was seen at the stop) at the first and last event of the call. */
const windowSpan = z.strictObject({ start: z.number().nonnegative().nullable(), end: z.number().nonnegative().nullable(), resets_at: z.number().int().nullable() });

export const LedgerTokens = z.strictObject({ input: count, output: count, thinking: count, cache_read: count, cache_write: count });
export type LedgerTokens = z.infer<typeof LedgerTokens>;

export const LedgerCall = z.strictObject({
  file: z.string().min(1),
  claude_stage: z.string().min(1),
  stage: z.string().min(1),
  attempt: z.number().int().positive(),
  model: z.string().nullable(),
  started_at: z.string().nullable(),
  ended_at: z.string().nullable(),
  outcome: z.enum(['ok', 'error', 'no_result']),
  quota_stopped: z.boolean(),
  turns: count,
  api_calls: count,
  tokens: LedgerTokens,
  cost_usd_est: z.number().nonnegative(),
  /** Tokens sent to the model per request (input + cache read + cache write): the first, the median, the largest, and the sum over all requests. */
  context: z.strictObject({ first: count, median: count, max: count, resent_total: count }),
  five_hour: windowSpan,
  seven_day: windowSpan,
  /** Points = percent of the five-hour window. `to_next_call`: up to the first event of the next call; `in_call`: first to last event of this call (a lower bound). */
  points: count,
  points_method: z.enum(['to_next_call', 'in_call', 'none']),
  weekly_points: count,
  tools: z.record(z.string(), count),
  images: count,
  /** The app's reason when it rejected this call's output (logs/<stage>-rejections.jsonl). */
  rejected: z.string().nullable(),
  /** Why this call was made again: the app rejected the call before it, the owner stopped it (hold, D45), or it stopped at the plan limit. */
  rework: z.enum(['after_rejection', 'after_owner_stop', 'after_quota_stop']).nullable(),
});
export type LedgerCall = z.infer<typeof LedgerCall>;

export const LedgerSum = z.strictObject({
  calls: count,
  points: count,
  weekly_points: count,
  points_after_rejection: count,
  points_after_owner_stop: count,
  points_after_quota_stop: count,
  tokens: LedgerTokens,
  cost_usd_est: z.number().nonnegative(),
});
export type LedgerSum = z.infer<typeof LedgerSum>;

export const TokenLedger = z.strictObject({
  slug: z.string().min(1),
  calls: z.array(LedgerCall),
  stages: z.record(z.string(), LedgerSum),
  totals: LedgerSum,
});
export type TokenLedger = z.infer<typeof TokenLedger>;
