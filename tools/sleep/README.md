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
- Groups (`?view=groups`) is an interactive, clearly labeled fictional preview: multi-person WHOOP history, 7/28/90-day windows, searchable metric selection, member toggles, exact-night slider, gaps for missing records, and per-person prior-period comparisons with coverage. It never reads personal sleep records. No invitations, sharing grants, or friend API requests exist yet.
- Planned onboarding: expiring group invitation → verified email sign-in → individual WHOOP OAuth → explicit metrics and history-window selection → join. Leaving or revoking access must remove future group reads; personal notes must never enter group responses.
- WHOOP currently requests `offline read:sleep`; recovery, strain, HRV from the recovery endpoint, and workouts are not yet synced. Imported HRV fields remain preserved.
- Apple Watch is a manual Apple Health export/import today. Automatic HealthKit sync needs a separate Apple-platform integration.

## Next implementation phase

Do not add friends to `SLEEP_ALLOWED_EMAIL` with the current storage model. `sleepNights` is keyed globally by source/date and `alertnessRatings` by date; authorized viewers currently share this personal dataset. WHOOP connections are already keyed by Clerk subject, but sleep imports are not.

1. Introduce explicit per-person ownership and subject/date/source indexes for nights and check-ins. Bind WHOOP writes and all reads/mutations to the signed-in subject. Migrate legacy records to an explicitly verified owner; never infer ownership from the first visitor. Test separation between two synthetic identities before adding any accounts.
2. Add WHOOP recovery/cycle/workout scopes and source-specific records, handling reauthorization, pending scores, pagination, time zones, and missing data.
3. Implement private circles with expiring invites, membership, explicit metric-level sharing, and revocation enforced by the backend. Connecting WHOOP alone must not share data. Return only authorized summary metrics, never tokens or private notes. Compare each participant with their own baseline and show coverage.
4. Add an Apple-platform HealthKit bridge if automatic Watch syncing is worth the extra app infrastructure.

WHOOP members should each authorize the same Daylight app through OAuth. They do not need to give Daylight their developer client secrets. WHOOP's published sandbox tier currently allows 10 members; verify the actual application tier in its developer dashboard before rollout.

References, checked October 3, 2026: [WHOOP OAuth](https://developer.whoop.com/docs/developing/oauth/), [WHOOP app tiers](https://developer.whoop.com/docs/developing/app-approval/), [Apple HealthKit](https://developer.apple.com/documentation/healthkit).

This frontend pass does not modify or deploy the shared Convex backend. The checkout contains unrelated pending backend/site changes; avoid deploying the entire checkout as part of a frontend publish.
