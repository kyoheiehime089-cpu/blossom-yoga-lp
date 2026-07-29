// 全会員共通：予約・キャンセルは利用日前日の22:00で締め切る
(function(){
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
    return Date.now()<previousDayCutoff(reservation.date).getTime();
  };

  const originalRender=render;
  render=function(){
    originalRender();
    const rules=document.querySelector('.rules');
    if(!rules)return;
    rules.querySelectorAll('p').forEach(p=>{
      const text=p.textContent||'';
      if(text.startsWith('予約：'))p.innerHTML=`<strong>予約</strong>：${rule().booking_days}日先まで・利用日前日の22:00まで。`;
      if(text.startsWith('キャンセル：'))p.innerHTML='<strong>キャンセル</strong>：利用日前日の22:00まで。締切後はキャンセルできず、1枠消化となります。';
    });
  };
})();
