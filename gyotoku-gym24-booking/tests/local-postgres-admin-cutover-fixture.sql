-- Local synthetic self-approval ONLY. Production needs independently approved hashes.
\ir ../docs/admin-cutover-catalog-fingerprint.sql
\set expected_admin_manifest_sha256 :current_admin_manifest_sha256
select encode(sha256(convert_to(pg_get_functiondef('public.fs_is_admin(text)'::regprocedure),'UTF8')),'hex') expected_admin_helper_sha256,
 encode(sha256(convert_to(pg_get_functiondef('public.fs_admin_delete_member(text,uuid)'::regprocedure),'UTF8')),'hex') expected_delete_sha256
\gset
\ir ../supabase-legacy-admin-auth-cutover-candidate.sql
