(()=>{
  const db=window.supabase.createClient(window.FRIENDS_SUPABASE_URL,window.FRIENDS_SUPABASE_ANON_KEY);
  const $=q=>document.querySelector(q);
  const pad=n=>String(n).padStart(2,'0');
  const USE_MINUTES=50;
  const fmt=m=>{m=Number(m);let prefix=m>=1440?'翌':'';m=((m%1440)+1440)%1440;return prefix+pad(Math.floor(m/60))+':'+pad(m%60)};
  const jp=s=>{const d=new Date(s+'T00:00:00');return `${d.getMonth()+1}/${d.getDate()}（${'日月火水木金土'[d.getDay()]}）`};
  const full=(d,m)=>`${jp(d)} ${fmt(m)}〜${fmt(Number(m)+USE_MINUTES)}`;
  const startDate=(d,m)=>{const x=new Date(d+'T00:00:00');x.setMinutes(Number(m));return x};
  let target=null;
  async function rpc(name,args){const {data,error}=await db.rpc(name,args);if(error)return{ok:false,error:error.message};return data||{ok:false,error:'応答がありません'};}
  function ensureDialog(){
    if($('#memberCalendarCancelDialog'))return;
    document.body.insertAdjacentHTML('beforeend',`<dialog id="memberCalendarCancelDialog" class="modal"><div class="modal-inner"><button class="close" type="button">×</button><p class="eyebrow">予約キャンセル確認</p><h2>この予約をキャンセルしますか？</h2><div id="memberCalendarCancelInfo" class="res"></div><p class="small">キャンセル後は予約枠が空き枠に戻ります。</p><label style="display:flex;gap:8px;align-items:flex-start"><input id="memberCalendarCancelAgree" type="checkbox" style="width:auto;margin-top:7px"> この予約をキャンセルすることを確認しました。</label><button id="memberCalendarCancelConfirm" class="btn" disabled>はい、キャンセルする</button></div></dialog>`);
    $('#memberCalendarCancelAgree').addEventListener('change',e=>{$('#memberCalendarCancelConfirm').disabled=!e.target.checked});
    $('#memberCalendarCancelConfirm').addEventListener('click',cancelTarget);
    $('#memberCalendarCancelDialog').addEventListener('click',e=>{if(e.target.classList.contains('close'))$('#memberCalendarCancelDialog').close()});
  }
  async function getSnapshot(){
    const code=localStorage.getItem('fs_code')||'';
    const pin=localStorage.getItem('fs_pin')||'';
    const snap=await rpc('fs_member_snapshot',{p_member_code:code,p_pin:pin});
    return {snap,code,pin};
  }
  function showCancel(r,code,pin){
    ensureDialog();
    target={id:r.id,date:r.date,start:Number(r.start_minute),code,pin};
    $('#memberCalendarCancelInfo').innerHTML=`<p><strong>日時：</strong>${full(r.date,r.start_minute)}</p><p><strong>利用人数：</strong>${r.people||'1名'}</p>`;
    $('#memberCalendarCancelAgree').checked=false;
    $('#memberCalendarCancelConfirm').disabled=true;
    $('#memberCalendarCancelDialog').showModal();
  }
  async function openCancelFromSlot(slot){
    const {snap,code,pin}=await getSnapshot();
    if(!snap.ok){alert(snap.error||'ログイン情報を確認できませんでした。');return;}
    const date=slot.dataset.d;
    const start=Number(slot.dataset.s);
    const r=(snap.reservations||[]).find(x=>x.date===date&&Number(x.start_minute)===start);
    if(!r){alert('予約が見つかりません。画面を更新します。');if(typeof window.loadSnapshot==='function') await window.loadSnapshot();return;}
    showCancel(r,code,pin);
  }
  async function openCancelFromNext(){
    const {snap,code,pin}=await getSnapshot();
    if(!snap.ok){alert(snap.error||'ログイン情報を確認できませんでした。');return;}
    const future=(snap.reservations||[]).filter(r=>startDate(r.date,r.start_minute)>new Date()).sort((a,b)=>startDate(a.date,a.start_minute)-startDate(b.date,b.start_minute));
    const r=future[0];
    if(!r){alert('キャンセルできる次回予約がありません。');return;}
    showCancel(r,code,pin);
  }
  async function cancelTarget(){
    if(!target)return;
    const r=await rpc('fs_member_cancel_reservation',{p_member_code:target.code,p_pin:target.pin,p_reservation_id:target.id});
    if(!r.ok){alert(r.error||'キャンセルできませんでした。');return;}
    $('#memberCalendarCancelDialog').close();
    alert('予約をキャンセルしました。');
    if(typeof window.loadSnapshot==='function') await window.loadSnapshot();
  }
  document.addEventListener('click',e=>{
    const slot=e.target.closest('.slot.mine');
    if(slot){
      e.preventDefault();
      e.stopImmediatePropagation();
      openCancelFromSlot(slot);
      return;
    }
    const next=e.target.closest('#nextReservation');
    if(next&&next.querySelector('h3')){
      e.preventDefault();
      e.stopImmediatePropagation();
      openCancelFromNext();
    }
  },true);
})();