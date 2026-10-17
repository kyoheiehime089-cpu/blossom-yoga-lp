import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,dirname,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);let playwright;
try{playwright=require('playwright');}catch{playwright=require('C:/Users/shins/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');}
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const server=createServer(async(req,res)=>{try{const path=resolve(root,'.'+new URL(req.url,'http://127.0.0.1').pathname.replace(/\/$/,'/index.html'));if(!path.startsWith(root+'/')&&!path.startsWith(root+'\\'))throw Error();if(!types[extname(path)])throw Error();res.writeHead(200,{'Content-Type':types[extname(path)]});res.end(await readFile(path));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=await playwright.chromium.launch({channel:'msedge',headless:true});let passed=0;
const output=resolve(root,'tests/results/2026-10-17/member-release');await mkdir(output,{recursive:true});
try{
 for(const [view,width,height] of [['desktop',1280,900],['mobile',390,844]]){
  for(const mode of ['free','standard','premium','legacy-free','legacy-standard','legacy-premium']){
   const isNew=!mode.startsWith('legacy-'),plan=mode.replace('legacy-','');
   const settings={use_minutes:isNew?50:plan==='free'?40:45,monthly_quota:isNew?{free:4,standard:8,premium:12}[plan]:plan==='free'?8:plan==='standard'?7:null,concurrent_limit:plan==='free'?1:2,daily_limit:1,booking_days:isNew?14:plan==='free'?7:14,is_configured:true};
   const fixture={ok:true,member:{id:'synthetic-member',name:'Synthetic member',plan,member_code:'SYNTHETIC',status:'active',member_status:'active',...(isNew?{membership_cohort:'paid_v7',agreement_version:'agreement-2026-10-13-paid-v7',activation_gates:{operatorApproved:true}}:{})},plan_settings:settings,registered_users:[{id:'synthetic-holder',name:'Synthetic member',is_contract_holder:true,is_active:true}],reservations:[],booked_slots:[],closed_slots:[],external_blocks:[]};
   if(isNew){
    fixture.reservations=Array.from({length:settings.monthly_quota},(_,i)=>({id:'used-'+i,date:'2026-10-'+String(i+1).padStart(2,'0'),start_minute:600,use_minutes_snapshot:50,visit_outcome:'attended',cancelled:false}));
    fixture.booking_policy={cohort:'paid_v7',agreement_version:'agreement-2026-10-13-paid-v7',rpc_contract_version:'paid-v7-booking-v1',reservation_scope:'fpl-gym24-central-yoga-v1',member_snapshot_rpc:'fs_v7_member_snapshot',admin_snapshot_rpc:'fs_v7_admin_snapshot',admin_create_member_rpc:'fs_v7_admin_create_member',admin_update_plan_rpc:'fs_v7_admin_update_plan',admin_confirm_companion_safety_rpc:'fs_v7_admin_confirm_companion_safety',member_add_companion_rpc:'fs_v7_member_add_companion',member_create_rpc:'fs_v7_member_create_reservation',member_cancel_rpc:'fs_v7_member_cancel_reservation',admin_create_rpc:'fs_v7_admin_create_reservation',admin_cancel_rpc:'fs_v7_admin_cancel_reservation',server_enforced:true,activation_gates_enforced:true,late_cancellation_consumption_enforced:true,shared_booking_store:'single_database',cross_system_yoga_gym_buffer_enforced:true,admin_proxy_server_enforced:true,member_usage_complete:true,companion_safety_enforced:true,member_creation_server_enforced:true,availability:{complete:true,all_reservations:[],yoga_blocks:[],closed_slots:[],external_blocks:[],fixed_schedule_days:Array.from({length:15},(_,i)=>new Date(Date.UTC(2026,9,25+i)).toISOString().slice(0,10)),fixed_blocks:[{date:'2026-11-08',start_minute:480,end_minute:600}]}};
   }
   const context=await browser.newContext({viewport:{width,height},timezoneId:'America/Los_Angeles',serviceWorkers:'block'});
   await context.addInitScript(()=>{const D=Date;const t=D.parse('2026-10-25T03:00:00Z');window.Date=class extends D{constructor(...args){super(...(args.length?args:[t]));}static now(){return t;}};});
   await context.route('**/*',async route=>{const u=new URL(route.request().url());if(u.hostname==='cdn.jsdelivr.net')return route.fulfill({contentType:'text/javascript',body:`window.__test={calls:[],snapshot:${JSON.stringify(fixture)}};window.supabase={createClient:()=>({rpc:async(name,args)=>{const f=window.__test;f.calls.push(name);if(name==='fs_v7_member_snapshot')return {data:${isNew?'f.snapshot':"{ok:false,code:'not_v7'}"},error:null};if(name==='fs_member_snapshot')return{data:f.snapshot,error:null};if(name==='fs_yoga_public_blocks')return{data:{ok:true,blocks:[]},error:null};if(name==='fs_v7_member_create_reservation'){f.lastBooking=args;f.snapshot.reservations.push({id:'synthetic-new-booking',date:args.p_date,start_minute:args.p_start_minute,use_minutes_snapshot:50,visit_outcome:'reserved',cancelled:false});return{data:{ok:true,id:'synthetic-new-booking'},error:null};}return {data:{ok:true},error:null};}})};`});if(u.origin!==origin)return route.abort();if(u.pathname.endsWith('/supabase-config.js'))return route.fulfill({contentType:'text/javascript',body:"window.GYOTOKU_SUPABASE_URL='https://synthetic.invalid';window.GYOTOKU_SUPABASE_ANON_KEY='synthetic-only';"});return route.continue();});
   const page=await context.newPage(),errors=[];page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
   console.log(`START ${mode} ${view}`);
   await page.goto(origin+'/',{waitUntil:'networkidle'});await page.locator('#memberId').fill('SYNTHETIC');await page.locator('#pin').fill('synthetic-pin');await page.getByRole('button',{name:'ログインする',exact:true}).click();await page.locator('#appView').waitFor({state:'visible'});
   assert.equal(await page.locator('#extraSlots').textContent(),settings.use_minutes+'分利用');
   if(isNew){
    await page.locator('#nextWeek').click();await page.locator('#nextWeek').click();
    assert.equal(await page.locator('#days [data-day="0"]').isDisabled(),false);assert.equal(await page.locator('#days [data-day="1"]').isDisabled(),true);
    assert.match(await page.locator('#usageText').textContent(),/2026-11：0/);
    assert.equal(await page.locator('#startSelect option[value="600"]').count(),0);assert.equal(await page.locator('#startSelect option[value="610"]').count(),1);
    await page.locator('#startSelect').selectOption('610');await page.getByRole('button',{name:'この時間で予約する',exact:true}).click();await page.getByRole('button',{name:'この枠を予約する',exact:true}).click();
    await page.waitForFunction(()=>window.__test.lastBooking?.p_date==='2026-11-08');assert.equal(await page.evaluate(()=>window.__test.lastBooking.p_start_minute),610);
    assert.equal(await page.evaluate(()=>window.__test.calls.includes('fs_member_create_reservation_v2')),false);
   }else{
    assert.equal(await page.locator('#companionManager').isVisible(),plan!=='free');
    assert.equal(await page.locator('#memberQuota').textContent(),settings.monthly_quota==null?'月の予約回数：制限なし':`月の予約回数：${settings.monthly_quota}回まで`);
    assert.equal(await page.evaluate(()=>window.__test.calls.includes('fs_member_snapshot')),true);
   }
   assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await page.screenshot({path:resolve(output,mode+'-'+view+'.png'),fullPage:true});
   console.log(`PASS ${++passed}: ${mode} ${view} ${isNew?'JST/day14/month-boundary/fixed-block/booking':'existing effective conditions unchanged'}`);await context.close();
  }
 }
}finally{await browser.close();await new Promise(r=>server.close(r));}
console.log(`PASS TOTAL ${passed} synthetic member browser flows; no production requests.`);
