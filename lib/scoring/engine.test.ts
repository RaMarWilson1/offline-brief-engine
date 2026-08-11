import { describe, expect, it } from 'vitest';

import { COMMUNITY_INDEX } from '../../db/seed';
import {
  BANDS,
  CLIFF,
  FLOOR,
  TAKE_RATE,
  blendedRates,
  buildPlan,
  scoreCommunity,
} from './engine';
import type { Category, ParsedBrief } from './types';

function brief(over: Partial<ParsedBrief> = {}): ParsedBrief {
  return {
    interests: ['running', 'fitness', 'morning'],
    categories: ['run club'],
    cities: ['new york', 'brooklyn'],
    formats: ['sampling'],
    avoid: [],
    audience: '25-35',
    kpi: 'product trial',
    summary: 'test brief',
    budgetCents: 1_800_000,
    flightWeeks: 6,
    source: 'fallback',
    ...over,
  };
}

describe('band configuration', () => {
  it('weights sum to exactly 1', () => {
    const total = BANDS.reduce((s, b) => s + b.weight, 0);
    expect(total).toBeCloseTo(1, 10);
  });

  it('every band has a distinct key and label', () => {
    expect(new Set(BANDS.map((b) => b.key)).size).toBe(BANDS.length);
    expect(new Set(BANDS.map((b) => b.label)).size).toBe(BANDS.length);
  });
});

describe('scoreCommunity', () => {
  it('keeps every subscore inside 0..1 and the total inside 0..100', () => {
    for (const c of COMMUNITY_INDEX) {
      const s = scoreCommunity(c, brief());
      for (const band of BANDS) {
        expect(s.parts[band.key]).toBeGreaterThanOrEqual(0);
        expect(s.parts[band.key]).toBeLessThanOrEqual(1);
      }
      expect(s.score).toBeGreaterThanOrEqual(0);
      expect(s.score).toBeLessThanOrEqual(100);
    }
  });

  it('is deterministic', () => {
    const a = COMMUNITY_INDEX.map((c) => scoreCommunity(c, brief()).score);
    const b = COMMUNITY_INDEX.map((c) => scoreCommunity(c, brief()).score);
    expect(a).toEqual(b);
  });

  it('scores an exact-city match above an out-of-market one', () => {
    const nyc = COMMUNITY_INDEX.find((c) => c.city === 'New York')!;
    const far = COMMUNITY_INDEX.find((c) => c.city === 'Seattle')!;
    const b = brief({ cities: ['new york'] });
    expect(scoreCommunity(nyc, b).parts.geo).toBeGreaterThan(
      scoreCommunity(far, b).parts.geo,
    );
  });

  it('flags a conflict and zeroes safety when the brief excludes a category', () => {
    const target = COMMUNITY_INDEX.find((c) => c.category === 'run club')!;
    const s = scoreCommunity(target, brief({ avoid: ['run club'] }));
    expect(s.conflict).toBe(true);
    expect(s.parts.saf).toBe(0);
  });

  it('prices on verified attendance, not claimed seats', () => {
    const c = COMMUNITY_INDEX[0];
    const s = scoreCommunity(c, brief());
    expect(s.verified).toBeCloseTo(c.attendance * c.checkInRate, 6);
    expect(s.verified).toBeLessThan(c.attendance);
  });
});

