import assert from "node:assert/strict";
import {readFileSync} from "node:fs";import {resolve} from "node:path";
import {localClient,projectDir} from "./local-postgres-test-client.mjs";
const db=localClient();const read=p=>readFileSync(resolve(projectDir,p),"utf8");const owner=s=>"set role postgres;\n"+s;
let passed=0;const pass=s=>console.log(`PASS ${++passed}: ${s}`);
db.file("tests/local-postgres-v7-fixture.sql");
db.sql(`do $$ begin
if not exists(select 1 from pg_roles where rolname='postgres') then create role postgres nologin bypassrls; end if;
if not exists(select 1 from pg_roles where rolname='authenticator') then create role authenticator nologin noinherit; end if;
end $$;grant gym24_test_owner to postgres;
alter table auth.users add column email text;alter table auth.users add column email_confirmed_at timestamptz;
update auth.users set email='owner@example.test',email_confirmed_at=now();
create table auth.identities(user_id uuid,provider text);insert into auth.identities select id,'email' from auth.users;
do $$ declare f record;begin for f in select p.oid::regprocedure identity from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f' loop
execute format('alter function %s owner to postgres',f.identity);end loop;end $$;`);
db.sql(owner(read("supabase-gym24-admin-auth-candidate.sql")));
const helper=db.sql("select encode(sha256(convert_to(pg_get_functiondef('gym24_admin_authorized()'::regprocedure),'UTF8')),'hex');");
const before=db.sql("select encode(sha256(convert_to(jsonb_agg(to_jsonb(m) order by id)::text,'UTF8')),'hex') from fs_members m;");
const original=read("docs/production-enroll-one-admin.sql").replace("bb5f507567f7b106466132f489cbbd5edb4b5a21f024a16dc0b8b490c740bd1a",helper);
const rejected=(s,p)=>{const r=db.raw(owner(s));assert.notEqual(r.status,0);assert.match(r.stderr,p);};
rejected(original,/Confirmed owner identity and authorization duration required/);pass("unfilled identity/approval rejects without enrolling anyone");
const sql=original.replace("NULL::uuid expected_user_id,NULL::text expected_email","'81000000-0000-4000-8000-000000000001'::uuid expected_user_id,'owner@example.test'::text expected_email")
.replace("false::boolean owner_designated,false::boolean until_revoked_accepted","true::boolean owner_designated,true::boolean until_revoked_accepted");
rejected(sql.replace("owner@example.test'::text","other@example.test'::text"),/Exactly one existing Email identity must match/);pass("wrong Email rejects without account creation");
rejected(sql.replace("81000000-0000-4000-8000-000000000001'::uuid expected","81000000-0000-4000-8000-000000000099'::uuid expected"),/Dashboard UUID\/email\/verified identity mismatch/);pass("UUID/Email mismatch rejects");
rejected(sql.replace(helper,"0".repeat(64)),/Approved helper hash\/owner\/ACL mismatch/);pass("helper hash mismatch rejects");
assert.match(db.sql(owner(sql)),/^t\|1\|f\|f/);assert.equal(db.sql("select count(*) from gym24_admin_authorizations;"),"1");
assert.equal(db.sql("select encode(sha256(convert_to(jsonb_agg(to_jsonb(m) order by id)::text,'UTF8')),'hex') from fs_members m;"),before);
assert.equal(JSON.parse(db.sql("set role anon;select fs_admin_snapshot('local-test-admin');")).ok,true);
pass("one confirmed existing identity enrolled; old member data and old management route retained");
rejected(sql,/Allowlist is not empty/);pass("repeat execution cannot upsert or replace administrator");
console.log(`PASS TOTAL ${passed} local synthetic enrollment cases; no production write.`);
