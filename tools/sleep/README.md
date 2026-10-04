# Daylight

WHOOP-first sleep dashboard for the personal website. Static HTML/CSS/JavaScript with the existing Clerk sign-in and Convex endpoints.

## Local preview

From the repository root, run `python3 -m http.server 8765 --bind 127.0.0.1`.

- `/tools/sleep/?demo=1`: deterministic fictional data, including an ephemeral check-in flow. All real API calls are blocked in demo mode.
- `/tools/sleep/?demo=empty`: the same isolated preview with no imported nights.
- `/tools/sleep/`: existing authenticated dashboard. Its backend allowlist still applies.

Run `node --test tools/sleep/tests/*.test.cjs` for calculations, import regressions, empty/error behavior, and preview isolation. Browser verification covered navigation, ranges, chart metrics, searchable pickers, keyboard check-ins, friends preview, and a 320px phone layout. No real records were changed during testing.

## Current behavior

- Overview and trends use WHOOP sleep performance, duration, efficiency, and estimated stages. Metrics summarize the selected 7/28/90 calendar days through today in Pacific time; the latest-night card is separately dated. Missing records are not zeros. Prior-period comparisons use available observations in the immediately preceding period.
- WHOOP scores are never averaged with Apple-derived scores. Apple comparison uses only dates with duration from both sources. Health data can include multiple apps/devices, so the UI says Apple Health rather than claiming Watch-only measurements.
- Health XML ignores WHOOP-written records, merges overlapping sleep intervals, keeps sessions together across midnight, splits at gaps over three hours, and selects the longest session of at least an hour per Pacific wake date. This is a documented heuristic, not automatic device reconciliation. Exports are parsed locally before explicit import. Large XML exports are still parsed on the main thread.
- CSV/JSON imports, Eight Sleep/other history, noon check-ins, and calendar reminders remain available. Historical derived scores remain stored for compatibility but are not presented as WHOOP performance.
- Groups (`?view=groups`) now uses authenticated, per-person WHOOP summaries. Create a group, choose sharing settings, then Invite friend → Copy link. Invites expire after seven days, are single-use, and can be revoked. Owners can remove members or close a group; other members can leave. All controls are enforced by Convex.
- Joining requires a signed-in Clerk account and a valid invitation. Each participant chooses metrics and a rolling 7/28/90/180-day sharing window. No metrics are selected by default. Personal notes, credentials, HRV, and other unselected fields are never returned by the group history query. Group membership authorizes viewing future members’ opted-in metrics as explained in the sharing form.
- The chart retains 7/28/90-day ranges, searchable metric selection, member toggles, exact hover/tap values, keyboard exploration, gaps, and individual baselines. Coverage and baseline availability depend on the person’s sharing window. The page refreshes authorized group reads every 30 seconds while visible. Revocation blocks subsequent reads; data someone already viewed cannot be recalled.
- Sample groups exist only in explicit demo mode. No demo API writes are permitted.
- WHOOP currently requests `offline read:sleep`; recovery, strain, HRV from the recovery endpoint, and workouts are not yet synced. Imported HRV fields remain preserved.
- Apple Watch is a manual Apple Health export/import today. Automatic HealthKit sync needs a separate Apple-platform integration.

## Accounts and migration

Clerk verifies sign-in; Convex enforces access. `SLEEP_ALLOWED_EMAIL` authorizes existing operators to start a group. Valid invite acceptance registers a `sleepProfiles` account, granting only that subject access to its own dashboard. Leaving a group does not remove the personal account.

`sleepNights` and `alertnessRatings` are scoped to the Clerk subject on every read and write. WHOOP connections already have individual ownership. On October 3, 2026, the sole existing WHOOP account was explicitly configured as `SLEEP_LEGACY_OWNER_SUBJECT`; the internal migration assigned its 224 nights without changing any health fields. Ownerless records are never exposed or automatically claimed by a visitor. The migration is idempotent and processes at most 500 records per table per run.

## Validation and deployment

`node --test tools/sleep/tests/*.test.cjs` includes synthetic two-account isolation, same-date import/check-in separation, invite expiration/reuse/revocation, cross-group access, field-level projections, sharing windows, removal, leaving, closing, and legacy migration. `node tools/sleep/tests/browser-harness.cjs` serves a synthetic in-memory backend on loopback port 8767 for UI checks; its owner/friend identities and health values never reach Convex. Do not publish the harness as a deployed function.

The shared Convex deployment contains unrelated applications and may differ from the local checkout. Deploy Daylight using a fresh snapshot of the live modules and schema, replacing only sleep / WHOOP modules and overlaying `sleepTables` onto the preserved schema. Check for concurrent live changes before publishing. Never deploy the entire stale local Convex checkout.

## Remaining integrations

WHOOP members authorize the same Daylight app; friends do not need developer secrets. Its current sandbox tier supports 10 WHOOP members total, separate from Daylight’s limit of 10 members per group. Increase the WHOOP app tier before a larger rollout.

Recovery, strain, and workouts need additional WHOOP scopes and records. Automatic Apple Watch syncing needs an Apple-platform HealthKit bridge; manual Apple Health XML import remains supported.
