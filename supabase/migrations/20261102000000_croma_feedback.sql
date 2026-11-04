-- Croma x Zopper QR Feedback Form
-- Safe to re-run: every statement is idempotent.
--
-- Access model: the browser never talks to Supabase. The Vercel API (api/feedback/*) uses the
-- server-only secret key. RLS is enabled with NO policies and all table privileges are revoked
-- from the public roles, so the anon / publishable key can neither read nor write anything.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------------------------
-- Stores (seeded from the Croma workbook, "Total" sheet; see scripts/seed-croma-stores.mjs)
-- ---------------------------------------------------------------------------------------------
create table if not exists public.croma_stores (
  store_id            text primary key check (store_id ~ '^A[0-9]{3}$'),
  store_name          text not null check (char_length(btrim(store_name)) > 0),
  state               text,
  store_address       text not null check (char_length(btrim(store_address)) > 0),
  croma_website_name  text,
  store_category      text check (store_category in ('where_we_can_deliver', 'direct_to_store')),
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists croma_stores_active_idx on public.croma_stores (is_active, store_name);

-- ---------------------------------------------------------------------------------------------
-- Feedback submissions
-- ---------------------------------------------------------------------------------------------
create table if not exists public.croma_feedback_submissions (
  id                uuid primary key default gen_random_uuid(),
  store_id          text not null references public.croma_stores (store_id) on update cascade on delete restrict,
  respondent_name   text not null check (char_length(btrim(respondent_name)) between 2 and 80),
  phone_number      text not null check (phone_number ~ '^\+91[6-9][0-9]{9}$'),
  experience_rating smallint not null check (experience_rating between 1 and 5),
  personal_feedback text not null check (char_length(btrim(personal_feedback)) between 3 and 1000),
  -- Client-generated key: a double click / retry of the same form can never create a second row.
  idempotency_key   uuid not null unique,
  -- Salted hash of the caller IP, used only for abuse rate limiting (never the raw address).
  ip_hash           text,
  -- timestamptz is stored as UTC internally; clients convert on display.
  created_at        timestamptz not null default now()
);

create index if not exists croma_feedback_store_created_idx on public.croma_feedback_submissions (store_id, created_at desc);
create index if not exists croma_feedback_created_idx       on public.croma_feedback_submissions (created_at desc);
create index if not exists croma_feedback_iphash_idx        on public.croma_feedback_submissions (ip_hash, created_at desc);
create index if not exists croma_feedback_dupe_idx          on public.croma_feedback_submissions (phone_number, store_id, created_at desc);

-- keep croma_stores.updated_at honest
create or replace function public.croma_touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists croma_stores_touch on public.croma_stores;
create trigger croma_stores_touch before update on public.croma_stores
  for each row execute function public.croma_touch_updated_at();

-- ---------------------------------------------------------------------------------------------
-- Lock-down: anonymous visitors can submit through the API but can never read/modify rows directly
-- ---------------------------------------------------------------------------------------------
alter table public.croma_stores               enable row level security;
alter table public.croma_feedback_submissions enable row level security;

revoke all on public.croma_stores               from anon, authenticated;
revoke all on public.croma_feedback_submissions from anon, authenticated;

comment on table public.croma_feedback_submissions is
  'Croma store feedback. Written only by the Zopper Marketing Studio API (secret key); no public policies by design.';
