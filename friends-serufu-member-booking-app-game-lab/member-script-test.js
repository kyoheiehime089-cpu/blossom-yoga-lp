const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const scriptPath = path.join(__dirname, 'member-script.js');
const source = fs.readFileSync(scriptPath, 'utf8');

function makeElement(id) {
  return {
    id,
    value: 'all',
    innerHTML: '',
    textContent: '',
    disabled: false,
    style: {},
    classList: {
      add() {},
      remove() {},
      toggle() {},
    },
    addEventListener() {},
    reset() {},
    showModal() {},
    close() {},
    insertAdjacentHTML() {},
  };
}

const elements = new Map();
const getElement = (selector) => {
  const id = selector.startsWith('#') ? selector.slice(1) : selector;
  if (!elements.has(id)) elements.set(id, makeElement(id));
  return elements.get(id);
};

const storage = new Map();
const initialState = {
  members: [{ id: 'FS001', pin: '1234', name: 'テスト会員', plan: '月8回プラン', extraByMonth: {} }],
  reservations: [],
  closed: [],
  purchaseRequests: [],
  member: 'FS001',
  week: 0,
  day: 0,
};
storage.set('friends-serufu-gh-v2', JSON.stringify(initialState));

const context = {
  assert,
  console,
  URLSearchParams,
  structuredClone,
  setTimeout() {},
  localStorage: {
    getItem: (key) => storage.get(key) || null,
    setItem: (key, value) => storage.set(key, String(value)),
  },
  location: { search: '', pathname: '/member.html' },
  history: { replaceState() {} },
  navigator: { clipboard: { writeText() {} } },
  confirm: () => true,
  document: {
    querySelector: getElement,
    querySelectorAll: () => [],
    addEventListener() {},
    body: { insertAdjacentHTML() {} },
  },
};
context.window = context;
context.globalThis = context;

function runMemberDisplayTests() {
  const targetStarts = [490, 540, 590, 640, 690, 740];
  const targetLabels = [
    '08:10〜08:50',
    '09:00〜09:40',
    '09:50〜10:30',
    '10:40〜11:20',
    '11:30〜12:10',
    '12:20〜13:00',
  ];
  const forbiddenLabels = ['10:40〜11:30', '11:30〜12:20'];

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let chosen = null;
  for (let offset = 0; offset < 14; offset += 1) {
    const date = new Date(today);
    date.setDate(today.getDate() + offset);
    const dateKey = dk(date);
    if (targetStarts.every((minute) => !conflict(dateKey, minute) && canBook(dateKey, minute))) {
      chosen = { offset, dateKey };
      break;
    }
  }
  assert.ok(chosen, 'found a visible fixed-slot test date within the 14-day booking window');

  S.member = 'FS001';
  S.week = Math.floor(chosen.offset / 7);
  S.day = chosen.offset % 7;
  S.reservations = [];
  S.closed = [];
  S.overnightStartByDate = {};
  document.querySelector('#timeFilter').value = 'all';
  renderCalendar();

  const calendarWithoutBooking = document.querySelector('#calendar').innerHTML;
  const displayedTargetLabels = [...calendarWithoutBooking.matchAll(/<span class='time'>([^<]+)<\/span>/g)]
    .map((match) => match[1])
    .filter((label) => targetLabels.includes(label));
  assert.deepEqual(
    displayedTargetLabels,
    targetLabels,
    'fixed slots are displayed as 40-minute frames at 50-minute intervals',
  );
  for (const forbidden of forbiddenLabels) {
    assert.ok(!calendarWithoutBooking.includes(forbidden), `${forbidden} is not displayed`);
  }

  S.reservations = [{
    id: 'r_test_1040',
    memberId: 'FS001',
    memberName: 'テスト会員',
    plan: '月8回プラン',
    date: chosen.dateKey,
    start: 640,
    people: '1名',
    note: '',
    createdAt: new Date().toISOString(),
    cancelled: false,
  }];
  renderCalendar();

  const calendarWithBooking = document.querySelector('#calendar').innerHTML;
  for (const forbidden of forbiddenLabels) {
    assert.ok(!calendarWithBooking.includes(forbidden), `${forbidden} is not displayed after booking 10:40〜11:20`);
  }
  const slots = [...calendarWithBooking.matchAll(/<button class='slot ([^']*)'[^>]*data-s='(\d+)'[^>]*><span class='time'>([^<]+)<\/span><span class='status'>([^<]+)<\/span><\/button>/g)]
    .reduce((acc, match) => {
      acc[Number(match[2])] = { className: match[1], label: match[3], status: match[4] };
      return acc;
    }, {});

  assert.equal(slots[590].label, '09:50〜10:30');
  assert.notEqual(slots[590].status, '自分の予約', '09:50〜10:30 is not marked as my reservation');
  assert.equal(slots[640].label, '10:40〜11:20');
  assert.equal(slots[640].status, '自分の予約', '10:40〜11:20 is the only own reservation');
  assert.equal(slots[690].label, '11:30〜12:10');
  assert.notEqual(slots[690].status, '自分の予約', '11:30〜12:10 is not marked as my reservation');

  console.log('member display checks passed:', chosen.dateKey);
}

vm.createContext(context);
vm.runInContext(`${source}\n(${runMemberDisplayTests.toString()})();`, context, { filename: scriptPath });
