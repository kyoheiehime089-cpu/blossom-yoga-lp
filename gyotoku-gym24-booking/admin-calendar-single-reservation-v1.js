// 管理者カレンダー表示専用修正：1件の予約を10分刻みの各行へ重複表示しない。
// 予約判定・予約可能時間・キャンセル処理などの既存ルールは変更しない。
(function(){
  function exactReservation(date,startMinute){
    return (snapshot?.reservations||[]).find(r=>r.date===date&&Number(r.start_minute)===Number(startMinute));
  }

  function reservationBlocking(date,startMinute){
    return (snapshot?.reservations||[]).find(r=>{
      if(r.date!==date)return false;
      const start=Number(r.start_minute);
      const use=Number(r.use_minutes_snapshot||40);
      return start-10<Number(startMinute)&&Number(startMinute)<start+use+10;
    });
  }

  function closedOrExternalRow(date,startMinute){
    const closed=closedAt(date,startMinute),external=externalAt(date,startMinute);
    if(closed)return `<article class='slot-row closed'><div class='time'>${slotRange(startMinute)}</div><div><span class='pill closed'>利用不可</span> ${escapeHtml(closed.reason||'理由なし')}</div><button class='danger' data-open='${escapeHtml(closed.id)}'>解除</button></article>`;
    if(external)return `<article class='slot-row closed'><div class='time'>${slotRange(startMinute)}</div><div><span class='pill closed'>予約不可</span></div></article>`;
    return '';
  }

  window.slotRow=function(date,startMinute){
    const exact=exactReservation(date,startMinute);
    if(exact){
      const names=[exact.user1_name_snapshot,exact.user2_name_snapshot].filter(Boolean);
      const users=names.length?names.join('・'):(exact.people||'利用者未記録');
      const end=Number(exact.start_minute)+Number(exact.use_minutes_snapshot||40);
      return `<article class='slot-row reserved'><div class='time'>${formatMinute(exact.start_minute)}〜${formatMinute(end)}</div><div><span class='pill reserve'>予約</span> ${escapeHtml(exact.member_name)}<br><strong>利用者：${escapeHtml(users)}</strong>${exact.child_accompanied?'<br><strong>小さなお子様同伴</strong>':''}</div><button class='danger' data-cancel='${escapeHtml(exact.id)}'>キャンセル</button></article>`;
    }

    // 予約本体と前後10分の行は「別予約」として表示しない。
    if(reservationBlocking(date,startMinute))return '';

    const blocked=closedOrExternalRow(date,startMinute);
    if(blocked)return blocked;

    return `<article class='slot-row open' data-slot-action='${date}_${startMinute}'><div class='time'>${slotRange(startMinute)}</div><div><span class='pill open'>空き</span> タップして予約登録／利用不可</div><span>操作</span></article>`;
  };

  window.renderCalendar=function(){
    const start=weekStart(),end=new Date(start);end.setDate(start.getDate()+6);
    $('#weekLabel').textContent=`${japaneseDate(dateKey(start))} 〜 ${japaneseDate(dateKey(end))}`;
    $('#days').innerHTML=Array.from({length:7},(_,index)=>{const date=new Date(start);date.setDate(start.getDate()+index);return `<button class='day ${index===selectedDay?'active':''}' data-day='${index}'><strong>${date.getMonth()+1}/${date.getDate()}</strong><span>${'日月火水木金土'[date.getDay()]}</span></button>`;}).join('');
    const date=dateKey(selectedDate());
    const starts=fixedStarts().filter(minute=>!scheduleConflict(date,minute));
    const html=starts.map(minute=>slotRow(date,minute)).filter(Boolean).join('');
    $('#calendarList').innerHTML=html||'<article class="res"><p>予約可能な時間はありません。</p></article>';
  };
})();
