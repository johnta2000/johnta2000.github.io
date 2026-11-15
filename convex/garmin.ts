"use node";
import {action} from "./_generated/server";
import {makeFunctionReference} from "convex/server";
import {v,ConvexError} from "convex/values";
import {createCipheriv,createDecipheriv,randomBytes} from "node:crypto";
import {fetchGarmin,shift,GarminRequestError} from "./garminClient";
function encryptionKey() {
  const key=Buffer.from(process.env.GARMIN_TOKEN_ENCRYPTION_KEY || "","base64");
  if(key.length!==32)throw new Error("Garmin encryption is not configured.");return key;
}
export function encryptKey(value:string,owner:string) {
  const iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",encryptionKey(),iv);cipher.setAAD(Buffer.from(owner));
  const encrypted=Buffer.concat([cipher.update(value,"utf8"),cipher.final()]);
  return [iv,cipher.getAuthTag(),encrypted].map(b=>b.toString("base64")).join(".");
}
export function decryptKey(value:string,owner:string) {
  const [iv,tag,data]=value.split(".").map(x=>Buffer.from(x,"base64"));
  const decipher=createDecipheriv("aes-256-gcm",encryptionKey(),iv);decipher.setAAD(Buffer.from(owner));decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data),decipher.final()]).toString("utf8");
}
export const syncPersonal = action({args:{apiKey:v.optional(v.string()),days:v.optional(v.union(v.literal(7),v.literal(28),v.literal(90)))},handler:async(ctx,args):Promise<{synced:number}>=>{
  const user=await ctx.runQuery(makeFunctionReference<"query">("garminData:authorize"),{});
  const connection=await ctx.runQuery(makeFunctionReference<"query">("garminData:connection"),{ownerSubject:user.subject});
  encryptionKey();
  const key=args.apiKey?.trim() || (connection?decryptKey(connection.encryptedKey,user.subject):"");
  if(!key)throw new Error("Add your Garmin Personal API key first.");
  const end=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Los_Angeles",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const start=shift(end,1-(args.days ?? (connection?7:28)));
  let nights;
  try { nights=await fetchGarmin(key,start,end); }
  catch(error) { if(error instanceof GarminRequestError) throw new ConvexError(error.message); throw error; }
  return ctx.runMutation(makeFunctionReference<"mutation">("garminData:save"),{ownerSubject:user.subject,expectedRevision:connection?.revision??null,revision:randomBytes(16).toString("hex"),encryptedKey:encryptKey(key,user.subject),nights});
}});
