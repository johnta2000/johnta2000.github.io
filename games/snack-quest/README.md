# The Great Snack Quest — Find Pepper

A small static keyboard and touch adventure at `/games/snack-quest/`.

Pepsi starts alone. Dash into the meadow's crate to find the gate key, rescue gray Pepper at Pebble Pond, then keep exploring Pebble Pond together. Collect two trinkets at the pond, two in the new Gopher Garden, and two in Whispering Woods, two in Dandelion Downs, and two in Clover Orchard. The first ten trinkets and basket open the cottage expansion; its four treasures, Pepperoni rescue, and vacuum boss lead to the ending. Each clearing has one heart-marked healing snack and two regular picnic snacks. The nine chapter links let the team revisit unlocked areas for missing treasures.

## Controls and consequences

- WASD moves Pepsi on desktop. On a landscape touch screen, a left-thumb joystick rolls in any direction, while four right-thumb buttons activate Dash, Bark, Toot, and Power independently. Mouse clicks on the world and arrow keys do not steer.
- Space performs a normal dash, breaks the key crate, and stuns enemies for 2.3 seconds. It recharges in 2.8 seconds and briefly protects the whole team. Rescuing friends unlocks separate actions: J for Pepper’s bark (5 seconds), K for Pee’s stink cloud (7 seconds), and L for Pepperoni’s power dash (8 seconds). Nothing auto-casts on Space. Each action has a clickable button, key hint, and live recharge meter above the playfield. Both dash types share their 2.8-second roll recovery so alternating Space and L cannot bypass it.
- Vacuums telegraph their charges. Cats crouch and show their pounce direction, lunge quickly, then rest. Gophers pop up on staggered, seeded schedules: shaking dirt and an exclamation mark give nearly a second of warning before they can hurt either corgi. Dash can bonk every hazard; hidden or warning gophers, resting cats, and stunned hazards are harmless. Later chapters combine more hazards.
- Start with three hearts. After rescue, both corgis have damage hitboxes and use the same four-heart pool. A hit to either costs one heart and increments the bump count. One shared 1.35-second grace period prevents an overlapping hazard (or multiple hazards) from taking two hearts at once. Only the heart-marked snack heals one heart, up to the maximum; regular snacks count toward the picnic without healing.
- At zero hearts, the current attempt’s trinkets immediately return to the clearing, including when a companion takes the fatal hit. Retry restores full hearts and returns this attempt’s snacks too. Earlier treasures, the key, basket, and rescued corgis remain. Reaching the exit banks that clearing’s trinkets, so a later failed revisit cannot remove already-earned treasure. Reloading or leaving an unfinished clearing does not bank its new trinkets. Defeat, trinket resets, and attempt checkpoints persist across refreshes and backups.
- Rescuing Pepper adds one current heart and raises capacity to four hearts and three seconds of damage protection, and continues immediately at the pond with a brief toast. It never opens a modal or skips the remaining collectibles. Pepper follows the player's footsteps. His hits show a hurt pose and a −1 heart above him, name him in the toast, and can trigger defeat/retry just like Pepsi’s. Hit reactions do not displace Pepper off the follow trail. Shared health and defeat remain durable in the existing save format.
- Leaving the game quietly freezes hazards and clears held keys. Returning and moving with WASD or the joystick continues immediately, without an automatic pause popup, extra prompt, or history entry. Escape and the pause button still open the explicit pause screen. Physical WASD keys are supported across keyboard input methods, and the key hints light up while held.
- Start, Resume, Retry, and direct play links wait for the first WASD or joystick movement before toys or damage advance. On desktop, a native keyboard input receives focus, with a visible focus button and a text-input fallback for embedded browsers. Short taps are retained until the next frame. Mouse clicks and Space alone never dismiss the safe-start state.
- Escape pauses. Dialogs close with Escape, their dismissal control, or a backdrop click. Closing the retry screen returns home without reviving the player.
- Touch devices use a full-height landscape layout, safe-area padding, a compact hearts/trinkets toolbar, and large controls outside the world. The full level remains visible without stretching the artwork. Sound and pause stay accessible; chapter links and practice are inside Pause. Portrait orientation freezes play and prompts the player to turn sideways. Rotation preserves the route and progress, clears held input, and waits for movement before hazards resume. Touch never focuses the hidden keyboard input.

## Art and hosting

The corgis are original canvas drawings informed by Pepsi's plush reference: round tan-and-white Pepsi and a gray-and-white Pepper, with little paws and bead eyes. No user photograph is published. Artwork uses no downloaded sprites or game libraries. Publish the directory as-is through the existing GitHub Pages site; no build or server is required.

