# Rent

Private shared rent calculations and payment history at `/tools/rent/`. Every public Convex function enforces an exact allowlist of `vivek@affil.ai`, `cyin7890@gmail.com`, `john@affil.ai`, and `johnta2018@gmail.com`. All four accounts use the existing Clerk production instance and share one rent workspace. The site issuer's verified email-code sessions may omit `email_verified`; explicit false or an untrusted issuer without verification is rejected. The static page contains no apartment inputs or payment records. Data is not persisted in browser storage.

## Monthly workflow

Use the yearly **Monthly ledger** to enter rent, parking credits, and each payer’s total received directly in cells. Tab moves across, Enter moves down, and rectangular spreadsheet pastes are supported. **Save changes** commits the edited months together; charts preview unsaved edits immediately. New rows inherit the latest earlier saved split, with fresh parking and payments. Use **Edit calculation** under Month details to change areas, adjustments, or contributions. Each saved month has its own rent, areas, adjustments, Affil contributions, parking credit, notes, and request status. Parking and payments start fresh. Editing an earlier month never rewrites an already-created later month.

The three resident positions follow the source workbook: private room/private bathroom, loft/private bathroom, private room/shared bathroom. Room plus closet area determines the initial allocation. The loft discount is redistributed to the two private rooms by area. The bathroom adjustment is charged equally to the two private-bath residents and credited to the shared-bath resident. Parking is distributed proportionally to adjusted rent. Affil contributions are subtracted last and tracked as a separate payer. Largest-remainder rounding preserves the exact total to the cent.

**Individual receipt** logs money already received, with a date and optional reference. Received cells in the ledger represent monthly totals, not additional payments: editing a total retains the previous receipts as voided audit history and records a replacement with month-only precision. Clearing a received cell explicitly records a zero total. Workbook amounts remain review hints and do not count as receipts automatically. Partial payments and overpayments remain visible. One person's overpayment does not silently offset another's unpaid balance. **Void** preserves the original entry in history. The app never sends payment requests or moves money. The request checkbox is a manual log only. CSV exports include the month summary and payment ledger.

Saves are authenticated, versioned, and payment retries use idempotency keys. A source entry can only be confirmed once unless the confirmation is voided. Session changes clear all private UI and ignore outstanding responses. The dashboard refreshes every 30 seconds while visible and idle. Unsaved notes block navigation and payment edits; network errors retain drafts. A conflict asks the user to copy their note and reload before applying changes.

## Workbook migration

`scripts/rent/import-workbook.py` reads the supplied XLSX without changing it. Run it with the bundled Python runtime and an output path outside this public repository. It creates a private JSON file for the internal `rent:importWorkbook` mutation. The import skips existing months and does not create confirmed payment records.

The source contains 18 monthly columns. The first two use the earlier split without a bathroom adjustment. Two consecutive columns carry the same June date; the second is provisionally displayed in the following month, retaining its original label and a visible review note. Opening entries include deposit and move-in costs. Numeric payment entries, zero entries, blanks, comments, formula-derived amounts, and contradictory Affil labels are preserved for review. Source amounts do not become confirmed receipts automatically. Users may confirm an individual source payment with its actual date or explicitly enter a received monthly total in the ledger; a monthly total prevents duplicate source confirmation for that payer. The alternate office allocation, apartment comparison, and tax estimates do not drive the recurring ledger.

## Release and verification

Do not deploy the entire local Convex checkout: it contains unrelated work and may differ from production. Start from a fresh snapshot of `rapid-shark-565`, preserve all existing modules and schema tables, and add `rent.ts`, `rentTables.ts`, the shared `tools/rent/math.js`, and the generated server wrapper. Merge only the two rent tables into the deployed schema. No HTTP routes or environment changes are needed. Publish the static rent directory and add a `rent:verify`-gated link to the current account directory.

Tests use synthetic data and mocked Clerk/Convex responses:

```sh
node --test tools/rent/tests/backend.test.cjs login/tests/access.test.cjs
node --test tools/rent/tests/browser.test.cjs
RENT_BROWSER=webkit node --test tools/rent/tests/browser.test.cjs
```

The workbook's 54 resident-month calculated values were independently compared with the new calculator, with differences below one cent from rounding; all 18 monthly totals reconcile exactly. Browser coverage includes spreadsheet typing, keyboard navigation, rectangular paste, batch saves, chart updates, retry and draft retention, mobile/desktop layout, the searchable payer picker, recording/voiding, month creation, import review, failure/retry, and sign-out races. Actual email-code sign-in still requires an approved user's session on the production domain.

## Payment evidence and utility statements

Received bars are solid teal; outstanding bars use amber diagonal hatching. Rent amounts stay in compact rectangular cells. A discreet top-right screenshot icon opens proof and individual receipt checkboxes; a small dot indicates that all receipts in the cell are checked. Multiple receipts remain separately checkable inside the proof view. Payment activity retains the audit history. A screenshot may be linked to multiple receipts without adding to the recorded amounts. Changing a monthly total preserves evidence on the original, voided entries; replacement totals start unchecked.

`rentRecords` authorizes the same four rent accounts. `/rent-file` authenticates every upload and download, validates file signatures and size (15 MB), serves private bytes with no-store headers, and never returns a public storage URL. Upload retries reuse a request key. Full-size screenshot previews and PDF previews are cleared on sign-out. Existing screenshots can be reused from the receipt view. Unmatched imported transfers remain accessible from the rent ledger toolbar; there is no standalone proof library.

The PG&E monthly ledger sits immediately below the rent ledger and provides editable rows for each statement month, keyboard navigation, rectangular paste, Save/Discard, and PDF controls in each row. PG&E records are keyed by the original statement date and grouped by its month. Service start/end, due date, prior signed balance, payments reported by the statement, new charges, and total due are retained separately. Prior balance minus reported payments plus charges must reconcile to the total. Duplicate dates are rejected except for idempotent retries; multiple original PDFs may attach to one statement. Batch edits are atomic and versioned, preserve statement IDs and file links, and reject stale concurrent edits. Empty months remain blank until a complete statement is saved. Utility records do not alter rent totals or infer that the current statement has been paid.

User-authorized evidence imports preserve each bank transaction's displayed date, status, memo, and any unambiguous rent month. Only a unique exact match on rent month, payer and amount is checked automatically; unmatched and ambiguous transfers stay in the proof library for review. Imports never create additional rent receipts. Source PDFs, screenshots and extracted private data must stay outside the public repository.

For backend releases, extend the current deployed schema with `rentRecordTables`, the optional receipt check fields in `rentTables`, and the three `/rent-file` HTTP methods while preserving all other deployed definitions. Deploy `rentRecords.ts` and `rentFileHttp.ts` along with the existing rent modules. Additional tests: `node --test tools/rent/tests/records.test.cjs`.
