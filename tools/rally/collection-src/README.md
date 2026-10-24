# Rally personal collections

This is the source for `/tools/rally/collection/`. Build with `npm run build:rally-collection` from the repository root. The generated sibling `collection/` directory is served by GitHub Pages.

Each verified Clerk account owns its collection. The Convex `rallyCollection` module derives ownership from the authenticated token identifier; it never accepts an owner from the browser. Collections use a dedicated table and are separate from shared room snapshots, exports, and admin permissions. Each record is an independent document.

A room's **Log my experience** link opens `?from=<eventId>`. The backend checks room membership and creates an unsaved draft from shared event details. Crew and lineup names are suggestions, not attended people or artists. Costs, ratings, private notes, and album links start empty. Saving requires an explicit user action. Each person can save one independent experience per Rally event. Older events can be entered manually without a planning room.

An existing personal snapshot survives later room edits or removal from a room. A user who no longer belongs to the room can edit their own snapshot but cannot open a fresh draft from that shared room. Backup imports merge only within the current account. JSON backups retain Rally links; linking a new imported entry requires current access to that event.

The collection requires internet and uses the existing Rally Clerk account and Convex deployment. Personal collection records are not included in the iOS offline room cache. Signing out or switching accounts unmounts the collection UI and clears its in-memory state. Browser storage holds only presentation preferences, never collection records.

Run privacy and model checks with `node --test tools/rally/collection.test.cjs`.


## Local development and checks

Use Node 22 or newer with `npm ci` from the repository root. Run `npm run check:rally-collection`, `npm run test:rally-collection`, and `npm run build:rally-collection`. Run `npm run test:rally` when changing the surrounding Rally shell. Commit the regenerated `tools/rally/collection/` assets along with source changes; GitHub Pages serves these static files.

## Collection behavior

- My raves and Rave diary are separate workspace destinations. The collection also opens for an account with no planning rooms, or if its plans fail to load.
- A name and start date are required. Costs and memories are optional sections. Unsaved forms require an explicit discard, warn before leaving the page, and keep entered values after failed saves. A new entry receives a stable ID before its first save so retries cannot add duplicates.
- Requests bind to the active account/session; switching accounts clears the collection and rejects delayed requests from the previous screen. Collection records are never written to browser storage.
- On phones (760 px and narrower), Direction B presents a chronological diary grouped by month, with artists, crew, ratings, and personal costs on each card. Bottom navigation opens Raves, Artists, Crew, and Recap. The add button offers manual entry or a Rally plan; account navigation is in the header menu and backup tools expand at the bottom. Details and forms open as bottom sheets. Desktop keeps the sortable spreadsheet with a single toolbar and hamburger drawer for My raves, Rave history, Artists, Crew, and Recap. Both layouts share filters and saved entries, and pickers use the site's shared searchable control.
- Costs distinguish unknown, partial, complete, and explicitly free entries. Totals include entered amounts only. The collection currently uses USD; enter converted amounts for spending in other currencies.
- JSON is the restorable backup format. CSV is an export for spreadsheet use. Imports merge by ID, explain which records will be replaced, and validate the backend's 200-entry, 900 KB batch and 65 KB entry limits before sending. Exporting real account data is disabled while browsing examples.
- Refresh reloads saved records from Rally. Offline changes are not queued; keep the form open and retry when connected. Photo albums stay in the linked service, whose sharing settings control access.

The October 22 usability pass changes only the web frontend and local verification tooling. It does not require a backend migration.

### Connected project journey

`/tools/rally/collection/?view=projects` is the account-bound project index. It lists shared projects with links to their existing Rally rooms, and uses the current account's collection to label eligible projects “Log my experience” or “View my experience.” Future projects only show planning actions. A failed status lookup leaves a neutral “Open my experience” link; it never claims an entry is missing.

Project home screens also resolve the personal status through the existing authenticated draft query. `?from=<eventId>` opens saved-entry details when an entry already exists, or a prefilled review form otherwise. Saving remains explicit. Personal details link back to the shared project; no personal costs or notes are copied to the project.

### Diary naming and dates

The shared planning index is labeled **My raves**; the personal history is **Rave diary**. Existing URLs, account ownership, and saved records are unchanged. Diary forms and date filters accept typed `MM/DD/YYYY` dates (and pasted ISO dates), or a calendar with searchable month/year jumps. Calendar days have 44px touch targets, arrow-key navigation, focus return, and minimum end-date enforcement. Invalid dates cannot be saved; incomplete date filters do not hide results.
