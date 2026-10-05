/* Generates puzzles off the main thread so large/expert boards don't freeze the UI. */
importScripts('sudoku.js');

self.onmessage = (e) => {
  const { id, size, difficulty } = e.data;
  self.postMessage({ id, game: self.Sudoku.generate(size, difficulty) });
};
