# Tasks

Work top to bottom. One phase per branch. `pnpm test` green before every commit.
When a phase's acceptance criteria in SPEC.md are met, stop and say so.

> After every phase: update `docs/DEBRIEF.md`. Not optional.

## Phase 0 — Scaffold
- [x] `create-next-app` (Next 16, Tailwind v3, app router, no src dir)
- [x] Install: `@anthropic-ai/sdk zod @upstash/redis`, dev: `vitest tsx @types/node`
- [ ] Install `drizzle-orm postgres` + `drizzle-kit` — **deferred to Phase 2.**
      Phase 1 is stateless, so an unused ORM is a dependency and a build surface
      bought for nothing. See the decision log in DEBRIEF.
- [x] Wire the provided `lib/scoring/`, `db/schema.ts`, `db/seed.ts` into the tree
- [x] `vitest.config.mts`, provided tests pass
- [x] `.env.example` with ANTHROPIC_API_KEY and UPSTASH_*. `.env` gitignored,
      confirmed absent from history

## Phase 1 — Engine to screen
- [x] `lib/brief/fallback.ts` — keyword parser over the vocab, no network
- [x] `lib/brief/parse.ts` — Anthropic intake via `buildBriefPrompt`, output through
      `validateModelBrief`. Budget and flight come from the form, never the model.
- [x] Wire `BRIEF_POLICY` from `lib/security/rateLimit.ts` into `/api/brief`,
      backed by Upstash. On `degrade`, run the keyword parser and label it in
      the UI. Return `rateLimitHeaders()` on every response.
- [x] Body size cap on `/api/brief`
- [x] Log `report.suspicious` briefs for review. Flag, do not hard block.
- [x] `app/api/brief/route.ts` — POST raw text, return ParsedBrief, fall back on error
- [x] `app/api/plan/route.ts` — POST ParsedBrief, return Plan
- [x] `app/page.tsx` — brief composer with presets
- [x] `components/plan/Totals.tsx` — allocated, reach, clicks, conversions, splits
- [x] `components/plan/AllocationBar.tsx`
- [x] `components/plan/Equalizer.tsx` — the six-band score breakdown
- [x] `components/plan/PlacementRow.tsx`
- [x] `components/plan/RejectedList.tsx` — reasons, not just winners
- [x] `components/SyntheticBanner.tsx` — always visible, never dismissible
- [x] Rationale pass: one Anthropic call for the top placements, prose only

Also built, not on the original list: `validateClientBrief` for `/api/plan`
bodies, `PLAN_POLICY`, `lib/server/rateLimitStore.ts`, and
`app/api/rationale/route.ts`. All four are in DEBRIEF.

**Phase 2 must delete the `db/schema.ts` exclusion from `tsconfig.json` in the
same commit that installs drizzle.**

## Phase 2 — Persistence
- [ ] `drizzle.config.ts`, `pnpm db:push` against Supabase
- [ ] **`db/rls.sql` runs inside `db:push`.** Verify with the anon key that every
      table denies. Run the two verification queries at the bottom of rls.sql.
- [ ] Share tokens: 256-bit CSPRNG, store the hash, expiry + revoke
- [ ] `pnpm db:seed` loads COMMUNITY_INDEX
- [ ] Save brief and plan on generate, snapshot engineConfig
- [ ] `app/plan/[id]/page.tsx` server-rendered
- [ ] Share token + `app/p/[token]/page.tsx` read-only

## Phase 3 — Host side
- [ ] `app/host/page.tsx` inbox, reading the `host_placements` view only
- [ ] `app/api/placements/[id]/accept` and `/decline` — ownership check, status
      state machine, idempotency key, audit row, `MUTATION_POLICY` rate limit.
      This route was an IDOR as first specified; do not ship it without all five.
- [ ] `components/host/PayoutTimeline.tsx`
- [ ] Declined placement returns its fee to held-back

## Phase 4 — Attribution
- [ ] `app/checkin/[code]/page.tsx` + POST handler — server-side write only,
      authenticated host scans, rate limited, deduped, capped at a multiple of
      stated attendance, `CHECKIN_POLICY` keyed on the code.
      **Check-in count must not release funds.**
- [ ] Fund release is a separate explicit ops action that reads the count
- [ ] Actual vs projected on the plan view, visually distinct
- [ ] `app/ops/funnel/page.tsx`

## Phase 5 — Ops
- [ ] `app/ops/communities` CRUD
- [ ] `app/ops/weights` with live recompute, reject weights that do not sum to 1
- [ ] Calibration panel with drift warning

## Ship
- [ ] **Walk the pre-deploy gate in docs/SECURITY.md. Every box.**
- [ ] Security headers: CSP, HSTS, X-Content-Type-Options, Referrer-Policy
- [ ] `pnpm audit` clean or triaged; `.env` confirmed absent from git history
- [ ] Deploy to Vercel, env vars set in the dashboard
- [ ] README with a 60-second walkthrough and the open questions from SPEC.md
- [ ] Lighthouse pass: keyboard focus visible, reduced motion respected, mobile clean
