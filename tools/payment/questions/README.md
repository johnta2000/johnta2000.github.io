# Payment Questions

Private notes use the existing question allowlist, rich text editor and Inbox / Waiting / Done queues. Delete note moves a note to recoverable Trash and retains its screenshots and history.

## Expiring recipient links

Choose **Share → Create 7-day link**, then copy the link. Each creation generates a separate 32-byte random capability. Authorized owners can copy active links again or disable them. Recipients need no account and can only view that question's latest saved note, current screenshots, status and payment details. Earlier edit history, author emails and other questions stay private.

The recipient URL stores its token in the fragment. Read-only requests send it in `X-Payment-Share-Token` to `/payment-question-share` or `/payment-question-share-file`. The server checks note ownership, Trash state, link revocation and fixed expiration for each request. Both HTTP actions check the current clock outside query caching. Image reads validate the file belongs to that question. No public storage URLs are returned. Responses use `no-store`; the recipient page has no Clerk, third-party scripts, referrers or browser persistence. It clears visible content at expiration and rechecks access when reopened or focused.

Trash revokes every existing link permanently. Restoring a note allows new links; it does not reactivate old ones. Link expiration is fixed at creation and never extended by copying, opening or retrying creation.

Keep live tokens and financial data out of public source and tests. Use synthetic notes and images for verification. Preserve the deployed backend's unrelated modules, routes and tables when deploying.
