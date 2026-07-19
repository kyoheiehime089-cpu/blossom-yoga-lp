const gyotokuDb = window.supabase.createClient(window.GYOTOKU_SUPABASE_URL, window.GYOTOKU_SUPABASE_ANON_KEY);

const HOLIDAYS = ['2026-01-01', '2026-01-12', '2026-02-11', '2026-02-23', '2026-03-20', '2026-04-29', '2026-05-03', '2026-05-04', '2026-05-05', '2026-05-06', '2026-07-20', '2026-08-11', '2026-09-21', '2026-09-22', '2026-09-23', '2026-10-12', '2026-11-03', '2026-11-23'];
const PLAN_LABELS = { free: '無料プラン', standard: 'スタンダードプラン', premium: 'プレミアムプラン' };
const DEFAULT_RULES = {
  free: { use_minutes: 25, monthly_quota: 4, adults_allowed: 1, two_adult_cost: 1, concurrent_limit: 1, daily_limit: 1, booking_days: 14, booking_deadline_minutes: 120, cancellation_deadline_minutes: 180, is_configured: true },
  standard: { use_minutes: 40, monthly_quota: 6, adults_allowed: 2, two_adult_cost: 2, concurrent_limit: 1, daily_limit: 1, booking_days: 14, booking_deadline_minutes: 120, cancellation_deadline_minutes: 180, is_configured: true },
  premium: { use_minutes: 0, monthly_quota: null, adults_allowed: 0, two_adult_cost: 0, concurrent_limit: 0, daily_limit: 0, booking_days: 0, booking_deadline_minutes: 0, cancellation_deadline_minutes: 0, is_configured: false }
};
const BLOCK_MINUTES = 50;
const FIXED_SLOT_STEP_MINUTES = 50;
const FLEXIBLE_SLOT_STEP_MINUTES = 10;
const FIXED_SLOT_START_MINUTE = 490;
const FIXED_SLOT_END_MINUTE = 1320;
const FLEXIBLE_NIGHT_START_MINUTE = 1320;
const FLEXIBLE_MORNING_END_MINUTE = 480;

let memberCode = localStorage.getItem('gyotoku_member_code') || '';
let memberPin = localStorage.getItem('gyotoku_member_pin') || '';
let snapshot = null;
let week = 0;
let selectedDay = 0;
let selectedSlot = null;

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const pad = value => String(value).padStart(2, '0');
const dateKey = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const monthKey = () => dateKey(new Date()).slice(0, 7);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
const formatMinute = value => Number(value) === 1440 ? '24:00' : `${pad(Math.floor(Number(value) / 60))}:${pad(Number(value) % 60)}`;
const formatEnd = value => Number(value) === 1440 ? '翌0:00' : formatMinute(value);
const japaneseDate = value => { const date = new Date(`${value}T00:00:00`); return `${date.getMonth() + 1}/${date.getDate()}（${'日月火水木金土'[date.getDay()]}）`; };

