# Event catalog

`festivals.json` is public reference data, last extended on October 25, 2026. It is not anyone's diary or attendance history. The 256 entries cover editions from 2019 onward, including confirmed upcoming editions. Alongside EDC Las Vegas, Ultra Miami, Countdown NYE, Lost Lands, Niteharts, Tomorrowland Belgium, and Beyond Wonderland SoCal, the catalog includes Wobbleland, Portola, Outside Lands, Coachella, HiJinx, Decadence Arizona, Electric Zoo, Escape Halloween, Nocturnal Wonderland, Dreamstate SoCal, HARD Summer, and Day Trip, plus the ISOxo shows described below.

Each edition has stable identity, billed dates, venue, city, artist/set labels, coverage, a review date, and source links. Tomorrowland weekends are separate editions; 2022 has three. Niteharts begins in 2025. Countdown 2025 moved to the Los Angeles Convention Center; 2024 was one billed night. Dates represent billed festival days rather than camping, early entry, or the clock rolling past midnight.

## Coverage

- `archive`: the named source's roster/schedule was transcribed. This does not guarantee every actual performance or last-minute change. Official EDC schedules include art cars. Tomorrowland's community archive excludes Thursday's Gathering.
- `partial`: only the sourced performers have been entered. The UI explicitly labels these as incomplete. Lost Lands 2022–2025, Ultra 2022/2024/2025/2026, and Countdown 2022/2024 currently use partial rosters.
- Unnamed placeholders, stage hosts, and fireworks are excluded. Preserve explicit collaborations and special-set labels. Artist credits are derived separately in `lib/artists.ts`.

Use year-specific official archives where available. When they no longer exist, cite the exact community archive or contemporary announcement used, and identify it accurately. Never reuse a current-year lineup or schema date from an older page's updated site header. Do not infer annual dates from a recurring weekend pattern. Confirmed upcoming editions are labeled in their coverage notes and save as plans, with artists unchecked. Announced lineups may change.

## October 25 expansion

60 editions across 12 additional series were added. Historical performer indexes are marked partial: they establish year-specific artists but do not always preserve special set names, support acts, or last-minute changes. The current Escape, Dreamstate, HARD Summer, Day Trip, Nocturnal, HiJinx, and Decadence Arizona rosters use their official published lineups. Explicit billed collaborations are retained where verified. Sources remain available on every entry.

- Coachella has two separate weekends per year. Only dated artists for that weekend are imported; undated archive listings are excluded. The 2023 second weekend includes the replacement closing trio, without Frank Ocean.
- Electric Zoo has 2021, 2022 and 2023 entries. The cancelled September 1, 2023 date and Friday-only artists are excluded. No confirmed 2024–2026 editions were found.
- Nocturnal Wonderland 2024 was cancelled and is excluded. Its 2022 dates and roster omit the Friday camping pre-party. Cancellation reference: https://edm.com/events/nocturnal-wonderland-festival-cancelled-southern-california-wildfires/
- Bay Area Wobbleland editions are 2022, 2024, 2025, and 2026; no verified Bay Area 2023 edition was found. The 2023 Salt Lake City event is not substituted. Venues move from San Francisco to Daly City in 2025 and San Jose in 2026.
- Day Trip covers the Long Beach flagship. Decadence covers Arizona, not Colorado. Dreamstate and HARD Summer retain their year-specific venue changes.
- Search accepts aliases such as EZoo and Outsidelands, as well as city and venue, without changing canonical event names. Reopened diary entries recognize explicit aliases within the matching edition's dates.

## Updating

Review dates, venue, weekend, set labels, and sources together. Add an edition rather than modifying a prior year's identity. Cross-check replacements against the cited schedule, keep partial coverage until the source roster has actually been entered, and update `verifiedOn` only after reviewing the evidence. The app ships this static catalog without external requests; it does not automatically refresh when a festival changes its website.

Selecting an edition changes event metadata only. Artists remain unchecked, costs remain unknown, and personal fields are preserved. Browsing never saves an entry. Reopening matches a known festival name (including short years such as “Lost Lands ’26”) or an exact Rally event ID, and dates within that edition, including single-day attendance, so no backend migration or account data rewrite is needed.

Run `npm run check:rally-collection`, `npm run test:rally-collection`, and `npm run build:rally-collection` after changes. UI tests cover search, explicit metadata replacement, empty attendance, private-field preservation, partial coverage, and recovered suggestions. Model tests validate catalog dates, source URLs, labels, unique identities, and weekend boundaries.

