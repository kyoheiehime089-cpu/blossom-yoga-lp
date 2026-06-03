(function(){
  'use strict';

  const selectors = { qs: (q) => document.querySelector(q) };
  const { qs: $ } = selectors;
  const $$ = (q) => Array.from(document.querySelectorAll(q));
  const EMPTY_APPS_MESSAGE = '現在利用できるアプリはありません。';
  const FALLBACK_MESSAGE = 'アプリ情報を読み込めないため、テスト用のローカル表示を出しています。';
  const LOCAL_APPS = [{
    app_key: 'stress_block_puzzle',
    category_key: 'stress_reset',
    category_label: 'ストレスリセット',
    title: 'ブロックパズル',
    description: '1日1回、3分だけできるストレスリセット用のブロックパズルです。',
    content_type: 'game',
    href: '../friends-serufu-member-booking-app-game-lab/stress-game.html',
    enabled: true,
    sort_order: 10
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

  function normalizeApp(app){
    return {
      app_key: app.app_key || '',
      category_key: app.category_key || '',
      category_label: app.category_label || app.category_name || '未分類',
      title: app.title || app.app_name || app.app_key || '無題のコンテンツ',
      description: app.description || '',
      content_type: app.content_type || 'game',
      href: app.href || app.app_url || '../friends-serufu-member-booking-app-game-lab/stress-game.html',
      enabled: app.enabled !== false,
      sort_order: Number(app.sort_order || 0)
    };
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
    if(!client || !code || !pin) return { apps: LOCAL_APPS.map(normalizeApp), fallback: true };
    try{
      const { data, error } = await client.rpc('fs_member_apps_snapshot', { p_member_code: code, p_pin: pin });
      if(error || !data || data.ok === false) throw new Error(error?.message || data?.error || 'apps snapshot failed');
      const apps = (Array.isArray(data.apps) ? data.apps : [])
        .map(normalizeApp)
        .filter((app) => app.enabled)
        .sort((a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title, 'ja'));
      return { apps, fallback: false };
    }catch(error){
      console.warn('[member-apps] fallback apps shown', error);
      return { apps: LOCAL_APPS.map(normalizeApp), fallback: true };
    }
  }

  function ensureAppsTab(mine){
    let appsTab = $('#stressTab') || $('#appsTab');
    if(appsTab || !mine) return appsTab;
    mine.insertAdjacentHTML('afterend', `
      <section id="stressTab" class="panel hidden apps-entry-panel">
        <p class="eyebrow">ストレスケア</p>
        <h2>ストレスケア</h2>
        <p id="appsFallbackNotice" class="notice hidden">${FALLBACK_MESSAGE}</p>
        <div class="apps-entry-grid">
          <div class="apps-entry-card"><span>ストレスリセットポイント</span><strong id="stressPointValue">0pt</strong></div>
          <div class="apps-entry-card"><span>今日の状態</span><strong id="stressTodayStatus">確認中</strong></div>
        </div>
        <div id="appsList" class="apps-list"></div>
        <p class="small apps-medical-note">このゲームは医療行為ではありません。ストレスや不調が強い場合は専門家にご相談ください。</p>
      </section>
    `);
    return $('#stressTab') || $('#appsTab');
  }

  function ensureAppStyles(){
    if($('#appsEntryStyles')) return;
    document.head.insertAdjacentHTML('beforeend', `
      <style id="appsEntryStyles">
        .apps-entry-panel,.apps-entry-panel *{box-sizing:border-box;max-width:100%;overflow-wrap:anywhere;word-break:break-word}
        .apps-entry-panel{display:grid;gap:14px}
        .apps-entry-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
        .apps-entry-card,.apps-category,.apps-item{padding:15px;border:1px solid var(--line);border-radius:18px;background:#fffdf8}
        .apps-entry-card span{display:block;color:var(--muted);font-size:13px;font-weight:850}
        .apps-entry-card strong{display:block;margin-top:6px;font-size:24px;line-height:1.2}
        .apps-list{display:grid;gap:12px}
        .apps-category summary{cursor:pointer;font-weight:950;font-size:18px}
        .apps-category-body{display:grid;gap:10px;margin-top:12px}
        .apps-item{display:grid;gap:8px;background:#fffaf2}
        .apps-kind{display:inline-flex;width:max-content;padding:3px 9px;border-radius:999px;background:#eaf7ee;color:#27533a;font-size:12px;font-weight:900}
        .apps-game-link{text-decoration:none;text-align:center}.apps-item-actions{display:grid;grid-template-columns:1fr;gap:8px}.apps-explain-toggle{min-height:44px;border:1px solid #b8ddc3;border-radius:14px;background:#f3fbf5;color:#27533a;font-weight:950;cursor:pointer}.apps-stress-explanation{padding:14px;border:1px solid #d9eadf;border-radius:18px;background:#f5fbf6;line-height:1.8;color:#264431;box-sizing:border-box;max-width:100%;overflow-wrap:anywhere;word-break:break-word}.apps-stress-explanation h4{margin:0 0 10px;line-height:1.5}.apps-stress-explanation p{margin:0 0 12px}
        .apps-medical-note{padding:12px;border:1px solid #efcf8f;border-radius:14px;background:#fff7e7;color:#7b520e}
        @media(max-width:640px){.member-main-tabs{overflow-x:auto;display:flex}.member-main-tabs .tab{white-space:nowrap}.apps-entry-grid{grid-template-columns:1fr}}
      </style>
    `);
  }


  function stressResetExplanationHtml(){
    return `
      <div class="apps-stress-explanation hidden" data-stress-reset-explanation>
        <h4>なぜブロックパズルがストレスリセットになるの？</h4>
        <p>ストレスが強い時は、頭の中で同じ考えがぐるぐる続いたり、不安なイメージが離れにくくなることがあります。</p>
        <p>ブロックパズルのようなシンプルな視覚パズルは、色や形、置く場所を考えるために、自然と注意を目の前の作業へ向けやすくなります。</p>
        <p>つまり、悩みを無理に消そうとするのではなく、頭の使い方を一度切り替えるイメージです。</p>
        <p>短時間でも「今はこのブロックをどこに置くか」に集中できると、気持ちが少し落ち着いたり、考えすぎから抜け出すきっかけになります。</p>
        <p>また、小さくクリアできる感覚や、手を動かして進める感覚は、気分転換にもつながりやすいです。</p>
        <p>大切なのは、長くやりすぎないことです。</p>
        <p>このアプリでは、気分転換として使いやすいように、1日1回・3分だけにしています。</p>
        <p>これは医療行為ではありません。</p>
        <p>ストレスや不調が強い時は、無理せず専門家に相談してください。</p>
      </div>
    `;
  }

  function isStressBlockPuzzle(app){
    return app.app_key === 'stress_block_puzzle' || app.category_key === 'stress_reset' || app.title === 'ブロックパズル';
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
    if(!apps.length){
      list.innerHTML = `<article class="apps-item"><p>${EMPTY_APPS_MESSAGE}</p></article>`;
      return;
    }
    const groups = apps.reduce((acc, app) => {
      const category = app.category_label || app.category_key || '未分類';
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
              <p class="eyebrow">カテゴリ：${esc(category)}</p>
              <h3>${esc(app.title)}</h3>
              <span class="apps-kind">種類：${esc(app.content_type)}</span>
              <p>${esc(app.description || '説明はありません。')}</p>
              <div class="apps-item-actions">
                ${isStressBlockPuzzle(app) ? '<button class="apps-explain-toggle" type="button" data-stress-reset-toggle aria-expanded="false">なぜストレスリセットになるの？</button>' : ''}
                <a class="btn apps-game-link" href="${esc(isStressBlockPuzzle(app) && app.href === './stress-game.html' ? '../friends-serufu-member-booking-app-game-lab/stress-game.html' : app.href)}">開く</a>
              </div>
              ${isStressBlockPuzzle(app) ? stressResetExplanationHtml() : ''}
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
    if(!confirm('本当にログアウトしますか？\n予約確認には、再度会員IDとPINが必要になります。')) return;
    if(!confirm('ログアウトを確定しますか？')) return;
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
    const appsTab = $('#stressTab') || $('#appsTab');
    const panels = { home: dashboard, calendar: booking, mine, usage, stress: appsTab };
    const selected = panels[name] ? name : 'home';
    $$('#memberMainTabs .tab').forEach((button) => button.classList.toggle('active', button.dataset.memberTab === selected));
    Object.entries(panels).forEach(([key, panel]) => { if(panel) panel.classList.toggle('hidden', key !== selected); });
    if(selected === 'stress') renderApps();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function setup(){
    const app = $('#appView');
    if(!app || $('#memberMainTabs')) return;
    const dashboard = app.querySelector('.dashboard');
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
        <button type="button" class="tab" data-member-tab="stress">ストレスケア</button>
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
      const explainToggle = event.target.closest('[data-stress-reset-toggle]');
      if(explainToggle){
        event.preventDefault();
        const item = explainToggle.closest('.apps-item');
        const explanation = item?.querySelector('[data-stress-reset-explanation]');
        const willOpen = explanation?.classList.contains('hidden');
        if(explanation) explanation.classList.toggle('hidden', !willOpen);
        explainToggle.setAttribute('aria-expanded', String(Boolean(willOpen)));
        explainToggle.textContent = willOpen ? '説明を閉じる' : 'なぜストレスリセットになるの？';
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
