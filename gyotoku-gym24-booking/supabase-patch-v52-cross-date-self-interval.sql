-- v52: 日付をまたぐ深夜セルフ予約の10分インターバル判定を絶対時刻で統一
-- Supabase SQL Editorで実行してください。

create or replace function public.fs_self_block_overlaps(
  p_date date,
  p_start_minute int,
  p_block_minutes int,
  p_existing_date date,
  p_existing_start_minute int,
  p_existing_block_minutes int
)
returns boolean
language sql
immutable
as $$
  select (p_date::timestamp + make_interval(mins => p_start_minute))
           < (p_existing_date::timestamp + make_interval(mins => p_existing_start_minute + p_existing_block_minutes))
     and (p_existing_date::timestamp + make_interval(mins => p_existing_start_minute))
           < (p_date::timestamp + make_interval(mins => p_start_minute + p_block_minutes));
$$;

create or replace function public.fs_self_reservation_overlaps(p_date date, p_start_minute int, p_end_minute int, p_ignore_reservation_id uuid default null)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists(
    select 1
    from public.fs_reservations r
    where r.cancelled = false
      and (p_ignore_reservation_id is null or r.id <> p_ignore_reservation_id)
      and r.date between p_date - 1 and p_date + 1
      and public.fs_self_block_overlaps(p_date, p_start_minute, p_end_minute - p_start_minute, r.date, r.start_minute, 50)
  );
$$;

create or replace function public.fs_closed_slot_overlaps(p_date date, p_start_minute int, p_end_minute int)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists(
    select 1
    from public.fs_closed_slots c
    where c.date between p_date - 1 and p_date + 1
      and public.fs_self_block_overlaps(p_date, p_start_minute, p_end_minute - p_start_minute, c.date, c.start_minute, 50)
  );
$$;

grant execute on function public.fs_self_block_overlaps(date,int,int,date,int,int) to anon, authenticated;
grant execute on function public.fs_self_reservation_overlaps(date,int,int,uuid) to anon, authenticated;
grant execute on function public.fs_closed_slot_overlaps(date,int,int) to anon, authenticated;
