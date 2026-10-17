-- Disposable fixture only. This is not a Supabase schema and contains no live member data.
do $$ begin
  if not exists(select 1 from pg_roles where rolname='anon') then execute 'create role anon nologin'; end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then execute 'create role authenticated nologin'; end if;
  if not exists(select 1 from pg_roles where rolname='service_role') then execute 'create role service_role nologin bypassrls'; end if;
end $$;

create schema auth;
create table auth.users(id uuid primary key);
insert into auth.users values('81000000-0000-4000-8000-000000000001');
create function auth.role() returns text language sql stable as $$
  select nullif(current_setting('request.jwt.claim.role',true),'')
$$;
create function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),
    nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid
$$;
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb)
$$;
grant usage on schema auth to public;
grant execute on function auth.role() to public;
grant execute on function auth.uid() to public;
grant execute on function auth.jwt() to public;
create function public.blossom_gym_conflicts_yoga(date,integer,integer)
returns boolean language sql stable as $$ select false $$;

create table public.fs_members (
  id uuid primary key default gen_random_uuid(),
  member_code text not null,
  name text not null,
  email text,
  pin text not null,
  plan text not null check(plan in ('free','standard','premium')),
  status text not null default 'active' check(status in ('active','suspended','deleted')),
  created_at timestamptz not null default now()
);
create unique index fs_members_active_code_uq on public.fs_members(upper(member_code)) where status='active';
create unique index fs_members_active_email_uq on public.fs_members(lower(email)) where status='active' and email is not null and email<>'';

create table public.fs_registered_users (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.fs_members(id),
  name text not null,
  is_contract_holder boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.fs_reservations (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.fs_members(id),
  date date not null,
  start_minute integer not null check(start_minute>=0 and start_minute<=1430 and start_minute%10=0),
  people text not null default '1名',
  note text,
  created_by text not null default 'member',
  user1_id uuid references public.fs_registered_users(id),
  user1_name_snapshot text,
  user2_id uuid references public.fs_registered_users(id),
  user2_name_snapshot text,
  child_accompanied boolean not null default false,
  use_minutes_snapshot integer,
  cancelled boolean not null default false,
  cancelled_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.fs_yoga_private_reservations (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  start_minute integer not null check(start_minute>=0 and start_minute<=1430 and start_minute%10=0),
  end_minute integer not null check(end_minute>start_minute and end_minute>=10 and end_minute<=1440 and end_minute%10=0),
  member_name text not null default 'Fixture Yoga',
  note text not null default '',
  cancelled boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.fs_closed_slots (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  start_minute integer not null,
  block_minutes integer not null default 50,
  reason text,
  created_at timestamptz not null default now()
);

create table public.fs_external_blocks (
  id uuid primary key default gen_random_uuid(),
  block_date date not null,
  start_minute integer not null,
  end_minute integer not null,
  active boolean not null default true
);

create table public.fs_plan_settings (
  plan_code text primary key,
  monthly_price integer not null,
  monthly_quota integer,
  use_minutes integer not null,
  adults_allowed integer not null,
  two_adult_cost integer not null,
  concurrent_limit integer not null,
  daily_limit integer not null,
  booking_days integer not null,
  booking_deadline_minutes integer not null,
  cancellation_deadline_minutes integer not null,
  is_configured boolean not null
);
insert into public.fs_plan_settings values
  ('free',0,4,25,1,1,1,1,7,120,180,true),
  ('standard',4800,6,40,2,1,2,1,14,120,180,true),
  ('premium',0,null,40,2,1,2,1,14,120,180,true);

-- Fixture-only representation; production uses nullable individual columns.
create table public.fs_member_rule_overrides (
  member_id uuid primary key references public.fs_members(id),
  rule_snapshot jsonb not null,
  use_minutes integer,monthly_quota integer,concurrent_limit integer,daily_limit integer,booking_days integer
);

create table public.fs_app_settings (key text primary key, value text not null);
insert into public.fs_app_settings values ('admin_password','local-test-admin');

create function public.fs_is_admin(p_admin_password text)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.fs_app_settings where key='admin_password' and value=p_admin_password)
$$;

create function public.fs_business_conflicts(p_date date,p_start_minute integer,p_use_minutes integer)
-- Synthetic legacy read/delete implementations for cutover tests.
returns boolean language sql stable security definer set search_path=public as $$
  select false
$$;
create function public.fs_business_blocks(p_date date)
returns table(block_start timestamp,block_end timestamp) language sql stable as $$
 select p_date::timestamp+interval '8 hours',p_date::timestamp+interval '10 hours'
$$;
create function public.fs_admin_snapshot(p_admin_password text)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
  if not public.fs_is_admin(p_admin_password) then return jsonb_build_object('ok',false); end if;
  return jsonb_build_object('ok',true,'members',(select jsonb_agg(to_jsonb(m)) from public.fs_members m));
end $$;
create function public.fs_admin_create_reservation_v2(p_admin_password text,p_member_id uuid,p_date date,p_start_minute integer,p_people integer,p_user1_id uuid,p_user2_id uuid default null,p_child_accompanied boolean default false,p_note text default '')
returns jsonb language plpgsql security definer set search_path=public as $proxy$
declare m fs_members;s fs_plan_settings;rid uuid;
begin
 if not public.fs_is_admin(p_admin_password) then return jsonb_build_object('ok',false); end if;
 select * into m from fs_members where id=p_member_id;
 select * into s from fs_plan_settings where plan_code=m.plan;
 insert into fs_reservations(member_id,date,start_minute,use_minutes_snapshot,user1_id,people)
 values(m.id,p_date,p_start_minute,s.use_minutes,p_user1_id,p_people::text||'名') returning id into rid;
 return jsonb_build_object('ok',true,'id',rid);
end $proxy$;
create function public.fs_admin_delete_member(p_admin_password text,p_member_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
  delete from public.fs_members where id=p_member_id;
  return jsonb_build_object('ok',true);
end;
$$;

alter table public.fs_members enable row level security;
alter table public.fs_registered_users enable row level security;
alter table public.fs_reservations enable row level security;
alter table public.fs_yoga_private_reservations enable row level security;
alter table public.fs_closed_slots enable row level security;
alter table public.fs_plan_settings enable row level security;
alter table public.fs_member_rule_overrides enable row level security;

insert into public.fs_members(id,member_code,name,email,pin,plan,status,created_at) values
  ('10000000-0000-0000-0000-000000000001','LEGACY0001','Local Legacy Fixture','same@example.test','11111111','free','active','2025-01-01T00:00:00Z');
insert into public.fs_registered_users(id,member_id,name,is_contract_holder,is_active) values
  ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Local Legacy Fixture',true,true);
insert into public.fs_member_rule_overrides(member_id,rule_snapshot) values
  ('10000000-0000-0000-0000-000000000001','{"use_minutes":33,"monthly_quota":5,"booking_days":9}'::jsonb);
insert into public.fs_reservations(id,member_id,date,start_minute,use_minutes_snapshot) values
  ('30000000-0000-0000-0000-000000000040','10000000-0000-0000-0000-000000000001','2025-01-10',600,40),
  ('30000000-0000-0000-0000-000000000050','10000000-0000-0000-0000-000000000001','2025-01-11',600,50),
  ('30000000-0000-0000-0000-000000000099','10000000-0000-0000-0000-000000000001','2025-01-12',600,null);
