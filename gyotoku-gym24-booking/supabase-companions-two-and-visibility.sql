-- 行徳ジム24：スタンダード／プレミアムの同伴者を「契約者本人とは別に2名まで」登録可能にする
-- あわせて会員画面・管理画面へ登録利用者と予約利用者名を返す。
-- 指定部分以外の予約ルール・時間・プラン条件は変更しない。

begin;

-- 既存テーブルを壊さず、必要列だけ保証する。
create table if not exists public.fs_registered_users (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.fs_members(id) on delete cascade,
  name text not null,
  is_contract_holder boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.fs_registered_users add column if not exists is_contract_holder boolean not null default false;
alter table public.fs_registered_users add column if not exists is_active boolean not null default true;
alter table public.fs_registered_users add column if not exists created_at timestamptz not null default now();
alter table public.fs_registered_users add column if not exists updated_at timestamptz not null default now();
create index if not exists fs_registered_users_member_idx on public.fs_registered_users(member_id,is_contract_holder,is_active);

-- 契約者本人は常に1名用意する。
insert into public.fs_registered_users(member_id,name,is_contract_holder,is_active)
select m.id,m.name,true,true
from public.fs_members m
where m.status='active'
  and not exists(select 1 from public.fs_registered_users u where u.member_id=m.id and u.is_contract_holder);

update public.fs_registered_users u
set name=m.name,is_active=true,updated_at=now()
from public.fs_members m
where u.member_id=m.id and u.is_contract_holder;

-- 会員本人による同伴者追加・編集。
-- 「2名まで」は契約者本人を数えず、非契約者だけを数える。
create or replace function public.fs_member_upsert_registered_user(
  p_member_code text,
  p_pin text,
  p_user_id uuid,
  p_name text,
  p_is_active boolean default true
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  m public.fs_members;
  existing public.fs_registered_users;
  new_id uuid;
begin
  select * into m from public.fs_member_by_login(p_member_code,p_pin);
  if m.id is null then return jsonb_build_object('ok',false,'error','ログイン情報が違います。'); end if;
  if m.plan not in ('standard','premium') then return jsonb_build_object('ok',false,'error','このプランでは同伴者を登録できません。'); end if;
  if length(btrim(coalesce(p_name,'')))=0 then return jsonb_build_object('ok',false,'error','同伴者名を入力してください。'); end if;

  if p_user_id is not null then
    select * into existing from public.fs_registered_users
    where id=p_user_id and member_id=m.id and not is_contract_holder;
    if existing.id is null then return jsonb_build_object('ok',false,'error','同伴者が見つかりません。'); end if;
    update public.fs_registered_users
    set name=btrim(p_name),is_active=coalesce(p_is_active,true),updated_at=now()
    where id=existing.id;
    return jsonb_build_object('ok',true,'id',existing.id);
  end if;

  if (select count(*) from public.fs_registered_users where member_id=m.id and not is_contract_holder) >= 2 then
    return jsonb_build_object('ok',false,'error','同伴者は2名までです。');
  end if;

  insert into public.fs_registered_users(member_id,name,is_contract_holder,is_active)
  values(m.id,btrim(p_name),false,true)
  returning id into new_id;
  return jsonb_build_object('ok',true,'id',new_id);
end $$;

-- 管理者：会員ごとの契約者・同伴者一覧。
create or replace function public.fs_admin_registered_users(
  p_admin_password text,
  p_member_id uuid
) returns jsonb
language plpgsql security definer set search_path=public as $$
begin
  if not public.fs_is_admin(p_admin_password) then return jsonb_build_object('ok',false,'error','管理者パスコードが違います。'); end if;
  return jsonb_build_object(
    'ok',true,
    'users',coalesce((
      select jsonb_agg(to_jsonb(u) order by u.is_contract_holder desc,u.created_at,u.id)
      from public.fs_registered_users u where u.member_id=p_member_id
    ),'[]'::jsonb)
  );
end $$;

-- 管理者による同伴者追加・編集も、非契約者を2名まで。
create or replace function public.fs_admin_upsert_registered_user(
  p_admin_password text,
  p_member_id uuid,
  p_user_id uuid,
  p_name text,
  p_is_active boolean default true
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  m public.fs_members;
  existing public.fs_registered_users;
  new_id uuid;
begin
  if not public.fs_is_admin(p_admin_password) then return jsonb_build_object('ok',false,'error','管理者パスコードが違います。'); end if;
  select * into m from public.fs_members where id=p_member_id and status='active';
  if m.id is null then return jsonb_build_object('ok',false,'error','会員が見つかりません。'); end if;
  if m.plan not in ('standard','premium') then return jsonb_build_object('ok',false,'error','このプランでは同伴者を登録できません。'); end if;
  if length(btrim(coalesce(p_name,'')))=0 then return jsonb_build_object('ok',false,'error','同伴者名を入力してください。'); end if;

  if p_user_id is not null then
    select * into existing from public.fs_registered_users
    where id=p_user_id and member_id=m.id and not is_contract_holder;
    if existing.id is null then return jsonb_build_object('ok',false,'error','同伴者が見つかりません。'); end if;
    update public.fs_registered_users
    set name=btrim(p_name),is_active=coalesce(p_is_active,true),updated_at=now()
    where id=existing.id;
    return jsonb_build_object('ok',true,'id',existing.id);
  end if;

  if (select count(*) from public.fs_registered_users where member_id=m.id and not is_contract_holder) >= 2 then
    return jsonb_build_object('ok',false,'error','同伴者は2名までです。');
  end if;

  insert into public.fs_registered_users(member_id,name,is_contract_holder,is_active)
  values(m.id,btrim(p_name),false,true)
  returning id into new_id;
  return jsonb_build_object('ok',true,'id',new_id);
end $$;

-- 会員画面：登録中の契約者本人・同伴者と、予約時の実利用者名を返す。
create or replace function public.fs_member_snapshot(p_member_code text,p_pin text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare m fs_members; settings fs_plan_settings;
begin
  select * into m from fs_member_by_login(p_member_code,p_pin);
  if m.id is null then return jsonb_build_object('ok',false,'error','会員IDまたはPINが違います。'); end if;
  select * into settings from fs_plan_settings where plan_code=m.plan;
  return jsonb_build_object(
    'ok',true,
    'member',jsonb_build_object('id',m.id,'member_code',m.member_code,'name',m.name,'email',m.email,'pin',m.pin,'plan',m.plan,'quota',settings.monthly_quota,'base_quota',settings.monthly_quota,'extra_slots',0,'monthly_limit',settings.monthly_quota is not null),
    'plan_settings',to_jsonb(settings),
    'registered_users',coalesce((select jsonb_agg(to_jsonb(u) order by u.is_contract_holder desc,u.created_at,u.id) from fs_registered_users u where u.member_id=m.id),'[]'::jsonb),
    'reservations',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'date',r.date,'start_minute',r.start_minute,'people',r.people,'note',r.note,'created_at',r.created_at,'user1_id',r.user1_id,'user1_name_snapshot',r.user1_name_snapshot,'user2_id',r.user2_id,'user2_name_snapshot',r.user2_name_snapshot,'child_accompanied',r.child_accompanied,'use_minutes_snapshot',r.use_minutes_snapshot) order by r.date,r.start_minute) from fs_reservations r where r.member_id=m.id and not r.cancelled),'[]'::jsonb),
    'booked_slots',coalesce((select jsonb_agg(jsonb_build_object('date',r.date,'start_minute',r.start_minute,'use_minutes',coalesce(r.use_minutes_snapshot,40),'is_mine',r.member_id=m.id) order by r.date,r.start_minute) from fs_reservations r where not r.cancelled),'[]'::jsonb),
    'closed_slots',coalesce((select jsonb_agg(to_jsonb(c) order by c.date,c.start_minute) from fs_closed_slots c),'[]'::jsonb),
    'external_blocks','[]'::jsonb
  );
