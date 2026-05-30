(function(){
  'use strict';

  const SQL_NOTICE = 'コンディションチェックはSQL適用後に利用できます。';
  const $ = (q, root = document) => root.querySelector(q);
  const $$ = (q, root = document) => Array.from(root.querySelectorAll(q));

  function esc(value){
    return String(value ?? '').replace(/[&<>"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
  }

  function client(){
    if(typeof fsdb !== 'undefined') return fsdb;
    if(!window.supabase || !window.FRIENDS_SUPABASE_URL || !window.FRIENDS_SUPABASE_ANON_KEY) return null;
    if(!window.fsConditionCheckClient){
      window.fsConditionCheckClient = window.supabase.createClient(window.FRIENDS_SUPABASE_URL, window.FRIENDS_SUPABASE_ANON_KEY);
    }
    return window.fsConditionCheckClient;
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
    const html = '<section id="dailyCheckCard" class="card fs-daily-check-card" style="margin-bottom:18px"><p class="eyebrow">コンディションチェック</p><div id="dailyCheckContent" data-daily-check-content class="res"><p>読み込み中...</p></div></section>';
    if(usage) usage.insertAdjacentHTML('beforebegin', html);
    else if(dashboard) dashboard.insertAdjacentHTML('afterend', html);
    return $('#dailyCheckCard');
  }

  function renderTags(tags){
    const list = Array.isArray(tags) ? tags : [];
    return list.length ? `<div class="daily-tags">${list.slice(0,5).map((tag) => `<span class="daily-tag">${esc(tag.tag || tag)}</span>`).join('')}</div>` : '<p class="small">回答が増えると表示されます。</p>';
  }

  function renderReferences(references){
    const list = Array.isArray(references) ? references : [];
    return list.length ? `<ul>${list.map((ref) => `<li>${esc(ref)}</li>`).join('')}</ul>` : '<p class="small">参考文献は回答後に表示されます。</p>';
  }

  function renderAdvice(answer){
    return `
      <div class="daily-advice">
        <h3>あなたへのアドバイス</h3>
        <p>${esc(answer.feedback_text || '回答後に表示されます。')}</p>
        <h3>今日やること</h3>
        <p>${esc(answer.action_text || '回答後に表示されます。')}</p>
        <h3>科学的根拠の要約</h3>
        <p>${esc(answer.evidence_summary || '回答後に表示されます。')}</p>
        <h3>参考文献</h3>
        ${renderReferences(answer.references)}
      </div>
    `;
  }

  function renderRecent(payload){
    return `
      <div class="daily-trends">
        <h3>最近のコンディション傾向</h3>
        ${renderTags(payload.recent_tags)}
        <h3>今週のおすすめアドバイス</h3>
        <p>${esc(payload.recent_advice || '回答が増えると、直近の傾向に合わせたアドバイスが表示されます。')}</p>
      </div>
    `;
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
        ${renderAdvice(answer)}
      </div>
      ${renderRecent(payload)}
      ${renderThemes(payload.monthly_themes)}
    `;
  }

  function renderQuestion(payload){
    const q = payload.question || {};
    const options = Array.isArray(q.options) ? q.options : [];
    if(!q.question_key || !options.length){
      return `<h2>今日の1問</h2><p class="notice">表示できる質問がまだありません。</p>${renderRecent(payload)}${renderThemes(payload.monthly_themes)}`;
    }
    return `
      <h2>今日の1問</h2>
      <p class="eyebrow">${esc(q.category_label || '')}</p>
      <h3>${esc(q.question_text || '')}</h3>
      <form class="daily-check-form" data-daily-check-form data-question-key="${esc(q.question_key)}">
        ${options.map((option, index) => `
          <label class="daily-option">
            <input type="radio" name="option_key" value="${esc(option.option_key)}" ${index === 0 ? 'checked' : ''}>
            <span>${esc(option.option_label)}</span>
          </label>
        `).join('')}
        <button class="btn" type="submit">回答する</button>
      </form>
      <div data-daily-check-feedback></div>
      ${renderRecent(payload)}
      ${renderThemes(payload.monthly_themes)}
    `;
  }

  function renderError(target, message){
    const content = target || $('#dailyCheckContent') || ensureMount().querySelector('#dailyCheckContent');
    content.innerHTML = `<h2>今日の1問</h2><p class="notice">${esc(message || SQL_NOTICE)}</p>`;
  }

  async function renderInto(target){
    const content = typeof target === 'string' ? $(target) : target;
    if(!content) return null;
    content.setAttribute('data-daily-check-content', '');
    const memberCode = String(localStorage.getItem('fs_code') || '').trim();
    const pin = String(localStorage.getItem('fs_pin') || '').trim();
    if(!memberCode || !pin) return null;
    content.innerHTML = '<p>今日の1問を読み込んでいます...</p>';
    try{
      const payload = await callRpc('fs_member_daily_check_snapshot', { p_member_code: memberCode, p_pin: pin });
      if(!payload.ok) throw new Error(payload.error || SQL_NOTICE);
      content.innerHTML = payload.answered_today ? renderAnswered(payload) : renderQuestion(payload);
      return payload;
    }catch(error){
      console.warn('[daily-check] unavailable', error);
      renderError(content, SQL_NOTICE);
      return null;
    }
  }

  async function loadDailyCheck(){
    const mount = ensureMount();
    const content = mount.querySelector('#dailyCheckContent');
    if($('#appView')?.classList.contains('hidden')) return null;
    return renderInto(content);
  }

  async function refreshDailyCheckViews(){
    const views = $$('[data-daily-check-content]');
    if(!views.length) await loadDailyCheck();
    await Promise.all(views.map((view) => renderInto(view)));
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
      if(payload.already_answered){
        form.closest('[data-daily-check-content]')?.insertAdjacentHTML('afterbegin', `<p class="notice">${esc(payload.error || '本日はすでに回答済みです。')}</p>`);
      }
      await refreshDailyCheckViews();
    }catch(error){
      console.warn('[daily-check] submit failed', error);
      renderError(form.closest('[data-daily-check-content]'), SQL_NOTICE);
    }
  }

  function installStyles(){
    if($('#dailyCheckStyles')) return;
    document.head.insertAdjacentHTML('beforeend', `
      <style id="dailyCheckStyles">
        .fs-daily-check-card h2{margin:4px 0 10px}.daily-check-form{display:grid;gap:10px;margin-top:12px}.daily-option{display:flex;gap:10px;align-items:center;padding:12px;border:1px solid var(--line);border-radius:14px;background:#fffaf2;font-weight:850}.daily-option input{width:auto;margin:0}.daily-themes,.daily-trends,.daily-advice{margin-top:14px;padding:12px;border:1px solid #d9eadf;border-radius:16px;background:#f5fbf6}.daily-themes ol{margin:8px 0 0 1.2em;padding:0}.daily-themes li{margin:4px 0;font-weight:850}.daily-tags{display:flex;flex-wrap:wrap;gap:8px}.daily-tag{display:inline-flex;padding:4px 9px;border-radius:999px;background:#eaf7ee;color:#27533a;font-size:12px;font-weight:900}
      </style>
    `);
  }

  function hookLoad(){
    const originalLoad = window.load;
    if(typeof originalLoad === 'function' && !originalLoad.fsConditionCheckWrapped){
      const wrapped = async function(){
        const result = await originalLoad.apply(this, arguments);
        setTimeout(loadDailyCheck, 0);
        return result;
      };
      wrapped.fsConditionCheckWrapped = true;
      window.load = wrapped;
      window.loadSnapshot = wrapped;
    }
  }

  document.addEventListener('submit', (event) => {
    const form = event.target.closest('[data-daily-check-form]');
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

  window.fsDailyCheck = { load: loadDailyCheck, renderInto };
})();
