// 管理画面限定：会員ごとの利用状況を会員詳細に表示
(function(){
  const DAY_MS=86400000;

  function localDate(dateString){
    return new Date(`${dateString}T00:00:00`);
  }

  function todayStart(){
    const date=new Date();
    date.setHours(0,0,0,0);
    return date;
  }

  function reservationEnd(reservation){
    const date=localDate(reservation.date);
    date.setMinutes(Number(reservation.start_minute||0)+Number(reservation.use_minutes_snapshot||40));
    return date;
  }

  function elapsedMonthsDays(fromDate,toDate){
    let months=(toDate.getFullYear()-fromDate.getFullYear())*12+(toDate.getMonth()-fromDate.getMonth());
    let anchor=new Date(fromDate);
    anchor.setMonth(anchor.getMonth()+months);
    if(anchor>toDate){
      months-=1;
      anchor=new Date(fromDate);
      anchor.setMonth(anchor.getMonth()+months);
    }
    const days=Math.max(0,Math.floor((toDate-anchor)/DAY_MS));
    return {months:Math.max(0,months),days};
  }

  function monthSpanInclusive(fromDate,toDate){
    return Math.max(1,(toDate.getFullYear()-fromDate.getFullYear())*12+(toDate.getMonth()-fromDate.getMonth())+1);
  }

  function formatDate(dateString){
    const date=localDate(dateString);
    return `${date.getFullYear()}/${date.getMonth()+1}/${date.getDate()}`;
  }

  function buildStats(memberId){
    const now=new Date();
    const today=todayStart();
    const reservations=(snapshot?.reservations||[])
      .filter(item=>item.member_id===memberId)
      .sort((a,b)=>localDate(a.date)-localDate(b.date)||Number(a.start_minute)-Number(b.start_minute));

    const completed=reservations.filter(item=>reservationEnd(item)<=now);
    if(!reservations.length){
      return `<section class="res" data-usage-stats="${escapeHtml(memberId)}"><p class="eyebrow">利用状況</p><p>予約履歴はありません。</p></section>`;
    }

    const first=reservations[0];
    const firstDate=localDate(first.date);
    const elapsed=elapsedMonthsDays(firstDate,today);
    const completedCount=completed.length;
    const months=monthSpanInclusive(firstDate,today);
    const monthlyAverage=(completedCount/months).toFixed(1);
    const last=completed[completed.length-1]||null;
    const daysSinceLast=last?Math.max(0,Math.floor((today-localDate(last.date))/DAY_MS)):null;

    return `<section class="res" data-usage-stats="${escapeHtml(memberId)}">
      <p class="eyebrow">利用状況</p>
      <div class="summary-grid">
        <article class="res metric"><p>初回予約日</p><strong>${formatDate(first.date)}</strong><p>${elapsed.months}ヶ月${elapsed.days}日経過</p></article>
        <article class="res metric"><p>過去の利用回数</p><strong>${completedCount}回</strong></article>
        <article class="res metric"><p>月平均利用回数</p><strong>${monthlyAverage}回</strong><p>初回予約月から現在まで</p></article>
        <article class="res metric"><p>最終利用日</p><strong>${last?formatDate(last.date):'利用実績なし'}</strong><p>${last?`最終利用日から${daysSinceLast}日経過`:''}</p></article>
      </div>
    </section>`;
  }

  const originalOpenDetail=window.openDetail;
  if(typeof originalOpenDetail!=='function')return;

  window.openDetail=function(id){
    originalOpenDetail(id);
    const detail=document.querySelector(`[data-member-detail='${CSS.escape(id)}']`);
    if(!detail||detail.querySelector('[data-usage-stats]'))return;
    const reservationsHeading=[...detail.querySelectorAll('h3')].find(element=>element.textContent.includes('この会員の予約'));
    if(reservationsHeading)reservationsHeading.insertAdjacentHTML('beforebegin',buildStats(id));
    else detail.insertAdjacentHTML('beforeend',buildStats(id));
  };
})();
