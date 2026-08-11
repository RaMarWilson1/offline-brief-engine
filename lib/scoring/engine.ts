/**
 * The matching engine.
 *
 * Deterministic by design. No model touches ranking or allocation. An ad network
 * sells the ranking, so the ranking has to survive a brand asking why they paid
 * for a room. Every number below can be traced back to an input.
 */

import type {
  BandKey,
  BandScores,
  Category,
  Community,
  ParsedBrief,
  Placement,
  Plan,
  RejectedCommunity,
  ScoredCommunity,
} from './types';

// ---------------------------------------------------------------------------
// Tunables. These are the levers an ops user is allowed to move.
// ---------------------------------------------------------------------------

export interface BandSpec {
  key: BandKey;
  /** Single letter shown under the equalizer in the UI. */
  label: string;
  name: string;
  weight: number;
}

export const BANDS: readonly BandSpec[] = [
  { key: 'aud', label: 'A', name: 'Audience fit', weight: 0.3 },
  { key: 'geo', label: 'G', name: 'Geography', weight: 0.2 },
  { key: 'fmt', label: 'F', name: 'Format match', weight: 0.14 },
  { key: 'eff', label: 'E', name: 'Cost efficiency', weight: 0.18 },
  { key: 'mom', label: 'M', name: 'Momentum', weight: 0.12 },
  { key: 'saf', label: 'S', name: 'Brand safety', weight: 0.06 },
] as const;

/** Nothing below this score is worth a brand's money. */
export const FLOOR = 55;

/** How far below the lead match we will still buy. Stops budget padding. */
export const CLIFF = 22;

/** Platform take. The host keeps the rest. */
export const TAKE_RATE = 0.18;

/** Metro adjacency, so a Brooklyn brief still reaches Queens. */
const METRO_NEIGHBOURS: Record<string, string[]> = {
  'new york': ['brooklyn', 'queens'],
  brooklyn: ['new york', 'queens'],
  queens: ['new york', 'brooklyn'],
};

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

const norm = (s: string): string => s.trim().toLowerCase();

/** Loose containment match, so "running" hits "run club". */
const overlaps = (a: string, b: string): boolean =>
  a.includes(b) || b.includes(a);

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/**
 * Score one community against one brief across six weighted bands.
 * Every subscore is 0..1 so the equalizer in the UI reads honestly.
 */
export function scoreCommunity(
  community: Community,
  brief: ParsedBrief,
): ScoredCommunity {
  const wantedInterests = brief.interests.map(norm);
  const heldInterests = community.interests.map(norm);
  const wantedCategories = brief.categories.map(norm);
  const category = norm(community.category);

  // A — audience fit. Interest overlap, plus a bump when the brief names this
  // category outright. Softened so one strong hit still registers.
  let hits = 0;
  for (const want of wantedInterests) {
    if (heldInterests.some((held) => overlaps(held, want))) hits += 1;
  }
  const interestScore = wantedInterests.length
    ? hits / wantedInterests.length
    : 0.5;
  const categoryBump = wantedCategories.some((c) => overlaps(c, category))
    ? 0.25
    : 0;
  const aud = clamp01(interestScore * 0.85 + categoryBump);

  // G — geography. Exact city, then metro adjacency, then near-nothing.
  const cities = brief.cities.map(norm);
  const city = norm(community.city);
  let geo: number;
  if (cities.length === 0) geo = 0.6;
  else if (cities.includes(city)) geo = 1;
  else if (cities.some((c) => (METRO_NEIGHBOURS[c] ?? []).includes(city)))
    geo = 0.82;
  else geo = 0.18;

  // F — can this host actually deliver the formats the brief asked for.
  const wantedFormats = brief.formats.map(norm);
  const fmt = wantedFormats.length
    ? clamp01(
        wantedFormats.filter((want) =>
          community.formats.some((held) => overlaps(norm(held), want)),
        ).length / wantedFormats.length,
      )
    : 0.7;

  // E — cost per VERIFIED attendee, not per body the host claims. Check-in rate
  // is the honest denominator: a 900-person market at 42% is worse inventory
  // than a 40-seat dinner at 93%.
  const verified = community.attendance * community.checkInRate;
  const cpaCents = community.feeCents / Math.max(verified, 1);
  const cpaDollars = cpaCents / 100;
  const eff = clamp01(1 - (cpaDollars - 15) / 145);

  // M — momentum. Waitlist pressure plus cadence. Demand a host cannot serve is
  // the clearest signal that a brand showing up is welcome rather than intrusive.
  const mom = clamp01(
    ((community.waitlistRatio - 0.8) / 3.0) * 0.7 +
      (Math.min(community.eventsPerMonth, 4) / 4) * 0.3,
  );

  // S — safety, zeroed when the brief excluded this category outright.
  const conflict = brief.avoid.some((raw) => {
    const a = norm(raw);
    return (
      overlaps(category, a) || heldInterests.some((held) => overlaps(held, a))
    );
  });
  const saf = conflict ? 0 : community.brandSafety;

  const parts: BandScores = { aud, geo, fmt, eff, mom, saf };
  const total = BANDS.reduce((sum, band) => sum + parts[band.key] * band.weight, 0);

  return {
    ...community,
    parts,
    score: Math.round(total * 100),
    verified,
    cpaCents,
    conflict,
  };
}

// ---------------------------------------------------------------------------
// Allocation
// ---------------------------------------------------------------------------

/**
 * Build a plan from a brief.
 *
 * The allocator is allowed to underspend. A greedy fill keeps buying down the
 * ranking until the budget is gone, which is how a brand ends up paying for a
 * sewing circle to launch a running shoe. FLOOR and CLIFF stop that.
 */
