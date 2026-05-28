(()=>{
  const db=window.supabase.createClient(window.FRIENDS_SUPABASE_URL,window.FRIENDS_SUPABASE_ANON_KEY);
  const $=q=>document.querySelector(q);
  const pad=n=>String(n).padStart(2,'0');
  const fmt=m=>{m=Number(m);return m===1440?'24:00':pad(Math.floor(m/60))+':'+pad(m%60)};
  const jp=s=>{const d=new Date(s+'T00:00:00');return `${d.getMonth()+1}/${d.getDate()}（${'日月火水木金土'[d.getDay()]}）`};
  const full=(d,m)=>`${jp(d)} ${fmt(m)}〜${fmt(Number(m)+50)}`;
  let target=null;
  async function rpc(name,args){const {data,error}=await db.rpc(name,args);if(error)return{ok:false,error:error.message};return data||{ok:false,error:'応答がありません'};}
  function ensureDialog(){
    if($('#memberCalendarCancelDialog'))return;
    document.body.insertAdjacentHTML('beforeend',`<dialog id="memberCalendarCancelDialog" class="modal"><div class="modal-inner"><button class="close" type="button">×</button><p class="eyebrow">予約キャンセル確認</p><h2>この予約をキャンセルしますか？</h2><div id="memberCalendarCancelInfo" class="res"></div><p class="small">キャンセル後は予約枠が空き枠に戻ります。</p><label style="display:flex;gap:8px;align-items:flex-start"><input id="memberCalendarCancelAgree" type="checkbox" style="width:auto;margin-top:7px"> この予約をキャンセルすることを確認しました。</label><button id="memberCalendarCancelConfirm" class="btn" disabled>はい、キャンセルする</button></div></dialog>`);
    $('#memberCalendarCancelAgree').addEventListener('change',e=>{$('#memberCalendarCancelConfirm').disabled=!e.target.checked});
    $('#memberCalendarCancelConfirm').addEventListener('click',cancelTarget);
    $('#memberCalendarCancelDialog').addEventListener('click',e=>{if(e.target.classList.contains('close'))$('#memberCalendarCancelDialog').close()});
  }
  async function openCancel(slot){
    ensureDialog();
    const code=localStorage.getItem('fs_code')||'';
    const pin=localStorage.getItem('fs_pin')||'';
    const date=slot.dataset.d;
    const start=Number(slot.dataset.s);
    const snap=await rpc('fs_member_snapshot',{p_member_code:code,p_pin:pin});
    if(!snap.ok){alert(snap.error||'ログイン情報を確認できませんでした。');return;}
    const r=(snap.reservations||[]).find(x=>x.date===date&&Number(x.start_minute)===start);
    if(!r){alert('予約が見つかりません。画面を更新します。');location.reload();return;}
    target={id:r.id,date,start,code,pin};
    $('#memberCalendarCancelInfo').innerHTML=`<p><strong>日時：</strong>${full(date,start)}</p><p><strong>利用人数：</strong>${r.people||'1名'}</p>`;
    $('#memberCalendarCancelAgree').checked=false;
    $('#memberCalendarCancelConfirm').disabled=true;
    $('#memberCalendarCancelDialog').showModal();
  }
  async function cancelTarget(){
    if(!target)return;
    const r=await rpc('fs_member_cancel_reservation',{p_member_code:target.code,p_pin:target.pin,p_reservation_id:target.id});
    if(!r.ok){alert(r.error||'キャンセルできませんでした。');return;}
    $('#memberCalendarCancelDialog').close();
    alert('予約をキャンセルしました。');
    location.reload();
  }
  document.addEventListener('click',e=>{
    const slot=e.target.closest('.slot.mine');
    if(!slot)return;
    e.preventDefault();
    e.stopImmediatePropagation();
    openCancel(slot);
  },true);
})();