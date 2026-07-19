-- 行徳ジム24予約アプリの初期構成。対象は fs_* テーブルだけです。
-- Supabase SQL Editorで一度実行し、以後の変更は supabase-final-migration.sql を実行します。

create extension if not exists pgcrypto;

create table if not exists public.fs_app_settings (
  key text primary key,
  value text not null
);
insert into public.fs_app_settings(key, value)
values ('admin_password', '1111')
on conflict (key) do nothing;

create table if not exists public.fs_plan_settings (
  plan_code text primary key check (plan_code in ('free', 'standard', 'premium')),
  monthly_price integer not null default 0,
  monthly_quota integer,
  use_minutes integer not null default 0,
  adults_allowed integer not null default 0,
  two_adult_cost integer not null default 0,
  concurrent_limit integer not null default 0,
  daily_limit integer not null default 0,
  booking_days integer not null default 0,
  booking_deadline_minutes integer not null default 0,
  cancellation_deadline_minutes integer not null default 0,
  is_configured boolean not null default false,
  check (monthly_quota is null or monthly_quota >= 0)
);
alter table public.fs_plan_settings add column if not exists is_configured boolean not null default false;
insert into public.fs_plan_settings(plan_code, monthly_price, monthly_quota, use_minutes, adults_allowed, two_adult_cost, concurrent_limit, daily_limit, booking_days, booking_deadline_minutes, cancellation_deadline_minutes, is_configured)
values
  ('free', 0, 4, 25, 1, 1, 1, 1, 14, 120, 180, true),
  ('standard', 4800, 6, 40, 2, 2, 1, 1, 14, 120, 180, true),
  ('premium', 0, null, 0, 0, 0, 0, 0, 0, 0, 0, false)
on conflict (plan_code) do update set
  monthly_price = excluded.monthly_price,
  monthly_quota = excluded.monthly_quota,
  use_minutes = excluded.use_minutes,
  adults_allowed = excluded.adults_allowed,
  two_adult_cost = excluded.two_adult_cost,
  concurrent_limit = excluded.concurrent_limit,
  daily_limit = excluded.daily_limit,
  booking_days = excluded.booking_days,
  booking_deadline_minutes = excluded.booking_deadline_minutes,
  cancellation_deadline_minutes = excluded.cancellation_deadline_minutes,
  is_configured = excluded.is_configured;

create table if not exists public.fs_members (
  id uuid primary key default gen_random_uuid(),
  member_code text not null,
  name text not null,
  email text,
  pin text not null,
  plan text not null default 'free' check (plan in ('free', 'standard', 'premium')),
  status text not null default 'active' check (status in ('active', 'suspended', 'deleted')),
  created_at timestamptz not null default now()
);
create unique index if not exists fs_members_active_code_uq on public.fs_members (upper(member_code)) where status = 'active';
create unique index if not exists fs_members_active_email_uq on public.fs_members (lower(email)) where status = 'active' and email is not null and email <> '';

create table if not exists public.fs_reservations (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.fs_members(id) on delete cascade,
  date date not null,
  start_minute integer not null check (start_minute between 0 and 1400 and start_minute % 10 = 0),
  people text not null default '1名',
  note text,
  created_by text not null default 'member',
  cancelled boolean not null default false,
  created_at timestamptz not null default now(),
  cancelled_at timestamptz
);
create table if not exists public.fs_closed_slots (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  start_minute integer not null check (start_minute between 0 and 1400 and start_minute % 10 = 0),
  reason text,
  created_at timestamptz not null default now()
);
create index if not exists fs_reservations_active_date_idx on public.fs_reservations(date, start_minute) where not cancelled;
create index if not exists fs_closed_slots_date_idx on public.fs_closed_slots(date, start_minute);

alter table public.fs_app_settings enable row level security;
alter table public.fs_plan_settings enable row level security;
alter table public.fs_members enable row level security;
alter table public.fs_reservations enable row level security;
alter table public.fs_closed_slots enable row level security;

create or replace function public.fs_is_admin(p_admin_password text)
returns boolean language sql security definer set search_path = public as $$
  select exists(select 1 from fs_app_settings where key = 'admin_password' and value = p_admin_password)
