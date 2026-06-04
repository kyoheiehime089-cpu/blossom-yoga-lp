const fs = require('fs');
const path = require('path');
const assert = require('assert');

const appDir = __dirname;
const useMinutes = 40;
const blockMinutes = 50;
const fixedSlotStepMinutes = 50;
const flexibleSlotStepMinutes = 10;
const fixedSlotStartMinute = 490;
const fixedSlotEndMinute = 1320;
const flexibleNightStartMinute = 1320;
const flexibleMorningEndMinute = 480;
const files = ['fs-member-supabase.js', 'member-script.js'];
const slotFiles = [...files, 'admin-script.js', 'admin-bulk-close.js'];
const displayFiles = [...files, 'member-calendar-cancel.js', 'admin-cancel-confirm.js', 'admin-script.js'];
const htmlVersions = {
  'index.html': ['member-style.css', 'supabase-config.js', 'fs-member-supabase.js', 'member-calendar-cancel.js', 'member-main-tabs.js', 'member-daily-check.js'],
  'admin.html': ['admin-style.css', 'supabase-config.js', 'admin-script.js', 'admin-cancel-confirm.js', 'admin-safety-actions.js', 'admin-feedback.js', 'admin-bulk-close.js', 'admin-override-v19.js', 'admin-daily-check.js'],
  'yoga-private.html': ['admin-style.css', 'supabase-config.js', 'yoga-private.js'],
};
const fixedLabels = [
  '08:10〜08:50',
  '09:00〜09:40',
  '09:50〜10:30',
  '10:40〜11:20',
  '11:30〜12:10',
  '12:20〜13:00',
];
const flexibleLabels = [
  '22:00〜22:40',
  '22:10〜22:50',
  '22:20〜23:00',
  '23:20〜24:00',
  '00:00〜00:40',
  '00:10〜00:50',
  '07:00〜07:40',
  '07:10〜07:50',
  '07:20〜08:00',
];
const forbiddenPairs = [
  [490, 540],
  [540, 590],
  [590, 640],
  [640, 690],
  [1330, 1380],
  [1340, 1390],
  [440, 490],
];

function fmt(m) {
  return m === 1440 ? '24:00' : String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
}

function flexibleStarts() {
  const starts = [];
  for (let m = flexibleNightStartMinute; m + useMinutes <= 1440; m += flexibleSlotStepMinutes) starts.push(m);
  for (let m = 0; m + useMinutes <= flexibleMorningEndMinute; m += flexibleSlotStepMinutes) starts.push(m);
  return starts;
}

function fixedStarts() {
  const starts = [];
  for (let m = fixedSlotStartMinute; m < fixedSlotEndMinute; m += fixedSlotStepMinutes) starts.push(m);
  return starts;
}

function label(m) {
  return `${fmt(m)}〜${fmt(m + useMinutes)}`;
}

const fixedGeneratedLabels = fixedStarts().slice(0, fixedLabels.length).map(label);
const flexibleGeneratedLabels = flexibleStarts().filter((m) => flexibleLabels.includes(label(m))).map(label);
assert.deepStrictEqual(fixedGeneratedLabels, fixedLabels);
assert.deepStrictEqual(flexibleGeneratedLabels, flexibleLabels);
for (const [start, end] of forbiddenPairs) {
  const forbidden = `${fmt(start)}〜${fmt(end)}`;
  assert(!fixedStarts().concat(flexibleStarts()).map(label).includes(forbidden), `${forbidden} must not be generated`);
}
assert.strictEqual(flexibleStarts().at(-1), 440, 'last early-morning flexible start must be 07:20');
assert.strictEqual(label(flexibleStarts().at(-1)), '07:20〜08:00');
assert(!fixedStarts().some((m) => m >= flexibleNightStartMinute), '22:00 and later must not render as fixed cards');

