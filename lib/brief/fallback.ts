/**
 * The keyword parser.
 *
 * This is the reason the product still works on the model's worst day. Every
 * LLM call in this app has a deterministic fallback, and this is it: no network,
 * no API key, no database. A media buyer staring at a spinner because an API had
 * a bad afternoon is a broken product.
 *
 * It runs on three paths:
 *   - the Anthropic call failed, timed out, or returned something unparseable
 *   - `ANTHROPIC_API_KEY` is unset
 *   - the caller is rate limited, and BRIEF_POLICY degrades rather than rejecting
 *
 * Pure by construction. Same rules as `lib/scoring/`: no I/O, no fetch, no db.
 *
 * It reads the same closed vocabulary the model is allowed to pick from, so a
 * fallback plan and a model plan are drawn from the same set. Only the reading
 * of the brief differs, which is exactly what the UI tells the buyer.
 */

import { CATEGORIES, FORMATS } from '../scoring/types';
import type { Category, Format, ParsedBrief } from '../scoring/types';
import {
  CITIES,
  INTERESTS,
  LIMITS,
  clampInt,
  scrubText,
} from '../security/briefSchema';

// ---------------------------------------------------------------------------
// Vocabulary aliases
//
// The model gets the canonical lists in its prompt and can map "runners" to
// "run club" on its own. A keyword parser cannot, so the aliases are spelled
// out. Everything here resolves to a value already in the allowlist: this table
// widens what we recognise, never what we can emit.
// ---------------------------------------------------------------------------

type Alias<T extends string> = { term: string; value: T };

const CITY_ALIASES: Alias<(typeof CITIES)[number]>[] = [
  { term: 'nyc', value: 'new york' },
  { term: 'new york city', value: 'new york' },
  { term: 'manhattan', value: 'new york' },
  { term: 'bk', value: 'brooklyn' },
  { term: 'la', value: 'los angeles' },
  { term: 'l.a.', value: 'los angeles' },
  { term: 'atl', value: 'atlanta' },
  { term: 'philly', value: 'philadelphia' },
  { term: 'dc', value: 'washington' },
  { term: 'd.c.', value: 'washington' },
  { term: 'washington dc', value: 'washington' },
];

const CATEGORY_ALIASES: Alias<Category>[] = [
  { term: 'run', value: 'run club' },
  { term: 'runs', value: 'run club' },
  { term: 'running', value: 'run club' },
  { term: 'runner', value: 'run club' },
  { term: 'runners', value: 'run club' },
  { term: 'jog', value: 'run club' },
  { term: 'jogging', value: 'run club' },
  { term: '5k', value: 'run club' },
  { term: '10k', value: 'run club' },
  { term: 'marathon', value: 'run club' },
  { term: 'track club', value: 'run club' },
  { term: 'pace group', value: 'run club' },

  { term: 'walk', value: 'walking club' },
  { term: 'walks', value: 'walking club' },
  { term: 'walking', value: 'walking club' },
  { term: 'walkers', value: 'walking club' },
  { term: 'hike', value: 'walking club' },
  { term: 'hiking', value: 'walking club' },

  { term: 'social', value: 'social club' },
  { term: 'supper', value: 'social club' },
  { term: 'supper club', value: 'social club' },
  { term: 'dinner', value: 'social club' },
  { term: 'dinners', value: 'social club' },
  { term: 'chess', value: 'social club' },
  { term: 'ceramics', value: 'social club' },
  { term: 'pottery', value: 'social club' },

  { term: 'women', value: 'girl group' },
  { term: "women's", value: 'girl group' },
  { term: 'womens', value: 'girl group' },
  { term: 'female', value: 'girl group' },
  { term: 'girl', value: 'girl group' },
  { term: 'girls', value: 'girl group' },

  { term: 'book', value: 'book club' },
  { term: 'books', value: 'book club' },
  { term: 'reading', value: 'book club' },
  { term: 'readers', value: 'book club' },
  { term: 'literary', value: 'book club' },

  { term: 'mom', value: 'mom group' },
  { term: 'moms', value: 'mom group' },
  { term: 'mother', value: 'mom group' },
  { term: 'mothers', value: 'mom group' },
  { term: 'parent', value: 'mom group' },
  { term: 'parents', value: 'mom group' },
  { term: 'parenting', value: 'mom group' },
  { term: 'stroller', value: 'mom group' },
];

