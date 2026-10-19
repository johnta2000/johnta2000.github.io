# Account directory

The public homepage links here. This page uses the same production Clerk instance as Rally, Standups, Sleep, Monitoring, and Tranquil. Clerk renders sign-in; Convex remains responsible for each app's permissions. No new account store or backend deployment is needed.

After sign-in, existing read-only Convex queries determine which private app links appear:

- Rally: `rally:listEvents` on `dashing-heron-837`; link to a room the user belongs to.
- Standups: `standups:verify` on `rapid-shark-565`.
- Packing: `packing:verify` on `rapid-shark-565`; restricted to the verified John Ta owner account. The destination independently authorizes every packing read and write.
- Sleep: `sleep:verify` on `rapid-shark-565`.
- Monitoring: `monitoring:verify` on `rapid-shark-565`.
- Card payments: `cardPayments:verify` on `rapid-shark-565`, restricted by its own `CARD_PAYMENTS_ALLOWED_EMAIL` setting. See `../tools/card-payments/README.md` for the backend deployment and setup requirements before publishing this link.

Signing up does not grant private app access. Each destination still enforces its own server permissions. Sign-out or a session change clears the directory and invalidates outstanding access checks.

The directory lists only apps approved by their server access checks. There is no general Other tools section. Existing public tool URLs retain their own access policies.

Apartment Navigation and Burgery are omitted from the general directory. Removing these links does not change access at their direct URLs; those destinations must enforce their own access policies.

The embedded login disables signup (`withSignUp: false`); invited users use their invitation link. This UI setting does not restrict Clerk's signup API or hosted Account Portal. Production Clerk Access mode must separately be set to Invite-only (`restricted`). Verify `user_settings.sign_up.mode` from the public `/v1/environment` endpoint before treating account creation as invite-only. Clerk's documented Backend API does not expose an access-mode update parameter. Existing accounts are unaffected; their private app access still requires per-tool approval.

## Verification

Run `node --test login/tests/access.test.cjs` from the repository root. These tests mock Clerk and Convex and cover signed-out behavior, per-app access, new accounts, failed requests, session changes, and sign-out races.

A real Clerk sign-in still needs verification on the configured site origin before release. Clerk explicitly rejects localhost because this production instance only allows john-ta.com and its subdomains. Verify an existing Rally account, an allowed personal-tools account, an account without private-app access, and sign-out. No sign-in or deployment is performed by the unit tests.

Site access at `/tools/access/` uses its own owner-only `accessOverview:verify` check on `rapid-shark-565`. Its read-only inventory is separately authorized and contains no management controls.
