/**
 * Database schema. Single source of truth for persisted types.
 *
 * Money is integer cents everywhere. Formatting happens at the render edge.
 */

import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const communityCategory = pgEnum('community_category', [
  'run club',
  'walking club',
  'social club',
  'girl group',
  'book club',
  'mom group',
]);

export const placementStatus = pgEnum('placement_status', [
  'proposed', // in a plan, host has not seen it
  'offered', // sent to the host
  'accepted', // host signed, deposit releases
  'declined',
  'live', // event window open
  'completed', // check-ins recorded, balance releases
  'cancelled',
]);

export const planStatus = pgEnum('plan_status', [
  'draft',
  'shared',
  'approved',
  'archived',
]);

export const communities = pgTable(
  'communities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    city: text('city').notNull(),
    category: communityCategory('category').notNull(),
    interests: text('interests').array().notNull().default(sql`'{}'`),
    formats: text('formats').array().notNull().default(sql`'{}'`),
    pastCategories: text('past_categories').array().notNull().default(sql`'{}'`),
    attendance: integer('attendance').notNull(),
    eventsPerMonth: integer('events_per_month').notNull(),
    ageRange: text('age_range'),
    checkInRate: real('check_in_rate').notNull(),
    ctr: real('ctr').notNull(),
    cvr: real('cvr').notNull(),
    feeCents: integer('fee_cents').notNull(),
    brandSafety: real('brand_safety').notNull(),
    waitlistRatio: real('waitlist_ratio').notNull(),
    /** Every row in this table is invented. Never flip this to false. */
    isSynthetic: boolean('is_synthetic').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('communities_slug_idx').on(t.slug),
    index('communities_category_idx').on(t.category),
    index('communities_city_idx').on(t.city),
  ],
);

export const brands = pgTable('brands', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  contactEmail: text('contact_email'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const briefs = pgTable('briefs', {
  id: uuid('id').primaryKey().defaultRandom(),
  brandId: uuid('brand_id').references(() => brands.id, { onDelete: 'cascade' }),
  /** Exactly what the brand typed. Never overwrite with the parse. */
  rawText: text('raw_text').notNull(),
  /** ParsedBrief, as returned by the intake layer. */
  parsed: jsonb('parsed').notNull(),
  /** 'model' or 'fallback'. Surfaced in the UI so a buyer knows. */
  parseSource: text('parse_source').notNull(),
  budgetCents: integer('budget_cents').notNull(),
  flightWeeks: integer('flight_weeks').notNull(),
  kpi: text('kpi'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const plans = pgTable('plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  briefId: uuid('brief_id')
    .notNull()
    .references(() => briefs.id, { onDelete: 'cascade' }),
  status: planStatus('status').notNull().default('draft'),
  /** Plan-level totals, denormalised so a shared plan renders without a recompute. */
  totals: jsonb('totals').notNull(),
  /** Snapshot of BANDS/FLOOR/CLIFF/TAKE_RATE used, so old plans stay explicable. */
  engineConfig: jsonb('engine_config').notNull(),
  shareToken: text('share_token'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const placements = pgTable(
  'placements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    planId: uuid('plan_id')
      .notNull()
      .references(() => plans.id, { onDelete: 'cascade' }),
    communityId: uuid('community_id')
      .notNull()
      .references(() => communities.id, { onDelete: 'restrict' }),
    rank: integer('rank').notNull(),
    status: placementStatus('status').notNull().default('proposed'),
    score: integer('score').notNull(),
    /** Per-band subscores. The equalizer reads from here. */
    scoreBreakdown: jsonb('score_breakdown').notNull(),
    feeCents: integer('fee_cents').notNull(),
    hostPayoutCents: integer('host_payout_cents').notNull(),
    platformFeeCents: integer('platform_fee_cents').notNull(),
    projectedClicks: real('projected_clicks').notNull(),
    projectedConversions: real('projected_conversions').notNull(),
    /** Model-written prose. Never feeds back into ranking. */
    rationale: text('rationale'),
    checkInCode: text('check_in_code').notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    /** 50% on signature so the host can put a deposit on the venue. */
    depositReleasedAt: timestamp('deposit_released_at', { withTimezone: true }),
    /** 50% on verified check-in. */
    balanceReleasedAt: timestamp('balance_released_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('placements_check_in_code_idx').on(t.checkInCode),
    uniqueIndex('placements_plan_community_idx').on(t.planId, t.communityId),
    index('placements_status_idx').on(t.status),
  ],
);

export const checkIns = pgTable(
  'check_ins',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    placementId: uuid('placement_id')
      .notNull()
      .references(() => placements.id, { onDelete: 'cascade' }),
    /** 'door' (host scanned) or 'self'. No attendee identity is stored. */
    source: text('source').notNull().default('door'),
    clickedAt: timestamp('clicked_at', { withTimezone: true }),
    convertedAt: timestamp('converted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('check_ins_placement_idx').on(t.placementId)],
);

export const plansRelations = relations(plans, ({ one, many }) => ({
  brief: one(briefs, { fields: [plans.briefId], references: [briefs.id] }),
  placements: many(placements),
}));

export const placementsRelations = relations(placements, ({ one, many }) => ({
  plan: one(plans, { fields: [placements.planId], references: [plans.id] }),
  community: one(communities, {
    fields: [placements.communityId],
    references: [communities.id],
  }),
  checkIns: many(checkIns),
}));

export const briefsRelations = relations(briefs, ({ one, many }) => ({
  brand: one(brands, { fields: [briefs.brandId], references: [brands.id] }),
  plans: many(plans),
}));
