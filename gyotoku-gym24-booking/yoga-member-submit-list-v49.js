(() => {
  const db = window.supabase.createClient(window.FRIENDS_SUPABASE_URL, window.FRIENDS_SUPABASE_ANON_KEY);
  const $ = (q) => document.querySelector(q);
  const pad = (n) => String(n).padStart(2, '0');
  const fmt = (m) => {
    m = Number(m);
    return m === 1440 ? '24:00' : `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
  };
  const jp = (s) => {
    const d = new Date(`${s}T00:00:00`);
    return `${d.getMonth() + 1}/${d.getDate()}（${'日月火水木金土'[d.getDay()]}）`;
  };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]));
  const toMin = (v) => {
    if (v === '24:00') return 1440;
    const [h, m] = String(v || '').split(':').map(Number);
    return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : NaN;
  };
  const pass = () => ($('#yogaPass')?.value || sessionStorage.getItem('fs_yoga_private_pass') || localStorage.getItem('fs_yoga_private_saved_pass') || '').trim();
  const setMessage = (msg, ok = false) => {
    const el = $('#yogaStatus');
    if (!el) return;
    el.textContent = msg || '';
    el.className = msg ? `notice ${ok ? 'ok' : 'danger'}` : 'notice';
  };
  async function rpc(name, args) {
    const { data, error } = await db.rpc(name, args);
    if (error) throw new Error(error.message);
    if (!data?.ok) throw new Error(data?.error || 'RPC失敗');
    return data;
  }
  function renderList(snap) {
    const listEl = $('#yogaList');
    if (!listEl || !snap) return;
    const list = [...(snap.external_blocks || [])].sort((a, b) => {
      const da = String(a.date || '');
      const db = String(b.date || '');
      if (da !== db) return db.localeCompare(da);

      const sa = Number(a.start_minute || 0);
      const sb = Number(b.start_minute || 0);
      if (sa !== sb) return sb - sa;

      const ca = String(a.created_at || '');
      const cb = String(b.created_at || '');
      if (ca !== cb) return cb.localeCompare(ca);

      return String(b.id || '').localeCompare(String(a.id || ''));
    });
    listEl.innerHTML = list.length ? list.map((b) => {
      const end = Number(b.display_end_minute ?? b.end_minute);
      const name = String(b.member_name || '').trim() || '未入力';
      const note = String(b.note || '').trim() || '未入力';
      return `<article class="res yoga-private"><h3>ヨガ個別予約</h3><p>${esc(jp(b.date))} ${esc(fmt(b.start_minute))}〜${esc(fmt(end))}</p><p>会員名：${esc(name)}</p><p>メモ：${esc(note)}</p><button class="danger" data-yoga-delete="${esc(b.id)}">削除</button></article>`;
    }).join('') : '<article class="res"><p>登録済みのヨガ個別予約はありません。</p></article>';
  }
  async function refreshList() {
    if (!pass()) return;
    try {
      const snap = await rpc('fs_yoga_private_snapshot', { p_admin_password: pass() });
      renderList(snap);
    } catch (_) {}
  }
  async function submit(e) {
    const form = $('#yogaForm');
    if (!form || e.target !== form) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    const fd = new FormData(form);
    const memberName = String(fd.get('memberName') || '').trim();
    if (!memberName) {
      setMessage('会員名を入力してください。');
      alert('会員名を入力してください。');
      form.querySelector('[name="memberName"]')?.focus();
      return;
    }
    const s = toMin(fd.get('start'));
    const en = toMin(fd.get('end'));
    try {
      setMessage('登録しています...', true);
      await rpc('fs_yoga_private_create', {
        p_admin_password: pass(),
        p_date: fd.get('date'),
        p_start_minute: s,
        p_end_minute: en,
        p_member_name: memberName,
        p_instructor_name: '',
        p_note: String(fd.get('note') || '').trim()
      });
      const snap = await rpc('fs_yoga_private_snapshot', { p_admin_password: pass() });
      renderList(snap);
      setMessage('登録完了しました', true);
      const toast = $('#toast');
      if (toast) {
        toast.textContent = '登録完了しました';
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 2500);
      }
    } catch (err) {
      setMessage(err.message || '登録できませんでした');
      alert(err.message || '登録できませんでした');
    }
  }
  window.addEventListener('DOMContentLoaded', () => {
    const member = document.querySelector('[name="memberName"]');
    if (member) {
      member.required = true;
      member.removeAttribute('placeholder');
      const label = member.closest('label');
      if (label && label.firstChild) label.firstChild.textContent = '会員名（必須）';
    }
    document.addEventListener('submit', submit, true);
    setTimeout(refreshList, 800);
    setInterval(refreshList, 2000);
  });
})();
