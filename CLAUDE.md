# CLAUDE.md

## What this is

**Read `README.md` first.** It carries why this exists, the problem it solves,
the three load-bearing design decisions, and everything done for security and
usability. Keep it current: when a decision changes, the README changes in the
same commit.

A brief-to-plan engine for IRL community advertising. A brand writes a campaign
brief in plain language. The app returns a ranked plan of communities to sponsor,
priced per verified attendee, carried through to projected conversions, with the
contract terms and payout schedule attached to every placement.

Built by Ra'Mar Wilson. Concept build, not affiliated with or endorsed by Offline.

## The three things this app does

Named after the buyer-facing steps it implements:

1. **Match** — parse a messy brief, score every community against it, allocate budget
2. **Activate** — generate placements, contracts, and host accept/decline flow
3. **Attribute** — mint check-in codes, record attendance, report the funnel

## Stack

- Next.js (App Router) + TypeScript
- Postgres via Supabase, Drizzle ORM
- Tailwind
- Anthropic API, server-side only, in route handlers
- Vercel for deploy
- Vitest for tests

Chosen deliberately: this mirrors the stack of the company the build is aimed at
(React + Supabase/Postgres + TypeScript). Do not swap the ORM or the framework.

## Commands

```bash
pnpm dev            # local dev
pnpm test           # vitest, must pass before any commit
pnpm test:watch
pnpm db:push        # push drizzle schema
pnpm db:seed        # load the synthetic community index
pnpm typecheck
pnpm lint
```

## Architecture rules — do not violate these

**1. The model never ranks.**
The LLM parses briefs and writes prose. Ranking, scoring, and budget allocation
are deterministic TypeScript in `lib/scoring/`. An ad network sells the ranking,
so the ranking has to be auditable when a brand asks why they paid for a room.
If you find yourself asking a model to sort, order, pick, or rate communities,
stop. That belongs in the engine.

**2. The app must return a plan when the model is down.**
Every LLM call has a deterministic fallback. A media buyer staring at a spinner
is a broken product. `lib/brief/fallback.ts` holds the keyword parser.

**3. No API keys in the browser.**
All Anthropic calls go through route handlers under `app/api/`. Never `fetch`
api.anthropic.com from a client component.

**4. Price on verified attendance, never on claimed capacity.**
`verified = attendance * checkInRate`. Every cost figure divides by verified
counts. RSVP and room-capacity numbers are display-only.

**5. The allocator is allowed to underspend.**
Two guards stop budget padding: an absolute score `FLOOR`, and a `CLIFF` relative
to the lead match. Returning budget is a correct outcome and the UI says so.
Never "fix" the allocator to spend the full budget.

## Security rules — read docs/SECURITY.md before touching app/api, db, or lib/security

This app takes untrusted text from the internet, feeds it to a language model,
and uses the result to allocate money. These are hard constraints.

**1. The model cannot move money.**
Budget, flight, fees, take rate, and placement status come from typed form fields
and server config. Never from the brief, never from model output. This is what
makes prompt injection survivable: the worst outcome is a bad match a human
reviews, never a changed payout. If you are about to let a model set a number
that appears on an invoice, stop.

**2. Everything the model returns is intersected against a server-side allowlist.**
`lib/security/briefSchema.ts`. Strict zod, no passthrough, array and string caps,
prototype-pollution guard on parse. The model picks from a closed set; it does
not author the set. Parse failure falls to the keyword parser.

**3. Untrusted text goes in a delimited block with a per-request random tag,**
never concatenated into the instruction. `lib/security/prompt.ts`. Community
fields are ops-editable and reach prompts, so they are sanitized too: that is
stored injection.

**4. RLS on every table, no exceptions.** Supabase ships new tables with RLS off
and the anon key lives in the browser. `db/rls.sql` runs as part of `db:push`.
A migration adding a table without a policy is incomplete. The service role key
is server-only and never `NEXT_PUBLIC_`.

**5. Every `:id` route checks ownership and a status state machine.** Re-derive
the actor from the session, never from the request body. Money transitions are
idempotent and audited.

**6. Check-ins never release funds.** Attendance is evidence, not a trigger.
Release is an explicit ops action. Check-in writes are server-side only, rate
limited, deduped, and capped against stated attendance.

**7. Rate limit every public route before it ships.** `lib/security/rateLimit.ts`.
`/api/brief` uses `BRIEF_POLICY` and degrades to the keyword parser when limited,
so a limited user still gets a plan. Money-adjacent routes use `reject`. All
policies fail closed when the store is unreachable. **`MemoryStore` is dev-only:
serverless functions do not share memory, so shipping it to Vercel means no limit
at all.** Wire Upstash before any public deploy.

