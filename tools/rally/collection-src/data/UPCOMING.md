# Diary plans and Rally projects

A diary entry is private and may be planned, attended, or skipped. Its dates determine the Upcoming/Past views; dates never turn a saved plan into attendance. New future entries save as planned. After the event starts, the owner can confirm “I went” or “Didn’t go.”

`plannedArtists` and `plannedCrew` are separate from actual `artists` and `crew`. Confirmation does not copy the wishlist into actual sets. Artist history, crew history, and recap use attended entries only. Upcoming summaries show wishlist counts; the table's entered costs may include prepayments, and recap spending covers attended entries only. JSON backups preserve all fields; CSV includes status, wishlist, and planned crew.

Legacy diary records get a stable interpretation from their original creation date: an event that was future when saved remains planned even after it ends. This interpretation is returned without rewriting accounts. Legacy clients omitting new fields on save retain the existing attendance and planning fields.

Every accessible Rally rave appears in the diary automatically, using the same current event details. A query projects the caller's authorized rooms and personal records into one view; it does not create copies for every member. Stable IDs make the first personal save idempotent. One unambiguous personal entry for the same catalog edition is reused. Existing records are retained without a bulk migration.

Personal entries can still exist without a Rally room. Only upcoming planned entries offer **Plan with friends**. This explicitly creates a room containing shared event details and public catalog lineup, never personal costs, notes, albums or other private fields. Historical memories never create projects. The shared-detail fields are edited in Rally; diary edits cannot overwrite them with stale values.

Deployment uses `scripts/deploy-rally-diary.cjs`, dry-run by default. It replaces only `rallyCollection.js`, preserving the deployed schema, authentication, runtime, and other live modules. It does not mutate user records during deployment. Do not deploy the whole local Convex checkout.


## Connected rave network

Catalog editions now have an explicit `catalogEventId` reference on diary entries and Rally projects created through Plan with friends. Known legacy titles/dates still recover a catalog match without rewriting stored history. Once chosen, the edition identity survives a personal event nickname; dates, kind, and weekend boundaries still constrain it. `catalogEventId: null` is an explicit custom-event choice, preserved by backups and older-client saves.

Crew connections store a stable person ID plus the originating project/member IDs. Account IDs are opaque, versioned SHA-256 identifiers derived on the backend; raw authentication subjects and email addresses are not returned in these references. Guests retain a project/member identity until their profile is claimed. Server verification accepts only crew from an accessible linked project or the owner's previously validated diary connections. Names alone never create an account connection. Renamed accounts retain their history; two people with the same name remain distinct. Selecting a friend updates only the caller's record. Old free-text names remain usable, and can be associated with a known person by explicitly selecting that person.

Artist nodes use deterministic normalized artist IDs derived from the existing set-credit parser, preserving solo/B2B/special-set labels. `lib/network.ts` derives event, project, entry, person and artist nodes and their edges exclusively from the current user's entries. Actual-set and companion edges use confirmed attendance; planned and skipped entries never create attended history. Crew history is labeled as the owner's own diary, without asserting mutual confirmation or reading another user's diary.

## Automatic event views

`rallyCollection:list` reads the authenticated owner's diary and authorized Rally rooms through existing indexes. Shared event details are projected at read time. Membership never implies attendance or actual sets/companions. Existing saved experiences survive revoked room access, while unsaved automatic entries disappear. Private removal markers keep deleted entries from reappearing. Import/export preserve personal data and account checks.

`rallyCollection:connection` reads the same automatic or saved entry and its authorized crew, with a revision used for explicit memory sharing. `syncPlan` remains exported for old clients but directs them to refresh: manual synchronization is retired. No record migration, scheduled synchronization, new tables, or auth changes are required.

## Optional shared memories

A separate editor publishes an explicitly entered note and optional album link to the connected Rally crew. It starts blank, or with the caller's already-published memory; it never copies private diary text or albums. Each member can update or clear their own shared memory. Only authorized current crew members can read it, both in the diary connection panel and on the Rally project overview. Removed members lose access. A recycled member ID with a different bound account cannot inherit another author's memory.

Shared notes render as text. Album links permit HTTP(S) only; the album provider's permissions still govern access. Shared memories live in the existing crew room and are independent of private diary entries. No new tables, auth settings, access-policy changes or migration of user records are needed. The scoped deployment adds only `connection`, `syncPlan`, and `shareMemory` to the existing diary module while preserving all other live modules.
