# The Great Snack Quest — Find Pepper

A small static keyboard adventure at `/games/snack-quest/`.

Pepsi starts alone. Dash into the meadow's crate to find the gate key, rescue gray Pepper at Pebble Pond, then keep exploring Pebble Pond together. Collect two trinkets at the pond, two in the new Gopher Garden, and two in Whispering Woods, two in Dandelion Downs, and two in Clover Orchard. The first ten trinkets and basket open the cottage expansion; its four treasures, Pepperoni rescue, and vacuum boss lead to the ending. Each clearing has one heart-marked healing snack and two regular picnic snacks. The nine chapter links let the team revisit unlocked areas for missing treasures.

## Controls and consequences

- WASD moves Pepsi. Mouse clicks, arrow keys, and touch controls do not move the player.
- Space dashes, breaks the key crate, and stuns toys for 2.3 seconds. Dash has a visible 2.8-second cooldown, briefly protects both corgis, and lets either one bonk an obstacle.
- Vacuums telegraph their charges. Cats crouch and show their pounce direction, lunge quickly, then rest. Gophers pop up on staggered, seeded schedules: shaking dirt and an exclamation mark give nearly a second of warning before they can hurt either corgi. Dash can bonk every hazard; hidden or warning gophers, resting cats, and stunned hazards are harmless. Later chapters combine more hazards.
- Start with three hearts. After rescue, both corgis have damage hitboxes and use the same four-heart pool. A hit to either costs one heart and increments the bump count. One shared 1.35-second grace period prevents an overlapping hazard (or multiple hazards) from taking two hearts at once. Only the heart-marked snack heals one heart, up to the maximum; regular snacks count toward the picnic without healing.
- At zero hearts, retry the current clearing. Snacks collected in this attempt return to the grass; earlier discoveries remain. Death and health persist across refreshes.
- Rescuing Pepper adds one current heart and raises capacity to four hearts and three seconds of damage protection, and continues immediately at the pond with a brief toast. It never opens a modal or skips the remaining collectibles. Trinkets are permanent discoveries and survive retries. Pepper follows the player's footsteps. His hits show a hurt pose and a −1 heart above him, name him in the toast, and can trigger defeat/retry just like Pepsi’s. Hit reactions do not displace Pepper off the follow trail. Shared health and defeat remain durable in the existing save format.
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

Set `PLAYWRIGHT_EXECUTABLE_PATH` to use an installed browser, `SNACK_QUEST_BROWSER=webkit` for WebKit, `SNACK_QUEST_URL` for another origin, and `SNACK_QUEST_SCREENSHOTS` for the screenshot destination. Browser checks exercise WASD-only input, the protected start, native keyboard focus and text-input fallback, a real dash/crate pickup, actual hazard damage and defeat/retry, Pepper rescue, extra health, the ten-trinket collection, garden progression, and basket/exit ending, navigation restoration, small-screen keyboard notices, legacy saves, failed-save recovery, and actual Web Audio output across mute, pause, focus loss, and reload. The checks also render a short `snack-quest-theme.wav` preview into the screenshot destination.

Existing version 2 saves gain an empty trinket collection and the fourth chapter while keeping their hearts, position, snacks, and discoveries. Already completed older adventures retain their ending. Old reunion URLs remain valid but continue at the pond. Snack placements in existing rooms retain their original seeds.

The desktop playfield uses a 1200px page shell. Home, play, pause, completion, and replay share layout sizing to prevent the stage from jumping. Completed older adventures retain their ending; active saves keep their progress and can explore the two new clearings.

New adventures begin in Little Loaf Practice (`?view=play&run=ID&room=tutorial`), a safe clearing with a flower flag, practice crate, and recharge lesson. The practice crate does not grant the real key. Progress through its three exercises is saved. Skip practice enters the meadow; Practice controls reopens the same clearing. Existing adventures continue at their saved chapter.


