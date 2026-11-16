# Garmin integration — implementation status, November 14, 2026

The Personal API backend is deployed and enabled for invited members as of November 14, 2026. The Connections page provides self-service setup using each member's own Garmin Personal API key. No real Garmin account has been connected or tested. No account application, terms acceptance, key creation, or paid service was performed.

## Current capability

- `garmin:syncPersonal`: authenticated invited-member setup and manual sync. Initial sync retrieves 28 days; subsequent complete syncs default to 7. Incomplete syncs retry their original 28/90-day window. The action accepts 7/28/90 for explicit backfills.
- `garminClient.ts`: exchanges a Personal API key for a temporary bearer token, fetches sleep and HRV summaries in windows of at most 31 days, and fetches daily resting heart rate. Headers carry credentials; fixed official hosts and disabled redirects prevent forwarding credentials elsewhere. Authentication rejection still aborts without writes. Independent data requests can save partial readings with explicit warnings. Network failures and 502/503/504 retry once within a 60-second request budget; daily resting-heart-rate requests use two workers and stop on a failed request. No scheduled polling yet.
- AES-256-GCM encrypted keys, with the owner subject bound as authenticated data; tokens stay in memory. A separate random 32-byte server encryption key is required. Public status never exposes secrets. Revision checking prevents stale sync results from restoring a disconnected or replaced connection.
- Private `garminNights` records merge into the authenticated personal dashboard. They never enter WHOOP group sharing or standings. Repeated sync replaces only the same owner's Garmin/date records. Disconnect removes the stored credential and retains imported history; revocation in Garmin itself is separate.
- Connections has a password field, manual sync and disconnect controls. The key is cleared after success, retained on failed submission, and never saved to browser storage or URLs. Connections is directly accessible at `?view=connections`.
- My data adds Garmin when actual Garmin records exist. Sleep scores retain the native 0–100 meaning; missing scores are absent, not duration-derived scores or zero. Minutes are displayed as hours/minutes. Main sleep excludes naps. Calendar dates come from Garmin, and GMT timestamps are explicitly UTC. HRV uses `lastNightAvg`, never the weekly average. Garmin's v2 batch `heartRate.restingValue` can mean absolute minimum, so this connector uses the daily summary's explicitly named `restingHeartRate`. Body Battery, stress, and training readiness are not mapped to WHOOP recovery/strain. Unclassified sleep remains unclassified.

## Deployment and verification notes

1. The first Garmin user is John's girlfriend, an invited group member. She must use her own Daylight login and Garmin key. Invited members are allowed by the connector; uninvited accounts remain blocked. No existing user's connection or sharing preferences were changed. Group Garmin support is still pending: the current group projection and chart model deliberately accept WHOOP only. Implement explicit provider selection, source labeling, metric opt-in and provider-appropriate comparisons before enabling group Garmin sharing. Shared OAuth onboarding is separate and not implemented.
2. The account holder creates a Personal API key in Garmin Connect and reviews/accepts Garmin's terms. Do not paste the key into chat, source files, URLs, or CLI arguments.
3. Validate one real account against the official Personal API: overall sleep score component, empty HRV responses, device-specific missing values, timezone transitions and resting-heart-rate semantics. The public schema identifies `sleepScores` as a component map; `overall` still needs real-device confirmation. Transport tests use synthetic responses, not proof of successful live authorization.
4. Generate `GARMIN_TOKEN_ENCRYPTION_KEY` as 32 random bytes encoded in base64, store only as a Convex environment secret, and set `GARMIN_PERSONAL_ENABLED=true` to expose the self-service connection. Keep the encryption key stable; rotation needs re-encryption of stored keys. Do not reuse WHOOP's client secret.
5. Deploy from a fresh live Convex snapshot, adding Garmin tables/modules and patching only the dashboard query. Preserve the live schema, WHOOP modules, crons, auth and all unrelated apps. Never deploy this entire dirty checkout. Publish only reviewed frontend changes, with cache versions bumped. The privacy page includes Garmin collection, encrypted key storage, manual sync, disconnection, and private dashboard scope.
6. Verify direct URL, authenticated redirect, refresh, Back/Forward, phone layout, sync failures, account isolation, and disconnect in the enabled environment. Test fixtures must never be sent to production.

