/**
 * The model output boundary.
 *
 * Everything a language model returns is untrusted. It can be steered by text in
 * the brief, and it can hallucinate. Nothing crosses out of this module without
 * passing a strict schema AND being intersected against a server-side allowlist.
 *
 * The model chooses from a closed set. It does not author the set.
 */

import { z } from 'zod';

import { CATEGORIES, FORMATS } from '../scoring/types';
import type { Category, Format, ParsedBrief } from '../scoring/types';

/** Cities the index actually covers. The model cannot invent one. */
export const CITIES = [
  'new york',
  'brooklyn',
  'queens',
  'los angeles',
  'chicago',
  'atlanta',
  'austin',
  'miami',
  'seattle',
  'denver',
  'boston',
  'detroit',
  'philadelphia',
  'houston',
  'san diego',
  'washington',
] as const;

/** Interest vocabulary. Anything outside this is dropped, not trusted. */
export const INTERESTS = [
  'running', 'track', 'walking', 'hiking', 'fitness', 'pilates', 'wellness',
  'recovery', 'morning', 'gear', 'outdoors', 'surf', 'food', 'chefs', 'wine',
  'beverage', 'coffee', 'books', 'literary', 'ideas', 'quiet', 'solo', 'chess',
  'strategy', 'craft', 'ceramics', 'sewing', 'hands-on', 'slow', 'design', 'art',
  'fashion', 'streetwear', 'beauty', 'women', 'parenting', 'home',
  'sustainability', 'music', 'nightlife', 'sober', 'startups', 'networking',
  'business', 'tech', 'hosting', 'community', 'apparel',
] as const;

// ---------------------------------------------------------------------------
// Caps. Unbounded arrays and strings are a denial-of-service vector and a place
// for injected payloads to hide.
// ---------------------------------------------------------------------------

export const LIMITS = {
  briefChars: 4_000,
  interests: 8,
  categories: 6,
  cities: 5,
  formats: 4,
  avoid: 8,
  shortText: 120,
  summaryText: 240,
  /** Sanity bounds on money, enforced server side regardless of what is posted. */
  minBudgetCents: 10_000,
  maxBudgetCents: 100_000_000,
  minFlightWeeks: 1,
  maxFlightWeeks: 52,
} as const;

/**
 * The shape we ask the model for. `.strict()` so unknown keys are a parse
 * failure rather than something that quietly rides along.
 */
export const modelBriefSchema = z
  .object({
    interests: z.array(z.string().max(LIMITS.shortText)).max(LIMITS.interests * 3),
    categories: z.array(z.string().max(LIMITS.shortText)).max(LIMITS.categories * 3),
    cities: z.array(z.string().max(LIMITS.shortText)).max(LIMITS.cities * 3),
    formats: z.array(z.string().max(LIMITS.shortText)).max(LIMITS.formats * 3),
    avoid: z.array(z.string().max(LIMITS.shortText)).max(LIMITS.avoid * 3),
    audience: z.string().max(LIMITS.shortText),
    kpi: z.string().max(LIMITS.shortText),
    summary: z.string().max(LIMITS.summaryText),
  })
  .strict();

export type ModelBrief = z.infer<typeof modelBriefSchema>;

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * JSON.parse with a reviver that drops prototype-pollution keys before the
 * object is ever constructed. A model can be talked into emitting
 * `{"__proto__": {...}}`, and a plain JSON.parse will happily build it.
 */
export function safeJsonParse(raw: string): unknown {
  const cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
  return JSON.parse(cleaned, function reviver(key, value) {
    if (FORBIDDEN_KEYS.has(key)) return undefined;
    return value;
  });
}

/** Case-insensitive allowlist intersection. Unknown values are dropped silently. */
function allow<T extends string>(
  candidates: readonly string[],
  permitted: readonly T[],
  cap: number,
): T[] {
  const lookup = new Map(permitted.map((p) => [p.toLowerCase(), p]));
  const out: T[] = [];
  for (const raw of candidates) {
    const hit = lookup.get(String(raw).trim().toLowerCase());
    if (hit && !out.includes(hit)) out.push(hit);
    if (out.length >= cap) break;
  }
  return out;
}

/** Strip control characters and collapse whitespace on free text we will render. */
export function scrubText(input: string, max: number): string {
  return input
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

export interface ValidateInput {
  raw: string;
  /** Budget and flight come from typed form fields, never from the brief. */
  budgetCents: number;
  flightWeeks: number;
  /** Exclusions the buyer typed. The model may add to these, never remove them. */
  buyerAvoid: string[];
}

/**
 * Turn a raw model response into a ParsedBrief, or throw so the caller can fall
 * back to the keyword parser.
 *
 * Note what is NOT taken from the model: budget, flight length, take rate,
 * fees, or anything else that moves money. Those are caller-supplied and
 * clamped here. A successful prompt injection can produce a poor match. It
 * cannot produce a payout.
 */
export function validateModelBrief(input: ValidateInput): ParsedBrief {
  const parsed = modelBriefSchema.parse(safeJsonParse(input.raw));

  const categories = allow<Category>(parsed.categories, CATEGORIES, LIMITS.categories);
  const formats = allow<Format>(parsed.formats, FORMATS, LIMITS.formats);
  const cities = allow(parsed.cities, CITIES, LIMITS.cities);
  const interests = allow(parsed.interests, INTERESTS, LIMITS.interests);

  // The model's `avoid` is unioned with the buyer's, never allowed to replace it.
  // Exclusions are the field an injection would target to unblock a category.
  const modelAvoid = allow(parsed.avoid, [...CATEGORIES, ...INTERESTS], LIMITS.avoid);
  const avoid = Array.from(
    new Set([...input.buyerAvoid.map((a) => a.toLowerCase().trim()), ...modelAvoid]),
  ).slice(0, LIMITS.avoid);

  return {
    interests,
    categories,
    cities,
    formats,
    avoid,
    audience: scrubText(parsed.audience, LIMITS.shortText),
    kpi: scrubText(parsed.kpi, LIMITS.shortText),
    summary: scrubText(parsed.summary, LIMITS.summaryText),
    budgetCents: clampInt(
      input.budgetCents,
      LIMITS.minBudgetCents,
      LIMITS.maxBudgetCents,
    ),
    flightWeeks: clampInt(
      input.flightWeeks,
      LIMITS.minFlightWeeks,
      LIMITS.maxFlightWeeks,
    ),
    source: 'model',
  };
}

export function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}
