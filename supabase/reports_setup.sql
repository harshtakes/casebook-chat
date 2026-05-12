create extension if not exists pgcrypto;

alter table public.posts
add column if not exists vote_base integer;

update public.posts
set vote_base = coalesce(upvotes, 0)
where vote_base is null;

alter table public.posts
alter column vote_base set default 0;

alter table public.posts
alter column vote_base set not null;

create table if not exists public.post_votes (
  post_id uuid not null references public.posts(id) on delete cascade,
  voter_key text not null,
  vote_value smallint not null check (vote_value in (-1, 1)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (post_id, voter_key)
);

create or replace function public.sync_post_vote_score(target_post_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  next_score integer;
begin
  select
    coalesce(posts.vote_base, 0) + coalesce(sum(post_votes.vote_value), 0)::integer
  into next_score
  from public.posts
  left join public.post_votes on post_votes.post_id = posts.id
  where posts.id = target_post_id
  group by posts.id, posts.vote_base;

  update public.posts
  set upvotes = coalesce(next_score, 0)
  where id = target_post_id;

  return coalesce(next_score, 0);
end;
$$;

drop function if exists public.cast_post_vote(uuid, smallint, text);

create or replace function public.cast_post_vote(
  p_post_id uuid,
  p_value integer,
  p_voter_key text
)
returns table (
  post_id uuid,
  score integer,
  vote_value integer,
  changed boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  previous_vote integer;
  next_score integer;
begin
  if p_value not in (-1, 1) then
    raise exception 'Vote must be -1 or 1';
  end if;

  select post_votes.vote_value
  into previous_vote
  from public.post_votes
  where post_votes.post_id = p_post_id
    and post_votes.voter_key = p_voter_key;

  if previous_vote = p_value then
    next_score := public.sync_post_vote_score(p_post_id);
    return query select p_post_id, next_score, previous_vote, false;
    return;
  end if;

  insert into public.post_votes (post_id, voter_key, vote_value)
  values (p_post_id, p_voter_key, p_value)
  on conflict (post_id, voter_key)
  do update set
    vote_value = excluded.vote_value,
    updated_at = now();

  next_score := public.sync_post_vote_score(p_post_id);
  return query select p_post_id, next_score, p_value, true;
end;
$$;

create or replace function public.get_post_votes_for_voter(
  p_post_ids uuid[],
  p_voter_key text
)
returns table (
  post_id uuid,
  vote_value smallint
)
language sql
security definer
set search_path = public
as $$
  select post_votes.post_id, post_votes.vote_value
  from public.post_votes
  where post_votes.post_id = any(p_post_ids)
    and post_votes.voter_key = p_voter_key;
$$;

create or replace function public.sync_post_reply_count(target_post_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.posts
  set reply_count = (
    select count(*)::integer
    from public.comments
    where post_id = target_post_id
      and coalesce(hidden, false) = false
  )
  where id = target_post_id;
$$;

create or replace function public.handle_comment_reply_count_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.sync_post_reply_count(old.post_id);
    return old;
  end if;

  if tg_op = 'UPDATE' and new.post_id <> old.post_id then
    perform public.sync_post_reply_count(old.post_id);
  end if;

  perform public.sync_post_reply_count(new.post_id);
  return new;
end;
$$;

update public.posts
set title = left(
  case
    when nullif(trim(title), '') is null then 'Untitled community question'
    when char_length(trim(title)) < 12 then trim(title) || ' question'
    else trim(title)
  end,
  180
)
where nullif(trim(title), '') is null
  or char_length(trim(title)) < 12
  or char_length(trim(title)) > 180;

update public.posts
set body = left(coalesce(body, ''), 2500)
where body is null
  or char_length(body) > 2500;

update public.comments
set body = left(
  case
    when nullif(trim(body), '') is null then 'Legacy reply'
    when char_length(trim(body)) < 8 then trim(body) || ' reply'
    else trim(body)
  end,
  1200
)
where nullif(trim(body), '') is null
  or char_length(trim(body)) < 8
  or char_length(trim(body)) > 1200;

alter table public.posts
add column if not exists category text default 'Career Advice';

alter table public.posts
add column if not exists hidden boolean not null default false;

alter table public.posts
add column if not exists hidden_at timestamptz;

alter table public.posts
add column if not exists hidden_by text;

alter table public.posts
add column if not exists hidden_reason text;

alter table public.comments
add column if not exists hidden boolean not null default false;

alter table public.comments
add column if not exists hidden_at timestamptz;

alter table public.comments
add column if not exists hidden_by text;

alter table public.comments
add column if not exists hidden_reason text;

alter table public.posts enable row level security;
alter table public.comments enable row level security;

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  target_id uuid not null,
  target_type text not null check (target_type in ('post', 'comment')),
  reason text not null check (reason in ('harassment', 'spam', 'privacy', 'misinformation', 'other')),
  details text,
  reporter_email text,
  status text not null default 'open' check (status in ('open', 'reviewed', 'dismissed')),
  moderation_notes text,
  created_at timestamptz not null default now()
);

alter table public.reports
add column if not exists moderation_notes text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'posts_title_length_check'
  ) then
    alter table public.posts
    add constraint posts_title_length_check
    check (char_length(title) between 12 and 180);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'posts_body_length_check'
  ) then
    alter table public.posts
    add constraint posts_body_length_check
    check (char_length(body) <= 2500);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'comments_body_length_check'
  ) then
    alter table public.comments
    add constraint comments_body_length_check
    check (char_length(body) between 8 and 1200);
  end if;
