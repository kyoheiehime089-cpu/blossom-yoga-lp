-- friendsセルフ専用 Supabase SQL（既存のreservations等と衝突しないfs_接頭辞版）
-- Supabase SQL Editorに、このSQL本文をすべて貼り付けてRunしてください。

create extension if not exists pgcrypto;

-- 既存の同名RPCだけ作り直し。既存のYoga系テーブルは削除しません。
drop function if exists fs_admin_grant_slot(text, uuid) cascade;
drop function if exists fs_admin_mark_purchase_billed(text, uuid) cascade;
drop function if exists fs_admin_open_slot(text, uuid) cascade;
drop function if exists fs_admin_close_slot(text, date, int, text) cascade;
drop function if exists fs_admin_cancel_reservation(text, uuid) cascade;
drop function if exists fs_admin_create_reservation(text, uuid, date, int, text, text) cascade;
drop function if exists fs_admin_delete_member(text, uuid) cascade;
drop function if exists fs_admin_update_member(text, uuid, text, text, text, text) cascade;
drop function if exists fs_admin_create_member(text, text, text, text) cascade;
drop function if exists fs_admin_snapshot(text) cascade;
drop function if exists fs_member_purchase_slot(text, text) cascade;
drop function if exists fs_member_cancel_reservation(text, text, uuid) cascade;
drop function if exists fs_member_create_reservation(text, text, date, int, text, text) cascade;
drop function if exists fs_member_snapshot(text, text) cascade;
drop function if exists fs_member_by_login(text, text) cascade;
drop function if exists fs_slot_blocked(date, int) cascade;
drop function if exists fs_extra_slots(uuid, text) cascade;
drop function if exists fs_plan_quota(text) cascade;
drop function if exists fs_is_admin(text) cascade;

create table if not exists fs_app_settings (
  key text primary key,
  value text not null
);

insert into fs_app_settings(key,value)
values ('admin_password','1111')
on conflict (key) do nothing;

