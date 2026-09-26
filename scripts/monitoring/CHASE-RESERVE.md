# Exclusive Tables collector

The collector reads the public `primary-window-vars` JSON on the official market pages. It follows every `pageNumber` up to `totalRestaurantCount`, validates the returned metro and page, and requires the exact number of unique OpenTable restaurant IDs. Missing metadata, wrong metros, duplicate IDs across pages, changed totals, and failed requests invalidate the whole collection. Four workers bound request concurrency. A second independent full collection must reproduce a changed list or a new baseline before it is accepted.

Coverage is the 52 markets listed in OpenTable's official Exclusive Tables selector on September 26, 2026, including New Jersey. Two markets currently explicitly report zero restaurants; they remain covered. Some markets overlap, so the dashboard distinguishes market listings from unique restaurants. Sources are in `chase-reserve-sources.mjs`.

Collection version 2 replaces the old six-market, first-page-only baseline. The migration and future coverage expansions establish a fresh confirmed baseline without sending restaurant-addition alerts. Old change claims remain in history as unverified, with their original evidence retained; they must not be used as verified joining/leaving dates. Fetch failures always preserve the last successful baseline.

Run `node --test scripts/monitoring/chase-reserve-tables.test.mjs` for pagination, identity, incomplete data, confirmation, migration, and history-correction tests. `node scripts/monitoring/chase-reserve-tables.mjs` writes monitor data and, when configured, syncs it to Convex; production runs through the four-hour GitHub Actions workflow.
