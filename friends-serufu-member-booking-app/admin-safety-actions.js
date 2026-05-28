(()=>{
  const db=window.supabase.createClient(window.FRIENDS_SUPABASE_URL,window.FRIENDS_SUPABASE_ANON_KEY);
  const $=q=>document.querySelector(q);
  const plans=['月4回プラン','月8回プラン','ファミリー月4回プラン','ファミリー月8回プラン'];
  let target=null;
  async function rpc(name,args){const {data,error}=await db.rpc(name,args);if(error)return{ok:false,error:error.message};return data||{ok:false,error:'応答がありません'};}
  function adminPass(){return document.getElementById('adminPass')?.value||'';}
  async function snapshot(){return await rpc('fs_admin_snapshot',{p_admin_password:adminPass()});}
  function ensureDialogs(){
    if(!$('#adminSafetyDialog')){
      document.body.insertAdjacentHTML('beforeend',`<dialog id="adminSafetyDialog" class="modal"><div class="modal-inner"><button class="close" type="button">×</button><p id="adminSafetyEyebrow" class="eyebrow">確認</p><h2 id="adminSafetyTitle"></h2><div id="adminSafetyInfo" class="res important"></div><label style="display:flex;gap:8px;align-items:flex-start"><input id="adminSafetyAgree" type="checkbox" style="width:auto;margin-top:7px"> <span id="adminSafetyAgreeText">内容を確認しました。</span></label><button id="adminSafetyConfirm" class="danger" disabled style="width:100%;margin-top:14px;min-height:48px">はい、実行する</button></div></dialog>`);
      $('#adminSafetyAgree').addEventListener('change',e=>{$('#adminSafetyConfirm').disabled=!e.target.checked});
      $('#adminSafetyConfirm').addEventListener('click',executeTarget);
      $('#adminSafetyDialog').addEventListener('click',e=>{if(e.target.classList.contains('close'))$('#adminSafetyDialog').close()});
    }
  }
  function openSafety(mode,member,extraHtml=''){
    ensureDialogs();
    target={mode,member};
    $('#adminSafetyEyebrow').textContent=mode==='grant'?'追加枠付与確認':'会員削除確認';
    $('#adminSafetyTitle').textContent=mode==='grant'?'追加枠を1枠付与しますか？':'この会員を削除しますか？';
    $('#adminSafetyInfo').innerHTML=`<p><strong>会員：</strong>${member.name}</p><p><strong>会員ID：</strong>${member.member_code}</p><p><strong>プラン：</strong>${member.plan}</p>${extraHtml}`;
    $('#adminSafetyAgreeText').textContent=mode==='grant'?'この会員に追加枠を1枠付与することを確認しました。':'この会員を削除することを確認しました。';
    $('#adminSafetyConfirm').textContent=mode==='grant'?'はい、1枠付与する':'はい、削除する';
    $('#adminSafetyAgree').checked=false;
    $('#adminSafetyConfirm').disabled=true;
    $('#adminSafetyDialog').showModal();
  }
  async function executeTarget(){
    if(!target)return;
    let r;
    if(target.mode==='grant'){
      r=await rpc('fs_admin_grant_slot',{p_admin_password:adminPass(),p_member_id:target.member.id});
      if(!r.ok){alert(r.error||'付与できませんでした。');return;}
      toast('追加枠を1枠付与しました');
    }else{
      r=await rpc('fs_admin_delete_member',{p_admin_password:adminPass(),p_member_id:target.member.id});
      if(!r.ok){alert(r.error||'削除できませんでした。');return;}
      toast('会員を削除しました');
    }
    $('#adminSafetyDialog').close();
    if(typeof window.loadSnapshot==='function') await window.loadSnapshot();
  }
  async function createInlineMember(form){
    const fd=new FormData(form);
    const r=await rpc('fs_admin_create_member',{p_admin_password:adminPass(),p_name:String(fd.get('name')||'').trim(),p_email:String(fd.get('email')||'').trim(),p_plan:String(fd.get('plan')||'').trim()});
    if(!r.ok){alert(r.error||'会員を追加できませんでした。');return;}
    toast('会員を追加しました');
    if(typeof window.loadSnapshot==='function') await window.loadSnapshot();
  }
  document.addEventListener('DOMContentLoaded',()=>{
    const add=document.getElementById('addMember');
    if(add){
      add.classList.remove('hidden');
      add.innerHTML=`<label>会員名<input name="name" placeholder="例：山田 太郎" required></label><label>メールアドレス<input name="email" type="email" placeholder="例：sample@example.com" required></label><label>プラン<select name="plan">${plans.map(p=>`<option>${p}</option>`).join('')}</select></label><button class="btn">この画面で会員を追加</button>`;
      add.addEventListener('submit',e=>{e.preventDefault();e.stopImmediatePropagation();createInlineMember(add);},true);
    }
  });
  document.addEventListener('click',async e=>{
    const grant=e.target.closest('[data-grant]');
    if(grant){
      e.preventDefault();e.stopImmediatePropagation();
      const snap=await snapshot();
      if(!snap.ok){alert(snap.error||'管理者情報を確認できませんでした。');return;}
      const m=(snap.members||[]).find(x=>x.id===grant.dataset.grant);
      if(!m){alert('会員が見つかりません。');return;}
      openSafety('grant',m);
      return;
    }
    const del=e.target.closest('[data-delete-member]');
    if(del){
      e.preventDefault();e.stopImmediatePropagation();
      const snap=await snapshot();
      if(!snap.ok){alert(snap.error||'管理者情報を確認できませんでした。');return;}
      const m=(snap.members||[]).find(x=>x.id===del.dataset.deleteMember);
      if(!m){alert('会員が見つかりません。');return;}
      const active=(snap.reservations||[]).filter(r=>r.member_id===m.id);
      if(active.length>0){alert(`この会員には予約が${active.length}件残っているため削除できません。先に予約をキャンセルしてください。`);return;}
      openSafety('delete',m,'<p><strong>残り予約：</strong>0件</p>');
    }
  },true);
})();