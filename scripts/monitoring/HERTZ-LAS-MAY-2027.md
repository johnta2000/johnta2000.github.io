# Hertz LAS May 2027 price monitor

This is a standalone Hertz price watch, separate from `/tools/monitoring/`. The site page lives at `/hertz-las-may-2027/` and checks the read-only Hertz results for a LAS pickup on May 20, 2027 at 7:00 PM Pacific and return on May 24 at 5:00 PM Pacific. It never selects a car, submits a form, or starts a booking.

The current criteria (version 2) are 6–12 passengers inclusive, with pickups and trucks excluded. Passenger capacity comes from the rendered passenger feature in each Hertz card, with explicit `N Passenger`/`N Seat` card text as a fallback. Vehicle class and model text are both checked for the excluded pickup/truck terms.

## Data and parsing

The deterministic Playwright collector searches only visible rendered vehicle-card containers. A rate is valid only when card text contains `$N/day` or `$N` followed by `/day`, the visible capacity is between 6 and 12, and the card is not a pickup or truck. Bare currency values, filter sliders, hidden elements, page-level text, and cards without a trustworthy capacity are not candidates.

Every attempt—including failures—is prepended to the private repository source log at `.github/monitoring-data/hertz-las-may-2027-history.json`. The script then writes the same JSON to `hertz-las-may-2027/history.json`, which is the static page's deployable data source. Each new record contains the timestamp, checked URL, full itinerary, lowest valid rate, vehicle class, passenger capacity, estimated total, taxes/fees visibility, rendered evidence, status/error, duration, page metadata, and eligible-card count.

The initial 26 observations came from the reconstructed source-thread CSV and are marked `source: "reconstructed"`. They tracked the cheapest vehicle of any size, so they remain visible as `Legacy scope` in the durable log but are excluded from the version-2 chart and summary. Unknown legacy fields are `not_recorded` or `null`, never inferred.

## Manual check

```sh
npm ci
npx playwright install chromium
npm run monitor:hertz
```

For a parser-only fixture check:

```sh
npm run monitor:hertz -- --html /absolute/path/to/fixture.html --history /tmp/source.json --public-history /tmp/public.json
```

If Hertz serves only its blank application shell to automated Chromium, the run is stored as unavailable with capped console, page-error, and failed-request diagnostics; the prior successful rate remains on the page. The parser never falls back to slider values or hidden state.

## Local page

From the repository root:

```sh
python3 -m http.server 4173
```

Open `http://localhost:4173/hertz-las-may-2027/`.

## Schedule and deployment

`.github/workflows/hertz-las-may-2027-monitor.yml` runs daily at 15:27 UTC and supports manual dispatch. It tests the parser, performs the read-only check, uploads a 30-day screenshot artifact, and commits both history files even when collection fails. An unavailable Hertz page is recorded in the dashboard without failing the workflow, which avoids noisy scheduled-run alerts.

This repository deploys static files through GitHub Pages. Commit the Hertz collector, standalone page, history files, dependency lockfile, and workflow, then push `master`. No Convex deployment or monitoring-dashboard secret is required for this standalone page.

## Model recommendation

Use `gpt-5.6-sol` at high reasoning for future implementation work. Scheduled price identification should remain deterministic and model-free: visible-card scoping and explicit `/day` syntax are testable and auditable.