Both plushies tumble end over end as they move, with rotation tied to distance traveled and faster rolling during a dash. Pepper continuously follows the distance along Pepsi's path, smoothly catching up without stopping or flipping at each waypoint. Roll direction remains stable on vertical travel, and tiny gaps do not restart the upright-settling animation. Their shadows stay grounded, and they gently settle upright when stopped. Reduced-motion preferences disable the tumbling. These poses are visual only and do not change player movement, collisions, or saved progress.

## Music and sound

The Sound button enables an original, eight-bar music-box melody with soft bass and light percussion. The pond plays more gently and the orchard has a quicker rhythm. Synthesized effects distinguish snacks, dash whooshes, toy bonks, damage, the key, the basket, Pepper's reunion, and the picnic ending. Dash impacts use a springy enemy bonk, a wooden crate crack, or a heavier boss clang—even on enemies already stunned and on the final boss hit. Contact plays once per target per dash; simultaneous impacts share one sound. No audio downloads or third-party music are used.

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

Use `SNACK_QUEST_SKIP_DESKTOP=1` to rerun only the remaining audio/mobile checks. If the host audio-output clock is stalled, `SNACK_QUEST_OFFLINE_AUDIO=1` explicitly skips live playback checks and verifies music, bark, toot, and bonk synthesis using OfflineAudioContext; this does not claim speaker playback was verified.

Set `PLAYWRIGHT_EXECUTABLE_PATH` to use an installed browser, `SNACK_QUEST_BROWSER=webkit` for WebKit, `SNACK_QUEST_URL` for another origin, and `SNACK_QUEST_SCREENSHOTS` for the screenshot destination. Browser checks exercise WASD-only input, the protected start, native keyboard focus and text-input fallback, a real dash/crate pickup, actual hazard damage and defeat/retry, Pepper rescue, extra health, the ten-trinket collection, garden progression, and basket/exit ending, navigation restoration, landscape mobile navigation and trinket resets, legacy saves, failed-save recovery, and actual Web Audio output across mute, pause, focus loss, and reload. The checks also render a short `snack-quest-theme.wav` preview into the screenshot destination.

Existing version 2 saves gain an empty trinket collection and the fourth chapter while keeping their hearts, position, snacks, and discoveries. Already completed older adventures retain their ending. Old reunion URLs remain valid but continue at the pond. Snack placements in existing rooms retain their original seeds.

The desktop playfield uses a 1200px page shell. Home, play, pause, completion, and replay share layout sizing to prevent the stage from jumping. Completed older adventures retain their ending; active saves keep their progress and can explore the two new clearings.

New adventures begin in Little Loaf Practice (`?view=play&run=ID&room=tutorial`), a safe clearing with a flower flag, practice crate, and recharge lesson. The practice crate does not grant the real key. Progress through its three exercises is saved. Skip practice enters the meadow; Practice controls reopens the same clearing. Existing adventures continue at their saved chapter.


## Pee and terrain

Pee, a butter-yellow plush, waits in the top-right of Dandelion Downs (chapter five). Collect the six distinct trinkets from Pebble Pond, Gopher Garden, and Whispering Woods, then roll up to him. The Find Pee link shows progress and links to his clearing. His optional rescue continues the level, does not heal, and keeps the four-heart team cap. He follows Pepper and has a full shared-damage hitbox for cats, vacuums, and surfaced gophers. Dash protects the whole team. Pee remains rescued through retries, navigation, refresh, and backups within that adventure; new adventures start alone. The picnic includes him if rescued. Existing saves keep their location, health, treasures, and completed ending without silently granting Pee.

Gopher Garden introduces labeled brown mud patches (roughly 55% rolling speed). Whispering Woods has pale blue ice: acceleration and braking are gradual, and grass immediately restores normal steering. Dandelion Downs has a windsock, a warning before each gust, alternating horizontal wind, and calm windows. Followers trace the leader’s route; their own muddy patches slow their catch-up. Dashing cuts through mud and wind at full speed. Clover Orchard adds a final muddy shortcut. None of these terrain types directly costs hearts. The hazard-free tutorial and meadow stay on ordinary ground.

Healing is limited to the single marked snack (stable item ID ending in `-0`) per clearing. Existing snack placements and collected IDs are unchanged. Revisiting or refreshing never respawns a consumed snack or refills hearts. Defeat retries restore full hearts and reset the snacks and trinkets collected during that clearing’s attempt. Saves from before trinket checkpoints preserve earlier rooms’ treasures; the active room’s trinkets remain at risk until its exit is reached. Completed adventures keep their treasures.


## Cottage expansion (nine chapters)

The orchard now continues to **Sock Mountain**, **Midnight Snack Kitchen**, and the **Sir Sucks-a-Lot** boss room. Find two treasures per exploration chapter (14 total); the boss room has no trinkets. After the original ten treasures and basket, the laundry opens. Bring Pee and collect its sock and bell, then approach Pepperoni’s blanket fort. Pepperoni is a rust-red spotted plush. He follows Pee, shares the same four-heart health pool, can trigger defeat when hit, and persists through navigation, retries, refresh, and backups. Rescuing him does not heal. The kitchen opens after his rescue and its two treasures unlock the boss.

