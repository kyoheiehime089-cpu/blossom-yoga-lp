(()=>{
  const $=q=>document.querySelector(q);
  const pad=n=>String(n).padStart(2,'0');
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
  const fmtMin=m=>{m=Number(m);return m===1440?'24:00':pad(Math.floor(m/60))+':'+pad(m%60)};
  const slotRange=m=>`${fmtMin(m)}〜${fmtMin(Number(m)+40)}`;
  const dateKey=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const jp=s=>{const d=new Date(s+'T00:00:00');return `${d.getMonth()+1}/${d.getDate()}（${'日月火水木金土'[d.getDay()]}）`};
  const today=()=>{const d=new Date();d.setHours(0,0,0,0);return d};
  let activeDate=dateKey(today());
  let lastSig='';

  function addStyles(){
    if($('#adminDayStatusStyle'))return;
    const style=document.createElement('style');
    style.id='adminDayStatusStyle';
    style.textContent=`
      .day-status-card{margin:18px 0;border-color:#dfc280;background:linear-gradient(180deg,#fffaf2,#fff7e4)}
      .day-status-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-end;flex-wrap:wrap;margin-bottom:12px}
      .day-status-controls{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.day-status-controls input{width:auto;min-height:44px}
      .day-status-counts{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:12px 0}.day-status-counts .mini-stat{padding:12px;border:1px solid var(--line);border-radius:16px;background:#fffdf8}.mini-stat p{margin:0;color:var(--muted);font-size:12px;font-weight:900}.mini-stat strong{font-size:26px;line-height:1.1}
      .day-status-list{display:grid;gap:10px}.day-status-item{display:grid;grid-template-columns:120px 1fr;gap:12px;padding:14px;border:1px solid var(--line);border-radius:18px;background:#fffdf8}.day-status-time{font-size:18px;font-weight:950}.day-status-main strong{display:block;font-size:17px}.day-status-main p{margin:4px 0 0;color:var(--muted);font-size:13px}.day-status-badge{display:inline-flex;width:max-content;max-width:100%;border-radius:999px;padding:5px 10px;font-size:12px;font-weight:950;margin-bottom:4px}.day-status-badge.reserved{background:#e4f7ec;color:#236b43}.day-status-badge.closed{background:#ffe8e4;color:#9a3728}.day-status-badge.yoga{background:#e7f0ff;color:#245d9b}.day-status-badge.program{background:#efe5ff;color:#68449c}.day-status-empty{padding:16px;border:1px solid var(--line);border-radius:18px;background:#fffdf8;color:var(--muted);font-weight:900}
      @media(max-width:640px){.day-status-counts{grid-template-columns:1fr}.day-status-item{grid-template-columns:1fr}.day-status-controls input,.day-status-controls button{width:100%}}
    `;
    document.head.appendChild(style);
  }

  function ensureCard(){
    const dashboard=$('#dashboardTab');
    if(!dashboard)return null;
    let card=$('#adminDayStatusCard');
    if(card)return card;
    const summary=$('#summary');
    card=document.createElement('section');
    card.id='adminDayStatusCard';
    card.className='card day-status-card';
    card.innerHTML=`
      <div class="day-status-head">
        <div><p class="eyebrow">日別予約状況</p><h2 id="adminDayStatusTitle">本日の予約状況</h2><p class="small">選択した日の予約・予約不可・ヨガ系枠を時間順で確認できます。</p></div>
        <div class="day-status-controls"><button id="adminDayPrev" class="ghost" type="button">前の日</button><button id="adminDayToday" class="ghost" type="button">今日</button><button id="adminDayNext" class="ghost" type="button">次の日</button><input id="adminDayDate" type="date"></div>
      </div>
      <div id="adminDayCounts" class="day-status-counts"></div>
      <div id="adminDayList" class="day-status-list"></div>
    `;
    if(summary)summary.insertAdjacentElement('afterend',card);else dashboard.prepend(card);
    $('#adminDayDate').value=activeDate;
    $('#adminDayPrev').addEventListener('click',()=>shiftDate(-1));
    $('#adminDayToday').addEventListener('click',()=>{activeDate=dateKey(today());render(true)});
    $('#adminDayNext').addEventListener('click',()=>shiftDate(1));
    $('#adminDayDate').addEventListener('change',e=>{if(e.target.value){activeDate=e.target.value;render(true)}});
    return card;
  }

  function shiftDate(delta){
    const d=new Date(activeDate+'T00:00:00');
    d.setDate(d.getDate()+delta);
    activeDate=dateKey(d);
    render(true);
  }

  function programRows(date){
    const d=new Date(date+'T00:00:00');
    const day=d.getDay();
    const rows=[];
    const push=(start,end,label)=>rows.push({kind:'program',start,end,title:label,detail:'固定プログラム・予約不可時間'});
    const holidays=['2026-01-01','2026-01-12','2026-02-11','2026-02-23','2026-03-20','2026-04-29','2026-05-03','2026-05-04','2026-05-05','2026-05-06','2026-07-20','2026-08-11','2026-09-21','2026-09-22','2026-09-23','2026-10-12','2026-11-03','2026-11-23'];
    if(holidays.includes(date)){push(510,820,'祝日プログラム枠');return rows;}
    if(day===1){push(510,610,'午前プログラム枠');push(1080,1330,'夜プログラム枠');}
    if(day===2){push(510,610,'午前プログラム枠');push(720,820,'通常ヨガ枠');push(1080,1330,'夜プログラム枠');}
    if(day===3){push(1080,1330,'夜プログラム枠');}
    if(day===4){push(690,790,'昼プログラム枠');push(1215,1315,'夜プログラム枠');}
    if(day===5){push(1080,1330,'夜プログラム枠');}
    if(day===0||day===6){push(460,820,'土日プログラム枠');}
    return rows;
  }

  function buildRows(){
    const snap=window.snap||{};
    const reservations=(snap.reservations||[]).filter(r=>r.date===activeDate).map(r=>({kind:'reserved',start:Number(r.start_minute),end:Number(r.start_minute)+40,title:r.member_name||'会員名なし',detail:[r.member_code,r.plan,r.people].filter(Boolean).join(' / '),note:r.note||''}));
    const closed=(snap.closed_slots||[]).filter(c=>c.date===activeDate).map(c=>({kind:'closed',start:Number(c.start_minute),end:Number(c.start_minute)+40,title:'予約不可',detail:c.reason||'理由なし',note:''}));
    const external=(snap.external_blocks||[]).filter(x=>x.date===activeDate).map(x=>({kind:'yoga',start:Number(x.start_minute),end:Number(x.display_end_minute??x.end_minute??Number(x.start_minute)+40),title:x.member_name?`ヨガ個別予約：${x.member_name}`:'ヨガ個別予約',detail:x.instructor_name?`インストラクター：${x.instructor_name}`:'ヨガ系枠',note:x.note||''}));
    return reservations.concat(closed,external,programRows(activeDate)).sort((a,b)=>a.start-b.start||a.end-b.end);
  }

  function render(force=false){
    addStyles();
    const card=ensureCard();
    if(!card||!window.snap)return;
    const sig=activeDate+'|'+JSON.stringify({r:(window.snap.reservations||[]).filter(x=>x.date===activeDate).length,c:(window.snap.closed_slots||[]).filter(x=>x.date===activeDate).length,e:(window.snap.external_blocks||[]).filter(x=>x.date===activeDate).length});
    if(!force&&sig===lastSig)return;
    lastSig=sig;
    const rows=buildRows();
    const counts={reserved:rows.filter(x=>x.kind==='reserved').length,closed:rows.filter(x=>x.kind==='closed').length,yoga:rows.filter(x=>x.kind==='yoga'||x.kind==='program').length};
    $('#adminDayDate').value=activeDate;
    $('#adminDayStatusTitle').textContent=`${jp(activeDate)}の予約状況`;
    $('#adminDayCounts').innerHTML=`<div class="mini-stat"><p>予約</p><strong>${counts.reserved}</strong></div><div class="mini-stat"><p>予約不可</p><strong>${counts.closed}</strong></div><div class="mini-stat"><p>ヨガ・プログラム</p><strong>${counts.yoga}</strong></div>`;
    $('#adminDayList').innerHTML=rows.length?rows.map(row=>`<article class="day-status-item"><div class="day-status-time">${fmtMin(row.start)}〜${fmtMin(row.end)}</div><div class="day-status-main"><span class="day-status-badge ${row.kind}">${row.kind==='reserved'?'予約済み':row.kind==='closed'?'予約不可':row.kind==='yoga'?'ヨガ系':'プログラム枠'}</span><strong>${esc(row.title)}</strong><p>${esc(row.detail)}</p>${row.note?`<p>メモ：${esc(row.note)}</p>`:''}</div></article>`).join(''):'<div class="day-status-empty">この日の予約・予約不可枠はありません。</div>';
  }

  document.addEventListener('DOMContentLoaded',()=>{addStyles();ensureCard();render(true);setInterval(()=>render(false),1000);});
})();