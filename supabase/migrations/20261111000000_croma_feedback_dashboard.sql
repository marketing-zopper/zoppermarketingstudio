-- Croma Feedback Dashboard (Zopper Marketing Studio Master App)
-- ADDITIVE ONLY and safe to re-run: it never alters or deletes croma_stores, croma_feedback_submissions
-- or any existing row. It needs those two tables, which the standalone Croma feedback form created.
--
-- Access model (same as the form's tables): the browser never talks to Supabase. Only the Master App's
-- serverless APIs call these tables/functions with the server-only secret key, after checking the signed-in
-- employee's role in Upstash Redis. RLS is on with no policies; everything is revoked from anon/authenticated.

-- ---------------------------------------------------------------------------------------------
-- 1. Internal comments (append-only: no edits, no deletes)
-- ---------------------------------------------------------------------------------------------
create table if not exists public.croma_feedback_comments (
  id            uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.croma_feedback_submissions (id) on delete restrict,
  author_email  text not null check (author_email ~ '^[^@[:space:]]+@zopper\.com$'),
  author_name   text not null check (char_length(btrim(author_name)) between 1 and 120),
  body          text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at    timestamptz not null default now()
);
create index if not exists croma_feedback_comments_sub_idx on public.croma_feedback_comments (submission_id, created_at);

-- ---------------------------------------------------------------------------------------------
-- 2. Archive status (a row exists only while a submission is archived) + permanent audit trail
-- ---------------------------------------------------------------------------------------------
create table if not exists public.croma_feedback_archive (
  submission_id uuid primary key references public.croma_feedback_submissions (id) on delete restrict,
  archived_by   text not null,
  archived_at   timestamptz not null default now()
);

create table if not exists public.croma_feedback_archive_events (
  id            bigint generated always as identity primary key,
  submission_id uuid not null references public.croma_feedback_submissions (id) on delete restrict,
  action        text not null check (action in ('archived', 'restored')),
  actor_email   text not null,
  created_at    timestamptz not null default now()
);
create index if not exists croma_feedback_archive_events_sub_idx on public.croma_feedback_archive_events (submission_id, created_at);

-- Comments and the audit trail are never edited or removed (archive state itself is toggled).
create or replace function public.croma_feedback_append_only() returns trigger
language plpgsql as $$
begin
  raise exception '% is append-only', tg_table_name;
end $$;

drop trigger if exists croma_feedback_comments_append_only on public.croma_feedback_comments;
create trigger croma_feedback_comments_append_only before update or delete on public.croma_feedback_comments
  for each row execute function public.croma_feedback_append_only();

drop trigger if exists croma_feedback_archive_events_append_only on public.croma_feedback_archive_events;
create trigger croma_feedback_archive_events_append_only before update or delete on public.croma_feedback_archive_events
  for each row execute function public.croma_feedback_append_only();

-- ---------------------------------------------------------------------------------------------
-- 3. Lock-down
-- ---------------------------------------------------------------------------------------------
alter table public.croma_feedback_comments       enable row level security;
alter table public.croma_feedback_archive        enable row level security;
alter table public.croma_feedback_archive_events enable row level security;

revoke all on public.croma_feedback_comments       from anon, authenticated;
revoke all on public.croma_feedback_archive        from anon, authenticated;
revoke all on public.croma_feedback_archive_events from anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- 4. Query functions used by the Master App API (parameterised: no SQL is built from user input)
-- ---------------------------------------------------------------------------------------------

-- Paged, filtered, sorted list. p_archived = false -> active feed, true -> archived tab.
create or replace function public.croma_feedback_list(
  p_archived boolean default false,
  p_q        text    default null,
  p_store    text    default null,
  p_state    text    default null,
  p_rating   int     default null,
  p_from     timestamptz default null,
  p_to       timestamptz default null,   -- exclusive upper bound
  p_sort     text    default 'newest',   -- newest | oldest | rating_high | rating_low
  p_limit    int     default 20,
  p_offset   int     default 0
) returns jsonb
language plpgsql stable set search_path = public as $$
declare
  v_like text := case
    when nullif(btrim(p_q), '') is null then null
    else '%' || replace(replace(replace(btrim(p_q), E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%'
  end;
  v_result jsonb;
begin
  with base as (
    select s.id, s.created_at, s.experience_rating as rating, s.respondent_name,
           left(s.personal_feedback, 220) as preview,
           char_length(s.personal_feedback) > 220 as truncated,
           s.store_id, st.store_name, st.state,
           (select count(*) from public.croma_feedback_comments c where c.submission_id = s.id)::int as comment_count
    from public.croma_feedback_submissions s
    join public.croma_stores st on st.store_id = s.store_id
    left join public.croma_feedback_archive a on a.submission_id = s.id
    where (a.submission_id is not null) = coalesce(p_archived, false)
      and (p_store  is null or s.store_id = p_store)
      and (p_state  is null or st.state = p_state)
      and (p_rating is null or s.experience_rating = p_rating)
      and (p_from   is null or s.created_at >= p_from)
      and (p_to     is null or s.created_at <  p_to)
      and (v_like is null
           or s.respondent_name ilike v_like
           or s.personal_feedback ilike v_like
           or s.store_id ilike v_like
           or st.store_name ilike v_like)
  ), page as (
    select b.*, row_number() over (
      order by
        (case p_sort when 'rating_high' then b.rating when 'rating_low' then -b.rating else 0 end) desc,
        (case when p_sort = 'oldest' then b.created_at end) asc,
        b.created_at desc, b.id
    ) as rn
    from base b
  )
  select jsonb_build_object(
    'total', (select count(*) from base),
    'items', coalesce((
      select jsonb_agg(to_jsonb(p) - 'rn' order by p.rn)
      from page p
      where p.rn > greatest(p_offset, 0) and p.rn <= greatest(p_offset, 0) + least(greatest(p_limit, 1), 100)
    ), '[]'::jsonb)
  ) into v_result;
  return v_result;
end $$;

-- Overview metrics (active feedback only) + the values that populate the filter drop-downs.
create or replace function public.croma_feedback_summary() returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'total',    (select count(*) from croma_feedback_submissions s
                 where not exists (select 1 from croma_feedback_archive a where a.submission_id = s.id)),
    'average',  (select round(avg(s.experience_rating)::numeric, 2) from croma_feedback_submissions s
                 where not exists (select 1 from croma_feedback_archive a where a.submission_id = s.id)),
    'stores',   (select count(distinct s.store_id) from croma_feedback_submissions s
                 where not exists (select 1 from croma_feedback_archive a where a.submission_id = s.id)),
    'archived', (select count(*) from croma_feedback_archive),
    'storeOptions', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.store_id, 'name', x.store_name, 'state', x.state) order by x.store_name, x.store_id)
      from (select distinct st.store_id, st.store_name, st.state
            from croma_stores st join croma_feedback_submissions s on s.store_id = st.store_id) x
    ), '[]'::jsonb),
    'stateOptions', coalesce((
      select jsonb_agg(y.state order by y.state)
      from (select distinct st.state
            from croma_stores st join croma_feedback_submissions s on s.store_id = st.store_id
            where st.state is not null) y
    ), '[]'::jsonb)
  )
