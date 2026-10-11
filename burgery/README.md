# Burgery

The public ledger lives at `/burgery/`. The UI is buildless HTML/CSS/ES modules; trips, orders, receipt photos, scan results, and reviewed data are stored in the existing `rapid-shark-565` Convex deployment.

## Interface direction

Keep Burgery fun and direct: one compact header, actions, stats, and rankings. Skip hero sections, duplicate branding, taglines, and promotional preambles; keep the fun in the rankings and superlatives. Put counting definitions in optional details, while keeping receipt privacy and confirmation instructions visible.

The four primary ranking tabs are Patties, Burgers, Patties/Trip, and Burgers/Trip. Trips is the only header navigation link. Burger totals use known entries; burger averages require complete known counts for a person on a trip.

Keep Log order, Upload receipt, and Receipt inbox under one Add action in the navbar. Show sign-in at the submission/private-inbox gate and sign-out inside the authenticated receipt inbox; keep the public navbar free of account controls. Stats remain public, while submissions and private receipt access require an account. Public superlatives cover total patties and patties per trip; omit an attendance award while the ledger is owner-led.

On mobile, keep ranking rows compact: inline count/unit, shortened trip details beside names when space permits, natural wrapping for longer names, and a thin comparison bar. Preserve full metric descriptions in accessible row labels and in desktop layouts.

Overview cards show breakdowns on hover, keyboard focus, or tap. Patties and nutrition show totals by trip, averages per trip and distinct person, and the top three contributors. Nutrition uses the existing patty-only estimates (110 kcal, 90 mg sodium, 6 g fat, and 10 g protein per patty). Trips shows distinct people and places, average attendance, and each trip's attendance and patties. Keep these details in a dismissible popover so the overview stays compact.

## Data conventions

- A burger is one sandwich. Patties and cheese are separate counts.
- The imported older trips track only patties. Their burger counts remain unknown and are excluded from burger averages. Zero is a known count and includes that trip in the denominator.
- Burgers per trip counts only trips where all of that person's entries have known burger counts. Multiple orders on the same trip use one denominator.
- Niteharts, San Diego, October 2026: Henry Trinh 1 burger / 2 patties; Jessi Hu 0 / 0; John Ta 4 / 6 (two 2×1s plus two hamburgers); Danny Tang 1 / 2 (Double-Double). Total: 6 burgers, 10 patties.
- Public read endpoints project names, orders, counts, and receipt-confirmed flags. Original photos, receipt amounts, machine drafts, and submitter IDs stay private.

## Receipt workflow

Sign in using the existing Clerk instance. Any signed-in member with a verified site identity can create trips, log orders, or upload a JPEG/PNG/WebP receipt up to 8 MB. Photos are uploaded to the authenticated `/burgery-receipt` endpoint, stored in Convex, and never receive a public storage URL.

A scheduled internal scanner reads the photo using OpenAI Responses structured output. It never assigns diners automatically. The submitter corrects the items, splits shared lines, assigns each burger, and explicitly checks and confirms the result. Human drafts can be saved for later. Confirmed receipts are immutable. New receipt orders are aggregated once per person; receipts attached to an existing order must match its name and counts and do not create duplicate orders.

- Configure `OPENAI_API_KEY` in the Convex deployment environment, never in frontend code or Git.
- Optionally set `BURGERY_RECEIPT_MODEL` (default `gpt-4o-mini`).
- Without a key, uploads are retained and the UI offers manual review.
- Scan failures and timeouts can be retried; the original machine extraction is kept separately from human corrections.
- File hashes reject duplicate receipts, request keys make uncertain network retries safe, and revision checks prevent stale corrections from overwriting another device.
- Archived unconfirmed drafts remain stored. Photos are sent to OpenAI for processing with `store: false`.

## Validation and release

Run `node --test burgery/tests/logic.test.cjs`. Tests use synthetic data and mocked provider responses. Browser QA covers desktop and phone layouts, searchable pickers, manual entry, split allocations, saved reviews, and explicit confirmation with a temporary local fixture.

The local Convex checkout contains unrelated changes and is not the complete deployed backend. **Do not run a normal full-checkout deploy for this feature.** Use `node scripts/burgery/deploy.cjs` for a dry run or add `--publish` to release. The helper snapshots the live backend, preserves its modules/schema/routes, typechecks Burgery separately, verifies that the live snapshot has not changed, and adds only Burgery. It imports the four starter trips idempotently after deployment. Credentials remain in memory. Publish the static `/burgery/` files plus the shared searchable-select assets through the existing GitHub Pages site.

Official implementation references: [Convex uploads](https://docs.convex.dev/file-storage/upload-files), [scheduled functions](https://docs.convex.dev/scheduling/scheduled-functions), [OpenAI vision](https://developers.openai.com/api/docs/guides/images-vision), and [structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs).

## Structured burger customizations

`customizations.js` is shared by the frontend, Convex validators, and scan schema. Each burger type has a quantity, patties and cheese per burger, and canonical customization IDs with an amount (`regular`, `light`, `extra`, `double_extra`, or `no`). Preparation options such as extra toast accept only the standard amount. Create separate groups when burgers have different recipes. Manual entry totals derive from those groups; receipt confirmation retains them in the public entry without private prices or notes.

The catalog separates chopped chilies from whole peppers, onion preparations, toast, wraps/styles, sauces, and vegetables. Official terminology and Animal Style components come from In-N-Out's nutrition and Not So Secret Menu pages. Generic peppers/onions retain an unspecified preparation; unrecognized scan text stays in Other notes for human review. Empty choices mean unrecorded; explicitly select No customizations only when confirmed. The collapsed customization stats count sandwiches by quantity and exclude missing details. Animal Style components are expanded for stats, with explicit choices taking precedence.

The `updateNitehartsDetails` internal migration changes only the four original seed entries and refuses changed counts or receipt-linked entries. Publish with `node scripts/burgery/deploy.cjs --publish --update-niteharts`; the helper snapshots and namespaces existing dependencies separately by runtime, validates preservation and concurrent changes, and replaces only Burgery's schema tables and receipt routes. Run without flags for a dry-run.
