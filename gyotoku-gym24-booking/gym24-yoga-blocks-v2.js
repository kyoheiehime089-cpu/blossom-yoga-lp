let gym24YogaBlocks=[];
let gym24YogaRefreshing=false;
const gym24SelectedStarts=new Map();

function gym24CurrentDate(){
  return typeof selectedDate==='function'&&typeof dateKey==='function'?dateKey(selectedDate()):'';
}

function gym24RememberSelectedTime(){
  const select=document.querySelector('#startSelect');
  const date=gym24CurrentDate();
  if(select?.value&&date)gym24SelectedStarts.set(date,String(select.value));
}

function gym24RestoreSelectedTime(){
  const select=document.querySelector('#startSelect');
  const date=gym24CurrentDate();
  const saved=date?gym24SelectedStarts.get(date):'';
  if(!select||!saved)return;
  const exists=[...select.options].some(option=>option.value===saved);
  if(exists)select.value=saved;
}

function gym24YogaMinuteConflict(date,start){
  const gymStart=Number(start);
  const gymEnd=gymStart+Number(rule().use_minutes);
  return gym24YogaBlocks.find(block=>{
    if(String(block.date)!==String(date))return false;
    const yogaStart=Number(block.start_minute)-30;
    const yogaEnd=Number(block.end_minute)+30;
    return gymStart<yogaEnd&&yogaStart<gymEnd;
  });
}

function externalBlock(date,start){
  return gym24YogaMinuteConflict(date,start)||(snapshot?.external_blocks||[]).find(x=>x.date===date&&overlaps(Number(start)-10,Number(start)+Number(rule().use_minutes)+10,x.start_minute,Number(x.block_end_minute??x.end_minute)));
}

const gym24OriginalRenderCalendar=renderCalendar;
renderCalendar=function(){
  gym24RememberSelectedTime();
  gym24OriginalRenderCalendar();
  gym24RestoreSelectedTime();
};

async function gym24LoadYogaBlocks({refreshCalendar=true}={}){
  if(gym24YogaRefreshing)return;
  gym24YogaRefreshing=true;
  try{
    const result=await gyotokuDb.rpc('fs_yoga_public_blocks',{});
    if(result.error||!result.data?.ok)return;
    const next=result.data.blocks||[];
    const changed=JSON.stringify(next)!==JSON.stringify(gym24YogaBlocks);
    gym24YogaBlocks=next;
    const dialogOpen=document.querySelector('#dialog')?.open;
    if(changed&&refreshCalendar&&snapshot&&!dialogOpen)renderCalendar();
  }finally{
    gym24YogaRefreshing=false;
  }
}

document.addEventListener('change',event=>{
  if(event.target?.id==='startSelect')gym24RememberSelectedTime();
},true);

document.addEventListener('input',event=>{
  if(event.target?.id==='startSelect')gym24RememberSelectedTime();
},true);

document.addEventListener('click',event=>{
  const button=event.target.closest('[data-book]');
  if(!button)return;
  const select=document.querySelector('#startSelect');
  const date=gym24CurrentDate();
  const saved=date?gym24SelectedStarts.get(date):'';
  if(select&&saved&&[...select.options].some(option=>option.value===saved))select.value=saved;
  if(select?.value&&gym24YogaMinuteConflict(date,Number(select.value))){
    event.preventDefault();
    event.stopImmediatePropagation();
    renderCalendar();
    toast('ヨガ予約の前後30分と重なるため、この時間は予約できません。');
  }
},true);

document.addEventListener('DOMContentLoaded',()=>{
  gym24LoadYogaBlocks();
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)gym24LoadYogaBlocks();});
  setInterval(()=>gym24LoadYogaBlocks(),30000);
});
