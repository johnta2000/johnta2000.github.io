# Corgi Days

A mobile-first, single-player daily corgi companion at `/games/corgi-days/`. Buildless HTML, CSS, JavaScript and a procedural cartoon 3D model rendered with locally bundled Three.js (MIT). Published on the existing John Ta GitHub Pages site.

Name your corgi, select four coats, five accessories with any color, and three garden backgrounds. Feed, play, wash and rest once each calendar day. Needs decay with elapsed time and never fall below 10. Each care action earns five biscuits; all four grant twenty more and extend a consecutive-day streak. Missing a day breaks the streak, not the pet. All customization is free. Biscuits are a collectible lifetime care score.

Navigation uses `?view=home`, `?view=wardrobe`, and `?view=journal`, supports direct links, browser history, reload and copied URLs. Name and outfit drafts stay in browser storage and out of URLs.

This is a device-local personal game, not a shared pet or cloud account. `corgi-days-v1` stores the pet; `corgi-days-style-v1` stores unfinished wardrobe edits. Save failures appear inline, retain in-memory work, warn on close and offer retries and downloadable backups. JSON backups can transfer a corgi and draft to another browser after validation and replacement confirmation. A corrupt save is not overwritten. Daily reset follows the timezone recorded when the corgi is created. No push notifications or background jobs are required.

## Verification

From the repository root:

- `node --test tests/corgi-days/model.test.mjs`
- Serve this repository on localhost port 8794, then `node tests/corgi-days/browser.cjs` using the existing Playwright/Chrome installation.

Tests use synthetic pets, check duplicate rewards, midnight rollover, missed-day streaks, offline decay, backup validation, desktop/mobile care, wardrobe drafts, reloads, every section's copied URL, Back/Forward and backup restoration. Screenshots go to the untracked `outputs/corgi-days-qa/` folder.


## Cartoon 3D garden

The corgi is real mesh geometry built in `corgi-3d.mjs`: a rounded body, curved white markings, tiny paws, modeled ears, eyes, muzzle, and solid accessories. There are no photo textures or generated-image sprites in the active game.

- Move mode: drag with a finger/mouse to move the pet along the garden floor.
- Look around: drag to orbit the camera. Pinch, scroll, or use the zoom buttons to zoom.
- Arrow/WASD keys and touch arrow buttons move; Q/E or the turn button rotate the pet. Space or Cuddle triggers a hop.
- Reset scene intentionally returns the pet and camera to their starting positions.
- `mode`, `az`, `el`, and `zoom` in the URL restore camera/navigation state on copied links and Back/Forward.
- Pet position and facing persist in `corgi-days-pose-v1`, and are included in JSON backups. Existing names, outfits, and care saves keep the same schema.
- Device pixel ratio is capped at 2 and rendering at 30fps. GPU resources are disposed on navigation. Reduced motion disables idle motions. Browsers without WebGL show an explanation while daily care remains available.

Run `node tests/corgi-days/3d-browser.cjs` with the repository served on port 8794 to verify desktop/mobile drag, touch, orbit, keyboard, zoom, history, copied links, 20 wardrobe combinations, and saved care. Library attribution is in `vendor/THREE-LICENSE.txt`.
