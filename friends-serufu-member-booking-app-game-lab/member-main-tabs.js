(function(){
  'use strict';

  const $ = (q) => document.querySelector(q);
  const $$ = (q) => Array.from(document.querySelectorAll(q));
  const FALLBACK_MESSAGE = 'アプリ情報を読み込めないため、テスト用のローカル表示を出しています。';
  const LOCAL_APPS = [{
    category_key: 'stress_reset',
    category_name: 'ストレスリセット',
    app_key: 'stress_block_puzzle',
    app_name: 'ブロックパズル',
    app_url: './stress-game.html',
    enabled: true
  }];

  function esc(value){
    return String(value ?? '').replace(/[&<>"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
  }

  function readJson(key, fallback){
    try{
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    }catch(_error){
      return fallback;
    }
  }

  function readStressPoints(){
    const n = Number(localStorage.getItem('fs_game_lab_stress_points') || '0');
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }

  function currentStressStatus(){
    const today = new Date().toISOString().slice(0, 10);
    const pending = readJson('fs_game_lab_pending_play', null);
    if(localStorage.getItem('fs_game_lab_last_played_date') === today) return '本日はプレイ済み';
    if(pending && pending.status === 'pending' && pending.date === today) return '未完了のプレイがあります';
    return '本日未プレイ';
  }

  function getClient(){
    if(!window.FRIENDS_SUPABASE_READY || !window.supabase || !window.FRIENDS_SUPABASE_URL || !window.FRIENDS_SUPABASE_ANON_KEY) return null;
    if(!window.fsMemberAppsSupabaseClient){
      window.fsMemberAppsSupabaseClient = window.supabase.createClient(window.FRIENDS_SUPABASE_URL, window.FRIENDS_SUPABASE_ANON_KEY);
    }
    return window.fsMemberAppsSupabaseClient;
  }

  async function loadApps(){
    const client = getClient();
    const code = String(localStorage.getItem('fs_code') || '').trim();
    const pin = String(localStorage.getItem('fs_pin') || '').trim();
    if(!client || !code || !pin) return { apps: LOCAL_APPS, fallback: true };
    try{
      const { data, error } = await client.rpc('fs_member_apps_snapshot', { p_member_code: code, p_pin: pin });
      if(error || !data || data.ok === false) throw new Error(error?.message || data?.error || 'apps snapshot failed');
      const apps = Array.isArray(data.apps) && data.apps.length ? data.apps : LOCAL_APPS;
      return { apps, fallback: false };
    }catch(error){
      console.warn('[member-apps] fallback apps shown', error);
      return { apps: LOCAL_APPS, fallback: true };
    }
  }

  function ensureAppsTab(mine){
    let appsTab = $('#appsTab');
    if(appsTab || !mine) return appsTab;
    mine.insertAdjacentHTML('afterend', `
      <section id="appsTab" class="panel hidden apps-entry-panel">
        <p class="eyebrow">アプリ</p>
        <h2>アプリ</h2>
        <p id="appsFallbackNotice" class="notice hidden">${FALLBACK_MESSAGE}</p>
        <div class="apps-entry-grid">
          <div class="apps-entry-card">
            <span>ストレスリセットポイント</span>
            <strong id="stressPointValue">0pt</strong>
          </div>
          <div class="apps-entry-card">
            <span>今日の状態</span>
            <strong id="stressTodayStatus">確認中</strong>
          </div>
        </div>
        <div id="appsList" class="apps-list"></div>
        <p class="small apps-medical-note">このゲームは医療行為ではありません。ストレスや不調が強い場合は専門家にご相談ください。</p>
      </section>
    `);
    return $('#appsTab');
  }

  function ensureAppStyles(){
    if($('#appsEntryStyles')) return;
    document.head.insertAdjacentHTML('beforeend', `
      <style id="appsEntryStyles">
        .apps-entry-panel{display:grid;gap:14px}
        .apps-entry-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
        .apps-entry-card,.apps-category,.apps-item{padding:15px;border:1px solid var(--line);border-radius:18px;background:#fffdf8}
        .apps-entry-card span{display:block;color:var(--muted);font-size:13px;font-weight:850}
        .apps-entry-card strong{display:block;margin-top:6px;font-size:24px;line-height:1.2}
        .apps-list{display:grid;gap:12px}
        .apps-category summary{cursor:pointer;font-weight:950;font-size:18px}
        .apps-category-body{display:grid;gap:10px;margin-top:12px}
        .apps-item{display:grid;gap:8px;background:#fffaf2}
        .apps-game-link{text-decoration:none;text-align:center}
        .apps-medical-note{padding:12px;border:1px solid #efcf8f;border-radius:14px;background:#fff7e7;color:#7b520e}
        @media(max-width:640px){.member-main-tabs{overflow-x:auto;display:flex}.member-main-tabs .tab{white-space:nowrap}.apps-entry-grid{grid-template-columns:1fr}}
      </style>
    `);
  }

  function ensureSafeLogout(dashboard){
    if(!dashboard || $('#memberSafeLogout')) return;
    dashboard.insertAdjacentHTML('beforeend', `
      <section class="card" style="box-shadow:none;background:#fffdf8">
        <p class="eyebrow">アカウント</p>
        <p class="small">共用端末で利用した場合のみログアウトしてください。</p>
        <button id="memberSafeLogout" type="button" class="ghost" style="width:100%;justify-content:center;margin-top:8px">ログアウト</button>
      </section>
    `);
  }

  function renderAppsList(apps){
    const list = $('#appsList');
    if(!list) return;
    const groups = apps.reduce((acc, app) => {
      const category = app.category_name || 'ストレスリセット';
      acc[category] = acc[category] || [];
      acc[category].push(app);
      return acc;
    }, {});
    list.innerHTML = Object.entries(groups).map(([category, group]) => `
      <details class="apps-category" open>
        <summary>${esc(category)}</summary>
        <div class="apps-category-body">
          ${group.map((app) => `
            <article class="apps-item">
              <h3>${esc(app.app_name || 'ブロックパズル')}</h3>
              <p class="small">1日1回、3分だけできるストレスリセット用のブロックパズルです。</p>
              <a class="btn apps-game-link" href="${esc(app.app_url || './stress-game.html')}">ブロックパズルを開く</a>
            </article>
          `).join('')}
        </div>
      </details>
    `).join('');
  }

  async function renderApps(){
    const pointsEl = $('#stressPointValue');
    const statusEl = $('#stressTodayStatus');
    if(pointsEl) pointsEl.textContent = `${readStressPoints()}pt`;
    if(statusEl) statusEl.textContent = currentStressStatus();
    const { apps, fallback } = await loadApps();
    renderAppsList(apps);
    $('#appsFallbackNotice')?.classList.toggle('hidden', !fallback);
  }

  function safeLogout(){
    const ok = confirm('本当にログアウトしますか？\n予約確認には、再度会員IDとPINが必要になります。');
    if(!ok) return;
    const ok2 = confirm('ログアウトを確定しますか？');
    if(!ok2) return;
    localStorage.removeItem('fs_code');
    localStorage.removeItem('fs_pin');
    $('#appView')?.classList.add('hidden');
    $('#loginView')?.classList.remove('hidden');
  }

  function show(name){
    const dashboard = $('#appView .dashboard');
    const booking = $('#bookingTab');
    const mine = $('#mineTab');
    const usage = $('#usageTab');
    const appsTab = $('#appsTab');
    const panels = { home: dashboard, calendar: booking, mine, usage, apps: appsTab };
    const selected = panels[name] ? name : 'home';
    $$('#memberMainTabs .tab').forEach((button) => {
      button.classList.toggle('active', button.dataset.memberTab === selected);
    });
    Object.entries(panels).forEach(([key, panel]) => {
      if(panel) panel.classList.toggle('hidden', key !== selected);
    });
    if(selected === 'apps') renderApps();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function setup(){
    const app = $('#appView');
    if(!app || $('#memberMainTabs')) return;
    const dashboard = app.querySelector('.dashboard');
    const booking = $('#bookingTab');
    const mine = $('#mineTab');
    const usageCard = $('#usageSummary')?.closest('.card');
    const oldNav = app.querySelector('nav.tabs:not(#memberMainTabs)');
    if(usageCard) usageCard.id = 'usageTab';
    ensureAppsTab(mine);
    ensureAppStyles();
    ensureSafeLogout(dashboard);
    app.insertAdjacentHTML('afterbegin', `
      <nav id="memberMainTabs" class="tabs member-main-tabs">
        <button type="button" class="tab active" data-member-tab="home">ホーム</button>
        <button type="button" class="tab" data-member-tab="calendar">カレンダー</button>
        <button type="button" class="tab" data-member-tab="mine">自分の予約</button>
        <button type="button" class="tab" data-member-tab="usage">利用実績</button>
        <button type="button" class="tab" data-member-tab="apps">アプリ</button>
      </nav>
    `);
    if(oldNav) oldNav.style.display = 'none';
    app.addEventListener('click', (event) => {
      const tab = event.target.closest('[data-member-tab]');
      if(tab){
        event.preventDefault();
        event.stopImmediatePropagation();
        show(tab.dataset.memberTab);
        return;
      }
      if(event.target.closest('#memberSafeLogout') || event.target.closest('#logout')){
        event.preventDefault();
        event.stopImmediatePropagation();
        safeLogout();
      }
    }, true);
    window.addEventListener('focus', renderApps);
    document.addEventListener('visibilitychange', () => { if(!document.hidden) renderApps(); });
    renderApps();
    show('home');
  }

  document.addEventListener('DOMContentLoaded', setup);
  setTimeout(setup, 800);
})();
