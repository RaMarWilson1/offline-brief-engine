/**
 * Shared types for the matching engine.
 *
 * This module is pure: no I/O, no network, no database. Everything here must be
 * constructible in a test without standing anything up.
 */

/** The six categories the index is organised by. */
export const CATEGORIES = [
  'run club',
  'walking club',
  'social club',
  'girl group',
  'book club',
  'mom group',
] as const;

export type Category = (typeof CATEGORIES)[number];

/** The activation shapes a host can offer a brand. */
export const FORMATS = [
  'sampling',
  'co-host',
  'product integration',
  'venue takeover',
] as const;

export type Format = (typeof FORMATS)[number];

export interface Community {
  id: string;
  name: string;
  city: string;
  category: Category;
  /** Free-text interest tags used for audience matching. */
  interests: string[];
  /** Typical bodies in the room at one event. */
  attendance: number;
  eventsPerMonth: number;
  ageRange: string;
  /** Share of attendees who actually scan in at the door. 0..1 */
  checkInRate: number;
  /** Share of checked-in attendees who click the post-event link. 0..1 */
  ctr: number;
  /** Share of clickers who convert. 0..1 */
  cvr: number;
  /** Host fee for one placement, in integer cents. */
  feeCents: number;
  /** 0..1, higher is safer. Used as a light tiebreaker, not a gate. */
  brandSafety: number;
  /** Waitlist to capacity ratio. Demand the host cannot serve. */
  waitlistRatio: number;
  formats: Format[];
  /** Brand categories this community has hosted before. */
  pastCategories: string[];
}

/** What the intake layer produces from a brand's free-text brief. */
export interface ParsedBrief {
  interests: string[];
  categories: Category[];
  cities: string[];
  formats: Format[];
  /** Category words the brand does not want to sit next to. */
  avoid: string[];
  audience: string;
  kpi: string;
  summary: string;
  budgetCents: number;
  flightWeeks: number;
  /** Whether a model or the keyword fallback produced this. */
  source: 'model' | 'fallback';
}

export type BandKey = 'aud' | 'geo' | 'fmt' | 'eff' | 'mom' | 'saf';

export type BandScores = Record<BandKey, number>;

export interface ScoredCommunity extends Community {
  /** Per-band subscores, each 0..1. */
  parts: BandScores;
  /** Weighted total, 0..100. */
  score: number;
  /** Attendees expected to actually scan in, per event. */
  verified: number;
  /** Cost per verified attendee, in cents. */
  cpaCents: number;
  /** True when the brief explicitly excluded this community's category. */
  conflict: boolean;
}

export interface RejectedCommunity extends ScoredCommunity {
  /** Buyer-readable reason this did not make the plan. */
  reason: string;
}

export interface Placement extends ScoredCommunity {
  rank: number;
  hostPayoutCents: number;
  platformFeeCents: number;
  projectedClicks: number;
  projectedConversions: number;
  /** Filled in later by the prose layer. Never affects ranking. */
  rationale?: string;
}

export interface Plan {
  placements: Placement[];
  rejected: RejectedCommunity[];
  spendCents: number;
  /** Budget deliberately not allocated. Underspend is a valid outcome. */
  heldBackCents: number;
  grossSeats: number;
  verifiedReach: number;
  projectedClicks: number;
  projectedConversions: number;
  blendedCheckInRate: number;
  cpaCents: number;
  cpcCents: number;
  cpConversionCents: number;
  hostPayoutCents: number;
  platformRevenueCents: number;
  takeRate: number;
}
