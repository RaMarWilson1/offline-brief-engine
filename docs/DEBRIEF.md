# Debrief

**Living document. Claude Code updates this at the end of every phase and before
ending any session.** It is the answer to "where is this, what is live, what is
still open" without reading the diff.

## Why this exists

Matching brands to in-person communities is done by hand: someone reads a brief,
picks communities, builds a deck, quotes a price. It produces good plans and it
caps throughput at one person's calendar, leaves the buyer with reasoning instead
of numbers they can argue with, and prices rooms on claimed capacity rather than
who actually showed up.

This turns that step into software: brief in, ranked and priced plan out, with
contracts and measurement attached.

The full case, the security work, and the usability work are in
[`../README.md`](../README.md). This file tracks state, not argument.

Newest entries at the top of the log. Keep the status tables current rather than
appending duplicates.

---

## Current state

| | |
|---|---|
| Phase | 1 complete — engine to screen, stateless |
| Live URL | none |
| Last deploy | none |
| Tests | 81 passing |
| Security gate | partial, see table below |

---

## What is built

| Area | Status | Notes |
|---|---|---|
| Scoring engine | done | `lib/scoring/engine.ts`, pure, 18 tests |
| Synthetic index | done | 24 communities, calibrated to 93/48/11 blended |
| Model output validation | done | `lib/security/briefSchema.ts`, strict zod + allowlists |
| Client input validation | done | `validateClientBrief`, same treatment for `/api/plan` bodies |
| Prompt hardening | done | `lib/security/prompt.ts`, per-request nonce delimiter |
| Rate limiting | done and wired | `lib/security/rateLimit.ts` + `lib/server/rateLimitStore.ts` |
| Keyword fallback parser | done | `lib/brief/fallback.ts`, pure, no network, 19 tests |
| LLM intake | built, unproven | `lib/brief/parse.ts`, never executed against the live API |
| Rationale pass | built, unproven | `lib/brief/rationale.ts`, never executed against the live API |
| `POST /api/brief` | done | rate limited, body capped, degrades to keyword parser |
| `POST /api/plan` | done | rate limited, deterministic, no model call |
| `POST /api/rationale` | done | rate limited, returns empty map on any failure |
| Brief composer UI | done | `app/page.tsx` + `components/brief/Composer.tsx` |
| Plan view | done | totals, allocation bar, equalizer, placements, rejected list |
| Design tokens | done | `app/globals.css`, sampled palette, Tailwind v3 |
| RLS policies | written, not applied | `db/rls.sql` needs a real Supabase project |
| Drizzle schema | written, not pushed | `db/schema.ts`, excluded from typecheck for now |
| Persistence | not started | Phase 2. A plan is lost on reload today |
| Host inbox | not started | Phase 3 |
| Check-in + attribution | not started | Phase 4 |
| Ops | not started | Phase 5 |

## What is deployed

Nothing yet. Record each deploy here: date, commit, URL, what changed, what env
vars were set or rotated.

| Date | Commit | URL | Notes |
|---|---|---|---|
| | | | |

## Environment

Record what exists, never the values.

| Variable | Where set | Set? | Rotated |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | local, Vercel | no | |
| `UPSTASH_REDIS_REST_URL` | local, Vercel | no | |
| `UPSTASH_REDIS_REST_TOKEN` | local, Vercel | no | |
| `DATABASE_URL` | Phase 2 | no | |
| `SUPABASE_SERVICE_ROLE_KEY` | Phase 2, server only, never `NEXT_PUBLIC_` | no | |

## Security gate

Mirrors the checklist in `docs/SECURITY.md`. Do not tick a box from intent; tick
it from a verification you actually ran, and say how you verified.

