-- 行徳ジム24の既存Supabaseへ適用する最終マイグレーション。
-- supabase-setup-gyotoku-gym24-v1.sql の後に実行してください。

alter table public.fs_plan_settings add column if not exists is_configured boolean not null default false;

create or replace function public.fs_member_by_login(p_member_code text, p_pin text)
returns public.fs_members language sql security definer set search_path = public as $$
  select * from fs_members where upper(member_code) = upper(p_member_code) and pin = p_pin and status = 'active' and plan in ('free', 'standard', 'premium') limit 1
$$;

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

create or replace function public.fs_member_snapshot(p_member_code text, p_pin text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare m fs_members; settings fs_plan_settings;
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

alter table public.fs_app_settings enable row level security;
alter table public.fs_plan_settings enable row level security;
alter table public.fs_members enable row level security;
alter table public.fs_reservations enable row level security;
alter table public.fs_closed_slots enable row level security;
grant usage on schema public to anon, authenticated;
grant execute on all functions in schema public to anon, authenticated;
