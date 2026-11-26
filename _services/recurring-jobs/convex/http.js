import { httpRouter, httpActionGeneric as httpAction, makeFunctionReference } from "convex/server";

const http = httpRouter();
http.route({ path: "/inventory", method: "POST", handler: httpAction(async (ctx, req) => {
  const secret = process.env.JOBS_SYNC_KEY;
  if (!secret || req.headers.get("authorization") !== "Bearer " + secret) {
    return new Response(null, { status: 403 });
  }
  const input = await req.text();
  if (input.length > 500000) return new Response(null, { status: 413 });
  const { jobs, checkedAt } = JSON.parse(input);
  if (!Number.isSafeInteger(checkedAt) || checkedAt > Date.now() + 60000 || !Array.isArray(jobs)) {
    return new Response(null, { status: 400 });
  }
  await ctx.runMutation(makeFunctionReference("jobs:replace"), { jobs, checkedAt });
  return new Response(null, { status: 204 });
}) });
export default http;
