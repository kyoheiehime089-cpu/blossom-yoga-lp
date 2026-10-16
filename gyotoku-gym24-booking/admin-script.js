const gyotokuAdminDb = window.gym24AdminAuthClient ||= window.supabase.createClient(window.GYOTOKU_SUPABASE_URL, window.GYOTOKU_SUPABASE_ANON_KEY);

const PLAN_OPTIONS = [
  { value: 'free', label: '無料プラン' },
  { value: 'standard', label: 'スタンダードプラン' },
  { value: 'premium', label: 'プレミアムプラン' }
];
const ADMIN_SLOT_MINUTES = 40;
const BLOCK_MINUTES = 50;
const FIXED_SLOT_STEP_MINUTES = 50;
const FLEXIBLE_SLOT_STEP_MINUTES = 10;
const FIXED_SLOT_START_MINUTE = 490;
const FIXED_SLOT_END_MINUTE = 1320;
const FLEXIBLE_NIGHT_START_MINUTE = 1320;
const FLEXIBLE_MORNING_END_MINUTE = 480;
const HOLIDAYS = ['2026-01-01', '2026-01-12', '2026-02-11', '2026-02-23', '2026-03-20', '2026-04-29', '2026-05-03', '2026-05-04', '2026-05-05', '2026-05-06', '2026-07-20', '2026-08-11', '2026-09-21', '2026-09-22', '2026-09-23', '2026-10-12', '2026-11-03', '2026-11-23'];

let adminPassword = '';
let week = 0;
let selectedDay = 0;
let selectedSlot = null;
let snapshot = { members: [], reservations: [], closed_slots: [], external_blocks: [] };

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const pad = value => String(value).padStart(2, '0');
const dateKey = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const formatMinute = value => Number(value) === 1440 ? '24:00' : `${pad(Math.floor(Number(value) / 60))}:${pad(Number(value) % 60)}`;
const japaneseDate = value => { const date = new Date(`${value}T00:00:00`); return `${date.getMonth() + 1}/${date.getDate()}（${'日月火水木金土'[date.getDay()]}）`; };
const slotRange = startMinute => `${formatMinute(startMinute)}〜${formatMinute(Number(startMinute) + ADMIN_SLOT_MINUTES)}`;
const fullRange = (date, startMinute) => `${japaneseDate(date)} ${slotRange(startMinute)}`;
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));

function toast(message) { if (window.adminSoftToast) window.adminSoftToast(message); else alert(message); }
async function rpc(name, args) { const { data, error } = await gyotokuAdminDb.rpc(name, args); if (error) throw new Error(error.message); if (!data?.ok) throw new Error(data?.error || '処理に失敗しました。'); return data; }
function holiday(date) { return HOLIDAYS.includes(date); }
function scheduleBlocks(date) { const day = new Date(`${date}T00:00:00`).getDay(); if (holiday(date)) return [[510, 820]]; if (day === 1) return [[510, 610], [1080, 1330]]; if (day === 2) return [[510, 610], [720, 820], [1080, 1330]]; if (day === 3) return [[1080, 1330]]; if (day === 4) return [[690, 790], [1215, 1315]]; if (day === 5) return [[1080, 1330]]; if (day === 6 || day === 0) return [[460, 820]]; return []; }
function scheduleConflict(date, startMinute) { return scheduleBlocks(date).some(([from, to]) => Number(startMinute) < to && from < Number(startMinute) + BLOCK_MINUTES); }
function overlaps(aStart, aEnd, bStart, bEnd) { return Number(aStart) < Number(bEnd) && Number(bStart) < Number(aEnd); }
function reservationAt(date, startMinute) { return snapshot.reservations.find(reservation => reservation.date === date && Number(reservation.start_minute) === Number(startMinute)) || snapshot.reservations.find(reservation => reservation.date === date && overlaps(startMinute, Number(startMinute) + BLOCK_MINUTES, reservation.start_minute, Number(reservation.start_minute) + BLOCK_MINUTES)); }
function closedAt(date, startMinute) { return snapshot.closed_slots.find(item => item.date === date && Number(item.start_minute) === Number(startMinute)) || snapshot.closed_slots.find(item => item.date === date && overlaps(startMinute, Number(startMinute) + BLOCK_MINUTES, item.start_minute, Number(item.start_minute) + BLOCK_MINUTES)); }
function externalAt(date, startMinute) { return (snapshot.external_blocks || []).find(item => item.date === date && overlaps(startMinute, Number(startMinute) + BLOCK_MINUTES, item.start_minute, Number(item.block_end_minute ?? Number(item.end_minute) + 10))); }
function memberById(id) { return snapshot.members.find(member => member.id === id); }
function weekStart() { const date = new Date(); date.setHours(0, 0, 0, 0); date.setDate(date.getDate() + week * 7); return date; }
function selectedDate() { const date = weekStart(); date.setDate(date.getDate() + selectedDay); return date; }
function fixedStarts() { const values = []; for (let minute = FIXED_SLOT_START_MINUTE; minute < FIXED_SLOT_END_MINUTE; minute += FIXED_SLOT_STEP_MINUTES) values.push(minute); return values; }
function flexibleStarts() { const values = []; for (let minute = FLEXIBLE_NIGHT_START_MINUTE; minute + ADMIN_SLOT_MINUTES <= 1440; minute += FLEXIBLE_SLOT_STEP_MINUTES) values.push(minute); for (let minute = 0; minute + ADMIN_SLOT_MINUTES <= FLEXIBLE_MORNING_END_MINUTE; minute += FLEXIBLE_SLOT_STEP_MINUTES) values.push(minute); return values; }
function availableAdminSlot(date, startMinute) { return !scheduleConflict(date, startMinute) && !reservationAt(date, startMinute) && !closedAt(date, startMinute) && !externalAt(date, startMinute); }

