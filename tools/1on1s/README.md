# Private monthly reflections

Route: `/tools/1on1s/`. Independent of the existing shared daily standups.

The verified Clerk email must be exactly `johnta2018@gmail.com`. The signed Convex JWT must include `email`. Explicit failed verification is denied. A missing `email_verified` claim is accepted only from `https://clerk.john-ta.com`, whose live configuration requires email-code verification at signup and email-code sign-in (verified during this release). Other issuers must supply `email_verified: true`. On first use, the owner chooses a separate nonempty password (up to 256 characters, with no minimum length requirement), confirmed in the UI. Convex stores a salted scrypt hash, never the password. Five password attempts are allowed per fifteen-minute window. Password setup is atomic and cannot replace an existing password.

Each read/write requires the authenticated owner and an opaque, subject-bound, one-hour unlock token. Only its SHA-256 hash is stored in Convex. The browser keeps the token in memory, never localStorage/sessionStorage. Lock revokes the token and clears the visible journal; reload requires unlocking. Expired sessions keep unsaved drafts only in tab memory for recovery after unlocking; closing/reloading loses those drafts and triggers a warning. This is access control, not end-to-end encryption; backend administrators can access the stored entries.

Entries are scoped by person (Vish, Jenny, or Vivek) and month, with five answers, monthly scratchpad notes, and follow-ups. The previous saved month for that same person appears alongside the current entry. Existing entries with no person remain in Unassigned; the owner can explicitly move them using Assign this entry. Moves reject occupied destinations and stale revisions. Old clients without a person continue to access only Unassigned entries. Autosave uses revision checks to reject overwrites from stale tabs. Failed saves retain edits and block month navigation.

## Validation

From the repository root:

```sh
node --test tools/1on1s/tests/*.test.cjs
node --check tools/1on1s/app.js
```

The tests use synthetic data and mocked authentication/Convex transport. Browser tests require Playwright Chromium. They do not access production notes.

## Release

The backend was deployed on October 5, 2026, using the current live modules as its baseline. All existing entry modules were retained, with only the journal modules and three tables added. Read-only live checks confirmed owner access and rejected signed-out, wrong-email, explicitly unverified, and missing-password-session requests. No journal records or password were created by release checks. For future releases, deploy the four `monthlyJournal*.ts` files and schema integration from a checkout reconciled against the live deployment. Publish the frontend after the backend is ready. The backend uses the existing `rapid-shark-565` deployment and production Clerk instance. Validate real sign-in and verified-email claims on the configured site origin before entering private notes. Do not deploy the whole existing working tree blindly: it contains unrelated changes.

If the password is forgotten, recovery requires a deliberate administrator operation to remove the journal security record and revoke all journal sessions before configuring a new password. No client password-reset bypass is exposed.

## Monthly overview

The sidebar shows a saved editorial overview for the selected person and month: a short synthesis, progress themes, and open follow-ups. There is no AI API integration or API key requirement. Overview text is stored privately in Convex, never in the public repository. September 2026 summaries were prepared from the selected person's standups. Refresh reloads saved content; it does not regenerate a summary.

`monthlyJournalRecap:read` requires both journal gates. An internal-only `publishOverview` mutation imports summaries into `monthlyJournalOverviews`, validates each source against person, month and team, and never edits journal notes or standups. Existing daily-source reads remain available in the backend. Pending responses are discarded when the journal locks or the person/month changes.

## Rich text

All seven editors support bold, italic, underline, bulleted and numbered lists, indentation, undo/redo, and sanitized rich-text paste. Entries use `contentFormat: html`; legacy entries without this field are rendered as literal plain text so angle brackets and line breaks remain intact. Formatting survives month/person changes, assignments, and the previous-entry view. HTML is sanitized on paste, load, save, and rendering using a restricted tag/attribute allowlist; executable content and non-HTTP/mailto links are removed.

## Editor interface

The private frontend presents each monthly entry as a document with a scratchpad, the five conversation prompts, and follow-ups. Each section has a visible formatting toolbar with headings, bold/italic/underline, lists, quotes, links, undo/redo, and clear formatting. The link control supports Ctrl/Cmd+K and accepts only HTTP(S) or mailto links. The editor shows a word count and active formatting state. Mobile controls wrap so every command remains reachable without horizontal scrolling. The existing autosave, rich HTML format, and backend access policy are unchanged.
