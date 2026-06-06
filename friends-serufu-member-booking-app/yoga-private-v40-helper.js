(() => {
  const USE = 40;
  const STEP = 10;
  const BLOCK = 50;
  const BUF = 10;
  const HOLIDAYS = ['2026-01-01','2026-01-12','2026-02-11','2026-02-23','2026-03-20','2026-04-29','2026-05-03','2026-05-04','2026-05-05','2026-05-06','2026-07-20','2026-08-11','2026-09-21','2026-09-22','2026-09-23','2026-10-12','2026-11-03','2026-11-23'];
  let snap = null;
  const $ = (q) => document.querySelector(q);
  const pad = (n) => String(n).padStart(2, '0');
  const fmt = (m) => m === 1440 ? '24:00' : pad(Math.floor(m / 60)) + ':' + pad(m % 60);
  const toMin = (v) => { if (v === '24:00') return 1440; const [h, m] = String(v || '').split(':').map(Number); return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : NaN; };
  const ymd = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  const dateValue = () => $('#yogaForm input[name=date]')?.value || ymd();
  const hit = (a, b, c, d) => a < d && c < b;
  function programBlocks(date) {
    const day = new Date(date + 'T00:00:00').getDay();
    if (HOLIDAYS.includes(date)) return [[540, 580], [600, 790]];
    if (day === 1) return [[540, 580], [1110, 1300]];
    if (day === 2) return [[540, 580], [750, 790], [1110, 1300]];
    if (day === 3) return [[1110, 1300]];
    if (day === 4) return [[720, 760], [1215, 1315]];
    if (day === 5) return [[1110, 1300]];
    if (day === 6 || day === 0) return [[490, 530], [600, 790]];
    return [];
  }
  function busyBlocks(date) {
    if (!snap) return [];
    const self = (snap.reservations || []).filter(x => x.date === date).map(x => [Number(x.start_minute), Number(x.start_minute) + BLOCK]);
    const closed = (snap.closed_slots || []).filter(x => x.date === date).map(x => [Number(x.start_minute), Number(x.start_minute) + BLOCK]);
    const yoga = (snap.external_blocks || []).filter(x => x.date === date).map(x => [Number(x.start_minute), Math.min(1440, Number(x.block_end_minute || (Number(x.end_minute) + BUF)))]);
    return [...self, ...closed, ...yoga];
  }
  function ok(date, s, e) {
    if (!Number.isInteger(s) || !Number.isInteger(e) || s < 0 || e > 1440 || s >= e || s % STEP || e % STEP) return false;
    const endWithBuffer = Math.min(1440, e + BUF);
    if (busyBlocks(date).some(([bs, be]) => hit(s, endWithBuffer, bs, be))) return false;
    return !programBlocks(date).some(([ps, pe]) => hit(s, endWithBuffer, ps, Math.min(1440, pe + BUF)));
  }
  function startList(date) {
    const out = [];
    for (let m = 0; m + USE <= 1440; m += STEP) if (ok(date, m, m + USE)) out.push(m);
    return out;
  }
  function endList(date, s) {
    const out = [];
    for (let e = s + STEP; e <= 1440; e += STEP) if (ok(date, s, e)) out.push(e);
    return out;
  }
  function options(list) { return list.length ? list.map(m => `<option value="${fmt(m)}">${fmt(m)}</option>`).join('') : '<option value="">空きなし</option>'; }
  function sync(forceStart = false, forceEnd = false) {
    const start = $('#yogaStart');
    const end = $('#yogaEnd');
    if (!start || !end) return;
    const date = dateValue();
    const oldStart = toMin(start.value);
    const starts = startList(date);
    start.innerHTML = options(starts);
    if (!forceStart && starts.includes(oldStart)) start.value = fmt(oldStart);
    else if (starts.length) start.value = fmt(starts.includes(490) ? 490 : starts[0]);
    const s = toMin(start.value);
    const oldEnd = toMin(end.value);
    const ends = Number.isFinite(s) ? endList(date, s) : [];
    const def = s + USE;
    end.innerHTML = options(ends);
    if (!forceEnd && ends.includes(oldEnd)) end.value = fmt(oldEnd);
    else if (ends.includes(def)) end.value = fmt(def);
    else if (ends.length) end.value = fmt(ends[0]);
  }
  if (window.supabase && !window.__fsYogaV40Wrapped) {
    window.__fsYogaV40Wrapped = true;
    const original = window.supabase.createClient.bind(window.supabase);
    window.supabase.createClient = (...args) => {
      const client = original(...args);
      const originalRpc = client.rpc.bind(client);
      client.rpc = async (name, params) => {
        if (name === 'fs_yoga_private_create') {
          const member = document.querySelector('[name="memberName"]')?.value || '';
          params = { ...params, p_member_name: member.trim() };
        }
        const result = await originalRpc(name, params);
        if (name === 'fs_yoga_private_snapshot' && result?.data?.ok) {
          snap = result.data;
          setTimeout(() => sync(false, false), 0);
        }
        return result;
      };
      return client;
    };
  }
  document.addEventListener('DOMContentLoaded', () => {
    const form = $('#yogaForm');
    if (!form) return;
    if (!form.querySelector('[name="memberName"]')) {
      form.querySelector('.two')?.insertAdjacentHTML('afterend', '<label>会員名（任意）<input name="memberName" placeholder="未入力でも登録できます"></label>');
    }
    setTimeout(() => sync(true, true), 0);
    form.addEventListener('change', (e) => {
      if (e.target?.name === 'date') setTimeout(() => sync(true, true), 0);
      if (e.target?.name === 'start') setTimeout(() => sync(false, true), 0);
    });
  });
})();
