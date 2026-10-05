/* Sudoku engine: generation and solving for any box size (N = boxRows * boxCols). */
(function (root) {
  'use strict';

  const SIZES = {
    mini: { id: 'mini', name: 'Mini', boxRows: 2, boxCols: 2 },
    small: { id: 'small', name: 'Small', boxRows: 2, boxCols: 3 },
    standard: { id: 'standard', name: 'Standard', boxRows: 3, boxCols: 3 },
    large: { id: 'large', name: 'Large', boxRows: 3, boxCols: 4 },
  };

  // Fraction of cells left as givens, per difficulty level.
  const DIFFICULTIES = [
    { id: 'beginner', name: 'Beginner', givens: 0.6 },
    { id: 'easy', name: 'Easy', givens: 0.5 },
    { id: 'medium', name: 'Medium', givens: 0.42 },
    { id: 'hard', name: 'Hard', givens: 0.35 },
    { id: 'expert', name: 'Expert', givens: 0.29 },
  ];

  function geometry(boxRows, boxCols) {
    const n = boxRows * boxCols;
    const boxesAcross = n / boxCols;
    const rowOf = new Array(n * n);
    const colOf = new Array(n * n);
    const boxOf = new Array(n * n);
    for (let i = 0; i < n * n; i++) {
      const r = Math.floor(i / n);
      const c = i % n;
      rowOf[i] = r;
      colOf[i] = c;
      boxOf[i] = Math.floor(r / boxRows) * boxesAcross + Math.floor(c / boxCols);
    }
    return { n, boxRows, boxCols, rowOf, colOf, boxOf, full: (1 << (n + 1)) - 2 };
  }

  function popcount(x) {
    let c = 0;
    while (x) { x &= x - 1; c++; }
    return c;
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // Backtracking search with minimum-remaining-values heuristic.
  // Returns the number of solutions found (stops at `limit`).
  // If `out` is given, the first solution is copied into it.
  function search(geo, grid, limit, randomize, out) {
    const { n, rowOf, colOf, boxOf, full } = geo;
    const g = grid.slice();
    const rows = new Array(n).fill(0);
    const cols = new Array(n).fill(0);
    const boxes = new Array(n).fill(0);
    for (let i = 0; i < g.length; i++) {
      const v = g[i];
      if (!v) continue;
      const bit = 1 << v;
      if ((rows[rowOf[i]] | cols[colOf[i]] | boxes[boxOf[i]]) & bit) return 0;
      rows[rowOf[i]] |= bit;
      cols[colOf[i]] |= bit;
      boxes[boxOf[i]] |= bit;
    }
    let count = 0;

    function rec() {
      let best = -1;
      let bestMask = 0;
      let bestCount = n + 1;
      for (let i = 0; i < g.length; i++) {
        if (g[i]) continue;
        const mask = full & ~(rows[rowOf[i]] | cols[colOf[i]] | boxes[boxOf[i]]);
        const c = popcount(mask);
        if (c < bestCount) {
          best = i;
          bestMask = mask;
          bestCount = c;
          if (c <= 1) break;
        }
      }
      if (best === -1) {
        count++;
        if (out && count === 1) for (let i = 0; i < g.length; i++) out[i] = g[i];
        return count >= limit;
      }
      if (bestCount === 0) return false;
      const values = [];
      for (let v = 1; v <= n; v++) if (bestMask & (1 << v)) values.push(v);
      if (randomize) shuffle(values);
      const r = rowOf[best], c = colOf[best], b = boxOf[best];
      for (const v of values) {
        const bit = 1 << v;
        g[best] = v;
        rows[r] |= bit; cols[c] |= bit; boxes[b] |= bit;
        if (rec()) return true;
        rows[r] &= ~bit; cols[c] &= ~bit; boxes[b] &= ~bit;
      }
      g[best] = 0;
      return false;
    }

    rec();
    return count;
  }

  function solve(boxRows, boxCols, grid) {
    const geo = geometry(boxRows, boxCols);
    const out = new Array(grid.length).fill(0);
    return search(geo, grid, 1, false, out) ? out : null;
  }

  function countSolutions(boxRows, boxCols, grid, limit) {
    return search(geometry(boxRows, boxCols), grid, limit || 2, false, null);
  }

  function generate(sizeId, difficultyIndex) {
    const size = SIZES[sizeId];
    const diff = DIFFICULTIES[difficultyIndex];
    const geo = geometry(size.boxRows, size.boxCols);
    const total = geo.n * geo.n;

    const solution = new Array(total).fill(0);
    search(geo, new Array(total).fill(0), 1, true, solution);

    const target = Math.max(Math.round(total * diff.givens), geo.n - 1);
    let best = null;
    // A few attempts; keep the puzzle closest to the target number of givens.
    for (let attempt = 0; attempt < 4; attempt++) {
      const puzzle = solution.slice();
      let givens = total;
      // Remove symmetric pairs first for a nicer look, then singles.
      const order = shuffle([...Array(total).keys()]);
      for (const i of order) {
        if (givens <= target) break;
        if (!puzzle[i]) continue;
        const j = total - 1 - i;
        const pair = j !== i && puzzle[j] && givens - 2 >= target;
        const saved = [puzzle[i], puzzle[j]];
        puzzle[i] = 0;
        if (pair) puzzle[j] = 0;
        if (search(geo, puzzle, 2, false, null) === 1) {
          givens -= pair ? 2 : 1;
        } else {
          puzzle[i] = saved[0];
          if (pair) puzzle[j] = saved[1];
        }
      }
      if (!best || givens < best.givens) best = { puzzle, givens };
      if (givens <= target) break;
    }
    return { size: size.id, difficulty: difficultyIndex, puzzle: best.puzzle, solution };
  }

  const api = { SIZES, DIFFICULTIES, generate, solve, countSolutions, geometry };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Sudoku = api;
})(typeof self !== 'undefined' ? self : this);
