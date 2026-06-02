(()=>{
  const db=window.supabase.createClient(window.FRIENDS_SUPABASE_URL,window.FRIENDS_SUPABASE_ANON_KEY);
  const $=q=>document.querySelector(q);
  const pad=n=>String(n).padStart(2,'0');
  const USE_MINUTES=50,DAY_END_MINUTE=480;
  const fmt=m=>{m=Number(m);let prefix=m>=1440?'翌':'';m=((m%1440)+1440)%1440;return prefix+pad(Math.floor(m/60))+':'+pad(m%60)};
  const HOL=['2026-01-01','2026-01-12','2026-02-11','2026-02-23','2026-03-20','2026-04-29','2026-05-03','2026-05-04','2026-05-05','2026-05-06','2026-07-20','2026-08-11','2026-09-21','2026-09-22','2026-09-23','2026-10-12','2026-11-03','2026-11-23'];
  async function rpc(name,args){const {data,error}=await db.rpc(name,args);if(error)return{ok:false,error:error.message};return data||{ok:false,error:'応答がありません'};}
  function pass(){return document.getElementById('adminPass')?.value||sessionStorage.getItem('fs_admin_pass')||'';}
  function toast(msg){if(window.adminSoftToast)window.adminSoftToast(msg);else alert(msg)}
  function previousDateKey(d){let x=new Date(d+'T00:00:00');x.setDate(x.getDate()-1);return x.getFullYear()+'-'+pad(x.getMonth()+1)+'-'+pad(x.getDate())}
  function fixedStarts(){let a=[],anchor=490;for(let m=anchor;m<1440;m+=50)a.push(m);for(let m=anchor-50;m>=480;m-=50)a.unshift(m);return a.filter(m=>m>=DAY_END_MINUTE&&m+USE_MINUTES<=1440)}
  function overlapsWindow(slotStart,slotEnd,blockedStart,blockedEnd){return slotStart<blockedEnd&&slotEnd>blockedStart}
  function mergeWindows(windows){return windows.sort((a,b)=>a[0]-b[0]).reduce((acc,w)=>{let last=acc.at(-1);if(last&&w[0]<=last[1])last[1]=Math.max(last[1],w[1]);else acc.push([...w]);return acc},[])}
  function programLessons(d){let day=new Date(d+'T00:00:00').getDay(),hol=HOL.includes(d),semi=[],yoga=[];if(hol||day===0||day===6)semi=[[600,640],[650,690],[700,740],[750,790]];else if([1,2,3,5].includes(day))semi=[[1110,1150],[1160,1200],[1210,1250],[1260,1300]];if(hol)yoga=[[540,580]];else if(day===1)yoga=[[540,580]];else if(day===2)yoga=[[540,580],[750,790]];else if(day===4)yoga=[[1245,1285]];else if(day===0||day===6)yoga=[[490,530],[540,580]];return {semi,yoga}}
  function blocks(d){let lessons=programLessons(d),windows=[];lessons.semi.forEach(([s,e])=>windows.push([s-30,e+30]));lessons.yoga.forEach(([s,e])=>windows.push([s-30,e+30]));return mergeWindows(windows.map(([s,e])=>[Math.max(0,s),Math.min(1440,e)]))}
  function eveningFlexibleStart(d){let day=new Date(d+'T00:00:00').getDay();if([1,2,3,5].includes(day))return 1330;if(day===4)return 1320;return null}
  function overnightStarts(d){let a=[],evening=eveningFlexibleStart(d);if(evening!==null){for(let m=evening;m<1440;m+=10)a.push(m)}if(eveningFlexibleStart(previousDateKey(d))!==null){for(let m=0;m+USE_MINUTES<=DAY_END_MINUTE;m+=10)a.push(m)}return a}
  function starts(d){let set=new Set(fixedStarts());overnightStarts(d).forEach(m=>set.add(m));return [...set].sort((a,b)=>a-b)}
  function blockedByProgram(d,m){let a=Number(m),b=a+60;return blocks(d).some(([s,e])=>overlapsWindow(a,b,s,e))}
  function ensure(){
    if($('#bulkClosePanel'))return;
    const target=$('#settingsTab')||$('#calendarTab');
    if(!target)return;
    const manual=target.querySelector('#addClosed');
    const html=`<section id="bulkClosePanel" class="res" style="margin:18px 0"><h3>まとめて枠を埋める</h3><p class="small">通常は上の「手動利用不可」で1枠ずつ設定してください。1日休業・長時間メンテナンスの時だけ一括管理を使います。</p><button id="showBulkClose" type="button" class="ghost" style="width:100%;justify-content:center">一括管理を開く</button><form id="bulkCloseForm" class="mini hidden" style="margin-top:12px"><label>日付<input name="date" type="date" required></label><label>範囲<select name="mode"><option value="day">1日丸ごと利用不可</option><option value="range">時間帯を指定</option></select></label><div id="bulkTimeFields" class="two hidden"><label>開始時刻<input name="start" type="time" value="09:00"></label><label>終了時刻<input name="end" type="time" value="18:00"></label></div><label>理由<input name="reason" placeholder="例：メンテナンス・清掃・臨時休業"></label><button class="btn">一括で利用不可にする</button></form></section>`;
    if(manual){manual.insertAdjacentHTML('afterend',html)}else{target.insertAdjacentHTML('beforeend',html)}
    $('#showBulkClose').addEventListener('click',()=>{
      const f=$('#bulkCloseForm');
      f.classList.toggle('hidden');
      $('#showBulkClose').textContent=f.classList.contains('hidden')?'一括管理を開く':'一括管理を閉じる';
    });
    $('#bulkCloseForm [name="mode"]').addEventListener('change',e=>{$('#bulkTimeFields').classList.toggle('hidden',e.target.value!=='range')});
    $('#bulkCloseForm').addEventListener('submit',submit);
  }
  function timeToMin(v){let [h,m]=String(v||'00:00').split(':').map(Number);return h*60+m}
  async function submit(e){
    e.preventDefault();
    const fd=new FormData(e.currentTarget);
    const date=fd.get('date');
    const mode=fd.get('mode');
    const reason=String(fd.get('reason')||'管理者一括設定').trim()||'管理者一括設定';
    let s=0, end=1440;
    if(mode==='range'){
      s=timeToMin(fd.get('start'));
      end=timeToMin(fd.get('end'));
      if(end<=s){alert('終了時刻は開始時刻より後にしてください。');return;}
    }
    const ok=confirm(mode==='day'?`${date} を1日丸ごと利用不可にしますか？\n既存予約は変更されません。`:`${date} の ${fmt(s)}〜${fmt(end)} を利用不可にしますか？\n既存予約は変更されません。`);
    if(!ok)return;
    let count=0, skipped=0;
    for(const m of starts(date)){
      if(m<s||m>=end||blockedByProgram(date,m)){skipped++;continue;}
      const r=await rpc('fs_admin_close_slot',{p_admin_password:pass(),p_date:date,p_start_minute:m,p_reason:reason});
      if(r.ok)count++; else skipped++;
    }
    toast(`${count}枠を利用不可にしました`);
    e.currentTarget.reset();
    if(typeof window.loadSnapshot==='function')await window.loadSnapshot();
  }
  document.addEventListener('DOMContentLoaded',ensure);
  setTimeout(ensure,800);
})();