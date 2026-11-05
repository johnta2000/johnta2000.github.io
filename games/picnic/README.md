# Pepsi & Pepper’s Picnic

A small, self-contained game at `/games/picnic/`. No build, dependencies, account, analytics, external fonts, or third-party assets. The two plushie corgis and meadow are original Canvas artwork. The static files work with the website’s existing GitHub Pages hosting.

## Play

Drag the blanket on a touch screen, move the mouse, or use Left/Right (also A/D). Catch the target number of treats before the 30-second timer ends. Five levels increase falling speed, frequency, and targets; levels 4–5 add occasional pairs. Misses have no life penalty. A failed round can be retried without clearing other progress. All levels can also be selected directly for practice.

P, Escape, or the pause button pauses a round. Switching tabs or leaving the page pauses automatically. Sound is optional and starts muted. Reduced-motion preferences disable decorative wiggles, floating hearts, and background motion.

## Navigation and persistence

- `/games/picnic/`: welcome screen.
- `?view=levels`: level selection.
- `?view=help`: instructions and progress backup/restore.
- `?view=play&level=1`: a specific level (1–5).
- `?view=play&level=1&paused=1`: paused round.
- `?view=result&level=1`: the most recent result for that level in this browser.
- `?view=picnic`: the picnic scene and personal note.

All navigation uses real links and browser history. Opening a saved round waits for an explicit resume tap. A fresh browser with no matching result shows a link to play that round, rather than fabricating a result.

This is a solo game, with each player's progress saved on their own device/browser under `pepsi-pepper-picnic-v1` in localStorage. There is no shared score or account database. Saves contain in-progress rounds (including falling treats and remaining time), completed levels, latest results, and sound preference. State is saved on catches, every 0.75 seconds while playing, and on pause/navigation. A failed save displays a warning and offers a JSON download; memory state remains playable. An unreadable save is not silently overwritten. Explicit save retry preserves it in a recovery key. Backup import validates the contents and merges them without replacing current rounds.

## Verification

From the repository root:

```sh
node --test tests/picnic/engine.test.mjs
python3 -m http.server 8786 --bind 127.0.0.1
# In another terminal, using the existing Playwright dependency and installed Chrome:
node tests/picnic/browser.cjs
```

The browser checks cover real rendering and input, all five completed rounds, failed rounds, retry, pause/backdrop/Escape behavior, keyboard and touch, navigation history, copied links in fresh tabs, reload, 320px and landscape layouts, saved rounds, and storage failures. Screenshots and test-only recovery files are written to `outputs/picnic-qa/` and are not part of the release.
