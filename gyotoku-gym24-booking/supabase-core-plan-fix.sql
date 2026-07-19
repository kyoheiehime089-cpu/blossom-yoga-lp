-- 行徳ジム24：プラン表示・0分利用・予約枠非表示の最小修正
-- 対象Supabase: https://fplvstwmsewpqwrcsqrm.supabase.co
-- 前提: supabase-setup-gyotoku-gym24-v1.sql と supabase-final-migration.sql が実行済み
-- このファイルだけをSQL Editorで1回実行してください。

begin;

alter table public.fs_plan_settings
  add column if not exists is_configured boolean not null default false;

-- DBに保存できるプランコードを3種類へ統一する。
update public.fs_members
set plan = lower(btrim(plan))
where lower(btrim(plan)) in ('free', 'standard', 'premium')
  and plan is distinct from lower(btrim(plan));

-- 現在確認対象の会員。管理画面上の指定どおりstandardへ固定する。
update public.fs_members
set plan = 'standard'
where upper(member_code) = 'G24001'
  and plan is distinct from 'standard';

insert into public.fs_plan_settings(
  plan_code,
  monthly_price,
  monthly_quota,
  use_minutes,
  adults_allowed,
  two_adult_cost,
  concurrent_limit,
  daily_limit,
  booking_days,
  booking_deadline_minutes,
  cancellation_deadline_minutes,
  is_configured
)
values
  ('free',     0,    4,    25, 1, 1, 1, 1, 14, 120, 180, true),
  ('standard', 4800, 6,    40, 2, 2, 1, 1, 14, 120, 180, true),
  ('premium',  0,    null, 40, 2, 1, 1, 1, 14, 120, 180, true)
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
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.fs_members;
  settings public.fs_plan_settings;
begin
  select * into m
  from public.fs_member_by_login(p_member_code, p_pin);

  if m.id is null then
    return jsonb_build_object('ok', false, 'error', '会員IDまたはPINが違います。');
  end if;

  if m.plan not in ('free', 'standard', 'premium') then
    return jsonb_build_object('ok', false, 'error', 'プラン設定を取得できませんでした。管理者へご連絡ください。');
  end if;

  select * into settings
  from public.fs_plan_settings
  where plan_code = m.plan;

  if settings.plan_code is null
     or not coalesce(settings.is_configured, false)
     or coalesce(settings.use_minutes, 0) <= 0 then
    return jsonb_build_object('ok', false, 'error', 'プラン設定を取得できませんでした。管理者へご連絡ください。');
  end if;

  return jsonb_build_object(
    'ok', true,
    'member', jsonb_build_object(
      'id', m.id,
      'member_code', m.member_code,
      'name', m.name,
      'email', m.email,
      'pin', m.pin,
      'plan', m.plan,
      'quota', settings.monthly_quota,
      'base_quota', settings.monthly_quota,
      'extra_slots', 0,
      'monthly_limit', settings.monthly_quota is not null
    ),
    'plan_settings', to_jsonb(settings),
    'reservations', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', id,
          'date', date,
          'start_minute', start_minute,
          'people', people,
          'note', note,
          'created_at', created_at
        ) order by date, start_minute
      )
      from public.fs_reservations
      where member_id = m.id and not cancelled
    ), '[]'::jsonb),
    'booked_slots', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'date', date,
          'start_minute', start_minute,
          'is_mine', member_id = m.id
        ) order by date, start_minute
      )
      from public.fs_reservations
      where not cancelled
    ), '[]'::jsonb),
    'closed_slots', coalesce((
      select jsonb_agg(to_jsonb(c) order by date, start_minute)
      from public.fs_closed_slots c
    ), '[]'::jsonb),
    'external_blocks', '[]'::jsonb
  );
end;
$$;

