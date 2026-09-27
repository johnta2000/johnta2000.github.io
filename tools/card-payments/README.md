# Card payments

A private monthly checklist with a desktop bank-by-person matrix and a compact phone list at `/tools/card-payments/`. It uses the existing Clerk production instance and the `rapid-shark-565` Convex deployment. A tap logs the user's confirmation; it never initiates bank payments or checks issuer balances.

## Access and release

1. Set `CARD_PAYMENTS_ALLOWED_EMAIL` in the intended Convex deployment to the comma-separated approved email addresses. Set `CARD_PAYMENTS_WORKSPACE_OWNER` to one stable, private workspace identifier shared by those logins; when enabling sharing for existing records, use their existing owner identifier. Both settings are required; no fallback allowlist is used. The authenticated token must include `email` and `email_verified: true` (Convex exposes the latter as `emailVerified`).
2. Deploy `convex/cardPaymentTables.ts`, `convex/cardPayments.ts`, and the schema import/spread. Review the complete backend working tree before deploying: other tools may have unrelated changes. Do not blindly deploy the whole dirty checkout.
3. Publish this directory and the account-directory link in `login/app.js`.
4. Verify real sign-in on the configured `john-ta.com` origin, including denial for an unapproved account. Localhost cannot use this site's production Clerk instance.
5. Import the separately supplied account-list JSON while signed in, review its due days and starting month, then confirm. Personal account rosters and payment records must not be committed to the public static site.

All queries and mutations require server authorization. Approved logins share the configured workspace, including its accounts and monthly history. Server-side owner checks deny access to documents outside that workspace even if IDs are known. Signing out clears rendered account data and form drafts. Data is not stored in localStorage or a service worker.

## Workflow

The page opens to the current local calendar month. Pick the **due month** with the month control. Accounts repeat from their start month, with each month's status initially **To check**. **Scheduled** remains unfinished. **Paid** and **Nothing due** count as complete. Use **Mark paid** for a quick checkoff, or the details button for all statuses, an optional dollar amount, and notes. Reopen details and choose **To check** to undo a checkoff. Amounts are optional logs, not a calculated statement balance or an amount paid automatically.

Existing data refreshes every 30 seconds and when returning to the tab or reconnecting, except while editing or saving. Writes are acknowledged before the UI marks them saved. Network failures show an unconfirmed-save warning and refresh the server state. Per-entry versions reject stale overwrites from another device. If a details save conflicts, close and reopen it after refreshing to review the latest entry before saving again. There is no offline write queue.

Retiring an account keeps the selected month and earlier history, and excludes it from later checklists. Later existing logs prevent backdating retirement. Reactivate it from Manage accounts. Due days beyond a short month's last day are displayed on that month's last day; the issuer's actual statement remains authoritative.

Manage accounts also edits names, card nicknames and due days. These are shared account details, so edits change the labels shown alongside earlier logs too. Monthly statuses, amounts and notes remain separate. Imported spreadsheet due days start at 1 as a setup assumption and should be reviewed here.

## Account-list import

The picker reads a small JSON file locally, previews the roster, then sends it to the private database only after the user confirms. The first column lists banks and the remaining columns list people in account/import order. Each account has its own status toggle, including multiple cards in one cell. Blank cells mean no active account. Clicking a completed status returns it to To check. The unfinished filter hides finished accounts while retaining the row/column context. Below 900 px the same records appear in a phone list.

Exact person/bank/nickname matches (case-insensitive, trimmed) are skipped, including duplicates in the same import. No historical checkbox states are inferred.

```json
{"version":1,"accounts":[{"person":"Example","bank":"Example bank","nickname":"","dueDay":1}]}
```

## Verification

Run from the repository root:

```sh
node --test tools/card-payments/tests/*.test.cjs login/tests/access.test.cjs
PAYMENTS_BROWSER=webkit node --test tools/card-payments/tests/browser.test.cjs
node_modules/.bin/tsc --noEmit -p convex/tsconfig.json
```

Browser tests mock Clerk and the HTTP endpoints. They do not prove production configuration or live database persistence; verify those on the deployed origin. Backend handler tests exercise authorization, ownership, money validation, stale writes, month isolation, duplicate import, and retirement. Test screenshots are written to the OS temp directory, not the site.

Verification: 16 backend/directory tests and eight browser scenarios in each of Chromium and WebKit passed. The full project TypeScript check had three pre-existing errors in `rally.ts:633` and `standups.ts:621–623`, unchanged by this feature. No new tracker type errors were reported. The backend was deployed to the site’s existing rapid-shark-565 service. Live read-only checks accepted the configured verified email and denied other emails, unverified email and signed-out calls. The actual browser sign-in flow still needs verification with the owner’s session. All 63 existing endpoint definitions and all existing table schemas were preserved.

## Isolated backend release

This repository serves multiple Convex deployments, and the shared checkout also contains unrelated local changes. The initial payment release used the current rapid-shark-565 deployed JavaScript as its baseline, renamed the reserved `_deps` import directory for rebundling, and added only the payment modules and two schema tables. Do not deploy all repository functions to rapid-shark-565 without checking for unrelated changes. The latest GitHub checkout also has a pre-existing rallyNotes.ts type error in addition to the local checkout’s three existing type errors. None is in the payment tracker.

Access update: the two approved verified emails share one configured workspace. All 18 backend/directory tests pass, including shared history and stale-write protection across logins. Live read-only checks accept both approved emails and reject an unrelated email, an unverified approved email, and signed-out access. The full-project typecheck retains only the four unrelated errors noted above.