## Pee and terrain

Pee, a butter-yellow plush, waits in the top-right of Dandelion Downs (chapter five). Collect the six distinct trinkets from Pebble Pond, Gopher Garden, and Whispering Woods, then roll up to him. The Find Pee link shows progress and links to his clearing. His optional rescue continues the level, does not heal, and keeps the four-heart team cap. He follows Pepper and has a full shared-damage hitbox for cats, vacuums, and surfaced gophers. Dash protects the whole team. Pee remains rescued through retries, navigation, refresh, and backups within that adventure; new adventures start alone. The picnic includes him if rescued. Existing saves keep their location, health, treasures, and completed ending without silently granting Pee.

Gopher Garden introduces labeled brown mud patches (roughly 55% rolling speed). Whispering Woods has pale blue ice: acceleration and braking are gradual, and grass immediately restores normal steering. Dandelion Downs has a windsock, a warning before each gust, alternating horizontal wind, and calm windows. Followers trace the leader’s route; their own muddy patches slow their catch-up. Dashing cuts through mud and wind at full speed. Clover Orchard adds a final muddy shortcut. None of these terrain types directly costs hearts. The hazard-free tutorial and meadow stay on ordinary ground.

Healing is limited to the single marked snack (stable item ID ending in `-0`) per clearing. Existing snack placements and collected IDs are unchanged. Revisiting or refreshing never respawns a consumed snack or refills hearts. Defeat retries still restore full hearts and reset only the snacks collected during that clearing’s attempt.


## Cottage expansion (nine chapters)

The orchard now continues to **Sock Mountain**, **Midnight Snack Kitchen**, and the **Sir Sucks-a-Lot** boss room. Find two treasures per exploration chapter (14 total); the boss room has no trinkets. After the original ten treasures and basket, the laundry opens. Bring Pee and collect its sock and bell, then approach Pepperoni’s blanket fort. Pepperoni is a rust-red spotted plush. He follows Pee, shares the same four-heart health pool, can trigger defeat when hit, and persists through navigation, retries, refresh, and backups. Rescuing him does not heal. The kitchen opens after his rescue and its two treasures unlock the boss.

All abilities use Space and the same 2.8-second cooldown: Pepsi breaks crates with a dash; Pepper adds a short bark that stuns hazards within 95 units of him; Pee leaves a 1.2-second stink cloud that catches pursuers; Pepperoni extends dash duration from 0.2 to 0.28 seconds and doubles boss damage. A permanent team ability strip explains each unlock. Normal round machines are now brush-equipped robot vacuums, alongside the existing cats and gophers.

Sir Sucks-a-Lot has eight HP. A red line warns of each committed charge; after charging, the vacuum overheats for 3.4 seconds. Only a direct player dash during that opening deals damage (two with Pepperoni), once per opening. At half health, a suction phase precedes each charge. Bark and stink do not disable the boss. Boss health and phase are saved with the run; leaving and reopening does not restore it. Defeat and retry reset the boss to full HP and the corgis to full health, retaining discoveries. The ending requires switching the vacuum off, then reaching the exit. One heart-marked snack per room, zero passive healing, and existing dash cooldown remain unchanged.

Already completed older adventures retain their earned picnic and original ten treasures; the ending offers a real link to continue into the new chapters. They do not receive Pepperoni, the four new treasures, or boss victory automatically. Unfinished saves continue from their previous location. All nine chapter URLs retain normal unlock checks.

Dash impacts have a brief BONK burst, directional spring recoil, squash-and-stretch, and orbiting dizzy stars with dazed eyes. Gophers duck into their holes; boss hits get a larger KA-BONK. Each enemy reacts once per dash, including enemies already stunned by Pepper’s bark. Recoil is visual only, leaves collision and saved positions unchanged, and never shakes the camera. Reduced-motion mode keeps the short hit label and static stunned pose without recoil, sparks, or orbiting motion.
