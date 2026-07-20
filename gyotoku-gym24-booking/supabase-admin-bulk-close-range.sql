-- 行徳ジム24管理者画面から、任意の開始〜終了時間を一括で利用不可にする
-- 実行先: 行徳ジム24 Supabase
begin;

alter table public.fs_closed_slots
  add column if not exists block_minutes integer not null default 50;

update public.fs_closed_slots
set block_minutes = 50
where block_minutes is null or block_minutes < 10;

alter table public.fs_closed_slots
  drop constraint if exists fs_closed_slots_block_minutes_check;
alter table public.fs_closed_slots
  add constraint fs_closed_slots_block_minutes_check
  check (block_minutes between 10 and 1440 and block_minutes % 10 = 0);

create or replace function public.fs_admin_close_range(
  p_admin_password text,
  p_date date,
  p_start_minute integer,
  p_end_minute integer,
  p_reason text default ''
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare new_id uuid;
begin
  if not public.fs_is_admin(p_admin_password) then
    return jsonb_build_object('ok',false,'error','管理者パスコードが違います。');
  end if;
  if p_start_minute < 0 or p_end_minute > 1440 or p_start_minute >= p_end_minute
     or p_start_minute % 10 <> 0 or p_end_minute % 10 <> 0 then
    return jsonb_build_object('ok',false,'error','開始・終了時間は10分単位で正しく指定してください。');
  end if;
  if exists(
    select 1 from public.fs_reservations r
    where not r.cancelled and r.date=p_date
      and p_start_minute < r.start_minute + coalesce(r.use_minutes_snapshot,40)
      and r.start_minute < p_end_minute
  ) then
    return jsonb_build_object('ok',false,'error','この時間内に行徳ジム24の予約が入っています。先に予約を確認してください。');
  end if;
  if exists(
    select 1 from public.fs_yoga_private_reservations y
    where not y.cancelled and y.date=p_date
      and p_start_minute < y.end_minute
      and y.start_minute < p_end_minute
  ) then
    return jsonb_build_object('ok',false,'error','この時間内にヨガ予約が入っています。先に予約を確認してください。');
  end if;
  insert into public.fs_closed_slots(date,start_minute,block_minutes,reason)
  values(p_date,p_start_minute,p_end_minute-p_start_minute,nullif(trim(p_reason),''))
  returning id into new_id;
  return jsonb_build_object('ok',true,'id',new_id);
end $$;

grant execute on function public.fs_admin_close_range(text,date,integer,integer,text) to anon,authenticated;
commit;

select routine_name from information_schema.routines
where routine_schema='public' and routine_name='fs_admin_close_range';