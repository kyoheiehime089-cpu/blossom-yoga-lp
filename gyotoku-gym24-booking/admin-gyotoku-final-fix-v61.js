(()=>{
  const db=window.supabase.createClient(window.FRIENDS_SUPABASE_URL,window.FRIENDS_SUPABASE_ANON_KEY);
  const plans=[
    {value:'free',label:'無料プラン'},
    {value:'standard',label:'スタンダードプラン'},
    {value:'premium',label:'プレミアムプラン'}
  ];
  const $=q=>document.querySelector(q);
  const pass=()=>$('#adminPass')?.value||sessionStorage.getItem('fs_admin_pass')||'';
  const toast=msg=>window.adminSoftToast?window.adminSoftToast(msg):alert(msg);
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
  async function rpc(name,args){const {data,error}=await db.rpc(name,args);if(error)return{ok:false,error:error.message};return data||{ok:false,error:'応答がありません'};}
  function loginUrl(member){return 'https://kyoheiehime089-cpu.github.io/blossom-yoga-lp/gyotoku-gym24-booking/?'+new URLSearchParams({mid:member.member_code,pin:member.pin}).toString();}
  function lineMessage(member){return `行徳ジム24の会員登録が完了しました。\n\n【会員用URL】\n${loginUrl(member)}\n\n【会員ID】\n${member.member_code}\n\n【ログインPIN】\n${member.pin}\n\n【プラン】\n${plans.find(p=>p.value===member.plan)?.label||member.plan}\n\n予約は2週間先まで可能です。`;}
  function install(){
    const old=$('#addMember');
    if(!old||old.dataset.g24Final==='1')return;
    const form=old.cloneNode(false);
    form.id='addMember';form.className='mini';form.dataset.g24Final='1';
    form.innerHTML=`<label>会員名<input name="name" placeholder="例：山田 太郎" required></label><label>メールアドレス<input name="email" type="email" placeholder="例：sample@example.com" required></label><label>プラン<select name="plan">${plans.map(p=>`<option value="${p.value}">${p.label}</option>`).join('')}</select></label><button class="btn" type="submit">この画面で会員を追加</button>`;
    old.replaceWith(form);
    form.addEventListener('submit',async e=>{
      e.preventDefault();
      const fd=new FormData(form);const btn=form.querySelector('button');btn.disabled=true;
      try{
        const r=await rpc('fs_admin_create_member',{p_admin_password:pass(),p_name:String(fd.get('name')||'').trim(),p_email:String(fd.get('email')||'').trim(),p_plan:String(fd.get('plan')||'').trim()});
        if(!r.ok)return alert(r.error||'会員を追加できませんでした。');
        const member=r.member;const msg=lineMessage(member);const box=$('#generatedLogin');
        if(box){box.classList.remove('hidden');box.innerHTML=`<h3>LINE送信用文面</h3><p>会員ID：<strong>${esc(member.member_code)}</strong>　PIN：<strong>${esc(member.pin)}</strong></p><textarea id="generatedLineText" readonly rows="10" style="width:100%;min-height:220px;border:1px solid #d8c8b4;border-radius:16px;padding:14px;background:#fffdf8"></textarea><button type="button" class="btn" id="copyGeneratedLine">LINE文面コピー</button>`;$('#generatedLineText').value=msg;$('#copyGeneratedLine').onclick=async()=>{await navigator.clipboard.writeText(msg);toast('LINE文面をコピーしました');};}
        form.reset();toast('会員を追加しました');if(typeof window.loadSnapshot==='function')await window.loadSnapshot();
      }finally{btn.disabled=false;}
    });
  }
  document.addEventListener('DOMContentLoaded',()=>setTimeout(install,0));
  setTimeout(install,900);setTimeout(install,1500);
})();