function missingV7AdminRpc(error) { return /PGRST202|Could not find the function|schema cache/i.test(error?.message || ''); }
let adminSessionEpoch = 0;
async function verifiedV7AdminToken() {
  const { data: sessionData, error: sessionError } = await gyotokuAdminDb.auth.getSession();
  if (sessionError || !sessionData?.session?.access_token) throw new Error('管理者アカウントでログインしてください。');
  const { data: authorized, error } = await gyotokuAdminDb.rpc('gym24_admin_authorized', {});
  if (error || authorized !== true) throw new Error('新会員の管理権限を確認できません。');
  return sessionData.session.access_token;
}
async function v7AdminRpc(name, args) {
  await verifiedV7AdminToken();
  return rpc(name, { ...args, p_admin_password: null });
}
async function loadSnapshot() {
  const sessionEpoch = adminSessionEpoch;
  const legacy = await rpc('fs_admin_snapshot', { p_admin_password: adminPassword });
  if (sessionEpoch !== adminSessionEpoch) return;
  snapshot = legacy;
  window.gyotokuAdminV7BackendUnavailable = false;
  try {
    const v7 = await v7AdminRpc('fs_v7_admin_snapshot', {});
    if (sessionEpoch !== adminSessionEpoch) return;
    const v7Members = Array.isArray(v7.members) ? v7.members : [];
    const v7Ids = new Set(v7Members.map(member => String(member.id)));
    snapshot = {
      ...legacy,
      members: [...(legacy.members || []).filter(member => !v7Ids.has(String(member.id))), ...v7Members],
      registered_users: [...(legacy.registered_users || []).filter(user => !v7Ids.has(String(user.member_id))), ...(v7.registered_users || [])],
      reservations: [...(legacy.reservations || []).filter(item => !v7Ids.has(String(item.member_id))), ...(v7.reservations || [])],
      booking_policy: v7.booking_policy,
    };
  } catch (error) {
    if (sessionEpoch !== adminSessionEpoch) return;
    window.gyotokuAdminV7BackendUnavailable = true;
    window.dispatchEvent(new Event('gym24-admin-signed-out'));
    $('#adminView').classList.add('hidden');
    $('#loginView').classList.remove('hidden');
    throw new Error('管理データを確認できませんでした。時間をおいて再度ログインしてください。');
  }
  window.gyotokuAdminSnapshot = snapshot;
  renderAll();
}
window.gyotokuAdminV7Rpc = (name, args) => {
  const allowed = new Set(['fs_v7_admin_create_reservation', 'fs_v7_admin_cancel_reservation', 'fs_v7_admin_create_member', 'fs_v7_admin_update_plan', 'fs_v7_admin_confirm_companion_safety']);
  if (!allowed.has(name)) throw new Error('許可されていないv7管理操作です。');
  return v7AdminRpc(name, args);
};
window.gyotokuAdminReloadSnapshot = loadSnapshot;
window.loadSnapshot = loadSnapshot;
function renderAll() { renderSummary(); renderCalendar(); renderMembers(); renderClosed(); fillTimeOptions(); }
function renderSummary() { const today = dateKey(new Date()); const todayReservations = snapshot.reservations.filter(reservation => reservation.date === today).sort((a, b) => a.start_minute - b.start_minute); $('#summary').innerHTML = `<article class='res metric'><p>会員数</p><strong>${snapshot.members.length}</strong></article><article class='res metric'><p>予約数</p><strong>${snapshot.reservations.length}</strong></article><article class='res metric'><p>今日の予約</p><strong>${todayReservations.length}</strong></article>`; $('#todayReservations').innerHTML = todayReservations.length ? todayReservations.map(reservationCard).join('') : '<article class="res"><p>今日の予約はありません。</p></article>'; }
function reservationCard(reservation) { return `<article class='res'><h3>${escapeHtml(fullRange(reservation.date, reservation.start_minute))}</h3><p>${escapeHtml(reservation.member_name)} / ${escapeHtml(planLabel(reservation.plan))} / ${escapeHtml(reservation.people)}</p><div class='two'><button class='ghost' data-detail='${escapeHtml(reservation.member_id)}'>会員を開く</button><button class='danger' data-cancel='${escapeHtml(reservation.id)}'>キャンセル</button></div></article>`; }
function planLabel(value) { return PLAN_OPTIONS.find(plan => plan.value === value)?.label || 'プレミアムプラン'; }
function slotRow(date, startMinute) { const reservation = reservationAt(date, startMinute), closed = closedAt(date, startMinute), external = externalAt(date, startMinute); if (reservation) return `<article class='slot-row reserved'><div class='time'>${slotRange(startMinute)}</div><div><span class='pill reserve'>予約</span> ${escapeHtml(reservation.member_name)} / ${escapeHtml(reservation.people)}</div><button class='danger' data-cancel='${escapeHtml(reservation.id)}'>キャンセル</button></article>`; if (closed) return `<article class='slot-row closed'><div class='time'>${slotRange(startMinute)}</div><div><span class='pill closed'>利用不可</span> ${escapeHtml(closed.reason || '理由なし')}</div><button class='danger' data-open='${escapeHtml(closed.id)}'>解除</button></article>`; if (external) return `<article class='slot-row closed'><div class='time'>${slotRange(startMinute)}</div><div><span class='pill closed'>予約不可</span></div></article>`; return `<article class='slot-row open' data-slot-action='${date}_${startMinute}'><div class='time'>${slotRange(startMinute)}</div><div><span class='pill open'>空き</span> タップして予約登録／利用不可</div><span>操作</span></article>`; }
function renderCalendar() { const start = weekStart(), end = new Date(start); end.setDate(start.getDate() + 6); $('#weekLabel').textContent = `${japaneseDate(dateKey(start))} 〜 ${japaneseDate(dateKey(end))}`; $('#days').innerHTML = Array.from({ length: 7 }, (_, index) => { const date = new Date(start); date.setDate(start.getDate() + index); return `<button class='day ${index === selectedDay ? 'active' : ''}' data-day='${index}'><strong>${date.getMonth() + 1}/${date.getDate()}</strong><span>${'日月火水木金土'[date.getDay()]}</span></button>`; }).join(''); const date = dateKey(selectedDate()); const starts = fixedStarts().filter(minute => !scheduleConflict(date, minute)); $('#calendarList').innerHTML = `${starts.map(minute => slotRow(date, minute)).join('') || '<article class="res"><p>表示できる固定枠はありません。</p></article>'}`; }
function renderMembers() { $('#members').innerHTML = snapshot.members.length ? snapshot.members.map(member => `<article class='res' data-member-card='${escapeHtml(member.id)}'><h3>${escapeHtml(member.name)}</h3><p>${escapeHtml(member.member_code)} / ${escapeHtml(planLabel(member.plan))} / PIN:${escapeHtml(member.pin)}</p><p>${escapeHtml(member.email || 'メール未登録')}</p><div class='two'><button class='ghost' data-detail='${escapeHtml(member.id)}'>会員を開く・編集</button><button class='btn' data-copy-login='${escapeHtml(member.id)}'>LINE文面コピー</button></div></article>`).join('') : '<article class="res"><p>登録済みの会員はいません。</p></article>'; }
function renderClosed() { $('#closed').innerHTML = snapshot.closed_slots.length ? snapshot.closed_slots.map(item => `<article class='res'><h3>${escapeHtml(fullRange(item.date, item.start_minute))}</h3><p>${escapeHtml(item.reason || '理由なし')}</p><button class='danger' data-open='${escapeHtml(item.id)}'>解除</button></article>`).join('') : '<article class="res"><p>利用不可枠はありません。</p></article>'; }
function fillTimeOptions() { const select = $('#addClosed select[name=start]'); if (!select) return; const date = $('#addClosed input[name=date]').value; const options = date ? fixedStarts().filter(minute => availableAdminSlot(date, minute)) : []; select.innerHTML = options.length ? options.map(minute => `<option value='${minute}'>${slotRange(minute)}</option>`).join('') : '<option value="">日付を選択してください</option>'; }
function switchTab(name) { $$('.tab[data-tab]').forEach(button => button.classList.toggle('active', button.dataset.tab === name)); ['dashboard', 'calendar', 'customers', 'requests', 'settings'].forEach(tab => $(`#${tab}Tab`)?.classList.toggle('hidden', tab !== name)); if (name === 'calendar') renderCalendar(); if (name === 'settings') fillTimeOptions(); }
function loginUrl(member) { return `https://kyoheiehime089-cpu.github.io/blossom-yoga-lp/gyotoku-gym24-booking/?${new URLSearchParams({ mid: member.member_code, pin: member.pin })}`; }
function lineMessage(member) { return `行徳ジム24の会員登録が完了しました。\n\n下記URLから予約画面にログインできます。\n\n【会員用URL】\n${loginUrl(member)}\n\n【会員ID】\n${member.member_code}\n\n【ログインPIN】\n${member.pin}\n\n【プラン】\n${planLabel(member.plan)}\n\n無料プランは1回25分・月4回まで、スタンダードプランは1回40分・月6回までです。` }
async function copyText(value) { try { await navigator.clipboard.writeText(value); return true; } catch { window.prompt('下の文面をコピーしてください。', value); return false; } }
function showGeneratedLogin(member) { const message = lineMessage(member); const box = $('#generatedLogin'); box.classList.remove('hidden'); box.innerHTML = `<h3>LINE送信用文面</h3><p>会員ID：<strong>${escapeHtml(member.member_code)}</strong>　PIN：<strong>${escapeHtml(member.pin)}</strong></p><textarea id='generatedLineText' readonly rows='10' style='width:100%;min-height:220px'></textarea><button type='button' class='btn' id='copyGeneratedLine'>LINE文面コピー</button>`; $('#generatedLineText').value = message; $('#copyGeneratedLine').onclick = async () => { await copyText(message); toast('LINE文面をコピーしました。'); }; }
function openDetail(id) { const member = memberById(id); const card = $$('[data-member-card]').find(element => element.dataset.memberCard === id); if (!member || !card) return; $$('[data-member-detail]').forEach(element => element.remove()); const reservations = snapshot.reservations.filter(reservation => reservation.member_id === id); const detail = document.createElement('article'); detail.className = 'res'; detail.dataset.memberDetail = id; detail.innerHTML = `<p class='eyebrow'>会員詳細</p><h2>${escapeHtml(member.name)}</h2><form id='editMember' class='mini' data-edit='${escapeHtml(id)}'><label>会員名<input name='name' value='${escapeHtml(member.name)}' required></label><label>メールアドレス<input name='email' type='email' value='${escapeHtml(member.email || '')}'></label><div class='two'><label>会員ID<input value='${escapeHtml(member.member_code)}' disabled></label><label>PIN<input name='pin' value='${escapeHtml(member.pin)}' required></label></div><label>プラン<select name='plan'>${PLAN_OPTIONS.map(plan => `<option value='${plan.value}' ${member.plan === plan.value ? 'selected' : ''}>${plan.label}</option>`).join('')}</select></label><div class='two'><button class='btn'>会員情報を保存</button><button class='ghost' type='button' data-close-detail>閉じる</button></div></form><div style='margin-top:10px'><button class='btn' data-copy-login='${escapeHtml(id)}'>LINE文面コピー</button></div><h3>この会員の予約</h3><div class='list'>${reservations.length ? reservations.map(reservationCard).join('') : '<article class="res"><p>予約はありません。</p></article>'}</div>`; card.insertAdjacentElement('afterend', detail); }
function openAdminSlot(date, startMinute) { selectedSlot = { date, start: Number(startMinute) }; $('#adminSlotTitle').textContent = fullRange(date, startMinute); $('#slotMemberSelect').innerHTML = snapshot.members.map(member => `<option value='${escapeHtml(member.id)}'>${escapeHtml(member.name)} / ${escapeHtml(planLabel(member.plan))}</option>`).join(''); $('#adminSlotForm').reset(); $('#adminSlotDialog').showModal(); }
async function submitAdminSlot(form) { if (!selectedSlot) return; if (form.get('action') === 'reserve') { const member = snapshot.members.find(item => String(item.id) === String(form.get('memberId'))); const isPaidV7 = member?.membership_cohort === 'paid_v7' || member?.agreement_version === 'agreement-2026-10-13-paid-v7'; const policy = window.gyotokuAdminPolicy; const gates = member?.activation_gates ?? snapshot.booking_policy?.activation_gates; if (isPaidV7 && (!policy?.isV7AdminProxyReady(snapshot) || !policy.canBookMember({ cohort: 'v7', memberStatus: member.status ?? member.member_status, activationGates: gates }))) throw new Error('同意書v7の条件・利用回数・同伴者の安全確認を予約サーバーで確認できないため、代理予約できません。'); await rpc('fs_admin_create_reservation', { p_admin_password: adminPassword, p_member_id: form.get('memberId'), p_date: selectedSlot.date, p_start_minute: selectedSlot.start, p_people: `${Number(form.get('people') || 1)}名`, p_note: form.get('note') || '管理者が代理予約' }); } else await rpc('fs_admin_close_slot', { p_admin_password: adminPassword, p_date: selectedSlot.date, p_start_minute: selectedSlot.start, p_reason: form.get('reason') || '管理者設定' }); $('#adminSlotDialog').close(); await loadSnapshot(); toast('反映しました。'); }
async function openAdmin() { if (window.gyotokuAdminPolicyReady) await window.gyotokuAdminPolicyReady; if (!window.gym24AdminSignIn) throw new Error('管理者ログインを読み込めませんでした。'); await window.gym24AdminSignIn(); adminPassword = null; sessionStorage.removeItem('gyotoku_admin_password'); await loadSnapshot(); $('#loginView').classList.add('hidden'); $('#adminView').classList.remove('hidden'); }
window.gyotokuAdminSecureRpc = async (name, args = {}) => {
  if (!/^(fs_admin_|fs_yoga_)/.test(name)) throw new Error('許可されていない管理操作です。');
  await verifiedV7AdminToken();
  return rpc(name, { ...args, p_admin_password: null });
};
window.addEventListener('gym24-admin-signed-out', () => {
  adminSessionEpoch++;
  adminPassword = null;
  snapshot = { members: [], reservations: [], registered_users: [], closed_slots: [], external_blocks: [] };
  window.gyotokuAdminSnapshot = snapshot;
  for (const selector of ['#members','#todayReservations','#summary','#calendarList','#closed','#generatedLogin','#slotMemberSelect']) $(selector)?.replaceChildren();
  $('#adminSlotDialog')?.close();
});

