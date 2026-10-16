# NextCard Launches

Private shared launch workspace at `/tools/launches/`, discovered through `/login/` only after `nextcardLaunches:verify` approves the current account.

Channels is the starting view. Pick destinations across distribution media, then Create launch carries those exact choices into a fresh plan. Selections stay in memory across medium tabs and global searches until creation or sign-out. The Launches view retains Add launch for starting an empty plan. Its optional details include a source URL, summary, audience tags, launch type, owner, and target date. Four stages cover channel selection, preparation, distribution, and follow-up. A launch created from selected channels opens preparation; empty and reopened launches start on Channels. Tool updates add an explicit update-and-QA preparation task. Checklist items can be added, edited, assigned, removed, or checked off.

Compact checkbox rows are split by distribution medium, with counts, a Selected view, and search across all media. Desktop uses medium tabs and two-column choices; phones use the shared searchable medium picker and compact rows. Details holds longer guidance and history. Medium is derived independently of ownership: r/nextcard appears under Reddit and the newsletter under Email & outreach. The channel library stores Facebook groups, subreddits, owned accounts, and editorial contacts separately. It starts with the supplied communities plus NextCard owned-channel candidates; every initial entry is unverified. Some destination URLs are intentionally blank and must be supplied by the team. Original checkmarks and orange markers are not interpreted as posting permission. Rules, link posture, admin approval, checked date, audience fit, relationship/contact notes, and archival status are editable. Checked guidance older than 90 days prompts a fresh check. Suggestions are simple audience-tag and launch-type matches, not AI research or verification. No channel is selected automatically.

Selecting a channel creates a task with a native angle, draft, owner, target date, manual status, live/coverage link, and outcome. Posts distinguish ready, submitted, awaiting approval, and live; outreach distinguishes ready and sent. Only live, sent, and skipped count as completed distribution. Previous activity and outcomes appear in the channel and task views. No publishing, admin messaging, or email-sending integrations exist in v1. Materials are links to existing shared documents or visuals, not file uploads. Copy checklist exports a flat execution checklist to the clipboard without creating a Linear issue.

Duplicating preserves audience, source context, channel selection, angles, materials, and checklist structure while clearing drafts, live links, outcomes, dates, notes, and checkmarks. Archive keeps a launch or channel and its history; it does not delete records. Refresh loads teammates' saved changes. The workspace does not subscribe to live updates.

## Routes and sharing

Every main view and editor has a query-based URL under `/tools/launches/`, so GitHub Pages can serve a direct link without path rewrites. Main navigation, media, launch-list status, launch stages, and dialogs update browser history. Back/Forward restores the matching screen; leaving an unsaved editor through Back asks before discarding its form. The shared Copy link controls include only navigation IDs and enum values, never drafts, labels, contact details, arbitrary query parameters, or Clerk authentication fragments.

- Channels: `?view=channels&medium=reddit` (optional `archived=1`).
- Launch list: `?view=launches` (optional `status=complete` or `status=archived`).
- Launch stage: `?launch=<key>&step=choose|prepare|distribute|followup`.
- Launch details editor: `?launch=<key>&step=prepare&edit=launch`.
- Task editor: `?launch=<key>&task=<task-id>`.
- Channel editor: `?channel=<channel-key>`; preserve `launch` and `step` for a launch context.
- Other editors: `check=<check-id>`, `guidance=<channel-key>`, `edit=material`, `edit=actions`, or `edit=new-channel`.

Main views and dialogs have Copy link controls. Recipients still need an approved team account. Sign-in and sign-up redirects retain the full destination query; the app resolves it only after an authenticated workspace read. Direct links and reloads open saved data without creating new launches or submitting forms. Invalid and missing record IDs show an unavailable screen. Search text and the not-yet-created home-page channel selection stay local rather than becoming shareable content. Clipboard failure falls back to a native copy-link prompt without replacing an unsaved editor.

## Identity and persistence

The private `NEXTCARD_LAUNCH_TEAM` Convex environment variable is a JSON array of `{ "name": "Display name", "email": "approved@example.com" }` members. Missing, empty, or malformed configuration denies access. Membership is independent of all other private tools; there is no invitation or permission-management UI. The same members are offered as launch, task, and checklist owners. Every query and mutation verifies a subject, the pinned `https://clerk.john-ta.com` issuer, an approved normalized email, and no explicit failed email-verification claim. This issuer's email-code flow can omit the optional verification claim.

All approved members share the `nextcardLaunchChannels` and `nextcardLaunches` tables in `rapid-shark-565`. Record versions prevent stale updates from silently overwriting teammates' changes. Failed writes retain the newest pending edits in memory with Retry and Download unsaved work actions. Conflicts require downloading the current draft and loading the latest workspace. There is no automatic merge or import of downloaded snapshots. No workspace data is stored in browser storage. Account changes clear rendered data, dialogs, and pending drafts; late requests cannot restore them. There is no preview authentication bypass or analytics script.

## Validation and release

Run `node --test tools/launches/tests/*.test.cjs login/tests/access.test.cjs`. Tests use synthetic identities, intercepted network calls, and mock records. They cover access denial, allowed team accounts, empty configuration, initialization, independent record versions, stale writes, validation, the end-to-end workflow, archive/history, duplication, failed-save recovery, sign-out races, searchable pickers, and desktop/phone layouts. Production Clerk sign-in requires the configured `john-ta.com` origin.

Preserve the deployed backend, which differs from the broad local checkout. Bundle only `nextcardLaunches.ts`, merge only the two new table definitions into the active schema, and retain all other module hashes, definitions, auth, cron jobs, dependencies, routes, and table shapes. Keep the private owner access inventory in sync without publishing approved email addresses or policy contents in static assets. Publish only this route, its three backend source modules, the schema additions, and the app-directory integration from a current production Git checkout.