create or replace function public.fs_member_create_reservation(
  p_member_code text,
  p_pin text,
  p_date date,
  p_start_minute integer,
  p_people text,
  p_note text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.fs_members;
  settings public.fs_plan_settings;
  start_ts timestamp;
  requested_people integer;
  cost integer;
  used integer;
begin
  select * into m
  from public.fs_member_by_login(p_member_code, p_pin);

  if m.id is null then
    return jsonb_build_object('ok', false, 'error', 'ログイン情報が違います。');
  end if;

  if m.plan not in ('free', 'standard', 'premium') then
    return jsonb_build_object('ok', false, 'error', 'プラン設定を取得できませんでした。管理者へご連絡ください。');
  end if;

  select * into settings
  from public.fs_plan_settings
  where plan_code = m.plan;

  if settings.plan_code is null
     or not coalesce(settings.is_configured, false)
     or coalesce(settings.use_minutes, 0) <= 0 then
    return jsonb_build_object('ok', false, 'error', 'プラン設定を取得できませんでした。管理者へご連絡ください。');
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_date::text || ':' || p_start_minute::text, 0)
  );

  if p_people not in ('1名', '2名') then
    return jsonb_build_object('ok', false, 'error', '利用人数が不正です。');
  end if;

  requested_people := case when p_people = '2名' then 2 else 1 end;
  cost := case when requested_people = 2 then settings.two_adult_cost else 1 end;

  if requested_people = 2 and settings.adults_allowed < 2 then
    return jsonb_build_object('ok', false, 'error', 'このプランは大人2名利用できません。');
  end if;

  if p_start_minute not between 0 and 1400
     or p_start_minute % 10 <> 0
     or p_start_minute + settings.use_minutes <= p_start_minute
     or p_start_minute + settings.use_minutes > 1440 then
    return jsonb_build_object('ok', false, 'error', '開始時刻または利用時間が不正です。');
  end if;

  start_ts := p_date::timestamp + make_interval(mins => p_start_minute);

  if p_date < current_date or p_date > current_date + settings.booking_days then
    return jsonb_build_object('ok', false, 'error', '予約可能期間外です。');
  end if;

  if start_ts <= now() + make_interval(mins => settings.booking_deadline_minutes) then
    return jsonb_build_object('ok', false, 'error', '予約は開始時刻の2時間前までです。');
  end if;

  if public.fs_self_reservation_overlaps(
    p_date,
    p_start_minute,
    p_start_minute + settings.use_minutes + 10
  ) then
    return jsonb_build_object('ok', false, 'error', 'この時間は予約できません。');
  end if;

  if (
    select count(*)
    from public.fs_reservations
    where member_id = m.id
      and not cancelled
      and date::timestamp + make_interval(mins => start_minute) > now()
  ) >= settings.concurrent_limit then
    return jsonb_build_object('ok', false, 'error', '同時予約上限に達しています。');
  end if;

  if (
    select count(*)
    from public.fs_reservations
    where member_id = m.id
      and not cancelled
      and date = p_date
  ) >= settings.daily_limit then
    return jsonb_build_object('ok', false, 'error', '同日予約上限に達しています。');
  end if;

  select coalesce(sum(
    case when people = '2名' then settings.two_adult_cost else 1 end
  ), 0)
  into used
  from public.fs_reservations
  where member_id = m.id
    and not cancelled
    and to_char(date, 'YYYY-MM') = to_char(p_date, 'YYYY-MM');

  if settings.monthly_quota is not null and used + cost > settings.monthly_quota then
    return jsonb_build_object('ok', false, 'error', '今月の予約上限に達しています。');
  end if;

  insert into public.fs_reservations(
    member_id,
    date,
    start_minute,
    people,
    note,
    created_by
  ) values (
    m.id,
    p_date,
    p_start_minute,
    p_people,
    p_note,
    'member'
  );

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.fs_member_snapshot(text, text) to anon, authenticated;
grant execute on function public.fs_member_create_reservation(text, text, date, integer, text, text) to anon, authenticated;

commit;

-- 実行後の確認用SELECT
select
  plan_code,
  monthly_price,
  monthly_quota,
  use_minutes,
  adults_allowed,
  two_adult_cost,
  concurrent_limit,
  daily_limit,
  booking_days,
  booking_deadline_minutes,
  cancellation_deadline_minutes,
  is_configured
from public.fs_plan_settings
where plan_code in ('free', 'standard', 'premium')
order by plan_code;

select member_code, name, plan, status
from public.fs_members
where upper(member_code) = 'G24001';

select plan_code, use_minutes, monthly_quota, is_configured
from public.fs_plan_settings
where coalesce(use_minutes, 0) <= 0
   or not coalesce(is_configured, false);
