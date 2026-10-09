# Account directory

The public homepage links here. This page uses the same production Clerk instance as Rally, Standups, Sleep, Monitoring, and Tranquil. Clerk renders sign-in; Convex remains responsible for each app's permissions. No new account store or backend deployment is needed.

After sign-in, existing read-only Convex queries determine which private app links appear:

- Rally: `rally:listEvents` on `dashing-heron-837`; link to a room the user belongs to.
- Standups: `standups:verify` on `rapid-shark-565`.
- Packing: `packing:verify` on `rapid-shark-565`; restricted to the verified John Ta owner account. The destination independently authorizes every packing read and write.
- Sleep: `sleep:verify` on `rapid-shark-565`.
- Monitoring: `monitoring:verify` on `rapid-shark-565`.
- Card payments and Statement splits: `cardPayments:verify` on `rapid-shark-565`; both destinations use the same Payments allowlist. The splits link opens the authenticated library, which lists statement reviews without putting private review secrets in this directory.
- Payment questions: its separate `paymentQuestions:verify` on `rapid-shark-565`, independent of Card payments access.
- Rent and its PG&E bills section: `rent:verify` on `rapid-shark-565`.

Signing up does not grant private app access. Each destination still enforces its own server permissions. Sign-out or a session change clears the directory and invalidates outstanding access checks.

Menu Index, its individual SF Organica and Hẻm by Lê Quý menus, and Burgery are listed only after sign-in here, but their existing direct URLs and static assets remain public. This directory is not a new access-control layer for those public tools.

Apartment Navigation is also linked after sign-in. Its directions remain encrypted behind its separate password; a Clerk account does not unlock them.

## Verification

Run `node --test login/tests/access.test.cjs` from the repository root. These tests mock Clerk and Convex and cover signed-out behavior, per-app access, new accounts, failed requests, session changes, and sign-out races.

A real Clerk sign-in still needs verification on the configured site origin before release. Clerk explicitly rejects localhost because this production instance only allows john-ta.com and its subdomains. Verify an existing Rally account, an allowed personal-tools account, an account without private-app access, and sign-out. No sign-in or deployment is performed by the unit tests.
