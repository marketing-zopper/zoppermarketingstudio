-- Croma Feedback Dashboard: allow deleting a submission straight from the Supabase table editor.
--
-- Until now a submission that had dashboard comments / archive history could not be deleted
-- (foreign keys were ON DELETE RESTRICT). With this migration, deleting a submission also removes
-- its dashboard comments and archive records.
--
-- Unchanged protections: a comment or archive event can still NOT be edited, and can still NOT be
-- deleted on its own - it only goes away together with its submission.
-- Safe to re-run. Run after 20261112000000_croma_feedback_comment_delete.sql.

alter table public.croma_feedback_comments
  drop constraint if exists croma_feedback_comments_submission_id_fkey,
  add  constraint croma_feedback_comments_submission_id_fkey
       foreign key (submission_id) references public.croma_feedback_submissions (id) on delete cascade;

alter table public.croma_feedback_archive
  drop constraint if exists croma_feedback_archive_submission_id_fkey,
  add  constraint croma_feedback_archive_submission_id_fkey
       foreign key (submission_id) references public.croma_feedback_submissions (id) on delete cascade;

alter table public.croma_feedback_archive_events
  drop constraint if exists croma_feedback_archive_events_submission_id_fkey,
  add  constraint croma_feedback_archive_events_submission_id_fkey
       foreign key (submission_id) references public.croma_feedback_submissions (id) on delete cascade;

-- Append-only guards: a DELETE is allowed only when the parent submission is already gone
-- (i.e. it is the cascade from deleting the submission). Anything else still raises.
create or replace function public.croma_feedback_append_only()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE'
     and not exists (select 1 from public.croma_feedback_submissions s where s.id = old.submission_id) then
    return old;
  end if;
  raise exception '% is append-only', tg_table_name;
end $$;

create or replace function public.croma_feedback_comments_guard()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if not exists (select 1 from public.croma_feedback_submissions s where s.id = old.submission_id) then
      return old;
    end if;
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
