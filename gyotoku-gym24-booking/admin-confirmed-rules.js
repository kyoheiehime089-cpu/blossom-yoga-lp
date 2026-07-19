// 確定ルール追加：全時間帯10分単位・同伴者最大2名管理
(function(){
  window.fixedStarts=function(){const values=[];for(let minute=0;minute+40<=1440;minute+=10)values.push(minute);return values;};
  window.flexibleStarts=window.fixedStarts;
  window.renderCalendar=function(){
    const start=weekStart(),end=new Date(start);end.setDate(start.getDate()+6);
    $('#weekLabel').textContent=`${japaneseDate(dateKey(start))} 〜 ${japaneseDate(dateKey(end))}`;
    $('#days').innerHTML=Array.from({length:7},(_,index)=>{const date=new Date(start);date.setDate(start.getDate()+index);return `<button class='day ${index===selectedDay?'active':''}' data-day='${index}'><strong>${date.getMonth()+1}/${date.getDate()}</strong><span>${'日月火水木金土'[date.getDay()]}</span></button>`;}).join('');
    const date=dateKey(selectedDate());
    const starts=fixedStarts().filter(minute=>!scheduleConflict(date,minute));
    $('#calendarList').innerHTML=starts.map(minute=>slotRow(date,minute)).join('')||'<article class="res"><p>予約可能な時間はありません。</p></article>';
  };
  window.fillTimeOptions=function(){const select=$('#addClosed select[name=start]');if(!select)return;const date=$('#addClosed input[name=date]').value;const options=date?fixedStarts().filter(minute=>availableAdminSlot(date,minute)):[];select.innerHTML=options.length?options.map(minute=>`<option value='${minute}'>${slotRange(minute)}</option>`).join(''):'<option value="">日付を選択してください</option>';};

  async function directRpc(name,args){const password=sessionStorage.getItem('gyotoku_admin_password')||$('#adminPass')?.value||'';const {data,error}=await gyotokuAdminDb.rpc(name,{p_admin_password:password,...args});if(error)throw error;if(!data?.ok)throw new Error(data?.error||'処理に失敗しました。');return data;}
  async function companionPanel(memberId){
    const member=memberById(memberId);
    if(!member||!['standard','premium'].includes(member.plan))return '<p class="small">無料プランには同伴者登録はありません。</p>';
    const result=await directRpc('fs_admin_registered_users',{p_member_id:memberId});
    const users=result.users||[],holder=users.find(u=>u.is_contract_holder),companions=users.filter(u=>!u.is_contract_holder);
    return `<section class='registered-users-box'><h3>同伴者登録</h3><p class='small'>契約者本人に加えて、同伴者を2名まで登録できます。</p>${holder?`<article class='res'><strong>${escapeHtml(holder.name)}</strong><p>契約者本人</p></article>`:''}<div class='list'>${companions.map((u,i)=>`<form class='res companion-edit' data-user-id='${u.id}' data-member-id='${memberId}'><h4>同伴者${i+1}</h4><label>氏名<input name='name' value='${escapeHtml(u.name)}' required></label><label><input type='checkbox' name='active' ${u.is_active?'checked':''}> 予約時に選択できる状態にする</label><button class='btn'>この同伴者を保存</button></form>`).join('')}</div>${companions.length<2?`<form class='mini companion-add' data-member-id='${memberId}'><h4>同伴者${companions.length+1}を登録</h4><label>氏名<input name='name' required placeholder='例：山田 花子'></label><button class='btn'>同伴者を登録する</button></form>`:'<p class="small">同伴者は2名登録済みです。</p>'}</section>`;
  }
  async function toggleCompanions(memberId,button){
    let panel=document.querySelector(`[data-companion-panel='${CSS.escape(memberId)}']`);
    if(panel){panel.remove();button.textContent='同伴者を登録・編集';return;}
    const card=document.querySelector(`[data-member-card='${CSS.escape(memberId)}']`);
    if(!card)return;
    panel=document.createElement('div');panel.dataset.companionPanel=memberId;panel.className='res';panel.innerHTML='<p>読み込み中です...</p>';card.insertAdjacentElement('afterend',panel);
    try{panel.innerHTML=await companionPanel(memberId);button.textContent='同伴者欄を閉じる';}catch(e){panel.innerHTML=`<p>${escapeHtml(e.message)}</p>`;}
  }
  const baseRenderMembers=window.renderMembers;
  window.renderMembers=function(){
    baseRenderMembers();
    snapshot.members.forEach(member=>{
      if(!['standard','premium'].includes(member.plan))return;
      const card=document.querySelector(`[data-member-card='${CSS.escape(member.id)}']`);
      if(!card||card.querySelector('[data-companions]'))return;
      const button=document.createElement('button');button.type='button';button.className='ghost';button.dataset.companions=member.id;button.textContent='同伴者を登録・編集';button.style.marginTop='10px';button.style.width='100%';card.appendChild(button);
    });
  };
  document.addEventListener('click',event=>{const button=event.target.closest('[data-companions]');if(button)toggleCompanions(button.dataset.companions,button);});
  document.addEventListener('submit',async event=>{
    const add=event.target.closest('.companion-add'),edit=event.target.closest('.companion-edit');if(!add&&!edit)return;
    event.preventDefault();event.stopImmediatePropagation();
    try{const form=add||edit,name=form.elements.name.value.trim();await directRpc('fs_admin_upsert_registered_user',{p_member_id:form.dataset.memberId,p_user_id:edit?form.dataset.userId:null,p_name:name,p_is_active:edit?form.elements.active.checked:true});toast(edit?'同伴者情報を保存しました。':'同伴者を登録しました。');const panel=document.querySelector(`[data-companion-panel='${CSS.escape(form.dataset.memberId)}']`);if(panel)panel.innerHTML=await companionPanel(form.dataset.memberId);}catch(e){alert(e.message);}
  },true);
})();