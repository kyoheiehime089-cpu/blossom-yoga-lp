-- CANDIDATE ONLY. Tested in disposable local PostgreSQL with synthetic data.
-- Production application is not approved; capture/review the live baseline first.
-- Gym and central confirmed individual Yoga use exact mutual 30-minute separation.
-- Blossom and other separate booking stores are deliberately not merged here:
-- their physical resource relationship is not confirmed.
-- Target tables were read from the FPL schema export; active public member project may differ.
-- akwzddfqxprbprgoxcmo と fplvstwmsewpqwrcsqrm は別DBで、相互ロックは共有できない。
-- DB concurrency, transaction-snapshot, active callers and canonical project remain unverified.
begin;
do $dependency$
begin
  if to_regprocedure('public.blossom_gym_conflicts_yoga(date,integer,integer)') is null then
    raise exception 'Existing Blossom guard dependency must be captured before replacement';
  end if;
end
$dependency$;

create or replace function public.fs_yoga_conflicts_gym(
  p_date date,p_start_minute integer,p_end_minute integer,p_ignore_id uuid default null
) returns boolean language sql stable security definer set search_path=pg_catalog,public,pg_temp as $$
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
) returns boolean language sql stable security definer set search_path=pg_catalog,public,pg_temp as $$
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

-- Correct the one-sided Gym-first -> central individual Yoga check. Keep the existing
-- 40-minute fallback for NULL snapshots and preserve explicit historical 40/50 values.
-- Gym and private Yoga writes share one lock so adjacent-date boundary checks cannot race.
create or replace function public.fs_reservations_yoga_guard()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare use_mins integer;
begin
  if new.cancelled then return new; end if;
  if current_setting('transaction_isolation')<>'read committed' then
    raise exception 'Shared booking writes require READ COMMITTED isolation';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('shared-booking:global',0));
  use_mins:=coalesce(new.use_minutes_snapshot,40);
  -- Keep this post-lock read in the volatile trigger, not only in a STABLE helper.
  if exists(
    select 1 from public.fs_yoga_private_reservations y
    where not y.cancelled and y.date between new.date-1 and new.date+1
      and new.date::timestamp+make_interval(mins=>new.start_minute)
          < y.date::timestamp+make_interval(mins=>y.end_minute+30)
      and y.date::timestamp+make_interval(mins=>y.start_minute-30)
          < new.date::timestamp+make_interval(mins=>new.start_minute+use_mins)
  ) then
    raise exception 'ヨガ個別予約の前後30分と重なるため予約できません。';
  end if;
  -- Preserve the already active legacy restriction; do not expand or merge stores.
  if public.blossom_gym_conflicts_yoga(new.date,new.start_minute,use_mins) then
    raise exception '既存のヨガ枠と重なるため予約できません。';
  end if;
  return new;
end $$;

create or replace function public.fs_yoga_private_reservations_gym_guard()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
begin
  if new.cancelled then return new; end if;
  if current_setting('transaction_isolation')<>'read committed' then
    raise exception 'Shared booking writes require READ COMMITTED isolation';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('shared-booking:global',0));
  if exists(
    select 1 from public.fs_yoga_private_reservations y
    where not y.cancelled and y.id is distinct from new.id and y.date between new.date-1 and new.date+1
      and new.date::timestamp+make_interval(mins=>new.start_minute)
          < y.date::timestamp+make_interval(mins=>y.end_minute)
      and y.date::timestamp+make_interval(mins=>y.start_minute)
          < new.date::timestamp+make_interval(mins=>new.end_minute)
  ) then
    raise exception '別のヨガ個別予約と重なるため登録できません。';
  end if;
  -- Recheck Gym rows directly after the lock; the conflict helper is STABLE.
  if exists(
    select 1 from public.fs_reservations r
    where not r.cancelled and r.date between new.date-1 and new.date+1
      and new.date::timestamp+make_interval(mins=>new.start_minute-30)
          < r.date::timestamp+make_interval(mins=>r.start_minute+coalesce(r.use_minutes_snapshot,40))
      and r.date::timestamp+make_interval(mins=>r.start_minute)
          < new.date::timestamp+make_interval(mins=>new.end_minute+30)
  ) then
    raise exception '行徳ジム24の予約と前後30分が重なるため予約できません。';
  end if;
  return new;
end $$;

drop trigger if exists fs_reservations_yoga_guard_trg on public.fs_reservations;
create trigger fs_reservations_yoga_guard_trg
before insert or update of date,start_minute,cancelled,use_minutes_snapshot
on public.fs_reservations for each row
execute function public.fs_reservations_yoga_guard();

drop trigger if exists fs_yoga_private_reservations_gym_guard_trg on public.fs_yoga_private_reservations;
create trigger fs_yoga_private_reservations_gym_guard_trg
before insert or update of date,start_minute,end_minute,cancelled
on public.fs_yoga_private_reservations for each row
execute function public.fs_yoga_private_reservations_gym_guard();

revoke all on function public.fs_yoga_conflicts_gym(date,integer,integer,uuid) from PUBLIC, anon, authenticated;
revoke all on function public.fs_gym_conflicts_yoga(date,integer,integer) from PUBLIC, anon, authenticated;
revoke all on function public.fs_reservations_yoga_guard() from PUBLIC, anon, authenticated;
revoke all on function public.fs_yoga_private_reservations_gym_guard() from PUBLIC, anon, authenticated;

-- Recheck the same predicate after the shared transaction lock is acquired, so
-- a stale availability response cannot bypass the check-before-insert sequence.
commit;

select routine_name from information_schema.routines
where routine_schema='public'
  and routine_name in ('fs_yoga_conflicts_gym','fs_gym_conflicts_yoga','fs_reservations_yoga_guard','fs_yoga_private_reservations_gym_guard')
order by routine_name;

select event_object_table,trigger_name,event_manipulation
from information_schema.triggers
where trigger_schema='public'
  and trigger_name in ('fs_reservations_yoga_guard_trg','fs_yoga_private_reservations_gym_guard_trg')
order by event_object_table,trigger_name,event_manipulation;
