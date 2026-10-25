# Festival catalog

`festivals.json` is public reference data, checked on October 24, 2026. It is not anyone's diary or attendance history. The catalog covers completed editions from 2022 onward for EDC Las Vegas, Ultra Miami, Countdown NYE, Lost Lands, Niteharts, Tomorrowland Belgium, and Beyond Wonderland SoCal.

Each edition has stable identity, billed dates, venue, city, artist/set labels, coverage, a review date, and source links. Tomorrowland weekends are separate editions; 2022 has three. Niteharts begins in 2025. Countdown 2025 moved to the Los Angeles Convention Center; 2024 was one billed night. Dates represent billed festival days rather than camping, early entry, or the clock rolling past midnight.

## Coverage

- `archive`: the named source's roster/schedule was transcribed. This does not guarantee every actual performance or last-minute change. Official EDC schedules include art cars. Tomorrowland's community archive excludes Thursday's Gathering.
- `partial`: only the sourced performers have been entered. The UI explicitly labels these as incomplete. Lost Lands 2022–2025, Ultra 2022/2024/2025/2026, and Countdown 2022/2024 currently use partial rosters.
- Unnamed placeholders, stage hosts, and fireworks are excluded. Preserve explicit collaborations and special-set labels. Artist credits are derived separately in `lib/artists.ts`.

Use year-specific official archives where available. When they no longer exist, cite the exact community archive or contemporary announcement used, and identify it accurately. Never reuse a current-year lineup or schema date from an older page's updated site header. Do not infer annual dates from a recurring weekend pattern. Upcoming editions are deliberately outside this retrospective seed.

## Updating

Review dates, venue, weekend, set labels, and sources together. Add an edition rather than modifying a prior year's identity. Cross-check replacements against the cited schedule, keep partial coverage until the source roster has actually been entered, and update `verifiedOn` only after reviewing the evidence. The app ships this static catalog without external requests; it does not automatically refresh when a festival changes its website.

Selecting an edition changes event metadata only. Artists remain unchecked, costs remain unknown, and personal fields are preserved. Browsing never saves an entry. Reopening matches a known festival name (including short years such as “Lost Lands ’26”) or an exact Rally event ID, and dates within that edition, including single-day attendance, so no backend migration or account data rewrite is needed.

Run `npm run check:rally-collection`, `npm run test:rally-collection`, and `npm run build:rally-collection` after changes. UI tests cover search, explicit metadata replacement, empty attendance, private-field preservation, partial coverage, and recovered suggestions. Model tests validate catalog dates, source URLs, labels, unique identities, and weekend boundaries.

## Artist picker scope

A matched catalog edition supplies the artist roster, ahead of plan suggestions. Otherwise a linked entry reloads its Rally plan suggestions when opened, including on later edits. The lineup tab never mixes in artists from other diary entries. Previously saved or manually added sets outside the roster stay under Selected, clearly distinguished from lineup choices; no saved selections are silently deleted. A failed plan lookup is retryable, with the catalog still available. Linked entries can select a catalog edition with explicit confirmation of changes to their private diary metadata; the shared plan and its link are preserved.
