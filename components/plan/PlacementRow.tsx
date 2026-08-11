/**
 * One placement, with everything a buyer would ask about it attached.
 *
 * The contract terms and the measurement plan sit on the placement rather than
 * in a separate tab, because "what am I buying, what does the host get, and when
 * does the money move" is one question. Splitting it across screens is how a
 * media plan turns back into a deck.
 */

import Equalizer from './Equalizer';
import { count, money, moneyExact, percent } from '@/lib/format';
import type { Placement } from '@/lib/scoring/types';

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className="text-[12px] text-moss">{label}</span>
      <span className="font-mono text-[12px] text-forest">{value}</span>
    </div>
  );
}

export default function PlacementRow({
  placement,
  flightWeeks,
  rationale,
}: {
  placement: Placement;
  flightWeeks: number;
  rationale?: string;
}) {
  const p = placement;
  const deposit = Math.round(p.hostPayoutCents / 2);

  return (
    <article className="card">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] text-moss">
              {String(p.rank).padStart(2, '0')}
            </span>
            <h3 className="text-[22px] leading-tight">{p.name}</h3>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="chip">{p.city}</span>
            <span className="chip chip-quiet">{p.category}</span>
            <span className="chip chip-quiet">{p.ageRange}</span>
            {p.formats.map((f) => (
              <span key={f} className="chip chip-quiet">
                {f}
              </span>
            ))}
          </div>
        </div>

        <div className="text-right">
          <div className="stat-number">{money(p.feeCents)}</div>
          <div className="stat-label">Placement fee</div>
        </div>
      </div>

      {/* Model-written, display only. Escaped by React, never parsed, and it
          plays no part in the ranking that put this room here. */}
      {rationale && (
        <p className="mt-4 border-l-2 border-emerald pl-3 text-[14px] leading-relaxed text-moss">
          {rationale}
        </p>
      )}

      <div className="mt-5 grid gap-5 border-t border-hairline pt-4 md:grid-cols-3">
        <div>
          <h4 className="stat-label mb-3">Why it scored {p.score}</h4>
          <Equalizer parts={p.parts} score={p.score} />
        </div>

        <div>
          <h4 className="stat-label mb-2">Measurement</h4>
          <Field label="Stated attendance" value={count(p.attendance)} />
          <Field label="Check-in rate" value={percent(p.checkInRate)} />
          <Field label="Verified attendees" value={count(p.verified)} />
          <Field label="Cost per attendee" value={moneyExact(p.cpaCents)} />
          <Field label="Projected clicks" value={count(p.projectedClicks)} />
          <Field
            label="Projected conversions"
            value={count(p.projectedConversions)}
          />
          <p className="mt-2 text-[11px] leading-snug text-moss">
            Stated attendance is display only. Every cost figure divides by
            verified attendees.
          </p>
        </div>

        <div>
          <h4 className="stat-label mb-2">Contract</h4>
          <Field label="Placement fee" value={money(p.feeCents)} />
          <Field label="Host payout" value={money(p.hostPayoutCents)} />
          <Field label="Platform take" value={money(p.platformFeeCents)} />
          <Field label="Flight" value={`${flightWeeks} weeks`} />
          <Field label="Events per month" value={String(p.eventsPerMonth)} />
          <div className="mt-3 border-t border-hairline pt-2">
            <div className="stat-label mb-1">Payout schedule</div>
            <Field label="On signature" value={money(deposit)} />
            <Field
              label="On verified check-in"
              value={money(p.hostPayoutCents - deposit)}
            />
            <p className="mt-2 text-[11px] leading-snug text-moss">
              Check-ins are evidence of attendance. Releasing the second half is
              an explicit ops action that reads the count, never a trigger the
              count pulls on its own.
            </p>
          </div>
        </div>
      </div>
    </article>
  );
}
