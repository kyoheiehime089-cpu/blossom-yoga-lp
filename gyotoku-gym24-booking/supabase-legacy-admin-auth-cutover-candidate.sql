-- OFFLINE CANDIDATE. No production execution is authorized.
-- Inputs require independently approved immediate-baseline hashes.
\set ON_ERROR_STOP on
begin;
create temporary table gym24_cutover_expected on commit drop as select
 :'expected_admin_helper_sha256'::text helper_hash, :'expected_delete_sha256'::text delete_hash,
 :'expected_admin_manifest_sha256'::text manifest_hash;
\ir docs/admin-cutover-catalog-fingerprint.sql
alter table gym24_cutover_expected add column actual_manifest_hash text;
update gym24_cutover_expected set actual_manifest_hash=:'current_admin_manifest_sha256';
create temporary table gym24_cutover_targets on commit drop as
select p.oid,p.proname,encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') original_body_hash,
 null::text expected_guarded_body_hash from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and (p.proname like 'fs_admin_%'
 or array_position(p.proargnames,'p_admin_password') is not null);
do $check$
declare expected record; fn record;
begin
 if to_regprocedure('public.gym24_admin_authorized()') is null then
  raise exception 'Reviewed administrator authorization must be installed first';
 end if;
 select * into strict expected from pg_temp.gym24_cutover_expected;
 if expected.helper_hash !~ '^[0-9a-f]{64}$' or expected.delete_hash !~ '^[0-9a-f]{64}$'
 or expected.manifest_hash !~ '^[0-9a-f]{64}$' or expected.manifest_hash is distinct from expected.actual_manifest_hash
 or (select encode(sha256(convert_to(pg_get_functiondef(oid),'UTF8')),'hex') from pg_proc
     where oid='public.fs_is_admin(text)'::regprocedure) is distinct from expected.helper_hash
 or (select encode(sha256(convert_to(pg_get_functiondef(oid),'UTF8')),'hex') from pg_proc
     where oid='public.fs_admin_delete_member(text,uuid)'::regprocedure) is distinct from expected.delete_hash then
  raise exception 'Missing or changed approved administrative baseline';
 end if;
 for fn in select p.*,l.lanname from pg_temp.gym24_cutover_targets t join pg_proc p on p.oid=t.oid
     join pg_language l on l.oid=p.prolang loop
  if fn.proowner<>(select oid from pg_roles where rolname=current_user) then
   raise exception 'Administrative owner differs; review required';
  end if;
  if fn.proisstrict then
   raise exception 'STRICT administrative RPC requires a separately reviewed NULL compatibility change';
  end if;
  if fn.proname not in ('fs_is_admin','fs_admin_delete_member') and position('fs_is_admin' in fn.prosrc)=0 then
   raise exception 'Unreviewed administrative dependency: %',fn.proname;
  end if;
  if fn.proname<>'fs_is_admin' and (fn.lanname<>'plpgsql' or fn.prosrc !~* 'end[[:space:]]*;?[[:space:]]*$') then
   raise exception 'Administrative body needs a separately reviewed wrapper: %',fn.proname;
  end if;
  if fn.proname='fs_admin_delete_member' and (fn.lanname<>'plpgsql'
    or position('p_admin_password' in fn.prosrc)>0 or fn.prosrc ~ $pos$\$1\M$pos$
    or fn.prosrc !~* 'end[[:space:]]*;[[:space:]]*$') then
   raise exception 'Delete implementation changed; do not guess authorization edits';
  end if;
 end loop;
end
$check$;
-- Preserve RPC signatures and business bodies; the old passcode is not accepted.
create or replace function public.fs_is_admin(p_admin_password text)
returns boolean language sql stable security definer set search_path=pg_catalog,public,pg_temp
as $$ select public.gym24_admin_authorized() $$;
do $protect_legacy$
declare original_body text; definition text; guarded_body text; executable_body text; fn record;
begin
 for fn in select * from pg_temp.gym24_cutover_targets where proname<>'fs_is_admin' loop
  select prosrc,pg_get_functiondef(oid) into strict original_body,definition from pg_proc where oid=fn.oid;
  if length(definition)-length(replace(definition,original_body,''))<>length(original_body) then
   raise exception 'Administrative body cannot be uniquely wrapped';
  end if;
  executable_body:=original_body;
  if original_body ~* 'end[[:space:]]*$' then executable_body:=original_body||';'; end if;
  guarded_body:=E'BEGIN\n IF public.gym24_admin_authorized() IS DISTINCT FROM true THEN\n'
   ||E' RAISE EXCEPTION ''Administrative authorization required'' USING ERRCODE=''42501'';\n END IF;\n'
   ||executable_body||E'\nEND;\n';
  execute replace(definition,original_body,guarded_body);
  update pg_temp.gym24_cutover_targets set expected_guarded_body_hash=
   encode(sha256(convert_to(guarded_body,'UTF8')),'hex') where oid=fn.oid;
 end loop;
end
$protect_legacy$;
do $acl$
declare fn record; api_role text;
begin
 for fn in select * from pg_temp.gym24_cutover_targets loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',fn.oid::regprocedure);
  if fn.proname<>'fs_admin_change_password' then
   execute format('grant execute on function %s to authenticated',fn.oid::regprocedure);
  end if;
  execute format('alter function %s set search_path=pg_catalog,public,pg_temp',fn.oid::regprocedure);
  if fn.proname not in ('fs_is_admin','fs_admin_delete_member')
    and (select encode(sha256(convert_to(prosrc,'UTF8')),'hex') from pg_proc where oid=fn.oid) is distinct from fn.expected_guarded_body_hash then
    raise exception 'Administrative business body changed unexpectedly';
  end if;
  foreach api_role in array array['anon','service_role'] loop
   if has_function_privilege(api_role,fn.oid,'EXECUTE') then
    raise exception 'Inherited administrative execute privilege remains';
   end if;
  end loop;
 end loop;
end
$acl$;
commit;
