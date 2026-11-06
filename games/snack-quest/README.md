# The Great Snack Quest

A small, static, single-player browser adventure for Pepsi and Pepper. The selected corgi leads and the other follows their footsteps. Gather four treats in each of three clearings, dodge bouncing toys, and follow the exits to a picnic together. A new adventure changes the snack locations and the order of the last two clearings.

Public route: `/games/snack-quest/`.

## Playing

- Arrow keys or WASD to move; Space to dash; Escape to pause/resume.
- Tap/click the meadow to walk toward a spot. Phone players also have a direction pad and a dash button.
- Toys gently bump the corgis. Collected snacks are never lost.
- Sound is optional and starts off. Reduced-motion preferences disable decorative movement.

## Hosting and saved progress

Publish this directory as-is through the existing GitHub Pages site. It needs no build step, game library, account, or backend. Art is drawn in canvas and the icon is SVG. Fonts have local serif/sans-serif fallbacks if Google Fonts is unavailable.

URLs preserve the selected corgi, adventure ID, room, and home/play/pause/picnic view. Room navigation uses real links and history; inaccessible rooms return to the first unfinished clearing. Same-device copied links and refreshes restore saved progress.

This is a personal game, not a shared editing tool. Adventures are stored per run in `localStorage`, with visible save failures, retry, downloadable JSON backup, and a Restore backup control. Starting a new adventure preserves previous saves. Links reproduce the same trail on a different device, but progress does not sync between devices. No sensitive information is put in URLs and no analytics is added.

## Local checks

From the repository root:

```sh
python3 -m http.server 8766 --bind 127.0.0.1
node --test tests/snack-quest/engine.test.mjs
node tests/snack-quest/browser.mjs
```

The browser check uses installed Playwright. Set `PLAYWRIGHT_EXECUTABLE_PATH` if necessary, `SNACK_QUEST_URL` to test a different origin, and `SNACK_QUEST_SCREENSHOTS` to choose an output folder. It checks controls, a real pickup, all room URLs, refresh, copied links, Back/Forward, pause/backdrop behavior, the ending, replay, and storage failure on desktop and mobile.
