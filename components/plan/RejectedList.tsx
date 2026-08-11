/**
 * The rooms that did not make the plan, and why.
 *
 * A planner who shows only the winners is asking to be trusted. The near-misses
 * are the part a buyer actually engages with: "why not that one" is the first
 * question in every media conversation, and answering it before it is asked is
 * the difference between a plan and a pitch.
 *
 * Every entry carries a reason string from the engine. There is no path to
 * rendering a rejection without one.
 */

import { money, moneyExact } from '@/lib/format';
import type { RejectedCommunity } from '@/lib/scoring/types';

export default function RejectedList({
  rejected,
}: {
  rejected: RejectedCommunity[];
}) {
  if (rejected.length === 0) return null;

  return (
    <section className="card" aria-label="Communities not included">
      <h3 className="text-[22px]">Not included</h3>
      <p className="mt-1 text-[13px] text-moss">
        {rejected.length} communities scored and passed over. The reason is on
        each one.
      </p>

      <ul className="mt-4 divide-y divide-[color:var(--hairline)]">
        {rejected.map((r) => (
          <li
            key={r.id}
            className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5"
          >
            <div className="min-w-0">
              <span className="text-[14px] text-forest">{r.name}</span>
              <span className="ml-2 text-[12px] text-moss">
                {r.city}, {r.category}
              </span>
            </div>
            <div className="flex items-baseline gap-4">
              <span className="text-[12px] text-moss">{r.reason}</span>
              <span className="font-mono text-[12px] text-forest">
                {r.score}
              </span>
              <span className="hidden font-mono text-[11px] text-moss sm:inline">
                {money(r.feeCents)} / {moneyExact(r.cpaCents)} per head
              </span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
