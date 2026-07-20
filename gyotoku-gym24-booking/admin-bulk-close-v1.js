document.addEventListener('DOMContentLoaded',()=>{
  // 火曜12:00〜13:40は通常ヨガ。2026年9月以降、火曜8:30〜10:10は廃止。
  if(typeof scheduleBlocks==='function'){
    scheduleBlocks=function(date){
      const day=new Date(`${date}T00:00:00`).getDay();
      if(typeof holiday==='function'&&holiday(date))return[[510,820]];
      if(day===1)return[[510,610],[1080,1330]];
      if(day===2){
        const blocks=[[720,820],[1080,1330]];
        if(date<'2026-09-01')blocks.unshift([510,610]);
        return blocks;
      }
      if(day===3)return[[1080,1330]];
      if(day===4)return[[690,790],[1215,1315]];
      if(day===5)return[[1080,1330]];
      if(day===6||day===0)return[[460,820]];
      return[];
    };
  }

  const settings=document.querySelector('#settingsTab');
  const oldForm=document.querySelector('#addClosed');
  if(!settings||!oldForm)return;
  oldForm.classList.add('hidden');

  const section=document.createElement('section');
  section.innerHTML=`
    <h2>時間をまとめて利用不可にする</h2>
    <p class="small">研修・設備点検などで店舗を使う時間を、開始から終了まで一括で閉じます。行徳ジム24とヨガの両方で予約できなくなります。</p>
    <form id="bulkClosedForm" class="mini">
      <label>日付<input name="date" type="date" required></label>
      <div class="two">
        <label>開始時間<select name="start" required></select></label>
        <label>終了時間<select name="end" required></select></label>
      </div>
      <label>理由<input name="reason" placeholder="例：店舗研修"></label>
      <button class="btn">この時間帯を一括で閉じる</button>
    </form>`;
  oldForm.insertAdjacentElement('afterend',section);

  const form=section.querySelector('#bulkClosedForm');
  const start=form.elements.start,end=form.elements.end;
  const options=[];
  for(let m=0;m<=1440;m+=10)options.push(`<option value="${m}">${formatMinute(m)}</option>`);
  start.innerHTML=options.slice(0,-1).join('');
  end.innerHTML=options.slice(1).join('');
  start.value='540'; end.value='1080';

  start.addEventListener('change',()=>{
    if(Number(end.value)<=Number(start.value))end.value=String(Math.min(1440,Number(start.value)+40));
  });

  form.addEventListener('submit',async event=>{
    event.preventDefault();
    const data=new FormData(form);
    const date=data.get('date'),from=Number(data.get('start')),to=Number(data.get('end'));
    if(!date)return alert('日付を選択してください。');
    if(from>=to)return alert('終了時間は開始時間より後にしてください。');
    const label=`${japaneseDate(date)} ${formatMinute(from)}〜${formatMinute(to)}`;
    if(!confirm(`${label}を一括で利用不可にします。よろしいですか？`))return;
    try{
      await rpc('fs_admin_close_range',{p_admin_password:adminPassword,p_date:date,p_start_minute:from,p_end_minute:to,p_reason:String(data.get('reason')||'')});
      await loadSnapshot();
      toast('指定した時間帯を一括で利用不可にしました。');
    }catch(error){alert(error.message);}
  });

  if(typeof renderClosed==='function'){
    renderClosed=function(){
      const items=snapshot.closed_slots||[];
      document.querySelector('#closed').innerHTML=items.length?items.map(item=>{
        const endMinute=Number(item.start_minute)+Number(item.block_minutes||50);
        return `<article class='res'><h3>${escapeHtml(japaneseDate(item.date))} ${formatMinute(item.start_minute)}〜${formatMinute(endMinute)}</h3><p>${escapeHtml(item.reason||'理由なし')}</p><button class='danger' data-open='${escapeHtml(item.id)}'>解除</button></article>`;
      }).join(''):'<article class="res"><p>利用不可枠はありません。</p></article>';
    };
  }
});