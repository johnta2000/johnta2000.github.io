# PDP approvals

Private owner workspace at `/tools/pdp-approvals/`, discoverable from `/login/` after `pdpApprovals:verify`. Each record pairs a production URL, approved PDF / data room / DocSend URL, and approval email chain. Search, missing-evidence and exact-match filters, optional two-pane previews, private record shortcuts, exports, and archival are supported. External sources may block embedding; original links are always available. No crawling, visual comparison, or compliance certification occurs.

The backend pins the production Clerk issuer and the site's two existing owner aliases. Every query and mutation authorizes before reading or writing. No sensitive record, document, or email URLs ship in static assets; the shell and program source are public GitHub Pages files. Records are fetched only with an authenticated token, never stored in localStorage/sessionStorage, and cleared on account changes. The app contains no analytics. External documents keep their original permissions. Links are validated as HTTPS without embedded credentials.

The `pdpApprovals` table holds the current record and `pdpApprovalHistory` keeps every saved revision in the same transaction, including archived and restored states. Expected-version checks reject stale edits. History is paginated in batches of 50. The library supports up to 2,000 records; excess is an explicit error, never silent truncation. Failed saves preserve the draft, with a download action. Partial edits autosave to private, owner-scoped drafts in the shared backend. The library offers resume links, and each editor restores its draft on reload or another signed-in device. Draft save failures remain visible, navigation waits for persistence, and a download action preserves a recoverable copy. Concurrent tabs cannot overwrite newer drafts. A missing PDF or email remains missing evidence. Bank of America records always require the 1:1 flag, but no linked record is certified as matching. Uploaded PDF bytes are preserved privately; external-only references retain source URLs.

No production data is seeded. Add the user's confirmed PDP inventory and approved evidence only when provided. All tests use synthetic records; do not exercise writes against real compliance data.

Run `node --test tools/pdp-approvals/tests/*.test.cjs login/tests/access.test.cjs`. Browser tests cover private gates, signed-in workflows, rendering at desktop and phone sizes, draft retention, session races, and safe text rendering. Production sign-in requires john-ta.com.

## Release

Use a current production Git checkout and publish only the tracker, its schema additions, login integration, and tests. Never deploy the broad local Convex checkout. `scripts/pdp-approvals/deploy.mjs dry-run` reads current production configuration, merges only the tracker tables, compiles the tracker and its private file route, and retains other modules by hash. `deploy` publishes after a concurrent-change check and verifies the resulting schema, unchanged modules and existing endpoint signatures. `verify` checks a deployment without changing it. Credentials remain in memory and are never printed. The website uses its existing GitHub Pages publishing process.

The UI uses black, white, and gray. Desktop comparison places the approved mockup on the left and production on the right. The approval evidence, notes, and revision controls form a separate card beneath the mockup inside the left column, including when previews are open. On phones, the approved reference and evidence stack together before production.

## Desktop/mobile references and private PDFs

Desktop and Mobile are separate reference records within each PDP. Each has its own source link, PDF, approval email/date, version, page and notes. Legacy generic fields remain intact and initially appear under Desktop only. Saving one device retains the other, and older clients cannot erase the new references by omitting the field. The library's Evidence linked count requires both device references and both approval-email fields.

PDFs upload through a short-lived upload URL issued only to an approved owner. Registration reauthorizes the owner, checks the PDF signature and 20 MB size limit, and binds the file to one PDP/device. `pdpApprovalFiles` stores private storage metadata. Saved records and revision history retain file keys, never public storage URLs. The authenticated `/pdp-approval-file` endpoint reauthorizes every read and returns no-store PDF bytes. The client uses temporary object URLs for preview/download and revokes them on account changes and preview changes. Source PDF bytes are not altered. Approval dates are never inferred from filenames.

Live preview frames use a 1440 CSS pixel desktop width or 402 CSS pixel mobile width, scaled to fit the column. This is a responsive viewport, not device emulation or a matching certification; sources may block framing. Each reference PDF may contain multiple screenshot states. Original files and links remain available for full-size viewing.

The release script adds only the tracker schema changes and preserves the live HTTP router as `pdpApprovalBaseHttp.js`, adding the GET/OPTIONS PDF routes in a wrapper. On future HTTP edits, preserve the current live router and all unrelated routes. Do not deploy the stale broad local backend. No PDF bytes or source-package URLs belong in the public repository.

## Navigation and draft recovery

Record selection, comparison device, filters, safe search terms, preview visibility, history page and expanded revision, and record editors have directly navigable URLs. Back/Forward, refresh and copied links restore those views after authentication. Document contents, source URLs, approval emails and draft text never enter application navigation URLs. Drafts use `pdpApprovalDrafts` with owner/record/device isolation and expected-version checks; a successful record save clears only the matching draft version. Browser tests verify direct/copy/refresh/Back/Forward paths and durable draft restoration at desktop and phone widths.
