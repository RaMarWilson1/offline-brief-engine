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

let store: RateLimitStore | null = null;
let warned = false;

export function getRateLimitStore(): RateLimitStore {
  if (store) return store;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (url && token) {
    store = upstashStore(new Redis({ url, token }));
    return store;
  }

  if (process.env.NODE_ENV === 'production') {
    // Fail closed, loudly. No brief text, no secrets: just the fact.
    console.error(
      '[rateLimit] UPSTASH_REDIS_REST_URL/TOKEN unset in production. ' +
        'Every rate limited route will fail closed until they are set.',
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
