-- 行徳ジム24：最終整合性修正
-- 既存の予約データを保持したまま、会員・同伴者・予約ルールを統一します。
begin;

-- 1. プラン設定を確定値へ統一
update public.fs_plan_settings set
  monthly_price=0, monthly_quota=4, use_minutes=25, adults_allowed=1,
  two_adult_cost=1, concurrent_limit=1, daily_limit=1, booking_days=7,
  booking_deadline_minutes=120, cancellation_deadline_minutes=180, is_configured=true
where plan_code='free';
update public.fs_plan_settings set
  monthly_price=4800, monthly_quota=6, use_minutes=40, adults_allowed=2,
  two_adult_cost=1, concurrent_limit=2, daily_limit=1, booking_days=14,
  booking_deadline_minutes=120, cancellation_deadline_minutes=180, is_configured=true
where plan_code='standard';
update public.fs_plan_settings set
  monthly_quota=null, use_minutes=40, adults_allowed=2,
  two_adult_cost=1, concurrent_limit=2, daily_limit=1, booking_days=14,
  booking_deadline_minutes=120, cancellation_deadline_minutes=180, is_configured=true
where plan_code='premium';

-- 2. 23:50開始まで10分単位で保存可能にする
alter table public.fs_reservations drop constraint if exists fs_reservations_start_minute_check;
alter table public.fs_reservations add constraint fs_reservations_start_minute_check check (start_minute between 0 and 1430 and start_minute % 10 = 0);
alter table public.fs_closed_slots drop constraint if exists fs_closed_slots_start_minute_check;
alter table public.fs_closed_slots add constraint fs_closed_slots_start_minute_check check (start_minute between 0 and 1430 and start_minute % 10 = 0);
alter table public.fs_closed_slots add column if not exists block_minutes integer not null default 50;

-- 3. 全会員に契約者本人を必ず作成し、氏名を同期
insert into public.fs_registered_users(member_id,name,is_contract_holder,is_active)
select m.id,m.name,true,true from public.fs_members m
where m.status='active' and not exists(
  select 1 from public.fs_registered_users u where u.member_id=m.id and u.is_contract_holder
);
update public.fs_registered_users u set name=m.name,is_active=true,updated_at=now()
from public.fs_members m where u.member_id=m.id and u.is_contract_holder;

-- 4. 既存予約のスナップショット補完
update public.fs_reservations r set
  user1_id=u.id,
  user1_name_snapshot=coalesce(r.user1_name_snapshot,u.name)
from public.fs_registered_users u
where r.member_id=u.member_id and u.is_contract_holder and r.user1_id is null;
update public.fs_reservations r set use_minutes_snapshot=s.use_minutes
from public.fs_members m join public.fs_plan_settings s on s.plan_code=m.plan
where r.member_id=m.id and r.use_minutes_snapshot is null;

-- 5. friends・ヨガ等の既存利用時間を返す
create or replace function public.fs_business_blocks(p_date date)
returns table(block_start timestamp, block_end timestamp)
language plpgsql stable security definer set search_path=public as $$
declare dow integer:=extract(dow from p_date); is_holiday boolean;
begin
  is_holiday:=p_date::text=any(array['2026-01-01','2026-01-12','2026-02-11','2026-02-23','2026-03-20','2026-04-29','2026-05-03','2026-05-04','2026-05-05','2026-05-06','2026-07-20','2026-08-11','2026-09-21','2026-09-22','2026-09-23','2026-10-12','2026-11-03','2026-11-23']);
  if is_holiday then return query select p_date::timestamp+interval '510 minutes',p_date::timestamp+interval '820 minutes'; return; end if;
  if dow=1 then return query values(p_date::timestamp+interval '510 minutes',p_date::timestamp+interval '610 minutes'),(p_date::timestamp+interval '1080 minutes',p_date::timestamp+interval '1330 minutes');
  elsif dow=2 then return query values(p_date::timestamp+interval '510 minutes',p_date::timestamp+interval '610 minutes'),(p_date::timestamp+interval '720 minutes',p_date::timestamp+interval '820 minutes'),(p_date::timestamp+interval '1080 minutes',p_date::timestamp+interval '1330 minutes');
  elsif dow=3 then return query select p_date::timestamp+interval '1080 minutes',p_date::timestamp+interval '1330 minutes';
  elsif dow=4 then return query values(p_date::timestamp+interval '690 minutes',p_date::timestamp+interval '790 minutes'),(p_date::timestamp+interval '1215 minutes',p_date::timestamp+interval '1315 minutes');
  elsif dow=5 then return query select p_date::timestamp+interval '1080 minutes',p_date::timestamp+interval '1330 minutes';
  elsif dow in (0,6) then return query select p_date::timestamp+interval '460 minutes',p_date::timestamp+interval '820 minutes';
  end if;