create table if not exists fs_members (
  id uuid primary key default gen_random_uuid(),
  member_code text unique not null,
  name text not null,
  email text unique,
  pin text not null,
  plan text not null check (plan in ('月4回プラン','月8回プラン','通い放題プラン','ファミリー月4回プラン','ファミリー月8回プラン','ファミリー通い放題プラン')),
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table if not exists fs_reservations (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references fs_members(id) on delete cascade,
  date date not null,
  start_minute int not null check (start_minute >= 0 and start_minute <= 1390),
  people text not null default '1名',
  note text,
  created_by text not null default 'member',
  cancelled boolean not null default false,
  created_at timestamptz not null default now(),
  cancelled_at timestamptz
);

create unique index if not exists fs_reservations_one_active_slot
on fs_reservations(date,start_minute)
where cancelled = false;

create table if not exists fs_closed_slots (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  start_minute int not null check (start_minute >= 0 and start_minute <= 1390),
  reason text,
  created_at timestamptz not null default now(),
  unique(date,start_minute)
);

create table if not exists fs_slot_purchases (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references fs_members(id) on delete cascade,
  month text not null,
  price int not null default 3000,
  slots int not null default 1,
  billing_status text not null default 'unconfirmed',
  created_at timestamptz not null default now(),
  billing_completed_at timestamptz
);

alter table fs_app_settings enable row level security;
alter table fs_members enable row level security;
alter table fs_reservations enable row level security;
alter table fs_closed_slots enable row level security;
alter table fs_slot_purchases enable row level security;

create or replace function fs_is_admin(p_admin_password text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists(select 1 from fs_app_settings where key='admin_password' and value = p_admin_password);
$$;

create or replace function fs_plan_quota(p_plan text)
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

create or replace function fs_is_unlimited_plan(p_plan text)
returns boolean
language sql
immutable
as $$
  select coalesce(p_plan,'') like '%通い放題%';
$$;

create or replace function fs_extra_slots(p_member_id uuid, p_month text)
returns int
language sql
security definer
set search_path = public
as $$
  select coalesce(sum(slots),0)::int
  from fs_slot_purchases
  where member_id = p_member_id
    and month = p_month;
$$;

create or replace function fs_slot_blocked(p_date date, p_start int)
returns boolean
language plpgsql
immutable
as $$
declare
  dow int := extract(dow from p_date);
  s int := p_start;
  e int := p_start + 50;
  holidays date[] := array['2026-01-01','2026-01-12','2026-02-11','2026-02-23','2026-03-20','2026-04-29','2026-05-03','2026-05-04','2026-05-05','2026-05-06','2026-07-20','2026-08-11','2026-09-21','2026-09-22','2026-09-23','2026-10-12','2026-11-03','2026-11-23']::date[];
begin
  if dow = 6 then
    return (s < 530 and 490 < e) or (s < 790 and 600 < e);
  elsif dow = 0 or p_date = any(holidays) then
    return (s < 580 and 540 < e) or (s < 790 and 600 < e);
  else
    return (s < 760 and 720 < e) or (s < 1300 and 1110 < e);
  end if;
end;
$$;

create or replace function fs_member_by_login(p_member_code text, p_pin text)
returns fs_members
language sql
security definer
set search_path = public
as $$
  select * from fs_members
  where upper(member_code) = upper(p_member_code)
    and pin = p_pin
    and status = 'active'
  limit 1;
$$;

create or replace function fs_member_snapshot(p_member_code text, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  m fs_members;
  mo text := to_char(current_date,'YYYY-MM');
  q int;
  ex int;
begin
  select * into m from fs_member_by_login(p_member_code,p_pin);
  if m.id is null then
    return jsonb_build_object('ok',false,'error','会員IDまたはPINが違います。');
  end if;
  ex := fs_extra_slots(m.id, mo);
  q := fs_plan_quota(m.plan) + ex;
  return jsonb_build_object(
    'ok', true,
    'member', jsonb_build_object('id',m.id,'member_code',m.member_code,'name',m.name,'email',m.email,'plan',m.plan,'quota',q,'extra_slots',ex),
    'reservations', coalesce((select jsonb_agg(to_jsonb(x) order by x.date,x.start_minute) from (select id,date,start_minute,people,note,created_at,cancelled from fs_reservations where member_id=m.id and cancelled=false) x),'[]'::jsonb),
    'booked_slots', coalesce((select jsonb_agg(jsonb_build_object('date',r.date,'start_minute',r.start_minute,'is_mine',r.member_id=m.id)) from fs_reservations r where r.cancelled=false and r.date between current_date and current_date + 14),'[]'::jsonb),
    'closed_slots', coalesce((select jsonb_agg(to_jsonb(c)) from fs_closed_slots c where c.date between current_date and current_date + 14),'[]'::jsonb),
    'purchases', coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at desc) from fs_slot_purchases p where p.member_id=m.id),'[]'::jsonb)
  );
end;
$$;

create or replace function fs_member_create_reservation(p_member_code text, p_pin text, p_date date, p_start_minute int, p_people text, p_note text default '')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  m fs_members;
  mo text := to_char(p_date,'YYYY-MM');
  q int;
  start_ts timestamp := p_date::timestamp + make_interval(mins => p_start_minute);
begin
  select * into m from fs_member_by_login(p_member_code,p_pin);
  if m.id is null then return jsonb_build_object('ok',false,'error','ログイン情報が違います。'); end if;
  if p_date < current_date or p_date >= current_date + 14 then return jsonb_build_object('ok',false,'error','予約可能期間外です。'); end if;
  if start_ts <= now() + interval '60 minutes' then return jsonb_build_object('ok',false,'error','当日予約は1時間前までです。'); end if;
  if fs_slot_blocked(p_date,p_start_minute) then return jsonb_build_object('ok',false,'error','この時間は予約できません。'); end if;
  if exists(select 1 from fs_closed_slots where date=p_date and start_minute=p_start_minute) then return jsonb_build_object('ok',false,'error','この枠は利用不可です。'); end if;
  if exists(select 1 from fs_reservations where date=p_date and start_minute=p_start_minute and cancelled=false) then return jsonb_build_object('ok',false,'error','この枠は予約済みです。'); end if;
  if (select count(*) from fs_reservations where member_id=m.id and cancelled=false and (date::timestamp + make_interval(mins=>start_minute)) > now()) >= 2 then return jsonb_build_object('ok',false,'error','同時予約は最大2枠までです。'); end if;
  if (select count(*) from fs_reservations where member_id=m.id and cancelled=false and date=p_date) >= 2 then return jsonb_build_object('ok',false,'error','同日予約は最大2枠までです。'); end if;
  q := fs_plan_quota(m.plan) + fs_extra_slots(m.id, mo);
  if not fs_is_unlimited_plan(m.plan) and (select count(*) from fs_reservations where member_id=m.id and cancelled=false and to_char(date,'YYYY-MM')=mo) >= q then return jsonb_build_object('ok',false,'error','今月の予約上限に達しています。'); end if;
  insert into fs_reservations(member_id,date,start_minute,people,note,created_by) values(m.id,p_date,p_start_minute,coalesce(nullif(p_people,''),'1名'),p_note,'member');
  return jsonb_build_object('ok',true);
