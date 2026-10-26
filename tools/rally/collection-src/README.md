# Rally personal collections

This is the source for `/tools/rally/collection/`. Build with `npm run build:rally-collection` from the repository root. The generated sibling `collection/` directory is served by GitHub Pages.

Each verified Clerk account owns its collection. The Convex `rallyCollection` module derives ownership from the authenticated token identifier; it never accepts an owner from the browser. Collections use a dedicated table and are separate from shared room snapshots, exports, and admin permissions. Each record is an independent document.

Every Rally rave appears in each authorized crew member's diary automatically. The list combines current shared event details with the caller's personal experience, using stable automatic IDs until an experience is saved. `?from=<eventId>` opens this same diary entry. An unambiguous existing personal record for a matching catalog edition is reused instead of duplicated. Reads do not create records or change accounts.

Shared name, dates, venue, city, event kind and catalog reference come from Rally. Diary forms keep those fields read-only and direct people to Rally for shared edits. Personal attendance, actual sets and companions, spending, ratings, notes and albums remain owner-controlled. Plans always start unconfirmed, including past plans. A personal historical rave needs no project; only upcoming planned entries offer **Plan with friends**. This action creates the room and retains the same diary entry in one transaction. Joining a room makes it available in that person's diary on the next load. Returning to the tab refreshes the list unless a form is open.

Removing an automatic diary entry records a private suppression marker so it does not return on refresh; this does not leave or modify the crew. A subsequent explicit save from the Rally diary link restores it. Saved personal memories remain accessible after losing project membership, but current shared crew information requires membership. Existing free-text names are never automatically associated with accounts.

### Diary naming and dates

The shared planning index is labeled **My raves**; the personal history is **Rave diary**. Existing URLs, account ownership, and saved records are unchanged. Diary forms and date filters accept typed `MM/DD/YYYY` dates (and pasted ISO dates), or a calendar with searchable month/year jumps. Calendar days have 44px touch targets, arrow-key navigation, focus return, and minimum end-date enforcement. Invalid dates cannot be saved; incomplete date filters do not hide results.

### Set labels and artist history

Saved `artists` strings are performance labels. The shared artist helpers derive individual artist credits from explicit B2B / x / × labels and recognized set suffixes such as Detox Set and (DJ Set). Original labels, favorite sets, and JSON backups are preserved; older entries receive the same aggregation without a rewrite. Artist directories, recap totals, and artist filters use individual credits, counting an artist once per rave. CSV exports include both Artists seen and Sets seen. Ambiguous act names, ampersands, and aliases are kept intact; the parser does not guess group membership.

The connected network uses explicit event edition IDs and verified friend identities. Rally event details are projected automatically into private diary views. Shared crew memories use a separate opt-in editor. See `data/UPCOMING.md` for the data model, permissions, and synchronization boundaries.