const FORMAT_ALIASES: Alias<Format>[] = [
  { term: 'sample', value: 'sampling' },
  { term: 'samples', value: 'sampling' },
  { term: 'sampling', value: 'sampling' },
  { term: 'seeding', value: 'sampling' },
  { term: 'giveaway', value: 'sampling' },
  { term: 'giveaways', value: 'sampling' },
  { term: 'hand out', value: 'sampling' },
  { term: 'handout', value: 'sampling' },

  { term: 'co-host', value: 'co-host' },
  { term: 'cohost', value: 'co-host' },
  { term: 'co host', value: 'co-host' },
  { term: 'partner', value: 'co-host' },
  { term: 'partnership', value: 'co-host' },
  { term: 'collab', value: 'co-host' },
  { term: 'collaboration', value: 'co-host' },

  { term: 'product integration', value: 'product integration' },
  { term: 'integration', value: 'product integration' },
  { term: 'integrate', value: 'product integration' },
  { term: 'product placement', value: 'product integration' },
  { term: 'built into', value: 'product integration' },

  { term: 'venue takeover', value: 'venue takeover' },
  { term: 'takeover', value: 'venue takeover' },
  { term: 'take over', value: 'venue takeover' },
  { term: 'venue', value: 'venue takeover' },
];

const INTEREST_ALIASES: Alias<(typeof INTERESTS)[number]>[] = [
  { term: 'runners', value: 'running' },
  { term: 'runner', value: 'running' },
  { term: 'jogging', value: 'running' },
  { term: 'wellbeing', value: 'wellness' },
  { term: 'well-being', value: 'wellness' },
  { term: 'health', value: 'wellness' },
  { term: 'skincare', value: 'beauty' },
  { term: 'cosmetics', value: 'beauty' },
  { term: 'makeup', value: 'beauty' },
  { term: 'sneaker', value: 'apparel' },
  { term: 'sneakers', value: 'apparel' },
  { term: 'shoe', value: 'apparel' },
  { term: 'shoes', value: 'apparel' },
  { term: 'clothing', value: 'apparel' },
  { term: 'drink', value: 'beverage' },
  { term: 'drinks', value: 'beverage' },
  { term: 'non-alcoholic', value: 'beverage' },
  { term: 'nonalcoholic', value: 'beverage' },
  { term: 'na drinks', value: 'beverage' },
  { term: 'founder', value: 'startups' },
  { term: 'founders', value: 'startups' },
  { term: 'startup', value: 'startups' },
  { term: 'moms', value: 'parenting' },
  { term: 'kids', value: 'parenting' },
  { term: 'trail', value: 'outdoors' },
  { term: 'trails', value: 'outdoors' },
  { term: 'eco', value: 'sustainability' },
  { term: 'sustainable', value: 'sustainability' },
  { term: 'recovery day', value: 'recovery' },
  { term: 'sober curious', value: 'sober' },
];

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Word-boundary match. Substring matching is what makes naive keyword parsers
 * embarrassing: "art" hits "start", "la" hits "plan", "run" hits "brunch".
 */
