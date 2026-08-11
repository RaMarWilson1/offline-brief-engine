'use client';

/**
 * The brief composer.
 *
 * Two things are deliberately separate on this form, and the separation is the
 * whole security model rather than a layout choice:
 *
 *   - the textarea, which is prose from the internet and is treated as untrusted
 *     all the way to the model
 *   - the budget, flight, city, and exclusion controls, which are typed fields
 *     and are the only source of a number that reaches an invoice
 *
 * Nothing the buyer writes in the textarea can move budget or flight, because
 * those never travel through the brief. The worst a crafted brief achieves is a
 * poorly matched plan that a person reads before approving.
 */

import { useCallback, useState } from 'react';

import PlanView from '@/components/plan/PlanView';
import { PRESETS, type Preset } from '@/lib/brief/presets';
import { CITIES } from '@/lib/security/briefSchema';
import { CATEGORIES } from '@/lib/scoring/types';
import type { ParsedBrief, Plan } from '@/lib/scoring/types';

const RATIONALE_LIMIT = 3;

const AUDIENCES = [
  '',
  'Women 25-34',
  'Women 24-38',
  'Men 25-34',
  'Parents 28-42',
  'General urban adults 21-40',
] as const;

type Stage = 'idle' | 'reading' | 'scoring' | 'done';

