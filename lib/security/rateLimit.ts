/**
 * Rate limiting.
 *
 * `POST /api/brief` calls a paid API. Unprotected, it is a way for a stranger to
 * spend your money. The check-in endpoint is money-adjacent evidence. Both need
 * limits, and they need *different* failure behaviour, which is why this module
 * has policies rather than one global limiter.
 *
 * Sliding window counter: a fixed window lets someone fire the full quota at
 * 0:59 and again at 1:01. Weighting the previous window against elapsed time in
 * the current one removes that boundary burst without storing every timestamp.
 */

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export interface WindowCount {
  current: number;
  previous: number;
}

/**
 * Backing store. Production is Upstash Redis; see `upstashStore` at the bottom.
 * Tests and local dev use `MemoryStore`.
 */
export interface RateLimitStore {
  /** Increment the current window and return both window counts. */
  hit(key: string, windowSeconds: number, now: number): Promise<WindowCount>;
}

export class MemoryStore implements RateLimitStore {
  private buckets = new Map<string, number>();

  async hit(key: string, windowSeconds: number, now: number): Promise<WindowCount> {
    const win = Math.floor(now / (windowSeconds * 1000));
    const curKey = `${key}:${win}`;
    const prevKey = `${key}:${win - 1}`;

    const current = (this.buckets.get(curKey) ?? 0) + 1;
    this.buckets.set(curKey, current);

    // Drop anything two windows old so a long-lived process does not leak.
    for (const k of this.buckets.keys()) {
      const w = Number(k.slice(k.lastIndexOf(':') + 1));
      if (Number.isFinite(w) && w < win - 1) this.buckets.delete(k);
    }

    return { current, previous: this.buckets.get(prevKey) ?? 0 };
  }

  reset(): void {
    this.buckets.clear();
  }
}

// ---------------------------------------------------------------------------
// Rules and policies
// ---------------------------------------------------------------------------

export interface RateLimitRule {
  name: string;
  limit: number;
  windowSeconds: number;
}

/**
 * What to do when the limit is hit, or when the store itself is unavailable.
 *
 * - `degrade`: serve the free path instead. Used on /api/brief, where the
 *   keyword parser costs nothing and still returns a plan. The user is never
 *   staring at an error because a limiter had a bad day.
 * - `reject`: refuse. Used on anything money-adjacent, where a permissive
 *   failure is worse than an outage.
 *
 * Both FAIL CLOSED when the store is unreachable. A limiter that fails open is
 * a limiter an attacker takes offline first.
 */
export type ExceededBehaviour = 'degrade' | 'reject';

export interface RateLimitPolicy {
  rules: RateLimitRule[];
  onExceeded: ExceededBehaviour;
}

/**
 * Two tiers on the paid endpoint: a burst rule that stops rapid-fire, and a
 * sustained rule that stops a slow grind from running up a bill overnight.
 */
export const BRIEF_POLICY: RateLimitPolicy = {
  rules: [
    { name: 'burst', limit: 5, windowSeconds: 60 },
    { name: 'sustained', limit: 40, windowSeconds: 60 * 60 },
    { name: 'daily', limit: 200, windowSeconds: 60 * 60 * 24 },
  ],
  onExceeded: 'degrade',
};

/** Per check-in code. A 40-seat room does not produce 300 scans in a minute. */
export const CHECKIN_POLICY: RateLimitPolicy = {
  rules: [
    { name: 'burst', limit: 20, windowSeconds: 60 },
    { name: 'sustained', limit: 400, windowSeconds: 60 * 60 },
  ],
  onExceeded: 'reject',
};

/** Accept, decline, and other money-adjacent writes. */
export const MUTATION_POLICY: RateLimitPolicy = {
  rules: [
    { name: 'burst', limit: 10, windowSeconds: 60 },
    { name: 'sustained', limit: 120, windowSeconds: 60 * 60 },
  ],
  onExceeded: 'reject',
};

// ---------------------------------------------------------------------------
// Enforcement
// ---------------------------------------------------------------------------

export interface RateLimitResult {
  ok: boolean;
  /** Which rule denied, when ok is false. */
  rule?: string;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
  /** True when the store failed and we denied defensively. */
  storeUnavailable: boolean;
}

export interface EnforceArgs {
  store: RateLimitStore;
  policy: RateLimitPolicy;
  /** Stable caller identity. See `identify()`. */
  identifier: string;
  /** Namespaces the counters so two endpoints never share a budget. */
  scope: string;
  now?: number;
}

