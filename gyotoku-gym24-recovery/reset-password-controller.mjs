export const RECOVERY_URL = 'https://kyoheiehime089-cpu.github.io/blossom-yoga-lp/gyotoku-gym24-recovery/reset-password.html';
export const RECOVERY_PREFIX = 'gym24-recovery-pkce-';
export const PENDING_KEY = 'gym24-recovery-pending';
const INVALID = '回復リンクを確認できません。同じブラウザーの元のタブから、再設定をやり直してください。';
const FAILED = '変更結果を確認できませんでした。管理者ログインを確認し、必要なら新しい回復メールからやり直してください。';

function pendingFlow(storage) {
  try {
    const flow = JSON.parse(storage.getItem(PENDING_KEY) || 'null');
    return flow && /^[a-f0-9-]{36}$/.test(flow.nonce) && typeof flow.email === 'string'
      && Number.isFinite(flow.startedAt) ? flow : null;
  } catch { return null; }
}

export function recoveryStorageKey(storage, newNonce) {
  return RECOVERY_PREFIX + (pendingFlow(storage)?.nonce || newNonce());
}

export function createPasswordRecovery({ client, storage, storageKey, now = Date.now, replaceUrl, locationUrl }) {
  let grant = null, busy = false, finished = false;
  const cleanStorage = () => {
    storage.removeItem(PENDING_KEY);
    for (let i = storage.length - 1; i >= 0; i--) {
      const key = storage.key(i);
      if (key?.startsWith(RECOVERY_PREFIX)) storage.removeItem(key);
    }
  };
  const clean = async () => {
    grant = null;
    try { await client.auth.signOut({ scope: 'local' }); } catch { /* Local cleanup must still run. */ }
    finally { cleanStorage(); replaceUrl(); }
  };
  const verifiedOwner = async (session, expectedId, expectedEmail) => {
    if (!session?.access_token || !Number.isFinite(session.expires_at)
      || session.expires_at * 1000 <= now() + 120000) throw new Error(INVALID);
    const { data, error } = await client.auth.getUser(session.access_token);
    const user = data?.user;
    if (error || !user?.id || !user.email_confirmed_at || user.is_anonymous
      || user.email?.toLowerCase() !== expectedEmail
      || (expectedId && user.id !== expectedId)) throw new Error(INVALID);
    const allowed = await client.rpc('gym24_admin_authorized', {});
    if (allowed.error || allowed.data !== true) throw new Error(INVALID);
    return user;
  };
  return {
    async request(email) {
      if (busy || finished) return { ok: false, message: '処理中です。' };
      busy = true;
      try {
        if (locationUrl !== RECOVERY_URL || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) throw new Error();
        cleanStorage();
        storage.setItem(PENDING_KEY, JSON.stringify({ email: email.trim().toLowerCase(), startedAt: now(), nonce: storageKey.slice(RECOVERY_PREFIX.length) }));
        const result = await client.auth.resetPasswordForEmail(email.trim(), { redirectTo: RECOVERY_URL });
        if (result.error) throw new Error();
        return { ok: true, message: '再設定メールを要求しました。届いたリンクを、このブラウザーのこのタブで開いてください。' };
      } catch {
        await clean();
        return { ok: false, message: '再設定メールを要求できませんでした。時間をおいてやり直してください。' };
      } finally { busy = false; }
    },
    async open(href) {
      if (busy || finished) return { ok: false, message: INVALID };
      busy = true;
      let recoveryCode;
      try {
        const url = new URL(href);
        recoveryCode = url.searchParams.get('code');
        const hasError = url.searchParams.has('error') || url.hash.length > 0;
        replaceUrl();
        const flow = pendingFlow(storage);
        if (!recoveryCode || hasError || !flow || now() < flow.startedAt || now() - flow.startedAt > 3600000
          || storageKey !== RECOVERY_PREFIX + flow.nonce) throw new Error(INVALID);
        const result = await client.auth.exchangeCodeForSession(recoveryCode);
        recoveryCode = null;
        if (result.error || result.data?.redirectType !== 'recovery') throw new Error(INVALID);
        const session = result.data.session;
        const user = await verifiedOwner(session, null, flow.email);
        grant = { session, id: user.id, email: flow.email, openedAt: now() };
        storage.removeItem(PENDING_KEY);
        return { ok: true, message: '回復手続きを確認しました。新しいパスワードを入力してください。' };
      } catch {
        await clean();
        return { ok: false, message: INVALID };
      } finally { recoveryCode = null; busy = false; }
    },
    async update(password, confirmation, confirmed) {
      if (busy || finished) return { ok: false, message: '処理中、または変更済みです。' };
      if (!grant) return { ok: false, message: INVALID };
      if (typeof password !== 'string' || password.length < 12 || password.length > 128
        || password !== confirmation || confirmed !== true) {
        return { ok: false, message: '12〜128文字の同じパスワードを2回入力し、確認欄をチェックしてください。', retryable: true };
      }
      busy = true;
      try {
        if (now() < grant.openedAt || now() - grant.openedAt > 600000) throw new Error();
        await verifiedOwner(grant.session, grant.id, grant.email);
        const { data, error } = await client.auth.updateUser({ password });
        if (error || data?.user?.id !== grant.id) throw new Error();
        finished = true;
        await clean();
        return { ok: true, message: 'パスワードを変更しました。案内された管理権限の確認画面で、新しいパスワードを使って確認してください。' };
      } catch {
        finished = true;
        await clean();
        return { ok: false, message: FAILED };
      } finally { password = null; confirmation = null; busy = false; }
    },
    async close() { finished = true; await clean(); },
    abandon() { finished = true; grant = null; cleanStorage(); replaceUrl(); },
  };
}
