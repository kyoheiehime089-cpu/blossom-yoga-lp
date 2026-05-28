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
    if($('#adminCancelConfirmDialog'))return;
    document.body.insertAdjacentHTML('beforeend',`<dialog id="adminCancelConfirmDialog" class="modal"><div class="modal-inner"><button class="close" type="button">×</button><p class="eyebrow">管理者キャンセル確認</p><h2>この予約をキャンセルしますか？</h2><div id="adminCancelConfirmInfo" class="res important"></div><p class="small">誤操作防止のため、内容を確認してチェックを入れた場合のみキャンセルできます。</p><label style="display:flex;gap:8px;align-items:flex-start"><input id="adminCancelConfirmAgree" type="checkbox" style="width:auto;margin-top:7px"> この予約をキャンセルすることを確認しました。</label><button id="adminCancelConfirmButton" class="danger" disabled style="width:100%;margin-top:14px;min-height:48px">はい、キャンセルする</button></div></dialog>`);
    $('#adminCancelConfirmAgree').addEventListener('change',e=>{$('#adminCancelConfirmButton').disabled=!e.target.checked});
    $('#adminCancelConfirmButton').addEventListener('click',doCancel);
    $('#adminCancelConfirmDialog').addEventListener('click',e=>{if(e.target.classList.contains('close'))$('#adminCancelConfirmDialog').close()});
  }
  async function snapshot(pass){return await rpc('fs_admin_snapshot',{p_admin_password:pass});}
  async function openConfirm(id){
    ensureDialog();
    const pass=document.getElementById('adminPass')?.value||'';
    const snap=await snapshot(pass);
    if(!snap.ok){alert(snap.error||'管理者情報を確認できませんでした。');return;}
    const r=(snap.reservations||[]).find(x=>x.id===id);
    if(!r){alert('予約が見つかりません。画面を更新します。');if(typeof window.loadSnapshot==='function')window.loadSnapshot();return;}
    target={id,pass};
    $('#adminCancelConfirmInfo').innerHTML=`<p><strong>会員：</strong>${r.member_name||''}</p><p><strong>日時：</strong>${full(r.date,r.start_minute)}</p><p><strong>利用人数：</strong>${r.people||'1名'}</p>`;
    $('#adminCancelConfirmAgree').checked=false;
    $('#adminCancelConfirmButton').disabled=true;
    $('#adminCancelConfirmDialog').showModal();
  }
  async function doCancel(){
    if(!target)return;
    const r=await rpc('fs_admin_cancel_reservation',{p_admin_password:target.pass,p_reservation_id:target.id});
    if(!r.ok){alert(r.error||'キャンセルできませんでした。');return;}
    $('#adminCancelConfirmDialog').close();
    alert('予約をキャンセルしました。');
    if(typeof window.loadSnapshot==='function'){
      await window.loadSnapshot();
    }else{
      const active=document.querySelector('.tab.active')?.dataset?.tab||'dashboard';
      sessionStorage.setItem('fs_admin_return_tab',active);
      location.reload();
    }
  }
  document.addEventListener('click',e=>{
    const btn=e.target.closest('[data-cancel]');
    if(!btn)return;
    e.preventDefault();
    e.stopImmediatePropagation();
    openConfirm(btn.dataset.cancel);
  },true);
})();