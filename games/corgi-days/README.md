# Corgi Days

A mobile-first, single-player daily corgi companion at `/games/corgi-days/`. Buildless HTML, CSS, JavaScript and original flat SVG cartoon artwork. Published on the existing John Ta GitHub Pages site.

Name your corgi, select four coats, five accessories with any color, and three garden backgrounds. Feed, play, wash and rest once each calendar day. Needs decay with elapsed time and never fall below 10. Each care action earns five biscuits; all four grant twenty more and extend a consecutive-day streak. Missing a day breaks the streak, not the pet. All customization is free. Biscuits are a collectible lifetime care score.

Navigation uses `?view=adopt`, `?view=home`, `?view=wardrobe`, `?view=journal`, and `?view=settings`, supports direct links, browser history, reload and copied URLs. Name and outfit drafts save privately to the account and stay out of URLs.

Sign-in is required through the existing john-ta.com Clerk instance. The standalone Corgi Days Convex service stores each player's pet, editor drafts, and music settings under their authenticated identity. Each save uses a revision check. Pending changes are cached for recovery on the same browser; on a conflict players can download them before switching to the account copy. Players with a pre-account pet can choose to import it after signing in. JSON backups are still supported.

Music is off by default. Settings offers a music-box loop and volume slider. A browser may need a tap to resume audio, and hidden tabs pause the loop.

## Verification

From the repository root:

- `node --test tests/corgi-days/model.test.mjs tests/corgi-days/setup.test.mjs`
- Serve this repository on localhost port 8794, then `node tests/corgi-days/browser.cjs` using the existing Playwright/Chrome installation.

Tests use synthetic pets, check duplicate rewards, midnight rollover, missed-day streaks, offline decay, backup validation, desktop/mobile care, wardrobe drafts, reloads, every section's copied URL, Back/Forward and backup restoration. Screenshots go to the untracked `outputs/corgi-days-qa/` folder.


## 2D corgi

The original vector illustration in `corgi-2d.mjs` uses a loaf body, tiny paws, flat colors, dot eyes, and a simple smile. Coats and accessories are recolored directly in the artwork. No photo assets, WebGL, or 3D controls are used.

Tap the corgi (or focus it and press Enter/Space) for a small hop and hearts. Feed, play, wash, and sleep show short corresponding reactions. Reduced-motion preferences disable animation. The scene is responsive down to 320px wide.

Imported pets keep their existing save format; old wardrobe drafts are migrated. Old 3D camera URLs resolve to the same section and have obsolete camera parameters removed. Legacy pose data stays in storage/backups for compatibility, but is no longer used in the interface.

Run `node tests/corgi-days/2d-browser.cjs` alongside the main browser test to verify all outfit combinations, reactions, old URLs, and existing save compatibility at phone and desktop sizes.

## Adoption and settings

New players choose a name, coat, and optional accessory at `?view=adopt`. Draft setup persists across reloads and copied tabs. Adoption records its completion date and shows a first-care prompt. Old saves without an `adopted` flag count as adopted, preserving their original creation date and all care history. Returning to adoption after completion redirects home. Existing players can rename or change coats at `?view=settings`, reached by the header gear; Wardrobe only edits accessories, their color, and the background. Editor saves apply only their own fields.

Gotcha-day anniversaries use the recorded timezone (February 29 anniversaries are observed on February 28 in non-leap years). Missed days show a gentle welcome with no catching up required.

After the first complete care day, an optional calendar reminder is offered. `?view=settings#reminders` keeps the reminder section directly linkable. The saved time generates a local-time daily `.ics` event with an alarm; players must import it into their calendar. This is not browser push. The calendar manages notifications and deletion; reimporting a replacement is explained in the UI. No reminder is enabled automatically. Backups include all unfinished drafts and accept older backup formats.
