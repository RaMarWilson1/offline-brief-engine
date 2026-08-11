/**
 * Where the budget went, and what did not go anywhere.
 *
 * Held-back budget is a segment on this bar, not a footnote. The allocator is
 * allowed to underspend, so the interface has to make underspend legible rather
 * than let it read as a rounding artifact.
 */

import { money } from '@/lib/format';
import type { Plan } from '@/lib/scoring/types';

// Three greens, cycled. No fourth hue, so the ordering carries the distinction
// rather than the colour count.
const FILLS = ['bg-forest', 'bg-emerald', 'bg-moss'];

export default function AllocationBar({ plan }: { plan: Plan }) {
  const total = plan.spendCents + plan.heldBackCents;
  if (total <= 0) return null;

  const pct = (cents: number) => (cents / total) * 100;

  return (
    <div>
      <div
        className="flex h-3 w-full overflow-hidden rounded-full border border-hairline bg-paper"
        role="img"
        aria-label={`${money(plan.spendCents)} allocated across ${plan.placements.length} placements, ${money(plan.heldBackCents)} held back of ${money(total)} total.`}
      >
        {plan.placements.map((p, i) => (
          <div
            key={p.id}
            className={FILLS[i % FILLS.length]}
            style={{ width: `${pct(p.feeCents)}%` }}
          />
        ))}
        {plan.heldBackCents > 0 && (
          <div
            className="bg-paper"
            style={{ width: `${pct(plan.heldBackCents)}%` }}
          />
        )}
      </div>

      <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {plan.placements.map((p, i) => (
          <li key={p.id} className="flex items-center gap-1.5 text-[12px] text-moss">
            <span
              className={`h-2 w-2 rounded-full ${FILLS[i % FILLS.length]}`}
              aria-hidden="true"
            />
            {p.name}
            <span className="font-mono text-[11px] text-forest">
              {money(p.feeCents)}
            </span>
          </li>
        ))}
        {plan.heldBackCents > 0 && (
          <li className="flex items-center gap-1.5 text-[12px] text-moss">
            <span
              className="h-2 w-2 rounded-full border border-hairline bg-paper"
              aria-hidden="true"
            />
            Held back
            <span className="font-mono text-[11px] text-forest">
              {money(plan.heldBackCents)}
            </span>
          </li>
        )}
      </ul>
    </div>
  );
}
