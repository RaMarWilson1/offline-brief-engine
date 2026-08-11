/**
 * POST /api/plan — ParsedBrief in, Plan out.
 *
 * No model call. Ranking and allocation are deterministic TypeScript, so the
 * same brief produces the same plan every time and every number traces back to
 * an input. That is the property an ad network actually sells: when a brand asks
 * why they paid for a room, "the model chose it" is not an answer.
 *
 * The ParsedBrief arrives from the browser, which makes it untrusted even though
 * we produced it a moment ago. `validateClientBrief` re-intersects every list
 * against the allowlist and re-clamps the money.
 */

import { NextResponse } from 'next/server';

import { COMMUNITY_INDEX } from '@/db/seed';
import { buildPlan } from '@/lib/scoring/engine';
import { safeJsonParse, validateClientBrief } from '@/lib/security/briefSchema';
import {
  PLAN_POLICY,
  enforce,
  identify,
  rateLimitHeaders,
} from '@/lib/security/rateLimit';
import { getRateLimitStore } from '@/lib/server/rateLimitStore';

const MAX_BODY_BYTES = 16 * 1024;

export async function POST(request: Request) {
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Request too large' }, { status: 413 });
  }

  const rawBody = await request.text();
  if (rawBody.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Request too large' }, { status: 413 });
  }

  // PLAN_POLICY rejects rather than degrading: the engine is already the cheap
  // path, so there is nothing cheaper to fall back to.
  const limit = await enforce({
    store: getRateLimitStore(),
    policy: PLAN_POLICY,
    identifier: identify(request.headers, {
      trustForwardedFor: Boolean(process.env.VERCEL),
    }),
    scope: 'plan',
  });
  const headers = rateLimitHeaders(limit);

  if (!limit.ok) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers },
    );
  }

  try {
    // safeJsonParse rather than request.json(): its reviver drops __proto__,
    // constructor, and prototype before the object is ever constructed.
    const brief = validateClientBrief(safeJsonParse(rawBody));
    const plan = buildPlan(COMMUNITY_INDEX, brief);
    return NextResponse.json({ plan }, { status: 200, headers });
  } catch {
    return NextResponse.json(
      { error: 'Malformed brief' },
      { status: 400, headers },
    );
  }
}
