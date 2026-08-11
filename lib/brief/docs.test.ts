import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { COMMUNITY_INDEX } from '../../db/seed';
import { parseBriefWithKeywords } from './fallback';
import { README_PRESET } from './presets';
import { blendedRates, buildPlan, CLIFF, FLOOR, TAKE_RATE } from '../scoring/engine';
import { money } from '../format';

/**
 * The README is a public claim. This binds it to engine output.
 *
 * The motivating failure was real: the README carried "on an $18,000 brief the
 * engine returns $5,100", a figure left over from an earlier single-file
 * prototype and carried through a rewrite that changed the numbers. It survived
 * because prose has no compiler. It is also the most checkable sentence in the
 * document, so it was the likeliest thing for a reader to run and catch.
 *
 * Every figure quoted in the README about the engine is asserted here against
 * what the engine actually returns. Change the seed, the weights, the floor, or
 * the cliff, and this fails until the prose is updated to match.
 *
 * Deliberately not asserted: the stated test count. Asserting a suite's own size
 * from inside that suite means every added test breaks the build until the
 * README is edited, which trains people to edit the number without reading it.
 * It is also the one figure with no consequence if stale.
 */

/**
 * Whitespace-normalised. The README is hard-wrapped at 80 columns, so any phrase
 * long enough to be worth asserting will eventually straddle a line break.
 * Matching the raw file would mean re-wrapping a paragraph breaks the build,
 * which teaches people to distrust this test rather than read it.
 */
const readme = readFileSync(join(process.cwd(), 'README.md'), 'utf8')
  .replace(/\s+/g, ' ');
const pct = (n: number) => `${Math.round(n * 100)}%`;

describe('README figures match engine output', () => {
  describe('blended network rates', () => {
    const rates = blendedRates(COMMUNITY_INDEX);

    it('quotes the computed check-in, click, and conversion rates', () => {
      expect(readme).toContain(`${pct(rates.checkInRate)} check-in`);
      expect(readme).toContain(`${pct(rates.ctr)} click-through`);
      expect(readme).toContain(`${pct(rates.cvr)} conversion`);
    });

    it('still labels 93 / 48 / 11 as the target rather than the result', () => {
      // The distinction is the point: these are published figures the seed aims
      // at, and the computed rates land near but not on them. Presenting the
      // target as the result would be the same class of error as the $5,100.
      expect(readme).toContain('against targets of 93 / 48 / 11');
      expect(pct(rates.checkInRate)).not.toBe('93%');
    });
  });

  describe('the running shoe preset', () => {
    const brief = parseBriefWithKeywords({
      brief: README_PRESET.text,
      budgetCents: README_PRESET.budget * 100,
      flightWeeks: README_PRESET.weeks,
      selectedCity: README_PRESET.city,
      selectedAudience: README_PRESET.audience,
    });
    const plan = buildPlan(COMMUNITY_INDEX, brief);

    it('quotes the budget, the allocation, and the held-back figure', () => {
      expect(readme).toContain(`${money(brief.budgetCents)} brief`);
      expect(readme).toContain(`allocates ${money(plan.spendCents)}`);
      expect(readme).toContain(`returns ${money(plan.heldBackCents)}`);
    });

    it('quotes the placement count', () => {
      expect(plan.placements.length).toBe(5);
      expect(readme).toContain('across five communities');
    });

    it('the held-back money is held by a guard, not by being unaffordable', () => {
      // This is the claim the paragraph actually makes. If a future seed change
      // meant the remainder simply could not buy anything, the prose would be
      // describing a different mechanism than the one at work.
      const affordable = plan.rejected.filter(
        (r) => r.feeCents <= plan.heldBackCents,
      );
      expect(affordable.length).toBeGreaterThan(0);
      for (const r of affordable) {
        expect(r.reason).toMatch(/floor|cliff|excluded/);
      }
    });

    it('quotes the specific room it refused and why', () => {
      const refused = plan.rejected.find(
        (r) => r.feeCents === plan.heldBackCents && r.category === 'book club',
      );
      expect(refused).toBeDefined();
      expect(readme).toContain(
        `a book club priced at exactly ${money(refused!.feeCents)}`,
      );
      expect(readme).toContain(`It scored ${refused!.score} against a floor of ${FLOOR}`);
    });
  });

  describe('tunables quoted in prose', () => {
    it('quotes the take rate the engine actually applies', () => {
      // Phrased two ways in the prose: "At an 18% take a 25-cent fee..." in the
      // money-integrity section, and "18% is a placeholder" in the open
      // questions. Assert the number rather than either sentence, so rewording
      // the prose does not fail the build but changing TAKE_RATE does.
      expect(readme).toContain(`${pct(TAKE_RATE)}`);
      expect(readme).toContain(`At an ${pct(TAKE_RATE)} take`);
    });

    it('does not quote a stale floor or cliff', () => {
      // Both appear in the allocator paragraph. Guard against the constants
      // moving while the prose stays put.
      expect(readme).toContain(`floor of ${FLOOR}`);
      expect(CLIFF).toBe(22);
    });
  });
});
