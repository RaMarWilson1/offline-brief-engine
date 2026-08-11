/**
 * LLM intake. Server only.
 *
 * The model does exactly one job here: read a messy paragraph and say which
 * values from a closed, server-owned vocabulary it maps to. It does not rank,
 * it does not order, and it does not touch a number that reaches an invoice.
 * Budget and flight arrive as typed form fields and are clamped by
 * `validateModelBrief` regardless of anything the brief says.
 *
 * Never import this from a client component. All Anthropic calls live behind
 * route handlers under `app/api/`; the key is server-side and stays there.
 */

import Anthropic from '@anthropic-ai/sdk';

import { CATEGORIES, FORMATS } from '../scoring/types';
import type { ParsedBrief } from '../scoring/types';
import {
  CITIES,
  INTERESTS,
  LIMITS,
  validateModelBrief,
} from '../security/briefSchema';
import { buildBriefPrompt, type UntrustedTextReport } from '../security/prompt';

/**
 * Intake is classification against a fixed list, not reasoning. Low effort keeps
 * the buyer's first screen fast; the quality that matters lives in the engine.
 */
const MODEL = 'claude-opus-5';
const EFFORT = 'low' as const;

/**
 * Hard cap. The response is eight short fields, so anything approaching this is
 * a malformed answer rather than a thorough one, and it stops a pathological
 * generation from running up a bill.
 */
const MAX_TOKENS = 1024;

/**
 * One shot, no retries.
 *
 * The usual instinct is to retry a transient 429 or 529, but here the fallback
 * is free, deterministic, and instant. Spending twelve more seconds of a media
 * buyer's attention to maybe avoid the keyword parser is the wrong trade: they
 * would rather have a labelled plan now than a slightly better plan later.
 */
const TIMEOUT_MS = 12_000;

/**
 * Structured output schema.
 *
 * This constrains generation to the allowlist, which is belt and braces on top
 * of the intersection in `validateModelBrief`. The schema is a convenience that
 * makes the common case clean; the intersection is the control. If this file
 * and the allowlist ever disagree, the allowlist wins, because it is the thing
 * that runs after the model.
 */
const BRIEF_OUTPUT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    interests: { type: 'array', items: { type: 'string', enum: [...INTERESTS] } },
    categories: { type: 'array', items: { type: 'string', enum: [...CATEGORIES] } },
    cities: { type: 'array', items: { type: 'string', enum: [...CITIES] } },
    formats: { type: 'array', items: { type: 'string', enum: [...FORMATS] } },
    avoid: {
      type: 'array',
      items: { type: 'string', enum: [...CATEGORIES, ...INTERESTS] },
    },
    audience: { type: 'string' },
    kpi: { type: 'string' },
    summary: { type: 'string' },
  },
  required: [
    'interests',
    'categories',
    'cities',
    'formats',
    'avoid',
    'audience',
    'kpi',
    'summary',
  ],
  additionalProperties: false,
};

let client: Anthropic | null = null;

function getClient(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  if (!client) {
    client = new Anthropic({
      apiKey,
      timeout: TIMEOUT_MS, // milliseconds in the TS SDK
      maxRetries: 0,
    });
  }
  return client;
}

export function isModelConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export interface ParseArgs {
  brief: string;
  /** From typed form fields. Clamped downstream, never read from the brief. */
  budgetCents: number;
  flightWeeks: number;
  buyerAvoid: string[];
  selectedCity?: string;
  selectedAudience?: string;
}

export interface ParseResult {
  brief: ParsedBrief;
  /** Injection signals, for the audit log. Never shown to the submitter. */
  report: UntrustedTextReport;
}

/**
 * Parse a brief with the model.
 *
 * Throws on any failure: no key, network error, refusal, truncation, schema
 * mismatch. Every throw is a signal for the caller to run the keyword parser,
 * which is why nothing is swallowed here.
 */
export async function parseBriefWithModel(args: ParseArgs): Promise<ParseResult> {
  const anthropic = getClient();
  if (!anthropic) throw new Error('ANTHROPIC_API_KEY is not set');

  const { prompt, report } = buildBriefPrompt({
    brief: args.brief,
    cities: CITIES,
    interests: INTERESTS,
    categories: CATEGORIES,
    formats: FORMATS,
    selectedCity: args.selectedCity,
    selectedAudience: args.selectedAudience,
  });

  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    thinking: { type: 'adaptive' },
    output_config: {
      effort: EFFORT,
      format: { type: 'json_schema', schema: BRIEF_OUTPUT_SCHEMA },
    },
    messages: [{ role: 'user', content: prompt }],
  });

  // Check stop_reason before reading content. A refusal returns HTTP 200 with an
  // empty or partial content array, so indexing straight into content[0] would
  // read undefined and fail somewhere less obvious.
  if (message.stop_reason === 'refusal') {
    throw new Error('model declined the request');
  }
  if (message.stop_reason === 'max_tokens') {
    throw new Error('model response was truncated');
  }

  const raw = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');

  if (!raw.trim()) throw new Error('model returned no text');

  // Strict schema, allowlist intersection, prototype-pollution guard, and the
  // union that stops an injected `avoid: []` from unblocking a category.
  const brief = validateModelBrief({
    raw,
    budgetCents: args.budgetCents,
    flightWeeks: args.flightWeeks,
    buyerAvoid: args.buyerAvoid,
  });

  return { brief, report };
}

export { LIMITS };
