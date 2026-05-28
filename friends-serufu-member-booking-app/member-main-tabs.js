(()=>{
  const $=q=>document.querySelector(q);
  const $$=q=>[...document.querySelectorAll(q)];
  function setup(){
    const app=$('#appView');
    if(!app||$('#memberMainTabs'))return;
    const dashboard=app.querySelector('.dashboard');
    const usageCard=$('#usageSummary')?.closest('.card');
    const booking=$('#bookingTab');
    const mine=$('#mineTab');
    const oldNav=app.querySelector('nav.tabs');
    if(oldNav)oldNav.style.display='none';
    if(usageCard)usageCard.id='usageTab';
    app.insertAdjacentHTML('afterbegin',`<nav id="memberMainTabs" class="tabs member-main-tabs"><button type="button" class="tab active" data-member-tab="home">ホーム</button><button type="button" class="tab" data-member-tab="calendar">カレンダー</button><button type="button" class="tab" data-member-tab="mine">自分の予約</button><button type="button" class="tab" data-member-tab="usage">利用実績</button></nav>`);
    if(dashboard&&!$('#memberSafeLogout')){
      dashboard.insertAdjacentHTML('beforeend',`<section class="card" style="box-shadow:none;background:#fffdf8"><p class="eyebrow">アカウント</p><p class="small">共用端末で利用した場合のみログアウトしてください。</p><button id="memberSafeLogout" type="button" class="ghost" style="width:100%;justify-content:center;margin-top:8px">ログアウト</button></section>`);
    }
    function show(name){
      $$('#memberMainTabs .tab').forEach(b=>b.classList.toggle('active',b.dataset.memberTab===name));
      if(dashboard)dashboard.classList.toggle('hidden',name!=='home');
      if(booking)booking.classList.toggle('hidden',name!=='calendar');
      if(mine)mine.classList.toggle('hidden',name!=='mine');
      if(usageCard)usageCard.classList.toggle('hidden',name!=='usage');
      window.scrollTo({top:0,behavior:'smooth'});
    }
    app.addEventListener('click',e=>{
      const b=e.target.closest('[data-member-tab]');
      if(b){show(b.dataset.memberTab);return;}
      if(e.target.closest('#memberSafeLogout')){
        if(confirm('本当にログアウトしますか？')){
          localStorage.removeItem('fs_code');
          localStorage.removeItem('fs_pin');
          location.reload();
        }
      }
    });
    show('home');
  }
  document.addEventListener('DOMContentLoaded',setup);
  setTimeout(setup,800);
})();