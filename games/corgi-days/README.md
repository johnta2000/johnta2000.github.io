# Corgi Days

A mobile-first, single-player daily corgi companion at `/games/corgi-days/`. Buildless HTML, CSS, JavaScript and original SVG artwork. Published on the existing John Ta GitHub Pages site.

Name your corgi, select four coats, five accessories with any color, and three garden backgrounds. Feed, play, wash and rest once each calendar day. Needs decay with elapsed time and never fall below 10. Each care action earns five biscuits; all four grant twenty more and extend a consecutive-day streak. Missing a day breaks the streak, not the pet. All customization is free. Biscuits are a collectible lifetime care score.

Navigation uses `?view=home`, `?view=wardrobe`, and `?view=journal`, supports direct links, browser history, reload and copied URLs. Name and outfit drafts stay in browser storage and out of URLs.

This is a device-local personal game, not a shared pet or cloud account. `corgi-days-v1` stores the pet; `corgi-days-style-v1` stores unfinished wardrobe edits. Save failures appear inline, retain in-memory work, warn on close and offer retries and downloadable backups. JSON backups can transfer a corgi and draft to another browser after validation and replacement confirmation. A corrupt save is not overwritten. Daily reset follows the timezone recorded when the corgi is created. No push notifications or background jobs are required.

## Verification

From the repository root:

- `node --test tests/corgi-days/model.test.mjs`
- Serve this repository on localhost port 8794, then `node tests/corgi-days/browser.cjs` using the existing Playwright/Chrome installation.

Tests use synthetic pets, check duplicate rewards, midnight rollover, missed-day streaks, offline decay, backup validation, desktop/mobile care, wardrobe drafts, reloads, every section's copied URL, Back/Forward and backup restoration. Screenshots go to the untracked `outputs/corgi-days-qa/` folder.
