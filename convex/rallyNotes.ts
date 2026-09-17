import { ConvexError } from "convex/values";
import {normalizeRichText,richTextPlain, type RichNode} from './noteRichText';

type Note = { id: string; body: string; richText?: RichNode[]; reactions?: Record<string,string[]>; section?: string; authorId: string; authorName: string; createdAt: number; updatedAt: number };

// Called only after the room's authenticated membership check in rally:act.
export function updateNotes(notes: Note[] = [], action: string, payload: any, member: { id: string; name: string; role: string }, now: number, newId: () => string): Note[] {
  let body = typeof payload.body === "string" ? payload.body.trim() : "";
  const existing = notes.find(note => note.id === payload.id);
  if(action==='react-note'){
    if(!existing)throw new ConvexError('This note no longer exists. Refresh the board.');
    if(!['👍','❤️','😂','🔥','👀','✅'].includes(payload.emoji)||typeof payload.active!=='boolean')throw new ConvexError('Choose a supported reaction.');
    const reactions={...existing.reactions};
    const people=(reactions[payload.emoji]||[]).filter(id=>id!==member.id);
    if(payload.active)people.push(member.id);
    if(people.length)reactions[payload.emoji]=people;else delete reactions[payload.emoji];
    const result=notes.map(note=>note.id===existing.id?{...note,reactions}:note);
    if(new TextEncoder().encode(JSON.stringify(result)).length>200000)throw new ConvexError('This board is full.');
    return result;
  }
  if (action !== "add-note") {
    if (!existing) throw new ConvexError("This note no longer exists. Refresh the board.");
    const owner = existing.authorId === member.id;
    const admin = ["admin", "leader"].includes(member.role);
    if (!owner && !(action === "delete-note" && admin)) throw new ConvexError("You can only edit or delete your own notes.");
    if (payload.expectedUpdatedAt !== existing.updatedAt) throw new ConvexError("This note changed. Refresh the board before trying again.");
  }
  if (action === "delete-note") return notes.filter(note => note.id !== payload.id);
  if (!["add-note", "edit-note"].includes(action)) throw new ConvexError("Unknown note action.");
  let richText:RichNode[]|undefined;
  if(payload.richText!==undefined){
    try{richText=normalizeRichText(payload.richText);body=richTextPlain(richText).trim();}
    catch(error){throw new ConvexError((error as Error).message);}
  }else if(existing?.body===body)richText=existing.richText;
  const section = payload.section === undefined ? existing?.section || "general" : payload.section;
  if (!["general", "stay", "crew", "travel", "passes"].includes(section)) throw new ConvexError("Choose General, Stay, Crew, Travel, or Passes for this note.");
  if (!body || body.length > 4000) throw new ConvexError("Write a note between 1 and 4,000 characters.");
  const result = action === "add-note"
    ? [{ id: newId(), body, ...(richText?{richText}:{}), section, authorId: member.id, authorName: member.name, createdAt: now, updatedAt: now }, ...notes]
    : notes.map(note => {if(note.id!==payload.id)return note;const {richText:oldFormatting,...rest}=note;return { ...rest, body, ...(richText?{richText}:{}), section, updatedAt: Math.max(now, note.updatedAt + 1) };});
  // Room snapshots include notes for offline reading; leave room for the rest of the trip.
  if (new TextEncoder().encode(JSON.stringify(result)).length > 200000) throw new ConvexError("This board is full. Delete older notes before adding more.");
  return result;
}
