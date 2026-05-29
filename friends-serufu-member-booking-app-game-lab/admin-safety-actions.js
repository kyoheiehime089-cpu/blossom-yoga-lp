(()=>{
  const db=window.supabase.createClient(window.FRIENDS_SUPABASE_URL,window.FRIENDS_SUPABASE_ANON_KEY);
  const $=q=>document.querySelector(q);
  let target=null;
  async function rpc(name,args){const {data,error}=await db.rpc(name,args);if(error)return{ok:false,error:error.message};return data||{ok:false,error:'応答がありません'};}
  function adminPass(){return document.getElementById('adminPass')?.value||sessionStorage.getItem('fs_admin_pass')||'';}
  function toast(msg){if(window.adminSoftToast)window.adminSoftToast(msg);else alert(msg)}
  function currentMember(id){return (window.snap?.members||[]).find(m=>m.id===id)}
  function activeReservations(id){return (window.snap?.reservations||[]).filter(r=>r.member_id===id)}
  function ensureDialog(){
    if($('#adminSafetyDialog'))return;
    document.body.insertAdjacentHTML('beforeend',`<dialog id="adminSafetyDialog" class="modal"><div class="modal-inner"><button class="close" type="button">×</button><p id="adminSafetyEyebrow" class="eyebrow">確認</p><h2 id="adminSafetyTitle"></h2><div id="adminSafetyInfo" class="res important"></div><label style="display:flex;gap:8px;align-items:flex-start"><input id="adminSafetyAgree" type="checkbox" style="width:auto;margin-top:7px"> <span id="adminSafetyAgreeText">内容を確認しました。</span></label><button id="adminSafetyConfirm" class="danger" disabled style="width:100%;margin-top:14px;min-height:48px">はい、実行する</button></div></dialog>`);
    $('#adminSafetyAgree').addEventListener('change',e=>{$('#adminSafetyConfirm').disabled=!e.target.checked});
    $('#adminSafetyConfirm').addEventListener('click',executeTarget);
    $('#adminSafetyDialog').addEventListener('click',e=>{if(e.target.classList.contains('close'))$('#adminSafetyDialog').close()});
  }
  function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));}
  function openSafety(mode,member,extraHtml=''){
    ensureDialog();
    target={mode,member};
    $('#adminSafetyEyebrow').textContent=mode==='grant'?'追加枠付与確認':'会員削除確認';
    $('#adminSafetyTitle').textContent=mode==='grant'?'追加枠を1枠付与しますか？':'この会員を削除しますか？';
    $('#adminSafetyInfo').innerHTML=`<p><strong>会員：</strong>${esc(member.name)}</p><p><strong>会員ID：</strong>${esc(member.member_code)}</p><p><strong>プラン：</strong>${esc(member.plan)}</p>${extraHtml}`;
    $('#adminSafetyAgreeText').textContent=mode==='grant'?'この会員に追加枠を1枠付与することを確認しました。':'この会員を削除することを確認しました。';
    $('#adminSafetyConfirm').textContent=mode==='grant'?'はい、1枠付与する':'はい、削除する';
    $('#adminSafetyAgree').checked=false;
    $('#adminSafetyConfirm').disabled=true;
    $('#adminSafetyDialog').showModal();
  }
  async function executeTarget(){
    if(!target)return;
    $('#adminSafetyConfirm').disabled=true;
    const r=target.mode==='grant'
      ? await rpc('fs_admin_grant_slot',{p_admin_password:adminPass(),p_member_id:target.member.id})
      : await rpc('fs_admin_delete_member',{p_admin_password:adminPass(),p_member_id:target.member.id});
    if(!r.ok){alert(r.error||'実行できませんでした。');$('#adminSafetyConfirm').disabled=false;return;}
    $('#adminSafetyDialog').close();
    toast(target.mode==='grant'?'追加枠を1枠付与しました':'会員を削除しました');
    if(typeof window.loadSnapshot==='function')await window.loadSnapshot();
    target=null;
  }
  document.addEventListener('click',e=>{
    const grant=e.target.closest('[data-grant]');
    if(grant){
      e.preventDefault();e.stopImmediatePropagation();
      const m=currentMember(grant.dataset.grant);
      if(!m){alert('会員が見つかりません。');return;}
      openSafety('grant',m);
      return;
    }
    const del=e.target.closest('[data-delete-member]');
    if(del){
      e.preventDefault();e.stopImmediatePropagation();
      const m=currentMember(del.dataset.deleteMember);
      if(!m){alert('会員が見つかりません。');return;}
      const active=activeReservations(m.id);
      if(active.length>0){alert(`この会員には予約が${active.length}件残っているため削除できません。先に予約をキャンセルしてください。`);return;}
      openSafety('delete',m,'<p><strong>残り予約：</strong>0件</p>');
    }
  },true);
})();
