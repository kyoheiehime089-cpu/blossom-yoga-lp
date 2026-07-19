-- 行徳ジム24 予約ルール確定版（このファイルだけを1回実行）
-- 前提: 既存の fs_* テーブルと基本RPCが作成済み
begin;

alter table public.fs_plan_settings add column if not exists is_configured boolean not null default false;

insert into public.fs_plan_settings(plan_code, monthly_price, monthly_quota, use_minutes, adults_allowed, two_adult_cost, concurrent_limit, daily_limit, booking_days, booking_deadline_minutes, cancellation_deadline_minutes, is_configured)
values
  ('free', 0, 4, 25, 1, 1, 1, 1, 7, 120, 180, true),
  ('standard', 4800, 6, 40, 2, 1, 1, 1, 14, 120, 180, true),
  ('premium', 0, null, 40, 2, 1, 2, 1, 14, 120, 180, true)
on conflict (plan_code) do update set
  monthly_price=excluded.monthly_price,
  monthly_quota=excluded.monthly_quota,
  use_minutes=excluded.use_minutes,
  adults_allowed=excluded.adults_allowed,
  two_adult_cost=excluded.two_adult_cost,
  concurrent_limit=excluded.concurrent_limit,
  daily_limit=excluded.daily_limit,
  booking_days=excluded.booking_days,
  booking_deadline_minutes=excluded.booking_deadline_minutes,
  cancellation_deadline_minutes=excluded.cancellation_deadline_minutes,
  is_configured=excluded.is_configured;

create table if not exists public.fs_registered_users (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.fs_members(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  is_contract_holder boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists fs_registered_users_one_holder_uq on public.fs_registered_users(member_id) where is_contract_holder;
create index if not exists fs_registered_users_member_idx on public.fs_registered_users(member_id, is_active);

insert into public.fs_registered_users(member_id, name, is_contract_holder, is_active)
select m.id, m.name, true, true
from public.fs_members m
where m.status='active'
  and not exists (select 1 from public.fs_registered_users u where u.member_id=m.id and u.is_contract_holder);

alter table public.fs_reservations add column if not exists user1_id uuid references public.fs_registered_users(id);
alter table public.fs_reservations add column if not exists user1_name_snapshot text;
alter table public.fs_reservations add column if not exists user2_id uuid references public.fs_registered_users(id);
alter table public.fs_reservations add column if not exists user2_name_snapshot text;
alter table public.fs_reservations add column if not exists child_accompanied boolean not null default false;
alter table public.fs_reservations add column if not exists use_minutes_snapshot integer;

update public.fs_reservations r
set use_minutes_snapshot = s.use_minutes
from public.fs_members m join public.fs_plan_settings s on s.plan_code=m.plan
where r.member_id=m.id and r.use_minutes_snapshot is null;

update public.fs_reservations r
set user1_id=u.id, user1_name_snapshot=coalesce(r.user1_name_snapshot,u.name)
from public.fs_registered_users u
where r.member_id=u.member_id and u.is_contract_holder and r.user1_id is null;

alter table public.fs_registered_users enable row level security;

grant usage on schema public to anon, authenticated;

create or replace function public.fs_member_snapshot(p_member_code text, p_pin text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare m public.fs_members; settings public.fs_plan_settings;
begin
  select * into m from public.fs_member_by_login(p_member_code,p_pin);
  if m.id is null then return jsonb_build_object('ok',false,'error','会員IDまたはPINが違います。'); end if;
  select * into settings from public.fs_plan_settings where plan_code=m.plan;
  if settings.plan_code is null or not settings.is_configured or settings.use_minutes<=0 then
    return jsonb_build_object('ok',false,'error','プラン設定を取得できませんでした。');
  end if;
  return jsonb_build_object(
    'ok',true,
    'member',jsonb_build_object('id',m.id,'member_code',m.member_code,'name',m.name,'email',m.email,'pin',m.pin,'plan',m.plan,'quota',settings.monthly_quota),
    'plan_settings',to_jsonb(settings),
    'registered_users',coalesce((select jsonb_agg(to_jsonb(u) order by u.is_contract_holder desc,u.created_at) from public.fs_registered_users u where u.member_id=m.id and u.is_active),'[]'::jsonb),
    'reservations',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'date',r.date,'start_minute',r.start_minute,'people',r.people,'note',r.note,'user1_id',r.user1_id,'user1_name_snapshot',r.user1_name_snapshot,'user2_id',r.user2_id,'user2_name_snapshot',r.user2_name_snapshot,'child_accompanied',r.child_accompanied,'use_minutes_snapshot',coalesce(r.use_minutes_snapshot,settings.use_minutes),'created_at',r.created_at) order by r.date,r.start_minute) from public.fs_reservations r where r.member_id=m.id and not r.cancelled),'[]'::jsonb),
    'booked_slots',coalesce((select jsonb_agg(jsonb_build_object('date',r.date,'start_minute',r.start_minute,'use_minutes',coalesce(r.use_minutes_snapshot,40),'is_mine',r.member_id=m.id) order by r.date,r.start_minute) from public.fs_reservations r where not r.cancelled),'[]'::jsonb),
    'closed_slots',coalesce((select jsonb_agg(to_jsonb(c) order by c.date,c.start_minute) from public.fs_closed_slots c),'[]'::jsonb),
    'external_blocks','[]'::jsonb
  );