function rule() {
  const code = String(snapshot?.member?.plan || 'free').toLowerCase();
  return { ...DEFAULT_RULES[code] || DEFAULT_RULES.premium, ...(snapshot?.plan_settings || {}), plan_code: code, label: PLAN_LABELS[code] || 'プレミアムプラン' };
}
function slotRange(startMinute) { const duration = Number(rule().use_minutes || 0); return `${formatMinute(startMinute)}〜${formatEnd(Number(startMinute) + duration)}`; }
function fullRange(date, startMinute) { return `${japaneseDate(date)} ${slotRange(startMinute)}`; }
function toast(message) { const element = $('#toast'); if (!element) return alert(message); element.textContent = message; element.classList.add('show'); setTimeout(() => element.classList.remove('show'), 2500); }
async function rpc(name, args) { const { data, error } = await gyotokuDb.rpc(name, args); if (error) return { ok: false, error: error.message }; return data || { ok: false, error: '応答がありません。' }; }
function startAt(date, startMinute) { const value = new Date(`${date}T00:00:00`); value.setMinutes(Number(startMinute)); return value; }
function daysFromToday(date) { const target = new Date(`${date}T00:00:00`); const today = new Date(); today.setHours(0, 0, 0, 0); return Math.floor((target - today) / 86400000); }
function canBook(date, startMinute) { return startAt(date, startMinute).getTime() - Date.now() >= Number(rule().booking_deadline_minutes || 120) * 60000; }
function canCancel(reservation) { return startAt(reservation.date, reservation.start_minute).getTime() - Date.now() >= Number(rule().cancellation_deadline_minutes || 180) * 60000; }
function holiday(date) { return HOLIDAYS.includes(date); }
function scheduleBlocks(date) { const day = new Date(`${date}T00:00:00`).getDay(); if (holiday(date)) return [[510, 820]]; if (day === 1) return [[510, 610], [1080, 1330]]; if (day === 2) return [[510, 610], [720, 820], [1080, 1330]]; if (day === 3) return [[1080, 1330]]; if (day === 4) return [[690, 790], [1215, 1315]]; if (day === 5) return [[1080, 1330]]; if (day === 6 || day === 0) return [[460, 820]]; return []; }
function scheduleConflict(date, startMinute) { const start = Number(startMinute); return scheduleBlocks(date).some(([from, to]) => start < to && from < start + BLOCK_MINUTES); }
function overlaps(aStart, aEnd, bStart, bEnd) { return Number(aStart) < Number(bEnd) && Number(bStart) < Number(aEnd); }
function externalBlock(date, startMinute) { const end = Number(startMinute) + BLOCK_MINUTES; return (snapshot?.external_blocks || []).find(block => block.date === date && overlaps(startMinute, end, block.start_minute, Number(block.block_end_minute ?? Number(block.end_minute) + 10))); }
function reservationOverlaps(date, startMinute, minutes = BLOCK_MINUTES, reservation) { const a = startAt(date, startMinute); const b = startAt(reservation.date, reservation.start_minute); return a < new Date(b.getTime() + minutes * 60000) && b < new Date(a.getTime() + minutes * 60000); }
function myReservations() { return [...(snapshot?.reservations || [])].sort((a, b) => startAt(a.date, a.start_minute) - startAt(b.date, b.start_minute)); }
function futureReservations() { return myReservations().filter(reservation => startAt(reservation.date, reservation.start_minute) > new Date()); }
function monthReservations() { return myReservations().filter(reservation => String(reservation.date).slice(0, 7) === monthKey()); }
function dayReservations(date) { return myReservations().filter(reservation => reservation.date === date); }
function peopleCost(reservationOrValue) { return String(reservationOrValue?.people ?? reservationOrValue).trim() === '2名' ? 2 : 1; }
function monthlyUsage() { return monthReservations().reduce((sum, reservation) => sum + peopleCost(reservation), 0); }
function quotaText() { return rule().monthly_quota == null ? '制限なし' : `${snapshot.member.quota}回まで`; }

