-- ヨガ管理画面：個別ヨガ同士は前後30分を空けず、実際の予約時間だけで重複判定
-- 2026年9月以降の土曜日は8:10通常ヨガを削除し、17:00通常ヨガを追加
-- 実行先：行徳ジム24 Supabase
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
declare starts jsonb;
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
    select 1 from public.fs_reservations r
    where not r.cancelled
      and r.date between p_date-1 and p_date+1
      and (p_date::timestamp + make_interval(mins=>m))
          < (r.date::timestamp + make_interval(mins=>r.start_minute+coalesce(r.use_minutes_snapshot,40)+30))
      and (r.date::timestamp + make_interval(mins=>r.start_minute-30))
          < (p_date::timestamp + make_interval(mins=>m+p_duration_minutes))
  )
  and not exists(
    select 1 from public.fs_closed_slots c
    where c.date between p_date-1 and p_date+1
      and (p_date::timestamp + make_interval(mins=>m))
          < (c.date::timestamp + make_interval(mins=>c.start_minute+coalesce(c.block_minutes,50)+30))
      and (c.date::timestamp + make_interval(mins=>c.start_minute-30))
          < (p_date::timestamp + make_interval(mins=>m+p_duration_minutes))
  )
  and not exists(
    select 1 from public.fs_yoga_private_reservations y
    where not y.cancelled
      and y.date between p_date-1 and p_date+1
      and (p_date::timestamp + make_interval(mins=>m))
          < (y.date::timestamp + make_interval(mins=>y.end_minute))
      and (y.date::timestamp + make_interval(mins=>y.start_minute))
          < (p_date::timestamp + make_interval(mins=>m+p_duration_minutes))
  );

  return jsonb_build_object('ok',true,'starts',starts);
end $$;

create or replace function public.fs_yoga_private_create_central(
  p_admin_password text,p_date date,p_start_minute integer,p_end_minute integer,p_member_name text,p_note text default ''
) returns jsonb language plpgsql security definer set search_path=public as $$
declare new_id uuid; yoga_s timestamp; yoga_e timestamp;
begin
  if not public.fs_is_admin(p_admin_password) then return jsonb_build_object('ok',false,'error','管理者パスコードが違います。'); end if;
  if p_start_minute not between 0 and 1430 or p_end_minute not between 10 and 1440 or p_start_minute%10<>0 or p_end_minute%10<>0 or p_end_minute<=p_start_minute then
    return jsonb_build_object('ok',false,'error','開始・終了時間が不正です。');
  end if;
  if length(btrim(coalesce(p_member_name,'')))=0 then return jsonb_build_object('ok',false,'error','会員名を入力してください。'); end if;
  perform pg_advisory_xact_lock(hashtextextended('shared-booking:'||p_date::text,0));
  yoga_s:=p_date::timestamp+make_interval(mins=>p_start_minute-30);
  yoga_e:=p_date::timestamp+make_interval(mins=>p_end_minute+30);
  if public.fs_yoga_conflicts_gym(p_date,p_start_minute,p_end_minute,null) then return jsonb_build_object('ok',false,'error','行徳ジム24の予約と前後時間が重なっています。'); end if;
  if public.fs_business_conflicts(p_date,p_start_minute-20,(p_end_minute-p_start_minute)+40) then return jsonb_build_object('ok',false,'error','通常ヨガ・friends等の利用時間と重なっています。'); end if;
  if exists(select 1 from public.fs_closed_slots c where c.date between p_date-1 and p_date+1 and yoga_s<c.date::timestamp+make_interval(mins=>c.start_minute+c.block_minutes+10) and c.date::timestamp+make_interval(mins=>c.start_minute-10)<yoga_e) then
    return jsonb_build_object('ok',false,'error','利用不可時間と重なっています。');
  end if;
  if exists(
    select 1 from public.fs_yoga_private_reservations y
    where not y.cancelled
      and y.date between p_date-1 and p_date+1
      and (p_date::timestamp+make_interval(mins=>p_start_minute)) < (y.date::timestamp+make_interval(mins=>y.end_minute))
      and (y.date::timestamp+make_interval(mins=>y.start_minute)) < (p_date::timestamp+make_interval(mins=>p_end_minute))
  ) then
    return jsonb_build_object('ok',false,'error','別のヨガ個別予約と重なっています。');
  end if;
  insert into public.fs_yoga_private_reservations(date,start_minute,end_minute,member_name,note)
  values(p_date,p_start_minute,p_end_minute,btrim(p_member_name),coalesce(p_note,'')) returning id into new_id;
  return jsonb_build_object('ok',true,'id',new_id);
end $$;

create or replace function public.fs_business_blocks(p_date date)
returns table(block_start timestamp, block_end timestamp)
language plpgsql stable security definer set search_path=public as $$
declare dow integer:=extract(dow from p_date); is_holiday boolean;
begin
  is_holiday:=p_date::text=any(array['2026-01-01','2026-01-12','2026-02-11','2026-02-23','2026-03-20','2026-04-29','2026-05-03','2026-05-04','2026-05-05','2026-05-06','2026-07-20','2026-08-11','2026-09-21','2026-09-22','2026-09-23','2026-10-12','2026-11-03','2026-11-23']);
  if is_holiday then return query select p_date::timestamp+interval '510 minutes',p_date::timestamp+interval '820 minutes'; return; end if;
  if dow=1 then return query values(p_date::timestamp+interval '510 minutes',p_date::timestamp+interval '610 minutes'),(p_date::timestamp+interval '1080 minutes',p_date::timestamp+interval '1330 minutes');
  elsif dow=2 then
    if p_date>=date '2026-09-01' then return query values(p_date::timestamp+interval '720 minutes',p_date::timestamp+interval '820 minutes'),(p_date::timestamp+interval '1080 minutes',p_date::timestamp+interval '1330 minutes');
    else return query values(p_date::timestamp+interval '510 minutes',p_date::timestamp+interval '610 minutes'),(p_date::timestamp+interval '720 minutes',p_date::timestamp+interval '820 minutes'),(p_date::timestamp+interval '1080 minutes',p_date::timestamp+interval '1330 minutes'); end if;
  elsif dow=3 then return query select p_date::timestamp+interval '1080 minutes',p_date::timestamp+interval '1330 minutes';
  elsif dow=4 then return query values(p_date::timestamp+interval '690 minutes',p_date::timestamp+interval '790 minutes'),(p_date::timestamp+interval '1215 minutes',p_date::timestamp+interval '1315 minutes');
  elsif dow=5 then return query select p_date::timestamp+interval '1080 minutes',p_date::timestamp+interval '1330 minutes';
  elsif dow=6 then
    if p_date>=date '2026-09-01' then return query values(p_date::timestamp+interval '570 minutes',p_date::timestamp+interval '820 minutes'),(p_date::timestamp+interval '990 minutes',p_date::timestamp+interval '1090 minutes');
    else return query select p_date::timestamp+interval '460 minutes',p_date::timestamp+interval '820 minutes'; end if;
  elsif dow=0 then return query select p_date::timestamp+interval '460 minutes',p_date::timestamp+interval '820 minutes';
  end if;
end $$;

grant execute on function public.fs_yoga_available_starts(text,date,integer) to anon,authenticated;
grant execute on function public.fs_yoga_private_create_central(text,date,integer,integer,text,text) to anon,authenticated;
commit;

select routine_name from information_schema.routines
where routine_schema='public' and routine_name in ('fs_yoga_available_starts','fs_yoga_private_create_central','fs_business_blocks')
order by routine_name;