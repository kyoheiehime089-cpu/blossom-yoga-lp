// 無料プランだけ利用人数を1名に固定し、利用人数・利用者1の入力欄を非表示にする。
// スタンダード・プレミアムは以前の完成版どおり、利用人数と利用者を選択できる。
(function(){
  const isFreePlan=()=>String(snapshot?.member?.plan||'free').toLowerCase()==='free';

  const originalOpenDialog=openDialog;
  openDialog=function(date,start){
    originalOpenDialog(date,start);
    if(!isFreePlan())return;

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