function flexibleStarts() { const duration = Number(rule().use_minutes || 0); if (!duration) return []; const values = []; for (let minute = FLEXIBLE_NIGHT_START_MINUTE; minute + duration <= 1440; minute += FLEXIBLE_SLOT_STEP_MINUTES) values.push(minute); for (let minute = 0; minute + duration <= FLEXIBLE_MORNING_END_MINUTE; minute += FLEXIBLE_SLOT_STEP_MINUTES) values.push(minute); return values; }
function fixedStarts() { const duration = Number(rule().use_minutes || 0); if (!duration) return []; const values = []; for (let minute = FIXED_SLOT_START_MINUTE; minute < FIXED_SLOT_END_MINUTE; minute += FIXED_SLOT_STEP_MINUTES) values.push(minute); return values; }
function booked(date, startMinute) { const list = snapshot?.booked_slots || []; return list.find(item => item.date === date && Number(item.start_minute) === Number(startMinute)) || list.find(item => reservationOverlaps(date, startMinute, BLOCK_MINUTES, item)); }
function closed(date, startMinute) { const list = snapshot?.closed_slots || []; return list.find(item => item.date === date && Number(item.start_minute) === Number(startMinute)) || list.find(item => reservationOverlaps(date, startMinute, BLOCK_MINUTES, item)); }
function available(date, startMinute) { const r = rule(); return r.is_configured && !scheduleConflict(date, startMinute) && !booked(date, startMinute) && !closed(date, startMinute) && !externalBlock(date, startMinute) && daysFromToday(date) >= 0 && daysFromToday(date) <= Number(r.booking_days) && canBook(date, startMinute) && futureReservations().length < Number(r.concurrent_limit) && dayReservations(date).length < Number(r.daily_limit) && (r.monthly_quota == null || monthlyUsage() < Number(snapshot.member.quota)); }

