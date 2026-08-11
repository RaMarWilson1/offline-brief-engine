/**
 * The six-band score breakdown.
 *
 * No score appears in this app without its bands. A single number is a judgement
 * a buyer has to take on faith; six weighted bands are a number they can argue
 * with, and being argued with is the point. If a buyer thinks geography is
 * carrying too much of a placement, they can see that it is.
 */

import { BANDS } from '@/lib/scoring/engine';
import type { BandScores } from '@/lib/scoring/types';

export default function Equalizer({
  parts,
  score,
}: {
  parts: BandScores;
  score: number;
}) {
  return (
    <div>
      <div className="flex items-end gap-1.5" aria-hidden="true">
        {BANDS.map((band) => {
          const value = parts[band.key];
          return (
            <div key={band.key} className="flex w-7 flex-col items-center gap-1">
              <div className="flex h-14 w-full items-end rounded-[3px] bg-paper">
                <div
                  className="w-full rounded-[3px] bg-emerald"
                  style={{ height: `${Math.max(3, Math.round(value * 100))}%` }}
                />
              </div>
              <span className="font-mono text-[10px] leading-none text-moss">
                {band.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* The chart is decorative for a screen reader; this carries the data. */}
      <p className="sr-only">
        Match {score} out of 100.{' '}
        {BANDS.map(
          (band) =>
            `${band.name}: ${Math.round(parts[band.key] * 100)} out of 100, weighted ${Math.round(
              band.weight * 100,
            )} percent.`,
        ).join(' ')}
      </p>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1">
        {BANDS.map((band) => (
          <div key={band.key} className="flex items-baseline justify-between gap-2">
            <dt className="text-[12px] text-moss">
              <span className="font-mono text-[10px] text-forest">{band.label}</span>{' '}
              {band.name}
            </dt>
            <dd className="font-mono text-[11px] text-forest">
              {Math.round(parts[band.key] * 100)}
              <span className="text-moss">
                {' '}
                &times;{Math.round(band.weight * 100)}%
              </span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
