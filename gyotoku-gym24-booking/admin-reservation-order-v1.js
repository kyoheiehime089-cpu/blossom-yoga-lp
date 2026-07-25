// 管理者画面：予約日時が新しい予約を上に表示する。
// カレンダーの時系列表示や予約ルールは変更しない。
(function(){
  const newerFirst=(a,b)=>{
    const dateCompare=String(b.date||'').localeCompare(String(a.date||''));
    return dateCompare!==0?dateCompare:Number(b.start_minute||0)-Number(a.start_minute||0);
  };

  window.renderSummary=function(){
    const today=dateKey(new Date());
    const todayReservations=snapshot.reservations.filter(reservation=>reservation.date===today).sort(newerFirst);
    $('#summary').innerHTML=`<article class='res metric'><p>会員数</p><strong>${snapshot.members.length}</strong></article><article class='res metric'><p>予約数</p><strong>${snapshot.reservations.length}</strong></article><article class='res metric'><p>今日の予約</p><strong>${todayReservations.length}</strong></article>`;
    $('#todayReservations').innerHTML=todayReservations.length?todayReservations.map(reservationCard).join(''):'<article class="res"><p>今日の予約はありません。</p></article>';
  };

  const originalOpenDetail=window.openDetail;
  window.openDetail=function(id){
    const originalReservations=snapshot.reservations;
    snapshot.reservations=[...originalReservations].sort(newerFirst);
    try{
      return originalOpenDetail(id);
    }finally{
      snapshot.reservations=originalReservations;
    }
  };
})();