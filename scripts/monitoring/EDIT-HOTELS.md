# Cheapest Edit Hotels monitoring

Run `node scripts/monitoring/edit-hotels-ranking.mjs --report` every six hours.
It publishes to the existing private monitoring dashboard, using the existing
local GSC read-only service account and write-only dashboard report credential.
Neither credential belongs in this repository. The ignored `.cache/monitoring/`
directory contains sanitized API responses and the last published alert state.

The 17 explicit queries are defined in `KEYWORDS`. The primary exact query has
its own headline metrics, daily history, and US mobile/desktop split. Core,
value, broad, and Select-overlap groups must not be collapsed into that metric.
Site-aggregated query statistics and page-aggregated URL ownership are separate.
All observed nextcard URLs are retained, not only the two nominated articles.

Compare recent three finalized days with the fixed October 10–16 pre-launch
baseline. Seven-day metrics and the preceding seven-day positions are also
stored. Refresh date availability every three hours and completed responses /
URL inspection every 24 hours. Live HTTP/canonical/noindex checks run each time.
Quota errors trigger a six-hour cooldown, not retry loops. Endpoint failures
are unavailable, not zeros. No unfinalized or hourly rows are used for alerts.

Watch thresholds: at least five recent and ten baseline impressions and a
one-position decline; or at least fourteen baseline impressions and a greater
than 50% decline in disclosed impressions/day; or any Select URL observation
for a core term. Sparse overlap is a watch, never proof of causation. Fewer than
five recent primary impressions cannot produce a healthy ranking assessment.
Ranking evidence is US GSC Web Search average position, not a live SERP check.

Only acknowledge an alert fingerprint after successful dashboard publication.
The automation should notify only when `meaningful` is true, or publication
fails; unchanged watches remain quiet. Keep the automation active on failure.
The dashboard retains 60 reports and each report carries 28 daily exact-query
observations plus the fixed baseline. Preserve that baseline when updating code.

Tests: `node --test scripts/monitoring/edit-hotels-ranking.test.mjs` and the
existing monitoring suite. No production content or nextcard redirects are changed.
