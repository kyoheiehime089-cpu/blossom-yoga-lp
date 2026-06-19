(function(){
  'use strict';
  const START=480,END=1320,PX_PER_MIN=1.05;
  const pad=n=>String(n).padStart(2,'0');
  const wchars='日月火水木金土';
  function safeCall(name,...args){return typeof window[name]==='function'?window[name](...args):null;}
  function dateKey(d){return safeCall('dk',d)||`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;}
  function minuteLabel(m){return typeof window.fmtMin==='function'?window.fmtMin(m):`${pad(Math.floor(m/60))}:${pad(m%60)}`;}
  function rangeLabel(m){return typeof window.slotRange==='function'?window.slotRange(m):`${minuteLabel(m)}〜${minuteLabel(Number(m)+40)}`;}
  function weekDates(){const s=typeof window.weekStart==='function'?window.weekStart():new Date();const out=[];for(let i=0;i<7;i++){const d=new Date(s);d.setDate(s.getDate()+i);out.push(d);}return out;}
  function timeLabels(){let out=[];for(let m=START;m<=END;m+=60)out.push(`<div class="week-time-label" style="top:${(m-START)*PX_PER_MIN}px">${minuteLabel(m)}</div>`);return out.join('');}
  function dayHead(d){const key=dateKey(d),today=dateKey(new Date()),w=d.getDay();return `<div class="week-day-head ${key===today?'today':''} ${w===0||w===6?'weekend':''}"><div>${d.getMonth()+1}/${d.getDate()}<small>${key===today?'今日':wchars[w]}</small></div></div>`;}
  function starts(){return typeof window.fixedStartArr==='function'?window.fixedStartArr().map(Number).filter(m=>m>=START&&m<END):[];}
  function blockHtml(dkey,m){
    const top=Math.max(0,(Number(m)-START)*PX_PER_MIN),h=Math.max(30,40*PX_PER_MIN);
    if(typeof window.conflict==='function'&&window.conflict(dkey,m)){
      return `<article class="slot-row closed admin-week-block" style="top:${top}px;height:${h}px"><div class="time">${rangeLabel(m)}</div><div><span class="pill closed">予約不可</span></div></article>`;
    }
    if(typeof window.slotRow==='function'){
      return window.slotRow(dkey,m).replace(/<article class='slot-row /,"<article style='top:"+top+"px;height:"+h+"px' class='slot-row admin-week-block ");
    }
    return '';
  }
  function renderWeekCalendar(){
    const list=document.getElementById('calendarList');
    if(!list) return;
    const s=typeof window.weekStart==='function'?window.weekStart():new Date();
    const e=new Date(s);e.setDate(s.getDate()+6);
    if(document.getElementById('weekLabel')) document.getElementById('weekLabel').textContent=`${safeCall('jp',dateKey(s))||dateKey(s)} 〜 ${safeCall('jp',dateKey(e))||dateKey(e)}`;
    const daysEl=document.getElementById('days');
    const dates=weekDates();
    if(daysEl){daysEl.innerHTML=dates.map((d,i)=>`<button class='day ${i===0?'active':''}' data-day='${i}'><strong>${d.getMonth()+1}/${d.getDate()}</strong><span>${wchars[d.getDay()]}</span></button>`).join('');}
    const bodyHeight=(END-START)*PX_PER_MIN;
    const heads=dates.map(dayHead).join('');
    const cols=dates.map(d=>{const key=dateKey(d),today=dateKey(new Date());const items=starts().map(m=>blockHtml(key,m)).join('');return `<div class="week-day-col ${key===today?'today':''}">${items||'<div class="week-empty-note">表示枠なし</div>'}</div>`;}).join('');
    list.innerHTML=`<div class="week-time-grid"><div class="week-time-grid-inner" style="--grid-height:${bodyHeight}px"><div class="week-time-head"><div class="week-time-corner">時間</div>${heads}</div><div class="week-time-body"><div class="week-time-axis">${timeLabels()}</div>${cols}</div></div></div>`;
  }
  window.renderCalendar=renderWeekCalendar;
})();
