# Private monthly reflections

Route: `/tools/1on1s/`. Independent of the existing shared daily standups.

The verified Clerk email must be exactly `johnta2018@gmail.com`. The signed Convex JWT must include `email`. Explicit failed verification is denied. A missing `email_verified` claim is accepted only from `https://clerk.john-ta.com`, whose live configuration requires email-code verification at signup and email-code sign-in (verified during this release). Other issuers must supply `email_verified: true`. On first use, the owner chooses a separate nonempty password (up to 256 characters, with no minimum length requirement), confirmed in the UI. Convex stores a salted scrypt hash, never the password. Five password attempts are allowed per fifteen-minute window. Password setup is atomic and cannot replace an existing password.

Each read/write requires the authenticated owner and an opaque, subject-bound, one-hour unlock token. Only its SHA-256 hash is stored in Convex. The browser keeps the token in memory, never localStorage/sessionStorage. Lock revokes the token and clears the visible journal; reload requires unlocking. Expired sessions keep unsaved drafts only in tab memory for recovery after unlocking; closing/reloading loses those drafts and triggers a warning. This is access control, not end-to-end encryption; backend administrators can access the stored entries.

Entries have five answers, monthly scratchpad notes, and follow-ups. The previous saved month appears alongside the current entry. Autosave uses revision checks to reject overwrites from stale tabs. Failed saves retain edits and block month navigation.

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