function usageMonths(now = new Date()) {
  const months = [];
  for (let i = 0; i < 6; i += 1) {
    const d = new Date(now);
    d.setMonth(d.getMonth() - i);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return months;
}
const usageMonthLabels = usageMonths(new Date('2026-06-15T00:00:00'));
assert.deepStrictEqual(usageMonthLabels, ['2026-06', '2026-05', '2026-04', '2026-03', '2026-02', '2026-01']);

function sameBlock(a, b) {
  return a < b + blockMinutes && b < a + blockMinutes;
}
assert(sameBlock(10, 0), '00:10 must overlap a 00:00 reservation block');
assert(sameBlock(40, 0), '00:40 must overlap a 00:00 reservation block because changeover is blocked');
assert(!sameBlock(50, 0), '00:50 must not overlap a 00:00 reservation block');

for (const file of slotFiles) {
  const source = fs.readFileSync(path.join(appDir, file), 'utf8');
  assert(source.includes('USE_MINUTES=40'), `${file} must define 40-minute displayed use time`);
  assert(source.includes('FIXED_SLOT_STEP_MINUTES=50'), `${file} must keep 50-minute fixed start cadence`);
  assert(source.includes('FLEXIBLE_SLOT_STEP_MINUTES=10'), `${file} must keep 10-minute flexible midnight/early starts`);
  assert(source.includes('BLOCK_MINUTES=50'), `${file} must reserve 10-minute changeover in conflict checks`);
  if (files.includes(file)) assert(source.includes('for(let i=0;i<6;i++)'), `${file} must render usage month history newest first`);
  assert(!/const\s+SLOT_STEP_MINUTES\s*=\s*50/.test(source), `${file} must not use a single all-day slot cadence`);
  assert(!source.includes('50分枠'), `${file} must not label slots as 50-minute use slots`);
}

const visibleFiftyMinuteEnd = new RegExp(`(fmt|fmtMin|minText)\\([^)]*\\+\\s*${blockMinutes}\\)`);
const numericFiftyMinuteEnd = new RegExp(`Number\\([^)]*\\)\\s*\\+\\s*${blockMinutes}`);
for (const file of displayFiles) {
  const source = fs.readFileSync(path.join(appDir, file), 'utf8');
  assert(!visibleFiftyMinuteEnd.test(source), `${file} must not render a visible end time with the block length`);
  assert(!numericFiftyMinuteEnd.test(source), `${file} must not build a visible end time with the block length`);
}

const memberSupabaseSource = fs.readFileSync(path.join(appDir, 'fs-member-supabase.js'), 'utf8');
const adminSource = fs.readFileSync(path.join(appDir, 'admin-script.js'), 'utf8');
const yogaPrivateSource = fs.readFileSync(path.join(appDir, 'yoga-private.js'), 'utf8');
assert(memberSupabaseSource.includes('renderFlexible'), 'member UI must render midnight/early-morning slots as a separate flexible section');
assert(memberSupabaseSource.includes("<select id='flexStart'"), 'member flexible starts must be presented in a dropdown');
assert(memberSupabaseSource.includes('data-flex-book'), 'member flexible starts must reserve through the selected dropdown value');
assert(memberSupabaseSource.includes('fixedStarts().filter'), 'member fixed slots must render separately from flexible starts');
assert(adminSource.includes('renderAdminFlexible'), 'admin UI must render midnight/early-morning slots as a separate flexible section');
assert(adminSource.includes("<select id='adminFlexStart'"), 'admin flexible starts must be presented in a dropdown');
assert(adminSource.includes('data-admin-flex-action'), 'admin flexible starts must act through the selected dropdown value');
assert(adminSource.includes('fixedStartArr().filter'), 'admin fixed slots must render separately from flexible starts');
const yogaPrivateHtml = fs.readFileSync(path.join(appDir, 'yoga-private.html'), 'utf8');
assert(yogaPrivateHtml.includes('<select id="yogaStart"'), 'yoga private start time must be a 10-minute select');
assert(yogaPrivateHtml.includes('<select id="yogaEnd"'), 'yoga private end time must be a 10-minute select');
assert(!yogaPrivateHtml.includes('type="time"'), 'yoga private page must not use native time inputs');
assert(!yogaPrivateHtml.includes('step="600"'), 'yoga private page must not rely on native time step');
assert(yogaPrivateSource.includes('timeOptions(0, 1430)'), 'yoga private start select must cover 00:00〜23:50 in 10-minute increments');
assert(yogaPrivateSource.includes('timeOptions(minEnd, 1440)'), 'yoga private end select must cover later 10-minute choices through 24:00');
assert(!yogaPrivateSource.includes('currentTarget.reset'), 'yoga private submit must not call e.currentTarget.reset() after async work');
assert(yogaPrivateSource.includes('const form = e.currentTarget') && yogaPrivateSource.includes('form.reset()'), 'yoga private submit must store the form before await and reset that form safely');
assert(!/name="memberName"[^>]*required/.test(yogaPrivateHtml), 'member name must be optional on yoga private form');
assert(!/name="instructorName"[^>]*required/.test(yogaPrivateHtml), 'instructor name must be optional on yoga private form');
assert(!/name="note"[^>]*required/.test(yogaPrivateHtml), 'note must be optional on yoga private form');

for (const [htmlFile, assets] of Object.entries(htmlVersions)) {
  const html = fs.readFileSync(path.join(appDir, htmlFile), 'utf8');
  assert(!html.includes('v=32'), `${htmlFile} must not load v32 assets`);
  assert(!html.includes('v=34'), `${htmlFile} must not load v34 assets`);
  assert(!html.includes('v=35'), `${htmlFile} must not load v35 assets`);
  for (const asset of assets) assert(html.includes(`${asset}?v=36`), `${htmlFile} must load ${asset} with v36`);
}



function overlapsRange(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}
function selfBlockedByYoga(selfStart, yogaStart, yogaEnd) {
  return overlapsRange(selfStart, selfStart + blockMinutes, yogaStart, yogaEnd);
}
function yogaPrivateTimeValid(startMinute, endMinute) {
  return Number.isInteger(startMinute) && Number.isInteger(endMinute)
    && startMinute >= 0 && startMinute <= 1430
    && endMinute >= 10 && endMinute <= 1440
    && endMinute > startMinute
    && startMinute % 10 === 0 && endMinute % 10 === 0;
}
function yogaPrivateCreatable(block, {reservations = [], closedSlots = [], externalBlocks = [], fixedBlocks = []} = {}) {
  if (!yogaPrivateTimeValid(block.start, block.end)) return false;
  if (fixedBlocks.some(([s, e]) => overlapsRange(block.start, block.end, s, e))) return false;
  if (reservations.some((r) => overlapsRange(block.start, block.end, r.start, r.start + blockMinutes))) return false;
  if (closedSlots.some((c) => overlapsRange(block.start, block.end, c.start, c.start + blockMinutes))) return false;
  if (externalBlocks.some((x) => overlapsRange(block.start, block.end, x.start, x.end))) return false;
  return true;
}

assert.strictEqual(selfBlockedByYoga(840, 840, 880), true, 'ヨガ個別予約 14:00〜14:40 がある場合、セルフ枠 14:00〜14:40 は予約不可');
assert.strictEqual(selfBlockedByYoga(800, 840, 880), true, 'セルフ枠 13:20〜14:00 は内部50分ブロックがヨガ個別予約 14:00〜14:40 と重なるため予約不可');
assert.strictEqual(yogaPrivateCreatable({start: 1370, end: 1400}, {reservations: [{start: 1330}]}), false, '22:10開始のセルフ内部50分ブロックと22:50開始のヨガ個別予約は重複不可');
assert.strictEqual(yogaPrivateCreatable({start: 850, end: 890}, {externalBlocks: [{start: 840, end: 880}]}), false, 'ヨガ個別予約同士が重なる場合は登録不可');
assert.strictEqual(yogaPrivateTimeValid(840, 880), true, 'ヨガ個別予約の開始・終了は10分単位なら有効');
assert.strictEqual(yogaPrivateTimeValid(495, 880), false, '08:15は10分単位ではないためNG');
assert.strictEqual(yogaPrivateTimeValid(536, 880), false, '08:56は10分単位ではないためNG');
assert.strictEqual(yogaPrivateTimeValid(490, 880), true, '08:10は10分単位のためOK');
assert.strictEqual(yogaPrivateTimeValid(530, 880), true, '08:50は10分単位のためOK');
assert.strictEqual(yogaPrivateTimeValid(845, 880), false, '10分単位でない開始時間は登録不可');
assert.strictEqual(yogaPrivateTimeValid(840, 885), false, '10分単位でない終了時間は登録不可');
assert.strictEqual(yogaPrivateTimeValid(880, 840), false, '終了時間が開始時間以前なら登録不可');
assert.strictEqual(label(1330), '22:10〜22:50', '22:10の表示は40分のまま');
assert.strictEqual(sameBlock(1370, 1330), true, '22:10の内部ブロックは22:50も重なり扱い');
assert(memberSupabaseSource.includes('externalBlock'), 'member side must consider external_blocks without exposing details');
assert(adminSource.includes('externalBlockCard'), 'admin side must render yoga private reservation details');
assert(memberSupabaseSource.includes("'title','予約不可'") || fs.readFileSync(path.join(appDir, 'supabase-patch-v36-yoga-private-ui-fixes.sql'), 'utf8').includes("'title','予約不可'"), 'member side snapshot must not expose yoga private personal details');
assert(yogaPrivateSource.includes("p_member_name: String(fd.get('memberName') || '').trim()"), 'yoga private create must allow blank member name');
assert(yogaPrivateSource.includes("p_instructor_name: String(fd.get('instructorName') || '').trim()"), 'yoga private create must allow blank instructor name');
assert(yogaPrivateSource.includes("p_note: String(fd.get('note') || '').trim()"), 'yoga private create must allow blank note');
assert(yogaPrivateSource.includes('btn.disabled = !result.ok'), 'yoga private submit button must be disabled when selected time is unavailable');
assert(yogaPrivateSource.includes('セルフジム予約') && yogaPrivateSource.includes('利用不可枠') && yogaPrivateSource.includes('既存のヨガ個別予約'), 'yoga private unavailable list must distinguish self, closed, and yoga blocks');

const plans = {
  '月4回プラン': 4,
  '月8回プラン': 8,
  '通い放題プラン': null,
  'ファミリー月4回プラン': 4,
  'ファミリー月8回プラン': 8,
  'ファミリー通い放題プラン': null,
};
function isUnlimitedPlan(plan) {
  return String(plan || '').includes('通い放題');
}
function hasMonthlyLimit(member) {
  return !isUnlimitedPlan(member.plan);
}
function quota(member) {
  return hasMonthlyLimit(member) ? plans[member.plan] : null;
}
function canReserveByMonthlyLimit(member, monthlyCount) {
  return !hasMonthlyLimit(member) || monthlyCount < quota(member);
}
function canReserve(member, { monthlyCount = 0, futureCount = 0, dayCount = 0 }) {
  return canReserveByMonthlyLimit(member, monthlyCount) && futureCount < 2 && dayCount < 2;
}
function quotaLabel(member) {
  return hasMonthlyLimit(member) ? `月の予約回数：${quota(member)}回まで` : '月の予約回数：制限なし';
}
function usageLabel(member, monthlyCount) {
  return hasMonthlyLimit(member) ? `${monthlyCount} / ${quota(member)}` : `${monthlyCount}回（月回数制限なし）`;
}

assert.strictEqual(canReserveByMonthlyLimit({ plan: '月4回プラン' }, 4), false, '月4回プランは月4回で上限になる');
assert.strictEqual(canReserveByMonthlyLimit({ plan: '月8回プラン' }, 8), false, '月8回プランは月8回で上限になる');
assert.strictEqual(canReserveByMonthlyLimit({ plan: 'ファミリー月4回プラン' }, 4), false, 'ファミリー月4回プランは月4回で上限になる');
assert.strictEqual(canReserveByMonthlyLimit({ plan: 'ファミリー月8回プラン' }, 8), false, 'ファミリー月8回プランは月8回で上限になる');
assert.strictEqual(canReserveByMonthlyLimit({ plan: '通い放題プラン' }, 99), true, '通い放題プランは月回数上限で止まらない');
assert.strictEqual(canReserveByMonthlyLimit({ plan: 'ファミリー通い放題プラン' }, 99), true, 'ファミリー通い放題プランは月回数上限で止まらない');
assert.strictEqual(canReserve({ plan: '通い放題プラン' }, { futureCount: 2 }), false, '通い放題プランでも同時予約2枠制限は残る');
assert.strictEqual(canReserve({ plan: 'ファミリー通い放題プラン' }, { futureCount: 2 }), false, 'ファミリー通い放題プランでも同時予約2枠制限は残る');
assert.strictEqual(canReserve({ plan: '通い放題プラン' }, { dayCount: 2 }), false, '通い放題プランでも同日2枠制限は残る');
assert.strictEqual(canReserve({ plan: 'ファミリー通い放題プラン' }, { dayCount: 2 }), false, 'ファミリー通い放題プランでも同日2枠制限は残る');
assert.strictEqual(label(490), '08:10〜08:50', '通い放題プランでも予約時間表示は40分');
assert.strictEqual(label(540), '09:00〜09:40', 'ファミリー通い放題プランでも予約時間表示は40分');
assert.strictEqual(sameBlock(10, 0), true, '通い放題プランでも50分ブロック判定は残る');
assert.strictEqual(sameBlock(40, 0), true, 'ファミリー通い放題プランでも50分ブロック判定は残る');
for (const plan of ['通い放題プラン', 'ファミリー通い放題プラン']) {
  const member = { plan };
  assert.strictEqual(quotaLabel(member), '月の予約回数：制限なし', `${plan}では月の予約回数が制限なし表示になる`);
  const usage = usageLabel(member, 5);
  assert(!usage.includes('9999回まで'), `${plan} must not show 9999回まで`);
  assert(!usage.includes('Infinity回まで'), `${plan} must not show Infinity回まで`);
  assert(!usage.includes('NaN回まで'), `${plan} must not show NaN回まで`);
}
for (const source of [memberSupabaseSource, fs.readFileSync(path.join(appDir, 'member-script.js'), 'utf8')]) {
  assert(source.includes('function isUnlimitedPlan'), 'member sources must define isUnlimitedPlan');
  assert(source.includes('function hasMonthlyLimit'), 'member sources must define hasMonthlyLimit');
  assert(source.includes('通い放題プラン'), 'member sources must include 通い放題プラン');
  assert(source.includes('ファミリー通い放題プラン') || source.includes("includes('通い放題')"), 'member sources must support family unlimited plans');
  assert(!source.includes('9999回まで'), 'member sources must not render 9999回まで');
  assert(!source.includes('Infinity回まで'), 'member sources must not render Infinity回まで');
  assert(!source.includes('NaN回まで'), 'member sources must not render NaN回まで');
}

console.log([...flexibleLabels, ...fixedLabels].join('\n'));
