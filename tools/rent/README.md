# Rent

Private shared rent calculations and payment history at `/tools/rent/`. Every public Convex function enforces an exact allowlist of `vivek@affil.ai` and `cyin7890@gmail.com`. Both use the existing Clerk production instance and share one rent workspace. The site issuer's verified email-code sessions may omit `email_verified`; explicit false or an untrusted issuer without verification is rejected. The static page contains no apartment inputs or payment records. Data is not persisted in browser storage.

## Monthly workflow

Open the current calendar month, choose **Set up this month**, and review the inherited split. Each saved month has its own rent, areas, adjustments, Affil contributions, parking credit, notes, and request status. Parking and payments start fresh. Editing an earlier month never rewrites an already-created later month.

The three resident positions follow the source workbook: private room/private bathroom, loft/private bathroom, private room/shared bathroom. Room plus closet area determines the initial allocation. The loft discount is redistributed to the two private rooms by area. The bathroom adjustment is charged equally to the two private-bath residents and credited to the shared-bath resident. Parking is distributed proportionally to adjusted rent. Affil contributions are subtracted last and tracked as a separate payer. Largest-remainder rounding preserves the exact total to the cent.

**Record payment** logs money already received, with a date and optional reference. Partial payments and overpayments remain visible. One person's overpayment does not silently offset another's unpaid balance. **Void** preserves the original entry in history. The app never sends payment requests or moves money. The request checkbox is a manual log only. CSV exports include the month summary and payment ledger.

Saves are authenticated, versioned, and payment retries use idempotency keys. A source entry can only be confirmed once unless the confirmation is voided. Session changes clear all private UI and ignore outstanding responses. The dashboard refreshes every 30 seconds while visible and idle. Unsaved notes block navigation and payment edits; network errors retain drafts. A conflict asks the user to copy their note and reload before applying changes.

## Workbook migration

`scripts/rent/import-workbook.py` reads the supplied XLSX without changing it. Run it with the bundled Python runtime and an output path outside this public repository. It creates a private JSON file for the internal `rent:importWorkbook` mutation. The import skips existing months and does not create confirmed payment records.

The source contains 18 monthly columns. The first two use the earlier split without a bathroom adjustment. Two consecutive columns carry the same June date; the second is provisionally displayed in the following month, retaining its original label and a visible review note. Opening entries include deposit and move-in costs. Numeric payment entries, zero entries, blanks, comments, formula-derived amounts, and contradictory Affil labels are preserved for review. Source amounts do not become confirmed receipts until a user supplies the actual payment date. The alternate office allocation, apartment comparison, and tax estimates do not drive the recurring ledger.

## Release and verification

Do not deploy the entire local Convex checkout: it contains unrelated work and may differ from production. Start from a fresh snapshot of `rapid-shark-565`, preserve all existing modules and schema tables, and add `rent.ts`, `rentTables.ts`, the shared `tools/rent/math.js`, and the generated server wrapper. Merge only the two rent tables into the deployed schema. No HTTP routes or environment changes are needed. Publish the static rent directory and add a `rent:verify`-gated link to the current account directory.

Tests use synthetic data and mocked Clerk/Convex responses:

```sh
node --test tools/rent/tests/backend.test.cjs login/tests/access.test.cjs
node --test tools/rent/tests/browser.test.cjs
RENT_BROWSER=webkit node --test tools/rent/tests/browser.test.cjs
```

The workbook's 54 resident-month calculated values were independently compared with the new calculator, with differences below one cent from rounding; all 18 monthly totals reconcile exactly. Browser coverage includes mobile/desktop layout, the searchable payer picker, recording/voiding, month creation, import review, failure/retry, and sign-out races. Actual email-code sign-in still requires an approved user's session on the production domain.
