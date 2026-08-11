/**
 * Plan totals.
 *
 * Two rules from the design system are load-bearing here rather than cosmetic:
 * the number comes first and the label sits under it, and every figure derived
 * from a rate is labelled Projected. Projected and measured never share a label,
 * because the moment they do, a projection gets quoted as a result.
 */

import { count, money, moneyExact, percent } from '@/lib/format';
import type { Plan } from '@/lib/scoring/types';

function Stat({
  value,
  label,
  hint,
}: {
  value: string;
  label: string;
  hint?: string;
}) {
  return (
    <div>
      <div className="stat-number">{value}</div>
      <div className="stat-label">{label}</div>
      {hint && <div className="mt-1 text-[12px] leading-snug text-moss">{hint}</div>}
    </div>
  );
}

export default function Totals({ plan }: { plan: Plan }) {
  const budget = plan.spendCents + plan.heldBackCents;

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <section className="card" aria-label="Spend">
        <div className="grid grid-cols-2 gap-4">
          <Stat value={money(plan.spendCents)} label="Allocated" />
          <Stat value={money(plan.heldBackCents)} label="Held back" />
          <Stat value={String(plan.placements.length)} label="Placements" />
          <Stat
            value={plan.cpaCents > 0 ? moneyExact(plan.cpaCents) : '—'}
            label="Cost per attendee"
          />
        </div>
        <p className="mt-4 border-t border-hairline pt-3 text-[12px] text-moss">
          Of a {money(budget)} budget. Cost per attendee divides by verified
          check-ins, never by room capacity.
        </p>
      </section>

      <section className="card" aria-label="Projected reach">
        <div className="grid grid-cols-2 gap-4">
          <Stat value={count(plan.verifiedReach)} label="Verified reach" />
          <Stat value={count(plan.projectedClicks)} label="Projected clicks" />
          <Stat
            value={count(plan.projectedConversions)}
            label="Projected conversions"
          />
          <Stat
            value={
              plan.blendedCheckInRate > 0 ? percent(plan.blendedCheckInRate) : '—'
            }
            label="Blended check-in"
          />
        </div>
        <p className="mt-4 border-t border-hairline pt-3 text-[12px] text-moss">
          {count(plan.grossSeats)} stated attendees across the plan. Verified
          reach is what the check-in rate says will actually scan in. Clicks and
          conversions are projections, not results.
        </p>
      </section>

      <section className="card" aria-label="Economics">
        <div className="grid grid-cols-2 gap-4">
          <Stat value={money(plan.hostPayoutCents)} label="Host payouts" />
          <Stat value={money(plan.platformRevenueCents)} label="Platform revenue" />
          <Stat
            value={plan.cpcCents > 0 ? moneyExact(plan.cpcCents) : '—'}
            label="Cost per click"
          />
          <Stat
            value={
              plan.cpConversionCents > 0 ? moneyExact(plan.cpConversionCents) : '—'
            }
            label="Cost per conversion"
          />
        </div>
        <p className="mt-4 border-t border-hairline pt-3 text-[12px] text-moss">
          {percent(plan.takeRate)} platform take. Fees split by derived remainder,
          so host payouts and platform revenue always reconcile to the exact
          allocated total.
        </p>
      </section>
    </div>
  );
}
