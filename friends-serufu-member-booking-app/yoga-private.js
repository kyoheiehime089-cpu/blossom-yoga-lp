const yogaDb = window.supabase.createClient(window.FRIENDS_SUPABASE_URL, window.FRIENDS_SUPABASE_ANON_KEY);
let yogaPass = sessionStorage.getItem('fs_yoga_private_pass') || '';
let yogaSnap = {external_blocks: []};
const $ = q => document.querySelector(q);
const pad = n => String(n).padStart(2, '0');
const dk = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const fmtMin = m => {m = Number(m); return m === 1440 ? '24:00' : pad(Math.floor(m / 60)) + ':' + pad(m % 60);};
const jp = s => {const d = new Date(s + 'T00:00:00'); return `${d.getMonth() + 1}/${d.getDate()}（${'日月火水木金土'[d.getDay()]}）`;};
const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'}[m]));
function toast(msg){const el = $('#toast'); el.textContent = msg; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 2500);}
async function rpc(name, args){const {data, error} = await yogaDb.rpc(name, args); if(error) throw new Error(error.message); if(!data?.ok) throw new Error(data?.error || 'RPC失敗'); return data;}
function timeToMinute(value){const [h, m] = String(value || '').split(':').map(Number); if(!Number.isFinite(h) || !Number.isFinite(m)) return NaN; return h * 60 + m;}
function validTenMinute(minute){return Number.isInteger(minute) && minute >= 0 && minute <= 1440 && minute % 10 === 0;}
function validateTimes(start, end){return validTenMinute(start) && validTenMinute(end) && start < end && start <= 1430 && end >= 10 && end <= 1440;}
function rangeText(block){return `${jp(block.date)} ${fmtMin(block.start_minute)}〜${fmtMin(block.end_minute)}`;}
function renderList(){const list = [...(yogaSnap.external_blocks || [])].sort((a,b) => (String(a.date) + String(a.start_minute).padStart(4,'0')).localeCompare(String(b.date) + String(b.start_minute).padStart(4,'0'))); $('#yogaList').innerHTML = list.length ? list.map(b => `<article class='res yoga-private'><h3>ヨガ個別予約：${esc(b.member_name)}</h3><p>${esc(rangeText(b))}</p><p>インストラクター：${esc(b.instructor_name || '未入力')}</p><p>メモ：${esc(b.note || 'なし')}</p><button class='danger' data-yoga-delete='${esc(b.id)}'>削除</button></article>`).join('') : '<article class="res"><p>登録済みのヨガ個別予約はありません。</p></article>';}
async function loadYoga(){yogaSnap = await rpc('fs_yoga_private_snapshot', {p_admin_password: yogaPass}); renderList();}
async function openYoga(){const input = $('#yogaPass').value || yogaPass; yogaPass = input; await loadYoga(); sessionStorage.setItem('fs_yoga_private_pass', yogaPass); $('#loginView').classList.add('hidden'); $('#yogaView').classList.remove('hidden'); const date = $('#yogaForm input[name=date]'); if(date && !date.value) date.value = dk(new Date());}
function setDefaultEnd(){const form = $('#yogaForm'); const start = timeToMinute(form.start.value); if(!validTenMinute(start)) return; const end = Math.min(1440, start + 40); form.end.value = fmtMin(end);}
$('#yogaOpen').addEventListener('click', () => openYoga().catch(err => alert(err.message)));
$('#reloadYoga').addEventListener('click', () => loadYoga().then(() => toast('再読み込みしました')).catch(err => alert(err.message)));
$('#logoutYoga').addEventListener('click', () => {sessionStorage.removeItem('fs_yoga_private_pass'); yogaPass = ''; $('#yogaPass').value = ''; $('#loginView').classList.remove('hidden'); $('#yogaView').classList.add('hidden');});
$('#yogaForm input[name=start]').addEventListener('change', setDefaultEnd);
$('#yogaForm').addEventListener('submit', e => {e.preventDefault(); const fd = new FormData(e.currentTarget); const start = timeToMinute(fd.get('start')); const end = timeToMinute(fd.get('end')); if(!validateTimes(start, end)){alert('開始・終了時間は10分単位で、終了を開始より後にしてください。'); return;} rpc('fs_yoga_private_create', {p_admin_password: yogaPass, p_date: fd.get('date'), p_start_minute: start, p_end_minute: end, p_member_name: String(fd.get('memberName') || '').trim(), p_instructor_name: String(fd.get('instructorName') || '').trim(), p_note: String(fd.get('note') || '').trim()}).then(() => loadYoga()).then(() => {e.currentTarget.reset(); e.currentTarget.date.value = dk(new Date()); toast('ヨガ個別予約を登録しました');}).catch(err => alert(err.message));});
document.addEventListener('click', e => {const btn = e.target.closest('[data-yoga-delete]'); if(!btn) return; if(!confirm('このヨガ個別予約を削除しますか？')) return; rpc('fs_yoga_private_delete', {p_admin_password: yogaPass, p_external_block_id: btn.dataset.yogaDelete}).then(() => loadYoga()).then(() => toast('ヨガ個別予約を削除しました')).catch(err => alert(err.message));});
window.addEventListener('DOMContentLoaded', () => {$('#yogaPass').value = yogaPass; if(yogaPass) openYoga().catch(() => {}); const date = $('#yogaForm input[name=date]'); if(date) date.value = dk(new Date());});
