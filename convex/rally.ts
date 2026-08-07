import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { v } from "convex/values";

type Identity = { subject: string; email?: string | null; name?: string | null; emailVerified?: boolean };
type RallyState = Record<string, any>;

const LOST_LANDS = "lost-lands-2026";
const EDC = "edc-las-vegas-2027";

function normalizedEmail(value?: string | null) {
  return (value || "").trim().toLowerCase();
}

async function requireIdentity(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity() as Identity | null;
  const email = normalizedEmail(identity?.email);
  if (!identity || !email || identity.emailVerified === false) {
    throw new Error("Sign in with a verified email to open Rally.");
  }
  return { ...identity, email };
}

function memberFor(state: RallyState, identity: Identity) {
  const email = normalizedEmail(identity.email);
  return state.members.find((member: RallyState) =>
    member.clerkSubject === identity.subject || normalizedEmail(member.email) === email,
  );
}

function routeState(state: RallyState, identity: Identity) {
  const member = memberFor(state, identity);
  if (!member) throw new Error("This email has not been invited to this rave room.");
  return {
    ...state,
    members: state.members.map(({ clerkSubject: _clerkSubject, ...person }: RallyState) => person),
    currentMemberId: member.id,
    isAdmin: ["admin", "leader"].includes(member.role),
  };
}

function seedState(eventId: string, adminEmail: string, adminSubject: string): RallyState {
  const base = {
    id: eventId,
    leaderId: eventId === LOST_LANDS ? "m-john" : `${eventId}-admin`,
    rooms: [], travel: [], cars: [], tasks: [], passes: [],
  };
  if (eventId === EDC) {
    return {
      ...base,
      name: "EDC Las Vegas 2027",
      location: "Las Vegas Motor Speedway",
      startsAt: "2027-05-14",
      endsAt: "2027-05-23",
      members: [{ id: `${eventId}-admin`, name: "John", email: adminEmail, origin: "TBD", initials: "JO", color: "coral", role: "admin", status: "confirmed", clerkSubject: adminSubject }],
    };
  }
  const names = ["Jessi", "Lucy", "Eleanor", "Kevin Tang", "Natalia", "Gabe", "Kyle Icban"];
  const colors = ["sky", "purple", "yellow", "green", "pink", "blue", "orange"];
  const ids = ["m-jessi", "m-lucy", "m-eleanor", "m-kevin-tang", "m-natalia", "m-gabe", "m-kyle-icban"];
  return {
    ...base,
    name: "Lost Lands '26",
    location: "Legend Valley, Ohio",
    startsAt: "2026-09-18",
    endsAt: "2026-09-20",
    members: [
      { id: "m-john", name: "John", email: adminEmail, origin: "SFO", initials: "JO", color: "coral", role: "admin", status: "confirmed", clerkSubject: adminSubject },
      ...names.map((name, index) => ({ id: ids[index], name, email: "", origin: "TBD", initials: name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase(), color: colors[index], role: "member", status: "not_invited", clerkSubject: "" })),
    ],
    rooms: [
      { id: "r-1", hotel: "Hyatt Regency Columbus", roomType: "2 Queen Beds", confirmation: "HY-4821", checkIn: "Thu, Sep 17", checkOut: "Mon, Sep 21", capacity: 4, memberIds: [] },
      { id: "r-2", hotel: "Hyatt Regency Columbus", roomType: "King + Sofa Bed", confirmation: "HY-4822", checkIn: "Thu, Sep 17", checkOut: "Mon, Sep 21", capacity: 4, memberIds: [] },
    ],
    passes: [
      { id: "p-1", name: "Weekend admission", ownerId: "m-john", quantity: 8, status: "8 / 8 secured" },
      { id: "p-2", name: "Round-trip shuttle", ownerId: "m-john", quantity: 8, status: "8 / 8 secured" },
      { id: "p-3", name: "Thursday early entry", ownerId: "m-natalia", quantity: 3, status: "3 / 8 secured" },
    ],
    tasks: [
      { id: "task-1", title: "Finish hotel room assignments", status: "todo", category: "Stay", assigneeId: "m-john", dueDate: "2026-08-31", createdAt: Date.now() },
      { id: "task-2", title: "Coordinate Columbus airport pickup", status: "doing", category: "Travel", assigneeId: "m-natalia", dueDate: "2026-09-10", createdAt: Date.now() + 1 },
      { id: "task-3", title: "Share shuttle QR codes", status: "done", category: "Passes", assigneeId: "m-john", dueDate: "2026-09-15", createdAt: Date.now() + 2 },
    ],
  };
}

async function findDoc(ctx: QueryCtx | MutationCtx, eventId: string) {
  return await ctx.db.query("warRoomState").withIndex("by_board", (q) => q.eq("boardId", `rally:${eventId}`)).unique();
}

async function insertState(ctx: MutationCtx, state: RallyState) {
  return await ctx.db.insert("warRoomState", {
    boardId: `rally:${state.id}`,
    completed: {}, linearLinks: {}, docLinks: {}, buckets: state, updatedAt: Date.now(),
  });
}

