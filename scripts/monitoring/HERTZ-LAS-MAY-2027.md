# Hertz LAS May 2027 price monitor

The standalone page is /hertz-las-may-2027/. It tracks LAS pickup May 20, 2027 at 7 PM Pacific through May 24 at 5 PM Pacific, CDP 2278478, age 25. Accept only vehicles with 6–12 rendered passenger seats and exclude pickups/trucks. No vehicle selection, form submission on Hertz, or booking.

## Refresh architecture (October 3 repair)

The previous GitHub headless Chromium collector received a blank Hertz application and failed every daily check after September 6. The regular in-app browser successfully renders the search. The existing local scheduled task now performs daily browser checks at 9 AM Pacific, then hands the exact rendered evidence to the deterministic importer. The local computer must be on and the app running. A human verification challenge requires attention; never invent prices or silently report success.

The browser orchestrator uses a current configured Codex model to navigate and run the capture expression. All prices, capacity rules, history updates, and publication are processed by scripts. A model does not choose or transcribe prices.

GitHub Actions now runs a read-only health watchdog at 15:27 UTC. It fails visibly when the latest attempt failed or the last verified price is over 36 hours old. It never claims a headless scrape succeeded. The page uses the same freshness rule, refreshes its data every five minutes and when refocused, and keeps old prices clearly dated.

## Run the working browser check

1. Use the supported in-app browser tool to open the bookingUrl in history.json, in a fresh tab or with an intentional reload. Wait for the visible vehicle results. Dismiss the cookie notice if needed. Do not submit any Hertz forms or select a vehicle.
2. Read scripts/monitoring/hertz-browser-snapshot.js and evaluate that complete expression with the browser tool's read-only page evaluator. Keep its exact returned object in a browser-tool variable. Verify the rendered itinerary. The expression reads visible vehicle headings, features and price blocks; it never reads hidden application state or filter values. If still loading, allow up to 60 seconds and try one normal reload. If blocked, capture the failed page too and report the blocker.
3. Start the local handoff server in a terminal: `node scripts/monitoring/hertz-capture-server.mjs /tmp/hertz-UNIQUE-snapshot.json`. Use a unique filename each run. Open http://127.0.0.1:4187/ with the browser tool, paste JSON.stringify(theSnapshot) into the labeled textarea and click Save snapshot. This loopback-only, same-origin form writes the exact JSON without manual transcription. If validation fails, it still saves evidence so the attempt can be logged.
4. Run `node scripts/monitoring/hertz-publish.mjs /tmp/hertz-UNIQUE-snapshot.json`. The publisher fetches origin/master into a temporary worktree, preserves every historical run, imports the snapshot, commits only the three history files, and pushes master. It retries concurrent branch updates up to three times. Duplicate successful capture IDs are idempotent. Invalid evidence is stored as an error and never accepted as a price.
5. Wait for GitHub Pages to deploy. Read the public history.json with a cache-busting query and verify the new timestamp/status. A successful push alone is not proof of a refreshed site. Close the local handoff tab and stop its server.

Manual import without publishing: `node scripts/monitoring/hertz-las-may-2027.mjs --snapshot /absolute/snapshot.json`. To isolate output in tests, supply all three paths: --history, --public-history, --public-csv.

If browser access itself fails before capture, create a schemaVersion 1 snapshot with the current capturedAt, exact bookingUrl as checkedUrl, empty cards, resultCount null, empty itineraryText, and pageEvidence describing the actual failure. Publish it through the same command and report the failure. Do not alter any successful historical record.

## Persistence and validation

- .github/monitoring-data/hertz-las-may-2027-history.json: repository source log.
- hertz-las-may-2027/history.json: public page data, including the full raw rendered snapshot on new successful browser checks and all eligible vehicle rates.
- hertz-las-may-2027/history.csv: one summary row per attempt.

Every attempt is retained. Successful browser imports require the exact URL itinerary and discount parameters, matching rendered dates/times, a capture under two hours old, complete result count when visible, unique vehicle IDs, and explicit dollar-per-day text inside the rendered pricing block. Prices are parsed from that text, never trusted from a model-produced numeric field. Estimated totals are taken from displayed totals; tax inclusion remains unknown unless displayed.

The 26 reconstructed June–September observations remain the gray all-vehicle history; family-vehicle observations are a separate yellow series. They must never be discarded or reclassified.

## Tests and deployment

Run `node --test scripts/monitoring/hertz-*.test.mjs`. The tests cover evidence validation, filters, totals, complete history preservation, duplicate imports, failed imports, missed schedules and stale data.

This site deploys through GitHub Pages from master. Use a clean checkout of current origin/master for code deployment; the normal working tree may contain unrelated edits. No Convex changes or new credentials are required.

The old Playwright collector remains available for diagnostics, but is not the scheduled data source.
