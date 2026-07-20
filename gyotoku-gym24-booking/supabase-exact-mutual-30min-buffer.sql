-- ヨガ個別予約と行徳ジム24の相互インターバルを正確に前後30分へ統一
-- 実行先: 行徳ジム24 Supabase
begin;

create or replace function public.fs_yoga_conflicts_gym(
  p_date date,p_start_minute integer,p_end_minute integer,p_ignore_id uuid default null
) returns boolean language sql stable security definer set search_path=public as $$
  with yoga_block as (
    select p_date::timestamp + make_interval(mins=>p_start_minute-30) s,
           p_date::timestamp + make_interval(mins=>p_end_minute+30) e
  )
  select exists(
    select 1 from yoga_block y join public.fs_reservations r
      on not r.cancelled and (p_ignore_id is null or r.id<>p_ignore_id)
     and r.date between p_date-1 and p_date+1
     and y.s < r.date::timestamp + make_interval(mins=>r.start_minute+coalesce(r.use_minutes_snapshot,40))
     and r.date::timestamp + make_interval(mins=>r.start_minute) < y.e
  );
$$;

create or replace function public.fs_gym_conflicts_yoga(
  p_date date,p_start_minute integer,p_use_minutes integer
) returns boolean language sql stable security definer set search_path=public as $$
  with gym_raw as (
    select p_date::timestamp + make_interval(mins=>p_start_minute) s,
           p_date::timestamp + make_interval(mins=>p_start_minute+p_use_minutes) e
  )
  select exists(
    select 1 from gym_raw g join public.fs_yoga_private_reservations y
      on not y.cancelled and y.date between p_date-1 and p_date+1
     and g.s < y.date::timestamp + make_interval(mins=>y.end_minute+30)
     and y.date::timestamp + make_interval(mins=>y.start_minute-30) < g.e
  );
$$;

commit;

select routine_name from information_schema.routines
where routine_schema='public'
  and routine_name in ('fs_yoga_conflicts_gym','fs_gym_conflicts_yoga')
order by routine_name;
