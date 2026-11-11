# Shared standup revenue

General displays the selected day's month-to-date revenue snapshot. Compliance,
acquisition commissions and Nextcard subscriptions are separate revenue sources.
BOFA acquisition commissions include both per-acquisition revenue and the monthly
BOFA payment. Never add a subtotal to its underlying line items.

Amounts are integer cents; counts are whole numbers. Blank values remain unknown,
including Bilt revenue, and are excluded from totals. Monthly targets are shared
across snapshots for that month. New dates can begin with the latest earlier
snapshot in the same month; a new month starts blank.

The update form autosaves private recoverable drafts to Convex. Save update
publishes a versioned shared snapshot. Conflicting writes cannot silently replace
another snapshot or draft. A temporary browser recovery copy covers failed saves;
the shared backend remains the primary store. No private values belong in URLs.

Examples of directly navigable views:

- `?view=general&date=2026-11-11`
- `?view=general&date=2026-11-11&revenue=edit`
- `?view=general&date=2026-11-11&revenue=history`
- `?view=Vivek&date=2026-11-11&tab=comments`

Authentication preserves these destinations. Browser Back/Forward and reload
restore the selected date, person, mobile tab, revenue form/history, Spotlight,
and saved comment threads. Each history row is a real dated link.

`node scripts/standups/deploy-revenue.cjs` validates against the current deployed
backend; add `--apply` to publish. It preserves unrelated deployed modules, tables,
and authentication and creates a private local backup before changing anything.
`import-revenue.cjs PRIVATE_FILE --apply` imports an authorized initial snapshot
through an internal function and refuses to overwrite an existing date. Keep
actual revenue data out of source control.
