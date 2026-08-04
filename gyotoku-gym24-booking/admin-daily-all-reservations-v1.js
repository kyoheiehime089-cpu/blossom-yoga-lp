// 管理者画面専用：行徳ジム24とヨガ個別予約を日付ごとにまとめて表示する。
// 既存の予約・プラン・競合判定には触れない。
(function(){
  let yogaReservations=[];
  let selectedDate='';
  let loadingYoga=false;

  const minuteLabel=value=>{
    const minute=Number(value||0);
    if(minute===1440)return '24:00';
    return `${String(Math.floor(minute/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`;
  };
  const todayKey=()=>{
    const now=new Date();
    return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  };
  const addDays=(dateText,days)=>{
    const date=new Date(`${dateText}T00:00:00`);
    date.setDate(date.getDate()+days);
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  };
  const dateTitle=dateText=>{
    const date=new Date(`${dateText}T00:00:00`);
    return `${date.getMonth()+1}月${date.getDate()}日（${'日月火水木金土'[date.getDay()]}）`;
  };

  function ensureUi(){
    if(document.querySelector('#allDailyReservations'))return;
    const todayList=document.querySelector('#todayReservations');
    if(!todayList)return;
    const section=document.createElement('section');
    section.id='allDailyReservations';
    section.style.marginTop='28px';
    section.innerHTML=`
      <p class="eyebrow">日別予約一覧</p>
      <h2>その日の全予約</h2>
      <p class="small">行徳ジム24の会員予約とヨガ個別予約を、日付ごとにまとめて確認できます。</p>
      <div class="week" style="margin-top:14px">
        <button type="button" class="ghost" id="allReservationsPrev">前の日</button>
        <button type="button" class="ghost" id="allReservationsToday">今日</button>
        <button type="button" class="btn" id="allReservationsNext" style="margin:0;min-height:44px">次の日</button>
      </div>
      <label style="display:block;margin-top:14px">確認する日付
        <input id="allReservationsDate" type="date">
      </label>
      <h3 id="allReservationsDateTitle" style="margin-top:20px"></h3>
      <div id="allReservationsList" class="list"></div>`;
    todayList.insertAdjacentElement('afterend',section);
    selectedDate=selectedDate||todayKey();
    document.querySelector('#allReservationsDate').value=selectedDate;
    document.querySelector('#allReservationsDate').addEventListener('change',event=>{
      selectedDate=event.target.value||todayKey();
      renderDaily();
    });
    document.querySelector('#allReservationsPrev').addEventListener('click',()=>changeDate(-1));
    document.querySelector('#allReservationsToday').addEventListener('click',()=>setDate(todayKey()));
    document.querySelector('#allReservationsNext').addEventListener('click',()=>changeDate(1));
  }

  function setDate(value){
    selectedDate=value;
    const input=document.querySelector('#allReservationsDate');
    if(input)input.value=value;
    renderDaily();
  }
  function changeDate(days){setDate(addDays(selectedDate||todayKey(),days));}

  async function loadYogaReservations(){
    if(loadingYoga||!adminPassword)return;
    loadingYoga=true;
    try{
      const data=await rpc('fs_yoga_private_snapshot_central',{p_admin_password:adminPassword});
      yogaReservations=data.yoga_reservations||[];
    }catch(error){
      console.error('ヨガ予約一覧の取得に失敗しました。',error);
    }finally{
      loadingYoga=false;
      renderDaily();
    }
  }

  function renderDaily(){
    ensureUi();
    const title=document.querySelector('#allReservationsDateTitle');
    const list=document.querySelector('#allReservationsList');
    if(!title||!list)return;
    const date=selectedDate||todayKey();
    title.textContent=dateTitle(date);

    const gym=(snapshot?.reservations||[])
      .filter(item=>String(item.date)===date)
      .map(item=>({
        type:'gym',
        start:Number(item.start_minute),
        end:Number(item.start_minute)+Number(item.use_minutes_snapshot||40),
        name:item.member_name||'会員名未登録',
        users:[item.user1_name_snapshot,item.user2_name_snapshot].filter(Boolean).join('・'),
        plan:item.plan
      }));
    const yoga=yogaReservations
      .filter(item=>String(item.date)===date)
      .map(item=>({
        type:'yoga',
        start:Number(item.start_minute),
        end:Number(item.end_minute),
        name:item.member_name||'会員名未登録',
        note:item.note||''
      }));
    const all=[...gym,...yoga].sort((a,b)=>a.start-b.start||a.end-b.end);

    list.innerHTML=all.length?all.map(item=>{
      if(item.type==='yoga'){
        return `<article class="res"><p class="eyebrow">ヨガ個別予約</p><h3>${minuteLabel(item.start)}〜${minuteLabel(item.end)}</h3><p><strong>${escapeHtml(item.name)}</strong></p>${item.note?`<p class="small">${escapeHtml(item.note)}</p>`:''}</article>`;
      }
      const userText=item.users&&item.users!==item.name?`<p>利用者：${escapeHtml(item.users)}</p>`:'';
      return `<article class="res"><p class="eyebrow">行徳ジム24</p><h3>${minuteLabel(item.start)}〜${minuteLabel(item.end)}</h3><p><strong>${escapeHtml(item.name)}</strong> / ${escapeHtml(planLabel(item.plan))}</p>${userText}</article>`;
    }).join(''):'<article class="res"><p>この日の予約はありません。</p></article>';
  }

  const originalRenderAll=window.renderAll;
  window.renderAll=function(){
    originalRenderAll();
    ensureUi();
    renderDaily();
    loadYogaReservations();
  };

  document.addEventListener('DOMContentLoaded',()=>{
    selectedDate=todayKey();
    ensureUi();
    renderDaily();
  });
})();