exception when unique_violation then
  return jsonb_build_object('ok',false,'error','直前に予約が入りました。');
end;
$$;

create or replace function fs_member_cancel_reservation(p_member_code text, p_pin text, p_reservation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  m fs_members;
  r fs_reservations;
begin
  select * into m from fs_member_by_login(p_member_code,p_pin);
  if m.id is null then return jsonb_build_object('ok',false,'error','ログイン情報が違います。'); end if;
  select * into r from fs_reservations where id=p_reservation_id and member_id=m.id and cancelled=false;
  if r.id is null then return jsonb_build_object('ok',false,'error','予約が見つかりません。'); end if;
  if (r.date::timestamp + make_interval(mins=>r.start_minute)) <= now() + interval '120 minutes' then return jsonb_build_object('ok',false,'error','当日キャンセルは2時間前までです。'); end if;
  update fs_reservations set cancelled=true, cancelled_at=now() where id=r.id;
  return jsonb_build_object('ok',true);
end;
$$;

create or replace function fs_member_purchase_slot(p_member_code text, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  m fs_members;
  mo text := to_char(current_date,'YYYY-MM');
begin
  select * into m from fs_member_by_login(p_member_code,p_pin);
  if m.id is null then return jsonb_build_object('ok',false,'error','ログイン情報が違います。'); end if;
  insert into fs_slot_purchases(member_id,month,price,slots,billing_status) values(m.id,mo,3000,1,'unconfirmed');
  return jsonb_build_object('ok',true);
end;
$$;

create or replace function fs_admin_snapshot(p_admin_password text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not fs_is_admin(p_admin_password) then return jsonb_build_object('ok',false,'error','管理者パスコードが違います。'); end if;
  return jsonb_build_object(
    'ok', true,
    'members', coalesce((select jsonb_agg(to_jsonb(m) order by m.created_at desc) from fs_members m where status='active'),'[]'::jsonb),
    'reservations', coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'member_id',r.member_id,'member_name',m.name,'member_code',m.member_code,'plan',m.plan,'date',r.date,'start_minute',r.start_minute,'people',r.people,'note',r.note,'created_by',r.created_by,'created_at',r.created_at,'cancelled',r.cancelled) order by r.date,r.start_minute) from fs_reservations r join fs_members m on m.id=r.member_id where r.cancelled=false),'[]'::jsonb),
    'closed_slots', coalesce((select jsonb_agg(to_jsonb(c) order by c.date,c.start_minute) from fs_closed_slots c),'[]'::jsonb),
    'purchases', coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'member_id',p.member_id,'member_name',m.name,'member_code',m.member_code,'plan',m.plan,'month',p.month,'price',p.price,'slots',p.slots,'billing_status',p.billing_status,'created_at',p.created_at,'billing_completed_at',p.billing_completed_at) order by p.created_at desc) from fs_slot_purchases p join fs_members m on m.id=p.member_id),'[]'::jsonb)
  );
end;
$$;