export default function Composer() {
  const [text, setText] = useState<string>(PRESETS[0].text);
  const [budget, setBudget] = useState<number>(PRESETS[0].budget);
  const [weeks, setWeeks] = useState<number>(PRESETS[0].weeks);
  const [city, setCity] = useState<string>(PRESETS[0].city);
  const [audience, setAudience] = useState<string>('Women 25-34');
  const [avoid, setAvoid] = useState<string[]>([]);

  const [stage, setStage] = useState<Stage>('idle');
  const [error, setError] = useState<string | null>(null);
  const [brief, setBrief] = useState<ParsedBrief | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [degraded, setDegraded] = useState<string | null>(null);
  const [rationales, setRationales] = useState<Record<string, string>>({});

  const applyPreset = (preset: Preset) => {
    setText(preset.text);
    setBudget(preset.budget);
    setWeeks(preset.weeks);
    setCity(preset.city);
    setAudience(preset.audience);
  };

  const toggleAvoid = (value: string) =>
    setAvoid((current) =>
      current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value],
    );

  const generate = useCallback(async () => {
    setError(null);
    setRationales({});
    setStage('reading');

    try {
      // 1. Intake. Budget and flight travel as typed numbers, never as prose.
      const briefRes = await fetch('/api/brief', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          brief: text,
          budgetCents: Math.round(budget * 100),
          flightWeeks: weeks,
          buyerAvoid: avoid,
          city: city || undefined,
          audience: audience || undefined,
        }),
      });
      if (!briefRes.ok) throw new Error('The brief could not be read.');
      const briefJson = (await briefRes.json()) as {
        brief: ParsedBrief;
        degraded: string | null;
      };

      // 2. Scoring. Deterministic, no model, same answer every time.
      setStage('scoring');
      const planRes = await fetch('/api/plan', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(briefJson.brief),
      });
      if (planRes.status === 429) {
        throw new Error('Too many plans in a short window. Try again shortly.');
      }
      if (!planRes.ok) throw new Error('The plan could not be built.');
      const planJson = (await planRes.json()) as { plan: Plan };

      setBrief(briefJson.brief);
      setDegraded(briefJson.degraded);
      setPlan(planJson.plan);
      setStage('done');

      // 3. Prose, after the plan is on screen. It never blocks the plan, and a
      //    plan without it is complete.
      const topIds = planJson.plan.placements
        .slice(0, RATIONALE_LIMIT)
        .map((p) => p.id);
      if (topIds.length > 0) {
        fetch('/api/rationale', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            communityIds: topIds,
            briefSummary: briefJson.brief.summary,
            audience: briefJson.brief.audience,
            kpi: briefJson.brief.kpi,
          }),
        })
          .then((r) => (r.ok ? r.json() : { rationales: {} }))
          .then((j: { rationales?: Record<string, string> }) =>
            setRationales(j.rationales ?? {}),
          )
          .catch(() => setRationales({}));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setStage('idle');
    }
  }, [text, budget, weeks, city, audience, avoid]);

  const busy = stage === 'reading' || stage === 'scoring';

  return (
    <div className="space-y-8">
      <section className="card" aria-label="Campaign brief">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-[22px]">Brief</h3>
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => applyPreset(preset)}
                className="chip chip-quiet transition-colors hover:bg-paper"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        <label htmlFor="brief" className="stat-label mt-4 block">
          Write it the way you would email it
        </label>
        <textarea
          id="brief"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          maxLength={4000}
          className="mt-2 w-full resize-y rounded-card border border-hairline bg-paper p-3.5 text-[15px] leading-relaxed text-forest outline-none placeholder:text-moss"
          placeholder="What are you launching, who is it for, and what does success look like?"
        />
        <p className="mt-1 text-right font-mono text-[11px] text-moss">
          {text.length} / 4000
        </p>

        <div className="mt-5 grid gap-4 border-t border-hairline pt-5 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="budget" className="stat-label block">
              Budget (USD)
            </label>
            <input
              id="budget"
              type="number"
              min={100}
              max={1_000_000}
              step={500}
              value={budget}
              onChange={(e) => setBudget(Number(e.target.value))}
              className="mt-2 w-full rounded-full border border-hairline bg-paper px-4 py-2.5 font-mono text-[14px] text-forest outline-none"
            />
          </div>

          <div>
            <label htmlFor="weeks" className="stat-label block">
              Flight (weeks)
            </label>
            <input
              id="weeks"
              type="number"
              min={1}
              max={52}
              value={weeks}
              onChange={(e) => setWeeks(Number(e.target.value))}
              className="mt-2 w-full rounded-full border border-hairline bg-paper px-4 py-2.5 font-mono text-[14px] text-forest outline-none"
            />
          </div>

          <div>
            <label htmlFor="city" className="stat-label block">
              Lead city
            </label>
            <select
              id="city"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="mt-2 w-full rounded-full border border-hairline bg-paper px-4 py-2.5 text-[14px] capitalize text-forest outline-none"
            >
              <option value="">No preference</option>
              {CITIES.map((c) => (
                <option key={c} value={c} className="capitalize">
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="audience" className="stat-label block">
              Audience
            </label>
            <select
              id="audience"
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              className="mt-2 w-full rounded-full border border-hairline bg-paper px-4 py-2.5 text-[14px] text-forest outline-none"
            >
              {AUDIENCES.map((a) => (
                <option key={a || 'none'} value={a}>
                  {a || 'Read it from the brief'}
                </option>
              ))}
            </select>
          </div>
        </div>

        <fieldset className="mt-5 border-t border-hairline pt-5">
          <legend className="stat-label">Do not place next to</legend>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {CATEGORIES.map((c) => {
              const on = avoid.includes(c);
              return (
                <button
                  key={c}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleAvoid(c)}
                  className={on ? 'chip' : 'chip chip-quiet'}
                >
                  {c}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[12px] text-moss">
            Exclusions you set here are always kept. The brief can add to this
            list, never shrink it.
          </p>
        </fieldset>

        <div className="mt-6 flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={generate}
            disabled={busy || text.trim().length === 0}
            className="btn btn-primary"
          >
            {stage === 'reading'
              ? 'Reading the brief'
              : stage === 'scoring'
                ? 'Scoring the index'
                : 'Build the plan'}
          </button>
          <p className="text-[12px] text-moss">
            Scoring is deterministic. The same brief returns the same plan.
          </p>
        </div>

        {error && (
          <p className="mt-4 text-[13px] text-forest">
            <span className="border-b-2 border-emerald pb-0.5">{error}</span>
          </p>
        )}
      </section>

      {plan && brief && (
        <PlanView
          plan={plan}
          brief={brief}
          rationales={rationales}
          degraded={degraded}
        />
      )}
    </div>
  );
}