Abilities are activated independently: Space uses Pepsi’s normal 0.2-second dash; J makes Pepper bark and stun hazards within 95 units of him; K makes Pee leave a 1.2-second stink cloud for pursuers; L uses Pepperoni’s 0.28-second power dash for double boss damage. Their cooldowns are 2.8, 5, 7, and 8 seconds, respectively. Normal and power dash share roll recovery, but bark and stink can be used during either dash when chosen explicitly. The permanent controls above the playfield show their keys, effects, locked states, and individual recharge bars. Cooldowns persist across room navigation and reload, freeze while paused or away, and reset on defeat retry. Old saves gain ready abilities without losing progress. Normal round machines are now brush-equipped robot vacuums, alongside the existing cats and gophers.

Sir Sucks-a-Lot has eight HP. A red line warns of each committed charge; after charging, the vacuum overheats for 3.4 seconds. Only a direct player dash during that opening deals damage, once per opening: Space deals one damage, while L deals two. Having Pepperoni alone does not strengthen a normal dash. At half health, a suction phase precedes each charge. Bark and stink do not disable the boss. Boss health and phase are saved with the run; leaving and reopening does not restore it. Defeat and retry reset the boss to full HP and the corgis to full health, retaining discoveries. The ending requires switching the vacuum off, then reaching the exit. One heart-marked snack per room, zero passive healing, and existing dash cooldown remain unchanged.

Already completed older adventures retain their earned picnic and original ten treasures; the ending offers a real link to continue into the new chapters. They do not receive Pepperoni, the four new treasures, or boss victory automatically. Unfinished saves continue from their previous location. All nine chapter URLs retain normal unlock checks.

Dash impacts linger for 1.05 seconds (1.3 seconds for the boss) with a BONK burst, directional spring recoil, squash-and-stretch, and orbiting dizzy stars with dazed eyes. Gophers duck into their holes; boss hits get a larger KA-BONK. Each enemy reacts once per dash, including enemies already stunned by Pepper’s bark. Recoil is visual only, leaves collision and saved positions unchanged, and never shakes the camera. Reduced-motion mode keeps the short hit label and static stunned pose without recoil, sparks, or orbiting motion.

## Mobile checks

Run `node tests/snack-quest/touch-browser.mjs` against the same preview for native multi-touch joystick + ability gestures, practice dash, cooldown enforcement, release/cancel, orientation changes, copied URLs and Back/Forward, modal dismissal, and layout bounds at 667×375, 740×320, 932×430, and 1024×768. Pointer capture retains steering while the thumb moves beyond the pad; lifting, cancellation, focus loss, navigation, or rotation clears it. Touch capability is retained during the session even if a browser changes its pointer media query. Gameplay still uses the same engine, health, unlocks, and durable version 2 saves as desktop.

The mobile controls sit near the bottom corners like a handheld gamepad. The larger left stick has a quiet center and proportional speed: a small nudge rolls slowly, full tilt reaches the normal speed, and diagonals stay capped. The right-hand cluster has a large Dash button and three smaller separate ability buttons. Dashing remains full strength even from a gentle tilt; keyboard speed, shared damage, and all cooldowns are unchanged.

The vacuum boss has an original eight-bar, 136 BPM battle theme: a bright minor-key lead, galloping bass, chord stabs, and little synthesized drums. It starts only in an undefeated boss fight, follows the existing Sound toggle, stops on pause/defeat/focus loss, and resumes without overlapping tracks. Winning fades the battle voices, leaves a moment for the victory jingle, then returns to the cozy 84 BPM theme. Saved boss victories, direct links, reload, and picnic views select the appropriate music. Run `node tests/snack-quest/boss-audio-browser.mjs` to verify routing and render a complete listenable battle loop with clipping checks.

Whispering Woods, Dandelion Downs, and Clover Orchard have 1600 × 992 worlds (2.56× the area) with a fixed, zoomed-out overview. Movement, corgi hitboxes, and abilities retain their normal world size. Earlier saves migrate positions once while keeping collected items and progress.

Later chapters introduce a grumpy goose: orchard, laundry, and kitchen each have one. A 1.4-second puff-up warns of an expanding honk ring; bonks, Bark, and Toot interrupt it. The ring can hit any rescued corgi, while dash immunity protects the team. After honking the goose rests for 1.8 seconds.

Area music now changes melody, harmony, and instrumentation: dreamy Woods (88 BPM), breezy Downs (108), bouncy Orchard (112), and a sneaky cottage theme (102) for laundry/kitchen. The boss retains its battle theme and victory transition. `node tests/snack-quest/area-music-browser.mjs` checks each score and generates a short preview medley.
