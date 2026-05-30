(function(){
  'use strict';

  const SQL_NOTICE = 'コンディション回答履歴はSQL v_daily_check_03_progress_and_booking_prompt.sql 適用後に表示されます。';
  const $ = (q, root = document) => root.querySelector(q);
  const $$ = (q, root = document) => Array.from(root.querySelectorAll(q));

  function esc(value){
    return String(value ?? '').replace(/[&<>"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
  }

  function client(){
    if(typeof db !== 'undefined') return db;
    if(!window.supabase || !window.FRIENDS_SUPABASE_URL || !window.FRIENDS_SUPABASE_ANON_KEY) return null;
    if(!window.fsAdminDailyCheckClient){
      window.fsAdminDailyCheckClient = window.supabase.createClient(window.FRIENDS_SUPABASE_URL, window.FRIENDS_SUPABASE_ANON_KEY);
    }
    return window.fsAdminDailyCheckClient;
  }

  async function callRpc(name, args){
    const c = client();
    if(!c) throw new Error('Supabase client is not ready');
    const { data, error } = await c.rpc(name, args);
    if(error) throw new Error(error.message || 'daily admin rpc failed');
    return data || { ok:false, error:'応答がありません' };
  }

  function pass(){
    return sessionStorage.getItem('fs_admin_pass') || $('#adminPass')?.value || '';
  }

  function renderTags(tags){
    const list = Array.isArray(tags) ? tags : [];
    return list.length ? list.map((tag) => `<span class="daily-tag">${esc(tag.tag || tag)}</span>`).join('') : '<span class="small">-</span>';
  }

  function renderThemes(themes){
    const list = Array.isArray(themes) ? themes : [];
    if(!list.length) return '<p class="small">回答が増えると月間おすすめテーマが表示されます。</p>';
    return `<ol>${list.slice(0,3).map((theme) => `<li>${esc(theme.label || theme.theme || theme)}</li>`).join('')}</ol>`;
  }

  function ensureTab(){
    if($('#conditionTab')) return;
    const tabs = $('#adminView .tabs');
    const apps = $('#appsTab');
    if(tabs) tabs.insertAdjacentHTML('beforeend', '<button class="tab" data-tab="condition">コンディション管理</button>');
    if(apps) apps.insertAdjacentHTML('afterend', '<section id="conditionTab" class="panel hidden"><p class="eyebrow">コンディション管理</p><h2>コンディション管理</h2><div id="adminDailyCheckContent" class="list"><article class="res"><p>読み込み中...</p></article></div></section>');
  }

  function renderSnapshot(payload){
    const answers = Array.isArray(payload.answers) ? payload.answers : [];
    const questions = Array.isArray(payload.questions) ? payload.questions : [];
    $('#adminDailyCheckContent').innerHTML = `
      <h3>直近の回答履歴</h3>
      ${answers.length ? answers.map((answer) => `
        <article class="res">
          <h3>${esc(answer.member_name || '-')} <span class="small">${esc(answer.member_code || '')}</span></h3>
          <p><strong>会員ID：</strong>${esc(answer.member_id || '')}</p>
          <p><strong>質問カテゴリ：</strong>${esc(answer.category_label || '')}</p>
          <p><strong>質問：</strong>${esc(answer.question_text || '')}</p>
          <p><strong>回答：</strong>${esc(answer.option_label || '')}</p>
          <p><strong>タグ：</strong>${renderTags(answer.tags)}</p>
          <p><strong>回答日時：</strong>${answer.created_at ? esc(new Date(answer.created_at).toLocaleString('ja-JP')) : '-'}</p>
        </article>
      `).join('') : '<article class="res"><p>回答履歴はまだありません。</p></article>'}
      <h3>質問一覧</h3>
      ${questions.length ? questions.map((q) => `<article class="res"><p class="eyebrow">${esc(q.category_label)}</p><h3>${esc(q.question_text)}</h3><p class="small">${esc(q.question_key)}</p></article>`).join('') : '<article class="res"><p>質問一覧はSQL適用後に表示されます。</p></article>'}
    `;
  }

  async function loadAdminDailyCheck(){
    ensureTab();
    if(!pass()) return;
    const content = $('#adminDailyCheckContent');
    if(!content) return;
    content.innerHTML = '<article class="res"><p>コンディション管理を読み込んでいます...</p></article>';
    try{
      const payload = await callRpc('fs_admin_daily_check_snapshot', { p_admin_password: pass() });
      if(!payload.ok) throw new Error(payload.error || SQL_NOTICE);
      renderSnapshot(payload);
    }catch(error){
      console.warn('[admin-daily-check] unavailable', error);
      content.innerHTML = `<article class="res"><p class="notice">${SQL_NOTICE}</p></article>`;
    }
  }

  function historyHtml(payload){
    const answers = Array.isArray(payload.answers) ? payload.answers : [];
    const tags = Array.isArray(payload.monthly_tags) ? payload.monthly_tags : [];
    return `
      <section class="res admin-member-daily-check" data-daily-member-section>
        <p class="eyebrow">コンディション回答履歴</p>
        <h3>コンディション回答履歴</h3>
        <h4>月間おすすめテーマ</h4>
        ${renderThemes(payload.monthly_themes)}
        <h4>タグ傾向</h4>
        ${tags.length ? `<div class="daily-tags">${tags.map((tag) => `<span class="daily-tag">${esc(tag.tag)}：${esc(tag.count)}</span>`).join('')}</div>` : '<p class="small">今月のタグ傾向はまだありません。</p>'}
        <h4>回答履歴</h4>
        ${answers.length ? answers.map((answer) => `<article class="res"><p class="eyebrow">${esc(answer.category_label || '')}</p><h3>${esc(answer.question_text || '')}</h3><p><strong>回答：</strong>${esc(answer.option_label || '')}</p><p><strong>あなたへのアドバイス：</strong>${esc(answer.feedback_text || '')}</p><p><strong>今日やること：</strong>${esc(answer.action_text || '')}</p><p><strong>科学的根拠の要約：</strong>${esc(answer.evidence_summary || '')}</p><p><strong>参考文献：</strong>${Array.isArray(answer.references) && answer.references.length ? answer.references.map((ref) => esc(ref)).join(' / ') : '-'}</p><p><strong>タグ：</strong>${renderTags(answer.tags)}</p><p><strong>回答日時：</strong>${answer.created_at ? esc(new Date(answer.created_at).toLocaleString('ja-JP')) : '-'}</p></article>`).join('') : '<article class="res"><p>回答履歴はまだありません。</p></article>'}
      </section>
    `;
  }

  async function loadMemberDailyAnswers(memberId){
    const detail = $(`[data-member-detail="${CSS.escape(String(memberId))}"]`);
    if(!detail || detail.querySelector('[data-daily-member-section]')) return;
    detail.insertAdjacentHTML('beforeend', '<section class="res" data-daily-member-section><p class="eyebrow">コンディション回答履歴</p><p>読み込み中...</p></section>');
    try{
      const payload = await callRpc('fs_admin_member_daily_answers', { p_admin_password: pass(), p_member_id: memberId });
      if(!payload.ok) throw new Error(payload.error || SQL_NOTICE);
      detail.querySelector('[data-daily-member-section]').outerHTML = historyHtml(payload);
    }catch(error){
      console.warn('[admin-member-daily-check] unavailable', error);
      detail.querySelector('[data-daily-member-section]').innerHTML = `<p class="eyebrow">コンディション回答履歴</p><p class="notice">${SQL_NOTICE}</p>`;
    }
  }

  function installStyles(){
    if($('#adminDailyCheckStyles')) return;
    document.head.insertAdjacentHTML('beforeend', '<style id="adminDailyCheckStyles">.daily-tags{display:flex;flex-wrap:wrap;gap:8px}.daily-tag{display:inline-flex;padding:4px 9px;border-radius:999px;background:#eaf7ee;color:#27533a;font-size:12px;font-weight:900}.admin-member-daily-check{display:grid;gap:8px}</style>');
  }

  function hookSnapshot(){
    const original = window.loadSnapshot;
    if(typeof original === 'function' && !original.fsAdminDailyWrapped){
      const wrapped = async function(){
        const result = await original.apply(this, arguments);
        setTimeout(loadAdminDailyCheck, 0);
        return result;
      };
      wrapped.fsAdminDailyWrapped = true;
      window.loadSnapshot = wrapped;
    }
  }

  document.addEventListener('fs-admin-member-detail-opened', (event) => {
    if(event.detail?.memberId) loadMemberDailyAnswers(event.detail.memberId);
  });

  document.addEventListener('click', (event) => {
    const anyTab = event.target.closest('[data-tab]');
    if(!anyTab) return;
    setTimeout(() => {
      const condition = $('#conditionTab');
      if(condition) condition.classList.toggle('hidden', anyTab.dataset.tab !== 'condition');
      if(anyTab.dataset.tab === 'condition') loadAdminDailyCheck();
    }, 0);
  });

  document.addEventListener('DOMContentLoaded', () => {
    installStyles();
    ensureTab();
    hookSnapshot();
    setTimeout(loadAdminDailyCheck, 500);
  });

  window.fsLoadAdminDailyCheck = loadAdminDailyCheck;
})();
