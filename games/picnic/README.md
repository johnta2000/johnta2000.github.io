# Pepsi & Pepper’s Picnic

A small, self-contained game at `/games/picnic/`. No build, runtime dependencies, account, analytics, external fonts, or third-party assets. The corgis and meadow are original Canvas artwork. The static files use the website’s existing GitHub Pages hosting.

## Play

Move the mouse, drag on a touch screen, or use Left/Right (also A/D). Keep the target number of treats before time runs out. Each of ten sequential levels increases speed, frequency, and the treat target. Later levels add drifting drops and separated food/hazard pairs. Targets, timing, and hazard mixes live in `engine.mjs`.

Each round starts with three hearts. Catching a sock costs one heart and spills two treats; mud costs a heart and slows movement for three seconds; a vacuum costs a heart and shrinks the blanket for three seconds. Brief immunity prevents overlapping drops from taking multiple hearts at once. Missing food or avoiding hazards costs no hearts. Zero hearts or an unmet goal at the deadline loses the round; retries are unlimited and preserve completed levels and friends.

Winning unlocks the next level. Clean runs earn three stars, one hit earns two, and two hits earn one. Best stars survive replays. Locked level URLs explain how to unlock them and never bypass progression.

Pepsi starts alone. Beating level 3 unlocks gray Pepper, who joins gameplay from level 4. From level 5 onward, one sparkling golden paw-print biscuit appears per attempt. Collecting it on three different levels unlocks butter-yellow Pee. Repeating the same level does not add another paw print; a collected print remains earned even if the round is lost. Pee joins gameplay from level 5 after unlocking. Unlocked friends also appear in the welcome/final picnic; their names reopen their reveal. Reveals pause gameplay, and the close button, backdrop, and Escape return to the same round or result. Clicking inside or dragging outward does not dismiss them.

P, Escape, or the pause button pauses a round, including temporary setbacks. Switching tabs or leaving the page pauses automatically. Sound starts muted. Reduced-motion preferences disable decorative wiggles, hearts, and background movement.

## Navigation and persistence

- `/games/picnic/`: welcome screen.
- `?view=levels`: adventure map and best stars.
- `?view=help`: instructions and progress backup/restore.
- `?view=play&level=1`: a specific level (1–10), or its unlock requirement.
- `?view=play&level=1&paused=1`: paused round.
- `?view=result&level=1`: the latest result for that level in this browser.
- `?view=picnic`: picnic scene and personal note.
- `?view=pepper&level=3&from=result`: Pepper’s reveal or unlock requirement.
- `?view=guest&level=7&from=play`: Pee’s reveal or secret progress; copied URLs do not grant unlocks.

All navigation uses real links and browser history. Opening a saved round requires an explicit resume tap. A fresh browser without a matching result shows a link to play, rather than fabricating a result.

This is a solo game with progress saved in the player’s own browser under `pepsi-pepper-picnic-v2` in localStorage. There is no shared score or account database. Saves contain active rounds, falling objects, hearts, temporary effects, completed levels, best stars, latest results, friends, golden-print levels, and sound preference. State is saved on catches/hits, every half second while playing, and on pause/navigation. A failed save shows a warning and offers a JSON download while the in-memory game remains playable. Unreadable data is not silently overwritten; explicit save retry keeps it in a recovery key. Backup imports validate and merge without removing existing achievements or replacing current rounds.

Original `pepsi-pepper-picnic-v1` saves migrate into v2 while leaving the original key untouched. Completed levels and an earned Pee are retained. Any original round already in progress finishes with its original target, timer, and harmless drops; its next replay uses the new adventure rules. Original golden-biscuit catches still honor the former Pee unlock. A separate `pepsi-pepper-picnic-pee` flag protects earned Pee from older tabs. Backups include unlocks and can add but never remove existing friends or stars.

## Verification

From the repository root:

```sh
node --test tests/picnic/engine.test.mjs
python3 -m http.server 8786 --bind 127.0.0.1
# In another terminal, using the existing Playwright dependency and installed Chrome:
node tests/picnic/browser.cjs
node tests/picnic/secret.cjs
```

Engine checks simulate all ten levels across 20 random seeds at desktop and phone blanket widths and verify hazards, sequential unlocks, stars, secret progress, round restoration, and original-save migration. Browser checks play the entire adventure with pointer input on desktop and mobile, exercise keyboard/touch, reveals, pause, locks, every meaningful URL, copied tabs, refresh, Back/Forward, and small/landscape layouts. Focused checks cover hazard feedback, third-hit failure and retries, a golden catch that simultaneously wins, missing/repeating golden biscuits, backups, legacy saves, and recoverable storage failures. The automated player is test-only and is not imported by the game.

Screenshots and synthetic test backups go to `outputs/picnic-qa/` and are excluded from the release.
