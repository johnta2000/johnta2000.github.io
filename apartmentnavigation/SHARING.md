# Temporary guide links

Unlock with the existing guest password, then click Share · 24 hours and Create 24-hour link. Each unique link expires 24 hours after creation. Recipients need no password and cannot create new links. Existing password access is unchanged.

The token lives in the URL fragment and a request header. Convex stores only its hash, the expiration, and the private derived encryption key. Recipient responses contain decrypted guide content, never the guide key or password. Server expiration is checked on every read and again after decrypting. The page clears at expiration; downloaded or copied content cannot be recalled. No analytics is loaded on this page.

The encrypted guide.json is an exact copy of the encryptedPage payload already in index.html. Keep both in sync when updating the encrypted guide or password. No private plaintext content belongs in public source.

Backend: apartmentSharing.ts, apartmentShareHttp.ts, apartmentShareLinks table, /apartment-share GET/POST/OPTIONS. Production is rapid-shark-565. scripts/apartment/deploy-sharing.cjs preserves all current deployed modules and schema when applying this focused change; run without --apply first for a dry run. Credentials stay in memory.
