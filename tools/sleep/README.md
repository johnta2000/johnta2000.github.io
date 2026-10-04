# Daylight

Personal provider-comparison sleep dashboard for the personal website. Static HTML/CSS/JavaScript with the existing Clerk sign-in and Convex endpoints.

## Local preview

From the repository root, run `python3 -m http.server 8765 --bind 127.0.0.1`.

- `/tools/sleep/?demo=1`: deterministic fictional data, including an ephemeral check-in flow. All real API calls are blocked in demo mode.
- `/tools/sleep/?demo=empty`: the same isolated preview with no imported nights.
- `/tools/sleep/`: existing authenticated dashboard. Its backend allowlist still applies.

Run `node --test tools/sleep/tests/*.test.cjs` for calculations, import regressions, empty/error behavior, and preview isolation. Browser verification covered navigation, ranges, chart metrics, searchable pickers, keyboard check-ins, friends preview, and a 320px phone layout. No real records were changed during testing.

## Current behavior

- My data shows stacked sleep scores, time asleep, HRV, and resting heart rate across WHOOP, Eight Sleep, Apple Health, and other imports. Provider-native scores share a 0–100 axis; derived scores remain hidden. Provider measurement definitions stay distinct.
- Hover follows the same night across every chart and its detail panel. Click/tap pins a night; arrow keys on a focused chart and the previous/next buttons work without hover. Provider toggles remove that provider from charts and details. Missing observations remain gaps; isolated observations remain visible points. The detail panel shows available stage breakdowns per provider.
- The personal dashboard query also returns owner-scoped `whoopDays` in the requested dates. Synced HRV/RHR augment only WHOOP on the same date and take precedence over imported WHOOP biometrics; other sources are never overwritten. No permission or group sharing setting changes.
- Journal retains check-ins, historical tables, and the existing WHOOP sleep/alertness analysis. Connections and private groups remain available.

- Journal summaries use WHOOP sleep performance, duration, efficiency, and estimated stages. Metrics summarize the selected 7/28/90 calendar days through today in Pacific time; the latest-night card is separately dated. Missing records are not zeros. Prior-period comparisons use available observations in the immediately preceding period.
- WHOOP scores are never averaged with Apple-derived scores. Apple comparison uses only dates with duration from both sources. Health data can include multiple apps/devices, so the UI says Apple Health rather than claiming Watch-only measurements.
- Health XML ignores WHOOP-written records, merges overlapping sleep intervals, keeps sessions together across midnight, splits at gaps over three hours, and selects the longest session of at least an hour per Pacific wake date. This is a documented heuristic, not automatic device reconciliation. Exports are parsed locally before explicit import. Large XML exports are still parsed on the main thread.
- CSV/JSON imports, Eight Sleep/other history, noon check-ins, and calendar reminders remain available. Historical derived scores remain stored for compatibility but are not presented as WHOOP performance.
- Groups (`?view=groups`) now uses authenticated, per-person WHOOP summaries. Create a group, choose sharing settings, then Invite friend → Copy link. Invites expire after seven days, are single-use, and can be revoked. Owners can remove members or close a group; other members can leave. All controls are enforced by Convex.
- Joining requires a signed-in Clerk account and a valid invitation. Each participant chooses metrics and a rolling 7/28/90/180-day sharing window. No metrics are selected by default. Personal notes, credentials, and unselected fields are never returned by the group history query. Group membership authorizes viewing future members’ opted-in metrics as explained in the sharing form.
- The chart retains 7/28/90-day ranges, searchable metric selection, member toggles, exact hover/tap values, keyboard exploration, gaps, and individual baselines. Coverage and baseline availability depend on the person’s sharing window. The page refreshes authorized group reads every 30 seconds while visible. Revocation blocks subsequent reads; data someone already viewed cannot be recalled.
- Sample groups exist only in explicit demo mode. No demo API writes are permitted.
- WHOOP requests `offline read:sleep read:recovery read:cycles read:workout`. Existing connections are shown an upgrade prompt and remain sleep-only until reconnecting. Recovery, HRV, resting heart rate, completed-cycle strain, and daily workout time/count are stored in owner-scoped `whoopDays`. Group projections combine these with explicitly shared sleep fields. Imported biometrics are not used for group comparisons.
- Apple Watch is a manual Apple Health export/import today. Automatic HealthKit sync needs a separate Apple-platform integration.

## Accounts and migration

Clerk verifies sign-in; Convex enforces access. `SLEEP_ALLOWED_EMAIL` authorizes existing operators to start a group. Valid invite acceptance registers a `sleepProfiles` account, granting only that subject access to its own dashboard. Leaving a group does not remove the personal account.

`sleepNights` and `alertnessRatings` are scoped to the Clerk subject on every read and write. WHOOP connections already have individual ownership. On October 3, 2026, the sole existing WHOOP account was explicitly configured as `SLEEP_LEGACY_OWNER_SUBJECT`; the internal migration assigned its 224 nights without changing any health fields. Ownerless records are never exposed or automatically claimed by a visitor. The migration is idempotent and processes at most 500 records per table per run.

## Validation and deployment

`node --test tools/sleep/tests/*.test.cjs` includes synthetic two-account isolation, same-date import/check-in separation, invite expiration/reuse/revocation, cross-group access, field-level projections, sharing windows, removal, leaving, closing, and legacy migration. `node tools/sleep/tests/browser-harness.cjs` serves a synthetic in-memory backend on loopback port 8767 for UI checks; its owner/friend identities and health values never reach Convex. Do not publish the harness as a deployed function.

The shared Convex deployment contains unrelated applications and may differ from the local checkout. Deploy Daylight using a fresh snapshot of the live modules and schema, replacing only sleep / WHOOP modules and overlaying `sleepTables` onto the preserved schema. Check for concurrent live changes before publishing. Never deploy the entire stale local Convex checkout.

## Remaining integrations

WHOOP members authorize the same Daylight app; friends do not need developer secrets. Its current sandbox tier supports 10 WHOOP members total, separate from Daylight’s limit of 10 members per group. Increase the WHOOP app tier before a larger rollout.

Workout types and per-workout breakdowns are not yet displayed. Automatic Apple Watch syncing needs an Apple-platform HealthKit bridge; manual Apple Health XML import remains supported.

## Competition calculations

Groups offer 12 individually opt-in metrics and seven standings categories. Standings use the seven complete Pacific calendar dates before today, independent of the chart range and member visibility toggles. Sleep, recovery, consistency and strain averages require at least four observed days. Workout totals require all seven days (a finished cycle with no workouts contributes zero; missing/pending data does not). Sleep improvement is a percentage-point change; HRV improvement is relative percentage change against the person's previous seven days, with at least four days in each period and a positive baseline. Ties at one decimal use competition ranks (1, 1, 3). Raw HRV and resting heart rate are chartable but not ranked.

Recovery is matched to its sleep ID and local wake date, strain to the local cycle start date, workouts to their local start date. Ongoing cycles and calibrating recoveries are omitted. The comparison uses those local dates within Pacific-defined windows. Completed workouts spanning midnight are assigned wholly to their start date. No universal health score is calculated. Existing sharing settings are never expanded by migration.
