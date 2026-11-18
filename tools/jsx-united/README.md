# JSX Flights for United Cards

Independent copy of `/tools/jsx/` at `/tools/jsx-united/`. The Reserve tool is unchanged. Static HTML, local fonts/assets, fare snapshot, searchable filters, direct JSX booking links, and route map are retained.

The guide covers the annual direct-JSX benefit on United Explorer and Business ($100), Quest ($150), and Club and Club Business ($200). The up to $300 headline combines an eligible card’s up to $200 annual JSX credit with an eligible $100 first-flight referral, assuming sufficient qualifying spending and the full annual benefit remaining. Savings are capped by the qualifying card charge and remaining annual allowance. There is no Reserve offer activation, December deadline, or $200 minimum-charge condition. Linked issuer terms and JSX referral terms were checked November 8, 2026.

Filters, sorting, page size, page number, selected map route, expanded guide step (`guide=card-credit|referral|fares|booking`) and fare notes (`notes=1`) are URL state. Distinct navigation pushes history; continuous typing replaces the current edit. Reload, copied links and Back/Forward restore these views. Dismissal preferences use separate `jsx-united-…-v1` browser storage keys. No user records or drafts are collected.

Analytics use the shared production-only tracker with `data-app="jsx-united"` and `referral_variant=united_annual_credit_v1`. Booking/referral behavior and disclosure match the original.

`images/og-jsx.svg` is the editable United share graphic; `images/og-jsx.png` is its 1200×630 raster. Fare snapshot is dated November 8, 2026 (1,201 samples across 98 priced routes; 131 catalog routes, 33 without published fares) and is not live; past departures are hidden.

Pricing source: the supplied `jsx-fares-2026-11-08.md` export from nextcard.com/tools/jsx. All 1,201 detailed fares and the summary minima were reconciled before import. Every sample carries the supplied snapshot observation date, November 8, 2026. This remains a saved snapshot, not a live quote. The map catalog matches the export’s 131 routes. Added Bedford (BED/KBED) coordinates from [OurAirports](https://ourairports.com/airports/KBED/) and Teterboro (TEB/KTEB) coordinates from [FAA data via AirNav](https://www.airnav.com/airport/KTEB).

## Boston route update — November 16, 2026

Boston / Bedford (BED, Hanscom Field) is searchable by Boston or Bedford. The existing BED–TEB and BED–OPF catalog entries now carry announced start dates in both directions: February 8, 2027 for New York / Teterboro, and February 11, 2027 for seasonal Miami service. Blue dashed routes and start-date labels distinguish announcements from sampled fares. JSX markets New York as NYC, so Boston–Teterboro check-route links use NYC in the booking URL. The saved November 8 fare snapshot and its prices are unchanged. Source: [JSX’s homepage Boston announcement](https://www.jsx.com/), corroborated by [Boston.com](https://www.boston.com/travel/flights/2026/11/13/hop-on-public-charter-air-carrier-will-debut-in-greater-boston-in-2027/) and [Upgraded Points](https://upgradedpoints.com/news/jsx-boston-routes-first-time/).

On November 17, 2026, both tools added five Oakland–Santa Monica fare samples shown on JSX’s [Oakland fares](https://flights.jsx.com/en/flights-from-oakland), [Santa Monica arrivals](https://flights.jsx.com/en/flights-to-santa-monica), [Santa Monica departures](https://flights.jsx.com/en/flights-from-santa-monica), and [Oakland–Santa Monica route](https://flights.jsx.com/en/flights-from-oakland-to-santa-monica) pages. These rows carry their own observation date.