document.addEventListener('DOMContentLoaded', () => {
  $('#adminOpen').addEventListener('click', () => openAdmin().catch(error => alert(error.message)));
  $('#slotAction').addEventListener('change', event => { const reserve = event.target.value === 'reserve'; $('#reserveFields').classList.toggle('hidden', !reserve); $('#closeFields').classList.toggle('hidden', reserve); });
  $('#adminSlotForm').addEventListener('submit', event => { event.preventDefault(); submitAdminSlot(new FormData(event.currentTarget)).catch(error => alert(error.message)); });
  $('#addClosed input[name=date]').addEventListener('change', fillTimeOptions);
  $('#addClosed').addEventListener('submit', async event => { event.preventDefault(); try { const form = new FormData(event.currentTarget); await rpc('fs_admin_close_slot', { p_admin_password: adminPassword, p_date: form.get('date'), p_start_minute: Number(form.get('start')), p_reason: form.get('reason') || '' }); await loadSnapshot(); toast('この枠を利用不可にしました。'); } catch (error) { alert(error.message); } });
  $('#addMember').addEventListener('submit', async event => { event.preventDefault(); const form = event.currentTarget; const button = form.querySelector('button'); button.disabled = true; try { const data = new FormData(form); const result = await v7AdminRpc('fs_v7_admin_create_member', { p_admin_password: adminPassword, p_name: String(data.get('name') || '').trim(), p_email: String(data.get('email') || '').trim(), p_plan: String(data.get('plan') || '') }); showGeneratedLogin(result.member); form.reset(); await loadSnapshot(); toast('会員を追加しました。'); } catch (error) { alert(error.message); } finally { button.disabled = false; } });
  document.addEventListener('submit', async event => { const form = event.target.closest('#editMember'); if (!form) return; event.preventDefault(); try { const data = new FormData(form); await rpc('fs_admin_update_member', { p_admin_password: adminPassword, p_member_id: form.dataset.edit, p_name: String(data.get('name') || '').trim(), p_email: String(data.get('email') || '').trim(), p_pin: String(data.get('pin') || '').trim(), p_plan: String(data.get('plan') || '') }); await loadSnapshot(); openDetail(form.dataset.edit); toast('会員情報を保存しました。'); } catch (error) { alert(error.message); } });
  document.addEventListener('click', async event => { const tab = event.target.closest('.tab[data-tab]'); if (tab) switchTab(tab.dataset.tab); const day = event.target.closest('[data-day]'); if (day) { selectedDay = Number(day.dataset.day); renderCalendar(); } const open = event.target.closest('[data-slot-action]'); if (open) { const [date, start] = open.dataset.slotAction.split('_'); openAdminSlot(date, Number(start)); } const detail = event.target.closest('[data-detail]'); if (detail) { switchTab('customers'); openDetail(detail.dataset.detail); } if (event.target.closest('[data-close-detail]')) $$('[data-member-detail]').forEach(element => element.remove()); if (event.target.id === 'prevWeek') { week = Math.max(0, week - 1); selectedDay = 0; renderCalendar(); } if (event.target.id === 'thisWeek') { week = 0; selectedDay = 0; renderCalendar(); } if (event.target.id === 'nextWeek') { week = Math.min(1, week + 1); selectedDay = 0; renderCalendar(); } if (event.target.classList.contains('close')) event.target.closest('dialog')?.close(); const cancel = event.target.closest('[data-cancel]'); if (cancel) { const reservation = snapshot.reservations.find(item => String(item.id) === String(cancel.dataset.cancel)); const member = snapshot.members.find(item => String(item.id) === String(reservation?.member_id)); const isPaidV7 = member?.membership_cohort === 'paid_v7' || member?.agreement_version === 'agreement-2026-10-13-paid-v7'; const policy = window.gyotokuAdminPolicy; const gates = member?.activation_gates ?? snapshot.booking_policy?.activation_gates; if (isPaidV7) { if (!policy?.isV7ServerEnforcementReady(snapshot) || !policy.canBookMember({ cohort: 'v7', memberStatus: member.status ?? member.member_status, activationGates: gates })) return alert('同意書v7の条件と有効化状態を予約サーバーで確認できないため、キャンセルできません。'); if (!policy.isV7CancellationOnTime({ membershipCohort: member.membership_cohort, agreementVersion: member.agreement_version, now: new Date(), bookingDate: reservation?.date }) && !confirm('利用日前日の22時を過ぎたキャンセルは、月の利用回数を1回分消化します。キャンセルしますか？')) return; } try { await rpc('fs_admin_cancel_reservation', { p_admin_password: adminPassword, p_reservation_id: cancel.dataset.cancel }); await loadSnapshot(); } catch (error) { alert(error.message); } } const openClosed = event.target.closest('[data-open]'); if (openClosed) { try { await rpc('fs_admin_open_slot', { p_admin_password: adminPassword, p_closed_slot_id: openClosed.dataset.open }); await loadSnapshot(); } catch (error) { alert(error.message); } } const copy = event.target.closest('[data-copy-login]'); if (copy) { const member = memberById(copy.dataset.copyLogin); if (member) { await copyText(lineMessage(member)); toast('LINE文面をコピーしました。'); } } });
  const savedPassword = sessionStorage.getItem('gyotoku_admin_password'); if (savedPassword) { $('#adminPass').value = savedPassword; openAdmin().catch(() => sessionStorage.removeItem('gyotoku_admin_password')); }
});
