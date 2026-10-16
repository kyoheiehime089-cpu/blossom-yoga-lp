-- MANUAL MEMBERSHIP RULES CANDIDATE. Supersedes consent-linked draft for this release.
-- No agreement DB, agreement ID, consent snapshot lookup, email, payment API or automatic account creation.
-- CANDIDATE ONLY. Disposable-local SQL tests passed; production remains unapproved.
-- Review and apply only after the booking project
-- and every physical resource scope are confirmed. Additive: no legacy rows,
-- plan settings, RPC definitions, or existing member rules are rewritten.
-- Apply buffer -> admin-auth -> legacy-admin-cutover first. No administrator is seeded.

begin;

-- Initial-install candidate only. Never silently reuse unknown V7 definitions.
do $preflight$
begin
  if to_regprocedure('public.gym24_admin_authorized()') is null then
    raise exception 'Verified JWT admin authorization is required before V7 installation';
  end if;
  if not exists(select 1 from pg_proc where oid=to_regprocedure('public.fs_is_admin(text)')
    and position('gym24_admin_authorized' in prosrc)>0)
   or exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname like 'fs_admin_%'
    and has_function_privilege('anon',p.oid,'EXECUTE')) then
   raise exception 'Legacy administrative read/write paths must be protected before V7 installation';
  end if;
  if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname like 'fs_v7_%')
    or exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname like 'fs_v7_%') then
    raise exception 'Existing V7 objects require a separately reviewed upgrade; stop';
  end if;
  if has_schema_privilege('anon','public','CREATE')
    or has_schema_privilege('authenticated','public','CREATE') then
    raise exception 'Untrusted public-schema CREATE privilege must be reviewed before installation';
  end if;
  if pg_has_role('anon',current_user,'MEMBER')
    or pg_has_role('authenticated',current_user,'MEMBER')
    or pg_has_role('service_role',current_user,'MEMBER') then
    raise exception 'API roles must not own or assume the V7 definer owner';
  end if;
end
$preflight$;

create table if not exists public.fs_v7_resource_scope (
  source_key text primary key,
  scope_status text not null default 'unconfirmed'
    check (scope_status in ('unconfirmed','shared','separate')),
  integration_status text not null default 'unsupported'
    check (integration_status in ('unsupported','ready')),
  confirmed_at timestamptz,
  confirmed_by text,
  note text not null default ''
);

insert into public.fs_v7_resource_scope(source_key,integration_status,note) values
  ('fs_reservations','ready','Gym reservation store'),
  ('fs_yoga_private_reservations','ready','Central confirmed individual Yoga reservations'),
  ('fs_closed_slots','ready','Facility closed slots'),
  ('fs_yoga_admin_fixed_blocks','ready','Fixed Yoga and semi-personal lesson schedule'),
  ('fs_external_blocks','unsupported','Legacy external blocks; physical resource not verified'),
  ('blossom_private_bookings','unsupported','Separate Blossom store; physical resource not verified'),
  ('g24_reservations','unsupported','Separate G24 store; physical resource not verified')
on conflict (source_key) do nothing;

create table public.fs_v7_membership_links (
 policy_assignment_id uuid primary key default gen_random_uuid(),
 member_id uuid not null unique references public.fs_members(id) on delete restrict,
 membership_cohort text not null default 'paid_v7' check(membership_cohort='paid_v7'),
 agreement_version text not null default 'agreement-2026-10-13-paid-v7',
 plan_code text not null check(plan_code in ('free','standard','premium')),
 status text not null default 'active' check(status in ('active','suspended')),
 operator_approved boolean not null default true,
 assigned_by uuid not null,
 created_at timestamptz not null default now()
);

create table if not exists public.fs_v7_companion_safety (
  member_id uuid not null references public.fs_members(id) on delete cascade,
  registered_user_id uuid not null references public.fs_registered_users(id) on delete cascade,
  safety_check_passed boolean not null default false,
  confirmed_at timestamptz,
  confirmed_by text,
  primary key (member_id,registered_user_id)
);

create table if not exists public.fs_v7_reservation_details (
  reservation_id uuid primary key references public.fs_reservations(id) on delete cascade,
  member_id uuid not null references public.fs_members(id) on delete restrict,
  agreement_version text not null,
  request_id uuid not null unique,
  duration_minutes integer not null default 50 check (duration_minutes=50),
  visit_outcome text not null default 'reserved'
    check (visit_outcome in ('reserved','attended','late_cancelled','no_show','on_time_cancelled')),
  consumes_visit boolean generated always as
    (visit_outcome in ('reserved','attended','late_cancelled','no_show')) stored,
  created_at timestamptz not null default now()
);

alter table public.fs_v7_resource_scope enable row level security;
alter table public.fs_v7_membership_links enable row level security;
alter table public.fs_v7_companion_safety enable row level security;
alter table public.fs_v7_reservation_details enable row level security;
-- A client-set custom GUC must never authorize legacy writes. Permits exist only
-- around the checked mutation in a trusted definer, scoped to transaction/member.
create table if not exists public.fs_v7_write_permits (
  backend_pid integer not null,
  transaction_id bigint not null,
  member_id uuid not null,
  primary key (backend_pid,transaction_id,member_id)
);
alter table public.fs_v7_write_permits enable row level security;
revoke all on public.fs_v7_write_permits from public,anon,authenticated,service_role;

create or replace function public.fs_v7_write_authorized(p_member_id uuid)
returns boolean language sql volatile security definer set search_path=pg_catalog,public,pg_temp as $$
  select exists(select 1 from public.fs_v7_write_permits
    where backend_pid=pg_backend_pid() and transaction_id=txid_current() and member_id=p_member_id)
$$;
revoke all on function public.fs_v7_write_authorized(uuid) from public,anon,authenticated,service_role;

revoke all on public.fs_v7_resource_scope, public.fs_v7_membership_links,
  public.fs_v7_companion_safety,
  public.fs_v7_reservation_details from public, anon, authenticated;

