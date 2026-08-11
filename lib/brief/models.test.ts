import type Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';

import { MODELS, capabilitiesFor, withTuning } from './models';

/**
 * These assertions exist because the failure they prevent is a 400 in
 * production, not a wrong answer in a test. `output_config.effort` errors on
 * Haiku 4.5, and adaptive thinking is a 4.6-generation feature, so a bare model
 * string swap silently produces an invalid request against the other tier.
 *
 * Verified against the live API on 2026-08-11: both shapes below returned 200.
 */

/**
 * Annotated rather than inferred: `withTuning` is generic and returns the input
 * type, so an inferred object literal would not carry the optional `thinking`
 * and `effort` fields these assertions read.
 */
const paramsFor = (model: string): Anthropic.MessageCreateParamsNonStreaming => ({
  model,
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'x' }],
  output_config: { format: { type: 'json_schema', schema: {} } },
});

describe('model selection', () => {
  it('parses briefs on the cheap fast tier and writes prose on the mid tier', () => {
    expect(MODELS.briefParse).toBe('claude-haiku-4-5-20251001');
    expect(MODELS.rationale).toBe('claude-sonnet-5');
  });
});

describe('withTuning', () => {
  it('sends neither thinking nor effort to a pre-4.6 model', () => {
    const tuned = withTuning(paramsFor(MODELS.briefParse), 'low');
    // Both fields are a 400 on Haiku 4.5, not a no-op.
    expect(tuned.thinking).toBeUndefined();
    expect(tuned.output_config?.effort).toBeUndefined();
    // The schema still rides along: structured outputs do work on that tier.
    expect(tuned.output_config?.format).toBeDefined();
  });

  it('sends both to a 4.6-generation model', () => {
    const tuned = withTuning(paramsFor(MODELS.rationale), 'low');
    expect(tuned.thinking).toEqual({ type: 'adaptive' });
    expect(tuned.output_config?.effort).toBe('low');
    expect(tuned.output_config?.format).toBeDefined();
  });

  it('falls back to the conservative shape for an unrecognised model', () => {
    // Every model accepts a request with neither field, so an unknown ID
    // degrades to a valid request rather than a failed one.
    const tuned = withTuning(paramsFor('claude-something-new'), 'high');
    expect(tuned.thinking).toBeUndefined();
    expect(tuned.output_config?.effort).toBeUndefined();
  });

  it('does not mutate the params it was given', () => {
    const input = paramsFor(MODELS.rationale);
    withTuning(input, 'low');
    expect(input.thinking).toBeUndefined();
    expect(input.output_config?.effort).toBeUndefined();
  });

  it('every model this app selects has an explicit capability entry', () => {
    // A tier swap to a model missing from the table would silently downgrade to
    // the conservative shape. That is safe, but it should be a deliberate choice.
    for (const model of Object.values(MODELS)) {
      expect(Object.keys(capabilitiesFor(model))).toEqual(
        expect.arrayContaining(['adaptiveThinking', 'effort']),
      );
    }
  });
});