async function load() {
  if (!memberCode || !memberPin) return renderLogin();
  const result = await rpc('fs_member_snapshot', { p_member_code: memberCode, p_pin: memberPin });
  if (!result.ok) { localStorage.removeItem('gyotoku_member_code'); localStorage.removeItem('gyotoku_member_pin'); memberCode = ''; memberPin = ''; toast(result.error); return renderLogin(); }
  snapshot = result;
  render();
}
function renderLogin() { $('#loginView').classList.remove('hidden'); $('#appView').classList.add('hidden'); }
function render() {
  const member = snapshot.member;
  const r = rule();
  $('#loginView').classList.add('hidden');
  $('#appView').classList.remove('hidden');
  $('#memberName').textContent = member.name;
  $('#memberPlan').textContent = r.label;
  $('#memberQuota').textContent = r.monthly_quota == null ? '月の予約回数：制限なし' : `月の予約回数：${quotaText()}`;
  $('#extraSlots').textContent = r.is_configured ? `${r.use_minutes}分利用` : '利用仕様を確認中';
  $('#usageText').textContent = r.monthly_quota == null ? `${monthlyUsage()}回` : `${monthlyUsage()} / ${member.quota}`;
  $('#usageBar').style.width = r.monthly_quota == null ? '100%' : `${Math.min(100, Math.round(monthlyUsage() / Math.max(1, Number(member.quota)) * 100))}%`;
  const rules = $('.rules');
  if (rules) rules.innerHTML = r.is_configured ? `<p><strong>利用時間</strong>：1回${r.use_minutes}分。</p><p><strong>月の予約</strong>：${r.monthly_quota == null ? '制限なし' : `月${r.monthly_quota}回まで`}。</p><p><strong>同時予約</strong>：${r.concurrent_limit}枠まで。</p><p><strong>同日予約</strong>：${r.daily_limit}枠まで。</p><p><strong>予約</strong>：${r.booking_days}日先まで・開始${Math.round(r.booking_deadline_minutes / 60)}時間前まで。</p><p><strong>キャンセル</strong>：開始${Math.round(r.cancellation_deadline_minutes / 60)}時間前まで。</p>` : '<p><strong>プレミアムプランの利用仕様は未確定です。</strong></p><p>予約開始前に管理者へご確認ください。</p>';
  renderNext(); renderUsage(); renderDays(); renderCalendar(); renderMine();
}
function renderNext() { const reservation = futureReservations()[0]; $('#nextReservation').innerHTML = reservation ? `<h3>${fullRange(reservation.date, reservation.start_minute)}</h3><p>利用人数：${escapeHtml(reservation.people)}</p><p>${rule().use_minutes}分利用</p>` : '<p>現在、予約はありません。</p>'; }
function renderUsage() {
  const duration = Number(rule().use_minutes || 0);
  const completed = myReservations().filter(reservation => startAt(reservation.date, Number(reservation.start_minute) + duration) <= new Date()).sort((a, b) => startAt(b.date, b.start_minute) - startAt(a.date, a.start_minute));
  const currentMonth = completed.filter(reservation => String(reservation.date).slice(0, 7) === monthKey()).length;
  $('#usageSummary').innerHTML = `<article class='metric'><p>累計利用</p><strong>${completed.length}</strong></article><article class='metric'><p>今月利用済み</p><strong>${currentMonth}</strong></article><article class='metric'><p>直近利用</p><strong>${completed[0] ? japaneseDate(completed[0].date) : '-'}</strong></article>`;
  const months = []; for (let i = 0; i < 6; i++) { const date = new Date(); date.setMonth(date.getMonth() - i); months.push(`${date.getFullYear()}-${pad(date.getMonth() + 1)}`); }
  const max = Math.max(1, ...months.map(month => completed.filter(reservation => String(reservation.date).slice(0, 7) === month).length));
  $('#usageHistory').innerHTML = months.map(month => { const count = completed.filter(reservation => String(reservation.date).slice(0, 7) === month).length; return `<div class='history-row'><span>${month.slice(5)}月</span><div class='history-track'><div class='history-fill' style='width:${Math.round(count / max * 100)}%'></div></div><span>${count}回</span></div>`; }).join('');
}
function weekStart() { const date = new Date(); date.setHours(0, 0, 0, 0); date.setDate(date.getDate() + week * 7); return date; }
function selectedDate() { const date = weekStart(); date.setDate(date.getDate() + selectedDay); return date; }
function renderDays() { const start = weekStart(), end = new Date(start); end.setDate(start.getDate() + 6); $('#weekLabel').textContent = `${week ? '次の週' : '今週'}：${japaneseDate(dateKey(start))} 〜 ${japaneseDate(dateKey(end))}`; $('#days').innerHTML = Array.from({ length: 7 }, (_, index) => { const date = new Date(start); date.setDate(start.getDate() + index); const key = dateKey(date); return `<button class='day ${index === selectedDay ? 'active' : ''}' data-day='${index}'><strong>${date.getMonth() + 1}/${date.getDate()}</strong><span>${key === dateKey(new Date()) ? '今日' : holiday(key) ? '祝' : '日月火水木金土'[date.getDay()]}</span></button>`; }).join(''); $('#prevWeek').disabled = week <= 0; $('#nextWeek').disabled = week >= 1; }
function filterHour(minute, filter) { const hour = Math.floor(Number(minute) / 60); return filter === 'all' || (filter === 'morning' && hour >= 5 && hour < 11) || (filter === 'day' && hour >= 11 && hour < 17) || (filter === 'night' && hour >= 17 && hour < 22) || (filter === 'midnight' && (hour >= 22 || hour < 8)); }
function renderCalendar() { const date = dateKey(selectedDate()), filter = $('#timeFilter')?.value || 'all'; const starts = fixedStarts().filter(minute => filterHour(minute, filter) && !scheduleConflict(date, minute)); const flexible = flexibleStarts().filter(minute => filterHour(minute, filter) && available(date, minute)); $('#calendar').innerHTML = `<article class='day-card'><div class='day-head'><h3>${japaneseDate(date)}</h3><span>${holiday(date) || [0, 6].includes(new Date(`${date}T00:00:00`).getDay()) ? '土日祝ルール' : '平日ルール'}</span></div>${filter === 'all' || filter === 'midnight' ? `<section class='flex-reserve'><p class='eyebrow'>深夜・早朝の予約</p><div class='row'><select id='flexStart' ${flexible.length ? '' : 'disabled'}>${flexible.length ? flexible.map(minute => `<option value='${minute}'>${slotRange(minute)}</option>`).join('') : '<option>予約できる時間がありません</option>'}</select><button class='btn' data-flex-book ${flexible.length ? '' : 'disabled'}>この時間で予約する</button></div></section>` : ''}<h4 class='slot-section-title'>8:00以降の固定枠</h4><div class='slots'>${starts.length ? starts.map(minute => slot(date, minute)).join('') : '<p class="small">この時間帯に表示できる固定枠はありません。</p>'}</div></article>`; }
function slot(date, startMinute) { const mine = booked(date, startMinute)?.is_mine && Number(booked(date, startMinute).start_minute) === Number(startMinute); const unavailable = closed(date, startMinute) || booked(date, startMinute) || externalBlock(date, startMinute); let status = '空きあり', className = '', disabled = ''; if (mine) { className = 'mine'; status = '自分の予約'; } else if (unavailable) { className = 'booked'; disabled = 'disabled'; status = '予約不可'; } else if (!rule().is_configured) { className = 'closed'; disabled = 'disabled'; status = '仕様未確定'; } else if (daysFromToday(date) < 0 || daysFromToday(date) > Number(rule().booking_days) || !canBook(date, startMinute)) { className = 'closed'; disabled = 'disabled'; status = '受付終了'; } else if (futureReservations().length >= Number(rule().concurrent_limit)) { className = 'closed'; disabled = 'disabled'; status = '同時予約上限'; } else if (dayReservations(date).length >= Number(rule().daily_limit)) { className = 'closed'; disabled = 'disabled'; status = '同日上限'; } else if (rule().monthly_quota != null && monthlyUsage() >= Number(snapshot.member.quota)) { className = 'closed'; disabled = 'disabled'; status = '回数上限'; } return `<button class='slot ${className}' ${disabled} data-date='${date}' data-start='${startMinute}'><span class='time'>${slotRange(startMinute)}</span><span class='status'>${status}</span></button>`; }
function openDialog(date, startMinute) { const r = rule(); if (!r.is_configured) return toast('プレミアムプランの利用仕様が未確定です。'); selectedSlot = { date, start: Number(startMinute) }; $('#dialogTitle').textContent = fullRange(date, startMinute); $('#dialogSummary').innerHTML = `<p><strong>会員：</strong>${escapeHtml(snapshot.member.name)}</p><p><strong>プラン：</strong>${escapeHtml(r.label)}</p><p><strong>今月の予約：</strong>${r.monthly_quota == null ? `${monthlyUsage()}回` : `${monthlyUsage()} / ${snapshot.member.quota}`}</p>`; $('#bookingForm').reset(); const input = $('[name="people"]'); input.max = String(r.adults_allowed); input.value = '1'; input.disabled = r.adults_allowed < 1; if (r.monthly_quota != null && Number(snapshot.member.quota) - monthlyUsage() < 2) input.max = '1'; $('#dialog').showModal(); }
function reservationItem(reservation) { const duration = Number(rule().use_minutes || 0); const past = startAt(reservation.date, Number(reservation.start_minute) + duration) <= new Date(); return `<article class='res'><h3>${fullRange(reservation.date, reservation.start_minute)}</h3><p>利用人数：${escapeHtml(reservation.people)}</p>${canCancel(reservation) ? `<div class='row'><button class='danger' data-cancel='${escapeHtml(reservation.id)}'>キャンセル</button></div>` : `<p class='small'>${past ? '利用済み' : 'キャンセル期限を過ぎています'}</p>`}</article>`; }
function renderMine() { const now = new Date(), duration = Number(rule().use_minutes || 0), upcoming = myReservations().filter(reservation => startAt(reservation.date, reservation.start_minute) > now).sort((a, b) => startAt(b.date, b.start_minute) - startAt(a.date, a.start_minute)), past = myReservations().filter(reservation => startAt(reservation.date, Number(reservation.start_minute) + duration) <= now).sort((a, b) => startAt(b.date, b.start_minute) - startAt(a.date, a.start_minute)); const parts = []; if (upcoming.length) parts.push(`<h3>今後の予約</h3>${upcoming.map(reservationItem).join('')}`); if (past.length) parts.push(`<h3>利用履歴</h3>${past.map(reservationItem).join('')}`); $('#mine').innerHTML = parts.length ? parts.join('') : '<article class="res"><p>現在、予約はありません。</p></article>'; }

