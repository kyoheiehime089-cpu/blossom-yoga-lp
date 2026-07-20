-- ヨガ管理画面の開始時間をサーバー側で確定し、重複時間を選択肢から除外
-- 実行先: 行徳ジム24 Supabase
begin;

create or replace function public.fs_yoga_available_starts(
  p_admin_password text,
  p_date date,
  p_duration_minutes integer default 40
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  starts jsonb;
begin
  if not public.fs_is_admin(p_admin_password) then
    return jsonb_build_object('ok',false,'error','管理者パスコードが違います。');
  end if;
  if p_duration_minutes < 10 or p_duration_minutes > 240 or p_duration_minutes % 10 <> 0 then
    return jsonb_build_object('ok',false,'error','利用時間が不正です。');
  end if;

  select coalesce(jsonb_agg(m order by m),'[]'::jsonb)
  into starts
  from generate_series(0,1440-p_duration_minutes,10) m
  where not exists(
    select 1
    from public.fs_reservations r
    where not r.cancelled
      and r.date between p_date-1 and p_date+1
      and (p_date::timestamp + make_interval(mins=>m-30))
          < (r.date::timestamp + make_interval(mins=>r.start_minute+coalesce(r.use_minutes_snapshot,40)+30))
      and (r.date::timestamp + make_interval(mins=>r.start_minute-30))
          < (p_date::timestamp + make_interval(mins=>m+p_duration_minutes+30))
  )
  and not exists(
    select 1
    from public.fs_closed_slots c
    where c.date between p_date-1 and p_date+1
      and (p_date::timestamp + make_interval(mins=>m-30))
          < (c.date::timestamp + make_interval(mins=>c.start_minute+coalesce(c.block_minutes,50)+30))
      and (c.date::timestamp + make_interval(mins=>c.start_minute-30))
          < (p_date::timestamp + make_interval(mins=>m+p_duration_minutes+30))
  )
  and not exists(
    select 1
    from public.fs_yoga_private_reservations y
    where not y.cancelled
      and y.date between p_date-1 and p_date+1
      and (p_date::timestamp + make_interval(mins=>m-30))
          < (y.date::timestamp + make_interval(mins=>y.end_minute+30))
      and (y.date::timestamp + make_interval(mins=>y.start_minute-30))
          < (p_date::timestamp + make_interval(mins=>m+p_duration_minutes+30))
  );

  return jsonb_build_object('ok',true,'starts',starts);
end $$;

grant execute on function public.fs_yoga_available_starts(text,date,integer) to anon,authenticated;

commit;

select routine_name from information_schema.routines
where routine_schema='public' and routine_name='fs_yoga_available_starts';
