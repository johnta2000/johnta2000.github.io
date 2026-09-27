# Site development instructions

## Dropdowns and selectors

- Every dropdown selector added or changed on this site must include a visible, typeable search field when opened, even for short option lists. Filter options as the user types and show a helpful empty state when nothing matches.
- Use the shared picker in `assets/js/searchable-select.js` and `assets/css/searchable-select.css` for single-choice selects. Call `SearchableSelect.enhance(select)` after the select exists; keep the native select as the form value, listen for its `change` event, and call the returned `sync()` after assigning its value in code. Give each select a unique ID and an accessible label via `aria-labelledby` or `aria-label`.
- Design dropdowns to match the surrounding page: clean typography, consistent spacing and rounded corners, a subtle border/shadow, a clear chevron, and distinct selected, hover, focus, and disabled states. Avoid falling back to an unstyled native option menu.
- Support keyboard navigation, Enter to choose, Escape to dismiss, sensible focus return, and screen-reader labels/selection state. Touch options and mobile triggers must be at least 44px tall. Keep the menu inside the visible viewport, including in dialogs and when the phone keyboard is open.
- Preserve form values, disabled states, and dynamic option updates. Verify the opened picker and search behavior at phone and desktop sizes before publishing.
- Free-text fields with suggestions must remain typeable and allow new values when appropriate. Date/month inputs and third-party authentication widgets are separate controls; do not replace those with a searchable list.

## Payments tracker

- The canonical route is `/tools/payments/`; preserve the redirect from `/tools/card-payments/`.
- Preserve the compact desktop bank-by-person matrix and the mobile layout with payment status beside the bank/account details.
- Test payment changes with mock data. Never change real payment logs just to exercise the UI.

## Payment questions

- `/tools/payment/questions/` is a separate private charge/reimbursement inbox linked from Payments. Keep its access policy separate from the monthly checklist; only the two owner emails are approved by default.
- Screenshots are private. Upload and retrieve them through the authenticated `payment-question-file` endpoint; never publish user images in the Git repository or return public storage URLs.
- Charge amount, expected reimbursement, and money actually received are distinct. Resolving a question does not record a payment. Preserve notes and status changes in the activity history.
- Test with synthetic images and mock records. Import real financial screenshots only with explicit permission.
- The local Convex checkout can differ from the deployed backend. Preserve unrelated deployed modules, routes, and tables when publishing this tool; do not deploy a stale full checkout.
