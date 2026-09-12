-- Fair star-rating feature (1-5, Google-style click rating)

create table if not exists public.fair_reviews (
  id bigint generated always as identity primary key,
  fair_id integer not null references public.renaissance_fairs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (fair_id, user_id)
);

alter table public.fair_reviews enable row level security;

drop policy if exists "user can read own review" on public.fair_reviews;
create policy "user can read own review"
  on public.fair_reviews for select
  using (auth.uid() = user_id);

drop policy if exists "user can insert own review" on public.fair_reviews;
create policy "user can insert own review"
  on public.fair_reviews for insert
  with check (auth.uid() = user_id);

drop policy if exists "user can update own review" on public.fair_reviews;
create policy "user can update own review"
  on public.fair_reviews for update
  using (auth.uid() = user_id);

-- Set or change your own rating for a fair (1-5). Upserts on (fair_id, user_id).
create or replace function public.upsert_fair_review(p_fair_id integer, p_rating smallint)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null then
    raise exception 'not authorized';
  end if;
  if p_rating < 1 or p_rating > 5 then
    raise exception 'invalid rating';
  end if;

  insert into public.fair_reviews (fair_id, user_id, rating)
  values (p_fair_id, auth.uid(), p_rating)
  on conflict (fair_id, user_id)
  do update set rating = excluded.rating, updated_at = now();
end;
$$;

-- Public aggregate: average rating + count for a fair. Bypasses RLS via SECURITY DEFINER
-- so anonymous visitors can see the average without seeing who rated what.
create or replace function public.get_fair_rating_summary(p_fair_id integer)
returns table(avg_rating numeric, review_count integer)
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(round(avg(rating)::numeric, 1), 0)::numeric as avg_rating,
         count(*)::integer as review_count
  from public.fair_reviews
  where fair_id = p_fair_id;
$$;

-- The logged-in caller's own rating for a fair, or null if they haven't rated.
create or replace function public.get_my_fair_review(p_fair_id integer)
returns smallint
language sql
stable
security definer
set search_path to 'public'
as $$
  select rating from public.fair_reviews
  where fair_id = p_fair_id and user_id = auth.uid();
$$;