## Artist picker scope

A matched catalog edition supplies the artist roster, ahead of plan suggestions. Otherwise a linked entry reloads its Rally plan suggestions when opened, including on later edits. The lineup tab never mixes in artists from other diary entries. Previously saved or manually added sets outside the roster stay under Selected, clearly distinguished from lineup choices; no saved selections are silently deleted. A failed plan lookup is retryable, with the catalog still available. Linked entries can select a catalog edition with explicit confirmation of changes to their private diary metadata; the shared plan and its link are preserved.

## Individual shows

ISOxo at Cow Palace is listed separately for April 3 and April 4, 2026, using the official venue pages. These entries use `kind: "Show"`; existing records default to Festival. Only ISOxo is sourced, so coverage is partial. Artist biographies and linked current tour listings do not establish support acts for these nights. Selecting a night keeps attendance unchecked and costs unknown.


## Historical repository expansion — October 25, 2026

The shared catalog now contains 254 events. This batch adds 117 records: 24 Midway shows, 20 Bill Graham shows, and 73 festival editions, with 10,353 additional artist suggestions. None of these records represent a user's attendance. The source catalog is bundled into the diary frontend and Rally backend; publication does not import or rewrite personal entries.

New festival coverage includes Electric Forest, EDC Orlando, North Coast, ARC, Elements, Lightning in a Bottle, III Points, Movement Detroit, Dancefestopia, Forbidden Kingdom, Lollapalooza Chicago, Bonnaroo, Hulaween, Apocalypse Zombie Land, and Beyond Wonderland at the Gorge, with additional Bass Canyon years. Most new festival rosters come from year-specific historical indexes and remain `partial`: those indexes may flatten B2Bs and aliases. Do not call them complete schedules or proof that every listed set took place.

Venue rosters are bounded to the event's billed headline/support block. Do not import artists mentioned in biographies, upcoming-event footers, or other tour dates. RA event bodies and promoter ticket pages establish additional Midway dates and rosters. Separately ticketed Ophelia daytime and afterparty events stay distinct, as do multi-night residencies. Unresolved or contradictory dates are held out rather than guessed.

Reviewed exceptions:

- Beyond Wonderland Gorge 2023 contains June 17 only, excludes the June 16 pre-party and cancelled June 18 roster, and warns that some Saturday performances were interrupted.
- Bonnaroo 2025 contains June 12 only. Friday–Sunday rosters are excluded after the cancellation. Bonnaroo 2023 excludes Wednesday campground programming.
- Elements 2024 contains the Saturday–Sunday dated roster after Friday's cancellation. Friday-only and Thursday pre-party suggestions are excluded; rescheduled and renegade sets remain incomplete.
- Lightning in a Bottle ends on the last dated day of music, excluding Monday departure. Dancefestopia explicitly identifies its extended early-week music programming rather than implying that a weekend pass covered every listed day.
- Electric Forest 2024/2025 notes weather interruptions. A published lineup is always a selection aid, never an attendance record.

Event search includes venue, city aliases (including SF), ISO dates, billed artists, and support acts. For example, `Midway SF Seven Lions 2024` finds both ticketed Ophelia events, while `Bill Graham SF 2025-10 INZO` finds the October 24 Subtronics show. The selected event's roster still stays isolated from unrelated diary artists.

## EDC Las Vegas 2027 weekends

Dusk (May 14–16) and Dawn (May 21–23) are separate catalog editions with distinct identities. The full Dusk Till Dawn camping/event window is not an attendance default. Each weekend has an empty, explicitly unverified roster until that weekend’s lineup is sourced; no older roster is reused. The existing EDC 2027 crew explicitly chose Dawn; its shared name, dates, and catalog identity were corrected by the guarded, idempotent `rallyEdc2027.selectDawn` internal migration. Crew, bookings, and personal experience fields remain intact.

## Existing diary editions

The master picker disables editions already present in the signed-in user's diary, including automatic Rally entries and recognized legacy records. Disabled choices remain searchable with “Already in your diary” so users can see why they are unavailable. Editing an entry excludes that entry from the unavailable set; other years and weekends retain separate identities. The backend also rejects new personal duplicates and changes into an occupied edition, including imports and stale forms. Existing legacy duplicates are not deleted, and their personal details remain editable.
