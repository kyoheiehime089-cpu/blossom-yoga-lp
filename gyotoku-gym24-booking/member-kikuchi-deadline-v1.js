// 無料プラン：予約・キャンセルは利用日前日の22:00締切
// プレミアムプラン：従来のプラン設定（予約2時間前・キャンセル3時間前）を維持
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

  canBook=function(date,start){
    if(isPremium()){
      return startAt(date,start).getTime()-Date.now()>=Number(rule().booking_deadline_minutes)*60000;
    }
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
      if(isPremium()){
        if(text.startsWith('予約：'))p.innerHTML=`<strong>予約</strong>：${rule().booking_days}日先まで・開始${Number(rule().booking_deadline_minutes)/60}時間前まで。`;
        if(text.startsWith('キャンセル：'))p.innerHTML=`<strong>キャンセル</strong>：開始${Number(rule().cancellation_deadline_minutes)/60}時間前まで。`;
      }else{
        if(text.startsWith('予約：'))p.innerHTML=`<strong>予約</strong>：${rule().booking_days}日先まで・利用日前日の22:00まで。`;
        if(text.startsWith('キャンセル：'))p.innerHTML='<strong>キャンセル</strong>：利用日前日の22:00まで。締切後はキャンセルできず、1枠消化となります。';
      }
    });
  };
})();