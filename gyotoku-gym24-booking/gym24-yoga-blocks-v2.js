let gym24YogaBlocks=[];
let gym24YogaRefreshing=false;

function gym24YogaMinuteConflict(date,start){
  const gymStart=Number(start);
  const gymEnd=gymStart+Number(rule().use_minutes);
  return gym24YogaBlocks.find(block=>{
    if(String(block.date)!==String(date)) return false;
    const yogaStart=Number(block.start_minute)-30;
    const yogaEnd=Number(block.end_minute)+30;
    return gymStart<yogaEnd&&yogaStart<gymEnd;
  });
}

function externalBlock(date,start){
  return gym24YogaMinuteConflict(date,start)||(snapshot?.external_blocks||[]).find(x=>x.date===date&&overlaps(Number(start)-10,Number(start)+Number(rule().use_minutes)+10,x.start_minute,Number(x.block_end_minute??x.end_minute)));
}

async function gym24LoadYogaBlocks({refreshCalendar=true}={}){
  if(gym24YogaRefreshing)return;
  gym24YogaRefreshing=true;
  try{
    const result=await gyotokuDb.rpc('fs_yoga_public_blocks',{});
    if(result.error||!result.data?.ok)return;
    const next=result.data.blocks||[];
    const changed=JSON.stringify(next)!==JSON.stringify(gym24YogaBlocks);
    gym24YogaBlocks=next;
    const select=document.querySelector('#startSelect');
    const userIsChoosing=select&&document.activeElement===select;
    const dialogOpen=document.querySelector('#dialog')?.open;
    if(changed&&refreshCalendar&&snapshot&&!userIsChoosing&&!dialogOpen&&typeof renderCalendar==='function')renderCalendar();
  }finally{
    gym24YogaRefreshing=false;
  }
}

document.addEventListener('DOMContentLoaded',()=>{
  gym24LoadYogaBlocks();
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)gym24LoadYogaBlocks();});
  window.addEventListener('focus',()=>gym24LoadYogaBlocks());
  setInterval(()=>gym24LoadYogaBlocks(),30000);
});

document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-book]');
  if(!button)return;
  await gym24LoadYogaBlocks({refreshCalendar:false});
  const select=document.querySelector('#startSelect');
  if(!select?.value)return;
  const date=dateKey(selectedDate());
  if(gym24YogaMinuteConflict(date,Number(select.value))){
    event.preventDefault();
    event.stopImmediatePropagation();
    if(typeof renderCalendar==='function')renderCalendar();
    toast('ヨガ予約の前後30分と重なるため、この時間は予約できません。');
  }
},true);
