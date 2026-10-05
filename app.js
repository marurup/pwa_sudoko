/* Sudoku PWA: UI, game state, persistence. */
(() => {
  'use strict';

  const { SIZES, DIFFICULTIES } = window.Sudoku;
  const $ = (sel) => document.querySelector(sel);

  const KEYS = { game: 'sudoku.game.v1', settings: 'sudoku.settings.v1', stats: 'sudoku.stats.v1' };

  function load(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
  }

  const settings = Object.assign({
    mistakes: true,
    highlight: true,
    autonotes: true,
    hidecomplete: true,
    timer: true,
    theme: 'auto',
    lastSize: 'standard',
    lastDifficulty: 1,
  }, load(KEYS.settings, {}));

  let stats = load(KEYS.stats, {});
  let game = load(KEYS.game, null);
  let geo = null;          // { n, boxRows, boxCols, rowOf, colOf, boxOf }
  let peers = [];          // peers[i] = indexes sharing row/col/box with i
  let cells = [];          // DOM cells
  let selected = -1;
  let notesMode = false;
  let paused = false;
  let autoPaused = false;
  let tickHandle = null;
  let generating = false;

  const board = $('#board');
  const pad = $('#pad');
  const overlay = $('#overlay');

  /* ---------- Geometry ---------- */

  function setupGeometry(sizeId) {
    const size = SIZES[sizeId];
    geo = window.Sudoku.geometry(size.boxRows, size.boxCols);
    const total = geo.n * geo.n;
    peers = [];
    for (let i = 0; i < total; i++) {
      const p = [];
      for (let j = 0; j < total; j++) {
        if (j !== i && (geo.rowOf[j] === geo.rowOf[i] || geo.colOf[j] === geo.colOf[i] || geo.boxOf[j] === geo.boxOf[i])) p.push(j);
      }
      peers.push(p);
    }
  }

  function symbol(v) {
    return String(v);
  }

  /* ---------- Board construction ---------- */

  function buildBoard() {
    const { n, boxRows, boxCols } = geo;
    board.innerHTML = '';
    board.style.setProperty('--n', n);
    board.dataset.n = n;
    cells = [];
    for (let i = 0; i < n * n; i++) {
      const r = Math.floor(i / n);
      const c = i % n;
      const el = document.createElement('div');
      el.className = 'cell';
      el.setAttribute('role', 'gridcell');
      el.dataset.i = i;
      if (c === n - 1) el.classList.add('edge-r');
      else if ((c + 1) % boxCols === 0) el.classList.add('box-r');
      if (r === n - 1) el.classList.add('edge-b');
      else if ((r + 1) % boxRows === 0) el.classList.add('box-b');
      board.appendChild(el);
      cells.push(el);
    }

    pad.innerHTML = '';
    const cols = n === 12 ? 6 : n;
    pad.style.setProperty('--cols', cols);
    document.querySelector('.app').style.setProperty('--pad-rows', Math.ceil(n / cols));
    for (let v = 1; v <= n; v++) {
      const b = document.createElement('button');
      b.dataset.v = v;
      b.innerHTML = `<span>${symbol(v)}</span><small></small>`;
      b.setAttribute('aria-label', `Enter ${v}`);
      pad.appendChild(b);
    }
  }

  /* ---------- Rendering ---------- */

  function render() {
    if (!game) return;
    const { n } = geo;
    const total = n * n;
    const selVal = selected >= 0 ? game.values[selected] : 0;
    const peerSet = selected >= 0 ? new Set(peers[selected]) : null;

    for (let i = 0; i < total; i++) {
      const el = cells[i];
      const v = game.values[i];
      const given = game.puzzle[i] !== 0;
      const wrong = v && v !== game.solution[i];

      el.classList.toggle('given', given);
      el.classList.toggle('selected', i === selected);
      el.classList.toggle('peer', !!peerSet && peerSet.has(i));
      el.classList.toggle('same', settings.highlight && !!selVal && v === selVal && i !== selected);
      el.classList.toggle('error', settings.mistakes && !!wrong);

      let html;
      if (v) {
        html = symbol(v);
      } else if (game.notes[i]) {
        html = `<div class="notes" style="--nc:${geo.boxCols};--nr:${geo.boxRows}">`;
        for (let d = 1; d <= n; d++) {
          const has = game.notes[i] & (1 << d);
          html += `<span class="${has && settings.highlight && d === selVal ? 'match' : ''}">${has ? symbol(d) : ''}</span>`;
        }
        html += '</div>';
      } else {
        html = '';
      }
      if (el._html !== html) {
        el.innerHTML = html;
        el._html = html;
      }
      const r = Math.floor(i / n) + 1;
      const c = (i % n) + 1;
      el.setAttribute('aria-label', `Row ${r}, column ${c}${v ? `, ${v}` : ', empty'}`);
    }

    // Number pad remaining counts.
    const counts = new Array(n + 1).fill(0);
    for (let i = 0; i < total; i++) if (game.values[i] && game.values[i] === game.solution[i]) counts[game.values[i]]++;
    for (const b of pad.children) {
      const v = Number(b.dataset.v);
      const left = n - counts[v];
      b.querySelector('small').textContent = left > 0 ? left : '';
      b.classList.toggle('done', settings.hidecomplete && left === 0);
    }
    pad.classList.toggle('notes-mode', notesMode);

    $('#game-label').textContent = `${SIZES[game.size].name} ${n}×${n} · ${DIFFICULTIES[game.difficulty].name}`;
    const mistakesEl = $('#mistakes');
    mistakesEl.textContent = `Mistakes ${game.mistakes}`;
    mistakesEl.hidden = !settings.mistakes;
    $('#btn-undo').disabled = game.history.length === 0 || game.done;
    $('#btn-notes').setAttribute('aria-pressed', String(notesMode));
    $('#notes-state').textContent = notesMode ? 'on' : 'off';
    renderTimer();
  }

  function formatTime(sec) {
    sec = Math.floor(sec);
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
  }

  function renderTimer() {
    $('#timer').textContent = game ? formatTime(game.elapsed) : '0:00';
    $('#btn-pause').classList.toggle('hidden-time', !settings.timer);
  }

  /* ---------- Timer & pause ---------- */

  function startTicking() {
    stopTicking();
    tickHandle = setInterval(() => {
      // Don't count time while a dialog (new game, settings, …) is open.
      if (!game || game.done || paused || generating || document.querySelector('dialog[open]')) return;
      game.elapsed += 1;
      renderTimer();
      persistGame();
    }, 1000);
  }

  function stopTicking() {
    if (tickHandle) clearInterval(tickHandle);
    tickHandle = null;
  }

  function setPaused(value) {
    if (!game || game.done) value = false;
    paused = value;
    board.classList.toggle('paused', paused);
    if (paused) {
      overlay.classList.remove('hidden', 'loading');
      $('#overlay-text').textContent = 'Paused';
    } else if (!generating) {
      overlay.classList.add('hidden');
    }
  }

  /* ---------- Game actions ---------- */

  function persistGame() {
    if (game) save(KEYS.game, game);
  }

  function snapshot(indexes) {
    return indexes.map((i) => [i, game.values[i], game.notes[i]]);
  }

  function pushHistory(entry) {
    game.history.push(entry);
    if (game.history.length > 500) game.history.shift();
  }

  function enter(v) {
    if (!game || game.done || paused || selected < 0) return;
    const i = selected;
    if (game.puzzle[i]) return;

    if (notesMode) {
      if (game.values[i]) return;
      pushHistory(snapshot([i]));
      game.notes[i] ^= 1 << v;
    } else {
      if (game.values[i] === v) {
        pushHistory(snapshot([i]));
        game.values[i] = 0;
      } else {
        const affected = [i];
        if (settings.autonotes) {
          for (const p of peers[i]) if (!game.values[p] && game.notes[p] & (1 << v)) affected.push(p);
        }
        pushHistory(snapshot(affected));
        game.values[i] = v;
        game.notes[i] = 0;
        for (const p of affected) if (p !== i) game.notes[p] &= ~(1 << v);
        if (v !== game.solution[i]) game.mistakes++;
        else flashCompletedUnits(i);
      }
    }
    afterChange();
  }

  function erase() {
    if (!game || game.done || paused || selected < 0) return;
    const i = selected;
    if (game.puzzle[i] || (!game.values[i] && !game.notes[i])) return;
    pushHistory(snapshot([i]));
    game.values[i] = 0;
    game.notes[i] = 0;
    afterChange();
  }

  function undo() {
    if (!game || game.done || paused || !game.history.length) return;
    const entry = game.history.pop();
    for (const [i, v, notes] of entry) {
      game.values[i] = v;
      game.notes[i] = notes;
    }
    selected = entry[0][0];
    afterChange();
  }

  function hint() {
    if (!game || game.done || paused) return;
    const total = game.values.length;
    const needsHelp = (i) => !game.puzzle[i] && game.values[i] !== game.solution[i];
    let target = selected >= 0 && needsHelp(selected) ? selected : -1;
    if (target < 0) {
      // Pick the empty cell with the fewest candidates (the most "deducible" one).
      let bestCount = Infinity;
      for (let i = 0; i < total; i++) {
        if (!needsHelp(i)) continue;
        const used = new Set(peers[i].map((p) => game.values[p]).filter(Boolean));
        const cand = geo.n - used.size;
        if (cand < bestCount) { bestCount = cand; target = i; }
      }
    }
    if (target < 0) return;
    const v = game.solution[target];
    const affected = [target];
    for (const p of peers[target]) if (!game.values[p] && game.notes[p] & (1 << v)) affected.push(p);
    pushHistory(snapshot(affected));
    game.values[target] = v;
    game.notes[target] = 0;
    for (const p of affected) if (p !== target) game.notes[p] &= ~(1 << v);
    game.hints++;
    selected = target;
    cells[target].classList.remove('flash');
    void cells[target].offsetWidth;
    cells[target].classList.add('flash');
    afterChange();
  }

  function flashCompletedUnits(i) {
    const { n, rowOf, colOf, boxOf } = geo;
    const total = n * n;
    const complete = (pred) => {
      const idx = [];
      for (let j = 0; j < total; j++) if (pred(j)) idx.push(j);
      return idx.every((j) => game.values[j] === game.solution[j]) ? idx : [];
    };
    const toFlash = new Set([
      ...complete((j) => rowOf[j] === rowOf[i]),
      ...complete((j) => colOf[j] === colOf[i]),
      ...complete((j) => boxOf[j] === boxOf[i]),
    ]);
    for (const j of toFlash) {
      cells[j].classList.remove('flash');
      void cells[j].offsetWidth;
      cells[j].classList.add('flash');
    }
  }

  function afterChange() {
    if (game.values.every((v, i) => v === game.solution[i])) win();
    persistGame();
    render();
  }

  function statKey(size, diff) {
    return `${size}:${diff}`;
  }

  function win() {
    game.done = true;
    const key = statKey(game.size, game.difficulty);
    const s = stats[key] || { played: 0, won: 0, best: null, total: 0 };
    s.won++;
    s.total += game.elapsed;
    const isBest = s.best === null || game.elapsed < s.best;
    if (isBest) s.best = game.elapsed;
    stats[key] = s;
    save(KEYS.stats, stats);

    const extras = [];
    if (game.mistakes) extras.push(`${game.mistakes} mistake${game.mistakes === 1 ? '' : 's'}`);
    if (game.hints) extras.push(`${game.hints} hint${game.hints === 1 ? '' : 's'}`);
    $('#win-text').innerHTML =
      `${SIZES[game.size].name} · ${DIFFICULTIES[game.difficulty].name}<br>` +
      `Time: <strong>${formatTime(game.elapsed)}</strong>${isBest ? ' — new best!' : ''}` +
      (extras.length ? `<br>${extras.join(', ')}` : '<br>Flawless!');
    selected = -1;
    setTimeout(() => $('#dlg-win').showModal(), 450);
  }

  /* ---------- New game ---------- */

  let worker = null;
  let requestId = 0;
  try {
    worker = new Worker('worker.js');
  } catch {
    worker = null;
  }

  function generatePuzzle(size, difficulty) {
    if (!worker) return Promise.resolve(window.Sudoku.generate(size, difficulty));
    const id = ++requestId;
    return new Promise((resolve) => {
      const onMessage = (e) => {
        if (e.data.id !== id) return;
        worker.removeEventListener('message', onMessage);
        resolve(e.data.game);
      };
      worker.addEventListener('message', onMessage);
      worker.postMessage({ id, size, difficulty });
    });
  }

  async function newGame(size, difficulty) {
    generating = true;
    setPaused(false);
    overlay.classList.remove('hidden');
    overlay.classList.add('loading');
    $('#overlay-text').textContent = 'Creating puzzle…';
    // Give the overlay a frame to paint before any synchronous fallback work.
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
    const g = await generatePuzzle(size, difficulty);
    generating = false;
    overlay.classList.add('hidden');
    overlay.classList.remove('loading');

    game = {
      size,
      difficulty,
      puzzle: g.puzzle,
      solution: g.solution,
      values: g.puzzle.slice(),
      notes: new Array(g.puzzle.length).fill(0),
      elapsed: 0,
      mistakes: 0,
      hints: 0,
      history: [],
      done: false,
    };
    const key = statKey(size, difficulty);
    const s = stats[key] || { played: 0, won: 0, best: null, total: 0 };
    s.played++;
    stats[key] = s;
    save(KEYS.stats, stats);

    settings.lastSize = size;
    settings.lastDifficulty = difficulty;
    save(KEYS.settings, settings);

    selected = -1;
    notesMode = false;
    setupGeometry(size);
    buildBoard();
    persistGame();
    render();
  }

  function openNewDialog() {
    const sizeBox = $('#size-choices');
    const diffBox = $('#difficulty-choices');
    sizeBox.innerHTML = Object.values(SIZES).map((s) => {
      const n = s.boxRows * s.boxCols;
      return `<label><input type="radio" name="size" value="${s.id}" ${s.id === settings.lastSize ? 'checked' : ''}>` +
        `<strong>${s.name}</strong><small>${n}×${n}, ${s.boxCols}×${s.boxRows} boxes</small></label>`;
    }).join('');
    diffBox.innerHTML = DIFFICULTIES.map((d, i) =>
      `<label><input type="radio" name="difficulty" value="${i}" ${i === settings.lastDifficulty ? 'checked' : ''}>` +
      `<strong>${d.name}</strong><small>${'●'.repeat(i + 1)}${'○'.repeat(4 - i)}</small></label>`
    ).join('');
    $('#dlg-new').showModal();
  }

  $('#dlg-new').addEventListener('close', () => {
    const dlg = $('#dlg-new');
    if (dlg.returnValue !== 'start') return;
    const size = dlg.querySelector('input[name="size"]:checked').value;
    const diff = Number(dlg.querySelector('input[name="difficulty"]:checked').value);
    newGame(size, diff);
  });

  /* ---------- Settings & stats dialogs ---------- */

  function applyTheme() {
    if (settings.theme === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.dataset.theme = settings.theme;
  }

  const toggles = {
    '#set-mistakes': 'mistakes',
    '#set-highlight': 'highlight',
    '#set-autonotes': 'autonotes',
    '#set-hidecomplete': 'hidecomplete',
    '#set-timer': 'timer',
  };

  for (const [sel, key] of Object.entries(toggles)) {
    const input = $(sel);
    input.addEventListener('change', () => {
      settings[key] = input.checked;
      save(KEYS.settings, settings);
      render();
    });
  }

  $('#set-theme').addEventListener('change', (e) => {
    settings.theme = e.target.value;
    save(KEYS.settings, settings);
    applyTheme();
  });

  function openSettings() {
    for (const [sel, key] of Object.entries(toggles)) $(sel).checked = settings[key];
    $('#set-theme').value = settings.theme;
    updateOfflineStatus();
    $('#dlg-settings').showModal();
  }

  function openStats() {
    let html = '<tr><th>Level</th><th>Played</th><th>Won</th><th>Best</th><th>Avg</th></tr>';
    for (const s of Object.values(SIZES)) {
      const n = s.boxRows * s.boxCols;
      html += `<tr class="group"><td colspan="5">${s.name} ${n}×${n}</td></tr>`;
      DIFFICULTIES.forEach((d, i) => {
        const st = stats[statKey(s.id, i)] || { played: 0, won: 0, best: null, total: 0 };
        html += `<tr><td>${d.name}</td><td>${st.played}</td><td>${st.won}</td>` +
          `<td>${st.best === null ? '–' : formatTime(st.best)}</td>` +
          `<td>${st.won ? formatTime(st.total / st.won) : '–'}</td></tr>`;
      });
    }
    $('#stats-table').innerHTML = html;
    $('#dlg-stats').showModal();
  }

  $('#dlg-stats').addEventListener('close', () => {
    if ($('#dlg-stats').returnValue === 'reset' && confirm('Reset all statistics?')) {
      stats = {};
      save(KEYS.stats, stats);
    }
  });

  $('#dlg-win').addEventListener('close', () => {
    if ($('#dlg-win').returnValue === 'new') openNewDialog();
  });

  /* ---------- Input ---------- */

  board.addEventListener('pointerdown', (e) => {
    const cell = e.target.closest('.cell');
    if (!cell || paused) return;
    selected = Number(cell.dataset.i);
    render();
  });

  pad.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) enter(Number(b.dataset.v));
  });

  $('#btn-undo').addEventListener('click', undo);
  $('#btn-erase').addEventListener('click', erase);
  $('#btn-hint').addEventListener('click', hint);
  $('#btn-notes').addEventListener('click', () => { notesMode = !notesMode; render(); });
  $('#btn-new').addEventListener('click', openNewDialog);
  $('#btn-settings').addEventListener('click', openSettings);
  $('#btn-stats').addEventListener('click', openStats);
  $('#btn-pause').addEventListener('click', () => setPaused(!paused));
  $('#btn-resume').addEventListener('click', () => setPaused(false));

  document.addEventListener('keydown', (e) => {
    if (!game || document.querySelector('dialog[open]')) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const { n } = geo;
    const key = e.key;
    if (/^[1-9]$/.test(key) && Number(key) <= n) { enter(Number(key)); return; }
    // 12×12 boards: 0 = 10, A/B/C = 10/11/12.
    if (n > 9) {
      const map = { '0': 10, a: 10, b: 11, c: 12 };
      const v = map[key.toLowerCase()];
      if (v && v <= n) { enter(v); return; }
    }
    if (key === 'Backspace' || key === 'Delete' || (key === '0' && n <= 9)) { erase(); return; }
    if (key.toLowerCase() === 'n') { notesMode = !notesMode; render(); return; }
    if (key.toLowerCase() === 'h') { hint(); return; }
    if (key === ' ' || key === 'p') { e.preventDefault(); setPaused(!paused); return; }
    const moves = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (moves[key]) {
      e.preventDefault();
      if (selected < 0) selected = 0;
      else {
        const r = (Math.floor(selected / n) + moves[key][0] + n) % n;
        const c = ((selected % n) + moves[key][1] + n) % n;
        selected = r * n + c;
      }
      render();
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (!paused && game && !game.done) { autoPaused = true; setPaused(true); }
      persistGame();
    } else if (autoPaused) {
      autoPaused = false;
      setPaused(false);
    }
  });

  /* ---------- Offline support ---------- */

  function updateOfflineStatus() {
    const el = $('#offline-status');
    if (!('serviceWorker' in navigator)) {
      el.textContent = 'This browser does not support offline mode.';
    } else if (navigator.serviceWorker.controller) {
      el.textContent = '✓ Ready to play offline. Install it from your browser menu (“Add to Home Screen” / “Install app”).';
    } else {
      el.textContent = 'Preparing offline mode… reload once while online to finish.';
    }
  }

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => { /* offline mode unavailable */ });
    });
  }

  /* ---------- Boot ---------- */

  applyTheme();

  const valid = game && SIZES[game.size] && DIFFICULTIES[game.difficulty] &&
    Array.isArray(game.values) && game.values.length === SIZES[game.size].boxRows ** 2 * SIZES[game.size].boxCols ** 2;
  if (valid) {
    setupGeometry(game.size);
    buildBoard();
    render();
  } else {
    newGame(settings.lastSize, settings.lastDifficulty);
  }
  startTicking();
})();
