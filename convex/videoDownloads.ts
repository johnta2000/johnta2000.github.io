import { internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

declare const process: { env: Record<string, string | undefined> };

const READY_FOR_MS = 60 * 60 * 1000;
const WORKER_ONLINE_MS = 20 * 1000;
const STALE_JOB_MS = 15 * 60 * 1000;
const MAX_ACTIVE_PER_PERSON = 3;
const MAX_QUEUED_GLOBALLY = 10;

const quality = v.union(
  v.literal("best"),
  v.literal("1080"),
  v.literal("720"),
  v.literal("480"),
);

function requesterFor(visitorId: string) {
  if (!/^[a-zA-Z0-9_-]{16,100}$/.test(visitorId)) {
    throw new Error("This browser session could not be identified. Refresh and try again.");
  }
  return { subject: `shared:${visitorId}`, email: "shared-password" };
}

function requireWorkerSecret(secret: string) {
  const expected = process.env.DOWNLOADER_WORKER_SECRET;
  if (!expected || secret.length < 32 || secret !== expected) {
    throw new Error("Downloader worker is not authorized.");
  }
}

function normalizeYouTubeUrl(value: string) {
  if (value.length > 500) throw new Error("The video URL is too long.");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Enter a valid YouTube URL.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Enter a valid YouTube URL.");
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (host !== "youtu.be" && host !== "youtube.com" && !host.endsWith(".youtube.com")) {
    throw new Error("Only YouTube links are supported.");
  }
  url.protocol = "https:";
  url.hash = "";
  return url.toString();
}

async function touchWorker(
  ctx: MutationCtx,
  args: { workerId: string; hostname: string; version: string; currentJobId?: any },
) {
  const now = Date.now();
  const existing = await ctx.db
    .query("videoDownloaderWorkers")
    .withIndex("by_worker", (q) => q.eq("workerId", args.workerId))
    .unique();
  const fields = {
    hostname: args.hostname.slice(0, 120),
    version: args.version.slice(0, 40),
    currentJobId: args.currentJobId,
    lastSeenAt: now,
  };
  if (existing) await ctx.db.patch(existing._id, fields);
  else await ctx.db.insert("videoDownloaderWorkers", { workerId: args.workerId, ...fields });
}

export const requestDownload = mutation({
  args: {
    visitorId: v.string(),
    videoUrl: v.string(),
    quality,
    permissionConfirmed: v.boolean(),
  },
  handler: async (ctx, args) => {
    const user = requesterFor(args.visitorId);
    if (!args.permissionConfirmed) {
      throw new Error("Confirm that you have permission to download this video.");
    }

    const recent = await ctx.db
      .query("videoDownloads")
      .withIndex("by_requester_created", (q) => q.eq("requesterSubject", user.subject))
      .order("desc")
      .take(20);
    const activeCount = recent.filter((job) => ["queued", "processing", "uploading"].includes(job.status)).length;
    if (activeCount >= MAX_ACTIVE_PER_PERSON) {
      throw new Error("You already have three active downloads. Let one finish first.");
    }

    const queued = await ctx.db
      .query("videoDownloads")
      .withIndex("by_status", (q) => q.eq("status", "queued"))
      .take(MAX_QUEUED_GLOBALLY);
    if (queued.length >= MAX_QUEUED_GLOBALLY) {
      throw new Error("The team queue is full right now. Try again in a few minutes.");
    }

    const now = Date.now();
    return await ctx.db.insert("videoDownloads", {
      requesterSubject: user.subject,
      requesterEmail: user.email,
      videoUrl: normalizeYouTubeUrl(args.videoUrl.trim()),
      quality: args.quality,
      status: "queued",
      progress: 0,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const listMine = query({
  args: { visitorId: v.string() },
  handler: async (ctx, args) => {
    const user = requesterFor(args.visitorId);
    const now = Date.now();
    const jobs = await ctx.db
      .query("videoDownloads")
      .withIndex("by_requester_created", (q) => q.eq("requesterSubject", user.subject))
      .order("desc")
      .take(20);

    return await Promise.all(jobs.map(async (job) => ({
      id: job._id,
      videoUrl: job.videoUrl,
      quality: job.quality,
      status: job.status,
      progress: job.progress,
      speed: job.speed,
      eta: job.eta,
      title: job.title,
      filename: job.filename,
      fileSize: job.fileSize,
      error: job.error,
      createdAt: job.createdAt,
      completedAt: job.completedAt,
      expiresAt: job.expiresAt,
      downloadUrl: job.status === "ready" && job.storageId && (job.expiresAt || 0) > now
        ? await ctx.storage.getUrl(job.storageId)
        : null,
    })));
  },
});

export const workerStatus = query({
  args: { visitorId: v.string() },
  handler: async (ctx, args) => {
    requesterFor(args.visitorId);
    const worker = await ctx.db
      .query("videoDownloaderWorkers")
      .withIndex("by_last_seen")
      .order("desc")
      .first();
    const now = Date.now();
    return {
      online: Boolean(worker && now - worker.lastSeenAt < WORKER_ONLINE_MS),
      lastSeenAt: worker?.lastSeenAt ?? null,
      busy: Boolean(worker?.currentJobId),
    };
  },
});

export const heartbeat = mutation({
  args: {
    secret: v.string(),
    workerId: v.string(),
    hostname: v.string(),
    version: v.string(),
    currentJobId: v.optional(v.id("videoDownloads")),
  },
  handler: async (ctx, args) => {
    requireWorkerSecret(args.secret);
    await touchWorker(ctx, args);
    return { ok: true };
  },
});

export const claimNext = mutation({
  args: {
    secret: v.string(),
    workerId: v.string(),
    hostname: v.string(),
    version: v.string(),
  },
  handler: async (ctx, args) => {
    requireWorkerSecret(args.secret);
    const now = Date.now();
    const processing = await ctx.db
      .query("videoDownloads")
      .withIndex("by_status", (q) => q.eq("status", "processing"))
      .take(10);
    for (const job of processing) {
      if (now - job.updatedAt > STALE_JOB_MS) {
        await ctx.db.patch(job._id, {
          status: "queued",
          workerId: undefined,
          progress: 0,
          speed: undefined,
          eta: undefined,
          startedAt: undefined,
          updatedAt: now,
        });
      }
    }

    const job = await ctx.db
      .query("videoDownloads")
      .withIndex("by_status", (q) => q.eq("status", "queued"))
      .order("asc")
      .first();
    await touchWorker(ctx, { ...args, currentJobId: job?._id });
    if (!job) return null;

    await ctx.db.patch(job._id, {
      status: "processing",
      workerId: args.workerId,
      progress: 0,
      startedAt: now,
      updatedAt: now,
    });
    return {
      id: job._id,
      videoUrl: job.videoUrl,
      quality: job.quality,
    };
  },
});

export const updateProgress = mutation({
  args: {
    secret: v.string(),
    workerId: v.string(),
    jobId: v.id("videoDownloads"),
    progress: v.number(),
    speed: v.optional(v.string()),
    eta: v.optional(v.string()),
    title: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    requireWorkerSecret(args.secret);
    const job = await ctx.db.get(args.jobId);
    if (!job || job.workerId !== args.workerId || job.status !== "processing") return { active: false };
    await ctx.db.patch(job._id, {
      progress: Math.max(0, Math.min(99, args.progress)),
      speed: args.speed?.slice(0, 40),
      eta: args.eta?.slice(0, 40),
      title: args.title?.slice(0, 240),
      updatedAt: Date.now(),
    });
    return { active: true };
  },
});

export const createUploadUrl = mutation({
  args: {
    secret: v.string(),
    workerId: v.string(),
    jobId: v.id("videoDownloads"),
  },
  handler: async (ctx, args) => {
    requireWorkerSecret(args.secret);
    const job = await ctx.db.get(args.jobId);
    if (!job || job.workerId !== args.workerId || job.status !== "processing") {
      throw new Error("Download job is no longer active.");
    }
    await ctx.db.patch(job._id, { status: "uploading", progress: 99, updatedAt: Date.now() });
    return await ctx.storage.generateUploadUrl();
  },
});

export const complete = mutation({
  args: {
    secret: v.string(),
    workerId: v.string(),
    jobId: v.id("videoDownloads"),
    storageId: v.id("_storage"),
    filename: v.string(),
    title: v.string(),
    fileSize: v.number(),
  },
  handler: async (ctx, args) => {
    requireWorkerSecret(args.secret);
    const job = await ctx.db.get(args.jobId);
    if (!job || job.workerId !== args.workerId || job.status !== "uploading") {
      await ctx.storage.delete(args.storageId);
      throw new Error("Download job is no longer active.");
    }
    if (!args.filename.toLowerCase().endsWith(".mp4") || args.fileSize <= 0) {
      await ctx.storage.delete(args.storageId);
      throw new Error("Worker output was not a valid MP4 file.");
    }

    const now = Date.now();
    const expiresAt = now + READY_FOR_MS;
    await ctx.db.patch(job._id, {
      status: "ready",
      progress: 100,
      speed: undefined,
      eta: undefined,
      title: args.title.slice(0, 240),
      filename: args.filename.slice(0, 240),
      storageId: args.storageId,
      fileSize: args.fileSize,
      completedAt: now,
      expiresAt,
      updatedAt: now,
    });
    await touchWorker(ctx, { workerId: args.workerId, hostname: "local", version: "1", currentJobId: undefined });
    await ctx.scheduler.runAfter(READY_FOR_MS, internal.videoDownloads.expireJob, { jobId: job._id });
    return { expiresAt };
  },
});

export const fail = mutation({
  args: {
    secret: v.string(),
    workerId: v.string(),
    jobId: v.id("videoDownloads"),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    requireWorkerSecret(args.secret);
    const job = await ctx.db.get(args.jobId);
    if (job && job.workerId === args.workerId && ["processing", "uploading"].includes(job.status)) {
      await ctx.db.patch(job._id, {
        status: "failed",
        error: args.error.slice(0, 700),
        speed: undefined,
        eta: undefined,
        updatedAt: Date.now(),
      });
    }
    await touchWorker(ctx, { workerId: args.workerId, hostname: "local", version: "1", currentJobId: undefined });
    return { ok: true };
  },
});

export const expireJob = internalMutation({
  args: { jobId: v.id("videoDownloads") },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.status !== "ready" || (job.expiresAt || 0) > Date.now()) return;
    if (job.storageId) await ctx.storage.delete(job.storageId);
    await ctx.db.patch(job._id, {
      status: "expired",
      storageId: undefined,
      updatedAt: Date.now(),
    });
  },
});