end $$;

drop policy if exists "public can read posts" on public.posts;
create policy "public can read posts"
on public.posts
for select
to anon, authenticated
using (coalesce(hidden, false) = false);

drop policy if exists "anyone can insert posts" on public.posts;
create policy "anyone can insert posts"
on public.posts
for insert
to anon, authenticated
with check (true);

drop policy if exists "authenticated users can update posts" on public.posts;
create policy "authenticated users can update posts"
on public.posts
for update
to authenticated
using (true)
with check (true);

drop policy if exists "public can read comments" on public.comments;
create policy "public can read comments"
on public.comments
for select
to anon, authenticated
using (coalesce(hidden, false) = false);

drop policy if exists "anyone can insert comments" on public.comments;
create policy "anyone can insert comments"
on public.comments
for insert
to anon, authenticated
with check (true);

drop policy if exists "authenticated users can update comments" on public.comments;
create policy "authenticated users can update comments"
on public.comments
for update
to authenticated
using (true)
with check (true);

alter table public.reports enable row level security;

drop policy if exists "authenticated users can insert reports" on public.reports;
create policy "authenticated users can insert reports"
on public.reports
for insert
to authenticated
with check (true);

drop policy if exists "authenticated users can read reports" on public.reports;
create policy "authenticated users can read reports"
on public.reports
for select
to authenticated
using (true);

drop policy if exists "authenticated users can update reports" on public.reports;
create policy "authenticated users can update reports"
on public.reports
for update
to authenticated
using (true)
with check (true);

grant execute on function public.cast_post_vote(uuid, integer, text) to anon, authenticated;
grant execute on function public.get_post_votes_for_voter(uuid[], text) to anon, authenticated;

drop trigger if exists comments_sync_post_reply_count_after_insert on public.comments;
create trigger comments_sync_post_reply_count_after_insert
after insert on public.comments
for each row
execute function public.handle_comment_reply_count_sync();

drop trigger if exists comments_sync_post_reply_count_after_delete on public.comments;
create trigger comments_sync_post_reply_count_after_delete
after delete on public.comments
for each row
execute function public.handle_comment_reply_count_sync();

drop trigger if exists comments_sync_post_reply_count_after_update on public.comments;
create trigger comments_sync_post_reply_count_after_update
after update of hidden, post_id on public.comments
for each row
execute function public.handle_comment_reply_count_sync();

do $$
declare
  post_record record;
begin
  for post_record in select id from public.posts loop
    perform public.sync_post_reply_count(post_record.id);
  end loop;
end $$;

-- App-side moderator access is controlled separately via:
-- NEXT_PUBLIC_MODERATOR_EMAILS=moderator1@example.com,moderator2@example.com