export function buildPlan(
  communities: readonly Community[],
  brief: ParsedBrief,
): Plan {
  const scored = communities
    .map((c) => scoreCommunity(c, brief))
    .sort((a, b) => b.score - a.score);

  const lead = scored.length > 0 ? scored[0].score : 0;
  const placements: Placement[] = [];
  const rejected: RejectedCommunity[] = [];
  let spendCents = 0;

  const reject = (c: ScoredCommunity, reason: string): void => {
    rejected.push({ ...c, reason });
  };

  for (const c of scored) {
    if (c.conflict) {
      reject(c, 'Category excluded by the brief');
      continue;
    }
    if (c.score < FLOOR) {
      reject(c, `Match ${c.score} is under the ${FLOOR} floor`);
      continue;
    }
    if (lead - c.score > CLIFF) {
      reject(
        c,
        `${lead - c.score} points behind the lead match, outside the ${CLIFF}-point cliff`,
      );
      continue;
    }
    if (spendCents + c.feeCents > brief.budgetCents) {
      reject(
        c,
        `Needs ${fmtCents(c.feeCents)}, only ${fmtCents(brief.budgetCents - spendCents)} left`,
      );
      continue;
    }

    const projectedClicks = c.verified * c.ctr;
    const { platformFeeCents, hostPayoutCents } = splitFee(c.feeCents);
    placements.push({
      ...c,
      rank: placements.length + 1,
      hostPayoutCents,
      platformFeeCents,
      projectedClicks,
      projectedConversions: projectedClicks * c.cvr,
    });
    spendCents += c.feeCents;
  }

  const grossSeats = placements.reduce((s, p) => s + p.attendance, 0);
  const verifiedReach = placements.reduce((s, p) => s + p.verified, 0);
  const projectedClicks = placements.reduce((s, p) => s + p.projectedClicks, 0);
  const projectedConversions = placements.reduce(
    (s, p) => s + p.projectedConversions,
    0,
  );

  return {
    placements,
    rejected,
    spendCents,
    heldBackCents: brief.budgetCents - spendCents,
    grossSeats,
    verifiedReach,
    projectedClicks,
    projectedConversions,
    blendedCheckInRate: grossSeats > 0 ? verifiedReach / grossSeats : 0,
    cpaCents: verifiedReach > 0 ? spendCents / verifiedReach : 0,
    cpcCents: projectedClicks > 0 ? spendCents / projectedClicks : 0,
    cpConversionCents:
      projectedConversions > 0 ? spendCents / projectedConversions : 0,
    hostPayoutCents: placements.reduce((s, p) => s + p.hostPayoutCents, 0),
    platformRevenueCents: placements.reduce((s, p) => s + p.platformFeeCents, 0),
    takeRate: TAKE_RATE,
  };
}

/**
 * Blended network rates across the whole index, weighted by volume.
 *
 * This is how a real network reports itself, and it is what the calibration test
 * asserts against. Per-community averages would flatter small high-performing
 * rooms and misstate the network.
 */
export function blendedRates(communities: readonly Community[]): {
  checkInRate: number;
  ctr: number;
  cvr: number;
} {
  const seats = communities.reduce((s, c) => s + c.attendance, 0);
  const verified = communities.reduce(
    (s, c) => s + c.attendance * c.checkInRate,
    0,
  );
  const clicks = communities.reduce(
    (s, c) => s + c.attendance * c.checkInRate * c.ctr,
    0,
  );
  const conversions = communities.reduce(
    (s, c) => s + c.attendance * c.checkInRate * c.ctr * c.cvr,
    0,
  );
  return {
    checkInRate: seats > 0 ? verified / seats : 0,
    ctr: verified > 0 ? clicks / verified : 0,
    cvr: clicks > 0 ? conversions / clicks : 0,
  };
}

/**
 * Split a fee between platform and host.
 *
 * Derived remainder, not two independent roundings. Rounding both sides
 * separately creates a cent out of nothing on some fees: at an 18% take, a
 * 25-cent fee rounds to 21 + 5 = 26. That is a reconciliation bug that only
 * surfaces once fees stop being round dollars, which is exactly when it is
 * hardest to find. The host absorbs the sub-cent remainder, never the ledger.
 */
export function splitFee(feeCents: number): {
  platformFeeCents: number;
  hostPayoutCents: number;
} {
  if (!Number.isInteger(feeCents) || feeCents < 0) {
    throw new RangeError(`feeCents must be a non-negative integer, got ${feeCents}`);
  }
  const platformFeeCents = Math.round(feeCents * TAKE_RATE);
  return { platformFeeCents, hostPayoutCents: feeCents - platformFeeCents };
}

export function fmtCents(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString()}`;
}

/**
 * Mint a check-in code.
 *
 * The earlier version derived this from plan and community IDs, which made it
 * enumerable: guess a plan prefix and you can forge check-ins across every
 * placement in it. Codes are now unguessable capability tokens.
 *
 * Store `hash`, hand out `code`. A database leak should not yield working codes.
 * And per docs/SECURITY.md, a check-in is evidence of attendance, never a
 * trigger that releases funds on its own.
 */
export function mintCheckInCode(randomBytes: Uint8Array): string {
  if (randomBytes.length < 16) {
    throw new RangeError('check-in codes need at least 128 bits of entropy');
  }
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no I/L/O/0/1, read at a door
  let out = '';
  for (const byte of randomBytes.slice(0, 12)) {
    out += alphabet[byte % alphabet.length];
  }
  return `OFL-${out.slice(0, 4)}-${out.slice(4, 8)}-${out.slice(8, 12)}`;
}
