-- Designated cloud operator only. Confirm the FPL connection before execution.
-- Data never leaves this DB. This is NOT an automatic restore or a down migration.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
do $preflight$
begin
 if current_user<>'postgres' then raise exception 'postgres owner required'; end if;
 if to_regnamespace('gym24_data_backup_20261017') is not null then raise exception 'Backup exists; never overwrite'; end if;
 if not exists(select 1 from gym24_baseline_20261016.catalog where id='before_rule_alignment'
 and project_ref='fplvstwmsewpqwrcsqrm'
 and sha256='2f30f36cbfae93b97dc209cb0c7e2448fc0a9c77157c109661c0be0bb9277449'
 and encode(sha256(convert_to(payload::text,'UTF8')),'hex')=sha256) then
 raise exception 'Approved protected catalog baseline missing'; end if;
 if exists(select 1 from pg_class where relnamespace='public'::regnamespace and relname like 'fs_v7_%') then
 raise exception 'Initial-install backup only; new data requires a reviewed recovery point'; end if;
 if (select count(*) from public.gym24_admin_authorizations where enabled)<>1 then
 raise exception 'Preserve exactly one approved administrator'; end if;
end $preflight$;
create schema gym24_data_backup_20261017 authorization postgres;
revoke all on schema gym24_data_backup_20261017 from public,anon,authenticated,service_role,authenticator;
create table gym24_data_backup_20261017.manifest (
 source_table text primary key,captured_at timestamptz not null default now(),
 row_count bigint not null,sha256 text not null
);
alter table gym24_data_backup_20261017.manifest enable row level security;
revoke all on gym24_data_backup_20261017.manifest from public,anon,authenticated,service_role,authenticator;
do $backup$
declare r record; actual_count bigint; source_hash text; backup_count bigint; backup_hash text; role_name text;
begin
 for r in select c.relname from pg_class c where c.relnamespace='public'::regnamespace
 and c.relkind in ('r','p') and c.relname like 'fs\_%' escape '\' order by c.relname loop
 execute format('lock table public.%I in share mode',r.relname);
 end loop;
 for r in select c.relname from pg_class c where c.relnamespace='public'::regnamespace
 and c.relkind in ('r','p') and c.relname like 'fs\_%' escape '\' order by c.relname loop
 execute format('create table gym24_data_backup_20261017.%I as table public.%I',r.relname,r.relname);
 execute format('alter table gym24_data_backup_20261017.%I enable row level security',r.relname);
 execute format('revoke all on gym24_data_backup_20261017.%I from public,anon,authenticated,service_role,authenticator',r.relname);
 execute format('select count(*),encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text),''[]''::jsonb)::text,''UTF8'')),''hex'') from public.%I x',r.relname) into actual_count,source_hash;
 execute format('select count(*),encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text),''[]''::jsonb)::text,''UTF8'')),''hex'') from gym24_data_backup_20261017.%I x',r.relname) into backup_count,backup_hash;
 if actual_count<>backup_count or source_hash<>backup_hash then raise exception 'Protected data backup verification failed'; end if;
 insert into gym24_data_backup_20261017.manifest(source_table,row_count,sha256) values(r.relname,actual_count,source_hash);
 foreach role_name in array array['anon','authenticated','service_role','authenticator'] loop
 if has_schema_privilege(role_name,'gym24_data_backup_20261017','USAGE,CREATE')
 or has_table_privilege(role_name,format('gym24_data_backup_20261017.%I',r.relname),'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then
 raise exception 'Backup access protection failed'; end if;
 end loop;
 end loop;
end $backup$;
select source_table,row_count,sha256,captured_at from gym24_data_backup_20261017.manifest order by source_table;
commit;
