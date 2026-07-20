// 会員ID G24004（菊池様）のみ、予約・キャンセル期限を開始10分前へ変更
(function(){
  const SPECIAL_MEMBER_CODE='G24004';
  const isKikuchi=()=>String(memberCode||'').trim().toUpperCase()===SPECIAL_MEMBER_CODE;
  canBook=function(date,start){
    const minutes=isKikuchi()?10:Number(rule().booking_deadline_minutes);
    return startAt(date,start).getTime()-Date.now()>=minutes*60000;
  };
  canCancel=function(reservation){
    const minutes=isKikuchi()?10:Number(rule().cancellation_deadline_minutes);
    return startAt(reservation.date,reservation.start_minute).getTime()-Date.now()>=minutes*60000;
  };
})();