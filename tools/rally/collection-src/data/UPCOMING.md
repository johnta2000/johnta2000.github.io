# Diary plans and Rally projects

A diary entry is private and may be planned, attended, or skipped. Its dates determine the Upcoming/Past views; dates never turn a saved plan into attendance. New future entries save as planned. After the event starts, the owner can confirm “I went” or “Didn’t go.”

`plannedArtists` and `plannedCrew` are separate from actual `artists` and `crew`. Confirmation does not copy the wishlist into actual sets. Artist history, crew history, and recap use attended entries only. Upcoming summaries show wishlist counts; the table's entered costs may include prepayments, and recap spending covers attended entries only. JSON backups preserve all fields; CSV includes status, wishlist, and planned crew.

Legacy diary records get a stable interpretation from their original creation date: an event that was future when saved remains planned even after it ends. This interpretation is returned without rewriting accounts. Legacy clients omitting new fields on save retain the existing attendance and planning fields.

Every accessible Rally plan can supply a diary draft, including future plans. The owner can also link a saved diary entry to an accessible plan, or create a new room from it. Creation and diary linking occur in one transaction; retries return the existing room. The owner becomes the room admin. Only event name, dates, city, venue, chosen timezone, and a matched public festival lineup copy to the room. Personal costs, notes, photo links, wishlist, and private crew names stay in the diary. Invitations remain an explicit action in Rally. Each account can keep one personal entry per linked room.

Shared room details and personal diary details are snapshots with a link, not an automatic two-way rewrite. Editing a diary never rewrites a shared room. Other users' diary entries are never shared through the room.

Deployment uses `scripts/deploy-rally-diary.cjs`, dry-run by default. It replaces only `rallyCollection.js`, preserving the deployed schema, authentication, runtime, and other live modules. It does not mutate user records during deployment. Do not deploy the whole local Convex checkout.
