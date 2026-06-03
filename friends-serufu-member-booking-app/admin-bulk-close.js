(()=>{
  const USE_MINUTES=40;
  const SLOT_STEP_MINUTES=50;
  const BLOCK_MINUTES=50;
  const db=window.supabase.createClient(window.FRIENDS_SUPABASE_URL,window.FRIENDS_SUPABASE_ANON_KEY);
  const $=q=>document.querySelector(q);
  const pad=n=>String(n).padStart(2,'0');
  const fmt=m=>pad(Math.floor(Number(m)/60))+':'+pad(Number(m)%60);
  const HOL=['2026-01-01','2026-01-12','2026-02-11','2026-02-23','2026-03-20','2026-04-29','2026-05-03','2026-05-04','2026-05-05','2026-05-06','2026-07-20','2026-08-11','2026-09-21','2026-09-22','2026-09-23','2026-10-12','2026-11-03','2026-11-23'];
  async function rpc(name,args){const {data,error}=await db.rpc(name,args);if(error)return{ok:false,error:error.message};return data||{ok:false,error:'応答がありません'};}
  function pass(){return document.getElementById('adminPass')?.value||sessionStorage.getItem('fs_admin_pass')||'';}
  function toast(msg){if(window.adminSoftToast)window.adminSoftToast(msg);else alert(msg)}
  function starts(){let a=[],anchor=490;for(let m=anchor;m<1440;m+=SLOT_STEP_MINUTES)a.push(m);for(let m=anchor-SLOT_STEP_MINUTES;m>=0;m-=SLOT_STEP_MINUTES)a.unshift(m);return a.filter(m=>m+BLOCK_MINUTES<=1440)}
  function blocks(d){let day=new Date(d+'T00:00:00').getDay();if(day===6)return[[490,530],[600,790]];if(day===0||HOL.includes(d))return[[540,580],[600,790]];return[[720,760],[1110,1300]]}
  function blockedByProgram(d,m){let a=Number(m),b=a+BLOCK_MINUTES;return blocks(d).some(([s,e])=>a<e&&s<b)}
  function ensure(){
    if($('#bulkClosePanel'))return;
    const target=$('#settingsTab')||$('#calendarTab');
    if(!target)return;
    const manual=target.querySelector('#addClosed');
    const html=`<section id="bulkClosePanel" class="res" style="margin:18px 0"><h3>まとめて枠を埋める</h3><p class="small">通常は上の「手動利用不可」で${USE_MINUTES}分利用の枠を1枠ずつ設定してください。1日休業・長時間メンテナンスの時だけ一括管理を使います。</p><button id="showBulkClose" type="button" class="ghost" style="width:100%;justify-content:center">一括管理を開く</button><form id="bulkCloseForm" class="mini hidden" style="margin-top:12px"><label>日付<input name="date" type="date" required></label><label>範囲<select name="mode"><option value="day">1日丸ごと利用不可</option><option value="range">時間帯を指定</option></select></label><div id="bulkTimeFields" class="two hidden"><label>開始時刻<input name="start" type="time" value="09:00"></label><label>終了時刻<input name="end" type="time" value="18:00"></label></div><label>理由<input name="reason" placeholder="例：メンテナンス・清掃・臨時休業"></label><button class="btn">一括で利用不可にする</button></form></section>`;
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
    for(const m of starts()){
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