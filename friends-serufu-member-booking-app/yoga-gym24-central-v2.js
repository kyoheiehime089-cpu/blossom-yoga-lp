const gyotokuYogaDb=window.supabase.createClient(window.GYOTOKU_SUPABASE_URL,window.GYOTOKU_SUPABASE_ANON_KEY);
let gyotokuYogaPass='',gyotokuYogaSnapshot={yoga_reservations:[],gym_reservations:[],closed_slots:[]};
const gyotokuYogaMinute=v=>v==='24:00'?1440:Number(String(v).split(':')[0])*60+Number(String(v).split(':')[1]);
const gyotokuYogaTime=m=>m===1440?'24:00':`${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
const gyotokuYogaOverlap=(a1,a2,b1,b2)=>Number(a1)<Number(b2)&&Number(b1)<Number(a2);
async function gyotokuYogaCall(name,args){const result=await gyotokuYogaDb.rpc(name,args);if(result.error)throw Error(result.error.message);if(!result.data?.ok)throw Error(result.data?.error||'処理に失敗しました');return result.data;}
function gyotokuYogaDate(){return document.querySelector('#yogaForm [name=date]')?.value||'';}
function gyotokuYogaDuration(){const start=gyotokuYogaMinute(document.querySelector('#yogaStart')?.value||'00:00'),end=gyotokuYogaMinute(document.querySelector('#yogaEnd')?.value||'00:40');return Math.max(10,end-start||40);}
function gyotokuYogaBlocked(date,start,end){
  const yogaStart=start-30,yogaEnd=end+30;
  const gymHit=(gyotokuYogaSnapshot.gym_reservations||[]).find(r=>String(r.date)===String(date)&&gyotokuYogaOverlap(yogaStart,yogaEnd,Number(r.start_minute),Number(r.start_minute)+Number(r.use_minutes||40)));
  if(gymHit)return true;
  const closedHit=(gyotokuYogaSnapshot.closed_slots||[]).find(c=>String(c.date)===String(date)&&gyotokuYogaOverlap(yogaStart,yogaEnd,Number(c.start_minute),Number(c.start_minute)+Number(c.block_minutes||50)));
  if(closedHit)return true;
  const yogaHit=(gyotokuYogaSnapshot.yoga_reservations||[]).find(y=>String(y.date)===String(date)&&gyotokuYogaOverlap(yogaStart,yogaEnd,Number(y.start_minute)-30,Number(y.end_minute)+30));
  return Boolean(yogaHit);
}
function gyotokuYogaTimes(preferred){
  const startEl=document.querySelector('#yogaStart'),date=gyotokuYogaDate(),duration=40;
  if(!startEl)return;
  const previous=preferred||startEl.value||'08:10';
  startEl.innerHTML='';
  for(let m=0;m+duration<=1440;m+=10){
    if(!gyotokuYogaBlocked(date,m,m+duration))startEl.add(new Option(`${gyotokuYogaTime(m)}〜${gyotokuYogaTime(m+duration)}`,gyotokuYogaTime(m)));
  }
  if([...startEl.options].some(o=>o.value===previous))startEl.value=previous;
  else if(startEl.options.length)startEl.selectedIndex=0;
  gyotokuYogaEnd();
}
function gyotokuYogaEnd(){
  const startEl=document.querySelector('#yogaStart'),endEl=document.querySelector('#yogaEnd');
  if(!startEl||!endEl||!startEl.value)return;
  const start=gyotokuYogaMinute(startEl.value);
  endEl.innerHTML='';
  const finish=Math.min(1440,start+40);
  endEl.add(new Option(gyotokuYogaTime(finish),gyotokuYogaTime(finish)));
  endEl.value=gyotokuYogaTime(finish);
}
function gyotokuYogaRender(){const list=document.querySelector('#yogaList');list.innerHTML=gyotokuYogaSnapshot.yoga_reservations.length?gyotokuYogaSnapshot.yoga_reservations.map(r=>`<article class="res"><h3>ヨガ個別予約</h3><p>${r.date} ${gyotokuYogaTime(r.start_minute)}〜${gyotokuYogaTime(r.end_minute)}</p><p>会員名：${r.member_name}</p><p>前後30分を予約不可</p><button class="danger" data-central-yoga-delete="${r.id}">削除</button></article>`).join(''):'<article class="res"><p>登録済み予約はありません。</p></article>';}
async function gyotokuYogaLoad(){const selected=document.querySelector('#yogaStart')?.value;gyotokuYogaSnapshot=await gyotokuYogaCall('fs_yoga_private_snapshot_central',{p_admin_password:gyotokuYogaPass});gyotokuYogaRender();gyotokuYogaTimes(selected);}
document.addEventListener('DOMContentLoaded',()=>{
  const date=document.querySelector('#yogaForm [name=date]');if(date&&!date.value)date.value=new Date().toISOString().slice(0,10);
  gyotokuYogaTimes();
  document.querySelector('#yogaOpen').onclick=async()=>{try{gyotokuYogaPass=document.querySelector('#yogaPass').value;await gyotokuYogaLoad();document.querySelector('#loginView').classList.add('hidden');document.querySelector('#yogaView').classList.remove('hidden');}catch(e){alert(e.message)}};
  document.querySelector('#reloadYoga').onclick=()=>gyotokuYogaLoad();
  document.querySelector('#yogaStart').onchange=gyotokuYogaEnd;
  date?.addEventListener('change',()=>gyotokuYogaTimes());
  document.querySelector('#yogaForm').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget),start=gyotokuYogaMinute(f.get('start')),end=gyotokuYogaMinute(f.get('end'));if(gyotokuYogaBlocked(f.get('date'),start,end)){gyotokuYogaTimes();alert('行徳ジム24の予約または利用不可時間の前後30分と重なるため選択できません。');return;}try{await gyotokuYogaCall('fs_yoga_private_create_central',{p_admin_password:gyotokuYogaPass,p_date:f.get('date'),p_start_minute:start,p_end_minute:end,p_member_name:f.get('memberName'),p_note:f.get('note')||''});await gyotokuYogaLoad();alert('登録完了しました');}catch(x){alert(x.message)}};
  document.addEventListener('click',async e=>{const b=e.target.closest('[data-central-yoga-delete]');if(!b)return;try{await gyotokuYogaCall('fs_yoga_private_delete_central',{p_admin_password:gyotokuYogaPass,p_id:b.dataset.centralYogaDelete});await gyotokuYogaLoad();}catch(x){alert(x.message)}});
});
