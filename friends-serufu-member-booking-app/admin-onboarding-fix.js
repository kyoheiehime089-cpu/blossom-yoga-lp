document.addEventListener('DOMContentLoaded',()=>{
  const form=document.getElementById('addMember');
  const box=document.getElementById('generatedLogin');
  const url='https://kyoheiehime089-cpu.github.io/blossom-yoga-lp/friends-serufu-member-booking-app/';
  function normalizePlanFix(p){if(p==='ファミリー週1（月4回）'||p==='ファミリープラン')return'ファミリー月4回プラン';if(p==='ファミリー週2（月8回）')return'ファミリー月8回プラン';if(p==='通い放題')return'月8回プラン';return p||'月4回プラン'}
  function nextIdFix(){let max=0;(S.members||[]).forEach(m=>{let n=Number(String(m.id||'').replace(/\D/g,''));if(n>max)max=n});return 'FS'+String(max+1).padStart(3,'0')}
  function pinFix(){return String(Math.floor(1000+Math.random()*9000))}
  function loginUrl(m){return url+'?'+new URLSearchParams({mid:m.id,pin:m.pin,name:m.name,email:m.email||'',plan:m.plan}).toString()}
  function msgFix(m){return `friendsセルフの会員登録が完了しました。\n\n下記URLから予約画面にログインしてください。\n初回はこのURLを開くと、予約アプリにログイン情報が登録されます。\n\n【会員用URL】\n${loginUrl(m)}\n\n【会員ID】\n${m.id}\n\n【ログインPIN】\n${m.pin}\n\n【プラン】\n${m.plan}\n\n予約は2週間先まで可能です。\n同時に確保できる予約は最大2枠までです。`}
  async function copyFix(text){try{await navigator.clipboard.writeText(text);alert('LINE送信用文面をコピーしました。')}catch(e){prompt('この文面をコピーしてください',text)}}
  function currentMonth(){let d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')}
  function migrateMember(m){m.plan=normalizePlanFix(m.plan);m.extraByMonth=m.extraByMonth||m.extraSlotsByMonth||{};if(!m.migratedExtra&&Number(m.extraSlots||0)>0){m.extraByMonth[currentMonth()]=Number(m.extraByMonth[currentMonth()]||0)+Number(m.extraSlots||0);m.extraSlots=0;m.migratedExtra=true}return m}
  S.members=(S.members||[]).map(migrateMember);save();
  function showFix(m){
    if(!box)return;
    const text=msgFix(m);
    box.classList.remove('hidden');
    box.innerHTML=`<h3>LINE送信用文面</h3><p><strong>${m.name}</strong> さんのログイン情報を生成しました。</p><p>会員ID：<strong>${m.id}</strong>　PIN：<strong>${m.pin}</strong></p><textarea id="generatedLineText" readonly rows="10" style="width:100%;min-height:240px;border:1px solid #d8c8b4;border-radius:16px;padding:14px;background:#fffdf8"></textarea><button type="button" id="copyGeneratedLine" class="btn">このLINE文面をコピー</button>`;
    document.getElementById('generatedLineText').value=text;
    document.getElementById('copyGeneratedLine').onclick=()=>copyFix(text);
    box.scrollIntoView({behavior:'smooth',block:'center'});
  }
  if(form&&box){
    form.addEventListener('submit',e=>{
      e.preventDefault();
      e.stopImmediatePropagation();
      const fd=new FormData(form);
      const name=String(fd.get('name')||'').trim();
      const email=String(fd.get('email')||'').trim();
      const plan=normalizePlanFix(String(fd.get('plan')||'').trim());
      if(!name||!email){alert('会員名とメールアドレスを入力してください。');return}
      if((S.members||[]).some(m=>String(m.email||'').toLowerCase()===email.toLowerCase())){alert('同じメールアドレスの会員がいます。');return}
      const m={id:nextIdFix(),pin:pinFix(),name,email,plan,extraSlots:0,extraByMonth:{}};
      S.members.push(m);
      save();
      form.reset();
      if(typeof renderAll==='function')renderAll();
      showFix(m);
    },true);
  }
  if(typeof openDetail==='function'){
    const oldOpenDetail=openDetail;
    openDetail=function(id){
      const before=window.scrollY;
      oldOpenDetail(id);
      setTimeout(()=>window.scrollTo({top:before,left:0,behavior:'auto'}),0);
    };
  }
});