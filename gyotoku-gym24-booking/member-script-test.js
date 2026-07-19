const fs = require('fs');
const path = require('path');
const assert = require('assert');

const appDir = __dirname;
const read = (file) => fs.readFileSync(path.join(appDir, file), 'utf8');
const useMinutes = 40;
const blockMinutes = 50;
const tenMinutes = 10;

function fmt(m) {
  return m === 1440 ? '24:00' : String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
}
function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}
function yogaEndWithBuffer(end) {
  return Math.min(1440, end + tenMinutes);
}
function selfBlockedByYoga(selfStart, yogaStart, yogaEnd) {
  return overlaps(selfStart, selfStart + blockMinutes, yogaStart, yogaEndWithBuffer(yogaEnd));
}
function defaultYogaEnd(start) {
  return Math.min(1440, start + useMinutes);
}
function tenMinuteValid(start, end) {
  return Number.isInteger(start) && Number.isInteger(end) && start >= 0 && start <= 1430 && end > start && end <= 1440 && start % 10 === 0 && end % 10 === 0;
}

const indexHtml = read('index.html');
const adminHtml = read('admin.html');
const yogaHtml = read('yoga-private.html');
const yogaSource = read('yoga-private-clean-v39.js');
const memberSource = read('fs-member-supabase.js');
const sqlPatch = read('supabase-patch-v38-yoga-private-buffer.sql');

for (const html of [indexHtml, adminHtml, yogaHtml]) {
  assert(!html.includes('v=38'), 'HTML must not load v38 assets');
  assert(html.includes('v=39'), 'HTML must load v39 assets');
}

assert(yogaHtml.includes('<form id="yogaForm"'), 'single yoga registration form must exist');
assert.strictEqual((yogaHtml.match(/<form /g) || []).length, 1, 'yoga private page must have one form after login');
assert(yogaHtml.includes('<select id="yogaStart"'), 'start must be a select');
assert(yogaHtml.includes('<select id="yogaEnd"'), 'end must be a select');
assert(!/type=["']time["']|step=["']600["']/.test(yogaHtml), 'native time input must not be used');
assert(!/memberName|instructorName|quickDate|quickStart|quickEnd|quickAvailability|quickCopy|quickUseForForm|buildLineReply|copyText/.test(yogaHtml + yogaSource), 'removed quick/name fields must not remain');
assert(!/この内容で会員さんへ返信できます|この内容で登録する|LINE返信文をコピー|新規登録|ヨガ個別予約を登録|この時間は予約できます/.test(yogaHtml + yogaSource), 'removed UI wording must not remain');
assert(yogaHtml.includes('メモ（任意）'), 'optional memo must remain');
assert(yogaHtml.includes('登録する'), 'one registration button must remain');

assert(yogaSource.includes('YOGA_PRIVATE_BUFFER_MINUTES=10') || yogaSource.includes('YOGA_PRIVATE_BUFFER_MINUTES = 10'), 'JS must keep yoga buffer');
assert(yogaSource.includes('p_member_name:\'\'') || yogaSource.includes("p_member_name:''"), 'member name must be sent blank');
assert(yogaSource.includes('p_instructor_name:\'\'') || yogaSource.includes("p_instructor_name:''"), 'instructor name must be sent blank');
assert(yogaSource.includes("setMessage('登録完了しました',true)") || yogaSource.includes("setMessage('登録完了しました', true)"), 'success message must remain');
assert(yogaSource.includes('timeOptions(0,1430)') || yogaSource.includes('timeOptions(0, 1430)'), 'start select must cover 00:00-23:50');
assert(yogaSource.includes('timeOptions(minEnd,1440)') || yogaSource.includes('timeOptions(minEnd, 1440)'), 'end select must cover through 24:00');

assert.strictEqual(defaultYogaEnd(490), 530, '08:10 defaults to 08:50');
assert.strictEqual(defaultYogaEnd(540), 580, '09:00 defaults to 09:40');
assert(tenMinuteValid(490, 530), '08:10-08:50 is valid');
assert(!tenMinuteValid(495, 530), '08:15 is invalid');
assert(!tenMinuteValid(490, 536), '08:56 is invalid');
assert.strictEqual(selfBlockedByYoga(540, 490, 530), false, 'yoga 08:10-08:50 allows self 09:00');
assert.strictEqual(selfBlockedByYoga(540, 490, 540), true, 'yoga 08:10-09:00 blocks self 09:00');
assert.strictEqual(selfBlockedByYoga(550, 490, 540), false, 'yoga 08:10-09:00 allows self 09:10');
assert(memberSource.includes('externalBlock'), 'member side must consider external yoga blocks');
assert(sqlPatch.includes('block_end_minute') && sqlPatch.includes('p_end_minute + 10'), 'SQL patch must preserve yoga buffer');

console.log('member-script-test OK');
