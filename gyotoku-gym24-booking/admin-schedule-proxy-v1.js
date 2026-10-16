// 管理者画面：2026年9月以降の固定枠表示をDBと合わせ、代理予約時に実際の利用者・小さなお子様同伴を選べるようにする。
// それ以外の管理機能は変更しない。
(function(){
  window.scheduleBlocks=function(date){
    const day=new Date(`${date}T00:00:00`).getDay();
    if(typeof holiday==='function'&&holiday(date))return [[510,820]];
    if(day===1)return [[510,610],[1080,1330]];
    if(day===2){
      const blocks=[[720,820],[1080,1330]];
      if(date<'2026-09-01')blocks.unshift([510,610]);
      return blocks;
    }
    if(day===3)return [[1080,1330]];
    if(day===4)return [[690,790],[1215,1315]];
    if(day===5)return [[1080,1330]];
    if(day===6){
      if(date>='2026-09-01')return [[570,820],[990,1090]];
      return [[460,820]];
    }
    if(day===0)return [[460,820]];
    return [];
  };

  function memberFor(id){return (snapshot?.members||[]).find(m=>String(m.id)===String(id));}
  function isPaidV7(member){return member?.membership_cohort==='paid_v7'||member?.agreement_version==='agreement-2026-10-13-paid-v7';}
  function usersFor(id){return (snapshot?.registered_users||[]).filter(u=>String(u.member_id)===String(id)&&u.is_active);}
  function optionHtml(users){return users.map(u=>`<option value="${escapeHtml(u.id)}">${escapeHtml(u.name)}${u.is_contract_holder?'（契約者）':''}</option>`).join('');}

  function ensureFields(){
    const reserveFields=document.querySelector('#reserveFields');
    if(!reserveFields||document.querySelector('#adminUser1Select'))return;
    const people=reserveFields.querySelector('[name=people]');
    const note=reserveFields.querySelector('[name=note]');
    const box=document.createElement('div');
    box.id='adminActualUsers';
    box.innerHTML=`<label>利用者1<select id="adminUser1Select" required></select></label><div id="adminUser2Wrap" class="hidden"><label>利用者2<select id="adminUser2Select"></select></label></div><label style="display:flex;gap:10px;align-items:center"><input id="adminChildAccompanied" type="checkbox" style="width:20px;height:20px"> 小さなお子様同伴</label><label id="adminChildSupervisionWrap" class="hidden"><input id="adminChildSupervision" type="checkbox"> お子様の安全管理と監督を行います</label>`;
    if(note)reserveFields.insertBefore(box,note);else reserveFields.appendChild(box);
    people?.addEventListener('input',refreshUsers);
    people?.addEventListener('change',refreshUsers);
    document.querySelector('#slotMemberSelect')?.addEventListener('change',refreshUsers);
    document.querySelector('#adminChildAccompanied')?.addEventListener('change',refreshUsers);
  }

  function refreshUsers(){
    ensureFields();
    const memberId=document.querySelector('#slotMemberSelect')?.value||'';
    const member=memberFor(memberId);
    const users=usersFor(memberId);
    const holder=users.find(u=>u.is_contract_holder);
    const v7=isPaidV7(member);
    const peopleInput=document.querySelector('#reserveFields [name=people]');
    let people=Math.max(1,Math.min(2,Number(peopleInput?.value||1)));
    if(member?.plan==='free')people=1;
    if(peopleInput){peopleInput.value=String(people);peopleInput.max=member?.plan==='free'?'1':'2';}
    const user1=document.querySelector('#adminUser1Select'),user2=document.querySelector('#adminUser2Select');
    if(user1)user1.innerHTML=optionHtml(users);
    if(user2)user2.innerHTML=optionHtml(users);
    if(holder&&(v7||member?.plan!=='premium')&&user1)user1.value=holder.id;
    document.querySelector('#adminUser2Wrap')?.classList.toggle('hidden',people!==2);
    const hasChild=Boolean(document.querySelector('#adminChildAccompanied')?.checked);
    document.querySelector('#adminChildSupervisionWrap')?.classList.toggle('hidden',!v7||!hasChild);
  }

  const originalOpenAdminSlot=window.openAdminSlot;
  if(typeof originalOpenAdminSlot==='function'){
    window.openAdminSlot=function(date,startMinute){
      originalOpenAdminSlot(date,startMinute);
      ensureFields();
      refreshUsers();
      const child=document.querySelector('#adminChildAccompanied');
      if(child)child.checked=false;
    };
  }

  document.addEventListener('DOMContentLoaded',()=>{ensureFields();refreshUsers();});

  document.addEventListener('submit',async event=>{
    const form=event.target.closest('#adminSlotForm');
    if(!form)return;
    const action=form.elements.action?.value;
    if(action!=='reserve')return;
    event.preventDefault();
    event.stopImmediatePropagation();
    try{
      if(!selectedSlot)throw new Error('予約枠を選択してください。');
      const memberId=form.elements.memberId?.value||'';
      const member=memberFor(memberId);
      if(!member)throw new Error('会員を選択してください。');
      const people=member.plan==='free'?1:Math.max(1,Math.min(2,Number(form.elements.people?.value||1)));
      const user1=document.querySelector('#adminUser1Select')?.value||'';
      const user2=people===2?(document.querySelector('#adminUser2Select')?.value||''):null;
      if(!user1)throw new Error('利用者1を選択してください。');
      if(people===2&&(!user2||user1===user2))throw new Error('異なる利用者を2名選択してください。');
      const holder=usersFor(memberId).find(u=>u.is_contract_holder);
      if(member.plan!=='premium'&&holder&&user1!==holder.id&&user2!==holder.id)throw new Error('契約者本人を含めてください。');
      if(isPaidV7(member)){
        const policy=window.gyotokuAdminPolicy;
        const bookingPolicy=snapshot?.booking_policy;
        const gates=member.activation_gates??bookingPolicy?.activation_gates;
        const availability=bookingPolicy?.availability;
        if(!policy?.isV7AdminProxyReady(snapshot)||!policy.canBookMember({cohort:'v7',memberStatus:member.status??member.member_status,activationGates:gates}))throw new Error('同意書v7の予約条件・利用回数・同伴者の安全確認をサーバーで確認できないため、代理予約できません。');
        const childSelected=Boolean(document.querySelector('#adminChildAccompanied')?.checked);
        const childrenSupervised=Boolean(document.querySelector('#adminChildSupervision')?.checked);
        const selectedIds=[user1,user2].filter(Boolean);
        const adults=selectedIds.filter(id=>id!==String(holder?.id)).map(id=>{const user=usersFor(memberId).find(item=>String(item.id)===String(id));return{id,registered:user?.is_active===true,safetyCheckPassed:user?.safety_check_passed===true};});
        const fixedBlocks=typeof window.scheduleBlocks==='function'?window.scheduleBlocks(selectedSlot.date).map(([startMinute,endMinute])=>({date:selectedSlot.date,startMinute,endMinute})):[];
        const result=policy.evaluateV7Booking({membershipCohort:member.membership_cohort,agreementVersion:member.agreement_version,planCode:member.plan,memberStatus:member.status??member.member_status,activationGates:gates,availabilitySnapshotReady:availability?.complete===true,now:new Date(),bookingDate:selectedSlot.date,startMinute:selectedSlot.start,reservations:snapshot.reservations.filter(item=>String(item.member_id)===String(memberId)),conflictReservations:availability?.all_reservations,yogaBlocks:availability?.yoga_blocks,closedSlots:[...(availability?.closed_slots||[]),...fixedBlocks],externalBlocks:availability?.external_blocks,companions:{planCode:member.plan,memberPresent:Boolean(holder&&selectedIds.includes(String(holder.id))),adults,children:childSelected?[{id:'child-present'}]:[],childrenSupervised:childSelected?childrenSupervised:true}});
        if(!result.allowed)throw new Error('同意書v7の予約条件を満たしていません。予約可能枠、利用回数、同伴者の登録・安全確認をご確認ください。');
      }
      const reservationArgs={
        p_member_id:memberId,
        p_date:selectedSlot.date,
        p_start_minute:selectedSlot.start,
        p_people:people,
        p_user1_id:user1,
        p_user2_id:user2,
        p_child_accompanied:Boolean(document.querySelector('#adminChildAccompanied')?.checked),
        p_note:form.elements.note?.value||'管理者が代理予約'
      };
      if(isPaidV7(member)){
        const response=await window.gyotokuAdminV7Rpc(window.gyotokuAdminPolicy.V7_RPC_CONTRACT.adminCreate,{
          p_member_id:memberId,
          p_date:selectedSlot.date,
          p_start_minute:selectedSlot.start,
          p_adult_user_ids:[user1,user2].filter(Boolean),
          p_children_accompanied:Boolean(document.querySelector('#adminChildAccompanied')?.checked),
          p_children_supervised:Boolean(document.querySelector('#adminChildSupervision')?.checked),
          p_note:reservationArgs.p_note,
          p_request_id:crypto.randomUUID()
        });
        if(!response?.ok)throw new Error(response?.error||'代理予約に失敗しました。');
      }else{
        await rpc('fs_admin_create_reservation_v2',{
          p_admin_password:adminPassword,
          ...reservationArgs
        });
      }
      document.querySelector('#adminSlotDialog')?.close();
      await loadSnapshot();
      toast('予約を登録しました。');
    }catch(error){alert(error.message);}
  },true);
})();
