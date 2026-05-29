(function(){
  'use strict';

  const KEYS = {
    points: 'fs_game_lab_stress_points',
    logs: 'fs_game_lab_stress_logs',
    last: 'fs_game_lab_last_played_date',
    pending: 'fs_game_lab_pending_play'
  };
  const TAB_ID = 'stressResetTab';
  const PANEL_ID = 'stressResetPanel';
  const GRID_W = 10;
  const GRID_H = 14;
  const CELL = 22;
  const GAME_MS = 45000;
  const TICK_MS = 520;
  const COLORS = ['#f4b43f', '#3b8b5e', '#2f6fbd', '#b86bcb', '#e78355'];
  const SHAPES = [
    [[1,1,1],[0,1,0]],
    [[1,1],[1,1]],
    [[1,1,0],[0,1,1]],
    [[0,1,1],[1,1,0]],
    [[1,1,1,1]],
    [[1,0,0],[1,1,1]],
    [[0,0,1],[1,1,1]]
  ];
  const STRESS_OPTIONS = [
    {value:'1', label:'1 とても軽い'},
    {value:'2', label:'2 軽い'},
    {value:'3', label:'3 ふつう'},
    {value:'4', label:'4 強い'},
    {value:'5', label:'5 とても強い'}
  ];

  let grid = emptyGrid();
  let piece = null;
  let score = 0;
  let running = false;
  let startedAt = 0;
  let timerId = null;
  let tickId = null;
  let preStress = '';
  let completing = false;

  function $(sel, root=document){return root.querySelector(sel)}
  function today(){return new Date().toISOString().slice(0,10)}
  function esc(v){return String(v ?? '').replace(/[&<>'"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
  function readJson(key, fallback){try{const raw=localStorage.getItem(key);return raw?JSON.parse(raw):fallback}catch(_e){return fallback}}
  function readPoints(){const n=Number(localStorage.getItem(KEYS.points) || '0');return Number.isFinite(n) && n >= 0 ? n : 0}
  function readLogs(){const logs=readJson(KEYS.logs, []);return Array.isArray(logs) ? logs : []}
  function writeJson(key, value){localStorage.setItem(key, JSON.stringify(value))}
  function emptyGrid(){return Array.from({length:GRID_H}, ()=>Array(GRID_W).fill(null))}
  function validPending(p){return p && p.date === today() && p.status === 'pending'}
  function getPendingPlay(){
    const p = readJson(KEYS.pending, null);
    if(!p) return null;
    if(validPending(p)) return p;
    localStorage.removeItem(KEYS.pending);
    return null;
  }
  function alreadyCompletedToday(){return localStorage.getItem(KEYS.last) === today()}

  function ensureUi(){
    const tabs = $('.tabs');
    if(!tabs || $('#'+TAB_ID)) return;
    const btn = document.createElement('button');
    btn.className = 'tab';
    btn.type = 'button';
    btn.dataset.tab = 'stressReset';
    btn.id = TAB_ID;
    btn.textContent = 'ストレスリセット';
    tabs.insertBefore(btn, tabs.lastElementChild);

    const panel = document.createElement('section');
    panel.id = PANEL_ID;
    panel.className = 'panel hidden stress-game-panel';
    panel.innerHTML = '<p class="eyebrow">ストレスリセット</p><div id="stressGameRoot"></div>';
    const mine = $('#mineTab');
    if(mine) mine.insertAdjacentElement('afterend', panel);
    injectStyles();
    renderStressGame();
  }

  function injectStyles(){
    if($('#stressGameStyles')) return;
    const style = document.createElement('style');
    style.id = 'stressGameStyles';
    style.textContent = `
      .stress-game-panel .stress-game-wrap{display:grid;gap:16px}
      .stress-game-panel .stress-game-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
      .stress-game-panel .stress-card{padding:15px;border:1px solid var(--line);border-radius:18px;background:#fffdf8}
      .stress-game-panel .stress-card strong{display:block;font-size:28px;line-height:1.1}
      .stress-game-panel .stress-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px;align-items:end}
      .stress-game-panel .stress-game-stage{display:grid;grid-template-columns:auto 1fr;gap:18px;align-items:start}
      .stress-game-panel canvas{width:${GRID_W*CELL}px;height:${GRID_H*CELL}px;border:1px solid var(--line);border-radius:16px;background:#1f2a24;box-shadow:inset 0 0 0 8px rgba(255,255,255,.05)}
      .stress-game-panel .stress-pad{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:10px}
      .stress-game-panel .stress-pad button,.stress-game-panel .stress-mini-btn{min-height:42px;border:1px solid var(--line);border-radius:14px;background:#fffaf2;font-weight:950;cursor:pointer}
      .stress-game-panel .stress-notice{padding:14px;border:1px solid #efcf8f;border-radius:18px;background:#fff7e7;color:#7b520e;font-weight:850}
      .stress-game-panel .stress-complete{display:grid;gap:12px;max-width:560px}
      .stress-game-panel .stress-log{display:grid;gap:8px;max-height:220px;overflow:auto}
      .stress-game-panel .stress-log article{padding:12px;border:1px solid var(--line);border-radius:14px;background:#fffdf8}
      @media(max-width:720px){.stress-game-panel .stress-game-summary,.stress-game-panel .stress-actions,.stress-game-panel .stress-game-stage{grid-template-columns:1fr}.stress-game-panel canvas{width:100%;max-width:${GRID_W*CELL}px;height:auto}}
    `;
    document.head.appendChild(style);
  }

  function renderStressGame(){
    const root = $('#stressGameRoot');
    if(!root) return;
    const pending = getPendingPlay();
    const points = readPoints();
    const logs = readLogs();
    const last = localStorage.getItem(KEYS.last) || '未プレイ';
    let body = '';

    if(pending){
      body = renderPendingCompletion(pending);
    }else if(alreadyCompletedToday()){
      body = `<div class="stress-notice">本日はプレイ済みです。明日またプレイできます。</div>${renderLogs(logs)}`;
    }else{
      body = renderStart();
    }

    root.innerHTML = `
      <div class="stress-game-wrap">
        <div class="stress-game-summary">
          <div class="stress-card"><span class="small">現在のポイント</span><strong>${points}pt</strong></div>
          <div class="stress-card"><span class="small">最終完了日</span><strong style="font-size:18px">${esc(last)}</strong></div>
          <div class="stress-card"><span class="small">記録件数</span><strong>${logs.length}</strong></div>
        </div>
        ${body}
      </div>
    `;
    draw();
  }

  function stressOptions(selected=''){
    return STRESS_OPTIONS.map(o=>`<option value="${o.value}" ${String(selected)===o.value?'selected':''}>${o.label}</option>`).join('');
  }

  function renderStart(){
    return `
      <div class="stress-actions">
        <label>プレイ前のストレス度<select id="stressBefore"><option value="">選択してください</option>${stressOptions()}</select></label>
        <button class="btn" id="startStressGame" type="button">ゲーム開始</button>
      </div>
      <div class="stress-notice">1日1回、短いブロックゲームで気分を切り替えます。記録はこの端末のlocalStorageだけに保存されます。</div>
      ${renderLogs(readLogs())}
    `;
  }

  function renderPendingCompletion(pending){
    return `
      <div class="stress-notice">未完了のプレイがあります。プレイ後のストレス度を選んで完了してください</div>
      <div class="stress-complete">
        <div class="stress-card">
          <p><strong>スコア：</strong>${Number(pending.score || 0)}</p>
          <p><strong>プレイ日：</strong>${esc(pending.date)}</p>
          <p><strong>プレイ前ストレス度：</strong>${esc(pending.preStress || '未選択')}</p>
        </div>
        <label>プレイ後のストレス度<select id="stressAfter"><option value="">選択してください</option>${stressOptions(pending.postStress || '')}</select></label>
        <button class="btn" id="completeStressPlay" type="button" data-completed="false">完了する</button>
      </div>
    `;
  }

  function renderGame(){
    const root = $('#stressGameRoot');
    if(!root) return;
    root.innerHTML = `
      <div class="stress-game-wrap">
        <div class="stress-game-stage">
          <div>
            <canvas id="stressCanvas" width="${GRID_W*CELL}" height="${GRID_H*CELL}" aria-label="ブロックゲーム画面"></canvas>
            <div class="stress-pad">
              <button type="button" data-move="left">←</button>
              <button type="button" data-move="rotate">回転</button>
              <button type="button" data-move="right">→</button>
              <button type="button" data-move="down" style="grid-column:1 / 4">下へ</button>
            </div>
          </div>
          <div class="stress-card">
            <p class="eyebrow">プレイ中</p>
            <h2>残り <span id="stressTime">45</span> 秒</h2>
            <p>スコア：<strong id="stressScore">0</strong></p>
            <p class="small">キーボードの ← → ↓ と ↑ / Space でも操作できます。</p>
            <button class="stress-mini-btn" id="finishStressGame" type="button">終了して記録へ進む</button>
          </div>
        </div>
      </div>
    `;
    draw();
  }

  function renderLogs(logs){
    if(!logs.length) return '<div class="stress-card"><p>まだ完了した記録はありません。</p></div>';
    return `<div class="stress-card"><h3>最近の記録</h3><div class="stress-log">${logs.slice(0,10).map(log=>`
      <article><strong>${esc(log.date)} / ${Number(log.score || 0)}点</strong><p>前：${esc(log.preStress)} → 後：${esc(log.postStress)} / +${Number(log.pointsAdded || 0)}pt</p></article>
    `).join('')}</div></div>`;
  }

  function startGame(){
    if(alreadyCompletedToday()) return renderStressGame();
    if(getPendingPlay()) return renderStressGame();
    const sel = $('#stressBefore');
    preStress = sel ? sel.value : '';
    if(!preStress){alert('プレイ前のストレス度を選択してください。');return;}
    grid = emptyGrid();
    piece = nextPiece();
    score = 0;
    running = true;
    startedAt = Date.now();
    renderGame();
    tickId = setInterval(step, TICK_MS);
    timerId = setInterval(updateTimer, 250);
    updateTimer();
  }

  function nextPiece(){
    const shape = SHAPES[Math.floor(Math.random()*SHAPES.length)].map(row=>row.slice());
    return {shape, x:Math.floor((GRID_W-shape[0].length)/2), y:0, color:COLORS[Math.floor(Math.random()*COLORS.length)]};
  }

  function rotate(shape){
    return shape[0].map((_, i)=>shape.map(row=>row[i]).reverse());
  }

  function collides(testPiece){
    for(let y=0;y<testPiece.shape.length;y++){
      for(let x=0;x<testPiece.shape[y].length;x++){
        if(!testPiece.shape[y][x]) continue;
        const gx = testPiece.x + x;
        const gy = testPiece.y + y;
        if(gx < 0 || gx >= GRID_W || gy >= GRID_H) return true;
        if(gy >= 0 && grid[gy][gx]) return true;
      }
    }
    return false;
  }

  function move(dx, dy){
    if(!running || !piece) return;
    const moved = {...piece, x:piece.x+dx, y:piece.y+dy};
    if(!collides(moved)){piece = moved; draw(); return true;}
    return false;
  }

  function rotatePiece(){
    if(!running || !piece) return;
    const rotated = {...piece, shape:rotate(piece.shape)};
    if(!collides(rotated)){piece = rotated; draw();}
  }

  function step(){
    if(!running) return;
    if(!move(0,1)){
      lockPiece();
      clearLines();
      piece = nextPiece();
      if(collides(piece)) finishGame();
    }
    draw();
  }

  function lockPiece(){
    piece.shape.forEach((row, y)=>row.forEach((cell, x)=>{
      if(cell){
        const gy = piece.y + y;
        const gx = piece.x + x;
        if(gy >= 0 && gy < GRID_H && gx >= 0 && gx < GRID_W) grid[gy][gx] = piece.color;
      }
    }));
  }

  function clearLines(){
    let cleared = 0;
    grid = grid.filter(row=>{
      const full = row.every(Boolean);
      if(full) cleared++;
      return !full;
    });
    while(grid.length < GRID_H) grid.unshift(Array(GRID_W).fill(null));
    if(cleared){
      score += cleared * cleared * 100;
      const scoreEl = $('#stressScore');
      if(scoreEl) scoreEl.textContent = String(score);
    }
  }

  function updateTimer(){
    if(!running) return;
    const left = Math.max(0, Math.ceil((GAME_MS - (Date.now() - startedAt))/1000));
    const el = $('#stressTime');
    if(el) el.textContent = String(left);
    if(left <= 0) finishGame();
  }

  function finishGame(){
    if(!running && getPendingPlay()) return renderStressGame();
    running = false;
    clearInterval(timerId);
    clearInterval(tickId);
    timerId = null;
    tickId = null;
    const pendingPlay = {
      status: 'pending',
      date: today(),
      preStress,
      score,
      durationMs: Math.max(0, Date.now() - startedAt),
      endedAt: new Date().toISOString()
    };
    localStorage.setItem(KEYS.pending, JSON.stringify(pendingPlay));
    renderStressGame();
  }

  function completePlay(button){
    if(completing) return;
    if(button && button.dataset.completed === 'true') return;
    const pending = getPendingPlay();
    if(!pending) return renderStressGame();
    if(alreadyCompletedToday()){
      localStorage.removeItem(KEYS.pending);
      return renderStressGame();
    }
    const after = $('#stressAfter') ? $('#stressAfter').value : '';
    if(!after){alert('プレイ後のストレス度を選択してください。');return;}

    completing = true;
    if(button){
      button.disabled = true;
      button.textContent = '保存中...';
    }

    try{
      const logs = readLogs();
      const nextPoints = readPoints() + 1;
      const log = {
        id: 'stress_' + Date.now(),
        date: today(),
        preStress: pending.preStress,
        postStress: after,
        score: Number(pending.score || 0),
        pointsAdded: 1,
        completedAt: new Date().toISOString()
      };
      localStorage.setItem(KEYS.last, today());
      localStorage.setItem(KEYS.points, String(nextPoints));
      writeJson(KEYS.logs, [log, ...logs]);
      localStorage.removeItem(KEYS.pending);
      if(button) button.dataset.completed = 'true';
      renderStressGame();
    }catch(err){
      completing = false;
      if(button){
        button.disabled = false;
        button.textContent = '完了する';
      }
      alert('保存に失敗しました。時間をおいてもう一度お試しください。');
      console.error(err);
      return;
    }
    completing = false;
  }

  function draw(){
    const canvas = $('#stressCanvas');
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle = '#1f2a24';
    ctx.fillRect(0,0,canvas.width,canvas.height);
    drawGrid(ctx, grid);
    if(piece) drawPiece(ctx, piece);
  }

  function drawGrid(ctx, rows){
    rows.forEach((row, y)=>row.forEach((color, x)=>{
      ctx.strokeStyle = 'rgba(255,255,255,.08)';
      ctx.strokeRect(x*CELL, y*CELL, CELL, CELL);
      if(color) drawCell(ctx, x, y, color);
    }));
  }

  function drawPiece(ctx, p){
    p.shape.forEach((row, y)=>row.forEach((cell, x)=>{
      if(cell) drawCell(ctx, p.x+x, p.y+y, p.color);
    }));
  }

  function drawCell(ctx, x, y, color){
    ctx.fillStyle = color;
    ctx.fillRect(x*CELL+2, y*CELL+2, CELL-4, CELL-4);
    ctx.fillStyle = 'rgba(255,255,255,.22)';
    ctx.fillRect(x*CELL+4, y*CELL+4, CELL-8, 5);
  }

  document.addEventListener('click', e=>{
    const tab = e.target.closest('.tab[data-tab]');
    if(tab){
      const isStress = tab.dataset.tab === 'stressReset';
      const panel = $('#'+PANEL_ID);
      if(panel){
        panel.classList.toggle('hidden', !isStress);
        if(isStress){
          ['bookingTab','mineTab'].forEach(id=>{const el=$('#'+id); if(el) el.classList.add('hidden')});
          document.querySelectorAll('.tab[data-tab]').forEach(b=>b.classList.toggle('active', b === tab));
          renderStressGame();
        }else{
          panel.classList.add('hidden');
        }
      }
    }
    if(e.target.id === 'startStressGame') startGame();
    if(e.target.id === 'finishStressGame') finishGame();
    if(e.target.id === 'completeStressPlay') completePlay(e.target);
    const moveBtn = e.target.closest('[data-move]');
    if(moveBtn){
      const action = moveBtn.dataset.move;
      if(action === 'left') move(-1,0);
      if(action === 'right') move(1,0);
      if(action === 'down') { if(move(0,1)) score += 1; const s=$('#stressScore'); if(s) s.textContent=String(score); }
      if(action === 'rotate') rotatePiece();
    }
  }, true);

  document.addEventListener('keydown', e=>{
    if(!running) return;
    if(e.key === 'ArrowLeft'){e.preventDefault();move(-1,0)}
    if(e.key === 'ArrowRight'){e.preventDefault();move(1,0)}
    if(e.key === 'ArrowDown'){e.preventDefault();if(move(0,1)){score += 1; const s=$('#stressScore'); if(s) s.textContent=String(score)}}
    if(e.key === 'ArrowUp' || e.key === ' '){e.preventDefault();rotatePiece()}
  });

  document.addEventListener('DOMContentLoaded', ensureUi);
  const boot = setInterval(()=>{
    ensureUi();
    if($('#'+TAB_ID)) clearInterval(boot);
  }, 300);
})();