create or replace function public.fs_v7_scope_snapshot()
returns jsonb language sql stable security definer set search_path=pg_catalog,public,pg_temp as $$
  with required(source_key) as (values
    ('fs_reservations'),('fs_yoga_private_reservations'),('fs_closed_slots'),
    ('fs_yoga_admin_fixed_blocks'),('fs_external_blocks'),
    ('blossom_private_bookings'),('g24_reservations')
  )
  select jsonb_build_object(
    'complete',not exists(
      select 1 from required r left join public.fs_v7_resource_scope s using(source_key)
      where s.source_key is null
         or s.scope_status='unconfirmed'
         or (s.scope_status='shared' and (
           s.integration_status<>'ready'
           or r.source_key in ('fs_external_blocks','blossom_private_bookings','g24_reservations')
         ))
    ),
    'sources',coalesce((select jsonb_agg(to_jsonb(s) order by s.source_key)
      from public.fs_v7_resource_scope s),'[]'::jsonb)
  );
$$;

-- Administrator performs this after offline identity checks. No consent-store lookup.
create function public.fs_v7_admin_create_member(p_admin_password text,p_name text,p_email text,p_plan text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $manual$
declare m public.fs_members; code text; pin_code text;
begin
 if public.gym24_admin_authorized() is distinct from true then return jsonb_build_object('ok',false,'error','管理者認証を確認できません。'); end if;
 if length(btrim(coalesce(p_name,''))) not between 1 and 80
 or btrim(coalesce(p_email,'')) !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
 or p_plan is null or p_plan not in ('free','standard','premium') then
 return jsonb_build_object('ok',false,'error','会員名・メールアドレス・プランを確認してください。'); end if;
 code:='G24V7'||(10000000+(('x'||substr(replace(gen_random_uuid()::text,'-',''),1,8))::bit(32)::bigint%90000000))::text;
 pin_code:=(10000000+(('x'||substr(replace(gen_random_uuid()::text,'-',''),1,8))::bit(32)::bigint%90000000))::text;
 insert into public.fs_members(member_code,name,email,pin,plan,status)
 values(code,btrim(p_name),lower(btrim(p_email)),pin_code,p_plan,'active') returning * into m;
 insert into public.fs_registered_users(member_id,name,is_contract_holder,is_active) values(m.id,m.name,true,true);
 insert into public.fs_v7_membership_links(member_id,plan_code,assigned_by) values(m.id,p_plan,auth.uid());
 return jsonb_build_object('ok',true,'member',to_jsonb(m)||jsonb_build_object(
 'membership_cohort','paid_v7','agreement_version','agreement-2026-10-13-paid-v7',
 'activation_gates',jsonb_build_object('operatorApproved',true)));
exception when unique_violation then
 return jsonb_build_object('ok',false,'error','会員IDまたはメールアドレスが重複しています。登録済み会員を確認してください。');
end $manual$;

create function public.fs_v7_admin_update_plan(p_admin_password text,p_member_id uuid,p_plan text,p_status text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $manual$
declare l public.fs_v7_membership_links;
begin
 if public.gym24_admin_authorized() is distinct from true then return jsonb_build_object('ok',false,'error','管理者認証を確認できません。'); end if;
 if p_plan is null or p_plan not in ('free','standard','premium') or p_status is null or p_status not in ('active','suspended') then
 return jsonb_build_object('ok',false,'error','プランと利用状態を確認してください。'); end if;
 select * into l from public.fs_v7_membership_links where member_id=p_member_id for update;
 if l.member_id is null then return jsonb_build_object('ok',false,'error','既存会員の条件はこの操作では変更できません。'); end if;
 insert into public.fs_v7_write_permits values(pg_backend_pid(),txid_current(),p_member_id);
 update public.fs_members set plan=p_plan,status=p_status where id=p_member_id;
 update public.fs_v7_membership_links set plan_code=p_plan,status=p_status,assigned_by=auth.uid() where member_id=p_member_id;
 delete from public.fs_v7_write_permits where backend_pid=pg_backend_pid() and transaction_id=txid_current() and member_id=p_member_id;
 return jsonb_build_object('ok',true);
end $manual$;

create or replace function public.fs_v7_admin_confirm_companion_safety(
  p_admin_password text,p_member_id uuid,p_registered_user_id uuid
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
begin
  if public.gym24_admin_authorized() is distinct from true then
    return jsonb_build_object('ok',false,'error','管理者認証を確認できません。');
  end if;
  if not exists(select 1 from public.fs_v7_membership_links where member_id=p_member_id) then
    return jsonb_build_object('ok',false,'error','v7会員リンクがありません。');
  end if;
  if not exists(select 1 from public.fs_registered_users
    where id=p_registered_user_id and member_id=p_member_id and not is_contract_holder) then
    return jsonb_build_object('ok',false,'error','登録済みの同伴者が見つかりません。');
  end if;
  insert into public.fs_v7_companion_safety(member_id,registered_user_id,safety_check_passed,confirmed_at,confirmed_by)
    values(p_member_id,p_registered_user_id,true,now(),'admin')
    on conflict(member_id,registered_user_id) do update
      set safety_check_passed=true,confirmed_at=now(),confirmed_by='admin';
  return jsonb_build_object('ok',true);
end;
$$;

create or replace function public.fs_v7_member_add_companion(
  p_member_code text,p_pin text,p_name text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare m public.fs_members; l public.fs_v7_membership_links; new_user_id uuid;
begin
  select * into m from public.fs_members
    where upper(member_code)=upper(p_member_code) and pin=p_pin and status='active';
  if m.id is null then return jsonb_build_object('ok',false,'error','ログイン情報を確認できません。'); end if;
  select * into l from public.fs_v7_membership_links where member_id=m.id for update;
  select * into m from public.fs_members where id=m.id for update;
  if l.member_id is null or l.status<>'active' or m.status<>'active'
     or not(l.operator_approved) then
    return jsonb_build_object('ok',false,'error','会員の有効化が完了していません。');
  end if;
  if l.plan_code not in ('standard','premium') then
    return jsonb_build_object('ok',false,'error','このプランでは大人の同伴者を登録できません。');
  end if;
  if length(btrim(coalesce(p_name,''))) not between 1 and 80 then
    return jsonb_build_object('ok',false,'error','同伴者の氏名を入力してください。');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('v7-companion:'||m.id::text,0));
  if exists(select 1 from public.fs_registered_users where member_id=m.id and not is_contract_holder) then
    return jsonb_build_object('ok',false,'error','登録できる大人の同伴者は1名までです。登録済みの同伴者については公式LINEからお問い合わせください。');
  end if;
  insert into public.fs_v7_write_permits values(pg_backend_pid(),txid_current(),m.id);
  insert into public.fs_registered_users(member_id,name,is_contract_holder,is_active)
    values(m.id,btrim(p_name),false,true) returning id into new_user_id;
  delete from public.fs_v7_write_permits where backend_pid=pg_backend_pid() and transaction_id=txid_current() and member_id=m.id;
  return jsonb_build_object('ok',true,'id',new_user_id,'safety_check_passed',false);
end;
$$;

create or replace function public.fs_v7_guard_legacy_member_write()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
begin
  if tg_op='UPDATE' and exists(select 1 from public.fs_v7_membership_links l where l.member_id=old.member_id)
     and not public.fs_v7_write_authorized(old.member_id) then
    raise exception 'v7会員はv7予約RPCを使用してください。';
  end if;
  if exists(select 1 from public.fs_v7_membership_links l where l.member_id=new.member_id)
     and not public.fs_v7_write_authorized(new.member_id) then
    raise exception 'v7会員はv7予約RPCを使用してください。';
  end if;
  if exists(select 1 from public.fs_v7_membership_links l where l.member_id=new.member_id)
     and coalesce(new.use_minutes_snapshot,0)<>50 then
    raise exception 'v7予約時間は50分です。';
  end if;
  return new;
end;
$$;

create or replace function public.fs_v7_guard_legacy_reservation_delete()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
begin
  if exists(select 1 from public.fs_v7_membership_links l where l.member_id=old.member_id)
     and not public.fs_v7_write_authorized(old.member_id) then
    raise exception 'v7予約履歴は削除できません。';
  end if;
  return old;
end;
$$;

drop trigger if exists fs_v7_guard_legacy_member_write_trg on public.fs_reservations;
create trigger fs_v7_guard_legacy_member_write_trg
before insert or update
on public.fs_reservations for each row execute function public.fs_v7_guard_legacy_member_write();

drop trigger if exists fs_v7_guard_legacy_reservation_delete_trg on public.fs_reservations;
create trigger fs_v7_guard_legacy_reservation_delete_trg
before delete on public.fs_reservations for each row
execute function public.fs_v7_guard_legacy_reservation_delete();

create or replace function public.fs_v7_guard_legacy_member_policy_change()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
begin
  if exists(select 1 from public.fs_v7_membership_links l where l.member_id=old.id)
     and (new.status is distinct from old.status or new.plan is distinct from old.plan
       or new.member_code is distinct from old.member_code or new.name is distinct from old.name
       or new.email is distinct from old.email or new.pin is distinct from old.pin)
     and not public.fs_v7_write_authorized(old.id) then
    raise exception 'v7会員の状態とプランはv7管理RPCから変更してください。';
  end if;
  return new;
end;
$$;

drop trigger if exists fs_v7_guard_legacy_member_policy_change_trg on public.fs_members;
create trigger fs_v7_guard_legacy_member_policy_change_trg
before update of status,plan,member_code,name,email,pin on public.fs_members for each row
execute function public.fs_v7_guard_legacy_member_policy_change();

create or replace function public.fs_v7_guard_legacy_companion_write()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare target_member_id uuid;
begin
  target_member_id:=case when tg_op='DELETE' then old.member_id else new.member_id end;
  if tg_op='UPDATE' and exists(select 1 from public.fs_v7_membership_links l where l.member_id=old.member_id)
     and not public.fs_v7_write_authorized(old.member_id) then
    raise exception 'v7 companion ownership cannot be changed by a legacy write';
  end if;
  if exists(select 1 from public.fs_v7_membership_links l where l.member_id=target_member_id)
     and not public.fs_v7_write_authorized(target_member_id) then
    raise exception 'v7同伴者はv7専用RPCから登録してください。';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists fs_v7_guard_legacy_companion_write_trg on public.fs_registered_users;
create trigger fs_v7_guard_legacy_companion_write_trg
before insert or update or delete on public.fs_registered_users for each row
execute function public.fs_v7_guard_legacy_companion_write();

create or replace function public.fs_v7_create_reservation_internal(
  p_member_id uuid,p_date date,p_start_minute integer,p_user_ids uuid[],
  p_children_accompanied boolean,p_children_supervised boolean,p_note text,
  p_request_id uuid,p_created_by text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare m public.fs_members; l public.fs_v7_membership_links; holder_id uuid;
  plan_quota integer; concurrent_limit integer; max_adults integer; user_count integer;
  adult_count integer; start_ts timestamp; end_ts timestamp; now_jst timestamp;
  first_user public.fs_registered_users; second_user public.fs_registered_users;
  existing_detail public.fs_v7_reservation_details; existing_reservation public.fs_reservations; new_id uuid;
  scope jsonb; yoga_shared boolean; closed_shared boolean;
begin
  if p_request_id is null or p_member_id is null then
    return jsonb_build_object('ok',false,'error','request_id_required');
  end if;

  select * into l from public.fs_v7_membership_links where member_id=p_member_id for update;
  select * into m from public.fs_members where id=p_member_id for update;
  if l.member_id is null or l.status<>'active' or m.status<>'active'
     or not (l.operator_approved) then
    return jsonb_build_object('ok',false,'error','member_not_activated');
  end if;
  select * into existing_detail from public.fs_v7_reservation_details where request_id=p_request_id;
  if existing_detail.reservation_id is not null then
    select * into existing_reservation from public.fs_reservations where id=existing_detail.reservation_id;
    if existing_detail.member_id=p_member_id
       and existing_reservation.date is not distinct from p_date
       and existing_reservation.start_minute is not distinct from p_start_minute
       and array_remove(array[existing_reservation.user1_id,existing_reservation.user2_id],null) is not distinct from p_user_ids
       and existing_reservation.child_accompanied is not distinct from coalesce(p_children_accompanied,false)
       and (not coalesce(p_children_accompanied,false) or coalesce(p_children_supervised,false))
       and existing_reservation.note is not distinct from left(coalesce(p_note,''),500)
       and existing_reservation.created_by is not distinct from p_created_by then
      return jsonb_build_object('ok',true,'id',existing_detail.reservation_id,'idempotent',true);
    end if;
    return jsonb_build_object('ok',false,'error','request_id_conflict');
  end if;
  scope:=public.fs_v7_scope_snapshot();
  if not coalesce((scope->>'complete')::boolean,false) then
    return jsonb_build_object('ok',false,'error','resource_scope_unconfirmed','scope',scope->'sources');
  end if;

  now_jst:=now() at time zone 'Asia/Tokyo';
  if p_date is null or p_date<now_jst::date+1 or p_date>now_jst::date+14 then
    return jsonb_build_object('ok',false,'error','outside_booking_window');
  end if;
  if now_jst >= (p_date-1)::timestamp+interval '22 hours' then
    return jsonb_build_object('ok',false,'error','booking_cutoff_passed');
  end if;
  if p_start_minute is null or p_start_minute not between 0 and 1390 or p_start_minute%10<>0 then
    return jsonb_build_object('ok',false,'error','invalid_start_time');
  end if;
  start_ts:=p_date::timestamp+make_interval(mins=>p_start_minute);
  end_ts:=start_ts+interval '50 minutes';
  if coalesce(cardinality(p_user_ids),0)<1 or cardinality(p_user_ids)>2
     or cardinality(p_user_ids)<>(select count(distinct x) from unnest(p_user_ids) x) then
    return jsonb_build_object('ok',false,'error','invalid_users');
  end if;
  select id into holder_id from public.fs_registered_users
    where member_id=p_member_id and is_contract_holder and is_active limit 1;
  if holder_id is null or not(holder_id=any(p_user_ids)) then
    return jsonb_build_object('ok',false,'error','contract_holder_must_attend');
  end if;
  select count(*) into user_count from public.fs_registered_users u
    where u.member_id=p_member_id and u.is_active and u.id=any(p_user_ids);
  if user_count<>cardinality(p_user_ids) then return jsonb_build_object('ok',false,'error','invalid_users'); end if;
  select count(*) into adult_count from public.fs_registered_users u
    where u.member_id=p_member_id and u.is_active and not u.is_contract_holder and u.id=any(p_user_ids)
      and exists(select 1 from public.fs_v7_companion_safety s where s.member_id=p_member_id
        and s.registered_user_id=u.id and s.safety_check_passed);
  if adult_count<>cardinality(p_user_ids)-1 then
    return jsonb_build_object('ok',false,'error','companion_safety_not_confirmed');
  end if;
  max_adults:=case l.plan_code when 'free' then 0 else 1 end;
  if adult_count>max_adults then return jsonb_build_object('ok',false,'error','companion_not_allowed'); end if;
  if coalesce(p_children_accompanied,false) and not coalesce(p_children_supervised,false) then
    return jsonb_build_object('ok',false,'error','child_supervision_required');
  end if;

  plan_quota:=case l.plan_code when 'free' then 4 when 'standard' then 8 when 'premium' then 12 end;
  concurrent_limit:=case l.plan_code when 'free' then 1 else 2 end;
  perform pg_advisory_xact_lock(hashtextextended('shared-booking:global',0));
  if exists(select 1 from public.fs_reservations r where not r.cancelled and r.date between p_date-1 and p_date+1
    and start_ts < r.date::timestamp+make_interval(mins=>r.start_minute+coalesce(r.use_minutes_snapshot,40)+10)
    and r.date::timestamp+make_interval(mins=>r.start_minute-10)<end_ts) then
    return jsonb_build_object('ok',false,'error','gym_buffer_conflict');
  end if;
  if public.fs_business_conflicts(p_date,p_start_minute,50) then
    return jsonb_build_object('ok',false,'error','fixed_program_conflict');
  end if;
  select s.scope_status='shared' into yoga_shared from public.fs_v7_resource_scope s
    where s.source_key='fs_yoga_private_reservations';
  if yoga_shared and exists(select 1 from public.fs_yoga_private_reservations y
    where not y.cancelled and y.date between p_date-1 and p_date+1
      and start_ts < y.date::timestamp+make_interval(mins=>y.end_minute+30)
      and y.date::timestamp+make_interval(mins=>y.start_minute-30)<end_ts) then
    return jsonb_build_object('ok',false,'error','gym_yoga_30_minute_conflict');
  end if;
  select s.scope_status='shared' into closed_shared from public.fs_v7_resource_scope s
    where s.source_key='fs_closed_slots';
  if closed_shared and exists(select 1 from public.fs_closed_slots c where c.date between p_date-1 and p_date+1
    and start_ts < c.date::timestamp+make_interval(mins=>c.start_minute+coalesce(c.block_minutes,50)+10)
    and c.date::timestamp+make_interval(mins=>c.start_minute-10)<end_ts) then
    return jsonb_build_object('ok',false,'error','closed_slot_conflict');
  end if;
  if (select count(*) from public.fs_reservations r where r.member_id=p_member_id and not r.cancelled
      and r.date::timestamp+make_interval(mins=>r.start_minute+coalesce(r.use_minutes_snapshot,50))>now_jst)>=concurrent_limit then
    return jsonb_build_object('ok',false,'error','concurrent_limit_reached');
  end if;
  if (select count(*) from public.fs_v7_reservation_details d join public.fs_reservations r on r.id=d.reservation_id
      where d.member_id=p_member_id and d.consumes_visit and r.date=p_date)>=1 then
    return jsonb_build_object('ok',false,'error','daily_limit_reached');
  end if;
  if (select count(*) from public.fs_v7_reservation_details d join public.fs_reservations r on r.id=d.reservation_id
      where d.member_id=p_member_id and d.consumes_visit and to_char(r.date,'YYYY-MM')=to_char(p_date,'YYYY-MM'))>=plan_quota then
    return jsonb_build_object('ok',false,'error','monthly_quota_reached');
  end if;

  select * into first_user from public.fs_registered_users where id=p_user_ids[1] and member_id=p_member_id;
  if cardinality(p_user_ids)=2 then
    select * into second_user from public.fs_registered_users where id=p_user_ids[2] and member_id=p_member_id;
  end if;
  insert into public.fs_v7_write_permits values(pg_backend_pid(),txid_current(),p_member_id);
  insert into public.fs_reservations(member_id,date,start_minute,people,note,created_by,
    user1_id,user1_name_snapshot,user2_id,user2_name_snapshot,child_accompanied,use_minutes_snapshot)
  values(p_member_id,p_date,p_start_minute,cardinality(p_user_ids)||'名',left(coalesce(p_note,''),500),p_created_by,
    first_user.id,first_user.name,second_user.id,second_user.name,coalesce(p_children_accompanied,false),50)
  returning id into new_id;
  insert into public.fs_v7_reservation_details(reservation_id,member_id,agreement_version,request_id,duration_minutes)
  values(new_id,p_member_id,l.agreement_version,p_request_id,50);
  delete from public.fs_v7_write_permits where backend_pid=pg_backend_pid() and transaction_id=txid_current() and member_id=p_member_id;
  return jsonb_build_object('ok',true,'id',new_id,'idempotent',false);
end;
$$;

create or replace function public.fs_v7_cancel_outcome(p_now_jst timestamp,p_date date,p_start_minute integer)
returns text language sql immutable strict set search_path=pg_catalog as $$
  select case
    when p_now_jst >= p_date::timestamp+make_interval(mins=>p_start_minute) then 'reservation_already_started'
    when p_now_jst < (p_date-1)::timestamp+interval '22 hours' then 'on_time_cancelled'
    else 'late_cancelled'
  end
$$;

create or replace function public.fs_v7_cancel_reservation_internal(p_member_id uuid,p_reservation_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.fs_reservations; d public.fs_v7_reservation_details; now_jst timestamp; outcome text;
begin
  perform pg_advisory_xact_lock(hashtextextended('shared-booking:global',0));
  select * into d from public.fs_v7_reservation_details where reservation_id=p_reservation_id and member_id=p_member_id for update;
  select * into r from public.fs_reservations where id=p_reservation_id and member_id=p_member_id and not cancelled for update;
  if d.reservation_id is null or r.id is null then return jsonb_build_object('ok',false,'error','reservation_not_found'); end if;
  now_jst:=now() at time zone 'Asia/Tokyo';
  outcome:=public.fs_v7_cancel_outcome(now_jst,r.date,r.start_minute);
  if outcome='reservation_already_started' then
    return jsonb_build_object('ok',false,'error','reservation_already_started');
  end if;
  insert into public.fs_v7_write_permits values(pg_backend_pid(),txid_current(),p_member_id);
  update public.fs_reservations set cancelled=true,cancelled_at=now() where id=r.id;
  update public.fs_v7_reservation_details set visit_outcome=outcome where reservation_id=r.id and visit_outcome='reserved';
  delete from public.fs_v7_write_permits where backend_pid=pg_backend_pid() and transaction_id=txid_current() and member_id=p_member_id;
  return jsonb_build_object('ok',true,'outcome',outcome,'consumes_visit',outcome='late_cancelled');
end;
$$;

create or replace function public.fs_v7_member_snapshot(p_member_code text,p_pin text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare m public.fs_members; l public.fs_v7_membership_links; scope jsonb; availability jsonb;
  users jsonb; reservations jsonb; v7_plan jsonb; gates jsonb; yoga_shared boolean; closed_shared boolean;
begin
  select * into m from public.fs_members where upper(member_code)=upper(p_member_code) and pin=p_pin limit 1;
  if m.id is null then return jsonb_build_object('ok',false,'code','invalid_login','error','ログイン情報が違います。'); end if;
  select * into l from public.fs_v7_membership_links where member_id=m.id;
  if l.member_id is null then return jsonb_build_object('ok',false,'code','not_v7'); end if;
  if l.status<>'active' or m.status<>'active' then
    return jsonb_build_object('ok',false,'code','v7_pending_activation','error','会員有効化の確認中です。公式LINEへお問い合わせください。');
  end if;
  scope:=public.fs_v7_scope_snapshot();
  select s.scope_status='shared' into yoga_shared from public.fs_v7_resource_scope s where s.source_key='fs_yoga_private_reservations';
  select s.scope_status='shared' into closed_shared from public.fs_v7_resource_scope s where s.source_key='fs_closed_slots';
  select coalesce(jsonb_agg(to_jsonb(u)||jsonb_build_object('safety_check_passed',coalesce(cs.safety_check_passed,false))
    order by u.is_contract_holder desc,u.created_at,u.id),'[]'::jsonb) into users
    from public.fs_registered_users u left join public.fs_v7_companion_safety cs
      on cs.member_id=u.member_id and cs.registered_user_id=u.id
    where u.member_id=m.id and u.is_active;
  select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'date',r.date,'start_minute',r.start_minute,
    'people',r.people,'note',r.note,'created_at',r.created_at,'user1_id',r.user1_id,
    'user1_name_snapshot',r.user1_name_snapshot,'user2_id',r.user2_id,'user2_name_snapshot',r.user2_name_snapshot,
    'child_accompanied',r.child_accompanied,'use_minutes_snapshot',50,'visit_outcome',d.visit_outcome)
    order by r.date,r.start_minute),'[]'::jsonb) into reservations
    from public.fs_reservations r join public.fs_v7_reservation_details d on d.reservation_id=r.id
    where r.member_id=m.id;
  v7_plan:=jsonb_build_object('plan_code',l.plan_code,'monthly_price',case l.plan_code when 'free' then 4980 when 'standard' then 7980 else 11980 end,
    'monthly_quota',case l.plan_code when 'free' then 4 when 'standard' then 8 else 12 end,'use_minutes',50,
    'concurrent_limit',case l.plan_code when 'free' then 1 else 2 end,'daily_limit',1,'booking_days',14,
    'booking_deadline_minutes',null,'cancellation_deadline_minutes',null,'is_configured',true);
  gates:=jsonb_build_object('operatorApproved',l.operator_approved);
  select jsonb_build_object('complete',(scope->>'complete')::boolean,'all_reservations',coalesce((
      select jsonb_agg(jsonb_build_object('id',r.id,'member_id',r.member_id,'date',r.date,
        'start_minute',r.start_minute,'use_minutes_snapshot',coalesce(r.use_minutes_snapshot,40),'cancelled',r.cancelled))
      from public.fs_reservations r where not r.cancelled),'[]'::jsonb),
    'yoga_blocks',case when yoga_shared then coalesce((select jsonb_agg(jsonb_build_object('id',y.id,'date',y.date,'start_minute',y.start_minute,'end_minute',y.end_minute))
      from public.fs_yoga_private_reservations y where not y.cancelled),'[]'::jsonb) else '[]'::jsonb end,
    'closed_slots',case when closed_shared then coalesce((select jsonb_agg(to_jsonb(c)) from public.fs_closed_slots c),'[]'::jsonb) else '[]'::jsonb end,
    'external_blocks','[]'::jsonb) into availability;
  return jsonb_build_object('ok',true,
    'member',to_jsonb(m)||jsonb_build_object('plan',l.plan_code,'membership_cohort',l.membership_cohort,
      'agreement_version',l.agreement_version,'status',l.status,'member_status',m.status,'activation_gates',gates),
    'plan_settings',v7_plan,'registered_users',users,'reservations',reservations,
    'booked_slots',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'date',r.date,'start_minute',r.start_minute,
      'use_minutes',coalesce(r.use_minutes_snapshot,40),'use_minutes_snapshot',coalesce(r.use_minutes_snapshot,40),'is_mine',r.member_id=m.id))
      from public.fs_reservations r where not r.cancelled),'[]'::jsonb),
    'closed_slots',availability->'closed_slots','external_blocks','[]'::jsonb,
    'booking_policy',jsonb_build_object('cohort','paid_v7','agreement_version',l.agreement_version,
      'rpc_contract_version','paid-v7-booking-v1','member_snapshot_rpc','fs_v7_member_snapshot',
      'admin_snapshot_rpc','fs_v7_admin_snapshot','admin_create_member_rpc','fs_v7_admin_create_member','admin_update_plan_rpc','fs_v7_admin_update_plan',
      'admin_confirm_companion_safety_rpc','fs_v7_admin_confirm_companion_safety',
      'member_add_companion_rpc','fs_v7_member_add_companion',
      'member_create_rpc','fs_v7_member_create_reservation',
      'member_cancel_rpc','fs_v7_member_cancel_reservation','admin_create_rpc','fs_v7_admin_create_reservation',
      'admin_cancel_rpc','fs_v7_admin_cancel_reservation','server_enforced',true,'activation_gates_enforced',true,
      'late_cancellation_consumption_enforced',true,'shared_booking_store','single_database',
      'cross_system_yoga_gym_buffer_enforced',(select count(*)=2 from pg_trigger t
        where not t.tgisinternal and t.tgenabled in ('O','A') and (
          (t.tgrelid='public.fs_reservations'::regclass and t.tgname='fs_reservations_yoga_guard_trg'
            and t.tgfoid='public.fs_reservations_yoga_guard()'::regprocedure)
          or (t.tgrelid='public.fs_yoga_private_reservations'::regclass and t.tgname='fs_yoga_private_reservations_gym_guard_trg'
            and t.tgfoid='public.fs_yoga_private_reservations_gym_guard()'::regprocedure)
        )),
      'admin_proxy_server_enforced',true,'member_usage_complete',true,'companion_safety_enforced',true,
      'availability',availability));
