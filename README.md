# Sudoku PWA

An installable, fully offline Sudoku game. No build step, no dependencies — just static files.

- **4 sizes:** Mini 4×4, Small 6×6 (3×2 boxes), Standard 9×9, Large 12×12 (4×3 boxes)
- **5 difficulty levels:** Beginner, Easy, Medium, Hard, Expert
- Every puzzle is freshly generated on the device and has exactly one solution
- Pencil notes (with automatic cleanup), undo, erase, hints, mistake highlighting
- Timer with auto-pause, per-level statistics and best times
- Your game is saved automatically — close the app and continue later
- Light and dark theme

## Install on your phone

1. Open the hosted page once while online (see *Hosting* below).
2. **iPhone/iPad (Safari):** Share → *Add to Home Screen*.
   **Android (Chrome):** menu ⋮ → *Install app* / *Add to Home screen*.
3. Launch it from the home screen once more — it now works in airplane mode.

## Hosting (GitHub Pages)

The app is plain static files at the repo root, so Pages can serve the branch directly:
**Settings → Pages → Build and deployment → Source: Deploy from a branch →** pick the
default branch and `/ (root)` → Save. After a minute it is live at
`https://<user>.github.io/<repo>/` and updates on every push.

Any other static HTTPS host works too (a service worker needs HTTPS or `localhost`).

## Run locally

```sh
npx http-server -c-1 .
# or: python3 -m http.server 8000
```

## Keyboard

`1`–`9` enter a number (12×12: `0`/`A` = 10, `B` = 11, `C` = 12) · arrows move · `Backspace` erase ·
`N` notes · `H` hint · `Space` pause · `Ctrl+Z` undo

## Updating

When you change any file, bump `CACHE` in `sw.js` so installed copies pick up the new version.
