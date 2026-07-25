// 会員画面：2026年9月以降の固定枠変更、全プランの「小さなお子様同伴」、予約間10分を反映。
// 予約回数・利用時間・締切・同伴者ルールなどは変更しない。
(function(){
  const originalOpenDialog=window.openDialog;

  // スタンダードは同時予約2枠。DB値が取得できる場合はDB値が優先される。
  if(typeof DEFAULT_RULES==='object'&&DEFAULT_RULES.standard)DEFAULT_RULES.standard.concurrent_limit=2;

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

  // 既存予約の実利用時間＋前後10分に、候補の実利用時間が重なる場合だけ予約不可。
  // これにより、例：00:00〜00:25の次は10分インターバル後の00:40〜が候補になる。
  window.reservationConflict=function(date,start,item){
    const candidateStart=startAt(date,Number(start));
    const candidateEnd=new Date(candidateStart.getTime()+Number(rule().use_minutes)*60000);
    const existingStart=startAt(item.date,Number(item.start_minute)-10);
    const existingEnd=new Date(startAt(item.date,Number(item.start_minute)).getTime()+(Number(item.use_minutes||40)+10)*60000);
    return candidateStart<existingEnd&&existingStart<candidateEnd;
  };

  if(typeof originalOpenDialog==='function'){
    window.openDialog=function(date,start){
      originalOpenDialog(date,start);
      const child=document.querySelector('#childWrap');
      if(child)child.classList.remove('hidden');
    };
  }
})();
