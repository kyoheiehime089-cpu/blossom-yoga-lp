// 管理者代理予約を会員予約と同じルール・利用者選択に統一
(function(){
  const timeLabel=value=>{const minute=Number(value);if(minute<1440)return `${String(Math.floor(minute/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`;const next=minute-1440;return `翌${Math.floor(next/60)}:${String(next%60).padStart(2,'0')}`;};
  const range=(start,minutes=40)=>`${timeLabel(start)}〜${timeLabel(Number(start)+Number(minutes))}`;
  window.fixedStarts=function(){const values=[];for(let minute=0;minute<=1430;minute+=10)values.push(minute);return values;};
  window.flexibleStarts=window.fixedStarts;

  async function call(name,args){const password=sessionStorage.getItem('gyotoku_admin_password')||document.querySelector('#adminPass')?.value||'';const {data,error}=await gyotokuAdminDb.rpc(name,{p_admin_password:password,...args});if(error)throw error;if(!data?.ok)throw new Error(data?.error||'処理に失敗しました。');return data;}
  function member(){return snapshot.members.find(item=>item.id===document.querySelector('#slotMemberSelect')?.value);}
  async function loadUsers(){
    const memberId=document.querySelector('#slotMemberSelect')?.value;
    const user1=document.querySelector('#adminUser1'),user2=document.querySelector('#adminUser2');
    if(!memberId||!user1||!user2)return;
    const result=await call('fs_admin_registered_users',{p_member_id:memberId});
    const options=(result.users||[]).filter(u=>u.is_active).map(u=>`<option value='${u.id}'>${escapeHtml(u.name)}${u.is_contract_holder?'（契約者）':''}</option>`).join('');
    user1.innerHTML=options;user2.innerHTML=options;
    const current=member(),holder=(result.users||[]).find(u=>u.is_contract_holder&&u.is_active);
    if(current?.plan!=='premium'&&holder)user1.value=holder.id;
  }
  function prepareDialog(){
    const fields=document.querySelector('#reserveFields');if(!fields)return;
    let box=document.querySelector('#adminUsersBox');
    if(!box){box=document.createElement('div');box.id='adminUsersBox';box.innerHTML=`<label>利用者1</label><select id='adminUser1' required></select><div id='adminUser2Wrap' class='hidden'><label>利用者2</label><select id='adminUser2'></select></div><label id='adminChildWrap' class='hidden'><input id='adminChild' type='checkbox'> 小さなお子様を同伴する</label>`;const note=fields.querySelector('label:last-of-type');fields.insertBefore(box,note||null);}
    const people=fields.querySelector('[name=people]');if(people){people.type='number';people.min='1';people.max='2';people.value='1';}
    document.querySelector('#adminUser2Wrap')?.classList.add('hidden');
    const current=member();document.querySelector('#adminChildWrap')?.classList.toggle('hidden',current?.plan!=='free');
    loadUsers().catch(error=>alert(error.message));
  }

  document.addEventListener('click',event=>{
    if(event.target.closest('[data-slot-action]'))setTimeout(prepareDialog,0);
  });
  document.addEventListener('change',event=>{
    if(event.target.id==='slotMemberSelect'){document.querySelector('#adminChildWrap')?.classList.toggle('hidden',member()?.plan!=='free');loadUsers().catch(error=>alert(error.message));}
    if(event.target.closest('#reserveFields [name=people]'))document.querySelector('#adminUser2Wrap')?.classList.toggle('hidden',Number(event.target.value)!==2);
  });
  document.addEventListener('submit',async event=>{
    const form=event.target.closest('#adminSlotForm');if(!form)return;
    event.preventDefault();event.stopImmediatePropagation();
    try{
      const data=new FormData(form),action=data.get('action');
      if(action==='close'){
        await call('fs_admin_close_slot',{p_date:selectedSlot.date,p_start_minute:selectedSlot.start,p_reason:data.get('reason')||'管理者設定'});
      }else{
        const people=Number(data.get('people')||1),user1=document.querySelector('#adminUser1')?.value,user2=people===2?document.querySelector('#adminUser2')?.value:null;
        if(!user1)throw new Error('利用者1を選択してください。');
        if(people===2&&(!user2||user1===user2))throw new Error('異なる利用者を2名選択してください。');
        await call('fs_admin_create_reservation_v2',{p_member_id:data.get('memberId'),p_date:selectedSlot.date,p_start_minute:selectedSlot.start,p_people:people,p_user1_id:user1,p_user2_id:user2,p_child_accompanied:Boolean(document.querySelector('#adminChild')?.checked),p_note:data.get('note')||'管理者が代理予約'});
      }
      document.querySelector('#adminSlotDialog')?.close();await loadSnapshot();toast('反映しました。');
    }catch(error){alert(error.message);}
  },true);

  window.reservationCard=function(reservation){const names=[reservation.user1_name_snapshot,reservation.user2_name_snapshot].filter(Boolean).join('・');return `<article class='res'><h3>${escapeHtml(japaneseDate(reservation.date))} ${range(reservation.start_minute,reservation.use_minutes_snapshot||40)}</h3><p>${escapeHtml(reservation.member_name)} / ${escapeHtml(planLabel(reservation.plan))} / ${escapeHtml(names||reservation.people)}</p>${reservation.child_accompanied?'<p>小さなお子様同伴</p>':''}<div class='two'><button class='ghost' data-detail='${escapeHtml(reservation.member_id)}'>会員を開く</button><button class='danger' data-cancel='${escapeHtml(reservation.id)}'>キャンセル</button></div></article>`;};
})();