| Control | Status | Verified how |
|---|---|---|
| Model output strict-validated | done | 81 tests green, including the 47 security tests |
| Client-supplied brief re-validated | done | POSTed `budgetCents: 999999999999` to `/api/plan` against a running server; plan came back clamped to the $1,000,000 ceiling. POSTed an extra `isAdmin` key; got 400 |
| Prototype pollution guard | done | POSTed `{"__proto__":{"polluted":true},...}` to `/api/plan`; key stripped by the reviver, request served from the remaining valid fields, no pollution |
| Allowlist intersection on model output | done | POSTed off-vocabulary values (`"cult"`, `"reykjavik"`, a `<script>` string) to `/api/plan`; all dropped, plan built from allowed values only |
| Rate limiting live on `/api/brief` | done | Fired 7 requests at a running server under one `x-real-ip`. Requests 1-5 served, 6 and 7 returned `degraded: "rate-limit"` with a full plan from the keyword parser. `RateLimit-*` headers present on every response |
| Rate limiting live on `/api/plan` | done | Fired 22 requests; 1-20 served, 21 and 22 returned 429 |
| `/api/brief` length capped | done | POSTed a 30KB body; got 413 before any parse or model call |
| Fails closed without Upstash in production | done by construction, not yet observed | `getRateLimitStore()` returns a store whose `hit()` throws when `NODE_ENV=production` and the Upstash vars are unset, which drives `enforce()`'s fail-closed branch. Not yet exercised on a real production deploy |
| No `dangerouslySetInnerHTML` | done | `grep -rn "dangerouslySetInnerHTML"` across `*.ts`/`*.tsx`: no matches |
| No secret is `NEXT_PUBLIC_` | done | `grep -rn "NEXT_PUBLIC_"` across `*.ts`/`*.tsx`: no matches |
| No Anthropic SDK in a client bundle | done | Every `"use client"` file checked for an `@anthropic-ai/sdk` import: none. All model calls sit in route handlers |
| `.env` absent from git history | done | `git log --all --name-only` shows no `.env`; `git check-ignore -v .env` matches `.gitignore:42` |
| `npm audit` clean | done | `npm audit --omit=dev`: 0 vulnerabilities |
| RLS on every table | not started | No database in Phase 1 |
| Ownership + state guard on every `:id` route | not applicable yet | No `:id` routes exist |
| Check-in cannot release funds | design done, not built | Phase 4 |
| Share tokens random, hashed, expiring | not started | Phase 2 |
| Security headers | not started | Ship phase |

## Known gaps and open questions

Carry the five open questions from `docs/SPEC.md` here as they get answered.
Anything a reviewer would catch should be written down before they catch it.

**Created in this phase:**

- **`db/schema.ts` is excluded from `tsconfig.json`.** It imports `drizzle-orm`,
  which is not installed, so it produced 11 typecheck errors and made
  `npm run typecheck` useless as a gate on Phase 1 code. Excluding it was the
  cheapest way to keep the gate meaningful. **Phase 2 must delete that exclusion
  in the same commit that installs drizzle**, or the schema ships untypechecked.
- **The model path has never run.** `lib/brief/parse.ts` and
  `lib/brief/rationale.ts` are written against the SDK types in `0.116.0` and
  compile clean, but with no `ANTHROPIC_API_KEY` set locally, every end-to-end
  run so far exercised the fallback. The request shape, the structured-output
  schema, and the refusal and truncation handling are unverified against the live
  API. First run with a real key is a test, not a demo.
- **The keyword parser under-reads nuanced exclusions.** "Nothing with alcohol"
  produces no exclusion, because `alcohol` is not in the interest vocabulary
  (`wine` and `beverage` are). It refuses to guess rather than inventing an
  exclusion, which is the safe direction, but it is a real gap between the two
  parsers and a buyer on the fallback path will notice it.
- **A plan does not survive a reload.** Phase 1 is stateless by design; this is
  Phase 2's job. Worth stating because it is the first thing anyone notices.
- **`identify()` trusts `x-forwarded-for` only when `process.env.VERCEL` is set.**
  Correct on Vercel and safe locally. On any other host behind a proxy that
  rewrites the header, this needs revisiting or every caller shares one bucket.
- **The blended-rate stats on the home page show computed values (92/49/12), not
  the target figures (93/48/11).** Both are correct: `engine.test.ts` asserts the
  computed rates sit within ±0.03 of the published targets, and they do. The page
  shows what the index actually produces rather than the number it aims at.

**Carried forward:**

- Conversion rate modelled against clicks, not attendees. Unconfirmed.
- Host fee assumed flat per event, not scaled by room size. Unconfirmed.
- 18% take rate is a placeholder.
- `MemoryStore` is dev-only. Serverless functions do not share memory, so
  shipping it to Vercel means no effective rate limit. Upstash must be wired
  before any public deploy.
- The display typeface is still the Figtree placeholder. `docs/DESIGN.md`
  explains the swap to ConferenceEF.

## Decisions

Record decisions that would be expensive to reverse, with the reason. Future you
will want the reason more than the decision.