const mentions = (haystack: string, term: string): boolean =>
  new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(term)}(?:[^a-z0-9]|$)`, 'i').test(haystack);

/**
 * Collect allowlist values named directly or via an alias, in vocabulary order
 * so the same brief always produces the same array. Determinism matters here as
 * much as it does in the engine: two identical briefs must produce two
 * identical plans.
 */
function collect<T extends string>(
  text: string,
  canonical: readonly T[],
  aliases: Alias<T>[],
  cap: number,
): T[] {
  const hits = new Set<T>();
  for (const value of canonical) {
    if (mentions(text, value)) hits.add(value);
  }
  for (const { term, value } of aliases) {
    if (hits.size >= canonical.length) break;
    if (mentions(text, term)) hits.add(value);
  }
  return canonical.filter((v) => hits.has(v)).slice(0, cap);
}

/**
 * Exclusions the buyer expressed in prose.
 *
 * Only vocabulary terms sitting inside a negation clause count. Scanning the
 * whole brief for "no" would turn "no budget for more than three rooms" into an
 * exclusion, and a parser that invents exclusions quietly deletes inventory the
 * buyer wanted.
 */
const NEGATION =
  /\b(?:no|not|avoid|avoiding|exclude|excluding|except|without|skip|steer clear of|stay away from|keep away from|nothing)\b([^.;!?\n]{0,80})/gi;

function collectAvoid(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(NEGATION)) {
    const clause = match[1] ?? '';
    if (!clause.trim()) continue;
    for (const value of collect(clause, CATEGORIES, CATEGORY_ALIASES, LIMITS.avoid)) {
      found.add(value);
    }
    for (const value of collect(clause, INTERESTS, INTEREST_ALIASES, LIMITS.avoid)) {
      found.add(value);
    }
  }
  return [...found];
}

const KPI_TERMS: { term: string; label: string }[] = [
  { term: 'conversion', label: 'Conversions' },
  { term: 'conversions', label: 'Conversions' },
  { term: 'convert', label: 'Conversions' },
  { term: 'sales', label: 'Conversions' },
  { term: 'purchase', label: 'Conversions' },
  { term: 'signup', label: 'Signups' },
  { term: 'signups', label: 'Signups' },
  { term: 'sign-up', label: 'Signups' },
  { term: 'sign ups', label: 'Signups' },
  { term: 'subscribe', label: 'Signups' },
  { term: 'subscribers', label: 'Signups' },
  { term: 'trial', label: 'Product trial' },
  { term: 'trials', label: 'Product trial' },
  { term: 'sampling', label: 'Product trial' },
  { term: 'retention', label: 'Retention' },
  { term: 'loyalty', label: 'Retention' },
  { term: 'repeat', label: 'Retention' },
  { term: 'consideration', label: 'Consideration' },
  { term: 'awareness', label: 'Awareness' },
  { term: 'launch', label: 'Awareness' },
  { term: 'reach', label: 'Awareness' },
];

function readKpi(text: string): string {
  for (const { term, label } of KPI_TERMS) {
    if (mentions(text, term)) return label;
  }
  return 'Awareness';
}

const AGE_RANGE = /\b(\d{2})\s*(?:-|–|—|to)\s*(\d{2})\b/;

function readAudience(text: string): string {
  const parts: string[] = [];

  if (mentions(text, 'women') || mentions(text, 'womens') || mentions(text, "women's")) {
    parts.push('Women');
  } else if (mentions(text, 'men')) {
    parts.push('Men');
  }
  if (mentions(text, 'parents') || mentions(text, 'moms') || mentions(text, 'mothers')) {
    parts.push('parents');
  }

  const age = AGE_RANGE.exec(text);
  if (age) parts.push(`ages ${age[1]}-${age[2]}`);

  return parts.length ? parts.join(', ') : 'General urban adults';
}

/** First sentence, capped. The buyer sees this back, so it stays their words. */
function readSummary(text: string): string {
  const first = text.split(/(?<=[.!?])\s+/)[0] ?? text;
  return scrubText(first || text, LIMITS.summaryText);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export interface FallbackInput {
  brief: string;
  /**
   * Budget and flight come from typed form fields and are clamped here, exactly
   * as they are in `validateModelBrief`. Neither parser is ever the source of a
   * number that reaches an invoice.
   */
  budgetCents: number;
  flightWeeks: number;
  /** Exclusions the buyer typed. Unioned in, never replaced. */
  buyerAvoid?: string[];
  /** Trusted form selections, which beat anything read out of the prose. */
  selectedCity?: string;
  selectedAudience?: string;
}

export function parseBriefWithKeywords(input: FallbackInput): ParsedBrief {
  // Cap before scanning: the same length bound the model path applies, so a
  // 5MB brief cannot turn the fallback into the expensive path.
  const text = scrubText(String(input.brief ?? ''), LIMITS.briefChars).toLowerCase();

  const cities = collect(text, CITIES, CITY_ALIASES, LIMITS.cities);
  const selected = String(input.selectedCity ?? '').trim().toLowerCase();
  if (selected) {
    const known = CITIES.find((c) => c === selected);
    // A typed city is a trusted form field, so it leads and is never dropped.
    if (known) {
      const rest = cities.filter((c) => c !== known);
      cities.length = 0;
      cities.push(known, ...rest.slice(0, LIMITS.cities - 1));
    }
  }

  const modelAvoid = collectAvoid(text);
  const avoid = Array.from(
    new Set([
      ...(input.buyerAvoid ?? []).map((a) => a.toLowerCase().trim()).filter(Boolean),
      ...modelAvoid,
    ]),
  ).slice(0, LIMITS.avoid);

  const audience = String(input.selectedAudience ?? '').trim();

  // "No book clubs" names book club twice: once as a term the scan sees, once
  // as an exclusion. Without this the brief would both boost and bar the same
  // category. The engine would still reject it on `conflict`, but the plan would
  // show a wanted category the buyer explicitly ruled out. Exclusion wins.
  const excluded = new Set(avoid);
  const wanted = <T extends string>(values: T[]): T[] =>
    values.filter((v) => !excluded.has(v));

  return {
    interests: wanted(collect(text, INTERESTS, INTEREST_ALIASES, LIMITS.interests)),
    categories: wanted(collect(text, CATEGORIES, CATEGORY_ALIASES, LIMITS.categories)),
    cities,
    formats: collect(text, FORMATS, FORMAT_ALIASES, LIMITS.formats),
    avoid,
    audience: audience
      ? scrubText(audience, LIMITS.shortText)
      : readAudience(text),
    kpi: readKpi(text),
    summary: readSummary(input.brief ?? ''),
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
    source: 'fallback',
  };
}
