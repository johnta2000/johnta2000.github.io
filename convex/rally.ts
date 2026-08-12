import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
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
  const { lineupFavorites = {}, ...sharedState } = state;
  const lineupInterests: Record<string, Array<{ id: string; name: string; initials: string; color: string }>> = {};
  state.members.forEach((person: RallyState) => {
    const artistIds = Array.isArray(lineupFavorites[person.id]) ? lineupFavorites[person.id] : [];
    artistIds.forEach((artistId: string) => {
      lineupInterests[artistId] ||= [];
      lineupInterests[artistId].push({ id: person.id, name: person.name, initials: person.initials, color: person.color });
    });
  });
  return {
    ...sharedState,
    members: state.members.map(({ clerkSubject: _clerkSubject, ...person }: RallyState) => person),
    currentMemberId: member.id,
    currentLineupFavorites: Array.isArray(lineupFavorites[member.id]) ? lineupFavorites[member.id] : [],
    lineupInterests,
    isAdmin: ["admin", "leader"].includes(member.role),
  };
}

function seedState(eventId: string, adminEmail: string, adminSubject: string): RallyState {
  const base = {
    id: eventId,
    leaderId: eventId === LOST_LANDS ? "m-john" : `${eventId}-admin`,
    rooms: [], travel: [], cars: [], tasks: [], passes: [], lineupFavorites: {},
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
      { id: "r-1", hotel: "Hyatt Regency Columbus", roomType: "2 Queen Beds", confirmation: "HY-4821", checkIn: "Thu, Sep 17", checkOut: "Mon, Sep 21", capacity: 4, bathrooms: 1, memberIds: [] },
      { id: "r-2", hotel: "Hyatt Regency Columbus", roomType: "King + Sofa Bed", confirmation: "HY-4822", checkIn: "Thu, Sep 17", checkOut: "Mon, Sep 21", capacity: 4, bathrooms: 1, memberIds: [] },
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

export const addUpcomingRaves2026 = internalMutation({
  args: {},
  handler: async (ctx) => {
    const source = await findDoc(ctx, LOST_LANDS);
    const sourceState = source?.buckets as RallyState | undefined;
    const admin = sourceState?.members?.find((person: RallyState) => ["admin", "leader"].includes(person.role));
    if (!admin) throw new Error("Lost Lands admin profile is unavailable.");
    const events = [
      {
        id: "btsm-kai-wachi-block-party-2026",
        name: "Black Tiger Sex Machine & Kai Wachi Block Party",
        location: "The Midway, San Francisco, CA",
        startsAt: "2026-09-04",
        endsAt: "2026-09-04",
        startTime: "18:00",
        timeZoneLabel: "PDT",
      },
      {
        id: "midnight-carnival-rl-grime-2026",
        name: "Midnight Carnival Block Party ft. RL GRIME",
        presenter: "The Midway and Opel Productions present",
        location: "The Midway, San Francisco, CA",
        startsAt: "2026-10-31",
        endsAt: "2026-10-31",
        startTime: "16:00",
        timeZoneLabel: "PDT",
      },
      {
        id: "decadence-digital-city-2026",
        name: "Decadence: The Digital City",
        location: "Colorado Convention Center, Denver, CO",
        startsAt: "2026-12-30",
        endsAt: "2026-12-31",
      },
      {
        id: "niteharts-festival-2026",
        name: "Niteharts Festival 2026",
        location: "Snapdragon Stadium, San Diego, CA",
        startsAt: "2026-10-09",
        endsAt: "2026-10-11",
      },
    ];
    const created: string[] = [];
    for (const event of events) {
      if (await findDoc(ctx, event.id)) continue;
      const adminId = `${event.id}-admin`;
      await insertState(ctx, {
        ...event,
        leaderId: adminId,
        rooms: [], travel: [], cars: [], tasks: [], passes: [], lineupFavorites: {},
        members: [{
          id: adminId,
          name: admin.name,
          email: admin.email,
          origin: admin.origin || "SFO",
          initials: admin.initials || "JO",
          color: admin.color || "coral",
          role: "admin",
          status: "confirmed",
          clerkSubject: admin.clerkSubject,
        }],
      });
      created.push(event.id);
    }
    return { created, available: events.map((event) => event.id) };
  },
});

export const addEdcHotelReservations2027 = internalMutation({
  args: {},
  handler: async (ctx) => {
    const doc = await findDoc(ctx, EDC);
    if (!doc?.buckets) throw new Error("EDC Las Vegas 2027 is unavailable.");
    const state = structuredClone(doc.buckets) as RallyState;
    const reservations = [
      {
        id: "edc-rio-17316046",
        hotel: "Rio Hotel & Casino",
        roomType: "Renovated | 2 Queen Beds Deluxe",
        confirmation: "17316046",
        checkIn: "Fri, May 21, 2027 · 4:00 PM",
        checkOut: "Mon, May 24, 2027 · 11:00 AM",
        capacity: 4,
        bathrooms: 1,
        totalCost: "",
        notes: "Booked for 1 adult · Standard Room Free Night · Special rate CR54749 · 3700 W Flamingo Rd, Las Vegas, NV 89103 · $52 daily resort fee noted by hotel",
        memberIds: [],
      },
      {
        id: "edc-rio-58045118",
        hotel: "Rio Hotel & Casino",
        roomType: "Renovated | 2 Queen Beds Deluxe",
        confirmation: "58045118",
        checkIn: "Fri, May 21, 2027 · 4:00 PM",
        checkOut: "Mon, May 24, 2027 · 11:00 AM",
        capacity: 4,
        bathrooms: 1,
        totalCost: "",
        notes: "Booked for 4 adults · Standard Room Free Night · Special rate CR54749 · 3700 W Flamingo Rd, Las Vegas, NV 89103 · $52 daily resort fee noted by hotel",
        memberIds: [],
      },
    ];
    reservations.forEach((reservation) => {
      const existing = state.rooms.find((room: RallyState) => room.id === reservation.id || room.confirmation === reservation.confirmation);
      if (existing) Object.assign(existing, reservation, { memberIds: existing.memberIds || [] });
      else state.rooms.push(reservation);
    });
    await ctx.db.patch(doc._id, { buckets: state, updatedAt: Date.now() });
    return { rooms: reservations.map(({ confirmation }) => confirmation) };
  },
});

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

export const sharedCrewCandidates = query({
  args: { eventId: v.string() },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    const targetDoc = await findDoc(ctx, args.eventId);
    const target = targetDoc?.buckets as RallyState | undefined;
    const current = target && memberFor(target, identity);
    if (!target || !current || !["admin", "leader"].includes(current.role)) throw new Error("Only an admin can invite crew.");
    const existingEmails = new Set(target.members.map((person: RallyState) => normalizedEmail(person.email)).filter(Boolean));
    const candidates = new Map<string, RallyState>();
    const docs = await ctx.db.query("warRoomState").collect();
    docs.forEach((doc) => {
      const state = doc.buckets as RallyState | undefined;
      if (!state || state.id === args.eventId || !doc.boardId.startsWith("rally:") || !memberFor(state, identity)) return;
      state.members.forEach((person: RallyState) => {
        const email = normalizedEmail(person.email);
        if (!email || email === identity.email || existingEmails.has(email) || candidates.has(email)) return;
        candidates.set(email, { name: person.name, email, origin: person.origin || "TBD", initials: person.initials, color: person.color });
      });
    });
    return [...candidates.values()].sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const invitationTarget = internalQuery({
  args: { eventId: v.string(), memberId: v.string(), name: v.string(), inviteEmail: v.string(), subject: v.string(), email: v.string() },
  handler: async (ctx, args) => {
    const doc = await findDoc(ctx, args.eventId);
    if (!doc?.buckets) throw new Error("Rally room unavailable.");
    const state = doc.buckets as RallyState;
    const current = memberFor(state, { subject: args.subject, email: args.email });
    if (!current || !["admin", "leader"].includes(current.role)) throw new Error("Only an admin can invite crew.");
    const member = state.members.find((person: RallyState) => person.id === args.memberId);
    if (member && ["admin", "leader"].includes(member.role)) throw new Error("Choose a crew member to invite.");
    if (!member && !args.name.trim()) throw new Error("Enter their name.");
    if (state.members.some((person: RallyState) => person.id !== member?.id && normalizedEmail(person.email) === args.inviteEmail)) throw new Error("That email is already in this rave room.");
    return { eventName: state.name, memberName: member?.name || args.name.trim(), inviterName: current.name };
  },
});

export const finishInvitation = internalMutation({
  args: { eventId: v.string(), memberId: v.string(), name: v.string(), origin: v.string(), email: v.string(), subject: v.string(), adminEmail: v.string(), invitationId: v.string() },
  handler: async (ctx, args) => {
    const doc = await findDoc(ctx, args.eventId);
    if (!doc?.buckets) throw new Error("Rally room unavailable.");
    const state = structuredClone(doc.buckets) as RallyState;
    const current = memberFor(state, { subject: args.subject, email: args.adminEmail });
    if (!current || !["admin", "leader"].includes(current.role)) throw new Error("Only an admin can invite crew.");
    let member = state.members.find((person: RallyState) => person.id === args.memberId);
    if (!member) {
      const name = args.name.trim();
      if (!name) throw new Error("Enter their name.");
      const colors = ["sky", "purple", "yellow", "green", "pink", "blue", "orange"];
      member = { id: args.memberId, name, email: "", origin: args.origin.trim().toUpperCase() || "TBD", initials: name.split(/\s+/).map((part: string) => part[0]).join("").slice(0, 2).toUpperCase(), color: colors[state.members.length % colors.length], role: "member", status: "not_invited", clerkSubject: "" };
      state.members.push(member);
    }
    if (state.members.some((person: RallyState) => person.id !== member.id && normalizedEmail(person.email) === args.email)) throw new Error("That email is already linked to someone else.");
    member.email = args.email;
    member.status = "invited";
    member.clerkInvitationId = args.invitationId;
    await ctx.db.patch(doc._id, { buckets: state, updatedAt: Date.now() });
    return routeState(state, { subject: args.subject, email: args.adminEmail });
  },
});

export const sendInvitation = action({
  args: { eventId: v.string(), memberId: v.optional(v.string()), name: v.string(), origin: v.optional(v.string()), email: v.string() },
  handler: async (ctx, args): Promise<{ room: RallyState; memberName: string }> => {
    const identity = await ctx.auth.getUserIdentity() as Identity | null;
    const adminEmail = normalizedEmail(identity?.email);
    const email = normalizedEmail(args.email);
    if (!identity || !adminEmail || identity.emailVerified === false) throw new Error("Sign in with a verified email to invite crew.");
    if (!email.includes("@")) throw new Error("Enter a valid email address.");
    const memberId = args.memberId || `m-${crypto.randomUUID()}`;
    const target: { eventName: string; memberName: string; inviterName: string } = await ctx.runQuery(internal.rally.invitationTarget, {
      eventId: args.eventId, memberId, name: args.name, inviteEmail: email, subject: identity.subject, email: adminEmail,
    });
    const secret = process.env.CLERK_SECRET_KEY;
    if (!secret) throw new Error("Clerk invitations are not configured yet.");
    const redirect = new URL("https://www.john-ta.com/tools/rally/");
    redirect.searchParams.set("event", args.eventId);
    redirect.searchParams.set("view", "crew");
    const response = await fetch("https://api.clerk.com/v1/invitations", {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        email_address: email,
        redirect_url: redirect.toString(),
        notify: true,
        ignore_existing: true,
        public_metadata: { rallyEventId: args.eventId, rallyMemberId: memberId, rallyEventName: target.eventName, rallyInviteeName: target.memberName, rallyInviterName: target.inviterName },
      }),
    });
    const result = await response.json() as { id?: string; errors?: Array<{ long_message?: string; message?: string }> };
    if (!response.ok || !result.id) throw new Error(result.errors?.[0]?.long_message || result.errors?.[0]?.message || `Clerk could not invite ${target.memberName}.`);
    const room = await ctx.runMutation(internal.rally.finishInvitation, {
      eventId: args.eventId, memberId, name: target.memberName, origin: args.origin || "TBD", email, subject: identity.subject, adminEmail, invitationId: result.id,
    });
    return { room, memberName: target.memberName };
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
    } else if (args.action === "delete-task") {
      if (!state.tasks.some((item: RallyState) => item.id === p.id)) throw new Error("That ticket no longer exists.");
      state.tasks = state.tasks.filter((item: RallyState) => item.id !== p.id);
    } else if (args.action === "save-room") {
      const room = state.rooms.find((item: RallyState) => item.id === p.id);
      const record = { hotel: p.hotel, roomType: p.roomType, confirmation: p.confirmation, checkIn: p.checkIn, checkOut: p.checkOut, capacity: Number(p.capacity) || 1, bathrooms: Math.max(1, Number(p.bathrooms) || 1), totalCost: String(p.totalCost || "").trim(), notes: String(p.notes || "").trim() };
      if (room) Object.assign(room, record); else state.rooms.push({ id: id(), ...record, memberIds: [] });
    } else if (args.action === "delete-room") {
      if (!state.rooms.some((item: RallyState) => item.id === p.id)) throw new Error("That room no longer exists.");
      state.rooms = state.rooms.filter((item: RallyState) => item.id !== p.id);
    } else if (args.action === "assign-room") {
      state.rooms.forEach((room: RallyState) => { room.memberIds = room.memberIds.filter((memberId: string) => memberId !== p.memberId); });
      const room = state.rooms.find((item: RallyState) => item.id === p.roomId);
      if (room && room.memberIds.length < room.capacity) room.memberIds.push(p.memberId);
    } else if (["add-flight", "save-flight"].includes(args.action)) {
      const trip = state.travel.find((item: RallyState) => item.id === p.id);
      const record = { ...p, id: undefined, number: String(p.number || "").toUpperCase(), origin: String(p.origin || "").toUpperCase(), destination: String(p.destination || "").toUpperCase(), status: "scheduled" };
      delete record.id;
      if (trip) Object.assign(trip, record); else state.travel.push({ id: id(), ...record });
    } else if (args.action === "delete-flight") {
      if (!state.travel.some((item: RallyState) => item.id === p.id)) throw new Error("That flight leg no longer exists.");
      state.travel = state.travel.filter((item: RallyState) => item.id !== p.id);
    } else if (args.action === "save-flight-group") {
      const memberIds = [...new Set((Array.isArray(p.memberIds) ? p.memberIds : []).map(String))];
      if (!memberIds.length) throw new Error("Choose at least one traveler.");
      if (memberIds.some((memberId) => !state.members.some((member: RallyState) => member.id === memberId))) throw new Error("One of those travelers is no longer in this rave room.");
      const oldIds = new Set((Array.isArray(p.ids) ? p.ids : []).map(String));
      state.travel = state.travel.filter((item: RallyState) => !oldIds.has(item.id));
      const record = { airline: String(p.airline || "").trim(), number: String(p.number || "").trim().toUpperCase(), origin: String(p.origin || "").trim().toUpperCase(), destination: String(p.destination || "").trim().toUpperCase(), departure: p.departure, arrival: p.arrival, confirmation: String(p.confirmation || "").trim().toUpperCase(), status: "scheduled" };
      if (!record.airline || !record.number || !record.origin || !record.destination || !record.departure || !record.arrival) throw new Error("Complete the flight details before saving.");
      memberIds.forEach((memberId) => state.travel.push({ id: id(), memberId, ...record }));
    } else if (args.action === "delete-flight-group") {
      const ids = new Set((Array.isArray(p.ids) ? p.ids : []).map(String));
      if (!ids.size) throw new Error("That flight group no longer exists.");
      state.travel = state.travel.filter((item: RallyState) => !ids.has(item.id));
    } else if (["add-car", "save-car"].includes(args.action)) {
      const car = state.cars.find((item: RallyState) => item.id === p.id);
      const record = { ...p, id: undefined };
      delete record.id;
      if (car) Object.assign(car, record); else state.cars.push({ id: id(), ...record });
    } else if (args.action === "delete-car") {
      if (!state.cars.some((item: RallyState) => item.id === p.id)) throw new Error("That rental car no longer exists.");
      state.cars = state.cars.filter((item: RallyState) => item.id !== p.id);
    } else if (["add-pass", "save-pass"].includes(args.action)) {
      const pass = state.passes.find((item: RallyState) => item.id === p.id);
      const record = { name: String(p.name || "").trim(), category: String(p.category || "Pass").trim(), ownerId: String(p.ownerId || ""), quantity: Number(p.quantity) || 1, unitCost: String(p.unitCost || "").trim(), totalCost: String(p.totalCost || "").trim(), status: String(p.status || "").trim(), notes: String(p.notes || "").trim() };
      if (!record.name) throw new Error("Purchase name is required.");
      if (pass) Object.assign(pass, record); else state.passes.push({ id: id(), ...record });
    } else if (args.action === "delete-pass") {
      if (!state.passes.some((item: RallyState) => item.id === p.id)) throw new Error("That pass no longer exists.");
      state.passes = state.passes.filter((item: RallyState) => item.id !== p.id);
    } else if (args.action === "remove-member") {
      if (!["admin", "leader"].includes(current.role)) throw new Error("Only an admin can remove crew.");
      const member = state.members.find((person: RallyState) => person.id === p.id);
      if (!member || ["admin", "leader"].includes(member.role)) throw new Error("That crew member cannot be removed.");
      state.members = state.members.filter((person: RallyState) => person.id !== p.id);
      state.rooms.forEach((room: RallyState) => { room.memberIds = room.memberIds.filter((memberId: string) => memberId !== p.id); });
      state.travel = state.travel.filter((trip: RallyState) => trip.memberId !== p.id);
      state.cars.forEach((car: RallyState) => { if (car.driverId === p.id) car.driverId = ""; });
      state.tasks.forEach((task: RallyState) => { if (task.assigneeId === p.id) task.assigneeId = ""; });
      state.passes.forEach((pass: RallyState) => { if (pass.ownerId === p.id) pass.ownerId = ""; });
      if (state.lineupFavorites) delete state.lineupFavorites[p.id];
    } else if (args.action === "save-lineup-favorites") {
      const artistIds = [...new Set((Array.isArray(p.artistIds) ? p.artistIds : []).map(String).filter((value) => value.length > 0 && value.length <= 160))].slice(0, 500);
      state.lineupFavorites ||= {};
      state.lineupFavorites[current.id] = artistIds;
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
