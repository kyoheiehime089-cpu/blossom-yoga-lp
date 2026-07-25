// 管理者画面：会員詳細で登録同伴者、予約表示で実際の利用者を明確に表示する。
// 既存の予約ルール・時間・操作は変更しない。
(function(){
  function reservationUsers(reservation){
    const names=[reservation?.user1_name_snapshot,reservation?.user2_name_snapshot].filter(Boolean);
    return names.length?names.join('・'):(reservation?.people||'利用者未記録');
  }

  const originalReservationCard=window.reservationCard;
  window.reservationCard=function(reservation){
    return `<article class='res'><h3>${escapeHtml(fullRange(reservation.date,reservation.start_minute))}</h3><p><strong>契約者：</strong>${escapeHtml(reservation.member_name)}</p><p><strong>実際の利用者：</strong>${escapeHtml(reservationUsers(reservation))}</p><p>${escapeHtml(planLabel(reservation.plan))} / ${escapeHtml(reservation.people)}</p><div class='two'><button class='ghost' data-detail='${escapeHtml(reservation.member_id)}'>会員を開く</button><button class='danger' data-cancel='${escapeHtml(reservation.id)}'>キャンセル</button></div></article>`;
  };

  const originalSlotRow=window.slotRow;
  window.slotRow=function(date,startMinute){
    const reservation=reservationAt(date,startMinute),closed=closedAt(date,startMinute),external=externalAt(date,startMinute);
    if(reservation)return `<article class='slot-row reserved'><div class='time'>${slotRange(startMinute)}</div><div><span class='pill reserve'>予約</span> ${escapeHtml(reservation.member_name)}<br><strong>利用者：${escapeHtml(reservationUsers(reservation))}</strong></div><button class='danger' data-cancel='${escapeHtml(reservation.id)}'>キャンセル</button></article>`;
    return originalSlotRow(date,startMinute);
  };

  function registeredUsersFor(memberId){
    return (snapshot?.registered_users||[]).filter(user=>user.member_id===memberId);
  }

  function companionSummary(memberId){
    const member=memberById(memberId);
    if(!member)return '';
    if(!['standard','premium'].includes(member.plan))return `<section class='registered-users-box'><h3>登録利用者</h3><p class='small'>無料プランのため同伴者登録はありません。</p></section>`;
    const users=registeredUsersFor(memberId);
    const holder=users.find(user=>user.is_contract_holder);
    const companions=users.filter(user=>!user.is_contract_holder);
    return `<section class='registered-users-box'><h3>登録利用者</h3><p class='small'>同伴者は契約者本人とは別に2名まで登録できます。</p>${holder?`<article class='res'><strong>${escapeHtml(holder.name)}</strong><p>契約者本人</p></article>`:''}${companions.length?companions.map((user,index)=>`<article class='res'><strong>同伴者${index+1}：${escapeHtml(user.name)}</strong><p>${user.is_active?'予約時に選択可能':'現在は予約時に選択不可'}</p></article>`).join(''):'<article class="res"><p>同伴者はまだ登録されていません。</p></article>'}</section>`;
  }

  const originalOpenDetail=window.openDetail;
  window.openDetail=function(id){
    originalOpenDetail(id);
    const detail=document.querySelector(`[data-member-detail='${CSS.escape(id)}']`);
    if(!detail||detail.querySelector('.registered-users-box'))return;
    const reservationHeading=[...detail.querySelectorAll('h3')].find(el=>el.textContent.includes('この会員の予約'));
    if(reservationHeading)reservationHeading.insertAdjacentHTML('beforebegin',companionSummary(id));
    else detail.insertAdjacentHTML('beforeend',companionSummary(id));
  };
})();