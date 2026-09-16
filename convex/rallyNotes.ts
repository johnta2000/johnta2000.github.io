import { ConvexError } from "convex/values";

type Note = { id: string; body: string; authorId: string; authorName: string; createdAt: number; updatedAt: number };

// Called only after the room's authenticated membership check in rally:act.
export function updateNotes(notes: Note[] = [], action: string, payload: any, member: { id: string; name: string; role: string }, now: number, newId: () => string): Note[] {
  const body = typeof payload.body === "string" ? payload.body.trim() : "";
  const existing = notes.find(note => note.id === payload.id);
  if (action !== "add-note") {
    if (!existing) throw new ConvexError("This note no longer exists. Refresh the board.");
    const owner = existing.authorId === member.id;
    const admin = ["admin", "leader"].includes(member.role);
    if (!owner && !(action === "delete-note" && admin)) throw new ConvexError("You can only edit or delete your own notes.");
    if (payload.expectedUpdatedAt !== existing.updatedAt) throw new ConvexError("This note changed. Refresh the board before trying again.");
  }
  if (action === "delete-note") return notes.filter(note => note.id !== payload.id);
  if (!["add-note", "edit-note"].includes(action)) throw new ConvexError("Unknown note action.");
  if (!body || body.length > 4000) throw new ConvexError("Write a note between 1 and 4,000 characters.");
  const result = action === "add-note"
    ? [{ id: newId(), body, authorId: member.id, authorName: member.name, createdAt: now, updatedAt: now }, ...notes]
    : notes.map(note => note.id === payload.id ? { ...note, body, updatedAt: Math.max(now, note.updatedAt + 1) } : note);
  // Room snapshots include notes for offline reading; leave room for the rest of the trip.
  if (new TextEncoder().encode(JSON.stringify(result)).length > 200000) throw new ConvexError("This board is full. Delete older notes before adding more.");
  return result;
}
