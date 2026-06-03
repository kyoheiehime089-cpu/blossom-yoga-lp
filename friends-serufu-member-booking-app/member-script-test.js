const fs = require('fs');
const path = require('path');
const assert = require('assert');

const appDir = __dirname;
const files = ['fs-member-supabase.js', 'member-script.js'];
const displayFiles = [...files, 'member-calendar-cancel.js'];
const expectedLabels = [
  '08:10〜08:50',
  '09:00〜09:40',
  '09:50〜10:30',
  '10:40〜11:20',
  '11:30〜12:10',
  '12:20〜13:00',
];
const forbiddenLabels = ['10:40〜11:30', '11:30〜12:20'];

function fmt(m) {
  return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
}

function fixedStarts() {
  const useMinutes = 40;
  const stepMinutes = 50;
  const starts = [];
  for (let m = 490; m < 1440; m += stepMinutes) starts.push(m);
  for (let m = 490 - stepMinutes; m >= 0; m -= stepMinutes) starts.unshift(m);
  return starts.filter((m) => m + useMinutes <= 1440);
}

const labels = fixedStarts()
  .filter((m) => m >= 490 && m <= 740)
  .map((m) => `${fmt(m)}〜${fmt(m + 40)}`);
assert.deepStrictEqual(labels, expectedLabels);
for (const label of forbiddenLabels) assert(!labels.includes(label), `${label} must not be generated`);

for (const file of files) {
  const source = fs.readFileSync(path.join(appDir, file), 'utf8');
  assert(source.includes('USE_MINUTES=40'), `${file} must define 40-minute displayed use time`);
  assert(source.includes('SLOT_STEP_MINUTES=50'), `${file} must keep 50-minute fixed start cadence`);
  assert(source.includes('BLOCK_MINUTES=50'), `${file} must reserve 10-minute changeover in conflict checks`);
  assert(!source.includes('50分枠'), `${file} must not label member slots as 50-minute use slots`);
  assert(!source.includes('〜${fmt(s+50)}'), `${file} must not render Supabase slots with +50 end time`);
  assert(!source.includes('〜${minText(s+50)}'), `${file} must not render localStorage slots with +50 end time`);
}

for (const file of displayFiles) {
  const source = fs.readFileSync(path.join(appDir, file), 'utf8');
  assert(!source.includes('Number(m)+50'), `${file} must not build visible end time with +50`);
}

console.log(expectedLabels.join('\n'));
