# The Great Snack Quest — Find Pepper

A small static keyboard adventure at `/games/snack-quest/`.

Pepsi starts alone. Dash into the meadow's crate to find the gate key, rescue gray Pepper at Pebble Pond, then keep exploring Pebble Pond together. Collect two trinkets at the pond, two in the new Gopher Garden, and two in Clover Orchard. All six trinkets plus the picnic basket are required for the ending. Snacks remain optional healing pickups. The four chapter links let the pair revisit unlocked areas for missing treasures.

## Controls and consequences

- WASD moves Pepsi. Mouse clicks, arrow keys, and touch controls do not move the player.
- Space dashes, breaks the key crate, and stuns toys for 2.3 seconds. Dash has a visible cooldown, briefly protects both corgis, and lets either one bonk an obstacle.
- Balls telegraph their charges. Cats crouch and show their pounce direction, lunge quickly, then rest. Gophers pop up on staggered, seeded schedules: shaking dirt and an exclamation mark give nearly a second of warning before they can hurt either corgi. Dash can bonk every hazard; hidden or warning gophers, resting cats, and stunned hazards are harmless. Later chapters combine more hazards.
- Start with three hearts. After rescue, both corgis have damage hitboxes and use the same four-heart pool. A hit to either costs one heart and increments the bump count. One shared 1.35-second grace period prevents an overlapping hazard (or multiple hazards) from taking two hearts at once. Snacks heal one heart, up to the maximum.
- At zero hearts, retry the current clearing. Snacks collected in this attempt return to the grass; earlier discoveries remain. Death and health persist across refreshes.
- Rescuing Pepper restores health, grants a fourth heart and three seconds of damage protection, and continues immediately at the pond with a brief toast. It never opens a modal or skips the remaining collectibles. Trinkets are permanent discoveries and survive retries. Pepper follows the player's footsteps. His hits show a hurt pose and a −1 heart above him, name him in the toast, and can trigger defeat/retry just like Pepsi’s. Hit reactions do not displace Pepper off the follow trail. Shared health and defeat remain durable in the existing save format.
- Leaving the game quietly freezes hazards and clears held keys. Returning and pressing WASD continues immediately, without an automatic pause popup, extra prompt, or history entry. Escape and the pause button still open the explicit pause screen. Physical WASD keys are supported across keyboard input methods, and the key hints light up while held.
- Start, Resume, Retry, and direct play links wait for the first WASD input before toys or damage advance. A native keyboard input receives focus, with a visible focus button and a text-input fallback for embedded browsers. Short taps are retained until the next frame. Mouse clicks and Space alone never dismiss the safe-start state.
- Escape pauses. Dialogs close with Escape, their dismissal control, or a backdrop click. Closing the retry screen returns home without reviving the player.
- A keyboard is required, including on small screens. There are no on-screen movement controls.

## Art and hosting

The corgis are original canvas drawings informed by Pepsi's plush reference: round tan-and-white Pepsi and a gray-and-white Pepper, with little paws and bead eyes. No user photograph is published. Artwork uses no downloaded sprites or game libraries. Publish the directory as-is through the existing GitHub Pages site; no build or server is required.

Both plushies tumble end over end as they move, with rotation tied to distance traveled and faster rolling during a dash. Pepper continuously follows the distance along Pepsi's path, smoothly catching up without stopping or flipping at each waypoint. Roll direction remains stable on vertical travel, and tiny gaps do not restart the upright-settling animation. Their shadows stay grounded, and they gently settle upright when stopped. Reduced-motion preferences disable the tumbling. These poses are visual only and do not change player movement, collisions, or saved progress.

## Music and sound

The Sound button enables an original, eight-bar music-box melody with soft bass and light percussion. The pond plays more gently and the orchard has a quicker rhythm. Synthesized effects distinguish snacks, dash whooshes, toy bonks, damage, the key, the basket, Pepper's reunion, and the picnic ending. No audio downloads or third-party music are used.

Sound starts off, remembers the player's choice on this device, and requires a click or key press before playback. Music pauses with the game; reunion/retry jingles finish on their cards. Switching away or muting stops all audio, including scheduled notes. Resuming uses one existing audio context and discards missed beats rather than playing a backlog.

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

Set `PLAYWRIGHT_EXECUTABLE_PATH` to use an installed browser, `SNACK_QUEST_BROWSER=webkit` for WebKit, `SNACK_QUEST_URL` for another origin, and `SNACK_QUEST_SCREENSHOTS` for the screenshot destination. Browser checks exercise WASD-only input, the protected start, native keyboard focus and text-input fallback, a real dash/crate pickup, actual hazard damage and defeat/retry, Pepper rescue, extra health, the six-trinket collection, garden progression, and basket/exit ending, navigation restoration, small-screen keyboard notices, legacy saves, failed-save recovery, and actual Web Audio output across mute, pause, focus loss, and reload. The checks also render a short `snack-quest-theme.wav` preview into the screenshot destination.

Existing version 2 saves gain an empty trinket collection and the fourth chapter while keeping their hearts, position, snacks, and discoveries. Already completed older adventures retain their ending. Old reunion URLs remain valid but continue at the pond. Snack placements in existing rooms retain their original seeds.
