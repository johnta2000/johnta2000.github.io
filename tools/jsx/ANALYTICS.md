# JSX throughput tracking

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
| `jsx_map_route_selected` / `jsx_map_airport_selected` | Map explored | route_map |

Use **total occurrences** for click volume, and **unique users** for how many visitors acted. Do not add generic clicks and named goals together: a booking/referral activation has one generic click and a separate goal event. Tool-entry links elsewhere on the site have `ui_interaction.target_tool` set to the approved public tool pathname, without query strings.

`jsx_booking_opened` measures the handoff click, not whether JSX loaded or a purchase completed. Referral clicks do not prove account creation or awarded credit. Those conversions require data from JSX. Cookieless visitors are estimates; do not add daily visitor counts and call them distinct people across days. DNT/ad blockers may suppress events.

The seven-day daily report lives in `scripts/analytics/jsx-throughput.sql`. For referral placement, count `jsx_referral_clicked`, break down by `placement`, and compare total events with unique users. For specific buttons, filter `ui_interaction` and break down by `control`.

For browser verification use `?analytics_test=1`; the flag is read before the app rewrites the URL, and every event in that document gets `is_test = true`. No visitor prompt, replay, form contents, query text, or full booking URL is collected. Events during SDK startup queue in memory (up to 50) and are discarded with the page if the SDK is blocked.
