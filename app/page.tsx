/**
 * The brand surface: brief in, priced plan out.
 *
 * Server component. The only interactive part is the composer, so that is the
 * only thing marked `"use client"`.
 */

import Composer from '@/components/brief/Composer';
import SyntheticBanner from '@/components/SyntheticBanner';
import { COMMUNITY_INDEX } from '@/db/seed';
import { blendedRates, CLIFF, FLOOR, TAKE_RATE } from '@/lib/scoring/engine';
import { percent } from '@/lib/format';

export default function Home() {
  const rates = blendedRates(COMMUNITY_INDEX);

  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-12 sm:px-8 sm:py-16">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="stat-label">Brief to plan</p>
          <h1 className="text-hero mt-2 max-w-2xl">
            A paragraph in. A priced <em>plan</em> out.
          </h1>
        </div>
        <SyntheticBanner />
      </header>

      <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-moss">
        Write a campaign brief the way you would email it. The engine scores every
        community in the index across six weighted bands, allocates the budget,
        and returns a ranked plan priced per verified attendee, with contract
        terms and a payout schedule on every placement.
      </p>

      <dl className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="card">
          <dd className="stat-number">{COMMUNITY_INDEX.length}</dd>
          <dt className="stat-label">Communities indexed</dt>
        </div>
        <div className="card">
          <dd className="stat-number">{percent(rates.checkInRate)}</dd>
          <dt className="stat-label">Blended check-in</dt>
        </div>
        <div className="card">
          <dd className="stat-number">{percent(rates.ctr)}</dd>
          <dt className="stat-label">Blended click-through</dt>
        </div>
        <div className="card">
          <dd className="stat-number">{percent(rates.cvr)}</dd>
          <dt className="stat-label">Blended conversion</dt>
        </div>
      </dl>

      <section className="section-head mt-16">
        <h2>
          Write the <em>brief</em>
        </h2>
        <p className="section-sub">The model reads it. The engine ranks it.</p>
        <p className="section-support">
          A language model turns prose into routing structure and nothing else.
          Ranking, pricing, and allocation are deterministic, so the plan explains
          itself and returns the same answer twice.
        </p>
      </section>

      <div className="mt-8">
        <Composer />
      </div>

      <footer className="mt-20 border-t border-hairline pt-6">
        <div className="flex flex-wrap gap-x-8 gap-y-2 text-[12px] text-moss">
          <span>
            Match floor <span className="font-mono text-forest">{FLOOR}</span>
          </span>
          <span>
            Relevance cliff <span className="font-mono text-forest">{CLIFF}</span>
          </span>
          <span>
            Platform take{' '}
            <span className="font-mono text-forest">{percent(TAKE_RATE)}</span>
          </span>
        </div>
        <p className="mt-4 max-w-2xl text-[12px] leading-relaxed text-moss">
          Concept build by Ra&rsquo;Mar Wilson. Not affiliated with or endorsed by
          any company. The community index is synthetic and stays synthetic:
          attaching invented reach and pricing to a real group would misrepresent
          that group.
        </p>
      </footer>
    </main>
  );
}
