// 確定ルール追加：全時間帯10分単位・同伴者最大2名管理
(function(){
  const originalOpenDetail=window.openDetail;
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
  async function renderCompanions(memberId,container){
    const result=await directRpc('fs_admin_registered_users',{p_member_id:memberId});
    const users=result.users||[];
    const companions=users.filter(u=>!u.is_contract_holder);
    const holder=users.find(u=>u.is_contract_holder);
    container.innerHTML=`<h3>登録利用者</h3><p class='small'>契約者本人と同伴者2名まで登録できます。予約操作は契約者本人が行います。</p>${holder?`<article class='res'><strong>${escapeHtml(holder.name)}</strong><p>契約者本人</p></article>`:''}<div class='list'>${companions.map(u=>`<form class='res companion-edit' data-user-id='${u.id}' data-member-id='${memberId}'><label>同伴者名<input name='name' value='${escapeHtml(u.name)}' required></label><label><input type='checkbox' name='active' ${u.is_active?'checked':''}> 有効</label><button class='btn'>保存</button></form>`).join('')}</div>${companions.length<2?`<form class='mini companion-add' data-member-id='${memberId}'><label>同伴者名<input name='name' required placeholder='例：山田 花子'></label><button class='btn'>同伴者を追加</button></form>`:''}`;
  }
  window.openDetail=function(id){originalOpenDetail(id);setTimeout(()=>{const detail=document.querySelector(`[data-member-detail='${CSS.escape(id)}']`);if(!detail)return;const member=memberById(id);if(!member||!['standard','premium'].includes(member.plan))return;let box=detail.querySelector('.registered-users-box');if(!box){box=document.createElement('section');box.className='registered-users-box';detail.appendChild(box);}renderCompanions(id,box).catch(e=>box.innerHTML=`<p>${escapeHtml(e.message)}</p>`);},0);};
  document.addEventListener('submit',async event=>{
    const add=event.target.closest('.companion-add');const edit=event.target.closest('.companion-edit');if(!add&&!edit)return;
    event.preventDefault();
    try{const form=add||edit;const name=form.elements.name.value.trim();await directRpc('fs_admin_upsert_registered_user',{p_member_id:form.dataset.memberId,p_user_id:edit?form.dataset.userId:null,p_name:name,p_is_active:edit?form.elements.active.checked:true});toast(edit?'同伴者情報を保存しました。':'同伴者を追加しました。');window.openDetail(form.dataset.memberId);}catch(e){alert(e.message);}
  });
})();