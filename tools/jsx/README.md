# JSX Fare Finder

Standalone personal-site tool at `/tools/jsx/`. Open `index.html` directly, or serve the site root and visit `/tools/jsx/`. All scripts, styling, Nunito fonts, guide screenshots, and fare data are local; filtering needs no backend or account. The interface follows the original compact offer guide, filter toolbar, and five-column desktop fare table. Phones use the production-style fare blocks with route and price above trip type, dates, and booking. The page begins directly with the tool, without a site header.

The saved snapshot contains 1,513 fare samples across 108 routes, as of October 18, 2026. It does not refresh automatically. `fares.js` assigns `window.JSX_FARES` with `asOf`, `routeCount`, `emptyRoutes`, and a `fares` array. Each sample contains `origin`, `destination`, `originCity`, `destinationCity`, `tripType` (`one_way` or `round_trip`), `departDate`, `returnDate` (nullable), `priceUsd`, and `seenOn`. Preserve observation dates when replacing the snapshot. Past departures are hidden in the visitor's local timezone.

Route search, airport, date, price range, trip, weekend, sort, and page-size filters are stored in the URL for sharing when hosted. Booking links point directly to JSX. The referral belongs to John and was confirmed by him. No external application services, analytics, fonts, or brand assets are loaded.

The two searchable-select files are local copies of the site's shared picker, included so opening the HTML directly also works. Sync them with the shared assets if the picker changes.
