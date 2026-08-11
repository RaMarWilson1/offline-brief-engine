import { beforeEach, describe, expect, it } from 'vitest';

import {
  BRIEF_POLICY,
  CHECKIN_POLICY,
  MemoryStore,
  type RateLimitStore,
  enforce,
  identify,
  rateLimitHeaders,
} from './rateLimit';

let store: MemoryStore;
const T0 = 1_800_000_000_000; // fixed clock, no wall-time flake

beforeEach(() => {
  store = new MemoryStore();
});

const call = (identifier: string, now: number, policy = BRIEF_POLICY) =>
  enforce({ store, policy, identifier, scope: 'brief', now });

describe('enforce', () => {
  it('allows traffic under the burst limit', async () => {
    for (let i = 0; i < BRIEF_POLICY.rules[0].limit; i += 1) {
      const r = await call('ip:1.1.1.1', T0);
      expect(r.ok).toBe(true);
    }
  });

  it('denies the request past the burst limit and names the rule', async () => {
    const burst = BRIEF_POLICY.rules[0].limit;
    for (let i = 0; i < burst; i += 1) await call('ip:1.1.1.1', T0);
    const r = await call('ip:1.1.1.1', T0);
    expect(r.ok).toBe(false);
    expect(r.rule).toBe('burst');
    expect(r.remaining).toBe(0);
    expect(r.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('keeps identities independent', async () => {
    for (let i = 0; i < BRIEF_POLICY.rules[0].limit + 2; i += 1) {
      await call('ip:1.1.1.1', T0);
    }
    expect((await call('ip:2.2.2.2', T0)).ok).toBe(true);
  });

  it('keeps scopes independent so two endpoints never share a budget', async () => {
    for (let i = 0; i < BRIEF_POLICY.rules[0].limit + 2; i += 1) {
      await enforce({ store, policy: BRIEF_POLICY, identifier: 'ip:1', scope: 'brief', now: T0 });
    }
    const other = await enforce({
      store, policy: BRIEF_POLICY, identifier: 'ip:1', scope: 'checkin', now: T0,
    });
    expect(other.ok).toBe(true);
  });

  it('recovers after the window passes', async () => {
    const burst = BRIEF_POLICY.rules[0].limit;
    for (let i = 0; i < burst + 1; i += 1) await call('ip:1.1.1.1', T0);
    expect((await call('ip:1.1.1.1', T0)).ok).toBe(false);

    // Two windows later, both the current and previous counters are clear.
    const later = T0 + BRIEF_POLICY.rules[0].windowSeconds * 1000 * 2;
    expect((await call('ip:1.1.1.1', later)).ok).toBe(true);
  });

  it('closes the fixed-window boundary burst', async () => {
    const rule = BRIEF_POLICY.rules[0];
    const windowMs = rule.windowSeconds * 1000;
    // Align to a window edge, spend the whole quota at the very end of it.
    const edge = Math.floor(T0 / windowMs) * windowMs;
    const lateInWindow = edge + windowMs - 1_000;
    for (let i = 0; i < rule.limit; i += 1) await call('ip:9.9.9.9', lateInWindow);

    // A naive fixed window resets here and would grant a second full quota.
    const justAfter = edge + windowMs + 1_000;
    const r = await call('ip:9.9.9.9', justAfter);
    expect(r.ok).toBe(false);
  });

  it('fails closed when the store is unreachable', async () => {
    const broken: RateLimitStore = {
      hit: async () => {
        throw new Error('redis down');
      },
    };
    const r = await enforce({
      store: broken, policy: CHECKIN_POLICY, identifier: 'ip:1', scope: 'checkin', now: T0,
    });
    expect(r.ok).toBe(false);
    expect(r.storeUnavailable).toBe(true);
  });

  it('reports the tier closest to its ceiling, not the loosest', async () => {
    const r = await call('ip:3.3.3.3', T0);
    expect(r.rule).toBe('burst');
    expect(r.limit).toBe(BRIEF_POLICY.rules[0].limit);
  });
});

describe('policies', () => {
  it('degrades the paid endpoint and rejects money-adjacent ones', () => {
    // /api/brief falls back to the free keyword parser instead of erroring.
    expect(BRIEF_POLICY.onExceeded).toBe('degrade');
    // Check-ins are evidence. A permissive failure is worse than an outage.
    expect(CHECKIN_POLICY.onExceeded).toBe('reject');
  });

  it('layers a burst rule under a sustained one on the paid endpoint', () => {
    const [burst, sustained] = BRIEF_POLICY.rules;
    expect(burst.windowSeconds).toBeLessThan(sustained.windowSeconds);
    expect(burst.limit).toBeLessThan(sustained.limit);
  });
});

describe('identify', () => {
  const h = (o: Record<string, string>) => new Headers(o);

  it('prefers a session id, which survives IP rotation', () => {
    const id = identify(h({ 'x-real-ip': '1.1.1.1' }), { sessionId: 'abc' });
    expect(id).toBe('s:abc');
  });

  it('prefers the platform header over the client-settable one', () => {
    const id = identify(h({ 'x-real-ip': '1.1.1.1', 'x-forwarded-for': '9.9.9.9' }));
    expect(id).toBe('ip:1.1.1.1');
  });

  it('ignores x-forwarded-for entirely when it is not trustworthy', () => {
    // Off a trusted proxy this header is an attacker-supplied string, and
    // honouring it lets one caller mint unlimited identities.
    const id = identify(h({ 'x-forwarded-for': '9.9.9.9' }), { trustForwardedFor: false });
    expect(id).toBe('ip:unknown');
  });

  it('buckets unknown callers together rather than giving each a free quota', () => {
    expect(identify(h({}))).toBe('ip:unknown');
  });
});

describe('rateLimitHeaders', () => {
  it('adds Retry-After only when denied', async () => {
    const allowed = await call('ip:4.4.4.4', T0);
    expect(rateLimitHeaders(allowed)['Retry-After']).toBeUndefined();

    for (let i = 0; i < BRIEF_POLICY.rules[0].limit; i += 1) await call('ip:4.4.4.4', T0);
    const denied = await call('ip:4.4.4.4', T0);
    expect(rateLimitHeaders(denied)['Retry-After']).toBeDefined();
  });
});