end $$;

create or replace function public.fs_business_conflicts(p_date date,p_start_minute integer,p_use_minutes integer)
returns boolean language sql stable security definer set search_path=public as $$
  with requested as (
    select p_date::timestamp+make_interval(mins=>p_start_minute-10) s,
           p_date::timestamp+make_interval(mins=>p_start_minute+p_use_minutes+10) e
  )
  select exists(
    select 1 from requested r,
    lateral (select * from fs_business_blocks(p_date-1) union all select * from fs_business_blocks(p_date) union all select * from fs_business_blocks(p_date+1)) b
    where r.s<b.block_end and b.block_start<r.e
  )
$$;

-- 6. 新規会員作成時に契約者本人も自動作成
create or replace function public.fs_admin_create_member(p_admin_password text,p_name text,p_email text,p_plan text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare n integer:=1; code text; m fs_members;
begin
  if not fs_is_admin(p_admin_password) then return jsonb_build_object('ok',false,'error','管理者パスコードが違います。'); end if;
  if p_plan not in ('free','standard','premium') then return jsonb_build_object('ok',false,'error','プランが不正です。'); end if;
  loop code:='G24'||lpad(n::text,3,'0'); exit when not exists(select 1 from fs_members where upper(member_code)=code and status='active'); n:=n+1; end loop;
  insert into fs_members(member_code,name,email,pin,plan) values(code,btrim(p_name),nullif(btrim(p_email),''),(floor(random()*9000)+1000)::integer::text,p_plan) returning * into m;
  insert into fs_registered_users(member_id,name,is_contract_holder,is_active) values(m.id,m.name,true,true);
  return jsonb_build_object('ok',true,'member',to_jsonb(m));
end $$;

-- 7. 会員名変更時に契約者本人名も同期。無料へ変更時は同伴者を無効化
create or replace function public.fs_admin_update_member(p_admin_password text,p_member_id uuid,p_name text,p_email text,p_pin text,p_plan text)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
  if not fs_is_admin(p_admin_password) then return jsonb_build_object('ok',false,'error','管理者パスコードが違います。'); end if;
  if p_plan not in ('free','standard','premium') then return jsonb_build_object('ok',false,'error','プランが不正です。'); end if;
  update fs_members set name=btrim(p_name),email=nullif(btrim(p_email),''),pin=btrim(p_pin),plan=p_plan where id=p_member_id and status='active';
  update fs_registered_users set name=btrim(p_name),is_active=true,updated_at=now() where member_id=p_member_id and is_contract_holder;
  if p_plan='free' then update fs_registered_users set is_active=false,updated_at=now() where member_id=p_member_id and not is_contract_holder; end if;
  return jsonb_build_object('ok',true);
end $$;

-- 8. 会員予約を全ルールで検証
create or replace function public.fs_member_create_reservation_v2(
  p_member_code text,p_pin text,p_date date,p_start_minute integer,p_people integer,
  p_user1_id uuid,p_user2_id uuid default null,p_child_accompanied boolean default false,p_note text default ''
) returns jsonb language plpgsql security definer set search_path=public as $$
declare m fs_members; s fs_plan_settings; u1 fs_registered_users; u2 fs_registered_users; holder_id uuid; start_ts timestamp; used integer;
begin
  select * into m from fs_member_by_login(p_member_code,p_pin); if m.id is null then return jsonb_build_object('ok',false,'error','ログイン情報が違います。'); end if;
  select * into s from fs_plan_settings where plan_code=m.plan; if s.plan_code is null or not s.is_configured then return jsonb_build_object('ok',false,'error','プラン設定が無効です。'); end if;
  if p_people not in (1,2) or (m.plan='free' and p_people<>1) then return jsonb_build_object('ok',false,'error','利用人数が不正です。'); end if;
  select * into u1 from fs_registered_users where id=p_user1_id and member_id=m.id and is_active; if u1.id is null then return jsonb_build_object('ok',false,'error','利用者1が不正です。'); end if;
  if p_people=2 then select * into u2 from fs_registered_users where id=p_user2_id and member_id=m.id and is_active; if u2.id is null or u2.id=u1.id then return jsonb_build_object('ok',false,'error','利用者2が不正です。'); end if; end if;
  select id into holder_id from fs_registered_users where member_id=m.id and is_contract_holder and is_active limit 1;
  if m.plan in ('free','standard') and not(u1.id=holder_id or (p_people=2 and u2.id=holder_id)) then return jsonb_build_object('ok',false,'error','このプランは契約者本人を含む必要があります。'); end if;
  if p_start_minute not between 0 and 1430 or p_start_minute%10<>0 then return jsonb_build_object('ok',false,'error','開始時刻が不正です。'); end if;
  start_ts:=p_date::timestamp+make_interval(mins=>p_start_minute);
  if p_date<current_date or p_date>current_date+s.booking_days then return jsonb_build_object('ok',false,'error','予約可能期間外です。'); end if;
  if start_ts<=now()+make_interval(mins=>s.booking_deadline_minutes) then return jsonb_build_object('ok',false,'error','予約は開始時刻の2時間前までです。'); end if;
  perform pg_advisory_xact_lock(hashtextextended(p_date::text||':'||p_start_minute::text,0));
  if fs_business_conflicts(p_date,p_start_minute,s.use_minutes) then return jsonb_build_object('ok',false,'error','friends・ヨガ等の利用時間と重なっています。'); end if;
  if exists(select 1 from fs_reservations r where not r.cancelled and r.date between p_date-1 and p_date+1 and fs_self_block_overlaps(p_date,p_start_minute-10,s.use_minutes+20,r.date,r.start_minute-10,coalesce(r.use_minutes_snapshot,40)+20)) then return jsonb_build_object('ok',false,'error','前後10分を含め、この時間は予約できません。'); end if;
  if exists(select 1 from fs_closed_slots c where c.date between p_date-1 and p_date+1 and fs_self_block_overlaps(p_date,p_start_minute-10,s.use_minutes+20,c.date,c.start_minute-10,c.block_minutes+20)) then return jsonb_build_object('ok',false,'error','利用不可時間です。'); end if;
  if (select count(*) from fs_reservations r where r.member_id=m.id and not r.cancelled and r.date::timestamp+make_interval(mins=>r.start_minute+coalesce(r.use_minutes_snapshot,s.use_minutes))>now())>=s.concurrent_limit then return jsonb_build_object('ok',false,'error','同時予約上限に達しています。'); end if;
  if (select count(*) from fs_reservations r where r.member_id=m.id and not r.cancelled and r.date=p_date)>=s.daily_limit then return jsonb_build_object('ok',false,'error','同日予約上限に達しています。'); end if;
  select count(*) into used from fs_reservations r where r.member_id=m.id and not r.cancelled and to_char(r.date,'YYYY-MM')=to_char(p_date,'YYYY-MM');
  if s.monthly_quota is not null and used+1>s.monthly_quota then return jsonb_build_object('ok',false,'error','今月の予約上限に達しています。'); end if;
  insert into fs_reservations(member_id,date,start_minute,people,note,created_by,user1_id,user1_name_snapshot,user2_id,user2_name_snapshot,child_accompanied,use_minutes_snapshot)
  values(m.id,p_date,p_start_minute,p_people||'名',p_note,'member',u1.id,u1.name,case when p_people=2 then u2.id end,case when p_people=2 then u2.name end,p_child_accompanied,s.use_minutes);
  return jsonb_build_object('ok',true);
end $$;

-- 9. 管理者代理予約も同じルールで実行
create or replace function public.fs_admin_create_reservation_v2(
 p_admin_password text,p_member_id uuid,p_date date,p_start_minute integer,p_people integer,
 p_user1_id uuid,p_user2_id uuid default null,p_child_accompanied boolean default false,p_note text default ''
) returns jsonb language plpgsql security definer set search_path=public as $$
declare m fs_members; s fs_plan_settings; u1 fs_registered_users; u2 fs_registered_users; holder_id uuid; used integer;
begin
 if not fs_is_admin(p_admin_password) then return jsonb_build_object('ok',false,'error','管理者パスコードが違います。'); end if;
 select * into m from fs_members where id=p_member_id and status='active'; if m.id is null then return jsonb_build_object('ok',false,'error','会員が見つかりません。'); end if;
 select * into s from fs_plan_settings where plan_code=m.plan;
 if p_people not in(1,2) or (m.plan='free' and p_people<>1) then return jsonb_build_object('ok',false,'error','利用人数が不正です。'); end if;
 select * into u1 from fs_registered_users where id=p_user1_id and member_id=m.id and is_active; if u1.id is null then return jsonb_build_object('ok',false,'error','利用者1が不正です。'); end if;
 if p_people=2 then select * into u2 from fs_registered_users where id=p_user2_id and member_id=m.id and is_active; if u2.id is null or u2.id=u1.id then return jsonb_build_object('ok',false,'error','利用者2が不正です。'); end if; end if;
 select id into holder_id from fs_registered_users where member_id=m.id and is_contract_holder and is_active limit 1;
 if m.plan in('free','standard') and not(u1.id=holder_id or (p_people=2 and u2.id=holder_id)) then return jsonb_build_object('ok',false,'error','このプランは契約者本人を含む必要があります。'); end if;
 if p_start_minute not between 0 and 1430 or p_start_minute%10<>0 then return jsonb_build_object('ok',false,'error','開始時刻が不正です。'); end if;
 perform pg_advisory_xact_lock(hashtextextended(p_date::text||':'||p_start_minute::text,0));
 if fs_business_conflicts(p_date,p_start_minute,s.use_minutes) then return jsonb_build_object('ok',false,'error','friends・ヨガ等の利用時間と重なっています。'); end if;
 if exists(select 1 from fs_reservations r where not r.cancelled and r.date between p_date-1 and p_date+1 and fs_self_block_overlaps(p_date,p_start_minute-10,s.use_minutes+20,r.date,r.start_minute-10,coalesce(r.use_minutes_snapshot,40)+20)) then return jsonb_build_object('ok',false,'error','前後10分を含め、この時間は予約できません。'); end if;
 if (select count(*) from fs_reservations r where r.member_id=m.id and not r.cancelled and r.date::timestamp+make_interval(mins=>r.start_minute+coalesce(r.use_minutes_snapshot,s.use_minutes))>now())>=s.concurrent_limit then return jsonb_build_object('ok',false,'error','同時予約上限に達しています。'); end if;
 if (select count(*) from fs_reservations r where r.member_id=m.id and not r.cancelled and r.date=p_date)>=s.daily_limit then return jsonb_build_object('ok',false,'error','同日予約上限に達しています。'); end if;
 select count(*) into used from fs_reservations r where r.member_id=m.id and not r.cancelled and to_char(r.date,'YYYY-MM')=to_char(p_date,'YYYY-MM'); if s.monthly_quota is not null and used+1>s.monthly_quota then return jsonb_build_object('ok',false,'error','今月の予約上限に達しています。'); end if;
 insert into fs_reservations(member_id,date,start_minute,people,note,created_by,user1_id,user1_name_snapshot,user2_id,user2_name_snapshot,child_accompanied,use_minutes_snapshot)
 values(m.id,p_date,p_start_minute,p_people||'名',p_note,'admin',u1.id,u1.name,case when p_people=2 then u2.id end,case when p_people=2 then u2.name end,p_child_accompanied,s.use_minutes);
 return jsonb_build_object('ok',true);
end $$;

-- 10. 管理画面スナップショットへ利用者名を含める
create or replace function public.fs_admin_snapshot(p_admin_password text)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
 if not fs_is_admin(p_admin_password) then return jsonb_build_object('ok',false,'error','管理者パスコードが違います。'); end if;
 return jsonb_build_object('ok',true,
  'members',coalesce((select jsonb_agg(to_jsonb(m) order by created_at desc) from fs_members m where status='active' and plan in('free','standard','premium')),'[]'::jsonb),
  'reservations',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'member_id',r.member_id,'member_name',m.name,'member_code',m.member_code,'plan',m.plan,'date',r.date,'start_minute',r.start_minute,'people',r.people,'user1_name_snapshot',r.user1_name_snapshot,'user2_name_snapshot',r.user2_name_snapshot,'child_accompanied',r.child_accompanied,'use_minutes_snapshot',r.use_minutes_snapshot,'note',r.note,'created_by',r.created_by,'created_at',r.created_at) order by r.date,r.start_minute) from fs_reservations r join fs_members m on m.id=r.member_id where not r.cancelled and m.status='active'),'[]'::jsonb),
  'closed_slots',coalesce((select jsonb_agg(to_jsonb(c) order by date,start_minute) from fs_closed_slots c),'[]'::jsonb),
  'external_blocks','[]'::jsonb);
end $$;

-- 11. 管理者パスコード変更用。8文字未満は禁止
create or replace function public.fs_admin_change_password(p_current_password text,p_new_password text)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
 if not fs_is_admin(p_current_password) then return jsonb_build_object('ok',false,'error','現在のパスコードが違います。'); end if;
 if length(coalesce(p_new_password,''))<8 then return jsonb_build_object('ok',false,'error','新しいパスコードは8文字以上にしてください。'); end if;
 update fs_app_settings set value=p_new_password where key='admin_password'; return jsonb_build_object('ok',true);
end $$;

grant execute on function public.fs_member_create_reservation_v2(text,text,date,integer,integer,uuid,uuid,boolean,text) to anon,authenticated;
grant execute on function public.fs_admin_create_reservation_v2(text,uuid,date,integer,integer,uuid,uuid,boolean,text) to anon,authenticated;
grant execute on function public.fs_admin_change_password(text,text) to anon,authenticated;

commit;

select plan_code,monthly_quota,use_minutes,concurrent_limit,daily_limit,booking_days,is_configured from public.fs_plan_settings order by plan_code;
