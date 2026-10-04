# Statement splits

An authenticated library at `/tools/payments/statements/` links to per-statement reviews. Review URLs use a 32-byte cryptographically random base64url secret in the fragment (`#…`), never a predictable ID. The fragment is not sent to the static site or in referrers. This is bearer access: anyone holding the link can read the full original PDF and edit allocations. No Clerk code, analytics, or third-party scripts load on the shared review. Owners can disable a link from the library. A disabled link stops new reads, edits and PDF retrievals; previously downloaded files cannot be revoked.

The backend checks the secret for every review and save, and uses it to authorize PDF retrieval through `/statement-pdf` via the `X-Statement-Token` header. PDFs are fetched as blobs and rendered with self-hosted PDF.js (including page navigation and zoom), not public storage URLs, with `no-store`, `nosniff` and no-index headers. Statement metadata, transactions, PDFs and live links must never be committed to the static site or tests. The existing Payments allowlist protects the library and link revocation; other Payments access policies remain unchanged.

Each row starts unassigned. Whole-row labels or exact cent splits allocate positive charges and negative credits/payments. Notes clarify Other or uncertain charges. Totals represent allocated remaining statement balance, including separately displayed opening balance and payments; they remain provisional until all rows are assigned. No label means unassigned, even when positive and negative unassigned items happen to net to zero. Imported rows must reconcile exactly with the stated ending balance. Saves require per-row versions and refuse stale overwrites. UI totals change after acknowledgement, refresh every 20 seconds and pause refresh while editing/saving. No offline writes or financial data in localStorage.

## Import another statement

1. Run `scripts/payments/parse-bilt.py` with a text-based Cardless Bilt PDF and a JSON output path **outside the repository**. It validates purchases, payments/credits and the ending balance; unsupported layouts or fees fail closed for manual review. Check all descriptions and amounts against the original PDF. It does not guess ownership.
2. Run `node scripts/payments/import-statement.mjs REVIEW.json ORIGINAL.pdf RESULT.json`. It uses the signed-in Convex administrator session, verifies the PDF fingerprint, uploads the original privately and creates unassigned rows. Reimporting the same PDF returns the existing review and preserves labels. Keep the resulting secret link outside the repository.
3. Open the returned review link and share it with the reviewers. Use the statement library to disable access when needed.

The initial version supports assistant-assisted imports, not unattended in-browser PDF parsing. CSV export includes all rows, allocation amounts, notes and source pages.

## Checks and release

`node --test tools/payments/statements/tests/*.test.cjs` tests access boundaries, revocation, import reconciliation, exact cents, stale writes, Chromium/WebKit desktop and phone layouts, PDF access, labels/splits and failure handling with synthetic data.

Do not deploy this full local Convex tree: it contains unrelated modules and may lag the live service. Snapshot the current `rapid-shark-565` deployment, retain all modules/routes/schema, add `statements.ts`, `statementTables.ts`, `statementHttp.ts`, merge only these two tables and append only the GET/OPTIONS `/statement-pdf` routes. Check the snapshot has not changed before deployment. Publish only this feature and the Payments navigation link from a clean latest-origin checkout. Never test saves against real statement rows.
