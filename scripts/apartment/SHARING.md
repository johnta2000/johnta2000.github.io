# Temporary guide links

Unlock with the existing guest password, then click Share. The link is prepared in the background after unlock. One click opens the native share sheet where available, or copies the link. If sharing/clipboard access is unavailable, the fallback dialog displays the selectable link. Links expire 24 hours after creation; repeated clicks reuse the ready link until it approaches expiry.

The initial page is a small shell. Password unlock alone downloads guide.json; recipients fetch only the authorized guide. Convex prepares a private, compressed guide snapshot once per encryption key and source version. Issuing another link reuses this snapshot, and opening a shared link no longer fetches/decrypts the public encrypted guide each time. Existing links use the prepared guide too. No public storage URLs are returned.

Tokens live in the fragment and request header. Only token hashes, private guide keys and storage IDs are stored in Convex. Recipient responses contain guide content, never the encryption key or password. Expiration is checked before and after storage retrieval on every request; the page clears at expiry. Downloaded content cannot be recalled. No analytics is loaded on this page.

When updating guide.json, also update apartmentGuideVersion.ts to its SHA-256 hash and the version query in index.html. Existing unexpired links resolve the current guide version on every open; their original tokens and expiration times stay unchanged. No private plaintext content belongs in public source.

Deploy the backend first with scripts/apartment/deploy-sharing.cjs (dry run), then --apply. It preserves unrelated deployed modules, tables and routes. Call the internal apartmentShareHttp:warm action as an administrator before publishing, so existing links and first-time clicks use a ready private snapshot. No keys or guide content should be logged.

Verify with node --test scripts/apartment/sharing.test.cjs (requires an installed Playwright browser; PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH can select an existing executable). Tests use synthetic content and verify one-click native/clipboard sharing, fallback URLs, direct/refresh/back navigation, small initial HTML, no recipient ciphertext download, private cache reuse and expiration before/after file reads.
