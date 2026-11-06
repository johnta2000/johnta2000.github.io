# The Great Snack Quest — Find Pepper

A small static keyboard adventure at `/games/snack-quest/`.

Pepsi starts alone. Dash into the meadow's crate to find the gate key, rescue gray Pepper at Pebble Pond, then recover the picnic basket and get home together through the harder orchard. Each chapter has a distinct objective; collecting every snack is optional.

## Controls and consequences

- WASD moves Pepsi. Mouse clicks, arrow keys, and touch controls do not move the player.
- Space dashes, breaks the key crate, and stuns toys for 2.3 seconds. Dash has a visible cooldown and brief invulnerability.
- Toys briefly telegraph the direction of their lunge before charging. Later chapters have more toys and faster charges.
- Start with three hearts. A hit costs one heart, with a short damage grace period. Snacks heal one heart, up to the maximum.
- At zero hearts, retry the current clearing. Snacks collected in this attempt return to the grass; earlier discoveries remain. Death and health persist across refreshes.
- Rescuing Pepper restores health and grants a fourth heart. Pepper follows the player's footsteps and does not require separate escort-health management.
- Leaving the game automatically pauses it. WASD resumes a paused adventure and moves immediately. Physical WASD keys are supported across keyboard input methods, and the key hints light up while held.
- Escape pauses. Dialogs close with Escape, their dismissal control, or a backdrop click. Closing the retry screen returns home without reviving the player.
- A keyboard is required, including on small screens. There are no on-screen movement controls.

## Art and hosting

The corgis are original canvas drawings informed by Pepsi's plush reference: round tan-and-white Pepsi and a gray-and-white Pepper, with little paws and bead eyes. No user photograph is published. Artwork uses no downloaded sprites or game libraries. Publish the directory as-is through the existing GitHub Pages site; no build or server is required.

## Saving and routes

The URL keeps the adventure ID, chapter, and home/play/pause/reunion/retry/picnic view. Real chapter links, refresh, copied links, and browser Back/Forward restore the same view. Future chapters stay locked until their discoveries are made.

Personal progress saves per adventure in `localStorage`. Save failures are visible and offer retry and a downloadable JSON backup. Restore creates a separate adventure so existing work is not overwritten. A revision check prevents a stale tab from overwriting newer progress; the player can download their current state or explicitly load the other tab's save.

Version 1 saves remain untouched in their old namespace. The new game imports their snacks and completed milestones into a version 2 save. Current heart count and defeat state are durable. Progress is device-local, not a multiplayer or cross-device service. No analytics is added.

## Verification

From the repository root:

```sh
python3 -m http.server 8766 --bind 127.0.0.1
node --test tests/snack-quest/engine.test.mjs
node tests/snack-quest/browser.mjs
```

Set `PLAYWRIGHT_EXECUTABLE_PATH` to use an installed browser, `SNACK_QUEST_URL` for another origin, and `SNACK_QUEST_SCREENSHOTS` for the screenshot destination. Browser checks exercise WASD-only input, a real dash/crate pickup, actual hazard damage and defeat/retry, Pepper rescue, extra health, the basket/exit ending, navigation restoration, small-screen keyboard notices, legacy saves, and failed-save recovery.
