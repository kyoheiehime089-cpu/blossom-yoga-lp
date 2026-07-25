-- 行徳ジム24：今回指定された整合性修正だけを反映
-- 1) スタンダード同時予約2枠
-- 2) 会員予約同士は実利用時間の前後10分を確実に空ける
-- 3) 管理者代理予約でも実際の利用者・小さなお子様同伴を保存
-- 4) ヨガ管理画面と行徳ジム24の前後30分判定を日付またぎでも正しくする
-- 既存の料金・月回数・利用時間・予約締切・キャンセル締切・固定スケジュール等は変更しない。

begin;

update public.fs_plan_settings
set concurrent_limit=2
where plan_code='standard';

-- 会員予約：菊池様だけ10分前締切の特例を維持。
-- 予約同士の間隔は、既存予約の実利用時間＋前後10分に候補の実利用時間が重ならないことをDB側で保証する。
create or replace function public.fs_member_create_reservation_v2(
  p_member_code text,p_pin text,p_date date,p_start_minute integer,p_people integer,
  p_user1_id uuid,p_user2_id uuid default null,p_child_accompanied boolean default false,p_note text default ''
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  m fs_members; s fs_plan_settings; u1 fs_registered_users; u2 fs_registered_users;
  holder_id uuid; start_ts timestamp; end_ts timestamp; used integer; deadline_minutes integer;
begin
  select * into m from fs_member_by_login(p_member_code,p_pin);
  if m.id is null then return jsonb_build_object('ok',false,'error','ログイン情報が違います。'); end if;
  select * into s from fs_plan_settings where plan_code=m.plan;
  if s.plan_code is null or not s.is_configured then return jsonb_build_object('ok',false,'error','プラン設定が無効です。'); end if;
  if p_people not in (1,2) or (m.plan='free' and p_people<>1) then return jsonb_build_object('ok',false,'error','利用人数が不正です。'); end if;

  select * into u1 from fs_registered_users where id=p_user1_id and member_id=m.id and is_active;
  if u1.id is null then return jsonb_build_object('ok',false,'error','利用者1が不正です。'); end if;
  if p_people=2 then
    select * into u2 from fs_registered_users where id=p_user2_id and member_id=m.id and is_active;
    if u2.id is null or u2.id=u1.id then return jsonb_build_object('ok',false,'error','利用者2が不正です。'); end if;
  end if;

  select id into holder_id from fs_registered_users where member_id=m.id and is_contract_holder and is_active limit 1;
  if m.plan in ('free','standard') and not(u1.id=holder_id or (p_people=2 and u2.id=holder_id)) then
    return jsonb_build_object('ok',false,'error','このプランは契約者本人を含む必要があります。');
  end if;

  if p_start_minute not between 0 and 1430 or p_start_minute%10<>0 then return jsonb_build_object('ok',false,'error','開始時刻が不正です。'); end if;
  start_ts:=p_date::timestamp+make_interval(mins=>p_start_minute);
  end_ts:=start_ts+make_interval(mins=>s.use_minutes);
  if end_ts>p_date::timestamp+interval '1 day' then return jsonb_build_object('ok',false,'error','終了時刻が日付をまたぐ予約はできません。'); end if;
  if p_date<current_date or p_date>current_date+s.booking_days then return jsonb_build_object('ok',false,'error','予約可能期間外です。'); end if;

  deadline_minutes:=case when upper(m.member_code)='G24004' then 10 else s.booking_deadline_minutes end;
  if start_ts<=now()+make_interval(mins=>deadline_minutes) then
    return jsonb_build_object('ok',false,'error',case when upper(m.member_code)='G24004' then '予約は開始時刻の10分前までです。' else '予約は開始時刻の2時間前までです。' end);
  end if;

  -- 同時アクセスでも重複予約が通らないよう、予約作成を直列化。
  perform pg_advisory_xact_lock(hashtextextended('gyotoku-gym24-reservations',0));

  if fs_business_conflicts(p_date,p_start_minute,s.use_minutes) then return jsonb_build_object('ok',false,'error','friends・ヨガ等の利用時間と重なっています。'); end if;

  if exists(
    select 1 from fs_reservations r
    where not r.cancelled
      and r.date between p_date-1 and p_date+1
      and start_ts < (r.date::timestamp+make_interval(mins=>r.start_minute+coalesce(r.use_minutes_snapshot,40)+10))
      and (r.date::timestamp+make_interval(mins=>r.start_minute-10)) < end_ts
  ) then return jsonb_build_object('ok',false,'error','前後10分を含め、この時間は予約できません。'); end if;

  if exists(
    select 1 from fs_closed_slots c
    where c.date between p_date-1 and p_date+1
      and start_ts < (c.date::timestamp+make_interval(mins=>c.start_minute+coalesce(c.block_minutes,50)+10))
      and (c.date::timestamp+make_interval(mins=>c.start_minute-10)) < end_ts
  ) then return jsonb_build_object('ok',false,'error','利用不可時間です。'); end if;

  if (select count(*) from fs_reservations r where r.member_id=m.id and not r.cancelled and r.date::timestamp+make_interval(mins=>r.start_minute+coalesce(r.use_minutes_snapshot,s.use_minutes))>now())>=s.concurrent_limit then return jsonb_build_object('ok',false,'error','同時予約上限に達しています。'); end if;
  if (select count(*) from fs_reservations r where r.member_id=m.id and not r.cancelled and r.date=p_date)>=s.daily_limit then return jsonb_build_object('ok',false,'error','同日予約上限に達しています。'); end if;
  select count(*) into used from fs_reservations r where r.member_id=m.id and not r.cancelled and to_char(r.date,'YYYY-MM')=to_char(p_date,'YYYY-MM');
  if s.monthly_quota is not null and used+1>s.monthly_quota then return jsonb_build_object('ok',false,'error','今月の予約上限に達しています。'); end if;

  insert into fs_reservations(member_id,date,start_minute,people,note,created_by,user1_id,user1_name_snapshot,user2_id,user2_name_snapshot,child_accompanied,use_minutes_snapshot)
  values(m.id,p_date,p_start_minute,p_people||'名',p_note,'member',u1.id,u1.name,case when p_people=2 then u2.id end,case when p_people=2 then u2.name end,p_child_accompanied,s.use_minutes);
  return jsonb_build_object('ok',true);
end $$;

-- 管理者代理予約も同じ利用者・同伴者・前後10分ルールで保存する。
create or replace function public.fs_admin_create_reservation_v2(
  p_admin_password text,p_member_id uuid,p_date date,p_start_minute integer,p_people integer,
  p_user1_id uuid,p_user2_id uuid default null,p_child_accompanied boolean default false,p_note text default ''
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  m fs_members; s fs_plan_settings; u1 fs_registered_users; u2 fs_registered_users;
  holder_id uuid; start_ts timestamp; end_ts timestamp; used integer;
begin
  if not fs_is_admin(p_admin_password) then return jsonb_build_object('ok',false,'error','管理者パスコードが違います。'); end if;
  select * into m from fs_members where id=p_member_id and status='active';
  if m.id is null then return jsonb_build_object('ok',false,'error','会員が見つかりません。'); end if;
  select * into s from fs_plan_settings where plan_code=m.plan;
  if s.plan_code is null or not s.is_configured then return jsonb_build_object('ok',false,'error','プラン設定が無効です。'); end if;
  if p_people not in(1,2) or (m.plan='free' and p_people<>1) then return jsonb_build_object('ok',false,'error','利用人数が不正です。'); end if;

  select * into u1 from fs_registered_users where id=p_user1_id and member_id=m.id and is_active;
  if u1.id is null then return jsonb_build_object('ok',false,'error','利用者1が不正です。'); end if;
  if p_people=2 then
    select * into u2 from fs_registered_users where id=p_user2_id and member_id=m.id and is_active;
    if u2.id is null or u2.id=u1.id then return jsonb_build_object('ok',false,'error','利用者2が不正です。'); end if;
  end if;

  select id into holder_id from fs_registered_users where member_id=m.id and is_contract_holder and is_active limit 1;
  if m.plan in('free','standard') and not(u1.id=holder_id or (p_people=2 and u2.id=holder_id)) then return jsonb_build_object('ok',false,'error','このプランは契約者本人を含む必要があります。'); end if;
  if p_start_minute not between 0 and 1430 or p_start_minute%10<>0 then return jsonb_build_object('ok',false,'error','開始時刻が不正です。'); end if;

  start_ts:=p_date::timestamp+make_interval(mins=>p_start_minute);
  end_ts:=start_ts+make_interval(mins=>s.use_minutes);
  if end_ts>p_date::timestamp+interval '1 day' then return jsonb_build_object('ok',false,'error','終了時刻が日付をまたぐ予約はできません。'); end if;

  perform pg_advisory_xact_lock(hashtextextended('gyotoku-gym24-reservations',0));

  if fs_business_conflicts(p_date,p_start_minute,s.use_minutes) then return jsonb_build_object('ok',false,'error','friends・ヨガ等の利用時間と重なっています。'); end if;
  if exists(
    select 1 from fs_reservations r
    where not r.cancelled
      and r.date between p_date-1 and p_date+1
      and start_ts < (r.date::timestamp+make_interval(mins=>r.start_minute+coalesce(r.use_minutes_snapshot,40)+10))
      and (r.date::timestamp+make_interval(mins=>r.start_minute-10)) < end_ts
  ) then return jsonb_build_object('ok',false,'error','前後10分を含め、この時間は予約できません。'); end if;
  if exists(
    select 1 from fs_closed_slots c
    where c.date between p_date-1 and p_date+1
      and start_ts < (c.date::timestamp+make_interval(mins=>c.start_minute+coalesce(c.block_minutes,50)+10))
      and (c.date::timestamp+make_interval(mins=>c.start_minute-10)) < end_ts
  ) then return jsonb_build_object('ok',false,'error','利用不可時間です。'); end if;

  if (select count(*) from fs_reservations r where r.member_id=m.id and not r.cancelled and r.date::timestamp+make_interval(mins=>r.start_minute+coalesce(r.use_minutes_snapshot,s.use_minutes))>now())>=s.concurrent_limit then return jsonb_build_object('ok',false,'error','同時予約上限に達しています。'); end if;
  if (select count(*) from fs_reservations r where r.member_id=m.id and not r.cancelled and r.date=p_date)>=s.daily_limit then return jsonb_build_object('ok',false,'error','同日予約上限に達しています。'); end if;
  select count(*) into used from fs_reservations r where r.member_id=m.id and not r.cancelled and to_char(r.date,'YYYY-MM')=to_char(p_date,'YYYY-MM');
  if s.monthly_quota is not null and used+1>s.monthly_quota then return jsonb_build_object('ok',false,'error','今月の予約上限に達しています。'); end if;

  insert into fs_reservations(member_id,date,start_minute,people,note,created_by,user1_id,user1_name_snapshot,user2_id,user2_name_snapshot,child_accompanied,use_minutes_snapshot)
  values(m.id,p_date,p_start_minute,p_people||'名',p_note,'admin',u1.id,u1.name,case when p_people=2 then u2.id end,case when p_people=2 then u2.name end,p_child_accompanied,s.use_minutes);
  return jsonb_build_object('ok',true);
end $$;

-- ヨガ管理画面：固定ヨガ／セミパーソナルと個別ヨガは実時間だけ、
-- 行徳ジム24・利用不可枠とは前後30分。前日・翌日の30分も考慮する。
create or replace function public.fs_yoga_available_starts(
  p_admin_password text,p_date date,p_duration_minutes integer default 40
) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare result jsonb; candidate_start timestamp; candidate_end timestamp;
begin
  if not fs_is_admin(p_admin_password) then return jsonb_build_object('ok',false,'error','管理者パスコードが違います。'); end if;
  if p_duration_minutes<=0 or p_duration_minutes%10<>0 then return jsonb_build_object('ok',false,'error','利用時間が不正です。'); end if;

  select jsonb_build_object('ok',true,'starts',coalesce(jsonb_agg(g.start_minute order by g.start_minute),'[]'::jsonb))
  into result
  from generate_series(0,1440-p_duration_minutes,10) as g(start_minute)
  where not exists(
    select 1 from fs_yoga_admin_fixed_blocks(p_date) b
    where g.start_minute < b.block_end_minute and b.block_start_minute < g.start_minute+p_duration_minutes
  )
  and not exists(
    select 1 from fs_yoga_private_reservations y
    where not y.cancelled and y.date between p_date-1 and p_date+1
      and (p_date::timestamp+make_interval(mins=>g.start_minute)) < (y.date::timestamp+make_interval(mins=>y.end_minute))
      and (y.date::timestamp+make_interval(mins=>y.start_minute)) < (p_date::timestamp+make_interval(mins=>g.start_minute+p_duration_minutes))
  )
  and not exists(
    select 1 from fs_reservations r
    where not r.cancelled and r.date between p_date-1 and p_date+1
      and (p_date::timestamp+make_interval(mins=>g.start_minute)) < (r.date::timestamp+make_interval(mins=>r.start_minute+coalesce(r.use_minutes_snapshot,40)+30))
      and (r.date::timestamp+make_interval(mins=>r.start_minute-30)) < (p_date::timestamp+make_interval(mins=>g.start_minute+p_duration_minutes))
  )
  and not exists(
    select 1 from fs_closed_slots c
    where c.date between p_date-1 and p_date+1
      and (p_date::timestamp+make_interval(mins=>g.start_minute)) < (c.date::timestamp+make_interval(mins=>c.start_minute+coalesce(c.block_minutes,50)+30))
      and (c.date::timestamp+make_interval(mins=>c.start_minute-30)) < (p_date::timestamp+make_interval(mins=>g.start_minute+p_duration_minutes))
  );
  return result;
end $$;

create or replace function public.fs_yoga_private_create_central(
  p_admin_password text,p_date date,p_start_minute integer,p_end_minute integer,p_member_name text,p_note text default ''
) returns jsonb language plpgsql security definer set search_path=public as $$
declare new_id uuid; yoga_start timestamp; yoga_end timestamp;
begin
  if not fs_is_admin(p_admin_password) then return jsonb_build_object('ok',false,'error','管理者パスコードが違います。'); end if;
  if p_start_minute not between 0 and 1430 or p_end_minute not between 10 and 1440 or p_start_minute%10<>0 or p_end_minute%10<>0 or p_end_minute<=p_start_minute then return jsonb_build_object('ok',false,'error','開始・終了時間が不正です。'); end if;
  if length(btrim(coalesce(p_member_name,'')))=0 then return jsonb_build_object('ok',false,'error','会員名を入力してください。'); end if;

  yoga_start:=p_date::timestamp+make_interval(mins=>p_start_minute);
  yoga_end:=p_date::timestamp+make_interval(mins=>p_end_minute);
  perform pg_advisory_xact_lock(hashtextextended('gyotoku-shared-booking',0));

  if exists(select 1 from fs_yoga_admin_fixed_blocks(p_date) b where p_start_minute<b.block_end_minute and b.block_start_minute<p_end_minute) then return jsonb_build_object('ok',false,'error','通常ヨガ・セミパーソナルの実施時間と重なっています。'); end if;
  if exists(
    select 1 from fs_yoga_private_reservations y
    where not y.cancelled and y.date between p_date-1 and p_date+1
      and yoga_start < (y.date::timestamp+make_interval(mins=>y.end_minute))
      and (y.date::timestamp+make_interval(mins=>y.start_minute)) < yoga_end
  ) then return jsonb_build_object('ok',false,'error','別のヨガ個別予約と重なっています。'); end if;
  if exists(
    select 1 from fs_reservations r
    where not r.cancelled and r.date between p_date-1 and p_date+1
      and yoga_start < (r.date::timestamp+make_interval(mins=>r.start_minute+coalesce(r.use_minutes_snapshot,40)+30))
      and (r.date::timestamp+make_interval(mins=>r.start_minute-30)) < yoga_end
  ) then return jsonb_build_object('ok',false,'error','行徳ジム24の予約と前後30分が重なっています。'); end if;
  if exists(
    select 1 from fs_closed_slots c
    where c.date between p_date-1 and p_date+1
      and yoga_start < (c.date::timestamp+make_interval(mins=>c.start_minute+coalesce(c.block_minutes,50)+30))
      and (c.date::timestamp+make_interval(mins=>c.start_minute-30)) < yoga_end
  ) then return jsonb_build_object('ok',false,'error','利用不可時間と前後30分が重なっています。'); end if;

  insert into fs_yoga_private_reservations(date,start_minute,end_minute,member_name,note)
  values(p_date,p_start_minute,p_end_minute,btrim(p_member_name),coalesce(p_note,'')) returning id into new_id;
  return jsonb_build_object('ok',true,'id',new_id);
end $$;

grant execute on function public.fs_member_create_reservation_v2(text,text,date,integer,integer,uuid,uuid,boolean,text) to anon,authenticated;
grant execute on function public.fs_admin_create_reservation_v2(text,uuid,date,integer,integer,uuid,uuid,boolean,text) to anon,authenticated;
grant execute on function public.fs_yoga_available_starts(text,date,integer) to anon,authenticated;
grant execute on function public.fs_yoga_private_create_central(text,date,integer,integer,text,text) to anon,authenticated;

commit;

select plan_code,concurrent_limit
from public.fs_plan_settings
where plan_code in ('standard','premium')
order by plan_code;

select routine_name
from information_schema.routines
where routine_schema='public'
  and routine_name in ('fs_member_create_reservation_v2','fs_admin_create_reservation_v2','fs_yoga_available_starts','fs_yoga_private_create_central')
order by routine_name;