export async function enforce({
  store,
  policy,
  identifier,
  scope,
  now = Date.now(),
}: EnforceArgs): Promise<RateLimitResult> {
  let tightest: RateLimitResult | null = null;

  for (const rule of policy.rules) {
    const windowMs = rule.windowSeconds * 1000;
    const key = `rl:${scope}:${rule.name}:${identifier}`;

    let counts: WindowCount;
    try {
      counts = await store.hit(key, rule.windowSeconds, now);
    } catch {
      // Fail closed. An unreachable limiter is not permission to proceed.
      return {
        ok: false,
        rule: rule.name,
        limit: rule.limit,
        remaining: 0,
        resetAt: now + windowMs,
        retryAfterSeconds: rule.windowSeconds,
        storeUnavailable: true,
      };
    }

    const elapsed = now % windowMs;
    const weighted = counts.previous * (1 - elapsed / windowMs) + counts.current;
    const resetAt = now - elapsed + windowMs;
    const remaining = Math.max(0, Math.floor(rule.limit - weighted));

    const result: RateLimitResult = {
      ok: weighted <= rule.limit,
      rule: rule.name,
      limit: rule.limit,
      remaining,
      resetAt,
      retryAfterSeconds: Math.max(1, Math.ceil((resetAt - now) / 1000)),
      storeUnavailable: false,
    };

    if (!result.ok) return result;
    // Surface the tier closest to its ceiling, so headers tell the truth.
    if (!tightest || result.remaining < tightest.remaining) tightest = result;
  }

  return (
    tightest ?? {
      ok: true,
      limit: 0,
      remaining: 0,
      resetAt: now,
      retryAfterSeconds: 0,
      storeUnavailable: false,
    }
  );
}

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

/**
 * Derive a rate limit key from a request.
 *
 * `x-forwarded-for` is client-settable. On a platform that terminates at its own
 * edge (Vercel, Cloudflare) the leftmost entry is rewritten and trustworthy;
 * anywhere else it is an attacker-controlled string and using it means anyone
 * can mint unlimited identities. Prefer the platform header, and pass
 * `trustForwardedFor: false` if you are ever not behind such a proxy.
 *
 * A session id, when present, is the stronger key: it survives IP rotation.
 * Both are checked so neither alone is a bypass.
 */
export function identify(
  headers: Headers,
  opts: { sessionId?: string | null; trustForwardedFor?: boolean } = {},
): string {
  const { sessionId, trustForwardedFor = true } = opts;
  if (sessionId) return `s:${sessionId}`;

  const platformIp = headers.get('x-real-ip') ?? headers.get('cf-connecting-ip');
  if (platformIp) return `ip:${platformIp.trim()}`;

  if (trustForwardedFor) {
    const fwd = headers.get('x-forwarded-for');
    if (fwd) return `ip:${fwd.split(',')[0].trim()}`;
  }

  // Unknown callers share one bucket rather than each getting a free quota.
  return 'ip:unknown';
}

/** Standard headers so a well-behaved client can back off on its own. */
export function rateLimitHeaders(r: RateLimitResult): Record<string, string> {
  const h: Record<string, string> = {
    'RateLimit-Limit': String(r.limit),
    'RateLimit-Remaining': String(r.remaining),
    'RateLimit-Reset': String(Math.ceil((r.resetAt - Date.now()) / 1000)),
  };
  if (!r.ok) h['Retry-After'] = String(r.retryAfterSeconds);
  return h;
}

// ---------------------------------------------------------------------------
// Production store
// ---------------------------------------------------------------------------

/**
 * Upstash Redis adapter. Kept as a factory so this module imports nothing and
 * stays testable with no network.
 *
 *   import { Redis } from '@upstash/redis';
 *   const store = upstashStore(Redis.fromEnv());
 *
 * Serverless functions do not share memory between invocations, so MemoryStore
 * is dev-only. Shipping it to Vercel means no effective limit at all.
 */
export function upstashStore(redis: {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
  get(key: string): Promise<unknown>;
}): RateLimitStore {
  return {
    async hit(key, windowSeconds, now) {
      const win = Math.floor(now / (windowSeconds * 1000));
      const curKey = `${key}:${win}`;
      const prevKey = `${key}:${win - 1}`;

      const current = await redis.incr(curKey);
      if (current === 1) {
        // Keep two windows so the sliding calculation has its previous term.
        await redis.expire(curKey, windowSeconds * 2);
      }
      const raw = await redis.get(prevKey);
      return { current, previous: Number(raw ?? 0) || 0 };
    },
  };
}
