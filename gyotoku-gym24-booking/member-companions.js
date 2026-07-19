// 会員ホーム：スタンダード・プレミアムの同伴者登録
(function(){
  function currentPlan(){return String(snapshot?.member?.plan||'free').toLowerCase();}
  function companions(){return (snapshot?.registered_users||[]).filter(user=>!user.is_contract_holder);}
  function renderCompanions(){
    const manager=document.querySelector('#companionManager');
    const list=document.querySelector('#companionList');
    if(!manager||!list||!snapshot)return;
    const eligible=['standard','premium'].includes(currentPlan());
    manager.classList.toggle('hidden',!eligible);
    if(!eligible)return;
    const users=companions();
    const forms=users.map((user,index)=>`<form class="res member-companion-form" data-user-id="${escapeHtml(user.id)}"><h3>同伴者${index+1}</h3><label>氏名<input name="name" value="${escapeHtml(user.name)}" maxlength="80" required></label><label><input type="checkbox" name="active" ${user.is_active?'checked':''}> 予約時に選択できる状態にする</label><button class="btn">この同伴者を保存</button></form>`).join('');
    const add=users.length<2?`<form class="res member-companion-form"><h3>同伴者${users.length+1}を登録</h3><label>氏名<input name="name" maxlength="80" placeholder="例：山田 花子" required></label><button class="btn">同伴者を登録する</button></form>`:'<article class="res"><p>同伴者は2名登録済みです。</p></article>';
    list.innerHTML=forms+add;
  }

  const originalRender=window.render;
  window.render=function(){originalRender();renderCompanions();};

  document.addEventListener('submit',async event=>{
    const form=event.target.closest('.member-companion-form');
    if(!form)return;
    event.preventDefault();
    const button=form.querySelector('button');
    if(button)button.disabled=true;
    try{
      const name=String(form.elements.name?.value||'').trim();
      if(!name)throw new Error('同伴者名を入力してください。');
      const result=await rpc('fs_member_upsert_registered_user',{
        p_member_code:memberCode,
        p_pin:memberPin,
        p_user_id:form.dataset.userId||null,
        p_name:name,
        p_is_active:form.dataset.userId?Boolean(form.elements.active?.checked):true
      });
      if(!result.ok)throw new Error(result.error||'同伴者を保存できませんでした。');
      await load();
      toast(form.dataset.userId?'同伴者情報を保存しました。':'同伴者を登録しました。');
    }catch(error){alert(error.message);}finally{if(button)button.disabled=false;}
  },true);
})();