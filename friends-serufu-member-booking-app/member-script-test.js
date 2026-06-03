const fs = require('fs');
const path = require('path');
const assert = require('assert');

const appDir = __dirname;
const files = ['fs-member-supabase.js', 'member-script.js'];
const slotFiles = [...files, 'admin-script.js', 'admin-bulk-close.js'];
const displayFiles = [...files, 'member-calendar-cancel.js'];
const fixedLabels = [
  '08:10〜08:50',
  '09:00〜09:40',
  '09:50〜10:30',
  '10:40〜11:20',
  '11:30〜12:10',
  '12:20〜13:00',
];
const flexibleLabels = [
  '00:00〜00:40',
  '00:10〜00:50',
  '00:20〜01:00',
  '00:30〜01:10',
  '00:40〜01:20',
  '00:50〜01:30',
  '01:00〜01:40',
];
const forbiddenLabels = ['08:00〜08:40', '08:20〜09:00', '10:40〜11:30', '11:30〜12:20'];

function fmt(m) {
  return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
}

function starts() {
  const useMinutes = 40;
  const blockMinutes = 50;
  const fixedSlotStepMinutes = 50;
  const flexibleSlotStepMinutes = 10;
  const fixedSlotStartMinute = 490;
  const flexibleSlotEndMinute = 480;
  const starts = [];
  for (let m = 0; m < flexibleSlotEndMinute; m += flexibleSlotStepMinutes) starts.push(m);
  for (let m = fixedSlotStartMinute; m < 1440; m += fixedSlotStepMinutes) starts.push(m);
  return starts.filter((m) => m + blockMinutes <= 1440 && m + useMinutes <= 1440);
}

const labels = starts().map((m) => `${fmt(m)}〜${fmt(m + 40)}`);
assert.deepStrictEqual(labels.slice(0, flexibleLabels.length), flexibleLabels);
assert.deepStrictEqual(
  starts().filter((m) => m >= 490 && m <= 740).map((m) => `${fmt(m)}〜${fmt(m + 40)}`),
  fixedLabels,
);
for (const label of forbiddenLabels) assert(!labels.includes(label), `${label} must not be generated`);


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
  const blockMinutes = 50;
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
  assert(!source.includes('50分枠'), `${file} must not label member slots as 50-minute use slots`);
  assert(!source.includes('〜${fmt(s+50)}'), `${file} must not render Supabase slots with +50 end time`);
  assert(!source.includes('〜${minText(s+50)}'), `${file} must not render localStorage slots with +50 end time`);
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

for (const file of displayFiles) {
  const source = fs.readFileSync(path.join(appDir, file), 'utf8');
  assert(!source.includes('Number(m)+50'), `${file} must not build visible end time with +50`);
}

console.log([...flexibleLabels, ...fixedLabels].join('\n'));
