// 菊池様（G24004）・三代川様（G24003）以外は、利用人数を1名に固定し、利用人数・利用者1の入力欄を非表示にする。
(function(){
  const PREMIUM_MEMBER_CODES=new Set(['G24003','G24004']);
  const isPremiumException=()=>PREMIUM_MEMBER_CODES.has(String(memberCode||'').trim().toUpperCase());

  const originalOpenDialog=openDialog;
  openDialog=function(date,start){
    originalOpenDialog(date,start);
    if(isPremiumException())return;

    const peopleSelect=document.querySelector('#peopleSelect');
    const user1Select=document.querySelector('#user1Select');
    const holder=(snapshot?.registered_users||[]).find(user=>user.is_contract_holder);

    if(peopleSelect){
      peopleSelect.value='1';
      peopleSelect.disabled=true;
      const peopleLabel=peopleSelect.previousElementSibling;
      if(peopleLabel?.tagName==='LABEL')peopleLabel.style.display='none';
      peopleSelect.style.display='none';
    }

    if(user1Select){
      if(holder)user1Select.value=holder.id;
      const user1Label=user1Select.previousElementSibling;
      if(user1Label?.tagName==='LABEL')user1Label.style.display='none';
      user1Select.style.display='none';
    }

    const user2Wrap=document.querySelector('#user2Wrap');
    if(user2Wrap)user2Wrap.classList.add('hidden');
  };
})();
