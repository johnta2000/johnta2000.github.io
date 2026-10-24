# Costco archive

Private route: `/tools/costco/`. The static shell contains no purchase data. Convex authorizes **only johnta2018@gmail.com**, using the site's pinned Clerk issuer, on every read, import, note update, and file request. Signed-out and different-account states clear private UI and revoke receipt blob URLs. No private data is stored in localStorage or checked into the site.

Orders and item lines are searchable by ID, date, recipient, location, item number, description, and notes. Date and channel filters apply to order totals. Purchases and refunds are reported separately, with refunds stored as negative cents. Item view highlights matching lines; summary totals refer to matching complete orders. Click an order for its item breakdown, source text, notes, and full-size receipt images. CSV repeats the order total on each item row: do not sum that column to calculate order spending.

## Import

Import a JSON array (or `{ "orders": [...] }`) through the signed-in page. Each order uses `orderId`, `date` (YYYY-MM-DD), `channel` (`warehouse`, `online`, `same-day`, `gas`), `kind` (`purchase`, `refund`), `currency` (`USD`), `totalCents`, and `items`. Item fields: `name`, optional `itemNumber`, `quantity`, `unitCents`, `totalCents`. Optional order fields: `recipient`, `location`, `status`, `subtotalCents`, `taxCents`, `shippingCents`, `discountCents`, `sourceText`. Omit missing amounts instead of inventing zeros. Import in source order; there is no automatic recurring sync or completeness assertion.

Imports are idempotent by channel + kind + order ID. Repeated IDs are skipped, not overwritten. Save separate refund receipt IDs where Costco provides them. Original source text is retained privately. Attach screenshots to the resulting order. `/costco-receipt` authenticates both downloads and uploads, validates file type and size, and never returns a public storage URL. Files are deduplicated by hash within each order.

Do not put real receipts, exports, account tokens, screenshots, or purchase fixtures into this public repository. Keep transient import files outside the checkout. Use synthetic data for tests.

## Deployment and validation

`node --test tools/costco/tests/*.test.cjs`

`node scripts/costco/deploy.cjs` performs a dry run against a fresh live backend snapshot. `--publish` deploys only Costco additions while preserving deployed modules, schemas, HTTP routes and runtime configuration. It never seeds example transactions. The shared checkout is not safe for a full backend deploy; use this preservation workflow.

Publish the new `tools/costco` files and add the owner-authorized `costco:verify` directory link on top of the latest production website revision. Verify unauthenticated query and receipt requests fail, then check the real Clerk sign-in on the production origin. Production Clerk doesn't support localhost; local UI QA must inject synthetic services only in an ephemeral local server, never in shipped files.
