-- ヨガ管理画面専用：既存枠・ヨガ個別予約の前後30分を外し、実時間だけで詰めて登録できるようにする
-- 行徳ジム24側の前後30分ルール、通常の行徳ジム24予約ルールは変更しません。

begin;

create or replace function public.fs_yoga_admin_fixed_blocks(p_date date)
returns table(block_start_minute integer, block_end_minute integer, block_reason text)
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  dow integer:=extract(dow from p_date);
  is_holiday boolean;
begin
  is_holiday:=p_date::text=any(array[
    '2026-01-01','2026-01-12','2026-02-11','2026-02-23','2026-03-20','2026-04-29',
    '2026-05-03','2026-05-04','2026-05-05','2026-05-06','2026-07-20','2026-08-11',
    '2026-09-21','2026-09-22','2026-09-23','2026-10-12','2026-11-03','2026-11-23'
  ]);

  if is_holiday then
    return query values
      (540,580,'通常ヨガ'),
      (600,640,'セミパーソナル'),
      (650,690,'セミパーソナル'),
      (700,740,'セミパーソナル'),
      (750,790,'セミパーソナル');
    return;
  end if;

  if dow=1 then
    return query values
      (540,580,'通常ヨガ'),
      (1110,1150,'セミパーソナル'),
      (1160,1200,'セミパーソナル'),
      (1210,1250,'セミパーソナル'),
      (1260,1300,'セミパーソナル');
  elsif dow=2 then
    if p_date<'2026-09-01' then
      return query select 540,580,'通常ヨガ';
    end if;
    return query values
      (750,790,'通常ヨガ'),
      (1110,1150,'セミパーソナル'),
      (1160,1200,'セミパーソナル'),
      (1210,1250,'セミパーソナル'),
      (1260,1300,'セミパーソナル');
  elsif dow=3 then
    return query values
      (1110,1150,'セミパーソナル'),
      (1160,1200,'セミパーソナル'),
      (1210,1250,'セミパーソナル'),
      (1260,1300,'セミパーソナル');
  elsif dow=4 then
    return query values
      (720,760,'通常ヨガ'),
      (1245,1285,'通常ヨガ');
  elsif dow=5 then
    return query values
      (1110,1150,'セミパーソナル'),
      (1160,1200,'セミパーソナル'),
      (1210,1250,'セミパーソナル'),
      (1260,1300,'セミパーソナル');
  elsif dow=6 then
    if p_date<'2026-09-01' then
      return query select 490,530,'通常ヨガ';
    end if;
    return query values
      (600,640,'セミパーソナル'),
      (650,690,'セミパーソナル'),
      (700,740,'セミパーソナル'),
      (750,790,'セミパーソナル'),
      (1020,1060,'通常ヨガ');
  elsif dow=0 then
    return query values
      (490,530,'通常ヨガ'),
      (600,640,'セミパーソナル'),
      (650,690,'セミパーソナル'),
      (700,740,'セミパーソナル'),
      (750,790,'セミパーソナル');
  end if;
end $$;

