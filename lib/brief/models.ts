/**
 * Model selection. One place, so swapping a tier is a one-line change.
 *
 * The strings alone are not enough. Request shape is generation-dependent, and
 * the fields differ in ways that are a 400 rather than a warning:
 *
 *   - Adaptive thinking (`thinking: {type: "adaptive"}`) arrived with the 4.6
 *     generation. Older models do not accept it.
 *   - `output_config.effort` errors on Sonnet 4.5 and Haiku 4.5.
 *   - Structured outputs (`output_config.format`) work on Haiku 4.5 and on
 *     everything newer, so the allowlist-pinned schema is safe everywhere here.
 *
 * If the tier and the shape lived in different files, swapping one line would
 * quietly produce an invalid request against the other. So the capability table
 * lives next to the IDs and `withTuning` derives the shape from whichever model
 * is selected. Change `MODELS` and the request follows.
 *
 * A model absent from the table falls back to the conservative shape: no
 * thinking field, no effort field. Every model accepts that, so an unrecognised
 * ID degrades to a valid request rather than a failed one.
 */

import type Anthropic from '@anthropic-ai/sdk';

export type EffortLevel = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

/**
 * The tiers this app uses.
 *
 * Brief parsing is extraction against a closed vocabulary: the schema does the
 * constraining, so the cheapest fast model is the right tool. Rationale writes
 * prose a buyer reads, which is worth a mid tier.
 */
export const MODELS = {
  briefParse: 'claude-haiku-4-5-20251001',
  rationale: 'claude-sonnet-5',
} as const satisfies Record<string, Anthropic.Model>;

interface Capabilities {
  /** Accepts `thinking: {type: "adaptive"}`. 4.6 generation and later. */
  adaptiveThinking: boolean;
  /** Accepts `output_config.effort`. Errors on Sonnet 4.5 and Haiku 4.5. */
  effort: boolean;
}

const CONSERVATIVE: Capabilities = { adaptiveThinking: false, effort: false };

const CAPABILITIES: Record<string, Capabilities> = {
  // Pre-4.6: no adaptive thinking, and effort is an error rather than a no-op.
  'claude-haiku-4-5': CONSERVATIVE,
  'claude-haiku-4-5-20251001': CONSERVATIVE,

  // 4.6 generation and later.
  'claude-sonnet-5': { adaptiveThinking: true, effort: true },
  'claude-sonnet-4-6': { adaptiveThinking: true, effort: true },
  'claude-opus-5': { adaptiveThinking: true, effort: true },
  'claude-opus-4-8': { adaptiveThinking: true, effort: true },
};

export function capabilitiesFor(model: string): Capabilities {
  return CAPABILITIES[model] ?? CONSERVATIVE;
}

/**
 * Add the thinking and effort fields the selected model actually accepts.
 *
 * `effort` is a request for less depth, not more, on every call in this app:
 * intake is classification and rationale is three short sentences. On a model
 * that does not take the field, omitting it is the correct shape rather than a
 * downgrade to work around.
 */
export function withTuning<T extends Anthropic.MessageCreateParamsNonStreaming>(
  params: T,
  effort: EffortLevel,
): T {
  const caps = capabilitiesFor(params.model);
  const tuned: T = { ...params };

  if (caps.adaptiveThinking) {
    tuned.thinking = { type: 'adaptive' };
  }
  if (caps.effort) {
    tuned.output_config = { ...tuned.output_config, effort };
  }

  return tuned;
}