document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(location.search);
  if (params.get('mid') && params.get('pin')) { memberCode = params.get('mid'); memberPin = params.get('pin'); localStorage.setItem('gyotoku_member_code', memberCode); localStorage.setItem('gyotoku_member_pin', memberPin); history.replaceState(null, '', location.pathname); }
  $('#loginForm').addEventListener('submit', async event => { event.preventDefault(); memberCode = $('#memberId').value.trim(); memberPin = $('#pin').value.trim(); localStorage.setItem('gyotoku_member_code', memberCode); localStorage.setItem('gyotoku_member_pin', memberPin); await load(); });
  $('#bookingForm').addEventListener('submit', async event => { event.preventDefault(); if (!selectedSlot) return; const form = new FormData(event.currentTarget); const people = Number(form.get('people') || 1); const r = rule(); if (!Number.isInteger(people) || people < 1 || people > Number(r.adults_allowed)) return toast('このプランで選べる利用人数を確認してください。'); if (r.monthly_quota != null && monthlyUsage() + (people === 2 ? 2 : 1) > Number(snapshot.member.quota)) return toast('今月の予約回数が不足しています。'); const result = await rpc('fs_member_create_reservation', { p_member_code: memberCode, p_pin: memberPin, p_date: selectedSlot.date, p_start_minute: selectedSlot.start, p_people: `${people}名`, p_note: form.get('note') || '' }); if (!result.ok) return toast(result.error || '予約に失敗しました。'); $('#dialog').close(); await load(); toast('予約が完了しました。'); });
  document.addEventListener('click', async event => { const tab = event.target.closest('.tab[data-tab]'); if (tab) { $$('.tab[data-tab]').forEach(button => button.classList.toggle('active', button.dataset.tab === tab.dataset.tab)); $('#bookingTab').classList.toggle('hidden', tab.dataset.tab !== 'booking'); $('#mineTab').classList.toggle('hidden', tab.dataset.tab !== 'mine'); }
    const day = event.target.closest('[data-day]'); if (day) { selectedDay = Number(day.dataset.day); renderDays(); renderCalendar(); }
    const flexible = event.target.closest('[data-flex-book]'); if (flexible && !flexible.disabled) { const select = $('#flexStart'); if (select?.value) openDialog(dateKey(selectedDate()), Number(select.value)); }
    const slotButton = event.target.closest('.slot'); if (slotButton && !slotButton.disabled) openDialog(slotButton.dataset.date, Number(slotButton.dataset.start));
    const cancel = event.target.closest('[data-cancel]'); if (cancel) { const result = await rpc('fs_member_cancel_reservation', { p_member_code: memberCode, p_pin: memberPin, p_reservation_id: cancel.dataset.cancel }); if (!result.ok) return toast(result.error); await load(); toast('キャンセルしました。'); }
    if (event.target.id === 'logout') { localStorage.removeItem('gyotoku_member_code'); localStorage.removeItem('gyotoku_member_pin'); memberCode = ''; memberPin = ''; renderLogin(); }
    if (event.target.id === 'prevWeek' && !event.target.disabled) { week = 0; selectedDay = 0; renderDays(); renderCalendar(); }
    if (event.target.id === 'thisWeek') { week = 0; selectedDay = 0; renderDays(); renderCalendar(); }
    if (event.target.id === 'nextWeek' && !event.target.disabled) { week = 1; selectedDay = 0; renderDays(); renderCalendar(); }
    if (event.target.classList.contains('close')) event.target.closest('dialog')?.close();
  });
  $('#timeFilter')?.addEventListener('change', renderCalendar);
  load().catch(error => { console.error(error); toast('予約画面を読み込めませんでした。'); });
});

window.gyotokuMemberLoad = load;
