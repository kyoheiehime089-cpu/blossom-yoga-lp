-- OFFLINE CANDIDATE. No production authorization/settings/users are changed.
-- Apply before the initial V7 migration, only after isolated Auth/JWT tests.
-- No administrator is seeded: all new management operations deny by default.
begin;
create table public.gym24_admin_authorizations (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  require_mfa boolean not null default false,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.gym24_admin_authorizations enable row level security;
revoke all on public.gym24_admin_authorizations from public,anon,authenticated,service_role;

create function public.gym24_admin_authorized()
returns boolean language sql stable security definer
set search_path=pg_catalog,public,pg_temp as $$
  select coalesce(
    auth.uid() is not null
    and auth.jwt()->>'role'='authenticated'
    and exists(select 1 from public.gym24_admin_authorizations a
      where a.user_id=auth.uid() and a.enabled and (a.expires_at is null or a.expires_at>now())
        and (not a.require_mfa or auth.jwt()->>'aal'='aal2'))
  ,false)
$$;
revoke all on function public.gym24_admin_authorized() from public,anon,authenticated,service_role;
grant execute on function public.gym24_admin_authorized() to authenticated;
commit;
