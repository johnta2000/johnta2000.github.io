# Diary plans and Rally projects

A diary entry is private and may be planned, attended, or skipped. Its dates determine the Upcoming/Past views; dates never turn a saved plan into attendance. New future entries save as planned. After the event starts, the owner can confirm “I went” or “Didn’t go.”

`plannedArtists` and `plannedCrew` are separate from actual `artists` and `crew`. Confirmation does not copy the wishlist into actual sets. Artist history, crew history, and recap use attended entries only. Upcoming summaries show wishlist counts; the table's entered costs may include prepayments, and recap spending covers attended entries only. JSON backups preserve all fields; CSV includes status, wishlist, and planned crew.

Legacy diary records get a stable interpretation from their original creation date: an event that was future when saved remains planned even after it ends. This interpretation is returned without rewriting accounts. Legacy clients omitting new fields on save retain the existing attendance and planning fields.

Every accessible Rally plan can supply a diary draft, including future plans. The owner can also link a saved diary entry to an accessible plan, or create a new room from it. Creation and diary linking occur in one transaction; retries return the existing room. The owner becomes the room admin. Only event name, dates, city, venue, chosen timezone, and a matched public festival lineup copy to the room. Personal costs, notes, photo links, wishlist, and private crew names stay in the diary. Invitations remain an explicit action in Rally. Each account can keep one personal entry per linked room.

Shared room details and personal diary details remain independent. Editing a diary does not automatically rewrite a room. Explicit two-way updates are now available as described below. Other users' private diary entries are never returned through the room.

Deployment uses `scripts/deploy-rally-diary.cjs`, dry-run by default. It replaces only `rallyCollection.js`, preserving the deployed schema, authentication, runtime, and other live modules. It does not mutate user records during deployment. Do not deploy the whole local Convex checkout.


## Connected rave network

Catalog editions now have an explicit `catalogEventId` reference on diary entries and Rally projects created or connected through reviewed updates. Known legacy titles/dates still recover a catalog match without rewriting stored history. Once chosen, the edition identity survives a personal event nickname; dates, kind, and weekend boundaries still constrain it. `catalogEventId: null` is an explicit custom-event choice, preserved by backups and older-client saves.

Crew connections store a stable person ID plus the originating project/member IDs. Account IDs are opaque, versioned SHA-256 identifiers derived on the backend; raw authentication subjects and email addresses are not returned in these references. Guests retain a project/member identity until their profile is claimed. Server verification accepts only crew from an accessible linked project or the owner's previously validated diary connections. Names alone never create an account connection. Renamed accounts retain their history; two people with the same name remain distinct. Selecting a friend updates only the caller's record. Old free-text names remain usable, and can be associated with a known person by explicitly selecting that person.

Artist nodes use deterministic normalized artist IDs derived from the existing set-credit parser, preserving solo/B2B/special-set labels. `lib/network.ts` derives event, project, entry, person and artist nodes and their edges exclusively from the current user's entries. Actual-set and companion edges use confirmed attendance; planned and skipped entries never create attended history. Crew history is labeled as the owner's own diary, without asserting mutual confirmation or reading another user's diary.

## Reviewed updates

`rallyCollection:connection` reads the owner's entry and authorized crew plan and returns a preview, permitted directions, current set interests, crew, public event details, and a revision. It never scans other users' diaries.

`syncPlan` applies only selected fields and rejects a changed revision. The revision includes the saved entry, relevant project details, lineup, crew, own favorites and own shared memory; even edits in the same millisecond are detected. Refreshing the preview clears update choices.

- Plan → diary: update event details; optionally add the owner's Rally set interests to the personal wishlist and crew members as planned companions. Wishlist/crew updates require a planned entry. They never become actual sets or companions. An attended entry cannot adopt a future date without first being changed to planned by its owner.
- Diary → plan: admins may update shared event metadata and add a public catalog lineup. Members may explicitly share their wishlist as set interests. Existing set IDs, times, stage assignments, other people's interests, tickets, travel, tasks, notes and purchases are preserved. Known, different catalog editions cannot overwrite one another through the connection; create or connect the matching project instead. A diary link can be disconnected without changing its shared plan or published crew memories.
- Actual attendance, personal costs, ratings, private notes and private album links are excluded from sync. A plan-derived draft starts unconfirmed even when its date is past. There is no scheduled or automatic background synchronization.

## Optional shared memories

A separate editor publishes an explicitly entered note and optional album link to the connected Rally crew. It starts blank, or with the caller's already-published memory; it never copies private diary text or albums. Each member can update or clear their own shared memory. Only authorized current crew members can read it, both in the diary connection panel and on the Rally project overview. Removed members lose access. A recycled member ID with a different bound account cannot inherit another author's memory.

Shared notes render as text. Album links permit HTTP(S) only; the album provider's permissions still govern access. Shared memories live in the existing crew room and are independent of private diary entries. No new tables, auth settings, access-policy changes or migration of user records are needed. The scoped deployment adds only `connection`, `syncPlan`, and `shareMemory` to the existing diary module while preserving all other live modules.
