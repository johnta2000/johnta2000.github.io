import { ConvexError } from "convex/values";
import { LOST_LANDS_SET_TIMES } from "./lostLandsSetTimes";
import { resolveMeetupTiming } from "./meetupTiming";

type Meetup = {
  id: string; title: string; spot: string; instructions: string; when: string;
  mapId: string; x: number; y: number; timeZone: string; status: string;
  authorId: string; authorName: string; goingIds: string[]; createdAt: number; updatedAt: number;
  timing?: ReturnType<typeof resolveMeetupTiming>["timing"] | null;
};
type Member = {id: string; name: string; role: string};

// rally:act has already verified identity and membership in this specific room.
export function updateMeetups(meetups: Meetup[] = [], eventId: string, action: string, p: any, member: Member, now: number, newId: () => string): Meetup[] {
  if (eventId !== "lost-lands-2026") throw new ConvexError("This festival map is only available for Lost Lands 2026.");
  const existing = action === "add-meetup" ? undefined : meetups.find(meetup => meetup.id === p.id);
  if (action !== "add-meetup" && !existing) throw new ConvexError("This meetup no longer exists. Refresh the page.");
  if (action === "join-meetup") {
    if (typeof p.going !== "boolean") throw new ConvexError("Choose whether you are joining.");
    if (existing!.status !== "planned") throw new ConvexError("This meetup was cancelled.");
    return meetups.map(meetup => meetup.id === p.id ? {...meetup, goingIds: [...new Set([...meetup.goingIds.filter(id => id !== member.id), ...(p.going ? [member.id] : [])])]} : meetup);
  }
  if (existing) {
    if (existing.authorId !== member.id && !["admin", "leader"].includes(member.role)) throw new ConvexError("Only the organizer or an admin can change this meetup.");
    if (p.expectedUpdatedAt !== existing.updatedAt) throw new ConvexError("This meetup changed. Refresh before editing it.");
  }
  if (action === "delete-meetup") return meetups.filter(meetup => meetup.id !== p.id);
  if (!["add-meetup", "edit-meetup"].includes(action)) throw new ConvexError("Unknown meetup action.");
  const text = (value: unknown, max: number, required: boolean) => {
    if (typeof value !== "string" || value.trim().length > max || (required && !value.trim())) throw new ConvexError(`Enter ${required ? "1" : "0"}–${max} characters for each meetup field.`);
    return value.trim();
  };
  const title = text(p.title, 100, true), spot = text(p.spot, 160, true), instructions = text(p.instructions ?? "", 1200, false);
  let when=p.when,timing=existing?.timing??null;
  if(p.timing===null)timing=null;
  else if(p.timing!==undefined){
    try{({when,timing}=resolveMeetupTiming(p.timing,LOST_LANDS_SET_TIMES));}
    catch(error){throw new ConvexError(error instanceof Error?error.message:"Choose a valid set time.");}
  }else if(timing && when!==existing?.when)throw new ConvexError("This meetup is linked to a set. Refresh Rally before changing its time.");
  if (typeof when !== "string" || !/^2026-09-(16|17|18|19|20|21)T([01]\d|2[0-3]):[0-5]\d$/.test(when)) throw new ConvexError("Choose a time between September 16 and 21, 2026 (Eastern time).");
  if (![p.x,p.y].every(n => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1)) throw new ConvexError("Choose a meeting spot on the map.");
  const status = p.status ?? "planned";
  if (!["planned","cancelled"].includes(status)) throw new ConvexError("Choose planned or cancelled.");
  const details = {title, spot, instructions, when, timing, x:p.x, y:p.y, mapId:"lost-lands-2026", timeZone:"America/New_York", status};
  const result = existing
    ? meetups.map(meetup => meetup.id === existing.id ? {...meetup,...details,updatedAt:Math.max(now,meetup.updatedAt+1)} : meetup)
    : [...meetups,{id:newId(),...details,authorId:member.id,authorName:member.name,goingIds:[member.id],createdAt:now,updatedAt:now}];
  if (result.length > 100 || new TextEncoder().encode(JSON.stringify(result)).length > 180000) throw new ConvexError("This project has too many meetups. Delete older plans first.");
  return result;
}
