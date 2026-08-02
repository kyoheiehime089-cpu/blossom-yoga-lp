// 全プラン共通：予約は利用日前日の22:00締切
// キャンセル条件は既存仕様を維持（プレミアムは開始3時間前、その他は前日22:00）。
(function(){
  function isPremium(){
    return String(snapshot?.member?.plan||'').toLowerCase()==='premium';
  }

  function previousDayCutoff(date){
    const cutoff=new Date(`${date}T00:00:00`);
    cutoff.setDate(cutoff.getDate()-1);
    cutoff.setHours(22,0,0,0);
    return cutoff;
  }

  canBook=function(date){
    return Date.now()<previousDayCutoff(date).getTime();
  };

  canCancel=function(reservation){
    if(isPremium()){
      return startAt(reservation.date,reservation.start_minute).getTime()-Date.now()>=Number(rule().cancellation_deadline_minutes)*60000;
    }
    return Date.now()<previousDayCutoff(reservation.date).getTime();
  };

  const originalRender=render;
  render=function(){
    originalRender();
    const rules=document.querySelector('.rules');
    if(!rules)return;
    rules.querySelectorAll('p').forEach(p=>{
      const text=p.textContent||'';
      if(text.startsWith('予約：')){
        p.innerHTML=`<strong>予約</strong>：${rule().booking_days}日先まで・利用日前日の22:00まで。`;
      }
      if(text.startsWith('キャンセル：')){
        if(isPremium()){
          p.innerHTML=`<strong>キャンセル</strong>：開始${Number(rule().cancellation_deadline_minutes)/60}時間前まで。`;
        }else{
          p.innerHTML='<strong>キャンセル</strong>：利用日前日の22:00まで。締切後はキャンセルできず、1枠消化となります。';
        }
      }
    });
  };
})();