**8. Never `dangerouslySetInnerHTML`.** Not on model output, not on index fields,
not anywhere.

**9. Money is integer cents split by derived remainder.** `splitFee()`. Never
round both sides independently: at an 18% take a 25-cent fee becomes 21 + 5 = 26.

Tests that only exercise seed data do not test the code. `security.test.ts`
proves reconciliation across a fee range, not across today's rows.

## Data honesty guardrails

The community index in `db/seed.ts` is **synthetic and must stay synthetic**.

- Never seed, hardcode, or generate real community names. Not run clubs, not
  supper clubs, not anything you can find on the internet. Attaching invented
  reach and pricing to a real group misrepresents that group.
- Every surface that shows the index carries a visible synthetic-data label.
  Do not remove it, shrink it, or move it below the fold.
- Never present projected numbers as measured results.
- The check-in, click, and conversion rates are calibrated so the blended
  network rates land near published industry figures (93% check-in, 48%
  click-through, 11% conversion). `engine.test.ts` asserts this. If you add
  communities, the calibration test must still pass.

## Design system

Read `docs/DESIGN.md` before building any UI. Tokens live in `app/globals.css`
and `tailwind.config.ts`, sampled from the live site rather than guessed.

Hard rules:
- Three greens on warm grey paper: `forest`, `emerald`, `moss` on `paper`, with
  `card` for raised surfaces and `chalk` for text on dark. **No black, no pure
  white, no fourth hue.** Errors and warnings are forest with an emerald
  underline, never red.
- No drop shadows. Depth is the paper/card value step.
- Buttons are full pills. Cards are 18px radius.
- Section headers are three levels in order: forest H2, emerald subhead, moss
  support line. Never two, never reordered.
- Stat blocks put the number first and the label under it.
- The page carries one fixed grain overlay. Never apply grain per-component.
- Headlines may italicise exactly one word.
- Mono is for data, codes, and IDs only. It never appears at display size.

The display typeface is a placeholder. `docs/DESIGN.md` explains how to replace
it with the real one in thirty seconds. Do that before shipping.

**Do not reproduce anyone's logo or wordmark.** Palette and type show fluency; a
copied mark is a trademark problem. Every screen carries the concept-build label
via `components/SyntheticBanner.tsx`, which is not dismissible.

## Code conventions

- Pure functions in `lib/scoring/`. No I/O, no fetch, no db imports. This module
  must be runnable in a test with no network and no database.
- Money in integer cents throughout. Format only at the render edge.
- Drizzle schema is the single source of truth for types. Infer, do not restate.
- Server components by default. `"use client"` only where there is interaction.
- No em dashes in any user-facing copy.

## File map

```
lib/scoring/types.ts      shared types + Category union
lib/scoring/engine.ts     scoring bands, allocator, funnel projection
lib/scoring/engine.test.ts
lib/brief/parse.ts        LLM intake (server only)
lib/brief/fallback.ts     keyword parser, no network
lib/security/briefSchema.ts  strict validation + allowlists for model output
lib/security/prompt.ts       delimited prompts, injection signals, sanitizers
lib/security/rateLimit.ts    sliding window limiter, policies, identity
lib/security/*.test.ts
db/rls.sql                row level security policies
db/schema.ts              drizzle tables
db/seed.ts                synthetic community index
app/api/brief/route.ts    POST brief -> parsed structure
app/api/plan/route.ts     POST parsed brief -> plan
app/(brand)/...           brief composer, plan view
app/(host)/...            host inbox, accept/decline
app/(ops)/...             index admin, weight tuning
app/checkin/[code]/       check-in capture
docs/SPEC.md              phases and acceptance criteria
docs/SECURITY.md          threat model, controls, pre-deploy gate
docs/DEBRIEF.md           living state of the build: done, deployed, gaps
docs/DESIGN.md            sampled palette, type, component rules
docs/TASKS.md             ordered build list
```

## Working style

Work through `docs/TASKS.md` in order. One phase per branch. Run `pnpm test`
before every commit. When a phase's acceptance criteria in `docs/SPEC.md` are
met, say so and stop rather than rolling into the next phase.

**Keep `docs/DEBRIEF.md` current.** Update it at the end of every phase and
before ending any session, without being asked. It carries what is built, what
is deployed and where, which env vars exist, the security gate status, known
gaps, and the decision log.

Two rules on it:
- Tick a security box only from a verification you actually ran, and write down
  how you verified. Never from intent.
- Write down a gap the moment you create one. A gap recorded is a to-do; a gap
  discovered by a reviewer is a credibility problem.

If a requirement here conflicts with something asked in chat, raise the conflict
instead of silently picking one.
