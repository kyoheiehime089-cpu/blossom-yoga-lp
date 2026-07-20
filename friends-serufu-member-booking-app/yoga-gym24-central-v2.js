const gyotokuYogaDb=window.supabase.createClient(window.GYOTOKU_SUPABASE_URL,window.GYOTOKU_SUPABASE_ANON_KEY);
let gyotokuYogaPass='',gyotokuYogaSnapshot={yoga_reservations:[],gym_reservations:[],closed_slots:[]};
const GYOTOKU_YOGA_HOLIDAYS=['2026-01-01','2026-01-12','2026-02-11','2026-02-23','2026-03-20','2026-04-29','2026-05-03','2026-05-04','2026-05-05','2026-05-06','2026-07-20','2026-08-11','2026-09-21','2026-09-22','2026-09-23','2026-10-12','2026-11-03','2026-11-23'];
const gyotokuYogaMinute=v=>v==='24:00'?1440:Number(String(v).split(':')[0])*60+Number(String(v).split(':')[1]);
const gyotokuYogaTime=m=>m===1440?'24:00':`${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
const gyotokuYogaEsc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const gyotokuYogaOverlap=(aStart,aEnd,bStart,bEnd)=>Number(aStart)<Number(bEnd)&&Number(bStart)<Number(aEnd);
function gyotokuYogaFixedBlocks(date){
  const day=new Date(`${date}T00:00:00`).getDay();
  if(GYOTOKU_YOGA_HOLIDAYS.includes(date))return[[510,820,'通常ヨガ／セミパーソナル枠']];
  if(day===1)return[[510,610,'通常ヨガ'],[1080,1330,'セミパーソナル']];
  if(day===2){
    const blocks=[[720,820,'通常ヨガ'],[1080,1330,'セミパーソナル']];
    if(date<'2026-09-01')blocks.unshift([510,610,'通常ヨガ']);
    return blocks;
  }
  if(day===3)return[[1080,1330,'セミパーソナル']];
  if(day===4)return[[690,790,'通常ヨガ'],[1215,1315,'通常ヨガ']];
  if(day===5)return[[1080,1330,'セミパーソナル']];
  if(day===6||day===0)return[[460,820,'通常ヨガ／セミパーソナル枠']];
  return[];
}
async function gyotokuYogaCall(name,args){const r=await gyotokuYogaDb.rpc(name,args);if(r.error)throw Error(r.error.message);if(!r.data?.ok)throw Error(r.data?.error||'処理に失敗しました');return r.data;}
function gyotokuYogaDate(){return document.querySelector('#yogaForm [name=date]')?.value||'';}
function gyotokuYogaEnd(){const s=document.querySelector('#yogaStart'),e=document.querySelector('#yogaEnd');if(!s||!e||!s.value)return;const end=Math.min(1440,gyotokuYogaMinute(s.value)+40);e.innerHTML='';e.add(new Option(gyotokuYogaTime(end),gyotokuYogaTime(end)));}
function gyotokuYogaUnavailableBlocks(date){
  const fixed=gyotokuYogaFixedBlocks(date).map(([start_minute,end_minute,reason])=>({start_minute,end_minute,reason}));
  const gym=(gyotokuYogaSnapshot.gym_reservations||[]).filter(r=>String(r.date).slice(0,10)===date).map(r=>({start_minute:Number(r.start_minute),end_minute:Number(r.end_minute??Number(r.start_minute)+50),reason:'行徳ジム24予約'}));
  const closed=(gyotokuYogaSnapshot.closed_slots||[]).filter(r=>String(r.date).slice(0,10)===date).map(r=>({start_minute:Number(r.start_minute),end_minute:Number(r.end_minute??Number(r.start_minute)+Number(r.block_minutes||50)),reason:r.reason?`利用不可枠（${r.reason}）`:'利用不可枠'}));
  const privateYoga=(gyotokuYogaSnapshot.yoga_reservations||[]).filter(r=>String(r.date).slice(0,10)===date).map(r=>({start_minute:Number(r.start_minute)-30,end_minute:Number(r.end_minute)+30,reason:'ヨガ個別予約（前後30分を含む）'}));
  return[...fixed,...gym,...closed,...privateYoga].sort((a,b)=>a.start_minute-b.start_minute||a.end_minute-b.end_minute);
}
function gyotokuYogaRenderUnavailable(){
  const box=document.querySelector('#yogaUnavailable'),date=gyotokuYogaDate();
  if(!box||!date)return;
  const blocks=gyotokuYogaUnavailableBlocks(date);
  box.innerHTML=blocks.length?`<div class="unavailable-list">${blocks.map(b=>`<div class="unavailable-row"><strong>${gyotokuYogaTime(Math.max(0,b.start_minute))}〜${gyotokuYogaTime(Math.min(1440,b.end_minute))}</strong><span class="reason-label">${gyotokuYogaEsc(b.reason)}</span></div>`).join('')}</div>`:'<p>この日の予約不可時間はありません。</p>';
}
async function gyotokuYogaTimes(preferred=''){
  const s=document.querySelector('#yogaStart'),date=gyotokuYogaDate();if(!s||!date||!gyotokuYogaPass)return;
  s.disabled=true;s.innerHTML='<option>空き時間を確認中...</option>';
  const d=await gyotokuYogaCall('fs_yoga_available_starts',{p_admin_password:gyotokuYogaPass,p_date:date,p_duration_minutes:40});
  const fixed=gyotokuYogaFixedBlocks(date);
  const starts=(d.starts||[]).map(Number).filter(start=>!fixed.some(([blockStart,blockEnd])=>gyotokuYogaOverlap(start,start+40,blockStart,blockEnd)));
  s.innerHTML='';starts.forEach(m=>s.add(new Option(`${gyotokuYogaTime(m)}〜${gyotokuYogaTime(m+40)}`,gyotokuYogaTime(m))));
  if(preferred&&[...s.options].some(o=>o.value===preferred))s.value=preferred;else if(s.options.length)s.selectedIndex=0;else s.add(new Option('予約できる時間がありません',''));
  s.disabled=!starts.length;gyotokuYogaEnd();gyotokuYogaRenderUnavailable();
}
function gyotokuYogaRender(){const l=document.querySelector('#yogaList');l.innerHTML=gyotokuYogaSnapshot.yoga_reservations.length?gyotokuYogaSnapshot.yoga_reservations.map(r=>`<article class="res"><h3>ヨガ個別予約</h3><p>${String(r.date).slice(0,10)} ${gyotokuYogaTime(r.start_minute)}〜${gyotokuYogaTime(r.end_minute)}</p><p>会員名：${gyotokuYogaEsc(r.member_name)}</p><p>前後30分を予約不可</p><button class="danger" data-central-yoga-delete="${r.id}">削除</button></article>`).join(''):'<article class="res"><p>登録済み予約はありません。</p></article>';gyotokuYogaRenderUnavailable();}
async function gyotokuYogaLoad(){const prev=document.querySelector('#yogaStart')?.value||'';gyotokuYogaSnapshot=await gyotokuYogaCall('fs_yoga_private_snapshot_central',{p_admin_password:gyotokuYogaPass});gyotokuYogaRender();await gyotokuYogaTimes(prev);}
document.addEventListener('DOMContentLoaded',()=>{const date=document.querySelector('#yogaForm [name=date]');if(date&&!date.value)date.value=new Date().toISOString().slice(0,10);document.querySelector('#yogaOpen').onclick=async()=>{try{gyotokuYogaPass=document.querySelector('#yogaPass').value.trim();await gyotokuYogaLoad();document.querySelector('#loginView').classList.add('hidden');document.querySelector('#yogaView').classList.remove('hidden');}catch(e){alert(e.message)}};document.querySelector('#reloadYoga').onclick=()=>gyotokuYogaLoad().catch(e=>alert(e.message));document.querySelector('#yogaStart').onchange=gyotokuYogaEnd;date?.addEventListener('change',()=>gyotokuYogaTimes().catch(e=>alert(e.message)));document.querySelector('#yogaForm').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget),start=gyotokuYogaMinute(f.get('start'));try{const fixed=gyotokuYogaFixedBlocks(f.get('date'));if(fixed.some(([blockStart,blockEnd])=>gyotokuYogaOverlap(start,start+40,blockStart,blockEnd)))return alert('通常ヨガまたはセミパーソナルの既存枠と重なるため登録できません。');const latest=await gyotokuYogaCall('fs_yoga_available_starts',{p_admin_password:gyotokuYogaPass,p_date:f.get('date'),p_duration_minutes:40});if(!(latest.starts||[]).map(Number).includes(start)){await gyotokuYogaTimes();return alert('この時間は選択できません。');}await gyotokuYogaCall('fs_yoga_private_create_central',{p_admin_password:gyotokuYogaPass,p_date:f.get('date'),p_start_minute:start,p_end_minute:start+40,p_member_name:f.get('memberName'),p_note:f.get('note')||''});await gyotokuYogaLoad();alert('登録完了しました');}catch(x){await gyotokuYogaTimes().catch(()=>{});alert(x.message)}};document.addEventListener('click',async e=>{const b=e.target.closest('[data-central-yoga-delete]');if(!b)return;try{await gyotokuYogaCall('fs_yoga_private_delete_central',{p_admin_password:gyotokuYogaPass,p_id:b.dataset.centralYogaDelete});await gyotokuYogaLoad();}catch(x){alert(x.message)}});});