(()=>{
  const $=q=>document.querySelector(q);
  const code=()=>localStorage.getItem('fs_code')||'unknown';
  const key=()=>`fs_family_user_names_${code()}`;
  const isFamily=()=>String($('#memberPlan')?.textContent||'').includes('ファミリー');
  function readNames(){
    try{
      const v=JSON.parse(localStorage.getItem(key())||'[]');
      return Array.isArray(v)?v.slice(0,2):[];
    }catch{return []}
  }
  function writeNames(names){
    localStorage.setItem(key(),JSON.stringify((names||[]).map(v=>String(v||'').trim()).filter(Boolean).slice(0,2)));
  }
  function renderFamilyCard(){
    const card=$('#familyUsersCard');
    if(!card)return;
    const family=isFamily();
    card.classList.toggle('hidden',!family);
    if(!family)return;
    const names=readNames();
    const n1=$('#familyRegisteredName1'),n2=$('#familyRegisteredName2');
    if(n1&&document.activeElement!==n1)n1.value=names[0]||'';
    if(n2&&document.activeElement!==n2)n2.value=names[1]||'';
  }
  function fillBookingNames(){
    if(!isFamily())return;
    const names=readNames();
    setTimeout(()=>{
      const box=$('#familyPeopleFields');
      if(!box||box.classList.contains('hidden'))return;
      const n1=$('#familyName1'),n2=$('#familyName2');
      if(n1&&!n1.value)n1.value=names[0]||'';
      if(n2&&!n2.value)n2.value=names[1]||'';
    },50);
  }
  document.addEventListener('click',e=>{
    if(e.target.id==='saveFamilyUsers'){
      if(!isFamily())return;
      writeNames([$('#familyRegisteredName1')?.value,$('#familyRegisteredName2')?.value]);
      renderFamilyCard();
      if(typeof window.loadSnapshot==='function'){};
      const toast=document.querySelector('#toast');
      if(toast){toast.textContent='ご利用者名を保存しました';toast.classList.add('show');setTimeout(()=>toast.classList.remove('show'),2500)}
      return;
    }
    if(e.target.closest('.slot')||e.target.closest('[data-flex-book]'))fillBookingNames();
  });
  const observer=new MutationObserver(renderFamilyCard);
  document.addEventListener('DOMContentLoaded',()=>{
    renderFamilyCard();
    observer.observe(document.body,{childList:true,subtree:true,characterData:true});
    setInterval(renderFamilyCard,1500);
    const dialog=$('#dialog');
    if(dialog)dialog.addEventListener('toggle',()=>{if(dialog.open)fillBookingNames()});
  });
})();