describe('buildPlan', () => {
  it('never overspends the budget', () => {
    for (const budgetCents of [150_000, 900_000, 1_800_000, 5_000_000]) {
      const plan = buildPlan(COMMUNITY_INDEX, brief({ budgetCents }));
      expect(plan.spendCents).toBeLessThanOrEqual(budgetCents);
      expect(plan.heldBackCents).toBe(budgetCents - plan.spendCents);
    }
  });

  it('splits every dollar between host and platform at the take rate', () => {
    const plan = buildPlan(COMMUNITY_INDEX, brief());
    expect(plan.hostPayoutCents + plan.platformRevenueCents).toBeCloseTo(
      plan.spendCents,
      0,
    );
    expect(plan.platformRevenueCents / plan.spendCents).toBeCloseTo(
      TAKE_RATE,
      2,
    );
  });

  it('keeps the funnel monotonic: conversions <= clicks <= verified <= seats', () => {
    const plan = buildPlan(COMMUNITY_INDEX, brief());
    expect(plan.projectedConversions).toBeLessThanOrEqual(plan.projectedClicks);
    expect(plan.projectedClicks).toBeLessThanOrEqual(plan.verifiedReach);
    expect(plan.verifiedReach).toBeLessThanOrEqual(plan.grossSeats);
  });

  it('admits nothing under the floor', () => {
    const plan = buildPlan(COMMUNITY_INDEX, brief({ budgetCents: 50_000_000 }));
    for (const p of plan.placements) expect(p.score).toBeGreaterThanOrEqual(FLOOR);
  });

  it('holds budget back rather than buying past the relevance cliff', () => {
    // Budget far exceeds what the brief can justify buying.
    const plan = buildPlan(COMMUNITY_INDEX, brief({ budgetCents: 50_000_000 }));
    expect(plan.heldBackCents).toBeGreaterThan(0);

    const lead = plan.placements[0].score;
    for (const p of plan.placements) expect(lead - p.score).toBeLessThanOrEqual(CLIFF);

    // And the reason surfaced to the buyer is the cliff, not a silent drop.
    expect(plan.rejected.some((r) => r.reason.includes('cliff'))).toBe(true);
  });

  it('never places a community the brief excluded', () => {
    const plan = buildPlan(
      COMMUNITY_INDEX,
      brief({ avoid: ['run club'], budgetCents: 50_000_000 }),
    );
    for (const p of plan.placements) expect(p.category).not.toBe('run club');
  });

  it('returns an empty plan rather than a bad one when nothing fits', () => {
    const plan = buildPlan(
      COMMUNITY_INDEX,
      brief({ cities: ['nowhere'], interests: ['nothing'], categories: [], budgetCents: 100 }),
    );
    expect(plan.placements).toHaveLength(0);
    expect(plan.spendCents).toBe(0);
    expect(plan.cpaCents).toBe(0);
    expect(Number.isNaN(plan.cpConversionCents)).toBe(false);
  });

  it('ranks placements in descending score order', () => {
    const plan = buildPlan(COMMUNITY_INDEX, brief());
    const scores = plan.placements.map((p) => p.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    expect(plan.placements.map((p) => p.rank)).toEqual(
      plan.placements.map((_, i) => i + 1),
    );
  });
});

/**
 * Calibration.
 *
 * The index is synthetic, but it is not arbitrary. If the seed drifts away from
 * realistic network rates, every cost figure the app quotes drifts with it. These
 * assertions are the reason a reader can trust the plan's arithmetic.
 */
describe('index calibration', () => {
  const TARGET = { checkInRate: 0.93, ctr: 0.48, cvr: 0.11 };
  const TOLERANCE = 0.03;

  it('blended network rates sit within tolerance of the published figures', () => {
    const rates = blendedRates(COMMUNITY_INDEX);
    expect(Math.abs(rates.checkInRate - TARGET.checkInRate)).toBeLessThan(TOLERANCE);
    expect(Math.abs(rates.ctr - TARGET.ctr)).toBeLessThan(TOLERANCE);
    expect(Math.abs(rates.cvr - TARGET.cvr)).toBeLessThan(TOLERANCE);
  });

  it('mirrors the real category mix, with run clubs as the deep end', () => {
    const counts = new Map<Category, number>();
    for (const c of COMMUNITY_INDEX) {
      counts.set(c.category, (counts.get(c.category) ?? 0) + 1);
    }
    const runShare = (counts.get('run club') ?? 0) / COMMUNITY_INDEX.length;
    expect(runShare).toBeGreaterThan(0.3);

    const ordered = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    expect(ordered[0][0]).toBe('run club');
  });

  it('holds every rate inside a plausible range', () => {
    for (const c of COMMUNITY_INDEX) {
      expect(c.checkInRate).toBeGreaterThan(0.5);
      expect(c.checkInRate).toBeLessThanOrEqual(1);
      expect(c.ctr).toBeGreaterThan(0);
      expect(c.ctr).toBeLessThanOrEqual(1);
      expect(c.cvr).toBeGreaterThan(0);
      expect(c.cvr).toBeLessThanOrEqual(1);
      expect(c.feeCents).toBeGreaterThan(0);
      expect(Number.isInteger(c.feeCents)).toBe(true);
    }
  });
});