end;
$$;

create or replace function public.fs_v7_admin_snapshot(p_admin_password text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare scope jsonb; availability jsonb; members jsonb; reservations jsonb; users jsonb;
begin
  if public.gym24_admin_authorized() is distinct from true then return jsonb_build_object('ok',false,'error','管理者認証を確認できません。'); end if;
  scope:=public.fs_v7_scope_snapshot();
  select coalesce(jsonb_agg(to_jsonb(m)||jsonb_build_object('membership_cohort',l.membership_cohort,
    'agreement_version',l.agreement_version,'policy_assignment_id',l.policy_assignment_id,
    'plan',l.plan_code,'status',l.status,'member_status',m.status,
    'activation_gates',jsonb_build_object('operatorApproved',l.operator_approved))
    order by l.created_at desc),'[]'::jsonb) into members
    from public.fs_v7_membership_links l join public.fs_members m on m.id=l.member_id;
  select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'member_id',r.member_id,'member_name',m.name,
    'member_code',m.member_code,'plan',l.plan_code,'date',r.date,'start_minute',r.start_minute,
    'people',r.people,'user1_id',r.user1_id,'user1_name_snapshot',r.user1_name_snapshot,
    'user2_id',r.user2_id,'user2_name_snapshot',r.user2_name_snapshot,'child_accompanied',r.child_accompanied,
    'use_minutes_snapshot',50,'note',r.note,'created_by',r.created_by,'created_at',r.created_at,
    'visit_outcome',d.visit_outcome) order by r.date,r.start_minute),'[]'::jsonb) into reservations
    from public.fs_v7_reservation_details d join public.fs_reservations r on r.id=d.reservation_id
    join public.fs_members m on m.id=r.member_id join public.fs_v7_membership_links l on l.member_id=m.id
    where not r.cancelled;
  select coalesce(jsonb_agg(to_jsonb(u)||jsonb_build_object('safety_check_passed',coalesce(cs.safety_check_passed,false))
    order by u.member_id,u.is_contract_holder desc,u.created_at,u.id),'[]'::jsonb) into users
    from public.fs_registered_users u join public.fs_v7_membership_links l on l.member_id=u.member_id
    left join public.fs_v7_companion_safety cs on cs.member_id=u.member_id and cs.registered_user_id=u.id;
  select jsonb_build_object('complete',(scope->>'complete')::boolean,
    'all_reservations',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'member_id',r.member_id,'date',r.date,
      'start_minute',r.start_minute,'use_minutes_snapshot',coalesce(r.use_minutes_snapshot,40),'cancelled',r.cancelled))
      from public.fs_reservations r where not r.cancelled),'[]'::jsonb),
    'yoga_blocks',case when exists(select 1 from public.fs_v7_resource_scope where source_key='fs_yoga_private_reservations' and scope_status='shared')
      then coalesce((select jsonb_agg(jsonb_build_object('id',y.id,'date',y.date,'start_minute',y.start_minute,'end_minute',y.end_minute))
        from public.fs_yoga_private_reservations y where not y.cancelled),'[]'::jsonb) else '[]'::jsonb end,
    'closed_slots',case when exists(select 1 from public.fs_v7_resource_scope where source_key='fs_closed_slots' and scope_status='shared')
      then coalesce((select jsonb_agg(to_jsonb(c)) from public.fs_closed_slots c),'[]'::jsonb) else '[]'::jsonb end,
    'external_blocks','[]'::jsonb,'scope_sources',scope->'sources') into availability;
  return jsonb_build_object('ok',true,'members',members,'reservations',reservations,'registered_users',users,
    'booking_policy',jsonb_build_object('cohort','paid_v7','agreement_version','agreement-2026-10-13-paid-v7',
      'rpc_contract_version','paid-v7-booking-v1','member_snapshot_rpc','fs_v7_member_snapshot',
      'admin_snapshot_rpc','fs_v7_admin_snapshot','admin_create_member_rpc','fs_v7_admin_create_member','admin_update_plan_rpc','fs_v7_admin_update_plan',
      'admin_confirm_companion_safety_rpc','fs_v7_admin_confirm_companion_safety',
      'member_add_companion_rpc','fs_v7_member_add_companion',
      'member_create_rpc','fs_v7_member_create_reservation',
      'member_cancel_rpc','fs_v7_member_cancel_reservation','admin_create_rpc','fs_v7_admin_create_reservation',
      'admin_cancel_rpc','fs_v7_admin_cancel_reservation','server_enforced',true,'activation_gates_enforced',true,
      'late_cancellation_consumption_enforced',true,'shared_booking_store','single_database',
      'cross_system_yoga_gym_buffer_enforced',(select count(*)=2 from pg_trigger t
        where not t.tgisinternal and t.tgenabled in ('O','A') and (
          (t.tgrelid='public.fs_reservations'::regclass and t.tgname='fs_reservations_yoga_guard_trg'
            and t.tgfoid='public.fs_reservations_yoga_guard()'::regprocedure)
          or (t.tgrelid='public.fs_yoga_private_reservations'::regclass and t.tgname='fs_yoga_private_reservations_gym_guard_trg'
            and t.tgfoid='public.fs_yoga_private_reservations_gym_guard()'::regprocedure)
        )),
      'admin_proxy_server_enforced',true,'member_usage_complete',true,'companion_safety_enforced',true,
      'member_creation_server_enforced',true,'availability',availability));
