function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('CSV集計')
    .addItem('集計を更新', 'updateSummary')
    .addToUi();
}

function updateSummary() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const csvSheet = getOrCreateSheet_(ss, 'CSV貼り付け');
  const monthlySheet = getOrCreateSheet_(ss, '月次集計');
  const courseSheet = getOrCreateSheet_(ss, 'コース別集計');
  const checkSheet = getOrCreateSheet_(ss, '確認リスト');
  const dashboardSheet = getOrCreateSheet_(ss, 'ダッシュボード');

  const rows = csvSheet.getDataRange().getValues();
  if (rows.length < 2) {
    SpreadsheetApp.getUi().alert('CSV貼り付けシートにデータを貼ってください。');
    return;
  }

  const headers = rows[0].map(String);
  const data = rows.slice(1).filter(row => row.join('').trim() !== '');

  const idx = {
    month: headers.indexOf('請求月'),
    name: headers.indexOf('氏名'),
    course: headers.indexOf('コース'),
    amount: headers.indexOf('請求額'),
    status: headers.indexOf('入金状態'),
    note: headers.indexOf('備考')
  };

  const missingHeaders = Object.keys(idx).filter(key => idx[key] === -1);
  if (missingHeaders.length > 0) {
    SpreadsheetApp.getUi().alert('必要な列が足りません。列名を確認してください。');
    return;
  }

  const monthly = {};
  const courses = {};
  const checks = [];

  data.forEach((row, i) => {
    const rowNo = i + 2;
    const month = String(row[idx.month] || '').trim();
    const name = String(row[idx.name] || '').trim();
    const course = String(row[idx.course] || '').trim();
    const amount = Number(row[idx.amount] || 0);
    const status = String(row[idx.status] || '').trim();
    const note = String(row[idx.note] || '').trim();
    const paid = status === '入金済';

    if (!monthly[month]) {
      monthly[month] = { billed: 0, paid: 0, unpaid: 0, count: 0, paidCount: 0, unpaidCount: 0 };
    }
    monthly[month].billed += amount;
    monthly[month].count += 1;
    if (paid) {
      monthly[month].paid += amount;
      monthly[month].paidCount += 1;
    } else {
      monthly[month].unpaid += amount;
      monthly[month].unpaidCount += 1;
      checks.push([rowNo, name, course, amount, status, '入金状態を確認', note]);
    }

    const courseKey = course || '未入力';
    if (!courses[courseKey]) {
      courses[courseKey] = { billed: 0, paid: 0, unpaid: 0, count: 0 };
    }
    courses[courseKey].billed += amount;
    courses[courseKey].count += 1;
    if (paid) courses[courseKey].paid += amount;
    else courses[courseKey].unpaid += amount;

    if (!name) checks.push([rowNo, name, course, amount, status, '氏名が空欄', note]);
    if (!course) checks.push([rowNo, name, course, amount, status, 'コースが空欄', note]);
    if (!amount) checks.push([rowNo, name, course, amount, status, '請求額が空欄または0', note]);
  });

  writeTable_(monthlySheet, ['請求月', '請求総額', '入金済み金額', '未入金金額', '請求人数', '入金済み人数', '未入金人数'],
    Object.keys(monthly).sort().map(month => [month, monthly[month].billed, monthly[month].paid, monthly[month].unpaid, monthly[month].count, monthly[month].paidCount, monthly[month].unpaidCount]));

  writeTable_(courseSheet, ['コース', '人数', '請求総額', '入金済み金額', '未入金金額'],
    Object.keys(courses).sort().map(course => [course, courses[course].count, courses[course].billed, courses[course].paid, courses[course].unpaid]));

  writeTable_(checkSheet, ['元データ行', '氏名', 'コース', '請求額', '入金状態', '確認内容', '備考'], checks);

  dashboardSheet.clear();
  const latestMonth = Object.keys(monthly).sort().pop() || '';
  const d = monthly[latestMonth] || { billed: 0, paid: 0, unpaid: 0, count: 0, unpaidCount: 0 };
  dashboardSheet.getRange(1, 1, 7, 2).setValues([
    ['最新月', latestMonth],
    ['請求総額', d.billed],
    ['入金済み金額', d.paid],
    ['未入金金額', d.unpaid],
    ['請求人数', d.count],
    ['未入金人数', d.unpaidCount],
    ['確認リスト件数', checks.length]
  ]);
  dashboardSheet.autoResizeColumns(1, 2);

  SpreadsheetApp.getUi().alert('集計を更新しました。');
}

function getOrCreateSheet_(ss, name) {
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function writeTable_(sheet, headers, rows) {
  sheet.clear();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  }
  sheet.autoResizeColumns(1, headers.length);
}
