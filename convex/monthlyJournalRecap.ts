import { query, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { requireUnlocked } from "./monthlyJournal";

const entities: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const people = { vish: { label: "Vish", keys: ["vishal", "vish"] }, jenny: { label: "Jenny", keys: ["jenny"] }, vivek: { label: "Vivek", keys: ["vivek"] } };

// Keep source wording, strip editor markup, and merge exact repeated lines only.
export function lines(html: string) {
  return html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<\s*br\s*\/?\s*>|<\/(?:p|div|li|h[1-6])\s*>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_, code) => {
      const n = code[0].toLowerCase() === "x" ? parseInt(code.slice(1), 16) : Number(code);
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "";
    })
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/gi, (_, key) => entities[key.toLowerCase()] || "")
    .split(/\n+/).map(line => line.replace(/\s+/g, " ").trim()).filter(Boolean);
}

export const read = query({
  args: { token: v.string(), month: v.string(), person: v.union(v.literal("vish"), v.literal("jenny"), v.literal("vivek")) },
  handler: async (ctx, args) => {
    await requireUnlocked(ctx, args.token);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(args.month)) throw new Error("Choose a valid month.");
    const person = people[args.person];
    const teamId = process.env.STANDUPS_TEAM_ID || "johns-website-default";
    const rows = (await Promise.all(person.keys.map(personKey => ctx.db.query("standupEntries")
      .withIndex("by_person_date", q => q.eq("teamId", teamId).eq("personKey", personKey).gte("standupDate", `${args.month}-01`).lt("standupDate", `${args.month}-32`))
      .order("desc").take(101)))).flat().sort((a, b) => b.standupDate.localeCompare(a.standupDate));
    const truncated = rows.length > 100;
    const sources = rows.slice(0, 100).map(row => ({
      id: row._id, date: row.standupDate, work: lines(row.yesterday), plans: lines(row.today), blockers: lines(row.blockers || ""), notes: lines(row.notes || ""),
    }));
    function group(field: "work" | "plans" | "blockers") {
      const items = new Map<string, { text: string; dates: string[]; sourceIds: string[] }>();
      for (const source of sources) for (const text of source[field]) {
        if (/^(?:none|n\/?a|no blockers|nothing|-)\.?$/i.test(text)) continue;
        const key = text.toLowerCase();
        const item = items.get(key) || { text, dates: [], sourceIds: [] };
        if (!item.sourceIds.includes(source.id)) { item.dates.push(source.date); item.sourceIds.push(source.id); }
        items.set(key, item);
      }
      return [...items.values()];
    }
    const work = group("work"), plans = group("plans"), blockers = group("blockers");
    const overview = await ctx.db.query("monthlyJournalOverviews").withIndex("by_person_month", q => q.eq("person", args.person).eq("month", args.month)).unique();
    return { overview, person: person.label, month: args.month, updateCount: sources.length, truncated, work, plans, blockers, sources };
  },
});

// One-time editorial imports. No public write endpoint or AI provider connection.
export const publishOverview = internalMutation({
  args: { person: v.union(v.literal("vish"), v.literal("jenny"), v.literal("vivek")), month: v.string(), overview: v.string(), highlights: v.array(v.object({ title: v.string(), text: v.string() })), openLoops: v.array(v.string()), sourceIds: v.array(v.id("standupEntries")) },
  handler: async (ctx, args) => {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(args.month) || !args.sourceIds.length) throw new Error("Invalid overview sources.");
    for (const id of args.sourceIds) {
      const source = await ctx.db.get(id);
      if (!source || source.teamId !== (process.env.STANDUPS_TEAM_ID || "johns-website-default") || !people[args.person].keys.includes(source.personKey) || !source.standupDate.startsWith(args.month + "-")) throw new Error("Source does not match this person and month.");
    }
    const existing = await ctx.db.query("monthlyJournalOverviews").withIndex("by_person_month", q => q.eq("person", args.person).eq("month", args.month)).unique();
    const value = { ...args, updatedAt: Date.now() };
    if (existing) { await ctx.db.patch(existing._id, value); return existing._id; }
    return await ctx.db.insert("monthlyJournalOverviews", value);
  },
});
