(function(){
  'use strict';
  const START_BY_FILTER={all:480,morning:300,day:660,night:1020,midnight:0};
  const END_BY_FILTER={all:1320,morning:660,day:1020,night:1320,midnight:480};
  const PX_PER_MIN=1.05;
  const pad=n=>String(n).padStart(2,'0');
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
  const wchars='日月火水木金土';
  function safeCall(name,...args){return typeof window[name]==='function'?window[name](...args):null;}
  function dateKey(d){return safeCall('dk',d)||`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;}
  function minuteLabel(m){return typeof window.fmt==='function'?window.fmt(m):`${pad(Math.floor(m/60))}:${pad(m%60)}`;}
  function rangeLabel(m){return typeof window.slotRange==='function'?window.slotRange(m):`${minuteLabel(m)}〜${minuteLabel(Number(m)+40)}`;}
  function weekDates(){
    const s=typeof window.weekStart==='function'?window.weekStart():new Date();
    const out=[];
    for(let i=0;i<7;i++){const d=new Date(s);d.setDate(s.getDate()+i);out.push(d);}
    return out;
  }
  function timeLabels(start,end){
    const out=[];
    for(let m=start;m<=end;m+=60) out.push(`<div class="week-time-label" style="top:${(m-start)*PX_PER_MIN}px">${minuteLabel(m)}</div>`);
    return out.join('');
  }
  function dayHead(d){
    const key=dateKey(d),today=dateKey(new Date()),w=d.getDay();
    return `<div class="week-day-head ${key===today?'today':''} ${w===0||w===6?'weekend':''}"><div>${d.getMonth()+1}/${d.getDate()}<small>${key===today?'今日':wchars[w]}</small></div></div>`;
  }
  function startsForFilter(f,start,end){
    let starts=[];
    if(typeof window.fixedStarts==='function') starts=starts.concat(window.fixedStarts());
    if(f==='midnight'&&typeof window.flexibleStarts==='function') starts=starts.concat(window.flexibleStarts());
    return [...new Set(starts.map(Number))].filter(m=>m>=start&&m<end).sort((a,b)=>a-b);
  }
  function blockHtml(dkey,m,start){
    const top=Math.max(0,(Number(m)-start)*PX_PER_MIN);
    const h=Math.max(30,40*PX_PER_MIN);
    if(typeof window.conflict==='function'&&window.conflict(dkey,m)){
      return `<button class="slot booked week-block" disabled style="top:${top}px;height:${h}px"><span class="time">${rangeLabel(m)}</span><span class="status">予約不可</span></button>`;
    }
    if(typeof window.slot==='function'){
      const raw=window.slot(dkey,m);
      return raw.replace(/<button class='slot /,"<button style='top:"+top+"px;height:"+h+"px' class='slot week-block ");
    }
    return '';
  }
  function renderWeekCalendar(){
    const cal=document.getElementById('calendar');
    const filter=document.getElementById('timeFilter')?.value||'all';
    if(!cal) return;
    const start=START_BY_FILTER[filter]??480;
    const end=END_BY_FILTER[filter]??1320;
    const dates=weekDates();
    const bodyHeight=(end-start)*PX_PER_MIN;
    const heads=dates.map(dayHead).join('');
    const cols=dates.map(d=>{
      const key=dateKey(d),today=dateKey(new Date());
      const items=startsForFilter(filter,start,end).map(m=>blockHtml(key,m,start)).join('');
      return `<div class="week-day-col ${key===today?'today':''}">${items||'<div class="week-empty-note">表示枠なし</div>'}</div>`;
    }).join('');
    cal.innerHTML=`<div class="week-time-grid"><div class="week-time-grid-inner" style="--grid-height:${bodyHeight}px"><div class="week-time-head"><div class="week-time-corner">時間</div>${heads}</div><div class="week-time-body"><div class="week-time-axis">${timeLabels(start,end)}</div>${cols}</div></div></div>`;
  }
  window.renderCalendar=renderWeekCalendar;
})();
