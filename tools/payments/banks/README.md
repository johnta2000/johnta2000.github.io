# Private bank history

The Payments navigation links to `/tools/payments/banks/`. This is an owner-only, read-only archive backed by Convex, with account summaries, transaction search/date/type/sort filters, CSV export, transaction detail, monthly statement summaries, and an authenticated PDF viewer.

## Privacy and persistence

Only the authorized owner's identity from the existing production Clerk issuer can query accounts, records, or statement files. PDF requests enforce both statement and parent account ownership, return private/no-store headers, and never expose public storage URLs. No financial source data belongs in this public repository. Imports and attachments are internal administrator mutations; the browser cannot modify imported records. Existing Payments collaborators do not inherit access.

Accounts, transactions, and statement metadata live in the three `bankArchive*` tables; original PDFs live in private storage. Records are shared across the owner's devices. Balances are explicitly dated snapshots, not live bank connections. Updating the source requires another reviewed import. Reimporting identical source rows is idempotent; conflicting changes require reconciliation rather than silently replacing records.

Navigation uses real links and URL state: account, view, transaction, statement, search, type, date range, sort, statement period, list page, and PDF page. Record links use opaque IDs. Authentication preserves the requested destination. No document contents or credentials are put into URLs or browser storage.

## Deployment and import

Run `node scripts/banks/deploy.cjs` for validation and add `--apply` to publish the backend. This narrowly patches the live backend, backs up its configuration, preserves other live modules/tables/routes/auth, and refuses a concurrently changed configuration. Do not deploy a stale full Convex checkout.

Run `node scripts/banks/import.cjs /absolute/path/to/private/archive` only after reviewing normalized source files outside this checkout. The archive must contain `normalized/account.json`, `transactions.json`, `statements.json`, and each statement's referenced original PDF. The importer verifies PDF hashes before uploading and after authenticated retrieval, verifies row counts and denied access, and writes a private `live-import.json` receipt next to the source archive. Credentials are read locally and never logged or committed.

## Validation

`node --test tools/payments/banks/tests/*.test.cjs` covers owner authorization, file ownership, rejected anonymous file reads, idempotent import/conflict handling, filtering, money signs, and URL state parsing. Browser checks use synthetic records and a temporary local server outside the repository; no test bypass ships in the app. Verify desktop and mobile links, refresh, copied detail links, browser history, filters, pagination, and PDF paging before publication.
