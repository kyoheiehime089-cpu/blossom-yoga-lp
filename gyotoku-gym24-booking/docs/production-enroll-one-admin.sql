-- Prepared only. Parent executes after the owner designates this identity and duration.
-- Fill the confirmed UUID/email only inside the trusted SQL Editor, never chat.
-- No Auth account, password, invite, email, legacy cutover or MFA setup is created.
begin isolation level read committed;
set local lock_timeout='5s';
set local statement_timeout='30s';
lock table public.gym24_admin_authorizations in share row exclusive mode;
create temporary table gym24_confirmed_operator on commit drop as
select NULL::uuid expected_user_id,NULL::text expected_email,
 false::boolean owner_designated,false::boolean until_revoked_accepted;
alter table gym24_confirmed_operator enable row level security;
revoke all on gym24_confirmed_operator from public,anon,authenticated,service_role,authenticator;
do $enroll$
declare op record; target uuid; f record; preserved_hash text;
begin
 if current_user<>'postgres' then raise exception 'postgres owner required'; end if;
 select * into strict op from gym24_confirmed_operator;
 if op.expected_user_id is null or nullif(btrim(op.expected_email),'') is null
 or not op.owner_designated or not op.until_revoked_accepted then
 raise exception 'Confirmed owner identity and authorization duration required'; end if;
 if (select count(*) from auth.users where lower(email)=lower(btrim(op.expected_email)))<>1 then
 raise exception 'Exactly one existing Email identity must match'; end if;
 select id into target from auth.users where id=op.expected_user_id
 and lower(email)=lower(btrim(op.expected_email)) and email_confirmed_at is not null for update;
 if target is null then raise exception 'Dashboard UUID/email/verified identity mismatch'; end if;
 if not exists(select 1 from auth.identities where user_id=target and provider='email') then
 raise exception 'Existing Email provider identity required'; end if;
 if exists(select 1 from public.gym24_admin_authorizations) then
 raise exception 'Allowlist is not empty; no upsert or overwrite allowed'; end if;
 select p.* into strict f from pg_proc p where p.oid='public.gym24_admin_authorized()'::regprocedure;
 if encode(sha256(convert_to(pg_get_functiondef(f.oid),'UTF8')),'hex')<>'bb5f507567f7b106466132f489cbbd5edb4b5a21f024a16dc0b8b490c740bd1a'
 or pg_get_userbyid(f.proowner)<>'postgres'
 or f.proconfig is distinct from array['search_path=pg_catalog, public, pg_temp']::text[]
 or has_function_privilege('anon',f.oid,'EXECUTE') or has_function_privilege('service_role',f.oid,'EXECUTE')
 or not has_function_privilege('authenticated',f.oid,'EXECUTE') then
 raise exception 'Approved helper hash/owner/ACL mismatch'; end if;
 if exists(select 1 from pg_class where oid='public.gym24_admin_authorizations'::regclass
 and (not relrowsecurity or pg_get_userbyid(relowner)<>'postgres'))
 or exists(select 1 from unnest(array['anon','authenticated','service_role','authenticator']) r
 where has_table_privilege(r,'public.gym24_admin_authorizations','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))
 or exists(select 1 from pg_trigger where tgrelid='public.gym24_admin_authorizations'::regclass and not tgisinternal) then
 raise exception 'Allowlist protection or trigger state mismatch'; end if;
 preserved_hash:=(select encode(sha256(convert_to(pg_get_functiondef('public.fs_is_admin(text)'::regprocedure),'UTF8')),'hex'));
 insert into public.gym24_admin_authorizations(user_id,enabled,require_mfa,expires_at)
 values(target,true,false,null);
 if (select count(*) from public.gym24_admin_authorizations)<>1
 or not exists(select 1 from public.gym24_admin_authorizations where user_id=target and enabled and not require_mfa and expires_at is null)
 or preserved_hash<>(select encode(sha256(convert_to(pg_get_functiondef('public.fs_is_admin(text)'::regprocedure),'UTF8')),'hex')) then
 raise exception 'Enrollment invariant failed'; end if;
end $enroll$;
select true as one_existing_owner_enrolled,1 as approved_admin_count,
 false as legacy_paths_switched,false as new_auth_account_created;
commit;
