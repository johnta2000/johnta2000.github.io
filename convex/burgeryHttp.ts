import { httpAction } from "./_generated/server";
import { anyApi } from "convex/server";
const origins = ["https://www.john-ta.com", "https://john-ta.com", "http://127.0.0.1:8765", "http://localhost:8765"];
function headers(request: Request) {
  const origin = request.headers.get("Origin") || "";
  return { "Access-Control-Allow-Origin": origins.includes(origin) ? origin : origins[0], "Access-Control-Allow-Headers": "Authorization, Content-Type, X-File-Name, X-Request-Key", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Cache-Control": "no-store", Vary: "Origin", "X-Content-Type-Options": "nosniff" };
}
export const preflight = httpAction(async (_ctx, request) => new Response(null, { status: 204, headers: headers(request) }));
export const receipt = httpAction(async (ctx, request) => {
  const h = headers(request);
  try {
    const url = new URL(request.url);
    if (request.method === "GET") {
      const id = url.searchParams.get("id");
      if (!id) throw Error("Receipt not found.");
      const r = await ctx.runQuery(anyApi.burgery.receiptFile, { id });
      const blob = await ctx.storage.get(r.storageId);
      if (!blob) throw Error("Receipt not found.");
      return new Response(blob, { headers: { ...h, "Content-Type": r.type, "Content-Disposition": "inline" } });
    }
    const tripId = url.searchParams.get("tripId"), targetEntryId = url.searchParams.get("entryId") || undefined;
    if (!tripId) throw Error("Trip not found.");
    const owner = await ctx.runQuery(anyApi.burgery.checkUpload, { tripId, targetEntryId });
    const type = request.headers.get("Content-Type") || "";
    if (!["image/jpeg", "image/png", "image/webp"].includes(type)) throw Error("Choose a JPEG, PNG, or WebP receipt photo.");
    if (Number(request.headers.get("Content-Length")) > 8 * 1024 * 1024) throw Error("Receipts must be under 8 MB.");
    const blob = await request.blob();
    if (!blob.size || blob.size > 8 * 1024 * 1024) throw Error("Receipts must be under 8 MB.");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const valid = type === "image/png" ? [137,80,78,71,13,10,26,10].every((b,i) => bytes[i] === b) : type === "image/jpeg" ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 : String.fromCharCode(...bytes.slice(0,4)) === "RIFF" && String.fromCharCode(...bytes.slice(8,12)) === "WEBP";
    if (!valid) throw Error("This file is not a supported receipt image.");
    const sha256 = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(b => b.toString(16).padStart(2,"0")).join("");
    const storageId = await ctx.storage.store(blob);
    try {
      const result = await ctx.runMutation(anyApi.burgery.recordUpload, { owner, tripId, targetEntryId, storageId, type, size: blob.size, sha256, name: decodeURIComponent(request.headers.get("X-File-Name") || "Receipt").slice(0,160), requestKey: request.headers.get("X-Request-Key") || "" });
      if (result.reused) await ctx.storage.delete(storageId);
      return new Response(JSON.stringify(result), { headers: { ...h, "Content-Type": "application/json" } });
    } catch (error) { await ctx.storage.delete(storageId); throw error; }
  } catch (error) {
    const raw = error instanceof Error ? error.message : "";
    const recognized = raw.match(/(?:Sign in to add[^\n]*|Receipt not found\.|Trip not found\.|Choose one of your entries[^\n]*|This entry already[^\n]*|Daily receipt limit[^\n]*|This receipt has already[^\n]*|Choose a JPEG[^\n]*|Receipts must[^\n]*|This file is not[^\n]*|Invalid submission identifier\.)/);
    return new Response(recognized?.[0] || "Could not save the receipt. Keep your photo and try again.", { status: /Sign in/.test(raw) ? 401 : 400, headers: h });
  }
});