| Date | Decision | Why |
|---|---|---|
| — | Model never ranks; deterministic engine does | An ad network sells the ranking, so it has to be auditable when a brand asks why they paid for a room |
| — | Allocator may underspend | Padding a plan to spend the budget is how a running shoe ends up sponsoring a sewing circle |
| — | Fee split by derived remainder | Rounding both sides independently creates a cent from nothing at some fees |
| — | Rate limit fails closed | A limiter that fails open is the one an attacker takes offline first |
| — | Index stays synthetic | Attaching invented reach and pricing to real communities misrepresents them |
| 2026-08-10 | Phase 1 ships stateless; drizzle deferred to Phase 2 | Every Phase 1 acceptance criterion in SPEC.md is satisfiable without a database. Installing an ORM to leave it unused adds a dependency, a build surface, and a schema nobody has run |
| 2026-08-10 | `/api/plan` rejects under load rather than degrading | `degrade` means serving a cheaper path. The engine already is the cheap path, so there is nothing cheaper to fall back to and a 429 is the honest answer |
| 2026-08-10 | `/api/brief` retries zero times before falling back | The fallback is free, deterministic, and instant. Spending another 12 seconds of a buyer's attention to maybe avoid the keyword parser is the wrong trade |
| 2026-08-10 | Missing Upstash in production is an unavailable store, not a memory store | A memory-backed limiter on serverless is no limiter with the appearance of one, and nobody goes looking for it. Failing closed makes the misconfiguration loud on the first request |
| 2026-08-10 | Rationale takes community IDs, not community objects | Names and interests are looked up server-side, so a crafted request cannot inject text into the prompt by inventing a placement |
| 2026-08-10 | Keyword parser drops a category that also appears in `avoid` | "No book clubs" names the category twice. The engine would still reject it on `conflict`, but the plan would display a wanted category the buyer explicitly ruled out |

---

## Log

### 2026-08-10 — Phase 0 and Phase 1: engine to screen

**Done:**
- Finished the Phase 0 scaffold: removed the `create-next-app` boilerplate page
  and its five unused SVGs, added `test:watch`, documented every env var in
  `.env.example`, excluded `db/schema.ts` from typecheck so the gate means
  something.
- `lib/brief/fallback.ts`: keyword parser over the same closed vocabulary the
  model picks from. Word-boundary matching, negation-scoped exclusions, alias
  table, hard caps. 19 tests, no network, no database.
- `lib/brief/parse.ts`: Anthropic intake on `claude-opus-5` with adaptive
  thinking at low effort, structured output pinned to the allowlist, capped
  `max_tokens`, and `stop_reason` checked before any content read.
- `lib/brief/rationale.ts`: prose-only pass for the top three placements.
- `lib/security/briefSchema.ts`: added `validateClientBrief` so a ParsedBrief
  posted back by the browser gets the same treatment as model output.
- `lib/security/rateLimit.ts`: added `PLAN_POLICY`.
- `lib/server/rateLimitStore.ts`: Upstash in production, memory in dev,
  fail-closed when production is misconfigured.
- Three route handlers, all rate limited, all body-capped.
- The whole brand surface: composer with presets and typed controls, then
  totals, allocation bar, six-band equalizer, placements with contract and
  measurement panels, and the rejected list with reasons.

**Verified against a running server, not just asserted:**
- Killing the key still produces a full plan, labelled "Read by keyword parser".
- Money reconciles: `spend + heldBack == budget`, and
  `hostPayout + platformRevenue == spend`, exactly.
- $18,000 brief allocated $16,500 across 5 placements and held $1,500 back, with
  the held-back figure stated on the plan rather than hidden.
- All 19 rejections carry a reason.
- Rate limits degrade on `/api/brief` and reject on `/api/plan` at the right
  request counts.
- 413 on an oversized body, 400 on an unknown key, budget clamped, prototype
  pollution stripped, off-vocabulary values dropped.
- No console errors in the browser.

**Broke / fixed:**
- Nothing broke. The 62 inherited tests stayed green throughout; the suite is now
  81.

**Next:**
- Phase 2 in `docs/TASKS.md`: drizzle config, `db:push` with `db/rls.sql` inside
  it, seed, persistence, share tokens. **Delete the `db/schema.ts` typecheck
  exclusion in that same commit.**
- Before any of that, run the model path once with a real key and confirm the
  request shape, the structured output, and the refusal handling.