create or replace function public.fs_yoga_available_starts(
  p_admin_password text,
  p_date date,
  p_duration_minutes integer default 40
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare result jsonb;
begin
  if not public.fs_is_admin(p_admin_password) then
    return jsonb_build_object('ok',false,'error','管理者パスコードが違います。');
  end if;
  if p_duration_minutes<=0 or p_duration_minutes%10<>0 then
    return jsonb_build_object('ok',false,'error','利用時間が不正です。');
  end if;

  select jsonb_build_object(
    'ok',true,
    'starts',coalesce(jsonb_agg(g.start_minute order by g.start_minute),'[]'::jsonb)
  ) into result
  from generate_series(0,1440-p_duration_minutes,10) as g(start_minute)
  where not exists(
    select 1 from public.fs_yoga_admin_fixed_blocks(p_date) b
    where g.start_minute < b.block_end_minute
      and b.block_start_minute < g.start_minute+p_duration_minutes
  )
  and not exists(
    select 1 from public.fs_yoga_private_reservations y
    where not y.cancelled and y.date=p_date
      and g.start_minute < y.end_minute
      and y.start_minute < g.start_minute+p_duration_minutes
  )
  and not exists(
    select 1 from public.fs_reservations r
    where not r.cancelled and r.date=p_date
      and g.start_minute < r.start_minute+coalesce(r.use_minutes_snapshot,40)+30
      and r.start_minute-30 < g.start_minute+p_duration_minutes
  )
  and not exists(
    select 1 from public.fs_closed_slots c
    where c.date=p_date
      and g.start_minute < c.start_minute+coalesce(c.block_minutes,50)+30
      and c.start_minute-30 < g.start_minute+p_duration_minutes
  );

  return result;
end $$;

create or replace function public.fs_yoga_private_create_central(
  p_admin_password text,
  p_date date,
  p_start_minute integer,
  p_end_minute integer,
  p_member_name text,
  p_note text default ''
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare new_id uuid;
begin
  if not public.fs_is_admin(p_admin_password) then
    return jsonb_build_object('ok',false,'error','管理者パスコードが違います。');
  end if;
  if p_start_minute not between 0 and 1430 or p_end_minute not between 10 and 1440
     or p_start_minute%10<>0 or p_end_minute%10<>0 or p_end_minute<=p_start_minute then
    return jsonb_build_object('ok',false,'error','開始・終了時間が不正です。');
  end if;
  if length(btrim(coalesce(p_member_name,'')))=0 then
    return jsonb_build_object('ok',false,'error','会員名を入力してください。');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('shared-booking:'||p_date::text,0));

  if exists(
    select 1 from public.fs_yoga_admin_fixed_blocks(p_date) b
    where p_start_minute < b.block_end_minute
      and b.block_start_minute < p_end_minute
  ) then
    return jsonb_build_object('ok',false,'error','通常ヨガ・セミパーソナルの実施時間と重なっています。');
  end if;

  if exists(
    select 1 from public.fs_yoga_private_reservations y
    where not y.cancelled and y.date=p_date
      and p_start_minute < y.end_minute
      and y.start_minute < p_end_minute
  ) then
    return jsonb_build_object('ok',false,'error','別のヨガ個別予約と重なっています。');
  end if;

  if exists(
    select 1 from public.fs_reservations r
    where not r.cancelled and r.date=p_date
      and p_start_minute < r.start_minute+coalesce(r.use_minutes_snapshot,40)+30
      and r.start_minute-30 < p_end_minute
  ) then
    return jsonb_build_object('ok',false,'error','行徳ジム24の予約と前後30分が重なっています。');
  end if;

  if exists(
    select 1 from public.fs_closed_slots c
    where c.date=p_date
      and p_start_minute < c.start_minute+coalesce(c.block_minutes,50)+30
      and c.start_minute-30 < p_end_minute
  ) then
    return jsonb_build_object('ok',false,'error','利用不可時間と前後30分が重なっています。');
  end if;

  insert into public.fs_yoga_private_reservations(date,start_minute,end_minute,member_name,note)
  values(p_date,p_start_minute,p_end_minute,btrim(p_member_name),coalesce(p_note,''))
  returning id into new_id;

  return jsonb_build_object('ok',true,'id',new_id);
end $$;

grant execute on function public.fs_yoga_admin_fixed_blocks(date) to anon,authenticated;
grant execute on function public.fs_yoga_available_starts(text,date,integer) to anon,authenticated;
grant execute on function public.fs_yoga_private_create_central(text,date,integer,integer,text,text) to anon,authenticated;

commit;

select routine_name
from information_schema.routines
where routine_schema='public'
  and routine_name in ('fs_yoga_admin_fixed_blocks','fs_yoga_available_starts','fs_yoga_private_create_central')
order by routine_name;