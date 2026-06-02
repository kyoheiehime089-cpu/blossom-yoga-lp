(function(){
  'use strict';

  const $ = (q, root = document) => root.querySelector(q);
  const pad = (n) => String(n).padStart(2, '0');
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
  const USE_MINUTES = 50;
  const fmt = (minute) => {
    minute = Number(minute);
    const prefix = minute >= 1440 ? '翌' : '';
    minute = ((minute % 1440) + 1440) % 1440;
    return `${prefix}${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`;
  };
  const dateKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const jp = (key) => { const d = new Date(`${key}T00:00:00`); return `${d.getMonth() + 1}/${d.getDate()}（${'日月火水木金土'[d.getDay()]}）`; };
  const startDate = (key, minute) => { const d = new Date(`${key}T00:00:00`); d.setMinutes(Number(minute)); return d; };

  function ensureMount(){
    let mount = $('#recommendedSlotsCard');
    if(mount) return mount;
    const next = $('#nextReservation')?.closest('.card');
    const html = '<section id="recommendedSlotsCard" class="card fs-recommended-card"><p class="eyebrow">おすすめ予約枠</p><div id="recommendedSlotsContent" class="res"><p>空き枠を確認中...</p></div></section>';
    if(next) next.insertAdjacentHTML('afterend', html);
    else $('.dashboard')?.insertAdjacentHTML('beforeend', html);
    return $('#recommendedSlotsCard');
  }

  function timeBand(minute){
    const hour = Math.floor(Number(minute) / 60);
    if(hour >= 5 && hour < 11) return 'morning';
    if(hour >= 11 && hour < 17) return 'day';
    if(hour >= 17 && hour < 23) return 'night';
    return 'midnight';
  }

  function ownReservations(){
    return Array.isArray(snap?.reservations) ? snap.reservations : [];
  }

  function futureReservations(){
    const now = new Date();
    return ownReservations().filter((r) => startDate(r.date, r.start_minute) > now);
  }

  function monthReservations(){
    const ym = dateKey(new Date()).slice(0, 7);
    return ownReservations().filter((r) => String(r.date).slice(0, 7) === ym);
  }

  function byDay(date){
    return ownReservations().filter((r) => r.date === date);
  }

  function allStarts(date){
    if(typeof starts === 'function') return starts(date);
    const list = [];
    for(let m = 490; m < 1440; m += 50) list.push(m);
    for(let m = 440; m >= 0; m -= 50) list.unshift(m);
    return list.filter((m) => m + 50 <= 1440);
  }

  function isActuallyBookable(date, minute){
    // 予約済み(booked_slots)・closed_slots・営業時間外・受付終了・上限超過を既存カレンダーと同条件で除外する。
    const bookedSlot = typeof booked === 'function' ? booked(date, minute) : (snap?.booked_slots || []).find((x) => x.date === date && Number(x.start_minute) === Number(minute));
    const closedSlot = typeof closed === 'function' ? closed(date, minute) : (snap?.closed_slots || []).find((x) => x.date === date && Number(x.start_minute) === Number(minute));
    if(bookedSlot || closedSlot) return false;
    if(typeof conflict === 'function' && conflict(date, minute)) return false;
    const days = typeof daysFrom === 'function' ? daysFrom(date) : Math.floor((new Date(`${date}T00:00:00`) - new Date(new Date().setHours(0,0,0,0))) / 86400000);
    if(days < 0 || days >= 14) return false;
    if(typeof canBook === 'function' ? !canBook(date, minute) : startDate(date, minute) - new Date() < 3600000) return false;
    if(futureReservations().length >= 2) return false;
    if(byDay(date).length >= 2) return false;
    if(monthReservations().length >= Number(snap?.member?.quota || 0)) return false;
    return true;
  }

  function historyProfile(){
    const history = ownReservations().filter((r) => startDate(r.date, r.start_minute) < new Date()).sort((a, b) => startDate(a.date, a.start_minute) - startDate(b.date, b.start_minute));
    const weekdays = new Map();
    const bands = new Map();
    history.forEach((r) => {
      const weekday = new Date(`${r.date}T00:00:00`).getDay();
      const band = timeBand(r.start_minute);
      weekdays.set(weekday, (weekdays.get(weekday) || 0) + 1);
      bands.set(band, (bands.get(band) || 0) + 1);
    });
    const maxWeekday = Math.max(0, ...weekdays.values());
    const maxBand = Math.max(0, ...bands.values());
    return { history, weekdays, bands, maxWeekday, maxBand, latest: history[history.length - 1] || null };
  }

  function scoreSlot(date, minute, profile){
    let score = 0;
    const weekday = new Date(`${date}T00:00:00`).getDay();
    const band = timeBand(minute);
    if((profile.weekdays.get(weekday) || 0) === profile.maxWeekday && profile.maxWeekday > 0) score += 3;
    if((profile.bands.get(band) || 0) === profile.maxBand && profile.maxBand > 0) score += 3;
    if(profile.latest){
      const latestWeekday = new Date(`${profile.latest.date}T00:00:00`).getDay();
      if(weekday === latestWeekday) score += 2;
      if(Math.abs(Number(minute) - Number(profile.latest.start_minute)) <= 100 || band === timeBand(profile.latest.start_minute)) score += 2;
    }
    const days = typeof daysFrom === 'function' ? daysFrom(date) : 13;
    if(days <= 3) score += 1;
    return score;
  }

  function candidates(){
    if(!snap?.member) return [];
    if(futureReservations().length >= 2 || monthReservations().length >= Number(snap.member.quota || 0)) return [];
    const profile = historyProfile();
    const today = new Date();
    today.setHours(0,0,0,0);
    const list = [];
    for(let offset = 0; offset < 14; offset += 1){
      const date = new Date(today);
      date.setDate(today.getDate() + offset);
      const key = dateKey(date);
      allStarts(key).forEach((minute) => {
        if(isActuallyBookable(key, minute)){
          list.push({ date:key, start_minute:minute, score:scoreSlot(key, minute, profile), offset });
        }
      });
    }
    return list.sort((a, b) => {
      if(profile.history.length < 3) return a.offset - b.offset || a.start_minute - b.start_minute;
      return b.score - a.score || a.offset - b.offset || a.start_minute - b.start_minute;
    }).slice(0, 3);
  }

  function remainingText(){
    const quota = Number(snap?.member?.quota || 0);
    const remain = Math.max(0, quota - monthReservations().length);
    return remain > 0 ? `<p>今月あと${remain}回予約できます。</p>` : '<p>今月の予約回数上限に達しています。</p>';
  }

  function renderRecommendedSlots(){
    const mount = ensureMount();
    const content = mount.querySelector('#recommendedSlotsContent');
    if(!snap?.member || $('#appView')?.classList.contains('hidden')) return;
    const next = futureReservations().sort((a, b) => startDate(a.date, a.start_minute) - startDate(b.date, b.start_minute))[0];
    const list = candidates();
    content.innerHTML = `
      ${next ? '<p>予約しやすい候補を表示しています。</p>' : '<p>次回予約はまだありません。<br>予約しやすい候補を表示しています。</p>'}
      ${remainingText()}
      ${list.length ? `<h3>あなたにおすすめの空き枠</h3><div class="recommended-slot-list">${list.map((slot, index) => `<article class="res recommended-slot"><h3>${index + 1}. ${jp(slot.date)} ${fmt(slot.start_minute)}〜${fmt(Number(slot.start_minute) + USE_MINUTES)}</h3><p class="small">スコア：${slot.score} / 実際に予約可能な空き枠のみ表示</p><button class="ghost" data-recommended-date="${esc(slot.date)}" data-recommended-start="${esc(slot.start_minute)}">この枠を見る</button></article>`).join('')}</div>` : '<p class="notice">現在おすすめできる空き枠はありません。カレンダーから空き枠をご確認ください。</p>'}
    `;
  }

  function focusSlot(date, minute){
    const target = startDate(date, minute);
    const now = new Date();
    const diff = Math.floor((target.setHours(0,0,0,0) - new Date(now.setHours(0,0,0,0))) / 86400000);
    if(typeof week !== 'undefined') week = diff >= 7 ? 1 : 0;
    if(typeof day !== 'undefined') day = Math.max(0, Math.min(6, diff - (week * 7)));
    if(typeof window.fsSelectOvernightStart === 'function') window.fsSelectOvernightStart(date, minute);
    document.querySelectorAll('.tab[data-tab]').forEach((button) => button.classList.toggle('active', button.dataset.tab === 'booking'));
    $('#bookingTab')?.classList.remove('hidden');
    $('#mineTab')?.classList.add('hidden');
    if(typeof renderDays === 'function') renderDays();
    if(typeof renderCalendar === 'function') renderCalendar();
    setTimeout(() => {
      const slotButton = document.querySelector(`.slot[data-d="${CSS.escape(date)}"][data-s="${CSS.escape(String(minute))}"]`);
      slotButton?.scrollIntoView({ behavior:'smooth', block:'center' });
      slotButton?.classList.add('recommended-focus');
      setTimeout(() => slotButton?.classList.remove('recommended-focus'), 2200);
    }, 50);
  }

  function installStyles(){
    if($('#recommendedSlotsStyles')) return;
    document.head.insertAdjacentHTML('beforeend', '<style id="recommendedSlotsStyles">.fs-recommended-card{display:grid;gap:8px}.recommended-slot-list{display:grid;gap:10px}.recommended-slot{background:#fffaf2}.recommended-focus{outline:4px solid #f1b94b!important;box-shadow:0 0 0 6px rgba(241,185,75,.25)}</style>');
  }

  function hookLoad(){
    const originalLoad = window.load;
    if(typeof originalLoad === 'function' && !originalLoad.fsRecommendedWrapped){
      const wrapped = async function(){
        const result = await originalLoad.apply(this, arguments);
        setTimeout(renderRecommendedSlots, 0);
        return result;
      };
      wrapped.fsRecommendedWrapped = true;
      window.load = wrapped;
      window.loadSnapshot = wrapped;
    }
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-recommended-date]');
    if(!button) return;
    focusSlot(button.dataset.recommendedDate, Number(button.dataset.recommendedStart));
  });

  document.addEventListener('DOMContentLoaded', () => {
    installStyles();
    ensureMount();
    hookLoad();
    setTimeout(renderRecommendedSlots, 350);
  });

  window.fsRenderRecommendedSlots = renderRecommendedSlots;
})();
