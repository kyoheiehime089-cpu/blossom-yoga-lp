(()=>{
  const $ = q => document.querySelector(q);
  const $$ = q => [...document.querySelectorAll(q)];
  const KEYS = {
    points: 'fs_game_lab_stress_points',
    last: 'fs_game_lab_last_played_date',
    pending: 'fs_game_lab_pending_play'
  };

  function today(){ return new Date().toISOString().slice(0,10); }
  function readJson(key, fallback){ try{ const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }catch(_e){ return fallback; } }
  function readPoints(){ const n = Number(localStorage.getItem(KEYS.points) || '0'); return Number.isFinite(n) && n >= 0 ? n : 0; }
  function currentStressStatus(){
    const last = localStorage.getItem(KEYS.last);
    const pending = readJson(KEYS.pending, null);
    if(last === today()) return '本日はプレイ済みです。明日またプレイできます。';
    if(pending && pending.date === today() && pending.status === 'pending') return '未完了のプレイがあります。ゲーム画面で完了できます。';
    return '今日はまだプレイできます。';
  }
  function renderStressSummary(){
    const pointEl = $('#stressPointValue');
    const statusEl = $('#stressTodayStatus');
    if(pointEl) pointEl.textContent = `${readPoints()}pt`;
    if(statusEl) statusEl.textContent = currentStressStatus();
  }

  function setup(){
    const app = $('#appView');
    if(!app || $('#memberMainTabs')) return;
    const dashboard = app.querySelector('.dashboard');
    const usageCard = $('#usageSummary')?.closest('.card');
    const booking = $('#bookingTab');
    const mine = $('#mineTab');
    const oldNav = app.querySelector('nav.tabs');
    if(oldNav) oldNav.style.display = 'none';
    if(usageCard) usageCard.id = 'usageTab';

    app.insertAdjacentHTML('afterbegin', `<nav id="memberMainTabs" class="tabs member-main-tabs"><button type="button" class="tab active" data-member-tab="home">ホーム</button><button type="button" class="tab" data-member-tab="calendar">カレンダー</button><button type="button" class="tab" data-member-tab="mine">自分の予約</button><button type="button" class="tab" data-member-tab="usage">利用実績</button><button type="button" class="tab" data-member-tab="stress">ストレスリセット</button></nav>`);

    if(mine && !$('#stressTab')){
      mine.insertAdjacentHTML('afterend', `<section id="stressTab" class="panel hidden stress-entry-panel"><p class="eyebrow">ストレスリセット</p><h2>全画面ブロックパズル</h2><div class="stress-entry-grid"><div class="stress-entry-card"><span>現在のストレスリセットポイント</span><strong id="stressPointValue">0pt</strong></div><div class="stress-entry-card"><span>今日の状態</span><strong id="stressTodayStatus">確認中</strong></div></div><p class="notice">1日1回、3分だけできるストレスリセット用のブロックパズルです。</p><a class="btn stress-game-link" href="./stress-game.html">全画面でブロックパズルを開く</a><p class="small stress-medical-note">このゲームは医療行為ではありません。ストレスや不調が強い場合は専門家にご相談ください。</p></section>`);
    }

    if(!$('#stressEntryStyles')){
      document.head.insertAdjacentHTML('beforeend', `<style id="stressEntryStyles">.stress-entry-panel{display:grid;gap:14px}.stress-entry-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.stress-entry-card{padding:15px;border:1px solid var(--line);border-radius:18px;background:#fffdf8}.stress-entry-card span{display:block;color:var(--muted);font-size:13px;font-weight:850}.stress-entry-card strong{display:block;margin-top:6px;font-size:24px;line-height:1.2}.stress-game-link{text-decoration:none;text-align:center}.stress-medical-note{padding:12px;border:1px solid #efcf8f;border-radius:14px;background:#fff7e7;color:#7b520e}@media(max-width:640px){.member-main-tabs{overflow-x:auto;display:flex}.member-main-tabs .tab{white-space:nowrap}.stress-entry-grid{grid-template-columns:1fr}}</style>`);
    }

    if(dashboard && !$('#memberSafeLogout')){
      dashboard.insertAdjacentHTML('beforeend', `<section class="card" style="box-shadow:none;background:#fffdf8"><p class="eyebrow">アカウント</p><p class="small">共用端末で利用した場合のみログアウトしてください。</p><button id="memberSafeLogout" type="button" class="ghost" style="width:100%;justify-content:center;margin-top:8px">ログアウト</button></section>`);
    }

    function show(name){
      $$('#memberMainTabs .tab').forEach(b => b.classList.toggle('active', b.dataset.memberTab === name));
      if(dashboard) dashboard.classList.toggle('hidden', name !== 'home');
      if(booking) booking.classList.toggle('hidden', name !== 'calendar');
      if(mine) mine.classList.toggle('hidden', name !== 'mine');
      if(usageCard) usageCard.classList.toggle('hidden', name !== 'usage');
      const stressTab = $('#stressTab');
      if(stressTab) stressTab.classList.toggle('hidden', name !== 'stress');
      if(name === 'stress') renderStressSummary();
      window.scrollTo({top:0, behavior:'smooth'});
    }

    function safeLogout(){
      const ok = confirm('本当にログアウトしますか？\n予約確認には、再度会員IDとPINが必要になります。');
      if(!ok) return;
      const ok2 = confirm('ログアウトを確定しますか？');
      if(!ok2) return;
      localStorage.removeItem('fs_code');
      localStorage.removeItem('fs_pin');
      document.getElementById('appView')?.classList.add('hidden');
      document.getElementById('loginView')?.classList.remove('hidden');
    }

    app.addEventListener('click', e => {
      const b = e.target.closest('[data-member-tab]');
      if(b){
        e.preventDefault();
        e.stopImmediatePropagation();
        show(b.dataset.memberTab);
        return;
      }
      if(e.target.closest('#memberSafeLogout') || e.target.closest('#logout')){
        e.preventDefault();
        e.stopImmediatePropagation();
        safeLogout();
      }
    }, true);

    window.addEventListener('focus', renderStressSummary);
    document.addEventListener('visibilitychange', () => {
      if(!document.hidden) renderStressSummary();
    });
    renderStressSummary();
    show('home');
  }

  document.addEventListener('DOMContentLoaded', setup);
  setTimeout(setup, 800);
})();
