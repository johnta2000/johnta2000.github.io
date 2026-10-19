# NextCard Launches

Private shared launch workspace at `/tools/launches/`, discovered through `/login/` only after `nextcardLaunches:verify` approves the current account.

Channels is the starting view. All media is the default for both the library and launch checklists; explicit medium links retain their requested filter. Pick destinations by distribution medium and create a launch, or start an empty launch from Launches. Each launch opens one channel checklist with search, medium filters, Selected, Hide, Remove, and Details. There are no Prepare, Distribute, or Follow up sections, generated preparation tasks, task counters, or progress sidebars. Selecting a checkbox adds the channel to the launch. Selected rows include a Posting as / who’s posting text field for an account handle or teammate name. It saves on blur or Enter, is specific to that channel in that launch, and is available in Draft & notes as well. It does not change channel guidance or permissions; no account credentials are collected. Older tasks default to blank assignments. Duplicates retain assignments as reusable planning, and copied checklists include them. All edits save automatically.

The shared library retains posting rules, audience fit, contact references, and history. Channel notes appear beneath each channel name and open the shared editor with the notes field focused. Best content fit is now labeled Channel notes and accepts any free-form team notes; the existing fit value is reused without migration. Audience tags are hidden from launch and channel forms, retained unchanged in saved records, and excluded from channel search. Search matches notes and contact details. Earlier separate notes remain available under Earlier saved notes. Edit channel opens the same editor in one click, with notes near the top and a sticky save footer. Selected channels also retain a separate Draft & notes action. Older guidance links remain supported. Hide for this launch removes an irrelevant option only from that launch; restore it under Hidden for this launch. Remove unselects an included channel and asks before discarding saved work. Channel archival affects the shared library and keeps history.

Launch creation asks for a name and optional source URL; summary, owner, date, type, and notes are collapsed under Notes & optional details. Existing summaries, notes, materials, and earlier checklist items are preserved under the collapsed Saved notes & links disclosure. No data migration or backend deployment is required for the simplified interface. Old stage URLs open the same checklist; old task/check editor links still work. Creating or changing a launch type does not generate workflow items. Copy checklist exports only chosen channel names.

Desktop uses compact two-column channel rows; phones use the shared searchable medium picker. Searches cross all media. Home-page selections persist in memory across medium tabs and searches until creation or sign-out. Duplicating preserves channel choices and hidden options while resetting execution results. No external posting, email, or Linear integration exists. Refresh loads teammates’ saved changes; the workspace does not subscribe to live updates.

## Routes and sharing

Every main view and editor has a query-based URL under `/tools/launches/`, so GitHub Pages can serve a direct link without path rewrites. Main navigation, media, launch-list status, and dialogs update browser history. Back/Forward restores the matching screen; leaving an unsaved editor through Back asks before discarding its form. The shared Copy link controls include only navigation IDs and enum values, never drafts, labels, contact details, arbitrary query parameters, or Clerk authentication fragments.

- Channels: `?view=channels&medium=reddit` (optional `archived=1`).
- Launch list: `?view=launches` (optional `status=complete` or `status=archived`).
- Launch checklist: `?launch=<key>` (older `step` values are accepted and canonicalized to `choose`).
- Launch details editor: `?launch=<key>&edit=launch`.
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
