(() => {
  const ID_KEY = 'fs_member_saved_id';
  const PIN_KEY = 'fs_member_saved_pin';
  const HOL=['2026-01-01','2026-01-12','2026-02-11','2026-02-23','2026-03-20','2026-04-29','2026-05-03','2026-05-04','2026-05-05','2026-05-06','2026-07-20','2026-08-11','2026-09-21','2026-09-22','2026-09-23','2026-10-12','2026-11-03','2026-11-23'];
  const $ = (q) => document.querySelector(q);
  const isVisible = (el) => el && !el.classList.contains('hidden');

  function applyProgramBlockFix(){
    const corrected=(d)=>{const w=new Date(d+'T00:00:00').getDay();if(HOL.includes(d))return[[510,820]];if(w===1)return[[510,610],[1080,1330]];if(w===2)return[[510,610],[750,790],[1080,1330]];if(w===3)return[[1080,1330]];if(w===4)return[[690,790],[1215,1315]];if(w===5)return[[1080,1330]];if(w===6||w===0)return[[460,820]];return[]};
    try{window.blocks=corrected;blocks=corrected;}catch(e){}
  }

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
      if (isVisible(appView)) { applyProgramBlockFix(); saveCurrentLogin(); }
    });
    observer.observe(appView, { attributes: true, attributeFilter: ['class'] });
  }

  window.addEventListener('DOMContentLoaded', () => {
    applyProgramBlockFix();
    addClearButton();
    fillSavedLogin();
    observeLoginSuccess();
    $('#loginForm')?.addEventListener('submit', () => setTimeout(() => { applyProgramBlockFix(); if (isVisible($('#appView'))) saveCurrentLogin(); }, 600));
    $('#logout')?.addEventListener('click', clearSavedLogin, true);
    tryAutoLogin();
  });
})();
