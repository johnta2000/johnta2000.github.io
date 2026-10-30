# PDP approvals

Private owner workspace at `/tools/pdp-approvals/`, discoverable from `/login/` after `pdpApprovals:verify`. Each record pairs a production URL, approved PDF / data room / DocSend URL, and approval email chain. Search, missing-evidence and exact-match filters, two-pane previews, private record shortcuts, exports, and archival are supported. External sources may block embedding; original links are always available. No automated comparison or compliance certification occurs.

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

Production previews are private, timestamped PNG captures made in Chrome at 1440 CSS pixels for desktop and 402 CSS pixels for mobile. They are explicitly labeled as saved screenshots, not a live feed. Opening a record shows both previews by default; `preview=0` hides them. The production side never embeds or proxies NextCard HTML. The original live link remains available for current interactions. Each reference PDF may contain multiple screenshot states. Original files and links remain available for full-size viewing.

The release script adds only the tracker schema changes and preserves the live HTTP router as `pdpApprovalBaseHttp.js`, adding the GET/OPTIONS PDF routes in a wrapper. On future HTTP edits, preserve the current live router and all unrelated routes. Do not deploy the stale broad local backend. No PDF bytes or source-package URLs belong in the public repository.

## Navigation and draft recovery

Record selection, comparison device, filters, safe search terms, preview visibility, history page and expanded revision, and record editors have directly navigable URLs. Back/Forward, refresh and copied links restore those views after authentication. Document contents, source URLs, approval emails and draft text never enter application navigation URLs. Drafts use `pdpApprovalDrafts` with owner/record/device isolation and expected-version checks; a successful record save clears only the matching draft version. Browser tests verify direct/copy/refresh/Back/Forward paths and durable draft restoration at desktop and phone widths.

## Refresh production captures

The user explicitly requires all visualization changes to remain on john-ta.com. Do not change NextCard source, headers, permissions or deployments to enable embedding.

Run `node scripts/pdp-approvals/capture.mjs --output /absolute/private/folder` with the owner's existing local Convex authentication. This reads the saved inventory and captures public pages without changing them. Use `--key record-key` to limit the run and `--replace` to recapture an existing entry. Use a private folder outside this public checkout. The runner waits for fonts and visible content images, checks the source URL and HTTP response, and keeps desktop/mobile separate. Visually review the PNGs, then rerun with `--publish` to upload and byte-verify them. This is an explicit operator refresh, not an automatic background monitor. Reload library does not recapture pages.

`pdpApprovalCaptures` preserves each published capture independently of approval records. Registration validates PNG dimensions and the current saved production URL. The read query returns only the latest matching record/device capture, and changing the production URL hides old captures. The authenticated file endpoint uses `kind=capture` to return no-store image bytes, with no public storage URL. Capture times and viewport widths are visible in the comparison. Missing or failed captures remain explicit; no placeholder is presented as a production screenshot.

Private file downloads are deduplicated and reused in tab memory for up to five minutes, bounded to 32 MB. Switching PDP/device or reopening previews revokes view URLs but retains cached bytes during the same session. Account changes and sign-out abort pending downloads and clear the cache. No file bytes are persisted to browser storage or a shared HTTP cache; failures are evicted so retry can succeed. Capture metadata is still read on each view to select the current immutable file key.

## Inline field edits

Each editable record value has an Add/Edit control next to its displayed value. Opening it uses `field=<allowlisted-field-name>` in the URL, with the selected PDP and device retained. Only the active field is edited; previews remain visible. The full form remains available under All fields and is used to create records.

`pdpApprovalFieldDrafts` keeps per-owner, PDP, device and field drafts, with version checks and private resume links. Close preserves the unfinished edit; Save applies just that field through the existing validation and revision-history transaction, then removes only that draft version. Concurrent record changes reject the save and retain the draft. Other pending field edits and full-form drafts are never implicitly committed. Navigating away flushes the draft first, failed flushes retain the open editor, and signed-out access is denied. Uploads retain the same private PDF signature, size and PDP/device binding checks. Bank of America cannot disable the required 1:1 flag.