end;
$$;

create or replace function public.fs_v7_member_create_reservation(
  p_member_code text,p_pin text,p_date date,p_start_minute integer,p_adult_user_ids uuid[],
  p_children_accompanied boolean default false,p_children_supervised boolean default false,
  p_note text default '',p_request_id uuid default null
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare m public.fs_members; l public.fs_v7_membership_links;
begin
  select * into m from public.fs_members where upper(member_code)=upper(p_member_code) and pin=p_pin and status='active' limit 1;
  if m.id is null then return jsonb_build_object('ok',false,'error','ログイン情報が違います。'); end if;
  select * into l from public.fs_v7_membership_links where member_id=m.id;
  if l.member_id is null then return jsonb_build_object('ok',false,'error','v7会員リンクがありません。'); end if;
  return public.fs_v7_create_reservation_internal(m.id,p_date,p_start_minute,p_adult_user_ids,
    p_children_accompanied,p_children_supervised,p_note,p_request_id,'member');
end;
$$;

create or replace function public.fs_v7_admin_create_reservation(
  p_admin_password text,p_member_id uuid,p_date date,p_start_minute integer,p_adult_user_ids uuid[],
  p_children_accompanied boolean default false,p_children_supervised boolean default false,
  p_note text default '',p_request_id uuid default null
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
begin
  if public.gym24_admin_authorized() is distinct from true then return jsonb_build_object('ok',false,'error','管理者認証を確認できません。'); end if;
  return public.fs_v7_create_reservation_internal(p_member_id,p_date,p_start_minute,p_adult_user_ids,
    p_children_accompanied,p_children_supervised,p_note,p_request_id,'admin');
end;
$$;

create or replace function public.fs_v7_member_cancel_reservation(p_member_code text,p_pin text,p_reservation_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare m public.fs_members;
begin
  select * into m from public.fs_members where upper(member_code)=upper(p_member_code) and pin=p_pin and status='active' limit 1;
  if m.id is null or not exists(select 1 from public.fs_v7_membership_links where member_id=m.id and status='active') then
    return jsonb_build_object('ok',false,'error','ログイン情報を確認できません。');
  end if;
  return public.fs_v7_cancel_reservation_internal(m.id,p_reservation_id);
end;
$$;

create or replace function public.fs_v7_admin_cancel_reservation(p_admin_password text,p_reservation_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare target_member uuid;
begin
  if public.gym24_admin_authorized() is distinct from true then return jsonb_build_object('ok',false,'error','管理者認証を確認できません。'); end if;
  select member_id into target_member from public.fs_v7_reservation_details where reservation_id=p_reservation_id;
  if target_member is null then return jsonb_build_object('ok',false,'error','v7予約が見つかりません。'); end if;
  return public.fs_v7_cancel_reservation_internal(target_member,p_reservation_id);
end;
$$;

create or replace function public.fs_v7_resource_scope_snapshot(p_admin_password text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
begin
  if public.gym24_admin_authorized() is distinct from true then return jsonb_build_object('ok',false,'error','管理者認証を確認できません。'); end if;
  return public.fs_v7_scope_snapshot();
end;
$$;

revoke all on function public.fs_v7_scope_snapshot() from public,anon,authenticated,service_role;
revoke all on function public.fs_v7_admin_confirm_companion_safety(text,uuid,uuid) from public;
revoke all on function public.fs_v7_member_add_companion(text,text,text) from public;
revoke all on function public.fs_v7_guard_legacy_member_write() from public,anon,authenticated,service_role;
revoke all on function public.fs_v7_guard_legacy_reservation_delete() from public,anon,authenticated,service_role;
revoke all on function public.fs_v7_guard_legacy_member_policy_change() from public,anon,authenticated,service_role;
revoke all on function public.fs_v7_guard_legacy_companion_write() from public,anon,authenticated,service_role;
revoke all on function public.fs_v7_create_reservation_internal(uuid,date,integer,uuid[],boolean,boolean,text,uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.fs_v7_cancel_reservation_internal(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.fs_v7_cancel_outcome(timestamp,date,integer) from public,anon,authenticated,service_role;
revoke all on function public.fs_v7_member_snapshot(text,text) from public;
revoke all on function public.fs_v7_admin_snapshot(text) from public;
revoke all on function public.fs_v7_member_create_reservation(text,text,date,integer,uuid[],boolean,boolean,text,uuid) from public;
revoke all on function public.fs_v7_admin_create_reservation(text,uuid,date,integer,uuid[],boolean,boolean,text,uuid) from public;
revoke all on function public.fs_v7_member_cancel_reservation(text,text,uuid) from public;
revoke all on function public.fs_v7_admin_cancel_reservation(text,uuid) from public;
revoke all on function public.fs_v7_resource_scope_snapshot(text) from public;

revoke all on function public.fs_v7_admin_confirm_companion_safety(text,uuid,uuid) from anon,service_role;
grant execute on function public.fs_v7_admin_confirm_companion_safety(text,uuid,uuid) to authenticated;
grant execute on function public.fs_v7_member_add_companion(text,text,text) to anon,authenticated,service_role;
grant execute on function public.fs_v7_member_snapshot(text,text) to anon,authenticated,service_role;
revoke all on function public.fs_v7_admin_snapshot(text) from anon,service_role;
grant execute on function public.fs_v7_admin_snapshot(text) to authenticated;
grant execute on function public.fs_v7_member_create_reservation(text,text,date,integer,uuid[],boolean,boolean,text,uuid) to anon,authenticated,service_role;
revoke all on function public.fs_v7_admin_create_reservation(text,uuid,date,integer,uuid[],boolean,boolean,text,uuid) from anon,service_role;
grant execute on function public.fs_v7_admin_create_reservation(text,uuid,date,integer,uuid[],boolean,boolean,text,uuid) to authenticated;
grant execute on function public.fs_v7_member_cancel_reservation(text,text,uuid) to anon,authenticated,service_role;
revoke all on function public.fs_v7_admin_cancel_reservation(text,uuid) from anon,service_role;
revoke all on function public.fs_v7_resource_scope_snapshot(text) from anon,service_role;
grant execute on function public.fs_v7_admin_cancel_reservation(text,uuid) to authenticated;
grant execute on function public.fs_v7_resource_scope_snapshot(text) to authenticated;

revoke all on function public.fs_v7_admin_create_member(text,text,text,text) from public,anon,authenticated,service_role;
revoke all on function public.fs_v7_admin_update_plan(text,uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.fs_v7_admin_create_member(text,text,text,text) to authenticated;
grant execute on function public.fs_v7_admin_update_plan(text,uuid,text,text) to authenticated;

-- Effective privilege checks also catch inherited/default grants, not only ACL text.
do $acl$
declare api_role text; internal_signature text;
begin
  foreach api_role in array array['anon','authenticated','service_role'] loop
    if has_table_privilege(api_role,'public.fs_v7_write_permits','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then
      raise exception 'Private permit table privilege leaked to %',api_role;
    end if;
    foreach internal_signature in array array[
      'public.fs_v7_write_authorized(uuid)',
      'public.fs_v7_scope_snapshot()',
      'public.fs_v7_create_reservation_internal(uuid,date,integer,uuid[],boolean,boolean,text,uuid,text)',
      'public.fs_v7_cancel_reservation_internal(uuid,uuid)',
      'public.fs_v7_cancel_outcome(timestamp,date,integer)'
    ] loop
      if has_function_privilege(api_role,internal_signature,'EXECUTE') then
        raise exception 'Private RPC privilege leaked to %: %',api_role,internal_signature;
      end if;
    end loop;
  end loop;
end
$acl$;

commit;
