import { RECOVERY_URL, RECOVERY_PREFIX, PENDING_KEY, recoveryStorageKey, createPasswordRecovery } from './reset-password-controller.mjs';

const status = document.querySelector('#recoveryStatus');
const requestForm = document.querySelector('#requestRecovery');
const updateForm = document.querySelector('#updatePassword');
const controlledByWorker = Boolean(navigator.serviceWorker?.controller);
try {
  if (controlledByWorker) throw new Error();
  const storage = window.sessionStorage;
  const storageKey = recoveryStorageKey(storage, () => crypto.randomUUID());
  // Do not reuse or auto-refresh a session left by an earlier page visit.
  for (let i = storage.length - 1; i >= 0; i--) {
    const key = storage.key(i);
    if (key?.startsWith(RECOVERY_PREFIX) && key !== storageKey + '-code-verifier') storage.removeItem(key);
  }
  if (new URL(window.GYOTOKU_SUPABASE_URL).hostname !== 'fplvstwmsewpqwrcsqrm.supabase.co') throw new Error();
  const client = window.supabase.createClient(window.GYOTOKU_SUPABASE_URL, window.GYOTOKU_SUPABASE_ANON_KEY, {
    auth: { flowType: 'pkce', storage, storageKey, persistSession: true, autoRefreshToken: false, detectSessionInUrl: false, debug: false },
  });
  const controller = createPasswordRecovery({ client, storage, storageKey,
    locationUrl: location.origin + location.pathname,
    replaceUrl: () => history.replaceState(null, '', location.pathname),
  });
  let href = location.href;
  const callback = location.search.length > 0 || location.hash.length > 0;
  let recovering = false;
  if (callback) {
    const result = await controller.open(href);
    href = null;
    status.textContent = result.message;
    updateForm.hidden = !result.ok;
    recovering = result.ok;
  } else {
    href = null;
    history.replaceState(null, '', location.pathname);
    status.textContent = location.origin + location.pathname === RECOVERY_URL
      ? '既存の管理用メールアドレスを入力してください。' : 'この画面は準備中です。再設定メールは送信できません。';
    requestForm.hidden = location.origin + location.pathname !== RECOVERY_URL;
  }
  requestForm.addEventListener('submit', async event => {
    event.preventDefault();
    const button = requestForm.querySelector('button');
    if (button.disabled) return;
    button.disabled = true;
    let email = requestForm.elements.email.value;
    requestForm.reset();
    const result = await controller.request(email);
    email = null;
    status.textContent = result.message;
    if (result.ok) requestForm.hidden = true;
    else button.disabled = false;
  });
  updateForm.addEventListener('submit', async event => {
    event.preventDefault();
    const button = updateForm.querySelector('button');
    if (button.disabled) return;
    button.disabled = true;
    let password = updateForm.elements.password.value;
    let confirmation = updateForm.elements.confirmation.value;
    const confirmed = updateForm.elements.confirmed.checked;
    updateForm.reset();
    const result = await controller.update(password, confirmation, confirmed);
    password = null; confirmation = null;
    status.textContent = result.message;
    if (result.ok || !result.retryable) updateForm.hidden = true;
    else button.disabled = false;
  });
  window.addEventListener('pagehide', () => {
    requestForm.reset(); updateForm.reset();
    if (recovering) controller.abandon();
  });
} catch {
  try {
    sessionStorage.removeItem(PENDING_KEY);
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const key = sessionStorage.key(i);
      if (key?.startsWith(RECOVERY_PREFIX)) sessionStorage.removeItem(key);
    }
  } catch { /* Storage may be disabled by the browser. */ }
  history.replaceState(null, '', location.pathname);
  requestForm.reset(); updateForm.reset();
  requestForm.hidden = true; updateForm.hidden = true;
  status.textContent = controlledByWorker
    ? '再設定は、新しいプライベートウィンドウでこのページを開いて始めてください。メールのリンクも、その同じタブで開いてください。'
    : '回復画面を準備できませんでした。運営者へお問い合わせください。';
}
