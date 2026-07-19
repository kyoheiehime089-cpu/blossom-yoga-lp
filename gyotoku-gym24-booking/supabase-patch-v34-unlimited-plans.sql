-- v34: add unlimited monthly visit plans to friends self member booking.

alter table public.fs_members
  drop constraint if exists fs_members_plan_check;

alter table public.fs_members
  add constraint fs_members_plan_check
  check (plan in ('月4回プラン','月8回プラン','通い放題プラン','ファミリー月4回プラン','ファミリー月8回プラン','ファミリー通い放題プラン'));

create or replace function public.fs_is_unlimited_plan(p_plan text)
returns boolean
language sql
immutable
as $$
  select coalesce(p_plan,'') like '%通い放題%';
$$;

create or replace function public.fs_plan_quota(p_plan text)
returns int
language sql
immutable
as $$
  select case p_plan
    when '月4回プラン' then 4
    when '月8回プラン' then 8
    when '通い放題プラン' then 0
    when 'ファミリー月4回プラン' then 4
    when 'ファミリー月8回プラン' then 8
    when 'ファミリー通い放題プラン' then 0
    else 4
  end;
$$;

create or replace function public.fs_member_quota(p_plan text)
returns int
language sql
immutable
as $$
  select public.fs_plan_quota(p_plan);
$$;

create or replace function public.fs_member_snapshot(p_member_code text, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.fs_members;
  mo text := to_char(current_date,'YYYY-MM');
  q int;
  ex int;
  enabled boolean;
begin
  select * into m from public.fs_member_by_login(p_member_code,p_pin);
  if m.id is null then
    return jsonb_build_object('ok',false,'error','会員IDまたはログインPINが違います。');
  end if;
  ex := public.fs_extra_slots(m.id, mo);
  q := public.fs_plan_quota(m.plan) + case when public.fs_is_unlimited_plan(m.plan) then 0 else ex end;
  select coalesce((select value='true' from public.fs_app_settings where key='purchase_enabled' limit 1), true) into enabled;
  return jsonb_build_object(
    'ok', true,
    'purchase_enabled', enabled,
    'member', jsonb_build_object('id',m.id,'member_code',m.member_code,'name',m.name,'email',m.email,'plan',m.plan,'quota',q,'base_quota',public.fs_plan_quota(m.plan),'extra_slots',case when public.fs_is_unlimited_plan(m.plan) then 0 else ex end,'monthly_limit',not public.fs_is_unlimited_plan(m.plan)),
    'reservations', coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'date',r.date,'start_minute',r.start_minute,'people',r.people,'note',r.note,'created_at',r.created_at) order by r.date,r.start_minute) from public.fs_reservations r where r.member_id=m.id and r.cancelled=false),'[]'::jsonb),
    'booked_slots', coalesce((select jsonb_agg(jsonb_build_object('date',r.date,'start_minute',r.start_minute,'is_mine',(r.member_id=m.id)) order by r.date,r.start_minute) from public.fs_reservations r where r.cancelled=false),'[]'::jsonb),
    'closed_slots', coalesce((select jsonb_agg(to_jsonb(c) order by c.date,c.start_minute) from public.fs_closed_slots c),'[]'::jsonb)
  );
end;
$$;

create or replace function public.fs_member_create_reservation(p_member_code text, p_pin text, p_date date, p_start_minute int, p_people text, p_note text default '')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.fs_members;
  mo text := to_char(p_date,'YYYY-MM');
  q int;
  start_ts timestamp := p_date::timestamp + make_interval(mins => p_start_minute);
begin
  select * into m from public.fs_member_by_login(p_member_code,p_pin);
  if m.id is null then return jsonb_build_object('ok',false,'error','ログイン情報が違います。'); end if;
  if p_date < current_date or p_date >= current_date + 14 then return jsonb_build_object('ok',false,'error','予約可能期間外です。'); end if;
  if start_ts <= now() + interval '60 minutes' then return jsonb_build_object('ok',false,'error','当日予約は1時間前までです。'); end if;
  if public.fs_slot_blocked(p_date,p_start_minute) then return jsonb_build_object('ok',false,'error','この時間は予約できません。'); end if;
  if exists(select 1 from public.fs_closed_slots where date=p_date and start_minute=p_start_minute) then return jsonb_build_object('ok',false,'error','この枠は利用不可です。'); end if;
  if exists(select 1 from public.fs_reservations where date=p_date and start_minute=p_start_minute and cancelled=false) then return jsonb_build_object('ok',false,'error','この枠は予約済みです。'); end if;
  if (select count(*) from public.fs_reservations where member_id=m.id and cancelled=false and (date::timestamp + make_interval(mins=>start_minute)) > now()) >= 2 then return jsonb_build_object('ok',false,'error','同時予約は最大2枠までです。'); end if;
  if (select count(*) from public.fs_reservations where member_id=m.id and cancelled=false and date=p_date) >= 2 then return jsonb_build_object('ok',false,'error','同日予約は最大2枠までです。'); end if;
  q := public.fs_plan_quota(m.plan) + public.fs_extra_slots(m.id, mo);
  if not public.fs_is_unlimited_plan(m.plan) and (select count(*) from public.fs_reservations where member_id=m.id and cancelled=false and to_char(date,'YYYY-MM')=mo) >= q then return jsonb_build_object('ok',false,'error','今月の予約上限に達しています。'); end if;
  insert into public.fs_reservations(member_id,date,start_minute,people,note,created_by) values(m.id,p_date,p_start_minute,coalesce(nullif(p_people,''),'1名'),p_note,'member');
  return jsonb_build_object('ok',true);
exception when unique_violation then
  return jsonb_build_object('ok',false,'error','直前に予約が入りました。');
end;
$$;

grant execute on function public.fs_is_unlimited_plan(text) to anon, authenticated;
grant execute on function public.fs_plan_quota(text) to anon, authenticated;
grant execute on function public.fs_member_quota(text) to anon, authenticated;
grant execute on function public.fs_member_snapshot(text,text) to anon, authenticated;
grant execute on function public.fs_member_create_reservation(text,text,date,int,text,text) to anon, authenticated;
