# nextcard SEO opportunity engine

The private monitoring dashboard includes **nextcard SEO opportunities**. This first version ranks research work using actual query demand and current coverage. It does not automatically commission articles, modify nextcard pages, or infer cannibalization from overlapping URLs.

## Refresh

Run with Node 22 or newer, from this directory:

```sh
node refresh.mjs
node build.mjs
node publish.mjs --report
```

Refresh reads US finalized GSC data for two adjacent 28-day windows, and the public CMS article index. Requests cache for 24 hours. A quota failure triggers a six-hour cooldown; the existing Edit monitor's cooldown is also respected. Failed refreshes preserve the last complete snapshot. No scheduled job has been created for this engine.

Build reads the local Keyword Planner exports and available draft/docket/Vercel snapshots. No Google Ads API connection or live Vercel pull is implied. `config.json`, `reviews.json`, `.cache/` and `reports/` are private and ignored by Git. The service-account key stays at its existing location, is used only to obtain a read-only Google token, and is never copied into a report.

`reports/latest.json` contains complete results and source provenance. `reports/dashboard.json` is the bounded private dashboard payload. This monitor has a 200KB report limit; other monitors retain their existing limits. The dashboard labels how many groups are shown.

## Decision rules

- Query groups use program, subject, intent and city. This is rule-based candidate discovery, not a semantic proof of identical search intent.
- Current and prior GSC query metrics use property aggregation. Query/page observations are separate and must not be summed into property totals. Fragment rows are excluded from page ownership. Query strings are preserved. Unusually long query strings are excluded from automatic clustering and counted in diagnostics.
- No disclosed observations stay null. A missing row does not establish absent demand, deindexing or zero rank.
- Keyword volumes are never summed across close variants or repeated exports. Each group shows its strongest individual keyword and the original file/row. Conflicting exports remain recorded in the local input evidence.
- Advertiser competition is never organic difficulty. Unreviewed competition remains unreviewed.
- Main queue demand threshold: at least one keyword with 100 monthly searches, or 300 disclosed GSC impressions in 28 days. These are editable working thresholds, not universal publishing rules.
- Research demand order is the larger of strongest-keyword monthly volume and current disclosed impressions scaled by 30.4/28. It is not traffic potential or an SEO difficulty score.
- Article coverage uses titles/slugs and intent. The current published inventory is live; unpublished coverage uses an old draft snapshot plus the user's docket. A body and current draft check is required before commissioning.
- An existing article earning clicks leads to a coverage review. Tool intent points to tool work. Generic Resy city intent is explicitly flagged as navigational demand.
- A matching article with at least 20 impressions at positions 4–20, or a loss of at least 10 clicks, creates a **GSC lead**, not an update assignment. Cards label algorithm-matched articles as unconfirmed and show exact-headline-query pages separately from group metrics. Stable rankings, navigation intent and tool ownership can all invalidate the apparent update opportunity.
- **Update candidate** requires a fresh review of the exact headline query, explicit `updateApproved: true`, `articleReviewed: true`, `intentFits: true`, an observed `targetUrl` matching a candidate article, sources and a concrete `angle`. The approved article appears first. A search-result check alone does not claim the article body was reviewed or a deficiency found.
- Broad opportunities outside the configured dataset categories remain in a separate discovery queue; their data advantage has not been established.
- New articles qualify for the shortlist only after a dated result review within 14 days, verified dataset access, verified coverage gap, suitable intent and difficulty below high. This prevents high-volume generic guides from being presented as easy wins.

## Review format

`reviews.json` is keyed by the `id` in the report. Each entry records `checkedAt`, `query`, `method`, `difficulty` (low/medium/high), `datasetVerified`, `coverageVerified`, `intentFits`, `angle`, `reason`, and HTTPS `sources`. Use real observations. A general web search sample must not be labeled a fixed-location Google ranking audit. Expired reviews are not used to approve new content.

## Next connections

1. Fresh draft/assignment inventory from Office to replace the September snapshot.
2. A working keyword-demand API or periodic new Planner exports to expand beyond the supplied seeds.
3. Repeatable US search-result snapshots, with domain, result format, freshness and direct-answer features.
4. Live Vercel or product conversion data to evaluate actual outcomes after publication.

These gaps are visible in the dashboard. Do not replace missing inputs with invented difficulty, volume or conversion estimates.

## Validation

```sh
node --test engine.test.mjs
node --test ../monitoring/seo.test.mjs
```

The dashboard uses the existing verified-email monitoring allowlist. No private analytics, draft titles or reports are served as public static files.
