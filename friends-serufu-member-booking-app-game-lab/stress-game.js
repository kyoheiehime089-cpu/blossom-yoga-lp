(function(){
  'use strict';

  const KEYS = {
    points: 'fs_game_lab_stress_points',
    logs: 'fs_game_lab_stress_logs',
    last: 'fs_game_lab_last_played_date',
    pending: 'fs_game_lab_pending_play'
  };
  const COLS = 10;
  const ROWS = 20;
  const CELL = 30;
  const MAX_MS = 180000;
  const COLORS = ['#7ff0bd', '#f6c85f', '#7ea7ff', '#ef8fb9', '#a38bff', '#ff9d6e', '#75d7e8'];
  const SHAPES = [
    [[1,1,1],[0,1,0]],
    [[1,1],[1,1]],
    [[1,1,0],[0,1,1]],
    [[0,1,1],[1,1,0]],
    [[1,1,1,1]],
    [[1,0,0],[1,1,1]],
    [[0,0,1],[1,1,1]]
  ];

  const $ = (q) => document.querySelector(q);
  const state = {
    board: emptyBoard(),
    piece: null,
    score: 0,
    lines: 0,
    running: false,
    paused: false,
    completed: false,
    finishing: false,
    preStress: '',
    postStress: '',
    startedAt: 0,
    elapsedBeforePause: 0,
    tickTimer: 0,
    frameTimer: 0,
    lastTapAt: 0
  };

  function today(){ return new Date().toISOString().slice(0,10); }
  function clamp(n,min,max){ return Math.max(min, Math.min(max, n)); }
  function readJson(key, fallback){ try{ const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }catch(_e){ return fallback; } }
  function writeJson(key, value){ localStorage.setItem(key, JSON.stringify(value)); }
  function readPoints(){ const n = Number(localStorage.getItem(KEYS.points) || '0'); return Number.isFinite(n) && n >= 0 ? n : 0; }
  function readLogs(){ const logs = readJson(KEYS.logs, []); return Array.isArray(logs) ? logs : []; }
  function alreadyCompletedToday(){ return localStorage.getItem(KEYS.last) === today(); }
  function emptyBoard(){ return Array.from({length: ROWS}, () => Array(COLS).fill(null)); }
  function validPending(p){ return p && p.status === 'pending' && p.date === today(); }
  function getPendingPlay(){
    const pending = readJson(KEYS.pending, null);
    if(!pending) return null;
    if(validPending(pending)) return pending;
    localStorage.removeItem(KEYS.pending);
    return null;
  }

  function preventPageGesture(event){
    event.preventDefault();
  }
  document.addEventListener('touchmove', preventPageGesture, { passive:false });
  document.addEventListener('gesturestart', preventPageGesture, { passive:false });
  document.addEventListener('dblclick', preventPageGesture, { passive:false });

  function buildStressOptions(root, name){
    root.innerHTML = [1,2,3,4,5].map((n) => (
      `<label><input type="radio" name="${name}" value="${n}"><span>${n}</span></label>`
    )).join('');
  }

  function init(){
    buildStressOptions($('#preStressOptions'), 'preStress');
    buildStressOptions($('#postStressOptions'), 'postStress');
    $('#startButton').addEventListener('click', startGame);
    $('#completeButton').addEventListener('click', completePendingPlay);
    $('#preStressOptions').addEventListener('change', (event) => {
      state.preStress = event.target.value;
      updateStartButton();
    });
    $('#postStressOptions').addEventListener('change', (event) => {
      state.postStress = event.target.value;
      updateCompleteButton();
    });
    document.querySelectorAll('.mobile-controls button').forEach((button) => {
      button.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        runAction(button.dataset.action);
      });
      button.addEventListener('touchstart', (event) => {
        event.preventDefault();
      }, { passive:false });
    });
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('blur', () => {
      if(state.running && !state.paused) togglePause(true);
    });
    renderFromStorage();
  }

  function showScreen(name){
    $('#startScreen').classList.toggle('hidden', name !== 'start');
    $('#playScreen').classList.toggle('hidden', name !== 'play');
    $('#resultScreen').classList.toggle('hidden', name !== 'result');
  }

  function renderFromStorage(){
    const pending = getPendingPlay();
    if(pending){
      renderResult(pending, true);
      showScreen('result');
      return;
    }
    renderStart();
    showScreen('start');
  }

  function renderStart(){
    const completed = alreadyCompletedToday();
    $('#startPoints').textContent = `${readPoints()}pt`;
    $('#startTodayStatus').textContent = completed ? 'プレイ済み' : '未プレイ';
    const notice = $('#startNotice');
    if(completed){
      notice.textContent = '本日はプレイ済みです。明日またプレイできます。';
      notice.classList.remove('hidden');
    }else{
      notice.textContent = '';
      notice.classList.add('hidden');
    }
    updateStartButton();
  }

  function updateStartButton(){
    const pending = getPendingPlay();
    const button = $('#startButton');
    let disabled = false;
    let text = 'スタート';
    if(pending){
      disabled = true;
      text = '未完了のプレイがあります';
    }else if(alreadyCompletedToday()){
      disabled = true;
      text = '本日はプレイ済みです';
    }else if(!state.preStress){
      disabled = true;
      text = 'ストレス度を選んでスタート';
    }
    button.disabled = disabled;
    button.textContent = text;
  }

  function updateCompleteButton(){
    const button = $('#completeButton');
    const pending = getPendingPlay();
    const completed = alreadyCompletedToday();
    button.disabled = state.finishing || completed || !pending || !state.postStress;
    if(completed){
      button.textContent = '本日はプレイ済みです。明日またプレイできます。';
    }else if(!state.postStress){
      button.textContent = 'プレイ後ストレス度を選んで完了';
    }else{
      button.textContent = '完了して1pt獲得';
    }
  }

  function startGame(){
    if(getPendingPlay() || alreadyCompletedToday() || !state.preStress) return;
    state.board = emptyBoard();
    state.score = 0;
    state.lines = 0;
    state.running = true;
    state.paused = false;
    state.completed = false;
    state.elapsedBeforePause = 0;
    state.startedAt = Date.now();
    state.piece = nextPiece();
    $('#playPoints').textContent = `${readPoints()}pt`;
    $('#pauseOverlay').classList.add('hidden');
    showScreen('play');
    draw();
    startLoops();
  }

  function startLoops(){
    clearInterval(state.tickTimer);
    clearInterval(state.frameTimer);
    state.tickTimer = window.setInterval(() => {
      if(!state.running || state.paused) return;
      softDrop();
    }, 620);
    state.frameTimer = window.setInterval(() => {
      if(!state.running) return;
      updateHud();
      draw();
      if(currentElapsed() >= MAX_MS) finishGame('timeup');
    }, 120);
  }

  function stopLoops(){
    clearInterval(state.tickTimer);
    clearInterval(state.frameTimer);
  }

  function currentElapsed(){
    if(!state.running) return state.elapsedBeforePause;
    if(state.paused) return state.elapsedBeforePause;
    return state.elapsedBeforePause + Date.now() - state.startedAt;
  }

  function updateHud(){
    const left = Math.max(0, MAX_MS - currentElapsed());
    const minutes = Math.floor(left / 60000);
    const seconds = String(Math.ceil((left % 60000) / 1000)).padStart(2, '0');
    $('#scoreValue').textContent = String(state.score);
    $('#lineValue').textContent = String(state.lines);
    $('#timeValue').textContent = `${minutes}:${seconds}`;
  }

  function nextPiece(){
    const index = Math.floor(Math.random() * SHAPES.length);
    const shape = SHAPES[index].map((row) => row.slice());
    const piece = { shape, color: COLORS[index], x: Math.floor((COLS - shape[0].length) / 2), y: 0 };
    if(collides(piece, state.board)){
      finishGame('gameover');
    }
    return piece;
  }

  function collides(piece, board){
    if(!piece) return false;
    for(let y = 0; y < piece.shape.length; y += 1){
      for(let x = 0; x < piece.shape[y].length; x += 1){
        if(!piece.shape[y][x]) continue;
        const bx = piece.x + x;
        const by = piece.y + y;
        if(bx < 0 || bx >= COLS || by >= ROWS) return true;
        if(by >= 0 && board[by][bx]) return true;
      }
    }
    return false;
  }

  function move(dx, dy){
    if(!state.running || state.paused || !state.piece) return false;
    const moved = { ...state.piece, x: state.piece.x + dx, y: state.piece.y + dy };
    if(collides(moved, state.board)) return false;
    state.piece = moved;
    draw();
    return true;
  }

  function rotate(){
    if(!state.running || state.paused || !state.piece) return;
    const shape = state.piece.shape[0].map((_, i) => state.piece.shape.map((row) => row[i]).reverse());
    const rotated = { ...state.piece, shape };
    const kicks = [0, -1, 1, -2, 2];
    for(const kick of kicks){
      const test = { ...rotated, x: rotated.x + kick };
      if(!collides(test, state.board)){
        state.piece = test;
        draw();
        return;
      }
    }
  }

  function softDrop(){
    if(!move(0, 1)) lockPiece();
  }

  function hardDrop(){
    if(!state.running || state.paused) return;
    let dropped = 0;
    while(move(0, 1)) dropped += 1;
    state.score += dropped * 2;
    lockPiece();
  }

  function lockPiece(){
    const piece = state.piece;
    if(!piece) return;
    for(let y = 0; y < piece.shape.length; y += 1){
      for(let x = 0; x < piece.shape[y].length; x += 1){
        if(!piece.shape[y][x]) continue;
        const bx = piece.x + x;
        const by = piece.y + y;
        if(by < 0){
          finishGame('gameover');
          return;
        }
        if(by >= 0 && by < ROWS && bx >= 0 && bx < COLS) state.board[by][bx] = piece.color;
      }
    }
    clearLines();
    state.piece = nextPiece();
    draw();
  }

  function clearLines(){
    let cleared = 0;
    state.board = state.board.filter((row) => {
      if(row.every(Boolean)){
        cleared += 1;
        return false;
      }
      return true;
    });
    while(state.board.length < ROWS) state.board.unshift(Array(COLS).fill(null));
    if(cleared){
      const add = [0, 100, 260, 460, 760][cleared] || cleared * 220;
      state.lines += cleared;
      state.score += add;
    }
  }

  function finishGame(reason){
    if(!state.running || state.completed) return;
    state.completed = true;
    const elapsedMs = clamp(currentElapsed(), 0, MAX_MS);
    state.running = false;
    stopLoops();
    const pending = {
      status: 'pending',
      date: today(),
      reason,
      score: state.score,
      lines: state.lines,
      playTimeMs: elapsedMs,
      preStress: state.preStress,
      endedAt: new Date().toISOString()
    };
    writeJson(KEYS.pending, pending);
    renderResult(pending, false);
    showScreen('result');
  }

  function renderResult(pending, resumed){
    $('#postStressField').disabled = false;
    $('#resultScore').textContent = String(pending.score || 0);
    $('#resultLines').textContent = String(pending.lines || 0);
    $('#resultTime').textContent = formatPlayTime(pending.playTimeMs || 0);
    $('#resultPreStress').textContent = pending.preStress ? `${pending.preStress}` : '-';
    $('#pendingNotice').classList.toggle('hidden', !resumed);
    if(resumed) $('#pendingNotice').textContent = '未完了のプレイがあります。結果を確認して完了してください。';
    $('#completedNotice').classList.toggle('hidden', !alreadyCompletedToday());
    state.postStress = '';
    document.querySelectorAll('input[name="postStress"]').forEach((input) => { input.checked = false; });
    updateCompleteButton();
  }

  function formatPlayTime(ms){
    const seconds = Math.max(0, Math.round(ms / 1000));
    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;
    return min ? `${min}分${sec}秒` : `${sec}秒`;
  }

  function completePendingPlay(){
    if(state.finishing) return;
    const pending = getPendingPlay();
    if(!pending || !state.postStress || alreadyCompletedToday()){
      updateCompleteButton();
      return;
    }
    state.finishing = true;
    updateCompleteButton();
    const points = readPoints() + 1;
    const logs = readLogs();
    logs.unshift({
      date: today(),
      completedAt: new Date().toISOString(),
      score: Number(pending.score || 0),
      lines: Number(pending.lines || 0),
      playTimeMs: Number(pending.playTimeMs || 0),
      preStress: pending.preStress || '',
      postStress: state.postStress
    });
    localStorage.setItem(KEYS.points, String(points));
    localStorage.setItem(KEYS.last, today());
    writeJson(KEYS.logs, logs.slice(0, 90));
    localStorage.removeItem(KEYS.pending);
    state.finishing = false;
    $('#completedNotice').classList.remove('hidden');
    $('#pendingNotice').classList.add('hidden');
    $('#postStressField').disabled = true;
    updateCompleteButton();
  }

  function togglePause(forcePause){
    if(!state.running) return;
    const shouldPause = typeof forcePause === 'boolean' ? forcePause : !state.paused;
    if(shouldPause === state.paused) return;
    if(shouldPause){
      state.elapsedBeforePause = currentElapsed();
      state.paused = true;
      $('#pauseOverlay').classList.remove('hidden');
    }else{
      state.paused = false;
      state.startedAt = Date.now();
      $('#pauseOverlay').classList.add('hidden');
    }
  }

  function runAction(action){
    const now = Date.now();
    if(now - state.lastTapAt < 35) return;
    state.lastTapAt = now;
    if(action === 'left') move(-1, 0);
    if(action === 'right') move(1, 0);
    if(action === 'rotate') rotate();
    if(action === 'down') softDrop();
    if(action === 'drop') hardDrop();
    if(action === 'pause') togglePause();
  }

  function onKeyDown(event){
    const keys = ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' ','Spacebar'];
    if(keys.includes(event.key)) event.preventDefault();
    if(event.key === 'ArrowLeft') runAction('left');
    if(event.key === 'ArrowRight') runAction('right');
    if(event.key === 'ArrowUp') runAction('rotate');
    if(event.key === 'ArrowDown') runAction('down');
    if(event.key === ' ' || event.key === 'Spacebar') runAction('drop');
    if(event.key === 'p' || event.key === 'P'){
      event.preventDefault();
      runAction('pause');
    }
  }

  function draw(){
    const canvas = $('#gameCanvas');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#07100e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawGrid(ctx);
    state.board.forEach((row, y) => row.forEach((color, x) => {
      if(color) drawCell(ctx, x, y, color);
    }));
    if(state.piece){
      state.piece.shape.forEach((row, y) => row.forEach((filled, x) => {
        if(filled) drawCell(ctx, state.piece.x + x, state.piece.y + y, state.piece.color);
      }));
    }
  }

  function drawGrid(ctx){
    ctx.strokeStyle = 'rgba(255,255,255,.055)';
    ctx.lineWidth = 1;
    for(let x = 0; x <= COLS; x += 1){
      ctx.beginPath();
      ctx.moveTo(x * CELL + .5, 0);
      ctx.lineTo(x * CELL + .5, ROWS * CELL);
      ctx.stroke();
    }
    for(let y = 0; y <= ROWS; y += 1){
      ctx.beginPath();
      ctx.moveTo(0, y * CELL + .5);
      ctx.lineTo(COLS * CELL, y * CELL + .5);
      ctx.stroke();
    }
  }

  function drawCell(ctx, x, y, color){
    if(y < 0) return;
    const px = x * CELL;
    const py = y * CELL;
    ctx.fillStyle = color;
    ctx.fillRect(px + 2, py + 2, CELL - 4, CELL - 4);
    ctx.fillStyle = 'rgba(255,255,255,.22)';
    ctx.fillRect(px + 4, py + 4, CELL - 8, 5);
    ctx.strokeStyle = 'rgba(0,0,0,.28)';
    ctx.strokeRect(px + 2.5, py + 2.5, CELL - 5, CELL - 5);
  }

  init();
})();
