# Spec

## The problem

Matching a brand's campaign brief to the right IRL communities is done by hand.
Someone reads a paragraph, thinks about which communities fit, assembles a plan
in a deck, and quotes a price. It works, and it does not scale past the number of
hours that person has.

This app is that step as software: brief in, priced and contracted plan out.

## Who uses it

**Brand** writes a brief, reads the plan, approves it.
**Host** receives a placement offer, accepts or declines, gets paid.
**Ops** maintains the community index and tunes the scoring weights.

## Non-goals

Not building: ticketing, event creation, an attendee-facing app, a CRM, or
messaging. Those exist elsewhere and none of them are the bottleneck.

---

## Phase 1 — The engine and a plan you can read

**Build**
- `lib/scoring/` complete, tested, pure. Done: engine, types, tests all pass.
- Brief composer: textarea plus budget, flight, city, audience controls.
- `POST /api/brief` parses free text into `ParsedBrief` via Anthropic, server side.
- `lib/brief/fallback.ts` keyword parser, used automatically when the model call
  fails. The UI states which one ran.
- Plan view: totals, allocation bar, ranked placements with the six-band
  equalizer, the rejected list with reasons, contract and measurement panels.

**Acceptance**
- `pnpm test` green.
- Killing the Anthropic key still produces a full plan, labelled as fallback.
- The plan holds budget back when the brief cannot justify spending it, and says
  so in the UI rather than hiding it.
- Every placement shows its score breakdown. No score appears without its bands.
- Synthetic-data label visible on the plan without scrolling.

---

## Phase 2 — Persistence and sharing

**Build**
- Drizzle schema pushed to Supabase. Seed loads the 24-community index.
- Briefs and plans persist. `engineConfig` snapshots the weights used, so a plan
  from last month still explains itself after the weights change.
- Shareable read-only plan URL via `shareToken`.

**Acceptance**
- Reload does not lose a plan.
- A shared link renders for a logged-out viewer with no edit affordances.
- Changing scoring weights does not retroactively alter a saved plan's numbers.

---

## Phase 3 — The host side

This is the half that makes it a marketplace instead of a calculator.

**Build**
- Host inbox at `/host`: pending placement offers with fee, date window, format,
  and what the brand is asking for.
- Accept and decline, with a decline reason.
- Accepting moves status to `accepted`, stamps `acceptedAt`, and marks the
  deposit released.
- Payout timeline component: 50% on signature, 50% on verified check-in.

**Acceptance**
- A host can accept an offer and see exactly what they will be paid and when.
- A declined placement returns its budget to the plan's held-back total.
- No host can see another host's fee.

---

## Phase 4 — Attribution

**Build**
- `/checkin/[code]` records a check-in against a placement. No attendee identity
  stored, ever.
- Ops view of live check-ins per placement.
- Plan switches from projected to actual once check-ins exist, showing both.
- Funnel report: check-in, click, conversion, with projected against actual.

**Acceptance**
- Projected and actual are visually distinct and never conflated in a label.
- A placement with zero check-ins reports zero, not its projection.
- Check-in codes are unique and contain no personal data.

---

## Phase 5 — Ops

**Build**
- Community index CRUD.
- Weight tuning: adjust band weights, FLOOR, CLIFF, see a plan recompute live.
- Calibration panel showing blended network rates against target, so drift is
  visible the moment someone adds bad rows.

**Acceptance**
- Weights cannot be saved if they do not sum to 1.
- Adding a community that breaks calibration surfaces a warning.
- `isSynthetic` cannot be set false from the UI.

---

## Open questions to resolve with a real operator

These are assumptions in the build. Each one is a real question, not a hedge.

1. Is the published conversion rate measured against clicks or against
   attendees? The app currently models it on clicks. This changes every cost
   figure downstream.
2. Is the host fee flat per event, or does it scale with room size? Flat is
   assumed. Per-head would change the allocator materially.
3. What is the actual take rate? 18% is a placeholder.
4. What stops a brand and a host transacting directly on the second campaign?
   This is the central marketplace question and the measurement layer is the
   only real answer in the current design.
5. At index scale, how does a community get verified before it can be sold?
   Curation does not survive contact with ten thousand rows.