end $$;

create or replace function public.fs_member_create_reservation_v2(
  p_member_code text,p_pin text,p_date date,p_start_minute integer,p_people integer,
  p_user1_id uuid,p_user2_id uuid default null,p_child_accompanied boolean default false,p_note text default ''
) returns jsonb language plpgsql security definer set search_path=public as $$
declare m public.fs_members; s public.fs_plan_settings; u1 public.fs_registered_users; u2 public.fs_registered_users; start_ts timestamp; used integer; holder_id uuid;
begin
  select * into m from public.fs_member_by_login(p_member_code,p_pin);
  if m.id is null then return jsonb_build_object('ok',false,'error','ログイン情報が違います。'); end if;
  select * into s from public.fs_plan_settings where plan_code=m.plan;
  if s.plan_code is null or not s.is_configured then return jsonb_build_object('ok',false,'error','プラン設定が無効です。'); end if;
  if p_people not in (1,2) then return jsonb_build_object('ok',false,'error','利用人数が不正です。'); end if;
  if m.plan='free' and p_people<>1 then return jsonb_build_object('ok',false,'error','無料プランは大人1名のみです。'); end if;
  select * into u1 from public.fs_registered_users where id=p_user1_id and member_id=m.id and is_active;
  if u1.id is null then return jsonb_build_object('ok',false,'error','利用者1が不正です。'); end if;
  if p_people=2 then
    select * into u2 from public.fs_registered_users where id=p_user2_id and member_id=m.id and is_active;
    if u2.id is null or u2.id=u1.id then return jsonb_build_object('ok',false,'error','利用者2が不正です。'); end if;
  end if;
  select id into holder_id from public.fs_registered_users where member_id=m.id and is_contract_holder and is_active limit 1;
  if m.plan in ('free','standard') and not (u1.id=holder_id or (p_people=2 and u2.id=holder_id)) then
    return jsonb_build_object('ok',false,'error','このプランは契約者本人を含む必要があります。');
  end if;
  if p_start_minute not between 0 and 1400 or p_start_minute%10<>0 or p_start_minute+s.use_minutes>1440 then return jsonb_build_object('ok',false,'error','開始時刻が不正です。'); end if;
  start_ts:=p_date::timestamp+make_interval(mins=>p_start_minute);
  if p_date<current_date or p_date>current_date+s.booking_days then return jsonb_build_object('ok',false,'error','予約可能期間外です。'); end if;
  if start_ts<=now()+make_interval(mins=>s.booking_deadline_minutes) then return jsonb_build_object('ok',false,'error','予約は開始時刻の2時間前までです。'); end if;
  perform pg_advisory_xact_lock(hashtextextended(p_date::text||':'||p_start_minute::text,0));
  if exists(
    select 1 from public.fs_reservations r
    where not r.cancelled and r.date between p_date-1 and p_date+1
      and public.fs_self_block_overlaps(p_date,p_start_minute-10,s.use_minutes+20,r.date,r.start_minute-10,coalesce(r.use_minutes_snapshot,40)+20)
  ) then return jsonb_build_object('ok',false,'error','前後10分を含め、この時間は予約できません。'); end if;
  if exists(select 1 from public.fs_closed_slots c where c.date=p_date and public.fs_self_block_overlaps(p_date,p_start_minute-10,s.use_minutes+20,c.date,c.start_minute-10,60)) then return jsonb_build_object('ok',false,'error','利用不可時間です。'); end if;
  if (select count(*) from public.fs_reservations r where r.member_id=m.id and not r.cancelled and r.date::timestamp+make_interval(mins=>r.start_minute+coalesce(r.use_minutes_snapshot,s.use_minutes))>now())>=s.concurrent_limit then return jsonb_build_object('ok',false,'error','同時予約上限に達しています。'); end if;
  if (select count(*) from public.fs_reservations r where r.member_id=m.id and not r.cancelled and r.date=p_date)>=s.daily_limit then return jsonb_build_object('ok',false,'error','同日予約上限に達しています。'); end if;
  select count(*) into used from public.fs_reservations r where r.member_id=m.id and not r.cancelled and to_char(r.date,'YYYY-MM')=to_char(p_date,'YYYY-MM');
  if s.monthly_quota is not null and used+1>s.monthly_quota then return jsonb_build_object('ok',false,'error','今月の予約上限に達しています。'); end if;
  insert into public.fs_reservations(member_id,date,start_minute,people,note,created_by,user1_id,user1_name_snapshot,user2_id,user2_name_snapshot,child_accompanied,use_minutes_snapshot)
  values(m.id,p_date,p_start_minute,p_people||'名',p_note,'member',u1.id,u1.name,case when p_people=2 then u2.id end,case when p_people=2 then u2.name end,p_child_accompanied,s.use_minutes);
  return jsonb_build_object('ok',true);