end $$;

-- 管理画面：会員一覧に登録利用者を含め、予約には実際に利用する人の氏名を含める。
create or replace function public.fs_admin_snapshot(p_admin_password text)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
  if not fs_is_admin(p_admin_password) then return jsonb_build_object('ok',false,'error','管理者パスコードが違います。'); end if;
  return jsonb_build_object(
    'ok',true,
    'members',coalesce((select jsonb_agg(to_jsonb(m) order by m.created_at desc) from fs_members m where m.status='active' and m.plan in('free','standard','premium')),'[]'::jsonb),
    'registered_users',coalesce((select jsonb_agg(to_jsonb(u) order by u.member_id,u.is_contract_holder desc,u.created_at,u.id) from fs_registered_users u),'[]'::jsonb),
    'reservations',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'member_id',r.member_id,'member_name',m.name,'member_code',m.member_code,'plan',m.plan,'date',r.date,'start_minute',r.start_minute,'people',r.people,'user1_id',r.user1_id,'user1_name_snapshot',r.user1_name_snapshot,'user2_id',r.user2_id,'user2_name_snapshot',r.user2_name_snapshot,'child_accompanied',r.child_accompanied,'use_minutes_snapshot',r.use_minutes_snapshot,'note',r.note,'created_by',r.created_by,'created_at',r.created_at) order by r.date,r.start_minute) from fs_reservations r join fs_members m on m.id=r.member_id where not r.cancelled and m.status='active'),'[]'::jsonb),
    'closed_slots',coalesce((select jsonb_agg(to_jsonb(c) order by c.date,c.start_minute) from fs_closed_slots c),'[]'::jsonb),
    'external_blocks','[]'::jsonb
  );
end $$;

grant execute on function public.fs_member_upsert_registered_user(text,text,uuid,text,boolean) to anon,authenticated;
grant execute on function public.fs_admin_registered_users(text,uuid) to anon,authenticated;
grant execute on function public.fs_admin_upsert_registered_user(text,uuid,uuid,text,boolean) to anon,authenticated;
grant execute on function public.fs_member_snapshot(text,text) to anon,authenticated;
grant execute on function public.fs_admin_snapshot(text) to anon,authenticated;

commit;

select routine_name
from information_schema.routines
where routine_schema='public'
  and routine_name in ('fs_member_upsert_registered_user','fs_admin_registered_users','fs_admin_upsert_registered_user','fs_member_snapshot','fs_admin_snapshot')
order by routine_name;