-- Fair-defined space/booth types (10x10, 20x20, Cart, Walk-in, etc.) with per-weekend pricing.
-- Additive only — does not touch the existing fair_weekend_pricing table/RPCs
-- (vendor_price / food_vendor_price / performer_fee stay as-is for fairs that don't need
-- per-space-type pricing).

create table if not exists public.fair_space_types (
  id bigint generated always as identity primary key,
  fair_id integer not null references public.renaissance_fairs(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (fair_id, name)
);

create table if not exists public.fair_space_type_pricing (
  id bigint generated always as identity primary key,
  fair_id integer not null references public.renaissance_fairs(id) on delete cascade,
  space_type_id bigint not null references public.fair_space_types(id) on delete cascade,
  week_number int not null,
  price numeric(10,2) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (space_type_id, week_number)
);

alter table public.fair_space_types enable row level security;
alter table public.fair_space_type_pricing enable row level security;
-- Same pattern as fair_schedule_locations/fair_schedule_events: RLS on, zero table
-- policies, all access via SECURITY DEFINER RPCs below.

-- Add / rename a space type. Pass p_id to rename an existing one, or null to create.
create or replace function public.upsert_fair_space_type(
  p_fair_id integer,
  p_id bigint default null,
  p_name text default null,
  p_sort_order int default null
)
returns public.fair_space_types
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_row public.fair_space_types;
begin
  if not exists (
    select 1 from public.fair_admins fa
    where fa.user_id = auth.uid() and fa.fair_id = p_fair_id
  ) then
    raise exception 'not authorized';
  end if;

  if p_id is not null then
    update public.fair_space_types
    set name = coalesce(p_name, name),
        sort_order = coalesce(p_sort_order, sort_order)
    where id = p_id and fair_id = p_fair_id
    returning * into v_row;
  else
    insert into public.fair_space_types (fair_id, name, sort_order)
    values (p_fair_id, p_name, coalesce(p_sort_order, 0))
    returning * into v_row;
  end if;

  return v_row;
end;
$$;

create or replace function public.delete_fair_space_type(p_fair_id integer, p_id bigint)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not exists (
    select 1 from public.fair_admins fa
    where fa.user_id = auth.uid() and fa.fair_id = p_fair_id
  ) then
    raise exception 'not authorized';
  end if;

  delete from public.fair_space_types where id = p_id and fair_id = p_fair_id;
end;
$$;

-- Public-readable: anyone can see what space types a fair offers (e.g. to populate an
-- application form's booth-size dropdown).
create or replace function public.get_fair_space_types(p_fair_id integer)
returns setof public.fair_space_types
language sql
stable
security definer
set search_path to 'public'
as $$
  select * from public.fair_space_types
  where fair_id = p_fair_id
  order by sort_order, name;
$$;

-- Set/update the price for one space type in one weekend.
create or replace function public.upsert_fair_space_type_price(
  p_fair_id integer,
  p_space_type_id bigint,
  p_week_number int,
  p_price numeric,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not exists (
    select 1 from public.fair_admins fa
    where fa.user_id = auth.uid() and fa.fair_id = p_fair_id
  ) then
    raise exception 'not authorized';
  end if;

  if not exists (
    select 1 from public.fair_space_types st
    where st.id = p_space_type_id and st.fair_id = p_fair_id
  ) then
    raise exception 'space type does not belong to this fair';
  end if;

  insert into public.fair_space_type_pricing (fair_id, space_type_id, week_number, price, notes)
  values (p_fair_id, p_space_type_id, p_week_number, p_price, p_notes)
  on conflict (space_type_id, week_number)
  do update set price = excluded.price, notes = excluded.notes, updated_at = now();
end;
$$;

-- Public-readable: full pricing grid (space type name + price per weekend) for a fair.
create or replace function public.get_fair_space_type_pricing(p_fair_id integer)
returns table (
  space_type_id bigint,
  space_type_name text,
  sort_order int,
  week_number int,
  price numeric,
  notes text
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select st.id, st.name, st.sort_order, p.week_number, p.price, p.notes
  from public.fair_space_types st
  left join public.fair_space_type_pricing p on p.space_type_id = st.id
  where st.fair_id = p_fair_id
  order by st.sort_order, st.name, p.week_number;
$$;
