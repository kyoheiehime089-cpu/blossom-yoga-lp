(()=>{
  const $=q=>document.querySelector(q);
  const $$=q=>Array.from(document.querySelectorAll(q));
  const code=()=>localStorage.getItem('fs_code')||'';
  const pin=()=>localStorage.getItem('fs_pin')||'';
  const key=()=>`fs_family_user_names_${code()||'unknown'}`;
  const isFamily=()=>String($('#memberPlan')?.textContent||'').includes('ファミリー');
  let lastKey='';
  let selectedSlot=null;

  function escapeHtml(value){return String(value||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));}
  function toast(message){const t=$('#toast');if(!t)return alert(message);t.textContent=message;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2500);}
  function readNames(){try{const v=JSON.parse(localStorage.getItem(key())||'[]');return Array.isArray(v)?v.map(x=>String(x||'').trim()).filter(Boolean):[]}catch{return []}}
  function writeNames(names){localStorage.setItem(key(),JSON.stringify((names||[]).map(v=>String(v||'').trim()).filter(Boolean)));}
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
    if(card.dataset.familySetup==='1'&&lastKey===currentKey)return;
    if(card.contains(document.activeElement))return;
    lastKey=currentKey;
    card.dataset.familySetup='1';
    const saved=readNames();
    card.innerHTML=`<p class="eyebrow">ファミリープラン</p><h2>ご利用者登録</h2><p class="small">予約時に利用する方のお名前を登録できます。</p><div id="familyUserList"></div><button id="addFamilyUser" class="ghost" type="button" style="margin-top:10px;min-height:44px">＋ ご利用者を追加</button><button id="saveFamilyUsers" class="btn" type="button">保存する</button>`;
    const list=$('#familyUserList');
    (saved.length?saved:['']).forEach(name=>list.appendChild(makeRow(name)));
  }
  function currentRows(){return $$('.family-user-name').map(input=>input.value).map(v=>String(v||'').trim()).filter(Boolean);}
  function optionList(names){return '<option value="">選択してください</option>'+names.map(name=>`<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('');}
  function ensureBookingFamilyFields(){
    const standard=$('#standardPeopleFields');
    const family=$('#familyPeopleFields');
    const people=$('[name="people"]');
    const n1=$('#familyName1');
    const n2=$('#familyName2');
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
    if(n1){n1.innerHTML=optionList(names);n1.required=true;}
    if(n2){n2.innerHTML=optionList(names);n2.required=false;}
  }
  async function submitFamilyReservation(form){
    const names=readNames();
    if(!names.length){toast('ご利用者登録がありません。先にホーム画面でご利用者を登録してください');return;}
    ensureBookingFamilyFields();
    const fd=new FormData(form);
    const n1=String(fd.get('familyName1')||'').trim();
    const n2=String(fd.get('familyName2')||'').trim();
    const note=String(fd.get('note')||'');
    if(!n1){toast('利用する方1を選択してください');return;}
    if(!selectedSlot?.date||selectedSlot.startMinute==null){toast('予約枠情報を取得できませんでした。もう一度枠を選び直してください');return;}
    try{
      const client=window.supabase.createClient(window.FRIENDS_SUPABASE_URL,window.FRIENDS_SUPABASE_ANON_KEY);
      const people='利用者：'+[n1,n2].filter(Boolean).join('、');
      const {data,error}=await client.rpc('fs_member_create_reservation',{
        p_member_code:code(),
        p_pin:pin(),
        p_date:selectedSlot.date,
        p_start_minute:selectedSlot.startMinute,
        p_people:people,
        p_note:note
      });
      if(error){toast(error.message||'予約に失敗しました');return;}
      if(!data?.ok){toast(data?.error||'予約に失敗しました');return;}
      $('#dialog')?.close();
      if(typeof window.loadSnapshot==='function')await window.loadSnapshot();
      else if(typeof window.load==='function')await window.load();
      toast('予約が完了しました');
    }catch(err){toast(err?.message||'予約に失敗しました');}
  }
  function watchDialog(){
    const dialog=$('#dialog');
    if(!dialog||dialog.dataset.familyWatcher==='1')return;
    dialog.dataset.familyWatcher='1';
    dialog.addEventListener('toggle',()=>{if(dialog.open)setTimeout(ensureBookingFamilyFields,30);});
  }
  document.addEventListener('click',e=>{
    const slot=e.target.closest('.slot');
    if(slot&&slot.dataset.d&&slot.dataset.s){selectedSlot={date:slot.dataset.d,startMinute:Number(slot.dataset.s)};}
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
      lastKey=key();
      toast('ご利用者名を保存しました');
      return;
    }
    if(e.target.closest('.slot')||e.target.closest('[data-flex-book]'))setTimeout(ensureBookingFamilyFields,80);
  },true);
  document.addEventListener('submit',e=>{
    if(e.target?.id==='bookingForm'&&isFamily()){
      e.preventDefault();
      e.stopImmediatePropagation();
      submitFamilyReservation(e.target);
    }
  },true);
  const mo=new MutationObserver(()=>{setupFamilyCard();watchDialog();});
  document.addEventListener('DOMContentLoaded',()=>{
    setupFamilyCard();
    watchDialog();
    mo.observe(document.body,{childList:true,subtree:true,characterData:true});
  });
})();