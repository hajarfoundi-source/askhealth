-- =========================================================
-- ASKHEALTH — Supabase schema
-- Run once in Supabase Dashboard → SQL Editor.
--
-- Each table mirrors a former Firestore collection: one row per
-- document, the whole record stored as JSON in `data`.
-- crm/js/db.js reads and writes these tables with the anon key.
-- =========================================================

create table if not exists public.users (
  id         text primary key,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.leads (
  id         text primary key,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.exhibitors (
  id         text primary key,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

-- badge_seq / invoice_seq counters
create table if not exists public.config (
  id         text primary key,
  value      text not null default '0',
  updated_at timestamptz not null default now()
);

-- ── Row Level Security ───────────────────────────────────
-- Matches the previous Firestore rules (open read/write), because the
-- CRM logs users in client-side. Tighten this once auth moves to
-- Supabase Auth.
alter table public.users      enable row level security;
alter table public.leads      enable row level security;
alter table public.exhibitors enable row level security;
alter table public.config     enable row level security;

drop policy if exists "anon full access" on public.users;
drop policy if exists "anon full access" on public.leads;
drop policy if exists "anon full access" on public.exhibitors;
drop policy if exists "anon full access" on public.config;

create policy "anon full access" on public.users      for all to anon, authenticated using (true) with check (true);
create policy "anon full access" on public.leads      for all to anon, authenticated using (true) with check (true);
create policy "anon full access" on public.exhibitors for all to anon, authenticated using (true) with check (true);
create policy "anon full access" on public.config     for all to anon, authenticated using (true) with check (true);

-- ── Realtime (live CRM updates across devices) ───────────
do $$
begin
  begin alter publication supabase_realtime add table public.users;      exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.leads;      exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.exhibitors; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.config;     exception when duplicate_object then null; end;
end $$;
