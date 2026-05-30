-- friendsセルフ game-lab アプリハブ v_app_hub_01
-- 既存予約系テーブル / 既存予約系RPCは変更しない。

create table if not exists public.fs_member_apps (
  app_key text primary key,
  category_key text not null,
  category_name text not null,
  app_name text not null,
  app_url text not null default './stress-game.html',
  enabled boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fs_app_activity_logs (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.fs_members(id) on delete cascade,
  app_key text not null references public.fs_member_apps(app_key),
  points integer not null default 0,
  result jsonb not null default '{}'::jsonb,
  activity_date date not null default current_date,
  created_at timestamptz not null default now()
);

alter table public.fs_app_activity_logs
  add column if not exists activity_date date;

update public.fs_app_activity_logs
set activity_date = coalesce(activity_date, (created_at at time zone 'Asia/Tokyo')::date, current_date)
where activity_date is null;

alter table public.fs_app_activity_logs
  alter column activity_date set default current_date;

create index if not exists fs_member_apps_enabled_idx
on public.fs_member_apps(enabled, sort_order);

create index if not exists fs_app_activity_logs_member_idx
on public.fs_app_activity_logs(member_id, created_at desc);

create index if not exists fs_app_activity_logs_created_idx
on public.fs_app_activity_logs(created_at desc);

create unique index if not exists fs_app_activity_logs_member_app_day_uq
on public.fs_app_activity_logs(member_id, app_key, activity_date);

insert into public.fs_member_apps (app_key, category_key, category_name, app_name, app_url, enabled, sort_order)
values ('stress_block_puzzle', 'stress_reset', 'ストレスリセット', 'ブロックパズル', './stress-game.html', true, 10)
on conflict (app_key) do update set
  category_key = excluded.category_key,
  category_name = excluded.category_name,
  app_name = excluded.app_name,
  app_url = excluded.app_url,
  sort_order = excluded.sort_order,
  updated_at = now();

create or replace function public.fs_member_apps_snapshot(
  p_member_code text,
  p_pin text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member public.fs_members%rowtype;
begin
  select * into v_member
  from public.fs_members
  where upper(member_code) = upper(p_member_code)
    and pin = p_pin
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error', '会員IDまたはPINが違います。');
  end if;

  return jsonb_build_object(
    'ok', true,
    'apps', coalesce((
      select jsonb_agg(jsonb_build_object(
        'app_key', app_key,
        'category_key', category_key,
        'category_name', category_name,
        'app_name', app_name,
        'app_url', app_url,
        'enabled', enabled,
        'sort_order', sort_order
      ) order by sort_order, app_name)
      from public.fs_member_apps
      where enabled = true
    ), '[]'::jsonb),
    'points', coalesce((
      select sum(points)::integer
      from public.fs_app_activity_logs
      where member_id = v_member.id
    ), 0)
  );
end;
$$;

create or replace function public.fs_member_complete_app_activity(
  p_member_code text,
  p_pin text,
  p_app_key text,
  p_points integer default 1,
  p_result jsonb default '{}'::jsonb,
  p_activity_date date default current_date
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member public.fs_members%rowtype;
  v_enabled boolean;
  v_inserted integer := 0;
  v_total integer := 0;
begin
  select * into v_member
  from public.fs_members
  where upper(member_code) = upper(p_member_code)
    and pin = p_pin
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error', '会員IDまたはPINが違います。');
  end if;

  select enabled into v_enabled
  from public.fs_member_apps
  where app_key = p_app_key;

  if coalesce(v_enabled, false) is not true then
    return jsonb_build_object('ok', false, 'error', 'このアプリは現在利用できません。');
  end if;

  insert into public.fs_app_activity_logs(member_id, app_key, points, result, activity_date)
  values (v_member.id, p_app_key, greatest(coalesce(p_points, 0), 0), coalesce(p_result, '{}'::jsonb), coalesce(p_activity_date, current_date))
  on conflict (member_id, app_key, activity_date) do nothing;

  get diagnostics v_inserted = row_count;

  select coalesce(sum(points), 0)::integer into v_total
  from public.fs_app_activity_logs
  where member_id = v_member.id;

  return jsonb_build_object(
    'ok', true,
    'inserted', v_inserted = 1,
    'already_completed', v_inserted = 0,
    'total_points', v_total
  );
end;
$$;

create or replace function public.fs_admin_apps_snapshot(
  p_admin_password text,
  p_member_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_admin_password <> '1111' then
    return jsonb_build_object('ok', false, 'error', '管理者パスコードが違います。');
  end if;

  return jsonb_build_object(
    'ok', true,
    'apps', coalesce((
      select jsonb_agg(jsonb_build_object(
        'app_key', app_key,
        'category_key', category_key,
        'category_name', category_name,
        'app_name', app_name,
        'app_url', app_url,
        'enabled', enabled,
        'sort_order', sort_order
      ) order by sort_order, app_name)
      from public.fs_member_apps
    ), '[]'::jsonb),
    'logs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', l.id,
        'member_id', l.member_id,
        'member_code', m.member_code,
        'member_name', m.name,
        'app_key', a.app_key,
        'app_name', a.app_name,
        'category_key', a.category_key,
        'category_name', a.category_name,
        'created_at', l.created_at,
        'activity_date', l.activity_date,
        'points', l.points,
        'result', l.result
      ) order by l.created_at desc)
      from (
        select *
        from public.fs_app_activity_logs
        where p_member_id is null or member_id = p_member_id
        order by created_at desc
        limit 50
      ) l
      join public.fs_members m on m.id = l.member_id
      join public.fs_member_apps a on a.app_key = l.app_key
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.fs_admin_set_app_enabled(
  p_admin_password text,
  p_app_key text,
  p_enabled boolean
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows integer := 0;
begin
  if p_admin_password <> '1111' then
    return jsonb_build_object('ok', false, 'error', '管理者パスコードが違います。');
  end if;

  update public.fs_member_apps
  set enabled = coalesce(p_enabled, false), updated_at = now()
  where app_key = p_app_key;

  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return jsonb_build_object('ok', false, 'error', 'アプリが見つかりません。');
  end if;

  return jsonb_build_object('ok', true, 'app_key', p_app_key, 'enabled', p_enabled);
end;
$$;

grant execute on function public.fs_member_apps_snapshot(text, text) to anon, authenticated;
grant execute on function public.fs_member_complete_app_activity(text, text, text, integer, jsonb, date) to anon, authenticated;
grant execute on function public.fs_admin_apps_snapshot(text, uuid) to anon, authenticated;
grant execute on function public.fs_admin_set_app_enabled(text, text, boolean) to anon, authenticated;
