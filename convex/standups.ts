import { action, internalAction, internalMutation, mutation, query } from "./_generated/server";
import type { ActionCtx, MutationCtx, QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

const entryFields = {
  teamId: v.string(),
  standupDate: v.string(),
  personName: v.string(),
  yesterday: v.string(),
  today: v.string(),
  blockers: v.optional(v.string()),
  notes: v.optional(v.string()),
};

const FATHOM_API_BASE = "https://api.fathom.ai/external/v1";
const FATHOM_MATCH_TITLE = "affilignment";
const STANDUPS_TIMEZONE = process.env.STANDUPS_TIMEZONE || "America/Los_Angeles";

type FathomMeeting = {
  title?: string | null;
  meeting_title?: string | null;
  recording_id?: number | string | null;
  url?: string | null;
  meeting_url?: string | null;
  share_url?: string | null;
  created_at?: string | null;
  scheduled_start_time?: string | null;
  recording_start_time?: string | null;
  default_summary?: {
    markdown_formatted?: string | null;
  } | null;
  action_items?: Array<{
    description?: string | null;
    completed?: boolean | null;
    recording_playback_url?: string | null;
    assignee?: {
      name?: string | null;
      email?: string | null;
    } | null;
  }> | null;
};

type FathomPage = {
  items?: FathomMeeting[];
  next_cursor?: string | null;
  message?: string;
  error?: string;
};

function normalizePersonKey(name: string) {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

async function requireAuthorizedUser(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  const allowedEmails = new Set(
    (process.env.STANDUPS_ALLOWED_EMAIL || process.env.SLEEP_ALLOWED_EMAIL || "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
  const email = identity?.email?.trim().toLowerCase();

  if (!identity || !email || identity.emailVerified === false) {
    throw new Error("Sign in with a verified email to open standups.");
  }
  if (!allowedEmails.has(email)) {
    throw new Error("This email is not authorized for standups.");
  }

  return identity;
}

async function requireAuthorizedIdentity(ctx: QueryCtx | MutationCtx | ActionCtx) {
  const identity = await ctx.auth.getUserIdentity();
  const allowedEmails = new Set(
    (process.env.STANDUPS_ALLOWED_EMAIL || process.env.SLEEP_ALLOWED_EMAIL || "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
  const email = identity?.email?.trim().toLowerCase();

  if (!identity || !email || identity.emailVerified === false) {
    throw new Error("Sign in with a verified email to open standups.");
  }
  if (!allowedEmails.has(email)) {
    throw new Error("This email is not authorized for standups.");
  }

  return identity;
}

export const verify = query({
  args: {},
  handler: async (ctx) => {
    const identity = await requireAuthorizedUser(ctx);
    return { email: identity.email };
  },
});

export const listForDate = query({
  args: {
    teamId: v.string(),
    standupDate: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAuthorizedUser(ctx);
    return await ctx.db
      .query("standupEntries")
      .withIndex("by_date", (q) => q.eq("teamId", args.teamId).eq("standupDate", args.standupDate))
      .collect();
  },
});

export const getDayNotes = query({
  args: {
    teamId: v.string(),
    standupDate: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAuthorizedUser(ctx);
    return await ctx.db
      .query("standupDayNotes")
      .withIndex("by_date", (q) => q.eq("teamId", args.teamId).eq("standupDate", args.standupDate))
      .unique();
  },
});

export const listFathomNotesForDate = query({
  args: {
    teamId: v.string(),
    standupDate: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAuthorizedUser(ctx);
    const imports = await ctx.db
      .query("standupFathomImports")
      .withIndex("by_date", (q) => q.eq("teamId", args.teamId).eq("standupDate", args.standupDate))
      .collect();

    return imports.sort((a, b) => (a.startedAt || "").localeCompare(b.startedAt || ""));
  },
});

export const getForPersonAndDate = query({
  args: {
    teamId: v.string(),
    standupDate: v.string(),
    personName: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAuthorizedUser(ctx);
    const personKey = normalizePersonKey(args.personName);
    if (!personKey) return null;

    return await ctx.db
      .query("standupEntries")
      .withIndex("by_person_date", (q) =>
        q.eq("teamId", args.teamId).eq("personKey", personKey).eq("standupDate", args.standupDate),
      )
      .unique();
  },
});

export const listItemComments = query({
  args: {
    teamId: v.string(),
    standupDate: v.string(),
    personName: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAuthorizedUser(ctx);
    const personKey = normalizePersonKey(args.personName);
    if (!personKey) return [];

    const comments = await ctx.db
      .query("standupItemComments")
      .withIndex("by_entry", (q) =>
        q.eq("teamId", args.teamId).eq("standupDate", args.standupDate).eq("personKey", personKey),
      )
      .collect();

    return comments.sort((a, b) => a.createdAt - b.createdAt);
  },
});

export const getPreviousForPerson = query({
  args: {
    teamId: v.string(),
    beforeDate: v.string(),
    personName: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAuthorizedUser(ctx);
    const personKey = normalizePersonKey(args.personName);
    if (!personKey) return null;

    const entries = await ctx.db
      .query("standupEntries")
      .withIndex("by_person_date", (q) =>
        q.eq("teamId", args.teamId).eq("personKey", personKey).lt("standupDate", args.beforeDate),
      )
      .order("desc")
      .take(1);

    return entries[0] ?? null;
  },
});

export const saveItemComment = mutation({
  args: {
    teamId: v.string(),
    standupDate: v.string(),
    personName: v.string(),
    fieldName: v.string(),
    itemKey: v.string(),
    itemText: v.string(),
    comment: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await requireAuthorizedUser(ctx);
    const now = Date.now();
    const personName = args.personName.trim();
    const personKey = normalizePersonKey(personName);
    const comment = args.comment.trim();
    const itemText = args.itemText.trim();

    if (!personKey) throw new Error("Name is required.");
    if (!itemText) throw new Error("Select or place your cursor in an item first.");
    if (!comment) throw new Error("Comment is required.");

    return await ctx.db.insert("standupItemComments", {
      teamId: args.teamId,
      standupDate: args.standupDate,
      personKey,
      personName,
      fieldName: args.fieldName,
      itemKey: args.itemKey,
      itemText,
      comment,
      authorEmail: identity.email || "",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const deleteItemComment = mutation({
  args: {
    commentId: v.id("standupItemComments"),
  },
  handler: async (ctx, args) => {
    await requireAuthorizedUser(ctx);
    await ctx.db.delete(args.commentId);
  },
});

export const save = mutation({
  args: entryFields,
  handler: async (ctx, args) => {
    await requireAuthorizedUser(ctx);
    const now = Date.now();
    const personName = args.personName.trim();
    const personKey = normalizePersonKey(personName);

    if (!personKey) {
      throw new Error("Name is required.");
    }

    const existing = await ctx.db
      .query("standupEntries")
      .withIndex("by_person_date", (q) =>
        q.eq("teamId", args.teamId).eq("personKey", personKey).eq("standupDate", args.standupDate),
      )
      .unique();

    const payload = {
      teamId: args.teamId,
      standupDate: args.standupDate,
      personKey,
      personName,
      yesterday: args.yesterday.trim(),
      today: args.today.trim(),
      blockers: args.blockers?.trim() || "",
      notes: args.notes?.trim() || "",
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return existing._id;
    }

    return await ctx.db.insert("standupEntries", {
      ...payload,
      submittedAt: now,
    });
  },
});

export const saveDayNotes = mutation({
  args: {
    teamId: v.string(),
    standupDate: v.string(),
    notes: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAuthorizedUser(ctx);
    const now = Date.now();
    const existing = await ctx.db
      .query("standupDayNotes")
      .withIndex("by_date", (q) => q.eq("teamId", args.teamId).eq("standupDate", args.standupDate))
      .unique();

    const payload = {
      teamId: args.teamId,
      standupDate: args.standupDate,
      notes: args.notes.trim(),
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return existing._id;
    }

    return await ctx.db.insert("standupDayNotes", {
      ...payload,
      createdAt: now,
    });
  },
});

export const syncFathomAffilignment = action({
  args: {
    teamId: v.string(),
    standupDate: v.string(),
  },
  handler: async (ctx, args): Promise<{ imported: number; skipped: number; matched: number }> => {
    await requireAuthorizedIdentity(ctx);
    return syncFathomMeetingsForDate(ctx, args.teamId, args.standupDate);
  },
});

export const syncRecentFathomAffilignment = internalAction({
  args: {},
  handler: async (ctx): Promise<{ syncedDays: number; imported: number; skipped: number }> => {
    if (!process.env.FATHOM_API_KEY) return { syncedDays: 0, imported: 0, skipped: 0 };

    const teamId = process.env.STANDUPS_TEAM_ID || "johns-website-default";
    let imported = 0;
    let skipped = 0;
    const today = new Date();
    for (let offset = -2; offset <= 1; offset += 1) {
      const date = new Date(today);
      date.setDate(today.getDate() + offset);
      const result = await syncFathomMeetingsForDate(ctx, teamId, formatLocalDate(date, STANDUPS_TIMEZONE));
      imported += result.imported;
      skipped += result.skipped;
    }
    return { syncedDays: 4, imported, skipped };
  },
});

export const debugRecentFathomMeetings = internalAction({
  args: {},
  handler: async (): Promise<
    Array<{
      recordingId: string;
      title: string;
      meetingTitle: string;
      createdAt: string;
      scheduledStartTime: string;
      localDate: string;
      url: string;
      shareUrl: string;
      matchesAffilignment: boolean;
    }>
  > => {
    const apiKey = process.env.FATHOM_API_KEY;
    if (!apiKey) throw new Error("Add FATHOM_API_KEY to Convex environment variables before debugging Fathom.");

    const meetings = await fetchFathomMeetings(apiKey, { maxPages: 3 });
    return meetings.slice(0, 40).map((meeting) => {
      const timestamp = meeting.scheduled_start_time || meeting.recording_start_time || meeting.created_at || "";
      return {
        recordingId: String(meeting.recording_id || ""),
        title: meeting.title || "",
        meetingTitle: meeting.meeting_title || "",
        createdAt: meeting.created_at || "",
        scheduledStartTime: meeting.scheduled_start_time || "",
        localDate: timestamp ? formatLocalDate(new Date(timestamp), STANDUPS_TIMEZONE) : "",
        url: meeting.url || "",
        shareUrl: meeting.share_url || "",
        matchesAffilignment: isAffilignmentMeeting(meeting),
      };
    });
  },
});

export const upsertFathomMeetingNotes = internalMutation({
  args: {
    teamId: v.string(),
    standupDate: v.string(),
    meetings: v.array(
      v.object({
        recordingId: v.string(),
        title: v.string(),
        meetingTitle: v.optional(v.string()),
        shareUrl: v.optional(v.string()),
        meetingUrl: v.optional(v.string()),
        startedAt: v.optional(v.string()),
        html: v.string(),
        actionItems: v.optional(v.any()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const imported: string[] = [];
    let skipped = 0;

    for (const meeting of args.meetings) {
      const existingImport = await ctx.db
        .query("standupFathomImports")
        .withIndex("by_recording", (q) => q.eq("teamId", args.teamId).eq("recordingId", meeting.recordingId))
        .unique();

      if (existingImport) {
        if ((!existingImport.html && meeting.html) || !existingImport.actionItems) {
          await ctx.db.patch(existingImport._id, {
            html: meeting.html,
            title: meeting.title,
            meetingTitle: meeting.meetingTitle,
            shareUrl: meeting.shareUrl,
            meetingUrl: meeting.meetingUrl,
            startedAt: meeting.startedAt,
            actionItems: meeting.actionItems || [],
          });
        }
        skipped += 1;
        continue;
      }

      await ctx.db.insert("standupFathomImports", {
        teamId: args.teamId,
        standupDate: args.standupDate,
        recordingId: meeting.recordingId,
        title: meeting.title,
        meetingTitle: meeting.meetingTitle,
        shareUrl: meeting.shareUrl,
        meetingUrl: meeting.meetingUrl,
        startedAt: meeting.startedAt,
        html: meeting.html,
        actionItems: meeting.actionItems || [],
        importedAt: now,
      });
      imported.push(meeting.recordingId);
    }

    return { imported: imported.length, skipped };
  },
});

export const removeImportedFathomBlocksFromDayNotes = internalMutation({
  args: {
    teamId: v.string(),
    dates: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    let cleaned = 0;
    for (const standupDate of args.dates) {
      const notes = await ctx.db
        .query("standupDayNotes")
        .withIndex("by_date", (q) => q.eq("teamId", args.teamId).eq("standupDate", standupDate))
        .unique();
      if (!notes?.notes.includes("<strong>Fathom:")) continue;

      const cleanedNotes = stripFathomBlocks(notes.notes);
      if (cleanedNotes !== notes.notes) {
        await ctx.db.patch(notes._id, { notes: cleanedNotes, updatedAt: Date.now() });
        cleaned += 1;
      }
    }
    return { cleaned };
  },
});

export const cleanRecentFathomBlocksFromDayNotes = internalAction({
  args: {},
  handler: async (ctx) => {
    const teamId = process.env.STANDUPS_TEAM_ID || "johns-website-default";
    const today = new Date();
    const dates: string[] = [];
    for (let offset = -7; offset <= 1; offset += 1) {
      const date = new Date(today);
      date.setDate(today.getDate() + offset);
      dates.push(formatLocalDate(date, STANDUPS_TIMEZONE));
    }
    return ctx.runMutation(internal.standups.removeImportedFathomBlocksFromDayNotes, { teamId, dates });
  },
});

async function syncFathomMeetingsForDate(ctx: ActionCtx, teamId: string, standupDate: string) {
  const apiKey = process.env.FATHOM_API_KEY;
  if (!apiKey) throw new Error("Add FATHOM_API_KEY to Convex environment variables before syncing Fathom.");

  const meetings = await fetchFathomMeetingsForDate(apiKey, standupDate);
  const matchingMeetings = meetings.filter(isAffilignmentMeeting);
  const payload = matchingMeetings.map(toFathomImportPayload).filter((meeting) => meeting.html.trim());
  const result: { imported: number; skipped: number } = await ctx.runMutation(
    internal.standups.upsertFathomMeetingNotes,
    {
      teamId,
      standupDate,
      meetings: payload,
    },
  );

  return { ...result, matched: matchingMeetings.length };
}

async function fetchFathomMeetingsForDate(apiKey: string, standupDate: string) {
  const start = new Date(`${standupDate}T00:00:00+14:00`);
  const end = new Date(`${standupDate}T23:59:59-12:00`);
  const meetings = await fetchFathomMeetings(apiKey, {
    maxPages: 6,
    createdAfter: start.toISOString(),
    createdBefore: end.toISOString(),
  });

  return meetings.filter((meeting) => {
    const timestamp = meeting.scheduled_start_time || meeting.recording_start_time || meeting.created_at;
    return timestamp ? formatLocalDate(new Date(timestamp), STANDUPS_TIMEZONE) === standupDate : false;
  });
}

async function fetchFathomMeetings(
  apiKey: string,
  options: { maxPages: number; createdAfter?: string; createdBefore?: string },
) {
  const meetings: FathomMeeting[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < options.maxPages; page += 1) {
    const url = new URL(`${FATHOM_API_BASE}/meetings`);
    url.searchParams.set("include_summary", "true");
    url.searchParams.set("include_action_items", "true");
    if (options.createdAfter) url.searchParams.set("created_after", options.createdAfter);
    if (options.createdBefore) url.searchParams.set("created_before", options.createdBefore);
    if (cursor) url.searchParams.set("cursor", cursor);

    const response = await fetch(url, { headers: { "X-Api-Key": apiKey } });
    const body = await response.text();
    if (!body.trim()) {
      throw new Error(`Fathom sync failed (${response.status}) with an empty response. Check that FATHOM_API_KEY is the API secret.`);
    }

    let payload: FathomPage;
    try {
      payload = JSON.parse(body) as FathomPage;
    } catch {
      throw new Error(`Fathom sync failed (${response.status}) with a non-JSON response.`);
    }

    if (!response.ok) {
      throw new Error(payload.message || payload.error || `Fathom sync failed (${response.status}).`);
    }

    meetings.push(...(payload.items || []));

    cursor = payload.next_cursor || undefined;
    if (!cursor) break;
  }

  return meetings;
}

function isAffilignmentMeeting(meeting: FathomMeeting) {
  const text = `${meeting.title || ""} ${meeting.meeting_title || ""}`.toLowerCase();
  return text.includes(FATHOM_MATCH_TITLE);
}

function toFathomImportPayload(meeting: FathomMeeting) {
  const recordingId = String(meeting.recording_id || meeting.url || meeting.share_url || crypto.randomUUID());
  const title = meeting.title || meeting.meeting_title || "Affilignment";
  const summary = meeting.default_summary?.markdown_formatted || "";
  const actionItems = meeting.action_items || [];
  const htmlParts = [
    `<div><strong>Fathom: ${escapeHtml(title)}</strong>${meeting.share_url ? ` · ${linkHtml("Open recording", meeting.share_url)}` : ""}</div>`,
    markdownToBasicHtml(summary),
    actionItems.length
      ? `<div><strong>Action items</strong></div><ul>${actionItems
          .map((item) => {
            const assignee = item.assignee?.name ? ` <em>(${escapeHtml(item.assignee.name)})</em>` : "";
            const text = escapeHtml(item.description || "Untitled action item");
            const linked = item.recording_playback_url ? linkHtml(text, item.recording_playback_url) : text;
            return `<li>${linked}${assignee}</li>`;
          })
          .join("")}</ul>`
      : "",
  ];

  return {
    recordingId,
    title,
    meetingTitle: meeting.meeting_title || "",
    shareUrl: meeting.share_url || "",
    meetingUrl: meeting.meeting_url || "",
    startedAt: meeting.scheduled_start_time || meeting.recording_start_time || meeting.created_at || "",
    html: htmlParts.filter(Boolean).join(""),
    actionItems: actionItems.map((item) => ({
      description: item.description || "",
      completed: Boolean(item.completed),
      playbackUrl: item.recording_playback_url || "",
      assigneeName: item.assignee?.name || "",
      assigneeEmail: item.assignee?.email || "",
    })),
  };
}

function markdownToBasicHtml(markdown: string) {
  const lines = markdown
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return "";

  const html: string[] = [];
  let inList = false;
  for (const line of lines) {
    const heading = /^#{1,4}\s+(.+)$/.exec(line);
    const bullet = /^[-*]\s+(.+)$/.exec(line);
    if (bullet) {
      if (!inList) {
        html.push("<ul>");
        inList = true;
      }
      html.push(`<li>${escapeHtml(bullet[1])}</li>`);
      continue;
    }
    if (inList) {
      html.push("</ul>");
      inList = false;
    }
    html.push(heading ? `<div><strong>${escapeHtml(heading[1])}</strong></div>` : `<div>${escapeHtml(line)}</div>`);
  }
  if (inList) html.push("</ul>");
  return html.join("");
}

function stripFathomBlocks(html: string) {
  const startMarker = "<div><strong>Fathom:";
  let output = html;
  while (output.includes(startMarker)) {
    const start = output.indexOf(startMarker);
    const next = output.indexOf(startMarker, start + startMarker.length);
    const before = output.slice(0, start).replace(/(?:<div><br><\/div>\s*)+$/g, "");
    const after = next === -1 ? "" : output.slice(next);
    output = `${before}${after}`;
  }
  return output.trim();
}

function linkHtml(label: string, href: string) {
  return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatLocalDate(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}
