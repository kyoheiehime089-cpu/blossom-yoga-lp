(function(){
  'use strict';

  const SQL_NOTICE = 'コンディションチェックはSQL適用後に利用できます。';
  const $ = (q, root = document) => root.querySelector(q);

  function esc(value){
    return String(value ?? '').replace(/[&<>"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
  }

  function client(){
    if(typeof fsdb !== 'undefined') return fsdb;
    if(!window.supabase || !window.FRIENDS_SUPABASE_URL || !window.FRIENDS_SUPABASE_ANON_KEY) return null;
    if(!window.fsDailyCheckClient){
      window.fsDailyCheckClient = window.supabase.createClient(window.FRIENDS_SUPABASE_URL, window.FRIENDS_SUPABASE_ANON_KEY);
    }
    return window.fsDailyCheckClient;
  }

  async function callRpc(name, args){
    const c = client();
    if(!c) throw new Error('Supabase client is not ready');
    const { data, error } = await c.rpc(name, args);
    if(error) throw new Error(error.message || 'daily check rpc failed');
    return data || { ok:false, error:'応答がありません' };
  }

  function ensureMount(){
    let mount = $('#dailyCheckCard');
    if(mount) return mount;
    const dashboard = $('.dashboard');
    const usage = $('#usageSummary')?.closest('.card');
    const html = '<section id="dailyCheckCard" class="card fs-daily-check-card" style="margin-bottom:18px"><p class="eyebrow">コンディションチェック</p><div id="dailyCheckContent" class="res"><p>読み込み中...</p></div></section>';
    if(usage) usage.insertAdjacentHTML('beforebegin', html);
    else if(dashboard) dashboard.insertAdjacentHTML('afterend', html);
    return $('#dailyCheckCard');
  }

  function renderThemes(themes){
    const list = Array.isArray(themes) ? themes : [];
    if(!list.length) return '<div class="daily-themes"><h3>今月のおすすめテーマ</h3><p class="small">回答が増えると、優先したいテーマが表示されます。</p></div>';
    return `<div class="daily-themes"><h3>今月のおすすめテーマ</h3><ol>${list.slice(0,3).map((theme) => `<li>${esc(theme.label || theme.theme || theme)}</li>`).join('')}</ol><p class="small">断定ではなく、今月見直したいポイントとしてご活用ください。</p></div>`;
  }

  function renderAnswered(payload){
    const answer = payload.answer || {};
    return `
      <h2>今日の1問</h2>
      <p class="notice">本日は回答済みです。同じ日に再回答はできません。</p>
      <div class="res done">
        <p class="eyebrow">${esc(answer.category_label || '回答済み')}</p>
        <h3>${esc(answer.question_text || '')}</h3>
        <p><strong>回答：</strong>${esc(answer.option_label || '')}</p>
        <p>${esc(answer.feedback_text || '')}</p>
      </div>
      ${renderThemes(payload.monthly_themes)}
    `;
  }

  function renderQuestion(payload){
    const q = payload.question || {};
    const options = Array.isArray(q.options) ? q.options : [];
    if(!q.question_key || !options.length){
      return `<h2>今日の1問</h2><p class="notice">表示できる質問がまだありません。</p>${renderThemes(payload.monthly_themes)}`;
    }
    return `
      <h2>今日の1問</h2>
      <p class="eyebrow">${esc(q.category_label || '')}</p>
      <h3>${esc(q.question_text || '')}</h3>
      <form id="dailyCheckForm" class="daily-check-form" data-question-key="${esc(q.question_key)}">
        ${options.map((option, index) => `
          <label class="daily-option">
            <input type="radio" name="option_key" value="${esc(option.option_key)}" ${index === 0 ? 'checked' : ''}>
            <span>${esc(option.option_label)}</span>
          </label>
        `).join('')}
        <button class="btn" type="submit">回答する</button>
      </form>
      <div id="dailyCheckFeedback"></div>
      ${renderThemes(payload.monthly_themes)}
    `;
  }

  function renderError(message){
    const content = $('#dailyCheckContent') || ensureMount().querySelector('#dailyCheckContent');
    content.innerHTML = `<h2>今日の1問</h2><p class="notice">${esc(message || SQL_NOTICE)}</p>`;
  }

  async function loadDailyCheck(){
    const mount = ensureMount();
    const content = mount.querySelector('#dailyCheckContent');
    const memberCode = String(localStorage.getItem('fs_code') || '').trim();
    const pin = String(localStorage.getItem('fs_pin') || '').trim();
    if(!memberCode || !pin || $('#appView')?.classList.contains('hidden')) return;
    content.innerHTML = '<p>今日の1問を読み込んでいます...</p>';
    try{
      const payload = await callRpc('fs_member_daily_check_snapshot', { p_member_code: memberCode, p_pin: pin });
      if(!payload.ok) throw new Error(payload.error || SQL_NOTICE);
      content.innerHTML = payload.answered_today ? renderAnswered(payload) : renderQuestion(payload);
    }catch(error){
      console.warn('[daily-check] unavailable', error);
      renderError(SQL_NOTICE);
    }
  }

  async function submitDailyCheck(form){
    const memberCode = String(localStorage.getItem('fs_code') || '').trim();
    const pin = String(localStorage.getItem('fs_pin') || '').trim();
    const option = new FormData(form).get('option_key');
    const button = form.querySelector('button[type="submit"]');
    if(!option) return;
    button.disabled = true;
    button.textContent = '保存中...';
    try{
      const payload = await callRpc('fs_member_submit_daily_answer', {
        p_member_code: memberCode,
        p_pin: pin,
        p_question_key: form.dataset.questionKey,
        p_option_key: option
      });
      if(!payload.ok) throw new Error(payload.error || '保存できませんでした');
      const content = $('#dailyCheckContent');
      if(payload.already_answered){
        content.insertAdjacentHTML('afterbegin', `<p class="notice">${esc(payload.error || '本日はすでに回答済みです。')}</p>`);
        await loadDailyCheck();
        return;
      }
      const answer = payload.answer || {};
      $('#dailyCheckFeedback').innerHTML = `<div class="res done"><h3>フィードバック</h3><p>${esc(answer.feedback_text || '')}</p></div>`;
      await loadDailyCheck();
    }catch(error){
      console.warn('[daily-check] submit failed', error);
      renderError(SQL_NOTICE);
    }
  }

  function installStyles(){
    if($('#dailyCheckStyles')) return;
    document.head.insertAdjacentHTML('beforeend', `
      <style id="dailyCheckStyles">
        .fs-daily-check-card h2{margin:4px 0 10px}.daily-check-form{display:grid;gap:10px;margin-top:12px}.daily-option{display:flex;gap:10px;align-items:center;padding:12px;border:1px solid var(--line);border-radius:14px;background:#fffaf2;font-weight:850}.daily-option input{width:auto;margin:0}.daily-themes{margin-top:14px;padding:12px;border:1px solid #d9eadf;border-radius:16px;background:#f5fbf6}.daily-themes ol{margin:8px 0 0 1.2em;padding:0}.daily-themes li{margin:4px 0;font-weight:850}
      </style>
    `);
  }

  function hookLoad(){
    const originalLoad = window.load;
    if(typeof originalLoad === 'function' && !originalLoad.fsDailyCheckWrapped){
      const wrapped = async function(){
        const result = await originalLoad.apply(this, arguments);
        setTimeout(loadDailyCheck, 0);
        return result;
      };
      wrapped.fsDailyCheckWrapped = true;
      window.load = wrapped;
      window.loadSnapshot = wrapped;
    }
  }

  document.addEventListener('submit', (event) => {
    const form = event.target.closest('#dailyCheckForm');
    if(!form) return;
    event.preventDefault();
    submitDailyCheck(form);
  });

  document.addEventListener('DOMContentLoaded', () => {
    installStyles();
    ensureMount();
    hookLoad();
    setTimeout(loadDailyCheck, 300);
  });

  window.fsLoadDailyCheck = loadDailyCheck;
})();
