-- PREPARED ONLY. Parent executes once after approval of owner-only baseline DDL.
-- No function body or secret value is returned. Not a data backup.
-- Run in FPL SQL Editor as postgres; do not save result payload or inspect table rows.
begin transaction isolation level repeatable read;
do $check$ begin
 if current_user <> 'postgres' then raise exception 'postgres owner required'; end if;
 if to_regnamespace('gym24_baseline_20261016') is not null then
  raise exception 'Baseline schema already exists; inspect metadata, do not overwrite';
 end if;
end $check$;
create schema gym24_baseline_20261016 authorization postgres;
revoke all on schema gym24_baseline_20261016 from public,anon,authenticated,service_role,authenticator;
create table gym24_baseline_20261016.catalog (
 id text primary key,
 captured_at timestamptz not null default clock_timestamp(),
 project_ref text not null check (project_ref='fplvstwmsewpqwrcsqrm'),
 payload text not null,
 sha256 text not null,
 constraint payload_digest_matches check (sha256=encode(sha256(convert_to(payload,'UTF8')),'hex'))
);
alter table gym24_baseline_20261016.catalog owner to postgres;
alter table gym24_baseline_20261016.catalog enable row level security;
revoke all on table gym24_baseline_20261016.catalog from public,anon,authenticated,service_role,authenticator;
with objects as (
  select jsonb_build_object(
    'database',current_database(),
    'server_version',current_setting('server_version'),
    'schema',(select jsonb_build_object('owner',pg_get_userbyid(nspowner),'acl',nspacl::text)
      from pg_namespace where nspname='public'),
    'roles',(select jsonb_agg(jsonb_build_object('name',rolname,'superuser',rolsuper,
      'bypass_rls',rolbypassrls,'inherit',rolinherit,'login',rolcanlogin,
      'create_role',rolcreaterole) order by rolname) from pg_roles),
    'role_memberships',(select jsonb_agg(jsonb_build_object('role',pg_get_userbyid(roleid),
      'member',pg_get_userbyid(member),'grantor',pg_get_userbyid(grantor),
      'admin_option',admin_option) order by roleid,member,grantor) from pg_auth_members),
    'functions',coalesce((select jsonb_agg(jsonb_build_object(
      'identity',p.oid::regprocedure::text,'definition',pg_get_functiondef(p.oid),
      'arguments',pg_get_function_arguments(p.oid),'argument_names',p.proargnames,
      'result_type',pg_get_function_result(p.oid),
      'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text,
      'effective_acl',(select jsonb_agg(jsonb_build_object(
        'grantee',case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,
        'grantor',pg_get_userbyid(a.grantor),'privilege',a.privilege_type,
        'grantable',a.is_grantable) order by a.grantee,a.grantor,a.privilege_type,a.is_grantable)
        from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a),
      'security_definer',p.prosecdef,'config',p.proconfig) order by p.oid::regprocedure::text)
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.prokind='f' and (p.proname like 'fs_%' or p.proname in ('gym24_admin_authorized','blossom_gym_conflicts_yoga'))),'[]'::jsonb),
    'relations',coalesce((select jsonb_agg(jsonb_build_object(
      'name',c.relname,'kind',c.relkind,'owner',pg_get_userbyid(c.relowner),
      'acl',c.relacl::text,'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,
      'columns',(select jsonb_agg(jsonb_build_object('name',a.attname,
        'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,
        'identity',a.attidentity,'generated',a.attgenerated,'acl',a.attacl::text,
        'default',pg_get_expr(d.adbin,d.adrelid)) order by a.attnum)
        from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
        where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),
      'constraints',(select jsonb_agg(jsonb_build_object('name',x.conname,
        'definition',pg_get_constraintdef(x.oid,true)) order by x.conname)
        from pg_constraint x where x.conrelid=c.oid),
      'indexes',(select jsonb_agg(pg_get_indexdef(i.indexrelid) order by i.indexrelid::regclass::text)
        from pg_index i where i.indrelid=c.oid),
      'triggers',(select jsonb_agg(jsonb_build_object('name',t.tgname,
        'definition',pg_get_triggerdef(t.oid,true),'enabled',t.tgenabled) order by t.tgname)
        from pg_trigger t where t.tgrelid=c.oid and not t.tgisinternal),
      'policies',(select jsonb_agg(jsonb_build_object('name',p.polname,'permissive',p.polpermissive,
        'roles',p.polroles,'command',p.polcmd,'using',pg_get_expr(p.polqual,p.polrelid),
        'check',pg_get_expr(p.polwithcheck,p.polrelid)) order by p.polname)
        from pg_policy p where p.polrelid=c.oid)) order by c.relname)
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and (c.relname like 'fs_%' or c.relname='gym24_admin_authorizations')
        and c.relkind in ('r','p','S','v','m')),'[]'::jsonb),
    'default_acl',coalesce((select jsonb_agg(jsonb_build_object('owner',pg_get_userbyid(d.defaclrole),
      'namespace',n.nspname,'type',d.defaclobjtype,'acl',d.defaclacl::text)
      order by d.defaclrole,n.nspname,d.defaclobjtype)
      from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace
      where n.nspname='public' or d.defaclnamespace=0),'[]'::jsonb)
  )::text payload
)
insert into gym24_baseline_20261016.catalog(id,project_ref,payload,sha256)
select 'before_rule_alignment','fplvstwmsewpqwrcsqrm',payload,
 encode(sha256(convert_to(payload,'UTF8')),'hex') from objects;
do $verify$ begin
 if exists(select 1 from unnest(array['anon','authenticated','service_role','authenticator']) r
 where has_schema_privilege(r,'gym24_baseline_20261016','USAGE')
 or has_table_privilege(r,'gym24_baseline_20261016.catalog','SELECT')) then
  raise exception 'API role can read protected baseline';
 end if;
end $verify$;
commit;
select id,captured_at,project_ref,sha256,
 sha256=encode(sha256(convert_to(payload,'UTF8')),'hex') as digest_verified,
 octet_length(payload) as protected_bytes
from gym24_baseline_20261016.catalog where id='before_rule_alignment';
