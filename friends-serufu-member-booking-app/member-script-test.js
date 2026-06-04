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
assert(memberSupabaseSource.includes('renderFlexible'), 'member UI must render midnight/early-morning slots as a separate flexible section');
assert(memberSupabaseSource.includes("<select id='flexStart'"), 'member flexible starts must be presented in a dropdown');
assert(memberSupabaseSource.includes('data-flex-book'), 'member flexible starts must reserve through the selected dropdown value');
assert(memberSupabaseSource.includes('fixedStarts().filter'), 'member fixed slots must render separately from flexible starts');
assert(adminSource.includes('renderAdminFlexible'), 'admin UI must render midnight/early-morning slots as a separate flexible section');
assert(adminSource.includes("<select id='adminFlexStart'"), 'admin flexible starts must be presented in a dropdown');
assert(adminSource.includes('data-admin-flex-action'), 'admin flexible starts must act through the selected dropdown value');
assert(adminSource.includes('fixedStartArr().filter'), 'admin fixed slots must render separately from flexible starts');

for (const [htmlFile, assets] of Object.entries(htmlVersions)) {
  const html = fs.readFileSync(path.join(appDir, htmlFile), 'utf8');
  assert(!html.includes('v=32'), `${htmlFile} must not load v32 assets`);
  for (const asset of assets) assert(html.includes(`${asset}?v=33`), `${htmlFile} must load ${asset} with v33`);
}

console.log([...flexibleLabels, ...fixedLabels].join('\n'));