$$;

create or replace function public.fs_member_by_login(p_member_code text, p_pin text)
returns public.fs_members language sql security definer set search_path = public as $$
  select * from fs_members where upper(member_code) = upper(p_member_code) and pin = p_pin and status = 'active' and plan in ('free', 'standard', 'premium') limit 1
$$;

create or replace function public.fs_plan_quota(p_plan text)
returns integer language sql stable security definer set search_path = public as $$
  select monthly_quota from fs_plan_settings where plan_code = p_plan
$$;

create or replace function public.fs_is_unlimited_plan(p_plan text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select monthly_quota is null from fs_plan_settings where plan_code = p_plan), false)
$$;

create or replace function public.fs_self_block_overlaps(p_date date, p_start_minute integer, p_block_minutes integer, p_existing_date date, p_existing_start_minute integer, p_existing_block_minutes integer)
returns boolean language sql immutable as $$
  select (p_date::timestamp + make_interval(mins => p_start_minute)) < (p_existing_date::timestamp + make_interval(mins => p_existing_start_minute + p_existing_block_minutes))
    and (p_existing_date::timestamp + make_interval(mins => p_existing_start_minute)) < (p_date::timestamp + make_interval(mins => p_start_minute + p_block_minutes))
$$;

create or replace function public.fs_self_reservation_overlaps(p_date date, p_start_minute integer, p_end_minute integer, p_ignore_reservation_id uuid default null)
returns boolean language sql security definer set search_path = public as $$
  select exists(select 1 from fs_reservations r where not r.cancelled and (p_ignore_reservation_id is null or r.id <> p_ignore_reservation_id) and r.date between p_date - 1 and p_date + 1 and fs_self_block_overlaps(p_date, p_start_minute, p_end_minute - p_start_minute, r.date, r.start_minute, 50))
$$;

create or replace function public.fs_member_snapshot(p_member_code text, p_pin text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  m fs_members;
  settings fs_plan_settings;
begin
  select * into m from fs_member_by_login(p_member_code, p_pin);
  if m.id is null then return jsonb_build_object('ok', false, 'error', '会員IDまたはPINが違います。'); end if;
  select * into settings from fs_plan_settings where plan_code = m.plan;
  return jsonb_build_object(
    'ok', true,
    'member', jsonb_build_object('id', m.id, 'member_code', m.member_code, 'name', m.name, 'email', m.email, 'pin', m.pin, 'plan', m.plan, 'quota', settings.monthly_quota, 'base_quota', settings.monthly_quota, 'extra_slots', 0, 'monthly_limit', settings.monthly_quota is not null),
    'plan_settings', to_jsonb(settings),
    'reservations', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'date', date, 'start_minute', start_minute, 'people', people, 'note', note, 'created_at', created_at) order by date, start_minute) from fs_reservations where member_id = m.id and not cancelled), '[]'),
    'booked_slots', coalesce((select jsonb_agg(jsonb_build_object('date', date, 'start_minute', start_minute, 'is_mine', member_id = m.id) order by date, start_minute) from fs_reservations where not cancelled), '[]'),
    'closed_slots', coalesce((select jsonb_agg(to_jsonb(c) order by date, start_minute) from fs_closed_slots c), '[]'),
    'external_blocks', '[]'::jsonb
  );
end $$;

create or replace function public.fs_member_apps_snapshot(p_member_code text, p_pin text)
returns jsonb language sql security definer set search_path = public as $$ select fs_member_snapshot(p_member_code, p_pin) $$;

