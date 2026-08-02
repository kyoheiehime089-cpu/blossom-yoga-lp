// 会員別の予約・キャンセル締切
// 菊池様（G24004）：予約10分前、キャンセル20分前
// 三代川様（G24003）：予約・キャンセルともに3時間前
// その他：予約・キャンセルともに利用日前日の22:00
(function(){
  function code(){
    return String(snapshot?.member?.member_code||memberCode||'').trim().toUpperCase();
  }

  function previousDayCutoff(date){
    const cutoff=new Date(`${date}T00:00:00`);
    cutoff.setDate(cutoff.getDate()-1);
    cutoff.setHours(22,0,0,0);
    return cutoff;
  }

  canBook=function(date,start){
    const startTime=startAt(date,start).getTime();
    if(code()==='G24004') return startTime-Date.now()>=10*60000;
    if(code()==='G24003') return startTime-Date.now()>=3*60*60000;
    return Date.now()<previousDayCutoff(date).getTime();
  };

  canCancel=function(reservation){
    const startTime=startAt(reservation.date,reservation.start_minute).getTime();
    if(code()==='G24004') return startTime-Date.now()>=20*60000;
    if(code()==='G24003') return startTime-Date.now()>=3*60*60000;
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
        if(code()==='G24004') p.innerHTML=`<strong>予約</strong>：${rule().booking_days}日先まで・開始10分前まで。`;
        else if(code()==='G24003') p.innerHTML=`<strong>予約</strong>：${rule().booking_days}日先まで・開始3時間前まで。`;
        else p.innerHTML=`<strong>予約</strong>：${rule().booking_days}日先まで・利用日前日の22:00まで。`;
      }
      if(text.startsWith('キャンセル：')){
        if(code()==='G24004') p.innerHTML='<strong>キャンセル</strong>：開始20分前まで。';
        else if(code()==='G24003') p.innerHTML='<strong>キャンセル</strong>：開始3時間前まで。';
        else p.innerHTML='<strong>キャンセル</strong>：利用日前日の22:00まで。締切後はキャンセルできず、1枠消化となります。';
      }
    });
  };
})();