# Pepsi & Pepper’s Picnic

A small, self-contained game at `/games/picnic/`. No build, dependencies, account, analytics, external fonts, or third-party assets. The plushie corgis and meadow are original Canvas artwork. The static files work with the website’s existing GitHub Pages hosting.

## Play

Drag the blanket on a touch screen, move the mouse, or use Left/Right (also A/D). Catch the target number of treats before the 30-second timer ends. Five levels increase falling speed, frequency, and targets; levels 4–5 add occasional pairs. Misses have no life penalty. A failed round can be retried without clearing other progress. All levels can also be selected directly for practice.

P, Escape, or the pause button pauses a round. Switching tabs or leaving the page pauses automatically. Sound is optional and starts muted. Reduced-motion preferences disable decorative wiggles, floating hearts, and background motion.

Pee is a secret butter-yellow and white corgi. Starting at level 2, one sparkling golden biscuit with a paw stamp appears after the first four ordinary drops in each round. Catching it counts as a regular biscuit and permanently unlocks Pee in this browser, even if the round is later lost. The reveal pauses play and closes with its button, backdrop click/tap, or Escape; all resume the same round (or its result if the catch won). Missing it leaves another chance on a replay or later level. Pee joins both the moving blanket and the picnic scene. His name at the picnic reopens his reveal.

## Navigation and persistence

- `/games/picnic/`: welcome screen.
- `?view=levels`: level selection.
- `?view=help`: instructions and progress backup/restore.
- `?view=play&level=1`: a specific level (1–5).
- `?view=play&level=1&paused=1`: paused round.
- `?view=result&level=1`: the most recent result for that level in this browser.
- `?view=picnic`: the picnic scene and personal note.
- `?view=guest&level=2&from=play`: the secret guest reveal; an undiscovered guest stays hidden on a copied link.

All navigation uses real links and browser history. Opening a saved round waits for an explicit resume tap. A fresh browser with no matching result shows a link to play that round, rather than fabricating a result.

This is a solo game, with each player's progress saved on their own device/browser under `pepsi-pepper-picnic-v1` in localStorage. There is no shared score or account database. Saves contain in-progress rounds (including falling treats and remaining time), completed levels, latest results, and sound preference. State is saved on catches, every 0.75 seconds while playing, and on pause/navigation. A failed save displays a warning and offers a JSON download; memory state remains playable. An unreadable save is not silently overwritten. Explicit save retry preserves it in a recovery key. Backup import validates the contents and merges them without replacing current rounds.

Existing saves migrate without resetting any rounds. The save and JSON backups include Pee’s unlock. A separate `pepsi-pepper-picnic-pee` flag also preserves it when an older open tab writes the previous save format. Restoring a backup can add the unlock but cannot remove an existing one.

## Verification

From the repository root:

```sh
node --test tests/picnic/engine.test.mjs
python3 -m http.server 8786 --bind 127.0.0.1
# In another terminal, using the existing Playwright dependency and installed Chrome:
node tests/picnic/browser.cjs
node tests/picnic/secret.cjs
```

The browser checks cover real rendering and input, all five completed rounds, failed rounds, retry, pause/backdrop/Escape behavior, keyboard and touch, navigation history, copied links in fresh tabs, reload, 320px and landscape layouts, saved rounds, and storage failures. The secret checks also cover a golden catch that wins the round, missed biscuits, locked direct links, old-save migration, backup merges, legacy-tab protection, and recoverable unlock save failures. Screenshots and test-only recovery files are written to `outputs/picnic-qa/` and are not part of the release.
