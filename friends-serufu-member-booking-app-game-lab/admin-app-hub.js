(function(){
  'use strict';

  const SQL_MESSAGE = 'SQL v_app_hub_02_content_hub.sql をSupabaseに適用後に利用できます。';
  const $ = (q) => document.querySelector(q);

  function esc(value){
    return String(value ?? '').replace(/[&<>"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
  }

  function getClient(){
    if(!window.FRIENDS_SUPABASE_READY || !window.supabase || !window.FRIENDS_SUPABASE_URL || !window.FRIENDS_SUPABASE_ANON_KEY) return null;
    if(!window.fsAdminAppsSupabaseClient){
      window.fsAdminAppsSupabaseClient = window.supabase.createClient(window.FRIENDS_SUPABASE_URL, window.FRIENDS_SUPABASE_ANON_KEY);
    }
    return window.fsAdminAppsSupabaseClient;
  }

  function showMessage(message){
    const box = $('#adminAppsMessage');
    if(!box) return;
    box.textContent = message;
    box.classList.remove('hidden');
  }

  function clearMessage(){
    $('#adminAppsMessage')?.classList.add('hidden');
  }

  function fallback(message = SQL_MESSAGE){
    showMessage(message);
    const list = $('#adminAppsList');
    const logs = $('#adminAppActivityLogs');
    if(list) list.innerHTML = `<article class="res"><p>${SQL_MESSAGE}</p></article>`;
    if(logs) logs.innerHTML = '<article class="res"><p>直近の利用履歴はSQL適用後に表示されます。</p></article>';
  }

  async function rpc(name, args){
    const client = getClient();
    if(!client) throw new Error(SQL_MESSAGE);
    const { data, error } = await client.rpc(name, args);
    if(error) throw new Error(error.message || SQL_MESSAGE);
    if(!data || data.ok === false) throw new Error(data?.error || SQL_MESSAGE);
    return data;
  }

  function normalizeApp(app){
    return {
      app_key: app.app_key || '',
      title: app.title || app.app_name || app.app_key || '無題のコンテンツ',
      category: app.category_label || app.category_name || app.category_key || '-',
      content_type: app.content_type || 'game',
      enabled: app.enabled === true
    };
  }

  function resultText(result){
    if(!result || typeof result !== 'object') return '-';
    const stress = result.pre_stress || result.preStress || result.post_stress || result.postStress ? `ストレス度：${esc(result.pre_stress || result.preStress || '-')} → ${esc(result.post_stress || result.postStress || '-')}` : '';
    const score = result.score != null ? `スコア：${esc(result.score)}` : '';
    const lines = result.lines != null ? `ライン：${esc(result.lines)}` : '';
    return [stress, score, lines].filter(Boolean).join(' / ') || '-';
  }

  function renderApps(apps){
    const list = $('#adminAppsList');
    if(!list) return;
    const normalized = apps.map(normalizeApp);
    list.innerHTML = normalized.length ? normalized.map((app) => `
      <article class="res">
        <h3>${esc(app.title)}</h3>
        <p>カテゴリ：${esc(app.category)}</p>
        <p>種類：${esc(app.content_type)}</p>
        <p>ON/OFF状態：<strong>${app.enabled ? 'ON' : 'OFF'}</strong></p>
        <button class="${app.enabled ? 'danger' : 'ok'}" data-admin-app-toggle="${esc(app.app_key)}" data-app-title="${esc(app.title)}" data-current-enabled="${app.enabled ? '1' : '0'}">${app.enabled ? 'OFFにする' : 'ONにする'}</button>
      </article>
    `).join('') : '<article class="res"><p>コンテンツは登録されていません。</p></article>';
  }

  function renderLogs(logs){
    const box = $('#adminAppActivityLogs');
    if(!box) return;
    box.innerHTML = logs.length ? logs.map((log) => `
      <article class="res">
        <h3>${esc(log.member_name || '-')} / ${esc(log.member_code || log.member_id || '-')}</h3>
        <p>${esc(log.title || log.app_name || log.app_key || '-')} / ${new Date(log.created_at || log.activity_at || Date.now()).toLocaleString('ja-JP')}</p>
        <p>カテゴリ：${esc(log.category_label || log.category_name || '-')}</p>
        <p>種類：${esc(log.content_type || 'game')}</p>
        <p>ポイント：${esc(log.points || 0)}pt</p>
        <p>結果：${resultText(log.result)}</p>
      </article>
    `).join('') : '<article class="res"><p>直近の利用履歴はありません。</p></article>';
  }

  async function loadAdminApps(){
    if(!$('#appsTab')) return;
    try{
      clearMessage();
      const data = await rpc('fs_admin_apps_snapshot', { p_admin_password: sessionStorage.getItem('fs_admin_pass') || '1111' });
      renderApps(Array.isArray(data.apps) ? data.apps : []);
      renderLogs(Array.isArray(data.logs) ? data.logs : []);
    }catch(error){
      console.warn('[admin-app-hub] app hub unavailable', error);
      fallback(SQL_MESSAGE);
    }
  }

  async function setEnabled(appKey, enabled){
    await rpc('fs_admin_set_app_enabled', {
      p_admin_password: sessionStorage.getItem('fs_admin_pass') || '1111',
      p_app_key: appKey,
      p_enabled: enabled
    });
    await loadAdminApps();
  }

  function formatPlayTime(ms){
    const seconds = Math.max(0, Math.round(Number(ms || 0) / 1000));
    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;
    return min ? `${min}分${sec}秒` : `${sec}秒`;
  }

  function renderMemberLogs(memberId, logs){
    const detail = document.querySelector(`[data-member-detail="${CSS.escape(memberId)}"]`);
    const box = detail?.querySelector('.admin-member-app-history');
    if(!box) return;
    if(!logs.length){
      box.innerHTML = '<article class="res"><p>アプリ利用履歴はありません。</p></article>';
      return;
    }
    box.innerHTML = logs.map((log) => {
      const result = log.result || {};
      return `<article class="res">
        <p>${new Date(log.created_at || log.activity_at || Date.now()).toLocaleString('ja-JP')}</p>
        <h3>${esc(log.category_label || log.category_name || 'ストレスリセット')} / ${esc(log.title || log.app_name || 'ブロックパズル')}</h3>
        <p>種類：${esc(log.content_type || 'game')}</p>
        <p>利用時間：${formatPlayTime(result.play_time_ms || result.playTimeMs)}</p>
        <p>${esc(log.points || 0)}pt獲得</p>
        <p>ストレス度：${esc(result.pre_stress || result.preStress || '-')} → ${esc(result.post_stress || result.postStress || '-')}</p>
        <p>スコア：${esc(result.score || 0)}</p>
        <p>ライン：${esc(result.lines || 0)}</p>
      </article>`;
    }).join('');
  }

  async function loadMemberHistory(memberId){
    const detail = document.querySelector(`[data-member-detail="${CSS.escape(memberId)}"]`);
    const box = detail?.querySelector('.admin-member-app-history');
    if(!box) return;
    try{
      const data = await rpc('fs_admin_apps_snapshot', { p_admin_password: sessionStorage.getItem('fs_admin_pass') || '1111', p_member_id: memberId });
      const logs = (Array.isArray(data.logs) ? data.logs : []).filter((log) => String(log.member_id) === String(memberId));
      renderMemberLogs(memberId, logs);
    }catch(error){
      console.warn('[admin-app-hub] member app history unavailable', error);
      box.innerHTML = '<article class="res"><p>アプリ利用履歴はSQL v_app_hub_02_content_hub.sql 適用後に表示されます。</p></article>';
    }
  }

  function setup(){
    if(!$('#appsTab')) return;
    const logsTitle = $('#adminAppActivityLogs')?.previousElementSibling;
    if(logsTitle) logsTitle.textContent = '直近の利用履歴';
    document.addEventListener('click', (event) => {
      const tab = event.target.closest('[data-tab="apps"]');
      if(tab) setTimeout(loadAdminApps, 0);

      const reload = event.target.closest('[data-admin-app-reload]');
      if(reload){
        event.preventDefault();
        loadAdminApps();
      }

      const toggle = event.target.closest('[data-admin-app-toggle]');
      if(toggle){
        event.preventDefault();
        const next = toggle.dataset.currentEnabled !== '1';
        const title = toggle.dataset.appTitle || 'このコンテンツ';
        const message = next ? `${title}を表示しますか？` : `${title}を非表示にしますか？`;
        if(confirm(message)){
          setEnabled(toggle.dataset.adminAppToggle, next).catch((error) => {
            console.warn('[admin-app-hub] toggle failed', error);
            fallback(SQL_MESSAGE);
          });
        }
      }
    });
    document.addEventListener('fs-admin-member-detail-opened', (event) => {
      const memberId = event.detail?.memberId;
      if(memberId) loadMemberHistory(memberId);
    });
    const logs = $('#adminAppActivityLogs');
    if(logs && !$('#adminAppReload')){
      logs.insertAdjacentHTML('beforebegin', '<button id="adminAppReload" type="button" class="ghost" data-admin-app-reload>利用履歴を再読み込み</button>');
    }
    fallback(SQL_MESSAGE);
  }

  document.addEventListener('DOMContentLoaded', setup);
})();