$$;

-- One submission with its store, archive status and comment history.
create or replace function public.croma_feedback_detail(p_id uuid) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'id', s.id,
    'created_at', s.created_at,
    'rating', s.experience_rating,
    'feedback', s.personal_feedback,
    'respondent_name', s.respondent_name,
    'phone_number', s.phone_number,
    'store', jsonb_build_object('id', st.store_id, 'name', st.store_name, 'state', st.state, 'address', st.store_address),
    'archived', a.submission_id is not null,
    'archived_by', a.archived_by,
    'archived_at', a.archived_at,
    'comments', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'author_name', c.author_name, 'author_email', c.author_email,
                                          'body', c.body, 'created_at', c.created_at) order by c.created_at, c.id)
      from croma_feedback_comments c where c.submission_id = s.id
    ), '[]'::jsonb)
  )
  from croma_feedback_submissions s
  join croma_stores st on st.store_id = s.store_id
  left join croma_feedback_archive a on a.submission_id = s.id
  where s.id = p_id
$$;

-- Add an internal comment to ACTIVE feedback only. Author fields come from the verified Master App session.
create or replace function public.croma_feedback_add_comment(p_id uuid, p_email text, p_name text, p_body text) returns jsonb
language plpgsql set search_path = public as $$
declare v_row croma_feedback_comments;
begin
  if not exists (select 1 from croma_feedback_submissions where id = p_id) then
    return jsonb_build_object('status', 'not_found');
  end if;
  if exists (select 1 from croma_feedback_archive where submission_id = p_id) then
    return jsonb_build_object('status', 'archived');
  end if;
  insert into croma_feedback_comments (submission_id, author_email, author_name, body)
  values (p_id, lower(p_email), btrim(p_name), btrim(p_body))
  returning * into v_row;
  return jsonb_build_object('status', 'ok', 'comment', jsonb_build_object(
    'id', v_row.id, 'author_name', v_row.author_name, 'author_email', v_row.author_email,
    'body', v_row.body, 'created_at', v_row.created_at));
end $$;

-- Archive / restore (idempotent) with an audit event whenever the state really changes.
create or replace function public.croma_feedback_set_archived(p_id uuid, p_archive boolean, p_actor text) returns jsonb
language plpgsql set search_path = public as $$
declare v_changed boolean := false;
begin
  if not exists (select 1 from croma_feedback_submissions where id = p_id) then
    return jsonb_build_object('status', 'not_found');
  end if;
  if p_archive then
    insert into croma_feedback_archive (submission_id, archived_by) values (p_id, lower(p_actor))
    on conflict (submission_id) do nothing;
    v_changed := found;
  else
    delete from croma_feedback_archive where submission_id = p_id;
    v_changed := found;
  end if;
  if v_changed then
    insert into croma_feedback_archive_events (submission_id, action, actor_email)
    values (p_id, case when p_archive then 'archived' else 'restored' end, lower(p_actor));
  end if;
  return jsonb_build_object('status', 'ok', 'archived', p_archive, 'changed', v_changed);
end $$;

-- Only the server-side secret key may call these.
revoke all on function public.croma_feedback_list(boolean, text, text, text, int, timestamptz, timestamptz, text, int, int) from public, anon, authenticated;
revoke all on function public.croma_feedback_summary()                                  from public, anon, authenticated;
revoke all on function public.croma_feedback_detail(uuid)                               from public, anon, authenticated;
revoke all on function public.croma_feedback_add_comment(uuid, text, text, text)        from public, anon, authenticated;
revoke all on function public.croma_feedback_set_archived(uuid, boolean, text)          from public, anon, authenticated;
grant execute on function public.croma_feedback_list(boolean, text, text, text, int, timestamptz, timestamptz, text, int, int) to service_role;
grant execute on function public.croma_feedback_summary()                               to service_role;
grant execute on function public.croma_feedback_detail(uuid)                            to service_role;
grant execute on function public.croma_feedback_add_comment(uuid, text, text, text)     to service_role;
grant execute on function public.croma_feedback_set_archived(uuid, boolean, text)       to service_role;

notify pgrst, 'reload schema';
