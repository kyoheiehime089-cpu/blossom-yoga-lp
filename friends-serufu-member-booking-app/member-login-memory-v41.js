(() => {
  const ID_KEY = 'fs_member_saved_id';
  const PIN_KEY = 'fs_member_saved_pin';
  const $ = (q) => document.querySelector(q);
  const isVisible = (el) => el && !el.classList.contains('hidden');

  function fillSavedLogin() {
    const idInput = $('#memberId');
    const pinInput = $('#pin');
    if (!idInput || !pinInput) return false;
    const savedId = localStorage.getItem(ID_KEY) || '';
    const savedPin = localStorage.getItem(PIN_KEY) || '';
    if (savedId && !idInput.value) idInput.value = savedId;
    if (savedPin && !pinInput.value) pinInput.value = savedPin;
    return Boolean(savedId && savedPin);
  }

  function saveCurrentLogin() {
    const id = ($('#memberId')?.value || '').trim();
    const pin = ($('#pin')?.value || '').trim();
    if (id && pin) {
      localStorage.setItem(ID_KEY, id);
      localStorage.setItem(PIN_KEY, pin);
    }
  }

  function clearSavedLogin() {
    localStorage.removeItem(ID_KEY);
    localStorage.removeItem(PIN_KEY);
  }

  function addClearButton() {
    const form = $('#loginForm');
    if (!form || $('#clearMemberSavedLogin')) return;
    const btn = document.createElement('button');
    btn.id = 'clearMemberSavedLogin';
    btn.type = 'button';
    btn.className = 'ghost';
    btn.style.marginTop = '8px';
    btn.textContent = '保存したログイン情報を削除';
    btn.addEventListener('click', () => {
      clearSavedLogin();
      const idInput = $('#memberId');
      const pinInput = $('#pin');
      if (idInput) idInput.value = '';
      if (pinInput) pinInput.value = '';
      alert('保存したログイン情報を削除しました');
    });
    form.appendChild(btn);
  }

  function tryAutoLogin() {
    if (!fillSavedLogin()) return;
    const appView = $('#appView');
    if (isVisible(appView)) return;
    setTimeout(() => {
      if (isVisible($('#appView'))) return;
      const form = $('#loginForm');
      if (form) form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    }, 250);
  }

  function observeLoginSuccess() {
    const appView = $('#appView');
    if (!appView) return;
    const observer = new MutationObserver(() => {
      if (isVisible(appView)) saveCurrentLogin();
    });
    observer.observe(appView, { attributes: true, attributeFilter: ['class'] });
  }

  window.addEventListener('DOMContentLoaded', () => {
    addClearButton();
    fillSavedLogin();
    observeLoginSuccess();
    $('#loginForm')?.addEventListener('submit', () => setTimeout(() => { if (isVisible($('#appView'))) saveCurrentLogin(); }, 600));
    $('#logout')?.addEventListener('click', clearSavedLogin, true);
    tryAutoLogin();
  });
})();
