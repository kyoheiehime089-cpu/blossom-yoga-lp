(function(){
  'use strict';

  const PREPARING_TITLE = 'コンディションチェックは現在準備中です。';
  const PREPARING_MESSAGE = '科学的根拠と参考文献を確認した質問から順番に公開します。';
  const SQL_NOTICE = PREPARING_TITLE;
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
    const appsTab = $('#stressTab') || $('#appsTab');
    if(!appsTab) return null;
    const appsList = $('#appsList', appsTab);
    const html = '<section id="dailyCheckCard" class="fs-daily-check-card apps-daily-check-card"><p class="eyebrow">コンディションチェックアプリ</p><div id="dailyCheckContent" data-daily-check-content class="res"><p>読み込み中...</p></div></section>';
    if(appsList) appsList.insertAdjacentHTML('beforebegin', html);
    else appsTab.insertAdjacentHTML('beforeend', html);
    return $('#dailyCheckCard');
  }

  function referenceLabel(ref){
    if(ref && typeof ref === 'object'){
      return [ref.title, ref.source_name, ref.year].filter(Boolean).join(' / ');
    }
    return ref;
  }

  function renderReferences(references){
    const list = Array.isArray(references) ? references : [];
    if(!list.length) return '';
    return `<div class="daily-references"><h3>参考文献</h3><ul>${list.map((ref) => `<li>${esc(referenceLabel(ref))}</li>`).join('')}</ul></div>`;
  }

  function renderAdvice(answer){
    const blocks = [];
    if(answer.feedback_text) blocks.push(`<h3>あなたへのアドバイス</h3><p>${esc(answer.feedback_text)}</p>`);
    if(answer.action_text) blocks.push(`<h3>今日やること</h3><p>${esc(answer.action_text)}</p>`);
    if(answer.evidence_summary) blocks.push(`<h3>科学的根拠の要約</h3><p>${esc(answer.evidence_summary)}</p>`);
    const refs = renderReferences(answer.references);
    if(refs) blocks.push(refs);
    return blocks.length ? `<div class="daily-advice">${blocks.join('')}</div>` : '';
  }

  function renderRecent(payload){
    return `
      <div class="daily-trends">
        <h3>最近のコンディション傾向</h3>
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

  function renderPreparing(payload){
    return `<div class="daily-check-hero"><p class="eyebrow">今日の1問</p><h2>30秒でできるコンディションチェック</h2><p>回答すると、あなたの状態に合わせたアドバイスが表示されます。</p></div><div class="res done"><p class="notice">${esc(payload?.message || `${PREPARING_TITLE}${PREPARING_MESSAGE}`)}</p></div>`;
  }

  function renderAnswered(payload){
    if(payload.status === 'preparing' || !payload.answer) return renderPreparing(payload);
    const answer = payload.answer || {};
    return `
      <div class="daily-check-hero">
        <p class="eyebrow">今日の1問</p>
        <h2>30秒でできるコンディションチェック</h2>
        <p>回答すると、あなたの状態に合わせたアドバイスが表示されます。</p>
      </div>
      <p class="notice">今日はすでに回答済みです。</p>
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
    if(payload.status === 'preparing' || !q.question_key || !options.length){
      return renderPreparing(payload);
    }
    return `
      <div class="daily-check-hero">
        <p class="eyebrow">今日の1問</p>
        <h2>30秒でできるコンディションチェック</h2>
        <p>回答すると、あなたの状態に合わせたアドバイスが表示されます。</p>
      </div>
      <p class="eyebrow">${esc(q.category_label || '')}</p>
      <h3>${esc(q.question_text || '')}</h3>
      <form class="daily-check-form" data-daily-check-form data-question-key="${esc(q.question_key)}">
        ${options.map((option, index) => `
          <label class="daily-option">
            <input type="radio" name="option_key" value="${esc(option.option_key)}" ${index === 0 ? 'checked' : ''}>
            <span>${esc(option.option_label)}</span>
          </label>
        `).join('')}
        <button class="btn" type="submit">今日の1問に回答する</button>
      </form>
      <div data-daily-check-feedback></div>
      ${renderRecent(payload)}
      ${renderThemes(payload.monthly_themes)}
    `;
  }

  function renderError(target, message){
    const mount = target ? null : ensureMount();
    const content = target || $('#dailyCheckContent') || mount?.querySelector('#dailyCheckContent');
    if(!content) return;
    content.innerHTML = `<div class="daily-check-hero"><p class="eyebrow">今日の1問</p><h2>30秒でできるコンディションチェック</h2><p>回答すると、あなたの状態に合わせたアドバイスが表示されます。</p></div><p class="notice">${esc(message || SQL_NOTICE)}</p>`;
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
      content.innerHTML = (payload.status === 'preparing' || !payload.question && !payload.answer) ? renderPreparing(payload) : (payload.answered_today ? renderAnswered(payload) : renderQuestion(payload));
      return payload;
    }catch(error){
      console.warn('[daily-check] unavailable', error);
      renderError(content, PREPARING_TITLE);
      return null;
    }
  }

  async function loadDailyCheck(){
    const mount = ensureMount();
    const content = mount?.querySelector('#dailyCheckContent');
    if(!content || $('#appView')?.classList.contains('hidden')) return null;
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
      renderError(form.closest('[data-daily-check-content]'), error.message || PREPARING_TITLE);
    }
  }

  function installStyles(){
    if($('#dailyCheckStyles')) return;
    document.head.insertAdjacentHTML('beforeend', `
      <style id="dailyCheckStyles">
        .fs-daily-check-card{box-sizing:border-box;width:100%;max-width:100%;padding:18px;border:2px solid #b8ddc3;border-radius:22px;background:linear-gradient(180deg,#f3fbf5 0%,#fffdf8 100%);box-shadow:0 12px 30px rgba(42,96,61,.10);overflow-wrap:anywhere;word-break:break-word}.fs-daily-check-card h2{margin:4px 0 10px}.daily-check-hero{box-sizing:border-box;max-width:100%;padding:14px;border-radius:18px;background:#ffffff;border:1px solid #d9eadf;overflow-wrap:anywhere;word-break:break-word}.daily-check-hero h2{font-size:22px}.daily-check-hero p{margin:6px 0 0;line-height:1.75}.apps-daily-check-card{display:grid;gap:10px}.daily-check-form{display:grid;gap:10px;margin-top:12px}.daily-option{display:flex;gap:10px;align-items:center;padding:12px;border:1px solid var(--line);border-radius:14px;background:#fffaf2;font-weight:850}.daily-option input{width:auto;margin:0}.daily-themes,.daily-trends,.daily-advice,.daily-references,.daily-references ul,.daily-references li{box-sizing:border-box;width:100%;max-width:100%;overflow-wrap:anywhere;word-break:break-word}.daily-themes,.daily-trends,.daily-advice{margin-top:14px;padding:12px;border:1px solid #d9eadf;border-radius:16px;background:#f5fbf6;line-height:1.75}.daily-references{margin-top:12px}.daily-references ul{display:grid;gap:8px;margin:8px 0 0;padding-left:1.2em}.daily-references li{line-height:1.7}.daily-themes ol{margin:8px 0 0 1.2em;padding:0}.daily-themes li{margin:4px 0;font-weight:850}.daily-tags{display:flex;flex-wrap:wrap;gap:8px}.daily-tag{display:inline-flex;max-width:100%;padding:4px 9px;border-radius:999px;background:#eaf7ee;color:#27533a;font-size:12px;font-weight:900;overflow-wrap:anywhere;word-break:break-word}
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
