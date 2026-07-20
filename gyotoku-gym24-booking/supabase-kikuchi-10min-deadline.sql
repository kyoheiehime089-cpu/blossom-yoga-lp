-- 会員ID G24004（菊池様）のみ、予約・キャンセル期限を開始10分前へ変更
-- そのほかの会員は、予約2時間前・キャンセル3時間前のままです。
begin;

create or replace function public.fs_member_create_reservation_v2(
  p_member_code text,p_pin text,p_date date,p_start_minute integer,p_people integer,
  p_user1_id uuid,p_user2_id uuid default null,p_child_accompanied boolean default false,p_note text default ''
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  m fs_members; s fs_plan_settings; u1 fs_registered_users; u2 fs_registered_users;
  holder_id uuid; start_ts timestamp; used integer; deadline_minutes integer;
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
  if p_date<current_date or p_date>current_date+s.booking_days then return jsonb_build_object('ok',false,'error','予約可能期間外です。'); end if;

  deadline_minutes:=case when upper(m.member_code)='G24004' then 10 else s.booking_deadline_minutes end;
  if start_ts<=now()+make_interval(mins=>deadline_minutes) then
    return jsonb_build_object('ok',false,'error',case when upper(m.member_code)='G24004' then '予約は開始時刻の10分前までです。' else '予約は開始時刻の2時間前までです。' end);
  end if;

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

create or replace function public.fs_member_cancel_reservation(p_member_code text,p_pin text,p_reservation_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  m fs_members; r fs_reservations; deadline_minutes integer;
begin
  select * into m from fs_member_by_login(p_member_code,p_pin);
  if m.id is null then return jsonb_build_object('ok',false,'error','ログイン情報が違います。'); end if;

  select * into r from fs_reservations where id=p_reservation_id and member_id=m.id and not cancelled;
  if r.id is null then return jsonb_build_object('ok',false,'error','予約が見つかりません。'); end if;

  deadline_minutes:=case when upper(m.member_code)='G24004' then 10 else 180 end;
  if r.date::timestamp+make_interval(mins=>r.start_minute)<=now()+make_interval(mins=>deadline_minutes) then
    return jsonb_build_object('ok',false,'error',case when upper(m.member_code)='G24004' then 'キャンセルは開始時刻の10分前までです。' else 'キャンセルは開始時刻の3時間前までです。' end);
  end if;

  update fs_reservations set cancelled=true,cancelled_at=now() where id=r.id;
  return jsonb_build_object('ok',true);
end $$;

grant execute on function public.fs_member_create_reservation_v2(text,text,date,integer,integer,uuid,uuid,boolean,text) to anon,authenticated;
grant execute on function public.fs_member_cancel_reservation(text,text,uuid) to anon,authenticated;
commit;

select member_code,name from public.fs_members where upper(member_code)='G24004';