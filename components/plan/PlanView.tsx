/**
 * The plan.
 *
 * Three things this screen refuses to hide, in the order a buyer meets them:
 * which parser read the brief, that the index is synthetic, and how much of the
 * budget the engine declined to spend.
 */

import AllocationBar from './AllocationBar';
import PlacementRow from './PlacementRow';
import RejectedList from './RejectedList';
import Totals from './Totals';
import SyntheticBanner from '@/components/SyntheticBanner';
import { money } from '@/lib/format';
import type { ParsedBrief, Plan } from '@/lib/scoring/types';

/** Why the keyword parser ran, in the buyer's terms rather than ours. */
const DEGRADED_COPY: Record<string, string> = {
  'rate-limit':
    'Rate limit reached, so the keyword parser read this brief. The plan below is complete and the engine is unchanged.',
  model:
    'The model was unavailable, so the keyword parser read this brief. The plan below is complete and the engine is unchanged.',
};

export default function PlanView({
  plan,
  brief,
  rationales,
  degraded,
}: {
  plan: Plan;
  brief: ParsedBrief;
  rationales: Record<string, string>;
  degraded: string | null;
}) {
  const budget = plan.spendCents + plan.heldBackCents;
  const heldPct = budget > 0 ? Math.round((plan.heldBackCents / budget) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Synthetic label sits at the top of the plan, above the numbers. */}
      <div className="flex flex-wrap items-center gap-3">
        <SyntheticBanner />
        <span
          className={
            brief.source === 'model'
              ? 'chip'
              : 'chip chip-quiet border-b-2 border-emerald'
          }
        >
          {brief.source === 'model' ? 'Read by the model' : 'Read by keyword parser'}
        </span>
      </div>

      {degraded && DEGRADED_COPY[degraded] && (
        <p className="text-[13px] leading-relaxed text-forest">
          <span className="border-b-2 border-emerald pb-0.5">
            {DEGRADED_COPY[degraded]}
          </span>
        </p>
      )}

      <div className="section-head">
        <h2>
          The <em>plan</em>
        </h2>
        <p className="section-sub">
          {plan.placements.length}{' '}
          {plan.placements.length === 1 ? 'community' : 'communities'} for{' '}
          {money(plan.spendCents)}
        </p>
        <p className="section-support">{brief.summary}</p>
      </div>

      <Totals plan={plan} />

      <section className="card" aria-label="Budget allocation">
        <h3 className="text-[22px]">Allocation</h3>
        {plan.heldBackCents > 0 ? (
          <p className="mt-1 text-[13px] leading-relaxed text-forest">
            <span className="border-b-2 border-emerald pb-0.5">
              {money(plan.heldBackCents)} of {money(budget)} ({heldPct}%) is held
              back.
            </span>{' '}
            <span className="text-moss">
              Nothing else in the index cleared the match floor or sat close
              enough to the lead match to be worth buying. Returning budget is a
              correct outcome, not a shortfall.
            </span>
          </p>
        ) : (
          <p className="mt-1 text-[13px] text-moss">
            The full budget cleared both guards and was allocated.
          </p>
        )}
        <div className="mt-4">
          <AllocationBar plan={plan} />
        </div>
      </section>

      {plan.placements.length > 0 ? (
        <div className="space-y-4">
          {plan.placements.map((p) => (
            <PlacementRow
              key={p.id}
              placement={p}
              flightWeeks={brief.flightWeeks}
              rationale={rationales[p.id]}
            />
          ))}
        </div>
      ) : (
        <section className="card">
          <h3 className="text-[22px]">No placements</h3>
          <p className="mt-1 text-[13px] leading-relaxed text-forest">
            <span className="border-b-2 border-emerald pb-0.5">
              Nothing in the index cleared the match floor for this brief, so the
              full {money(budget)} is held back.
            </span>{' '}
            <span className="text-moss">
              Widening the city, the format, or the audience usually opens it up.
              The rejected list below shows how close each room came.
            </span>
          </p>
        </section>
      )}

      <RejectedList rejected={plan.rejected} />
    </div>
  );
}
