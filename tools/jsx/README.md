# JSX Fare Finder

Standalone personal-site tool at `/tools/jsx/`. Open `index.html` directly, or serve the site root and visit `/tools/jsx/`. All scripts, styling, Nunito fonts, guide screenshots, and fare data are local; filtering needs no backend or account. The interface follows the original compact offer guide, filter toolbar, and five-column desktop fare table. Phones use the production-style fare blocks with route and price above trip type, dates, and booking. The page begins directly with the tool, without a site header.

The saved snapshot contains 1,513 fare samples across 108 routes, as of October 18, 2026. It does not refresh automatically. `fares.js` assigns `window.JSX_FARES` with `asOf`, `routeCount`, `emptyRoutes`, and a `fares` array. Each sample contains `origin`, `destination`, `originCity`, `destinationCity`, `tripType` (`one_way` or `round_trip`), `departDate`, `returnDate` (nullable), `priceUsd`, and `seenOn`. Preserve observation dates when replacing the snapshot. Past departures are hidden in the visitor's local timezone.

Route search, airport, date, price range, trip, weekend, sort, and page-size filters are stored in the URL for sharing when hosted. Booking links point directly to JSX. The referral belongs to John and was confirmed by him. Production visits load the shared anonymous PostHog tracking script with `data-app="jsx"`. Local/file use never sends analytics. Fonts, fare data, and guide assets remain local.

The two searchable-select files are local copies of the site's shared picker, included so opening the HTML directly also works. Sync them with the shared assets if the picker changes.

## Share previews and favicon

`favicon.svg` uses the JSX wordmark, with PNG browser and Apple touch fallbacks. `images/og-jsx.svg` is the editable 1200×630 share graphic; `images/og-jsx.png` is the published Facebook/Open Graph and Twitter preview. The HTML contains absolute image URLs, dimensions, MIME type, and alt text. JSX wordmark source: https://commons.wikimedia.org/wiki/File:Logo_of_JSX.svg (public-domain text logo).

The first plain `Book on JSX` click opens the account check. Referral signup opens John's referral; continue opens the selected fare, including its return date. The prompt is remembered in browser local storage (`jsx-account-prompt-seen-v1`), with an in-memory fallback when storage is blocked. Escape, close, and backdrop dismiss it and return focus to the booking link. Modified clicks retain standard browser behavior.

PostHog usage: https://us.posthog.com/project/630826 — filter by `app = jsx` or pathname `/tools/jsx/`. Tracks pageviews, pageleaves, anonymous interactions, and unhandled exceptions under the shared privacy settings. Tracking starts with this deployment; older visits are not backfilled.

The offer guide has a close button and a `Show guide` restore action. Dismissal is remembered on the current browser (`jsx-guide-hidden-v1`); reopening clears that preference. Storage failures still allow hide/show within the current visit.
