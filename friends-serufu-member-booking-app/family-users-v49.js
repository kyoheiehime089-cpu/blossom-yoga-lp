(()=>{
  const $=q=>document.querySelector(q);
  const $$=q=>Array.from(document.querySelectorAll(q));
  const code=()=>localStorage.getItem('fs_code')||'unknown';
  const key=()=>`fs_family_user_names_${code()}`;
  const isFamily=()=>String($('#memberPlan')?.textContent||'').includes('ファミリー');
  let lastKey='';

  function escapeHtml(value){
    return String(value||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
  }
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
    row.innerHTML=`<input class="family-user-name" placeholder="例：山田 太郎" autocomplete="name" value="${escapeHtml(value)}"><button type="button" class="ghost family-user-remove" style="min-height:44px">削除</button>`;
    return row;
  }
  function setupFamilyCard(){
    const card=$('#familyUsersCard');
    if(!card)return;
    const family=isFamily();
    card.classList.toggle('hidden',!family);
    if(!family)return;
    const currentKey=key();
    const focusedInside=card.contains(document.activeElement);
    if(card.dataset.familySetup==='1'&&lastKey===currentKey)return;
    if(focusedInside)return;
    lastKey=currentKey;
    card.dataset.familySetup='1';
    const saved=readNames();
    card.innerHTML=`<p class="eyebrow">ファミリープラン</p><h2>ご利用者登録</h2><p class="small">予約時に利用する方のお名前を登録できます。</p><div id="familyUserList"></div><button id="addFamilyUser" class="ghost" type="button" style="margin-top:10px;min-height:44px">＋ ご利用者を追加</button><button id="saveFamilyUsers" class="btn" type="button">保存する</button>`;
    const list=$('#familyUserList');
    (saved.length?saved:['']).forEach(name=>list.appendChild(makeRow(name)));
  }
  function currentRows(){
    return $$('.family-user-name').map(input=>input.value).map(v=>String(v||'').trim()).filter(Boolean);
  }
  function optionList(names, includeBlank=true){
    const blank=includeBlank?'<option value="">選択してください</option>':'';
    return blank+names.map(name=>`<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('');
  }
  function replaceWithSelect(id, labelText, required, names){
    const old=$('#'+id);
    if(!old)return null;
    if(old.tagName.toLowerCase()==='select'){
      old.innerHTML=optionList(names,true);
      old.required=required;
      return old;
    }
    const select=document.createElement('select');
    select.id=id;
    select.name=old.getAttribute('name')||id;
    select.required=required;
    select.innerHTML=optionList(names,true);
    old.replaceWith(select);
    return select;
  }
  function ensureBookingFamilyFields(){
    const standard=$('#standardPeopleFields');
    const family=$('#familyPeopleFields');
    const people=$('[name="people"]');
    if(!isFamily()){
      if(standard)standard.classList.remove('hidden');
      if(family)family.classList.add('hidden');
      if(people)people.required=true;
      return;
    }
    const names=readNames();
    if(standard)standard.classList.add('hidden');
    if(family)family.classList.remove('hidden');
    if(people)people.required=false;
    const n1=replaceWithSelect('familyName1','ご利用者1',true,names);
    const n2=replaceWithSelect('familyName2','ご利用者2',false,names);
    if(n1&&!n1.value&&names[0])n1.value=names[0];
    if(n2&&!n2.value&&names[1])n2.value=names[1];
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
      const names=currentRows();
      writeNames(names);
      lastKey=key();
      toast('ご利用者名を保存しました');
      return;
    }
    if(e.target.closest('.slot')||e.target.closest('[data-flex-book]'))setTimeout(ensureBookingFamilyFields,80);
  },true);
  document.addEventListener('submit',e=>{
    if(e.target?.id==='bookingForm'&&isFamily()){
      ensureBookingFamilyFields();
      const names=readNames();
      if(!names.length){
        e.preventDefault();
        e.stopImmediatePropagation();
        toast('ご利用者登録がありません。先にホーム画面でご利用者を登録してください');
        return;
      }
      const n1=String($('#familyName1')?.value||'').trim();
      if(!n1){
        e.preventDefault();
        e.stopImmediatePropagation();
        toast('ご利用者1を選択してください');
      }
    }
  },true);
  const mo=new MutationObserver(()=>{setupFamilyCard();watchDialog();});
  document.addEventListener('DOMContentLoaded',()=>{
    setupFamilyCard();
    watchDialog();
    mo.observe(document.body,{childList:true,subtree:true,characterData:true});
  });
})();
