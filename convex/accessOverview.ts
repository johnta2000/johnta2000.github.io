import { query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";

const OWNERS = ["johnta2018@gmail.com", "john@affil.ai"];
const SETTINGS = new Set(["CARD_PAYMENTS_ALLOWED_EMAIL", "PAYMENT_QUESTIONS_ALLOWED_EMAIL", "SLEEP_ALLOWED_EMAIL", "STANDUPS_ALLOWED_EMAIL", "MONITORING_ALLOWED_EMAIL", "CARD_PAYMENTS_WORKSPACE_OWNER"]);

type Area = {
  id: string; name: string; href: string; scope: string; audience: string[];
  source: string; evidence: string; read: string; edit: string; manage: string; boundary: string;
  setting?: string; extraAudience?: string[]; requiredSettings?: string[];
  attention?: boolean;
};
type Finding = { id: string; severity: string; title: string; detail: string; next: string; evidence: string; affects: string[] };
type Policy = { tools: Area[]; findings: Finding[]; policyReviewedAt: string; limitations: string };

export async function requireAccessOwner(ctx: Pick<QueryCtx, "auth">) {
  const identity = await ctx.auth.getUserIdentity();
  const verified = identity?.emailVerified === true ||
    (identity?.emailVerified === undefined && identity?.issuer === "https://clerk.john-ta.com");
  const email = identity?.email?.trim().toLowerCase();
  if (!identity?.subject || !verified || !OWNERS.includes(email || "")) throw new Error("This account is not authorized to view site access.");
  return { email: email! };
}
function setting(name: string | undefined): string | undefined {
  if (!name) return undefined;
  if (!SETTINGS.has(name)) throw new Error("The access inventory has an unsupported setting.");
  return process.env[name];
}
function emails(value: string | undefined) {
  return [...new Set((value || "").split(",").map(email => email.trim().toLowerCase()).filter(Boolean))].sort();
}
function policy(): Policy {
  const parts = Number(process.env.ACCESS_OVERVIEW_POLICY_PARTS);
  if (!Number.isInteger(parts) || parts < 1 || parts > 8) throw new Error("The access inventory is not configured.");
  let json = "";
  for (let n = 1; n <= parts; n++) {
    const part = process.env[`ACCESS_OVERVIEW_POLICY_${n}`];
    if (!part) throw new Error("The access inventory is incomplete.");
    json += part;
  }
  const value = JSON.parse(json) as Policy;
  if (!Array.isArray(value.tools) || value.tools.length > 100 || !Array.isArray(value.findings) || typeof value.limitations !== "string" || typeof value.policyReviewedAt !== "string") throw new Error("The access inventory is invalid.");
  for (const tool of value.tools) {
    if (!/^[a-z0-9-]+$/.test(tool.id) || !Array.isArray(tool.audience) || tool.audience.some(email => typeof email !== "string") || ["name", "href", "scope", "source", "evidence", "read", "edit", "manage", "boundary"].some(field => typeof tool[field as keyof Area] !== "string")) throw new Error("The access inventory is invalid.");
  }
  return value;
}

export const verify = query({ args: {}, handler: requireAccessOwner });
export const overview = query({ args: {}, handler: async ctx => {
  const viewer = await requireAccessOwner(ctx);
  // The reviewed inventory is private server configuration, not public site source.
  // This report does not replace or change any tool's enforcement.
  const inventory = policy();
  const tools = inventory.tools.map(tool => {
    const { setting: key, extraAudience = [], requiredSettings } = tool;
    const reviewed = { id: tool.id, name: tool.name, href: tool.href, scope: tool.scope, audience: tool.audience, source: tool.source, evidence: tool.evidence, read: tool.read, edit: tool.edit, manage: tool.manage, boundary: tool.boundary, ...(tool.attention ? { attention: true } : {}) };
    if (!key) return reviewed;
    const approved = emails(setting(key));
    return { ...reviewed, audience: [...approved, ...extraAudience], source: key,
      ...(requiredSettings ? { configured: approved.length > 0 && requiredSettings.every(name => !!setting(name)?.trim()) } : {}),
    };
  });
  const workspace = setting("CARD_PAYMENTS_WORKSPACE_OWNER")?.trim();
  // Never project financial fields, storage IDs, or the bearer-link secrets.
  const statements = workspace ? await ctx.db.query("paymentStatements").withIndex("by_owner", q => q.eq("owner", workspace)).take(501) : [];
  const linkRow = tools.find(tool => tool.id === "statement-links");
  if (linkRow) Object.assign(linkRow, { linkCount: statements.filter(statement => statement.enabled).length, linkCountCapped: statements.length > 500 });
  const findings = inventory.findings.map(finding => ({ id: finding.id, severity: finding.severity, title: finding.title, detail: finding.detail, next: finding.next, evidence: finding.evidence, affects: finding.affects }));
  return { viewer, loadedAt: Date.now(), policyReviewedAt: inventory.policyReviewedAt, tools, findings, limitations: inventory.limitations };
} });
