(()=>{
  const db=window.supabase.createClient(window.FRIENDS_SUPABASE_URL,window.FRIENDS_SUPABASE_ANON_KEY);
  const $=q=>document.querySelector(q);
  const plans=['月4回プラン','月8回プラン','ファミリー月4回プラン','ファミリー月8回プラン'];
  async function rpc(name,args){const {data,error}=await db.rpc(name,args);if(error)return{ok:false,error:error.message};return data||{ok:false,error:'応答がありません'};}
  function pass(){return document.getElementById('adminPass')?.value||sessionStorage.getItem('fs_admin_pass')||'';}
  function toast(msg){if(window.adminSoftToast)window.adminSoftToast(msg);else alert(msg)}
  function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));}
  function loginUrl(member){return 'https://kyoheiehime089-cpu.github.io/friends-member-reservation/friends-serufu-member-booking-app/?'+new URLSearchParams({mid:member.member_code,pin:member.pin}).toString()}
  function newMemberLineMessage(member){return `friendsセルフの会員登録が完了しました。

下記URLから予約画面にログインできます。

【会員用URL】
${loginUrl(member)}

【会員ID】
${member.member_code}

【ログインPIN】
${member.pin}

【プラン】
${member.plan}

予約は2週間先まで可能です。
同時に確保できる予約は最大2枠までです。`}
  function existingMemberLineMessage(member){return `friendsセルフの予約ログイン情報はこちらです。

下記URLから予約画面にログインできます。

【会員用URL】
${loginUrl(member)}

【会員ID】
${member.member_code}

【ログインPIN】
${member.pin}

【プラン】
${member.plan}

予約は2週間先まで可能です。
同時に確保できる予約は最大2枠までです。`}
  async function copyText(text){
    if(navigator.clipboard?.writeText){
      try{
        await navigator.clipboard.writeText(text);
        return true;
      }catch(e){
        // prompt fallback below
      }
    }
    window.prompt('コピーできない場合は、下記文面を選択してコピーしてください。',text);
    return false;
  }
  function setupAddForm(){
    const form=$('#addMember');
    if(!form||form.dataset.overrideReady==='1')return;
    form.dataset.overrideReady='1';
    form.innerHTML=`<label>会員名<input name="name" placeholder="例：山田 太郎" required></label><label>メールアドレス<input name="email" type="email" placeholder="例：sample@example.com" required></label><label>プラン<select name="plan">${plans.map(p=>`<option>${p}</option>`).join('')}</select></label><button class="btn" type="submit">この画面で会員を追加</button>`;
    form.addEventListener('submit',async e=>{
      e.preventDefault();
      e.stopImmediatePropagation();
      if(form.dataset.submitting==='1')return;
      const submitButton=form.querySelector('button[type="submit"]');
      form.dataset.submitting='1';
      if(submitButton)submitButton.disabled=true;
      try{
        const fd=new FormData(form);
        const r=await rpc('fs_admin_create_member',{p_admin_password:pass(),p_name:String(fd.get('name')||'').trim(),p_email:String(fd.get('email')||'').trim(),p_plan:String(fd.get('plan')||'').trim()});
        if(!r.ok){alert(r.error||'会員を追加できませんでした。');return;}
        const member=r.member;
        const message=newMemberLineMessage(member);
        const box=$('#generatedLogin');
        if(box){
          box.classList.remove('hidden');
          box.innerHTML=`<h3>LINE送信用文面</h3><p>会員ID：<strong>${esc(member.member_code)}</strong>　PIN：<strong>${esc(member.pin)}</strong></p><textarea id="generatedLineText" readonly rows="10" style="width:100%;min-height:220px;border:1px solid #d8c8b4;border-radius:16px;padding:14px;background:#fffdf8"></textarea><button type="button" class="btn" id="copyGeneratedLine">LINE文面コピー</button>`;
          $('#generatedLineText').value=message;
          $('#copyGeneratedLine').onclick=async()=>{await copyText(message);toast('LINE文面をコピーしました')};
        }
        form.reset();
        toast('会員を追加しました');
        if(typeof window.loadSnapshot==='function')await window.loadSnapshot();
      }finally{
        form.dataset.submitting='0';
        if(submitButton)submitButton.disabled=false;
      }
    },true);
  }
  document.addEventListener('DOMContentLoaded',setupAddForm);
  setTimeout(setupAddForm,800);
  document.addEventListener('click',async e=>{
    const copy=e.target.closest('[data-copy-login]');
    if(!copy)return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const id=copy.dataset.copyLogin;
    let member=null;
    if(window.snap&&Array.isArray(window.snap.members))member=window.snap.members.find(x=>x.id===id);
    if(!member){
      const s=await rpc('fs_admin_snapshot',{p_admin_password:pass()});
      if(s.ok)member=(s.members||[]).find(x=>x.id===id);
    }
    if(!member){alert('会員情報が見つかりません。');return;}
    await copyText(existingMemberLineMessage(member));
    toast('LINE文面をコピーしました');
  },true);
})();