create or replace function public.fs_member_create_reservation(p_member_code text, p_pin text, p_date date, p_start_minute integer, p_people text, p_note text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  m fs_members;
  settings fs_plan_settings;
  start_ts timestamp;
  requested_people integer;
  cost integer;
  used integer;
begin
  select * into m from fs_member_by_login(p_member_code, p_pin);
  if m.id is null then return jsonb_build_object('ok', false, 'error', 'ログイン情報が違います。'); end if;
  select * into settings from fs_plan_settings where plan_code = m.plan;
  if not coalesce(settings.is_configured, false) then return jsonb_build_object('ok', false, 'error', 'このプランの利用仕様は未確定です。'); end if;
  if p_people not in ('1名', '2名') then return jsonb_build_object('ok', false, 'error', '利用人数が不正です。'); end if;
  requested_people := case when p_people = '2名' then 2 else 1 end;
  cost := case when requested_people = 2 then settings.two_adult_cost else 1 end;
  if requested_people = 2 and settings.adults_allowed < 2 then return jsonb_build_object('ok', false, 'error', 'このプランは大人2名利用できません。'); end if;
  if p_start_minute not between 0 and 1400 or p_start_minute % 10 <> 0 or p_start_minute + settings.use_minutes > 1440 then return jsonb_build_object('ok', false, 'error', '開始時刻が不正です。'); end if;
  start_ts := p_date::timestamp + make_interval(mins => p_start_minute);
  if p_date < current_date or p_date > current_date + settings.booking_days then return jsonb_build_object('ok', false, 'error', '予約可能期間外です。'); end if;
  if start_ts <= now() + make_interval(mins => settings.booking_deadline_minutes) then return jsonb_build_object('ok', false, 'error', '予約は開始時刻の2時間前までです。'); end if;
  if fs_self_reservation_overlaps(p_date, p_start_minute, p_start_minute + settings.use_minutes + 10) then return jsonb_build_object('ok', false, 'error', 'この時間は予約できません。'); end if;
  if (select count(*) from fs_reservations where member_id = m.id and not cancelled and date::timestamp + make_interval(mins => start_minute) > now()) >= settings.concurrent_limit then return jsonb_build_object('ok', false, 'error', '同時予約上限に達しています。'); end if;
  if (select count(*) from fs_reservations where member_id = m.id and not cancelled and date = p_date) >= settings.daily_limit then return jsonb_build_object('ok', false, 'error', '同日予約上限に達しています。'); end if;
  select coalesce(sum(case when people = '2名' then settings.two_adult_cost else 1 end), 0) into used from fs_reservations where member_id = m.id and not cancelled and to_char(date, 'YYYY-MM') = to_char(p_date, 'YYYY-MM');
  if settings.monthly_quota is not null and used + cost > settings.monthly_quota then return jsonb_build_object('ok', false, 'error', '今月の予約上限に達しています。'); end if;
  insert into fs_reservations(member_id, date, start_minute, people, note, created_by) values (m.id, p_date, p_start_minute, p_people, p_note, 'member');
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.fs_member_cancel_reservation(p_member_code text, p_pin text, p_reservation_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare m fs_members; r fs_reservations;
begin
  select * into m from fs_member_by_login(p_member_code, p_pin);
  select * into r from fs_reservations where id = p_reservation_id and member_id = m.id and not cancelled;
  if m.id is null or r.id is null then return jsonb_build_object('ok', false, 'error', '予約が見つかりません。'); end if;
  if r.date::timestamp + make_interval(mins => r.start_minute) <= now() + interval '180 minutes' then return jsonb_build_object('ok', false, 'error', 'キャンセルは開始時刻の3時間前までです。'); end if;
  update fs_reservations set cancelled = true, cancelled_at = now() where id = r.id;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.fs_admin_snapshot(p_admin_password text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not fs_is_admin(p_admin_password) then return jsonb_build_object('ok', false, 'error', '管理者パスコードが違います。'); end if;
  return jsonb_build_object(
    'ok', true,
    'members', coalesce((select jsonb_agg(to_jsonb(m) order by created_at desc) from fs_members m where status = 'active' and plan in ('free', 'standard', 'premium')), '[]'),
    'reservations', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'member_id', r.member_id, 'member_name', m.name, 'member_code', m.member_code, 'plan', m.plan, 'date', r.date, 'start_minute', r.start_minute, 'people', r.people, 'note', r.note, 'created_by', r.created_by, 'created_at', r.created_at) order by r.date, r.start_minute) from fs_reservations r join fs_members m on m.id = r.member_id where not r.cancelled and m.status = 'active' and m.plan in ('free', 'standard', 'premium')), '[]'),
    'closed_slots', coalesce((select jsonb_agg(to_jsonb(c) order by date, start_minute) from fs_closed_slots c), '[]'),
    'external_blocks', '[]'::jsonb
  );
