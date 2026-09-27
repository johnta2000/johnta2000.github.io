# Personal website analytics and availability

PostHog project: https://us.posthog.com/project/630826
Owner account: johnta2018@gmail.com. US region, free plan; no billing added.

`assets/js/analytics.js` is included on every published HTML entry point listed
in `site-pages.json`. Each event includes `app` for filtering individual tools.
Tracks pageviews, pageleaves, anonymous button/link interactions and unhandled
JavaScript exceptions. Homepage links have named events. SPA query-only view
changes are not counted as new pageviews; interactions still count.

Cookieless tracking must stay enabled in PostHog's Web analytics settings.
The SDK runs only on john-ta.com / www.john-ta.com, never localhost or the
bundled native app's file origin. Session replay, profiles, form autocapture,
console capture, heatmaps and performance recording are disabled. No Clerk
identity is sent. Query strings and hashes are removed; referrers retain only
the origin. Error messages and source context are omitted; types and source
locations remain. Up to ten exceptions are sent per page load. The public
write-only project token is expected to be in client code.

To inspect traffic, open Web Analytics and filter by pathname or app. To inspect
errors, open Error Tracking. Blocking scripts or Do Not Track can suppress events.

`Personal site health` checks all entry pages plus their first-party script and
stylesheet URLs every 30 minutes in GitHub Actions (actual schedule may be delayed).
Failures make the workflow fail; GitHub notification delivery follows the owner's
Actions notification settings. This verifies public app shells and dependencies,
not authenticated backend actions, local workers, native iOS builds or browser
extensions. Existing business-specific monitoring jobs are unchanged.

Validation:
- `node --test tests/analytics.test.cjs`
- `python3 scripts/monitoring/site-health.py` (requires network and deployed files)

When adding a page, include the shared script with a static `data-app` name and
add it to `site-pages.json`. The coverage test fails for tracked HTML omissions.
