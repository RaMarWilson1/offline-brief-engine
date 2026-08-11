/**
 * POST /api/rationale — prose for the top placements.
 *
 * A second paid call, so it carries the same limiter as `/api/brief` under its
 * own scope. It runs after the plan is on screen and never blocks it: the client
 * renders the plan first and fills these in when they arrive.
 *
 * The request carries community IDs, not community objects. Everything the
 * prompt says about a room is looked up from the server-side index, so a crafted
 * request cannot smuggle text into the prompt by inventing a placement.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { RATIONALE_LIMIT, writeRationales } from '@/lib/brief/rationale';
import { LIMITS } from '@/lib/security/briefSchema';
import {
  BRIEF_POLICY,
  enforce,
  identify,
  rateLimitHeaders,
} from '@/lib/security/rateLimit';
import { getRateLimitStore } from '@/lib/server/rateLimitStore';

const MAX_BODY_BYTES = 8 * 1024;

const requestSchema = z
  .object({
    communityIds: z.array(z.string().max(64)).max(RATIONALE_LIMIT),
    briefSummary: z.string().max(LIMITS.summaryText),
    audience: z.string().max(LIMITS.shortText),
    kpi: z.string().max(LIMITS.shortText),
  })
  .strict();

export async function POST(request: Request) {
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Request too large' }, { status: 413 });
  }

  const rawBody = await request.text();
  if (rawBody.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Request too large' }, { status: 413 });
  }

  let input: z.infer<typeof requestSchema>;
  try {
    input = requestSchema.parse(JSON.parse(rawBody));
  } catch {
    return NextResponse.json({ error: 'Malformed request' }, { status: 400 });
  }

  const limit = await enforce({
    store: getRateLimitStore(),
    policy: BRIEF_POLICY,
    identifier: identify(request.headers, {
      trustForwardedFor: Boolean(process.env.VERCEL),
    }),
    scope: 'rationale',
  });
  const headers = rateLimitHeaders(limit);

  // Prose is an enhancement, so a limited caller gets an empty map rather than
  // an error. The plan on their screen is already complete without it.
  if (!limit.ok) {
    return NextResponse.json({ rationales: {} }, { status: 200, headers });
  }

  const rationales = await writeRationales(input);
  return NextResponse.json({ rationales }, { status: 200, headers });
}
