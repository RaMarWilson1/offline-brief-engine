/**
 * Rate limit store selection. Server only.
 *
 * `MemoryStore` is dev-only and this is the file that enforces it. Serverless
 * functions do not share memory between invocations, so a memory-backed limiter
 * on Vercel means every request lands on a fresh empty bucket: no limit at all,
 * with the reassuring appearance of one. That is worse than no limiter, because
 * nobody goes looking for it.
 *
 * So in production, a missing Upstash config is not "fall back to memory". It is
 * an unavailable store, and an unavailable store fails closed inside `enforce()`.
 * The misconfiguration is loud on the first request rather than silent until the
 * bill arrives.
 */

import { Redis } from '@upstash/redis';

import {
  MemoryStore,
  upstashStore,
  type RateLimitStore,
} from '../security/rateLimit';

/**
 * Every `hit` throws, so `enforce()` takes its fail-closed branch. Used in
 * production when Upstash is not configured.
 */
const unavailableStore: RateLimitStore = {
  async hit() {
    throw new Error('rate limit store is not configured');
  },
};

/**
 * The credential pairs we accept, in priority order.
 *
 * Upstash's own naming is `UPSTASH_REDIS_REST_*`, and that is what
 * `.env.example` documents and what a hand-configured instance uses. The Vercel
 * marketplace integration injects `KV_REST_API_*` instead. Same database, two
 * naming conventions, and the app has no way to prefer one at build time.
 *
 * Reading only the first pair is how a deploy ends up looking totally broken:
 * the store resolves to unavailable, every policy fails closed, and `/api/plan`
 * returns 429 on every request while `/api/brief` silently never reaches the
 * model. That is correct fail-closed behaviour reacting to a naming mismatch,
 * which is the worst kind of outage to debug because nothing is actually wrong.
 *
 * Pairs are resolved together, never field by field. Mixing a URL from one pair
 * with a token from another would build a client that fails per-request instead
 * of at startup.
 *
 * `KV_REST_API_READ_ONLY_TOKEN` is deliberately not a candidate: the sliding
 * window counter calls INCR, so a read-only token would fail on every write.
 */
const CREDENTIAL_PAIRS: ReadonlyArray<{ url: string; token: string }> = [
  { url: 'UPSTASH_REDIS_REST_URL', token: 'UPSTASH_REDIS_REST_TOKEN' },
  { url: 'KV_REST_API_URL', token: 'KV_REST_API_TOKEN' },
];

function resolveCredentials():
  | { url: string; token: string; via: string }
  | null {
  for (const pair of CREDENTIAL_PAIRS) {
    const url = process.env[pair.url];
    const token = process.env[pair.token];
    if (url && token) return { url, token, via: `${pair.url}/${pair.token}` };
  }
  return null;
}

let store: RateLimitStore | null = null;
let warned = false;

export function getRateLimitStore(): RateLimitStore {
  if (store) return store;

  const creds = resolveCredentials();

  if (creds) {
    // Name only, never the value. Which pair won is the first thing you want to
    // know when a deploy behaves unexpectedly.
    console.info(`[rateLimit] Upstash store configured via ${creds.via}`);
    store = upstashStore(new Redis({ url: creds.url, token: creds.token }));
    return store;
  }

  if (process.env.NODE_ENV === 'production') {
    // Fail closed, loudly. No brief text, no secrets: just the fact.
    console.error(
      '[rateLimit] No Upstash credentials in production. Looked for ' +
        CREDENTIAL_PAIRS.map((p) => `${p.url}/${p.token}`).join(' then ') +
        '. Every rate limited route will fail closed until one pair is set.',
    );
    store = unavailableStore;
    return store;
  }

  if (!warned) {
    warned = true;
    console.warn(
      '[rateLimit] Using MemoryStore. Dev only: serverless instances do not ' +
        'share memory, so this is not a limiter in production.',
    );
  }
  store = new MemoryStore();
  return store;
}
