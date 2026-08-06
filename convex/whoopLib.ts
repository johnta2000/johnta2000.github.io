const WHOOP_API_BASE = "https://api.prod.whoop.com";

export type WhoopTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  token_type?: string;
};

export function whoopConfig() {
  const clientId = requiredEnv("WHOOP_CLIENT_ID");
  const clientSecret = requiredEnv("WHOOP_CLIENT_SECRET");
  return {
    clientId,
    clientSecret,
    redirectUri:
      process.env.WHOOP_REDIRECT_URI ||
      "https://rapid-shark-565.convex.site/whoop/callback",
    appUrl:
      process.env.SLEEP_APP_URL ||
      "https://www.john-ta.com/tools/sleep/",
  };
}

export function buildWhoopAuthorizationUrl(state: string) {
  const config = whoopConfig();
  const url = new URL(`${WHOOP_API_BASE}/oauth/oauth2/auth`);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "offline read:sleep");
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeAuthorizationCode(code: string) {
  const config = whoopConfig();
  return requestTokens({
    grant_type: "authorization_code",
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
  });
}

export async function refreshWhoopTokens(refreshToken: string, scope: string) {
  const config = whoopConfig();
  return requestTokens({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    scope: scope || "offline read:sleep",
  });
}

async function requestTokens(values: Record<string, string>) {
  const response = await fetch(`${WHOOP_API_BASE}/oauth/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(values),
  });
  const payload = (await response.json()) as WhoopTokenResponse & {
    error?: string;
    error_description?: string;
  };
  if (!response.ok || !payload.access_token) {
    throw new Error(
      payload.error_description || payload.error || "WHOOP token exchange failed.",
    );
  }
  return payload;
}

export async function encryptWhoopToken(value: string) {
  const key = await tokenEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(value),
  );
  return `${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(ciphertext))}`;
}

export async function decryptWhoopToken(value: string) {
  const [ivPart, ciphertextPart] = value.split(".");
  if (!ivPart || !ciphertextPart) throw new Error("Invalid encrypted WHOOP token.");
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(ivPart) },
    await tokenEncryptionKey(),
    base64ToBytes(ciphertextPart),
  );
  return new TextDecoder().decode(plaintext);
}

async function tokenEncryptionKey() {
  const secret = new TextEncoder().encode(requiredEnv("WHOOP_CLIENT_SECRET"));
  const digest = await crypto.subtle.digest("SHA-256", secret);
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export { WHOOP_API_BASE };
