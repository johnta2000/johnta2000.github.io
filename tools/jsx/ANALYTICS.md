# JSX throughput tracking

Saved PostHog report: https://us.posthog.com/project/630826/insights/3WZ0j7kj

Released October 19, 2026. Query `app = jsx` and `tracking_version = 20261019-1`. Exclude `is_test = true`. Earlier events cannot be retroactively split into booking/referral actions.

| Event | Meaning | Useful breakdown |
| --- | --- | --- |
| `$pageview` | Tool visit | device / referrer |
| `ui_interaction` | One button or link activation, including middle-click links | `control`, `placement` |
| `jsx_filter_changed` | Committed filter change; typing is debounced, with no query text captured | `filter_name`, `trip_type`, `result_count` |
| `jsx_booking_clicked` | Book link activated; may show the account prompt | `placement`: fare_table / route_map |
| `jsx_account_prompt_shown` | Account question displayed | source placement |
| `jsx_account_prompt_closed` | Prompt dismissed without choosing a link | account_dialog |
| `jsx_booking_opened` | Booking link allowed through, or Continue to JSX activated | fare_table / route_map / account_dialog |
| `jsx_referral_clicked` | Referral link activated | offer_header / guide / account_dialog |
| `jsx_map_route_selected` / `jsx_map_airport_selected` | Map explored | route_map / fare_table |

Use **total occurrences** for click volume, and **unique users** for how many visitors acted. Do not add generic clicks and named goals together: a booking/referral activation has one generic click and a separate goal event. Tool-entry links elsewhere on the site have `ui_interaction.target_tool` set to the approved public tool pathname, without query strings.

`jsx_booking_opened` measures the handoff click, not whether JSX loaded or a purchase completed. Referral clicks do not prove account creation or awarded credit. Those conversions require data from JSX. Cookieless visitors are estimates; do not add daily visitor counts and call them distinct people across days. DNT/ad blockers may suppress events.

The seven-day daily report lives in `scripts/analytics/jsx-throughput.sql`. For referral placement, count `jsx_referral_clicked`, break down by `placement`, and compare total events with unique users. For specific buttons, filter `ui_interaction` and break down by `control`.

For browser verification use `?analytics_test=1`; the flag is read before the app rewrites the URL, and every event in that document gets `is_test = true`. No visitor prompt, replay, form contents, query text, or full booking URL is collected. Events during SDK startup queue in memory (up to 50) and are discarded with the page if the SDK is blocked.
# Draft referral funnel: credit_near_fares_v1

The draft branch adds `jsx_referral_seen` when at least 50% of a referral CTA enters the viewport in a visible browser tab. Count at most once per placement per page load, including when route details re-render. Closed guide sections/dialogs are excluded; browsers without IntersectionObserver omit this event rather than invent an impression.

New placements: `fare_offer` (above filters, independent of the guide) and `selected_route` (beside a matching selected fare). Existing `guide` and `account_dialog` placements remain. The old `offer_header` link moves into `fare_offer`. New named app events include the fixed property `referral_variant=credit_near_fares_v1`; historical events and generic clicks are not retroactively assigned to the draft.

Measure distinct visitors who saw an offer → clicked a referral at that placement, alongside pageview → View on JSX → actual JSX handoff. Do not add generic `ui_interaction` clicks to named goal counts. Referral clicks still do not establish signups, completed flights, or earned credits.

Preview builds remove the shared analytics script and store events only in a bounded local page buffer. The shared tracker also permits production hostnames only. No production visitors are assigned to this draft; this is not a live A/B experiment.
