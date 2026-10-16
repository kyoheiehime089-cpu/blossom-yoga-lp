-- Metadata fingerprints only. No body/value is returned. Capture before approval.
with targets as (
 select p.oid,p.proname,p.proowner,p.proacl,p.proargtypes
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and (p.proname like 'fs_admin_%'
  or array_position(p.proargnames,'p_admin_password') is not null)
)
select encode(sha256(convert_to(coalesce(jsonb_agg(jsonb_build_object(
 'signature',t.oid::regprocedure::text,
 'definition_sha256',encode(sha256(convert_to(pg_get_functiondef(t.oid),'UTF8')),'hex'),
 'owner',pg_get_userbyid(t.proowner),'acl',t.proacl::text)
 order by t.proname,oidvectortypes(t.proargtypes)),'[]'::jsonb)::text,'UTF8')),'hex') current_admin_manifest_sha256
from targets t
\gset