end $$;

create or replace function public.fs_admin_upsert_registered_user(p_admin_password text,p_member_id uuid,p_user_id uuid,p_name text,p_is_active boolean default true)
returns jsonb language plpgsql security definer set search_path=public as $$
declare cnt integer; target public.fs_registered_users;
begin
  if not public.fs_is_admin(p_admin_password) then return jsonb_build_object('ok',false,'error','管理者パスコードが違います。'); end if;
  if not exists(select 1 from public.fs_members where id=p_member_id and plan in ('standard','premium') and status='active') then return jsonb_build_object('ok',false,'error','対象会員が不正です。'); end if;
  if p_user_id is null then
    select count(*) into cnt from public.fs_registered_users where member_id=p_member_id and not is_contract_holder;
    if cnt>=2 then return jsonb_build_object('ok',false,'error','同伴者は2名までです。'); end if;
    insert into public.fs_registered_users(member_id,name,is_contract_holder,is_active) values(p_member_id,btrim(p_name),false,p_is_active);
  else
    select * into target from public.fs_registered_users where id=p_user_id and member_id=p_member_id;
    if target.id is null or target.is_contract_holder then return jsonb_build_object('ok',false,'error','同伴者を更新できません。'); end if;
    update public.fs_registered_users set name=btrim(p_name),is_active=p_is_active,updated_at=now() where id=p_user_id;
  end if;
  return jsonb_build_object('ok',true);
end $$;

create or replace function public.fs_admin_registered_users(p_admin_password text,p_member_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
  if not public.fs_is_admin(p_admin_password) then return jsonb_build_object('ok',false,'error','管理者パスコードが違います。'); end if;
  return jsonb_build_object('ok',true,'users',coalesce((select jsonb_agg(to_jsonb(u) order by u.is_contract_holder desc,u.created_at) from public.fs_registered_users u where u.member_id=p_member_id),'[]'::jsonb));
end $$;

grant execute on function public.fs_member_snapshot(text,text) to anon,authenticated;
grant execute on function public.fs_member_create_reservation_v2(text,text,date,integer,integer,uuid,uuid,boolean,text) to anon,authenticated;
grant execute on function public.fs_admin_upsert_registered_user(text,uuid,uuid,text,boolean) to anon,authenticated;
grant execute on function public.fs_admin_registered_users(text,uuid) to anon,authenticated;

commit;

select plan_code,monthly_quota,use_minutes,two_adult_cost,concurrent_limit,daily_limit,booking_days,is_configured from public.fs_plan_settings order by plan_code;
