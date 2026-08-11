-- Row Level Security.
--
-- New Supabase tables ship with RLS DISABLED. The anon key is in the browser and
-- must be assumed to be in an attacker's hands. A table without RLS is a public
-- read/write API over your data. This is the most common way products built on
-- Supabase leak.
--
-- Run this as part of db:push, never as a manual step someone can forget.
-- A migration that adds a table without a matching policy is incomplete.

-- ---------------------------------------------------------------------------
-- Deny by default, everywhere.
-- ---------------------------------------------------------------------------

alter table communities  enable row level security;
alter table brands       enable row level security;
alter table briefs       enable row level security;
alter table plans        enable row level security;
alter table placements   enable row level security;
alter table check_ins    enable row level security;

-- Force RLS even for the table owner, so a misconfigured connection string does
-- not silently bypass every policy below.
alter table communities  force row level security;
alter table brands       force row level security;
alter table briefs       force row level security;
alter table plans        force row level security;
alter table placements   force row level security;
alter table check_ins    force row level security;

-- ---------------------------------------------------------------------------
-- Identity helpers.
--
-- Roles live in a join table, not in JWT claims a client could influence.
-- ---------------------------------------------------------------------------

create table if not exists memberships (
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null check (role in ('ops', 'brand', 'host')),
  brand_id   uuid references brands(id) on delete cascade,
  -- a host user is bound to exactly one community in the index
  community_id uuid references communities(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

alter table memberships enable row level security;
alter table memberships force row level security;

create policy memberships_self_read on memberships
  for select using (user_id = auth.uid());
-- No insert/update/delete policy: memberships are managed server side with the
-- service role only. A user must never be able to grant themselves a role.

create or replace function is_ops() returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships m where m.user_id = auth.uid() and m.role = 'ops');
$$;

create or replace function my_brand_ids() returns setof uuid
  language sql stable security definer set search_path = public as $$
  select m.brand_id from memberships m
   where m.user_id = auth.uid() and m.role = 'brand' and m.brand_id is not null;
$$;

create or replace function my_community_ids() returns setof uuid
  language sql stable security definer set search_path = public as $$
  select m.community_id from memberships m
   where m.user_id = auth.uid() and m.role = 'host' and m.community_id is not null;
$$;

-- ---------------------------------------------------------------------------
-- communities: readable by any signed-in user, writable by ops only.
-- ---------------------------------------------------------------------------

create policy communities_read on communities
  for select to authenticated using (true);

create policy communities_write on communities
  for all to authenticated using (is_ops()) with check (is_ops());

-- ---------------------------------------------------------------------------
-- brands / briefs / plans: owner or ops.
-- ---------------------------------------------------------------------------

create policy brands_read on brands
  for select to authenticated
  using (is_ops() or id in (select my_brand_ids()));

create policy briefs_owner on briefs
  for all to authenticated
  using (is_ops() or brand_id in (select my_brand_ids()))
  with check (is_ops() or brand_id in (select my_brand_ids()));

create policy plans_owner on plans
  for all to authenticated
  using (
    is_ops() or exists (
      select 1 from briefs b
       where b.id = plans.brief_id and b.brand_id in (select my_brand_ids())
    )
  )
  with check (
    is_ops() or exists (
      select 1 from briefs b
       where b.id = plans.brief_id and b.brand_id in (select my_brand_ids())
    )
  );

-- ---------------------------------------------------------------------------
-- placements: the important one.
--
-- A host sees only placements offered to their own community, and must never
-- see another host's fee. A brand sees only placements inside their own plans.
--
-- Note that column-level fee hiding is NOT expressible in RLS. Hosts read
-- through the `host_placements` view below, which omits every other host's
-- economics. Never expose the base table to a host role.
-- ---------------------------------------------------------------------------

create policy placements_brand_read on placements
  for select to authenticated
  using (
    is_ops() or exists (
      select 1 from plans p join briefs b on b.id = p.brief_id
       where p.id = placements.plan_id and b.brand_id in (select my_brand_ids())
    )
  );

create policy placements_host_read on placements
  for select to authenticated
  using (community_id in (select my_community_ids()));

-- Hosts do not write to placements directly. Accept and decline go through a
-- server route that re-derives the actor from the session, checks ownership, and
-- enforces the status state machine. See docs/SECURITY.md section 4.
create policy placements_ops_write on placements
  for all to authenticated using (is_ops()) with check (is_ops());

create or replace view host_placements
with (security_invoker = true) as
  select
    pl.id, pl.plan_id, pl.community_id, pl.status,
    pl.fee_cents, pl.host_payout_cents,   -- this host's own economics only
    pl.check_in_code, pl.accepted_at,
    pl.deposit_released_at, pl.balance_released_at, pl.created_at
  from placements pl
  where pl.community_id in (select my_community_ids());

-- ---------------------------------------------------------------------------
-- check_ins: no client writes, ever.
--
-- A public unauthenticated insert here was the worst flaw in the first design,
-- because check-in count fed payout release. Inserts now happen only through a
-- server route holding the service role, which rate limits, deduplicates, and
-- caps against stated attendance. Funds are released by an explicit ops action
-- that reads the count, never by the count itself.
-- ---------------------------------------------------------------------------

create policy check_ins_read on check_ins
  for select to authenticated
  using (
    is_ops() or exists (
      select 1 from placements pl
       where pl.id = check_ins.placement_id
         and pl.community_id in (select my_community_ids())
    )
  );

-- Deliberately no insert/update/delete policy for authenticated or anon.

-- ---------------------------------------------------------------------------
-- Lock down the anon role entirely. Nothing in this product is public-readable.
-- Shared plans render through a server route that validates a hashed token.
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;

-- ---------------------------------------------------------------------------
-- Verification. Run after every migration. Any row returned is a bug.
-- ---------------------------------------------------------------------------

-- Tables with RLS off:
--   select tablename from pg_tables t
--    where schemaname = 'public'
--      and not exists (select 1 from pg_class c
--                       where c.relname = t.tablename and c.relrowsecurity);
--
-- Tables with RLS on but no policy (deny-all, usually a mistake):
--   select c.relname from pg_class c
--    join pg_namespace n on n.oid = c.relnamespace
--    where n.nspname = 'public' and c.relrowsecurity
--      and not exists (select 1 from pg_policy p where p.polrelid = c.oid);
