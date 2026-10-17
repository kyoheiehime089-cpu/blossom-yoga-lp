import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { resolve, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const require=createRequire(import.meta.url);
let playwright;
try{playwright=require("playwright");}
catch{playwright=require("C:/Users/shins/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");}
const project=resolve(dirname(fileURLToPath(import.meta.url)),".."),root=resolve(project,"..");
const out=resolve(project,"tests/results/2026-10-16/manual-admin-ui");
await mkdir(out,{recursive:true});
const types={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".mjs":"text/javascript; charset=utf-8",".css":"text/css",".svg":"image/svg+xml",".webmanifest":"application/manifest+json"};
const server=createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,"http://127.0.0.1");
    let path=resolve(root,"."+decodeURIComponent(url.pathname));
    if(url.pathname.endsWith("/"))path=resolve(path,"index.html");
    if(!path.startsWith(root+"\\")&&!path.startsWith(root+"/"))throw Error("outside root");
    if(!types[extname(path)])throw Error("unsupported");
    const body=await readFile(path);res.writeHead(200,{"Content-Type":types[extname(path)]});res.end(body);
  }catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,"127.0.0.1",r));
const origin="http://127.0.0.1:"+server.address().port;
const browser=await playwright.chromium.launch({channel:"msedge",headless:true});
let passed=0;
try{
 for(const [route,name,kind] of [
  ["/gyotoku-gym24-booking/admin.html","manual-admin","admin"],
 ]){
  for(const [view,width,height] of [["desktop",1280,900],["mobile",390,844]]){
   const context=await browser.newContext({viewport:{width,height},serviceWorkers:"block"});
   await context.route("**/*",async route=>{
    const url=new URL(route.request().url());
    if(url.hostname==="cdn.jsdelivr.net"){
      return route.fulfill({contentType:"text/javascript",body:`
       window.__fixture={signedIn:false,verified:false,mfa:location.search.includes('mfa=1'),approved:!location.search.includes('denied=1'),v7error:location.search.includes('v7error=1'),calls:[],members:[]};
       const f=window.__fixture;
       const client={rpc:async(name,args)=>{f.calls.push(name);if(name==='gym24_admin_authorized')return{data:f.signedIn&&f.approved&&(!f.mfa||f.verified),error:null};
         if(!f.signedIn||!f.approved)return{data:null,error:{message:'denied'}};
         if(f.v7error&&name==='fs_v7_admin_snapshot')return{data:null,error:{message:'synthetic missing backend'}};
         if(f.v7error&&name==='fs_admin_snapshot')return{data:{ok:true,members:[{id:'synthetic-hidden',member_code:'G24V788000000',name:'Synthetic hidden member'}],reservations:[],registered_users:[],closed_slots:[],external_blocks:[]},error:null};
         if(name==='fs_v7_admin_create_member'){const member={id:'synthetic-manual-member',name:args.p_name,email:args.p_email,plan:args.p_plan,member_code:'G24V788000001',pin:'12345678',status:'active',membership_cohort:'paid_v7',agreement_version:'agreement-2026-10-13-paid-v7',activation_gates:{operatorApproved:true}};f.members.push(member);return{data:{ok:true,member},error:null};}
         if(name==='fs_v7_admin_update_plan'){f.members[0].plan=args.p_plan;f.members[0].status=args.p_status;return{data:{ok:true},error:null};}
         if(name==='fs_admin_snapshot'||name==='fs_v7_admin_snapshot')return{data:{ok:true,members:f.members,registered_users:[],reservations:[],closed_slots:[],external_blocks:[],booking_policy:{"cohort":"paid_v7","agreement_version":"agreement-2026-10-13-paid-v7","rpc_contract_version":"paid-v7-booking-v1","reservation_scope":"fpl-gym24-central-yoga-v1","member_snapshot_rpc":"fs_v7_member_snapshot","admin_snapshot_rpc":"fs_v7_admin_snapshot","admin_create_member_rpc":"fs_v7_admin_create_member","admin_update_plan_rpc":"fs_v7_admin_update_plan","admin_confirm_companion_safety_rpc":"fs_v7_admin_confirm_companion_safety","member_add_companion_rpc":"fs_v7_member_add_companion","member_create_rpc":"fs_v7_member_create_reservation","member_cancel_rpc":"fs_v7_member_cancel_reservation","admin_create_rpc":"fs_v7_admin_create_reservation","admin_cancel_rpc":"fs_v7_admin_cancel_reservation","server_enforced":true,"activation_gates_enforced":true,"late_cancellation_consumption_enforced":true,"shared_booking_store":"single_database","cross_system_yoga_gym_buffer_enforced":true,"admin_proxy_server_enforced":true,"member_usage_complete":true,"companion_safety_enforced":true,"member_creation_server_enforced":true,"availability":{"complete":true,"all_reservations":[],"yoga_blocks":[],"closed_slots":[],"external_blocks":[],"scope_sources":[]}}},error:null};
         if(name==='fs_yoga_available_starts')return{data:{ok:true,starts:[600,650]},error:null};
         return{data:{ok:true,members:[],registered_users:[],reservations:[],closed_slots:[],external_blocks:[],gym_reservations:[],yoga_reservations:[],items:[],answers:[],purchases:[]},error:null};},
        auth:{signInWithPassword:async()=>{f.signedIn=true;return{error:null};},getSession:async()=>({data:{session:f.signedIn?{access_token:'synthetic-browser-session'}:null},error:null}),
        signOut:async()=>{f.signedIn=false;return{error:null};},onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),
        mfa:{listFactors:async()=>({data:{totp:f.mfa?[{id:'synthetic-factor',status:'verified'}]:[]},error:null}),
        challenge:async()=>({data:{id:'synthetic-challenge'},error:null}),verify:async()=>{f.verified=true;return{error:null};}}}};
       window.supabase={createClient:()=>client};`});
    }
    if(url.origin!==origin)return route.abort();
    if(url.pathname.endsWith("/supabase-config.js"))return route.fulfill({contentType:"text/javascript",body:"window.GYOTOKU_SUPABASE_URL='https://synthetic.invalid';window.GYOTOKU_SUPABASE_ANON_KEY='synthetic-only';"});
    return route.continue();
   });
   const page=await context.newPage(),errors=[],failedAssets=[];
   page.on("pageerror",error=>errors.push(error.message));
   page.on("response",response=>{if(response.status()>=400 && /\.(css|js|mjs)(\?|$)/.test(response.url()))failedAssets.push(new URL(response.url()).pathname);});
   page.on("dialog",dialog=>dialog.accept());
   await page.goto(origin+route,{waitUntil:"networkidle"});
   await page.locator("#adminEmail").waitFor();
   assert.equal(await page.locator("#adminAccountPassword").getAttribute("type"),"password");
   assert.equal(await page.locator(kind==="admin"?"#adminView":"#yogaView").isVisible(),false);
   assert.deepEqual(failedAssets,[]);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await page.screenshot({path:resolve(out,name+"-"+view+"-login.png"),fullPage:true});
   assert.equal(await page.evaluate(()=>window.__fixture.calls.filter(n=>n!=="gym24_admin_authorized").length),0);
   await page.locator("#adminEmail").fill("synthetic-admin@example.test");
   await page.locator("#adminAccountPassword").fill("synthetic-password");
   await page.locator(kind==="admin"?"#adminOpen":"#yogaOpen").click();
   if(route.includes("denied=1")){
    await page.waitForFunction(()=>window.__fixture.calls.includes("gym24_admin_authorized"));
    assert.equal(await page.locator("#loginView").isVisible(),true);
    assert.equal(await page.evaluate(()=>window.__fixture.calls.some(n=>n.startsWith("fs_admin_"))),false);
    passed++;console.log("PASS "+passed+": "+name+" "+view+" unapproved login remains closed");
    await context.close();continue;
   }
   if(route.includes("v7error=1")){
    await page.waitForFunction(()=>window.__fixture.calls.includes("fs_v7_admin_snapshot"));
    assert.equal(await page.locator("#loginView").isVisible(),true);
    assert.equal(await page.locator("#adminView").isVisible(),false);
    assert.equal(await page.getByText("Synthetic hidden member").count(),0);
    assert.equal(await page.evaluate(()=>window.gyotokuAdminSnapshot.members.length),0);
    passed++;console.log("PASS "+passed+": "+name+" "+view+" backend failure discards legacy snapshot");
    await context.close();continue;
   }
   if(route.includes("mfa=1")){
    await page.locator("#adminMfaFields").waitFor({state:"visible"});
    await page.locator("#adminMfaCode").fill("123456");
    await page.locator("#adminOpen").click();
   }
   await page.locator(kind==="admin"?"#adminView":"#yogaView").waitFor({state:"visible"});
   assert.equal(await page.locator("#adminAccountPassword").inputValue(),"");
   assert.deepEqual(errors,[]);
   await page.locator('[data-tab="customers"]').click();
   assert.equal(await page.locator('#linkV7MemberForm').count(),0);
   await page.locator('#addMember [name="name"]').fill('Synthetic manual member');
   await page.locator('#addMember [name="email"]').fill('manual@example.test');
   await page.locator('#addMember [name="plan"]').selectOption('standard');
   await page.locator('#addMember button').click();
   await page.locator('[data-member-card="synthetic-manual-member"]').waitFor();
   assert.ok((await page.locator('#generatedLineText').inputValue()).includes('スタンダードプラン'));
   assert.equal(await page.evaluate(()=>window.__fixture.calls.some(n=>n==='fs_admin_create_member')),false);
   await page.locator('[data-member-card="synthetic-manual-member"] [data-detail]').click();
   await page.locator('#editV7Plan').waitFor();
   await page.locator('#editV7Plan [name="plan"]').selectOption('premium');
   await page.locator('#editV7Plan button').click();
   await page.waitForFunction(()=>window.__fixture.members[0]?.plan==='premium');
   await page.waitForFunction(()=>document.querySelector('[data-member-card="synthetic-manual-member"]')?.textContent.includes('プレミアムプラン'));
   assert.deepEqual(errors,[]);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await page.screenshot({path:resolve(out,name+"-"+view+"-manual-plan.png"),fullPage:true});
   if(await page.locator("#adminSignOut").count()){
    await page.locator("#adminSignOut").click();
    await page.locator("#loginView").waitFor({state:"visible"});
    assert.equal(await page.evaluate(()=>window.__fixture.signedIn),false);
   }
   passed++;console.log("PASS "+passed+": "+name+" "+view+" manual registration/plan update/LINE copy/logout");
   await context.close();
  }
 }
 console.log("PASS TOTAL "+passed+" browser flows; all Auth/RPC responses synthetic, external requests blocked.");
}finally{await browser.close();await new Promise(r=>server.close(r));}