export const bootstrap = mutation({
  args: { eventId: v.string() },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    let doc = await findDoc(ctx, args.eventId);
    if (!doc) {
      const state = seedState(args.eventId === EDC ? EDC : LOST_LANDS, identity.email, identity.subject);
      await insertState(ctx, state);
      if (state.id === LOST_LANDS && !(await findDoc(ctx, EDC))) await insertState(ctx, seedState(EDC, identity.email, identity.subject));
      doc = await findDoc(ctx, state.id);
    }
    if (!doc?.buckets) throw new Error("Rally room unavailable.");
    const state = structuredClone(doc.buckets) as RallyState;
    const member = memberFor(state, identity);
    if (!member) throw new Error("This email has not been invited to this rave room.");
    if (!member.clerkSubject) {
      member.clerkSubject = identity.subject;
      member.status = "confirmed";
      await ctx.db.patch(doc._id, { buckets: state, updatedAt: Date.now() });
    }
    return routeState(state, identity);
  },
});

export const get = query({
  args: { eventId: v.string() },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    const doc = await findDoc(ctx, args.eventId);
    if (!doc?.buckets) return null;
    return routeState(doc.buckets as RallyState, identity);
  },
});

export const listEvents = query({
  args: {},
  handler: async (ctx) => {
    const identity = await requireIdentity(ctx);
    const docs = await ctx.db.query("warRoomState").collect();
    return docs.filter((doc) => doc.boardId.startsWith("rally:") && doc.buckets && memberFor(doc.buckets as RallyState, identity)).map((doc) => {
      const state = doc.buckets as RallyState;
      return { id: state.id, name: state.name, location: state.location, startsAt: state.startsAt, endsAt: state.endsAt };
    }).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  },
});

export const act = mutation({
  args: { eventId: v.string(), action: v.string(), payload: v.any() },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    const doc = await findDoc(ctx, args.eventId);
    if (!doc?.buckets) throw new Error("Rally room unavailable.");
    const state = structuredClone(doc.buckets) as RallyState;
    const current = memberFor(state, identity);
    if (!current) throw new Error("This email has not been invited to this rave room.");
    const p = args.payload || {};
    const id = () => crypto.randomUUID();

    if (args.action === "invite-member") {
      if (!["admin", "leader"].includes(current.role)) throw new Error("Only an admin can invite crew.");
      const member = state.members.find((person: RallyState) => person.id === p.memberId);
      const email = normalizedEmail(p.email);
      if (!member || !email.includes("@")) throw new Error("Choose a crew member and a valid email.");
      if (state.members.some((person: RallyState) => person.id !== member.id && normalizedEmail(person.email) === email)) throw new Error("That email is already linked to someone else.");
      member.email = email; member.status = "invited";
    } else if (args.action === "update-profile") {
      current.name = String(p.name || "").trim();
      if (!current.name) throw new Error("Name is required.");
      current.initials = current.name.split(/\s+/).map((part: string) => part[0]).join("").slice(0, 2).toUpperCase();
      current.origin = String(p.origin || "TBD").trim().toUpperCase() || "TBD";
    } else if (args.action === "move-task") {
      const task = state.tasks.find((item: RallyState) => item.id === p.id);
      if (task && ["todo", "doing", "done"].includes(p.status)) task.status = p.status;
    } else if (args.action === "save-task") {
      const task = state.tasks.find((item: RallyState) => item.id === p.id);
      const record = { title: String(p.title || "").trim(), status: p.status || "todo", category: p.category || "General", assigneeId: p.assigneeId || "", dueDate: p.dueDate || "" };
      if (!record.title) throw new Error("Ticket title is required.");
      if (task) Object.assign(task, record); else state.tasks.unshift({ id: id(), ...record, createdAt: Date.now() });
    } else if (args.action === "save-room") {
      const room = state.rooms.find((item: RallyState) => item.id === p.id);
      const record = { hotel: p.hotel, roomType: p.roomType, confirmation: p.confirmation, checkIn: p.checkIn, checkOut: p.checkOut, capacity: Number(p.capacity) || 1 };
      if (room) Object.assign(room, record); else state.rooms.push({ id: id(), ...record, memberIds: [] });
    } else if (args.action === "assign-room") {
      state.rooms.forEach((room: RallyState) => { room.memberIds = room.memberIds.filter((memberId: string) => memberId !== p.memberId); });
      const room = state.rooms.find((item: RallyState) => item.id === p.roomId);
      if (room && room.memberIds.length < room.capacity) room.memberIds.push(p.memberId);
    } else if (args.action === "add-flight") {
      state.travel.push({ id: id(), ...p, number: String(p.number || "").toUpperCase(), origin: String(p.origin || "").toUpperCase(), destination: String(p.destination || "").toUpperCase(), status: "scheduled" });
    } else if (args.action === "add-car") {
      state.cars.push({ id: id(), ...p });
    } else if (args.action === "add-pass") {
      state.passes.push({ id: id(), ...p, quantity: Number(p.quantity) || 1 });
    } else if (args.action === "create-event") {
      if (!["admin", "leader"].includes(current.role)) throw new Error("Only an admin can create a rave room.");
      const eventId = String(p.name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
      if (!eventId || await findDoc(ctx, eventId)) throw new Error("Choose a unique rave-room name.");
      const created = { ...seedState(EDC, identity.email, identity.subject), id: eventId, leaderId: `${eventId}-admin`, name: p.name, location: p.location, startsAt: p.startsAt, endsAt: p.endsAt, members: [{ ...seedState(EDC, identity.email, identity.subject).members[0], id: `${eventId}-admin`, name: p.adminName || current.name }] };
      await insertState(ctx, created);
      return routeState(created, identity);
    } else {
      throw new Error("Unknown Rally action.");
    }

    await ctx.db.patch(doc._id, { buckets: state, updatedAt: Date.now() });
    return routeState(state, identity);
  },
});