create or replace function fs_admin_create_member(p_admin_password text, p_name text, p_email text, p_plan text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  code text;
  pin text;
  m fs_members;
begin
  if not fs_is_admin(p_admin_password) then return jsonb_build_object('ok',false,'error','管理者パスコードが違います。'); end if;
  select 'FS'||lpad((coalesce(max(regexp_replace(member_code,'\D','','g')::int),0)+1)::text,3,'0') into code from fs_members;
  pin := (floor(random()*9000)+1000)::int::text;
  insert into fs_members(member_code,name,email,pin,plan) values(code,p_name,p_email,pin,p_plan) returning * into m;
  return jsonb_build_object('ok',true,'member',to_jsonb(m));
exception when unique_violation then
  return jsonb_build_object('ok',false,'error','同じメールアドレス、または会員IDが既にあります。');
end;
$$;

create or replace function fs_admin_update_member(p_admin_password text, p_member_id uuid, p_name text, p_email text, p_pin text, p_plan text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not fs_is_admin(p_admin_password) then return jsonb_build_object('ok',false,'error','管理者パスコードが違います。'); end if;
  update fs_members set name=p_name,email=p_email,pin=p_pin,plan=p_plan where id=p_member_id;
  return jsonb_build_object('ok',true);
end;
$$;

create or replace function fs_admin_delete_member(p_admin_password text, p_member_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not fs_is_admin(p_admin_password) then return jsonb_build_object('ok',false,'error','管理者パスコードが違います。'); end if;
  update fs_members set status='deleted' where id=p_member_id;
  update fs_reservations set cancelled=true,cancelled_at=now() where member_id=p_member_id and cancelled=false;
  return jsonb_build_object('ok',true);
end;
$$;

create or replace function fs_admin_create_reservation(p_admin_password text, p_member_id uuid, p_date date, p_start_minute int, p_people text, p_note text default '')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  m fs_members;
begin
  if not fs_is_admin(p_admin_password) then return jsonb_build_object('ok',false,'error','管理者パスコードが違います。'); end if;
  select * into m from fs_members where id=p_member_id and status='active';
  if m.id is null then return jsonb_build_object('ok',false,'error','会員が見つかりません。'); end if;
  if fs_slot_blocked(p_date,p_start_minute) or exists(select 1 from fs_closed_slots where date=p_date and start_minute=p_start_minute) then return jsonb_build_object('ok',false,'error','この枠は予約できません。'); end if;
  insert into fs_reservations(member_id,date,start_minute,people,note,created_by) values(m.id,p_date,p_start_minute,coalesce(nullif(p_people,''),'1名'),p_note,'admin');
  return jsonb_build_object('ok',true);
exception when unique_violation then
  return jsonb_build_object('ok',false,'error','この枠は既に埋まっています。');
end;
$$;

create or replace function fs_admin_cancel_reservation(p_admin_password text, p_reservation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not fs_is_admin(p_admin_password) then return jsonb_build_object('ok',false,'error','管理者パスコードが違います。'); end if;
  update fs_reservations set cancelled=true,cancelled_at=now() where id=p_reservation_id;
  return jsonb_build_object('ok',true);
end;
$$;

create or replace function fs_admin_close_slot(p_admin_password text, p_date date, p_start_minute int, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not fs_is_admin(p_admin_password) then return jsonb_build_object('ok',false,'error','管理者パスコードが違います。'); end if;
  if fs_slot_blocked(p_date,p_start_minute) then return jsonb_build_object('ok',false,'error','本来予約できない時間です。'); end if;
  if exists(select 1 from fs_reservations where date=p_date and start_minute=p_start_minute and cancelled=false) then return jsonb_build_object('ok',false,'error','予約済みの枠です。'); end if;
  insert into fs_closed_slots(date,start_minute,reason) values(p_date,p_start_minute,p_reason) on conflict(date,start_minute) do update set reason=excluded.reason;
  return jsonb_build_object('ok',true);
end;
$$;

create or replace function fs_admin_open_slot(p_admin_password text, p_closed_slot_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not fs_is_admin(p_admin_password) then return jsonb_build_object('ok',false,'error','管理者パスコードが違います。'); end if;
  delete from fs_closed_slots where id=p_closed_slot_id;
  return jsonb_build_object('ok',true);
end;
$$;

create or replace function fs_admin_mark_purchase_billed(p_admin_password text, p_purchase_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not fs_is_admin(p_admin_password) then return jsonb_build_object('ok',false,'error','管理者パスコードが違います。'); end if;
  update fs_slot_purchases set billing_status='completed', billing_completed_at=now() where id=p_purchase_id;
  return jsonb_build_object('ok',true);
end;
$$;

create or replace function fs_admin_grant_slot(p_admin_password text, p_member_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not fs_is_admin(p_admin_password) then return jsonb_build_object('ok',false,'error','管理者パスコードが違います。'); end if;
  insert into fs_slot_purchases(member_id,month,price,slots,billing_status) values(p_member_id,to_char(current_date,'YYYY-MM'),0,1,'not_required');
  return jsonb_build_object('ok',true);
end;
$$;

grant execute on all functions in schema public to anon, authenticated;