end $$;

create or replace function public.fs_admin_create_member(p_admin_password text, p_name text, p_email text, p_plan text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare n integer := 1; code text; m fs_members;
begin
  if not fs_is_admin(p_admin_password) then return jsonb_build_object('ok', false, 'error', '管理者パスコードが違います。'); end if;
  if p_plan not in ('free', 'standard', 'premium') then return jsonb_build_object('ok', false, 'error', 'プランが不正です。'); end if;
  loop code := 'G24' || lpad(n::text, 3, '0'); exit when not exists(select 1 from fs_members where upper(member_code) = code and status = 'active'); n := n + 1; end loop;
  insert into fs_members(member_code, name, email, pin, plan) values (code, btrim(p_name), nullif(btrim(p_email), ''), (floor(random() * 9000) + 1000)::integer::text, p_plan) returning * into m;
  return jsonb_build_object('ok', true, 'member', to_jsonb(m));
end $$;

create or replace function public.fs_admin_update_member(p_admin_password text, p_member_id uuid, p_name text, p_email text, p_pin text, p_plan text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not fs_is_admin(p_admin_password) then return jsonb_build_object('ok', false, 'error', '管理者パスコードが違います。'); end if;
  if p_plan not in ('free', 'standard', 'premium') then return jsonb_build_object('ok', false, 'error', 'プランが不正です。'); end if;
  update fs_members set name = btrim(p_name), email = nullif(btrim(p_email), ''), pin = btrim(p_pin), plan = p_plan where id = p_member_id and status = 'active';
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.fs_admin_create_reservation(p_admin_password text, p_member_id uuid, p_date date, p_start_minute integer, p_people text, p_note text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not fs_is_admin(p_admin_password) then return jsonb_build_object('ok', false, 'error', '管理者パスコードが違います。'); end if;
  if not exists(select 1 from fs_members where id = p_member_id and status = 'active') then return jsonb_build_object('ok', false, 'error', '会員が見つかりません。'); end if;
  if p_people not in ('1名', '2名') or p_start_minute not between 0 and 1400 or p_start_minute % 10 <> 0 then return jsonb_build_object('ok', false, 'error', '予約内容が不正です。'); end if;
  if fs_self_reservation_overlaps(p_date, p_start_minute, p_start_minute + 50) then return jsonb_build_object('ok', false, 'error', 'この時間は予約済みです。'); end if;
  insert into fs_reservations(member_id, date, start_minute, people, note, created_by) values (p_member_id, p_date, p_start_minute, p_people, p_note, 'admin');
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.fs_admin_cancel_reservation(p_admin_password text, p_reservation_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not fs_is_admin(p_admin_password) then return jsonb_build_object('ok', false, 'error', '管理者パスコードが違います。'); end if;
  update fs_reservations set cancelled = true, cancelled_at = now() where id = p_reservation_id;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.fs_admin_close_slot(p_admin_password text, p_date date, p_start_minute integer, p_reason text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not fs_is_admin(p_admin_password) then return jsonb_build_object('ok', false, 'error', '管理者パスコードが違います。'); end if;
  if fs_self_reservation_overlaps(p_date, p_start_minute, p_start_minute + 50) then return jsonb_build_object('ok', false, 'error', '予約済み枠は利用不可にできません。'); end if;
  insert into fs_closed_slots(date, start_minute, reason) values (p_date, p_start_minute, p_reason);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.fs_admin_open_slot(p_admin_password text, p_closed_slot_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not fs_is_admin(p_admin_password) then return jsonb_build_object('ok', false, 'error', '管理者パスコードが違います。'); end if;
  delete from fs_closed_slots where id = p_closed_slot_id;
  return jsonb_build_object('ok', true);
end $$;

grant usage on schema public to anon, authenticated;
grant execute on all functions in schema public to anon, authenticated;
