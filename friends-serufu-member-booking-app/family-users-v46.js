(()=>{
  const $=q=>document.querySelector(q);
  const $$=q=>Array.from(document.querySelectorAll(q));
  const code=()=>localStorage.getItem('fs_code')||'unknown';
  const key=()=>`fs_family_user_names_${code()}`;
  const isFamily=()=>String($('#memberPlan')?.textContent||'').includes('ファミリー');
  function toast(message){
    const t=$('#toast');
    if(!t)return alert(message);
    t.textContent=message;
    t.classList.add('show');
    setTimeout(()=>t.classList.remove('show'),2500);
  }
  function readNames(){
    try{
      const v=JSON.parse(localStorage.getItem(key())||'[]');
      return Array.isArray(v)?v.map(x=>String(x||'').trim()).filter(Boolean):[];
    }catch{return []}
  }
  function writeNames(names){
    localStorage.setItem(key(),JSON.stringify((names||[]).map(v=>String(v||'').trim()).filter(Boolean)));
  }
  function makeRow(value=''){
    const row=document.createElement('div');
    row.className='family-user-row row';
    row.style.alignItems='center';
    row.style.marginTop='10px';
    row.innerHTML=`<input class="family-user-name" placeholder="例：山田 太郎" autocomplete="name" value="${String(value).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}"><button type="button" class="ghost family-user-remove" style="min-height:44px">削除</button>`;
    return row;
  }
  function setupFamilyCard(){
    const card=$('#familyUsersCard');
    if(!card)return;
    const family=isFamily();
    card.classList.toggle('hidden',!family);
    if(!family)return;
    if(card.dataset.familySetup==='1')return;
    card.dataset.familySetup='1';
    const saved=readNames();
    card.innerHTML=`<p class="eyebrow">ファミリープラン</p><h2>ご利用者登録</h2><p class="small">予約時に利用する方のお名前を登録できます。登録人数に制限はありません。予約時は最大2名まで選択・入力できます。</p><div id="familyUserList"></div><button id="addFamilyUser" class="ghost" type="button" style="margin-top:10px;min-height:44px">＋ ご利用者を追加</button><button id="saveFamilyUsers" class="btn" type="button">保存する</button>`;
    const list=$('#familyUserList');
    (saved.length?saved:['']).forEach(name=>list.appendChild(makeRow(name)));
  }
  function currentRows(){return $$('.family-user-name').map(input=>input.value).filter(v=>String(v).trim());}
  function ensureBookingFamilyFields(){
    if(!isFamily())return;
    const standard=$('#standardPeopleFields');
    const family=$('#familyPeopleFields');
    const people=$('[name="people"]');
    const n1=$('#familyName1');
    const n2=$('#familyName2');
    if(standard)standard.classList.add('hidden');
    if(family)family.classList.remove('hidden');
    if(people)people.required=false;
    if(n1){n1.required=true;n1.setAttribute('list','familyUserNameOptions');}
    if(n2){n2.required=false;n2.setAttribute('list','familyUserNameOptions');}
    let dl=$('#familyUserNameOptions');
    if(!dl){dl=document.createElement('datalist');dl.id='familyUserNameOptions';document.body.appendChild(dl);}
    const names=readNames();
    dl.innerHTML=names.map(name=>`<option value="${String(name).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}"></option>`).join('');
    if(n1&&!n1.value)n1.value=names[0]||'';
    if(n2&&!n2.value)n2.value=names[1]||'';
  }
  function watchDialog(){
    const dialog=$('#dialog');
    if(!dialog||dialog.dataset.familyWatcher==='1')return;
    dialog.dataset.familyWatcher='1';
    dialog.addEventListener('toggle',()=>{if(dialog.open)setTimeout(ensureBookingFamilyFields,30)});
  }
  document.addEventListener('click',e=>{
    if(e.target.id==='addFamilyUser'){
      e.preventDefault();
      const list=$('#familyUserList');
      if(list)list.appendChild(makeRow(''));
      setTimeout(()=>$$('.family-user-name').at(-1)?.focus(),30);
      return;
    }
    if(e.target.closest('.family-user-remove')){
      e.preventDefault();
      const row=e.target.closest('.family-user-row');
      row?.remove();
      const list=$('#familyUserList');
      if(list&&!list.querySelector('.family-user-name'))list.appendChild(makeRow(''));
      return;
    }
    if(e.target.id==='saveFamilyUsers'){
      e.preventDefault();
      writeNames(currentRows());
      toast('ご利用者名を保存しました');
      return;
    }
    if(e.target.closest('.slot')||e.target.closest('[data-flex-book]'))setTimeout(ensureBookingFamilyFields,80);
  },true);
  document.addEventListener('submit',e=>{
    if(e.target?.id==='bookingForm'&&isFamily()){
      ensureBookingFamilyFields();
      const n1=String($('#familyName1')?.value||'').trim();
      if(!n1){e.preventDefault();e.stopImmediatePropagation();toast('ご利用者1のフルネームを入力してください');}
    }
  },true);
  const mo=new MutationObserver(()=>{setupFamilyCard();watchDialog();});
  document.addEventListener('DOMContentLoaded',()=>{
    setupFamilyCard();
    watchDialog();
    mo.observe(document.body,{childList:true,subtree:true,characterData:true});
  });
})();
