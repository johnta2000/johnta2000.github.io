# Expiring contact lists

Each group has a stable `/tools/contacts/<opaque-group-id>/` page. This is intentionally accessible to anyone with its link until expiry, without a passcode. The public repository contains the page shell only. Contact records and the enforced expiry are held in the private backend `CONTACT_SHARE_GROUPS` setting, keyed by group ID. Do not put names, numbers or generated vCards into public assets.

The `/contact-share` HTTP action checks server time for every view and download. Responses use `no-store`; expired records return HTTP 410 without contacts. The client also clears its visible list at the deadline. Downloaded files and saved address-book entries remain on recipients' devices.

The query parameter `pick` stores selected opaque contact IDs. It supports refresh, copied links and browser history without putting names or numbers in the URL. Contact lists are read-only.

Run `node --test tools/contacts/tests/*.test.cjs` for backend expiry, selection, vCard and browser tests. Test fixtures use synthetic contacts. `scripts/contacts/deploy.cjs` defaults to a dry run and applies only the contact HTTP module and a narrow route addition to the current live router, preserving live schema and unrelated modules. `--apply` deploys the reviewed change.
