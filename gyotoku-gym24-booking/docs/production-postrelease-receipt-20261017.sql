-- Read-only business-data verification. Only a transaction-local helper is created.
-- Run before opening writers, and again after tests that use ONLY new synthetic members.
begin;
set local statement_timeout='30s';
create function pg_temp.gym24_release_receipt() returns jsonb language plpgsql as $receipt$
declare r record; missing_count bigint; live_count bigint; tables jsonb:='[]'::jsonb;
begin
 for r in select source_table,row_count,sha256 from gym24_data_backup_20261017.manifest order by source_table loop
 execute format('select count(*) from (select to_jsonb(b) row from gym24_data_backup_20261017.%I b except all select to_jsonb(l) row from public.%I l) q',r.source_table,r.source_table) into missing_count;
 execute format('select count(*) from public.%I',r.source_table) into live_count;
 tables:=tables||jsonb_build_array(jsonb_build_object('table',r.source_table,
 'backup_count',r.row_count,'live_count',live_count,'backup_sha256',r.sha256,'missing_or_changed_old_rows',missing_count));
 end loop;
 return jsonb_build_object('checked_at',now(),'existing_rows',tables,
 'enabled_admins',(select count(*) from public.gym24_admin_authorizations where enabled),
 'anonymous_admin_routes',(select count(*) from pg_proc p where p.pronamespace='public'::regnamespace
 and (p.proname like 'fs_admin_%' or array_position(p.proargnames,'p_admin_password') is not null)
 and has_function_privilege('anon',p.oid,'execute')),
 'v7_members',(select count(*) from public.fs_v7_membership_links),
 'scope_complete',(public.fs_v7_scope_snapshot()->>'complete')::boolean,
 'v7_function_hashes',(select jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,
 'sha256',encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')) order by p.oid::regprocedure::text)
 from pg_proc p where p.pronamespace='public'::regnamespace and p.proname like 'fs_v7_%'));
end $receipt$;
revoke all on function pg_temp.gym24_release_receipt() from public,anon,authenticated,service_role,authenticator;
select pg_temp.gym24_release_receipt();
rollback;
