// 会員画面：2026年9月以降の固定枠変更と、全プランの「小さなお子様同伴」表示だけを反映。
// 予約回数・利用時間・締切・同伴者ルールなどは変更しない。
(function(){
  const originalOpenDialog=window.openDialog;

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

  if(typeof originalOpenDialog==='function'){
    window.openDialog=function(date,start){
      originalOpenDialog(date,start);
      const child=document.querySelector('#childWrap');
      if(child)child.classList.remove('hidden');
    };
  }
})();
