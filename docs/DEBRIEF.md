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
| Phase | 0 — scaffold not yet run |
| Live URL | none |
| Last deploy | none |
| Tests | 62 passing |
| Security gate | not started |

---

## What is built

| Area | Status | Notes |
|---|---|---|
| Scoring engine | done | `lib/scoring/engine.ts`, pure, 18 tests |
| Synthetic index | done | 24 communities, calibrated to 93/48/11 blended |
| Model output validation | done | `lib/security/briefSchema.ts`, strict zod + allowlists |
| Prompt hardening | done | `lib/security/prompt.ts`, per-request nonce delimiter |
| Rate limiting | done | `lib/security/rateLimit.ts`, sliding window, 15 tests |
| RLS policies | written, not applied | `db/rls.sql` needs a real Supabase project |
| Drizzle schema | written, not pushed | `db/schema.ts` |
| Design tokens | done | `app/globals.css`, sampled palette |
| Brief composer UI | not started | |
| Plan view | not started | |
| Persistence | not started | |
| Host inbox | not started | |
| Check-in + attribution | not started | |
| Ops | not started | |

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
| `DATABASE_URL` | local, Vercel | no | |
| `SUPABASE_SERVICE_ROLE_KEY` | server only, never `NEXT_PUBLIC_` | no | |
| `UPSTASH_REDIS_REST_URL` | local, Vercel | no | |
| `UPSTASH_REDIS_REST_TOKEN` | local, Vercel | no | |

## Security gate

Mirrors the checklist in `docs/SECURITY.md`. Do not tick a box from intent; tick
it from a verification you actually ran, and say how you verified.

| Control | Status | Verified how |
|---|---|---|
| RLS on every table | not started | |
| Ownership + state guard on every `:id` route | not started | |
| Model output strict-validated | done | 47 security tests green |
| Rate limiting live on `/api/brief` | code done, not wired | |
| Check-in cannot release funds | design done, not built | |
| Share tokens random, hashed, expiring | not started | |
| `.env` absent from git history | not started | |
| Security headers | not started | |
| `pnpm audit` clean | not started | |
| No `dangerouslySetInnerHTML` | holds | nothing rendered yet |

## Known gaps and open questions

Carry the five open questions from `docs/SPEC.md` here as they get answered.
Anything a reviewer would catch should be written down before they catch it.

- Conversion rate modelled against clicks, not attendees. Unconfirmed.
- Host fee assumed flat per event, not scaled by room size. Unconfirmed.
- 18% take rate is a placeholder.
- `MemoryStore` is dev-only. Serverless functions do not share memory, so
  shipping it to Vercel means no effective rate limit. Upstash must be wired
  before any public deploy.

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

---

## Log

### YYYY-MM-DD — session title
**Done:**
**Deployed:**
**Broke / fixed:**
**Next:**
