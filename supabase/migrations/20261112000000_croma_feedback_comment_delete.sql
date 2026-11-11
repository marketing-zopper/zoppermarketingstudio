-- Croma Feedback Dashboard: delete a comment (by its author or an Admin).
-- Run AFTER 20261111000000_croma_feedback_dashboard.sql. Additive and safe to re-run: it adds two columns and
-- replaces functions; it never touches croma_feedback_submissions, croma_stores, or existing comment text.
--
-- A deleted comment is SOFT-deleted: the row stays (with who deleted it and when) so there is an audit trail,
-- but it disappears from the dashboard and from comment counts. The text itself can never be edited or erased.

alter table public.croma_feedback_comments
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by text;

-- Comments stay immutable, with one exception: a live comment may be marked deleted, once.
create or replace function public.croma_feedback_comments_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'croma_feedback_comments rows are never removed';
  end if;
  if old.deleted_at is not null
     or new.deleted_at is null
     or new.deleted_by is null
     or new.id            is distinct from old.id
     or new.submission_id is distinct from old.submission_id
     or new.author_email  is distinct from old.author_email
     or new.author_name   is distinct from old.author_name
     or new.body          is distinct from old.body
     or new.created_at    is distinct from old.created_at then
    raise exception 'croma_feedback_comments are append-only; a comment can only be marked deleted';
  end if;
  return new;
end $$;

drop trigger if exists croma_feedback_comments_append_only on public.croma_feedback_comments;
create trigger croma_feedback_comments_append_only before update or delete on public.croma_feedback_comments
  for each row execute function public.croma_feedback_comments_guard();

-- List: deleted comments no longer count.
create or replace function public.croma_feedback_list(
  p_archived boolean default false,
  p_q        text    default null,
  p_store    text    default null,
  p_state    text    default null,
  p_rating   int     default null,
  p_from     timestamptz default null,
  p_to       timestamptz default null,
  p_sort     text    default 'newest',
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
           (select count(*) from public.croma_feedback_comments c where c.submission_id = s.id and c.deleted_at is null)::int as comment_count
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

-- Detail: deleted comments are hidden.
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
      from croma_feedback_comments c where c.submission_id = s.id and c.deleted_at is null
    ), '[]'::jsonb)
  )
  from croma_feedback_submissions s
  join croma_stores st on st.store_id = s.store_id
  left join croma_feedback_archive a on a.submission_id = s.id
  where s.id = p_id
$$;

-- Delete a comment. p_is_admin is decided by the Master App server from the caller's verified role (never from the
-- request): Admins / Global Super Admin may delete any comment; everyone else only their own. Comments on archived
-- feedback can only be deleted by an admin (archived feedback is invisible to the other roles).
create or replace function public.croma_feedback_delete_comment(p_comment uuid, p_actor text, p_is_admin boolean) returns jsonb
language plpgsql set search_path = public as $$
declare
  v_row croma_feedback_comments;
begin
  select * into v_row from croma_feedback_comments where id = p_comment and deleted_at is null;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if not p_is_admin and exists (select 1 from croma_feedback_archive where submission_id = v_row.submission_id) then
    return jsonb_build_object('status', 'not_found');
  end if;
  if not p_is_admin and v_row.author_email <> lower(p_actor) then
    return jsonb_build_object('status', 'forbidden');
  end if;
  update croma_feedback_comments set deleted_at = now(), deleted_by = lower(p_actor) where id = p_comment;
  return jsonb_build_object('status', 'ok', 'submission_id', v_row.submission_id);
end $$;

revoke all on function public.croma_feedback_list(boolean, text, text, text, int, timestamptz, timestamptz, text, int, int) from public, anon, authenticated;
revoke all on function public.croma_feedback_detail(uuid)                          from public, anon, authenticated;
revoke all on function public.croma_feedback_delete_comment(uuid, text, boolean)   from public, anon, authenticated;
grant execute on function public.croma_feedback_list(boolean, text, text, text, int, timestamptz, timestamptz, text, int, int) to service_role;
grant execute on function public.croma_feedback_detail(uuid)                       to service_role;
grant execute on function public.croma_feedback_delete_comment(uuid, text, boolean) to service_role;

notify pgrst, 'reload schema';
