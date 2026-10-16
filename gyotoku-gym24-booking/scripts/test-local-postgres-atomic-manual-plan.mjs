import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { localClient,projectDir } from "./local-postgres-test-client.mjs";
const db=localClient();const read=(p)=>readFileSync(resolve(projectDir,p),"utf8").replace(/\r\n/g,"\n");
const owner=(s)=>"set role postgres;\n"+s;let passed=0;const pass=(s)=>console.log(`PASS ${++passed}: ${s}`);
db.file("tests/local-postgres-v7-fixture.sql");
db.sql(`do $$ begin
if not exists(select 1 from pg_roles where rolname='postgres') then create role postgres nologin bypassrls; end if;
if not exists(select 1 from pg_roles where rolname='authenticator') then create role authenticator nologin noinherit; end if;
end $$;grant gym24_test_owner to postgres;
alter table auth.users add column email_confirmed_at timestamptz;
update auth.users set email_confirmed_at=now();
do $$ declare f record; begin for f in select p.oid::regprocedure identity from pg_proc p
where p.pronamespace='public'::regnamespace and p.prokind='f' loop
execute format('alter function %s owner to postgres',f.identity); end loop;end $$;`);
db.sql(owner(read("docs/production-owner-only-baseline-candidate.sql")));
const baseline=db.sql(owner("select sha256 from gym24_baseline_20261016.catalog;"));
const hash=(sig)=>db.sql(`select encode(sha256(convert_to(pg_get_functiondef('${sig}'::regprocedure),'UTF8')),'hex');`);
const oldHelper=hash("fs_is_admin(text)"),oldDelete=hash("fs_admin_delete_member(text,uuid)");
const manifest=db.sql(owner(read("docs/admin-cutover-catalog-fingerprint.sql").replace(/\\gset\s*$/, ";")));
db.sql(owner(read("supabase-exact-mutual-30min-buffer.sql")));
db.sql(owner(read("supabase-gym24-admin-auth-candidate.sql")));
const helper=hash("gym24_admin_authorized()");
const beforeRows=db.sql("select encode(sha256(convert_to(jsonb_agg(to_jsonb(m) order by id)::text,'UTF8')),'hex') from fs_members m;");
const wrapper=read("docs/production-atomic-admin-manual-plan-transaction.sql");
const receipt=wrapper.match(/expected jsonb:='([^']+)'::jsonb/)[1];const synthetic={};
for(const name of Object.keys(JSON.parse(receipt)))synthetic[name]=db.sql(`select encode(sha256(convert_to(pg_get_functiondef(oid),'UTF8')),'hex') from pg_proc where pronamespace='public'::regnamespace and proname='${name}';`);
let sql=wrapper.replaceAll("2f30f36cbfae93b97dc209cb0c7e2448fc0a9c77157c109661c0be0bb9277449",baseline)
.replace("bb5f507567f7b106466132f489cbbd5edb4b5a21f024a16dc0b8b490c740bd1a",helper)
.replace("029333d409fd3dc0593b218a572d049dac47d62d99e89fa7f65cdc7e8492501b",oldHelper)
.replace("3367d4bc3079dbc85e7fc573404a7fa836165dc5ecd13b03b1aa42374cc5f51d",oldDelete)
.replace("287d942f7da91c52d9dcc20b64c5d2945bdd1f9cb87c9789d21cd834d2d4277a",manifest)
.replace(receipt,JSON.stringify(synthetic));
const rejected=(s,p)=>{const r=db.raw(owner(s));assert.notEqual(r.status,0);assert.match(r.stderr,p);};
rejected(sql,/Designated administrator real Auth\/JWT\/UI verification missing/);
assert.equal(hash("fs_is_admin(text)"),oldHelper);
pass("missing operator verification prevents legacy cutover and V7 install");
sql=sql.replace("NULL::uuid expected_user_id, false::boolean real_auth_and_ui_verified","'81000000-0000-4000-8000-000000000001'::uuid expected_user_id, true::boolean real_auth_and_ui_verified");
rejected(sql,/Exactly one designated active administrator required/);
pass("empty allowlist still stops atomic release after identity is specified");
db.sql(owner("insert into gym24_admin_authorizations(user_id,enabled) values('81000000-0000-4000-8000-000000000001',true);"));
rejected(sql.replace(helper,"0".repeat(64)),/Approved admin helper receipt mismatch/);
pass("wrong approved helper hash prevents both operations");
const originalTrigger=db.sql("select pg_get_triggerdef(oid,true) from pg_trigger where tgrelid='fs_reservations'::regclass and tgname='fs_reservations_yoga_guard_trg';");
db.sql("drop trigger fs_reservations_yoga_guard_trg on fs_reservations;create trigger fs_reservations_yoga_guard_trg before insert on fs_reservations for each row execute function fs_yoga_private_reservations_gym_guard();");
rejected(sql,/Installed buffer trigger definition mismatch/);
db.sql("drop trigger fs_reservations_yoga_guard_trg on fs_reservations;"+originalTrigger+";");
pass("same enabled trigger name cannot hide a changed event or function binding");
rejected(sql.replace("do $release_unchanged$","update public.fs_members set name=name||' injected';\ndo $release_unchanged$"),/Existing member\/override\/reservation rows changed/);
assert.equal(hash("fs_is_admin(text)"),oldHelper);
assert.equal(db.sql("select count(*) from pg_class c where c.relnamespace='public'::regnamespace and c.relname like 'fs_v7_%';"),"0");
pass("late invariant failure rolls back old RPC changes and all V7 schema together");
const result=db.sql(owner(sql));assert.match(result,/^t\|t\|0\|/);
assert.equal(db.sql("select encode(sha256(convert_to(jsonb_agg(to_jsonb(m) order by id)::text,'UTF8')),'hex') from fs_members m;"),beforeRows);
assert.equal(db.sql("select count(*) from fs_v7_membership_links;"),"0");
assert.equal(db.sql("select has_function_privilege('anon','fs_admin_snapshot(text)','EXECUTE');"),"f");
assert.equal(db.sql("select has_function_privilege('anon','fs_v7_admin_create_member(text,text,text,text)','EXECUTE');"),"f");
assert.equal(db.sql("select has_function_privilege('authenticated','fs_v7_admin_create_member(text,text,text,text)','EXECUTE');"),"t");
pass("one commit installs protected legacy RPCs and V7 with no new member or legacy data change");
console.log(`PASS TOTAL ${passed} focused atomic manual-plan release cases; Auth uses synthetic fixture, not real JWT proof.`);
