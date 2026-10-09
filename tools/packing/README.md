# Packing

Private packing checklist at `/tools/packing/`, linked from the authenticated app directory only after `packing:verify` approves the account.

**Add trip** creates a fresh checklist immediately and focuses its editable name. Each trip keeps its own items and checkmarks. Click an item’s text or checkbox to pack it. The pencil opens inline editing; Enter or leaving the field saves, and Escape cancels. Add or remove items within each section, and use Remaining only while packing. Deleting a trip requires confirmation; Escape cancels the dialog.

**Default checklist** edits the starting list for future trips. Existing trips keep their own copies, and new trips always start unchecked.

The backend permits only `johnta2018@gmail.com` through the existing `https://clerk.john-ta.com` identity provider. Every query and mutation checks the owner before reading or writing data. Explicitly unverified identities, other issuers, unapproved accounts, and signed-out visitors are denied. The pinned issuer’s email-code verification flow can omit the optional verification claim, consistent with the existing personal tools.

Lists save to the private `packingWorkspaces` table on the existing `rapid-shark-565` Convex deployment. Saves are serialized and versioned to prevent overwriting another device’s changes. Failed saves retain the latest pending draft in memory and show Retry save and Download unsaved list controls. A conflict requires reviewing the saved version instead of overwriting it. Sign-out clears rendered lists and drafts; late network responses cannot reopen the tool. No trip data or browser tokens are published in the repository.

The earlier file preview’s `jt-packing-v1` browser storage is left untouched. File-preview data does not automatically transfer to the production origin.

Serve the static files from the repository root. Production Clerk sign-in requires the configured `john-ta.com` origin. There is no authentication bypass for file or localhost previews. No frontend build or dependency changes are needed.

Run `node --test tools/packing/tests/*.test.cjs login/tests/access.test.cjs`. The tests cover checklist interactions, exact-owner authorization, private reads and writes, stale versions, failed-save retry, and session-change races using synthetic records. They do not modify real packing data.

Deploy backend updates from a current deployed baseline: this checkout serves multiple services and can contain unrelated changes. Preserve existing functions, HTTP routes, and schema tables, and add only Packing’s modules and table. The initial release uses an isolated production Git checkout and a deployment snapshot. The broader local TypeScript check retains three existing errors in `rally.ts` and `standups.ts`, with no Packing errors.
