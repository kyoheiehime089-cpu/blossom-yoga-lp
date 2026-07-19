// 行徳ジム24専用のプラン表示・予約上限。
// コピー元の旧プラン名やファミリープラン判定を、このアプリ専用仕様へ置き換えます。
(() => {
  const planRules = member => {
    const plan = String(member?.plan || 'free').toLowerCase();
    if (plan === 'standard') {
      return { code: 'standard', label: 'スタンダードプラン', useMinutes: 40, blockMinutes: 50, bookingDays: 14, concurrent: 2, daily: 2, adults: 2 };
    }
    if (plan === 'premium') {
      return { code: 'premium', label: 'プレミアムプラン', useMinutes: 40, blockMinutes: 50, bookingDays: 14, concurrent: 2, daily: 1, adults: 2 };
    }
    return { code: 'free', label: '無料プラン', useMinutes: 25, blockMinutes: 35, bookingDays: 14, concurrent: 1, daily: 1, adults: 1 };
  };

  const rule = () => planRules(snap?.member);
  const useMinutes = () => rule().useMinutes;
  const blockMinutes = () => rule().blockMinutes;
  const planLabel = member => planRules(member).label;

  slotRange = m => `${fmt(m)}〜${fmtEnd(Number(m) + useMinutes())}`;
  full = (d, m) => `${jp(d)} ${slotRange(m)}`;

  conflict = (d, m) => {
    const minutes = blockMinutes();
    m = Number(m);
    return blocks(d).some(([s, e]) => m < e && s < m + minutes);
  };

  booked = (d, m) => {
    const minutes = blockMinutes();
    const list = snap?.booked_slots || [];
    const exact = list.find(x => x.date === d && Number(x.start_minute) === Number(m));
    return exact || list.find(x => absBlocksOverlap(d, m, minutes, x.date, x.start_minute, minutes));
  };

  closed = (d, m) => {
    const minutes = blockMinutes();
    const list = snap?.closed_slots || [];
    const exact = list.find(x => x.date === d && Number(x.start_minute) === Number(m));
    return exact || list.find(x => absBlocksOverlap(d, m, minutes, x.date, x.start_minute, minutes));
  };

  externalBlock = (d, m) => {
    const s = Number(m), e = s + blockMinutes();
    return (snap?.external_blocks || []).find(x => x.date === d && overlapsRange(s, e, x.start_minute, externalBlockEnd(x)));
  };

  isUnlimitedPlan = plan => String(plan || '').toLowerCase() === 'premium';
  isFamilyPlan = () => false;
  hasMonthlyLimit = member => !isUnlimitedPlan(member?.plan);
  canPurchaseExtra = () => false;
  quotaText = member => hasMonthlyLimit(member) ? `${Number(member?.quota || 0)}回まで` : '制限なし';
  monthUsageText = member => hasMonthlyLimit(member) ? `${monthRes().length} / ${Number(member?.quota || 0)}` : `${monthRes().length}回（月回数制限なし）`;

  renderFamilyUsersCard = () => {
    const card = $('#familyUsersCard');
    if (card) card.classList.add('hidden');
  };

  flexibleStarts = () => {
    const a = [], duration = useMinutes();
    for (let m = FLEXIBLE_NIGHT_START_MINUTE; m + duration <= 1440; m += FLEXIBLE_SLOT_STEP_MINUTES) a.push(m);
    for (let m = 0; m + duration <= FLEXIBLE_MORNING_END_MINUTE; m += FLEXIBLE_SLOT_STEP_MINUTES) a.push(m);
    return a;
  };

  available = (d, s) => {
    const r = rule();
    return !conflict(d, s) && !booked(d, s) && !closed(d, s) && !externalBlock(d, s)
      && daysFrom(d) >= 0 && daysFrom(d) < r.bookingDays && canBook(d, s)
      && future().length < r.concurrent && dayRes(d).length < r.daily
      && (!hasMonthlyLimit(snap.member) || monthRes().length < Number(snap.member.quota || 0));
  };

  slot = (d, s) => {
    const r = rule();
    const b = booked(d, s), c = closed(d, s), x = externalBlock(d, s);
    const mineSlot = b?.is_mine && Number(b.start_minute) === Number(s);
    let klass = '', dis = '', st = '空きあり';
    if (mineSlot) { klass = 'mine'; st = '自分の予約'; }
    else if (c || b || x) { klass = 'booked'; dis = 'disabled'; st = '予約不可'; }
    else if (daysFrom(d) < 0 || daysFrom(d) >= r.bookingDays) { klass = 'closed'; dis = 'disabled'; st = '受付終了'; }
    else if (!canBook(d, s)) { klass = 'closed'; dis = 'disabled'; st = '受付終了'; }
    else if (future().length >= r.concurrent) { klass = 'closed'; dis = 'disabled'; st = '同時予約上限'; }
    else if (dayRes(d).length >= r.daily) { klass = 'closed'; dis = 'disabled'; st = '同日上限'; }
    else if (hasMonthlyLimit(snap.member) && monthRes().length >= Number(snap.member.quota || 0)) { klass = 'closed'; dis = 'disabled'; st = '回数上限'; }
    return `<button class='slot ${klass}' ${dis} data-d='${d}' data-s='${s}'><span class='time'>${slotRange(s)}</span><span class='status'>${st}</span></button>`;
  };

  render = () => {
    const m = snap.member, r = planRules(m);
    const buy = document.getElementById('buySlot');
    if (buy) buy.classList.add('hidden');
    $('#loginView').classList.add('hidden');
    $('#appView').classList.remove('hidden');
    $('#memberName').textContent = m.name;
    $('#memberPlan').textContent = r.label;
    $('#memberQuota').textContent = `月の予約回数：${quotaText(m)}`;
    $('#extraSlots').textContent = `${r.useMinutes}分利用`;
    $('#usageText').textContent = monthUsageText(m);
    $('#usageBar').style.width = hasMonthlyLimit(m) ? Math.min(100, Math.round(monthRes().length / Math.max(1, Number(m.quota || 0)) * 100)) + '%' : '100%';
    const rules = document.querySelector('.rules');
    if (rules) rules.innerHTML = `<p><strong>利用時間</strong>：1回${r.useMinutes}分。</p><p><strong>同時予約</strong>：最大${r.concurrent}枠まで。</p><p><strong>同日予約</strong>：最大${r.daily}枠まで。</p><p><strong>予約</strong>：2週間先まで・開始2時間前まで。</p><p><strong>キャンセル</strong>：開始3時間前まで。</p>`;
    renderNext();
    renderFamilyUsersCard();
    renderUsage();
    renderDays();
    renderCalendar();
    renderMine();
  };

  renderNext = () => {
    const r = future()[0];
    $('#nextReservation').innerHTML = r
      ? `<h3>${full(r.date, r.start_minute)}</h3><p>利用人数：${esc(r.people)}</p><p>${useMinutes()}分利用</p>`
      : '<p>現在、予約はありません。</p>';
  };

  renderUsage = () => {
    const duration = useMinutes();
    const done = mine().filter(r => start(r.date, Number(r.start_minute) + duration) <= new Date()).sort(byStartDesc);
    const last = done[0];
    const tm = done.filter(r => String(r.date).slice(0, 7) === ym()).length;
    $('#usageSummary').innerHTML = `<article class='metric'><p>累計利用</p><strong>${done.length}</strong></article><article class='metric'><p>今月利用済み</p><strong>${tm}</strong></article><article class='metric'><p>直近利用</p><strong>${last ? jp(last.date) : '-'}</strong></article>`;
    const ms = [];
    for (let i = 0; i < 6; i++) { const d = new Date(); d.setMonth(d.getMonth() - i); ms.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`); }
    const max = Math.max(1, ...ms.map(m => done.filter(r => String(r.date).slice(0, 7) === m).length));
    $('#usageHistory').innerHTML = ms.map(m => { const c = done.filter(r => String(r.date).slice(0, 7) === m).length; return `<div class='history-row'><span>${m.slice(5)}月</span><div class='history-track'><div class='history-fill' style='width:${Math.round(c / max * 100)}%'></div></div><span>${c}回</span></div>`; }).join('');
  };

  openDialog = (d, s) => {
    selected = { date: d, start: Number(s) };
    $('#dialogTitle').textContent = full(d, s);
    $('#dialogSummary').innerHTML = `<p><strong>会員：</strong>${esc(snap.member.name)}</p><p><strong>プラン：</strong>${esc(planLabel(snap.member))}</p><p><strong>今月の予約：</strong>${monthUsageText(snap.member)}</p>`;
    $('#bookingForm').reset();
    const people = $('[name="people"]');
    const standard = $('#standardPeopleFields');
    const familyFields = $('#familyPeopleFields');
    if (standard) standard.classList.remove('hidden');
    if (familyFields) familyFields.classList.add('hidden');
    if (people) { people.required = true; people.min = '1'; people.max = String(rule().adults); people.value = '1'; }
    $('#dialog').showModal();
  };

  reservationItem = r => {
    const cancelable = canCancel(r), past = start(r.date, Number(r.start_minute) + useMinutes()) <= new Date();
    return `<article class='res'><h3>${full(r.date, r.start_minute)}</h3><p>利用人数：${esc(r.people)}</p>${cancelable ? `<div class='row'><button class='danger' data-cancel='${esc(r.id)}'>キャンセル</button></div>` : `<p class='small'>${past ? '利用済み' : 'キャンセル期限を過ぎています'}</p>`}</article>`;
  };

  renderMine = () => {
    const now = new Date(), duration = useMinutes();
    const upcoming = mine().filter(r => start(r.date, r.start_minute) > now).sort(byStartDesc);
    const past = mine().filter(r => start(r.date, Number(r.start_minute) + duration) <= now).sort(byStartDesc);
    const parts = [];
    if (upcoming.length) parts.push(`<h3>今後の予約</h3>${upcoming.map(reservationItem).join('')}`);
    if (past.length) parts.push(`<h3>利用履歴</h3>${past.map(reservationItem).join('')}`);
    $('#mine').innerHTML = parts.length ? parts.join('') : '<article class="res"><p>現在、予約はありません。</p></article>';
  };
})();