Garmin keys expire according to the period chosen by the account holder (30/90/180 days or a year); access tokens last up to 24 hours or key expiry. This version obtains a new temporary token on each manual sync and does not store refresh tokens. Revoked/expired keys produce an actionable error; reconnect with a replacement key after disconnecting.

## Shared developer-program connection

Garmin now documents Starter access as well as Enterprise access. Request the appropriate Health/Activity capabilities for Daylight's actual private-group use. Before implementing callbacks, obtain the program-specific data/delivery documentation and verify the permission/revocation contract. OAuth uses PKCE S256 and a server-side code exchange; use one-time, expiring, user-bound state and an allowlisted return destination. Do not assume the Personal API endpoints are the business Health API endpoints. Group sharing must be explicitly opt-in and source-labeled; don't silently replace WHOOP metrics with Garmin values.

Workouts, continuous heart-rate charts, automatic refresh, native iOS Garmin UI, and multi-user OAuth are future work. The Personal API schema advertises activity and daily heart-rate endpoints, but this initial connector does not ingest them.

## Primary references checked November 14, 2026

- https://developer.garmin.com/gc-developer-program/personal/personal-api/
- https://developer.garmin.com/gc-developer-program/personal/personal-faq/
- https://developer.garmin.com/gc-developer-program/personal/swagger-docs/
- https://developer.garmin.com/gc-developer-program/enterprise/program-faq/
- https://developerportal.garmin.com/sites/default/files/OAuth2PKCE_1.pdf

The public Swagger page embeds OpenAPI 3.0.1, Garmin Connect Personal API version 1.0.0. Its schema was inspected for the endpoint/field mappings above. Raw provider payloads and credentials must never be committed.

Validation: `node --test tools/sleep/tests/*.test.cjs` covers mappings, missing values, date limits, authorization, encryption tampering, owner isolation, idempotence, stale writes after disconnect, and existing WHOOP regressions. Browser checks use a synthetic loopback-only backend.

Release verification: 70 automated tests passed; desktop and 390px mobile onboarding, direct Connections link, refresh and Back/Forward checked. Real Garmin authorization and payload verification still require the account holder to submit her own key. No test health records were written to the live backend.

Reliability update: successful-stream coverage determines which fields may be replaced. A failed stream preserves prior measurements; a successful empty response clears only that stream. Connection status persists warnings and distinguishes complete/incomplete syncs. An accepted token can be saved encrypted even when subsequent data requests fail, so retry does not require recopying the key. Expired/rejected token responses never become partial success. Documentation verifies endpoint support, not Jessi’s actual authorization or device coverage. No live Garmin account has yet been verified by this work.


## Authorization format correction — November 15, 2026

Garmin's official Python authenticator sends `Accept: */*` and reads the token endpoint as a plain-text JWT. Daylight previously requested and parsed JSON for every endpoint, including authorization; that was an incorrect assumption. Authorization now follows the official text contract, trims surrounding whitespace, validates the bearer token format, and keeps JSON parsing only for data endpoints. Failed response bodies and tokens are never exposed in errors.

Reference: https://github.com/garmin/connect-personal-api-python/blob/main/src/garmin_personal_api/auth.py

The screenshot's authorization HTTP 406 is consistent with the old Accept header, but the response body and a real valid-key retry are unavailable. A two-request diagnostic with an explicitly fake key returned HTTP 401 with both Accept headers, so it did not reproduce the valid-key 406. Do not claim the account is connected until the holder retries and data/status confirms it. No actual user key or health records were used for these tests.
