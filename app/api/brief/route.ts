/**
 * POST /api/brief — free text in, ParsedBrief out.
 *
 * This is the only paid route in the app, which makes it the one a stranger can
 * use to spend your money. It is also the route that must never fail, because a
 * media buyer staring at a spinner is a broken product. Those two requirements
 * pull in opposite directions, and the resolution is that every failure path
 * lands on the keyword parser rather than on an error page:
 *
 *   rate limited  -> keyword parser, labelled
 *   no API key    -> keyword parser, labelled
 *   model down    -> keyword parser, labelled
 *   bad model JSON-> keyword parser, labelled
 *   malformed request -> 400, because that is the caller's bug, not ours
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { parseBriefWithKeywords } from '@/lib/brief/fallback';
import { parseBriefWithModel } from '@/lib/brief/parse';
import { LIMITS } from '@/lib/security/briefSchema';
import {
  BRIEF_POLICY,
  enforce,
  identify,
  rateLimitHeaders,
} from '@/lib/security/rateLimit';
import { getRateLimitStore } from '@/lib/server/rateLimitStore';

/**
 * Read the body before parsing it. `LIMITS.briefChars` caps the brief itself;
 * this caps the envelope, so a caller cannot make us buffer a megabyte of JSON
 * on the way to discovering the brief field is too long.
 */
const MAX_BODY_BYTES = 16 * 1024;

const requestSchema = z
  .object({
    brief: z.string().max(LIMITS.briefChars * 2),
    // Money and flight are typed form fields. They are clamped again in both
    // parsers; nothing here trusts a number because it arrived in a request.
    budgetCents: z.number(),
    flightWeeks: z.number(),
    buyerAvoid: z.array(z.string().max(LIMITS.shortText)).max(LIMITS.avoid).optional(),
    city: z.string().max(LIMITS.shortText).optional(),
    audience: z.string().max(LIMITS.shortText).optional(),
  })
  .strict();

export async function POST(request: Request) {
  // --- body size cap -------------------------------------------------------
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Request too large' }, { status: 413 });
  }

  const rawBody = await request.text();
  // content-length is client-settable, so measure what actually arrived.
  if (rawBody.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Request too large' }, { status: 413 });
  }

  let input: z.infer<typeof requestSchema>;
  try {
    input = requestSchema.parse(JSON.parse(rawBody));
  } catch {
    return NextResponse.json({ error: 'Malformed request' }, { status: 400 });
  }

  // --- rate limit ----------------------------------------------------------
  const limit = await enforce({
    store: getRateLimitStore(),
    policy: BRIEF_POLICY,
    identifier: identify(request.headers, {
      // x-forwarded-for is only trustworthy behind a proxy that rewrites it.
      trustForwardedFor: Boolean(process.env.VERCEL),
    }),
    scope: 'brief',
  });
  const headers = rateLimitHeaders(limit);

  const fallbackArgs = {
    brief: input.brief,
    budgetCents: input.budgetCents,
    flightWeeks: input.flightWeeks,
    buyerAvoid: input.buyerAvoid ?? [],
    selectedCity: input.city,
    selectedAudience: input.audience,
  };

  // BRIEF_POLICY degrades rather than rejecting. A limited caller still gets a
  // plan; they just get the free parser, and the UI says so.
  if (!limit.ok) {
    return NextResponse.json(
      { brief: parseBriefWithKeywords(fallbackArgs), degraded: 'rate-limit' },
      { status: 200, headers },
    );
  }

  // --- model, then fallback ------------------------------------------------
  try {
    const { brief, report } = await parseBriefWithModel({
      brief: input.brief,
      budgetCents: input.budgetCents,
      flightWeeks: input.flightWeeks,
      buyerAvoid: input.buyerAvoid ?? [],
      selectedCity: input.city,
      selectedAudience: input.audience,
    });

    // Flag, never hard block. Heuristics produce false positives, and rejecting
    // a legitimate brief is a worse outcome than flagging one for review. The
    // brief text itself never reaches the log.
    if (report.suspicious) {
      console.warn('[brief] injection signals', {
        signals: report.signals,
        truncated: report.truncated,
      });
    }

    return NextResponse.json({ brief, degraded: null }, { status: 200, headers });
  } catch (error) {
    // No key, timeout, refusal, truncation, schema mismatch. All the same to the
    // buyer: they get a plan, labelled as the keyword reading.
    console.warn('[brief] model path unavailable, using keyword parser', {
      reason: error instanceof Error ? error.name : 'unknown',
    });
    return NextResponse.json(
      { brief: parseBriefWithKeywords(fallbackArgs), degraded: 'model' },
      { status: 200, headers },
    );
  }
}
