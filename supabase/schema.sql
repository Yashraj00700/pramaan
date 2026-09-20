-- Pramaan: scans table migration
-- Run against a Supabase/Postgres project (requires pgcrypto or pgsodium for gen_random_uuid()).

create extension if not exists pgcrypto;

create table if not exists public.scans (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  file_name text,
  media_type text,
  thumbnail text,
  report jsonb not null
);

create index if not exists scans_created_at_idx on public.scans (created_at desc);

-- HACKATHON NOTE: Row Level Security is intentionally left DISABLED on this table
-- for demo speed. Before any real/multi-tenant deployment, enable RLS and add
-- policies scoped to the authenticated user, e.g.:
--   alter table public.scans enable row level security;
--   create policy "scans_select_own" on public.scans for select using (auth.uid() = user_id);
