import type { Infer } from "convex/values";
import { channelValue } from "./nextcardLaunchTables";

// These are candidate destinations, not verified posting permissions.
const entries: [string, string, Infer<typeof channelValue>["kind"], string[], string][] = [
  ["Chase Ultimate Rewards (UR) & Partners", "https://www.facebook.com/groups/MaximizeChaseUltimateRewards/", "facebook", ["chase", "ultimate rewards", "transfer partners"], "Practical value for Ultimate Rewards members and transfer partners."],
  ["Frequent Miler — Facebook group", "https://www.facebook.com/groups/frequentmiler/", "facebook", ["general", "points", "travel"], "Useful points analysis, original findings, and travel tools."],
  ["10x Travel Insiders", "https://www.facebook.com/groups/10xtravel/", "facebook", ["general", "points", "travel"], "Member-first points and travel explanations."],
  ["United Airlines Mileage Plus Experts", "https://www.facebook.com/groups/1265475118541268/", "facebook", ["united", "mileageplus"], "United and MileagePlus changes with concrete member implications."],
  ["Points Talk Squad", "https://www.facebook.com/groups/travelmomsquad", "facebook", ["general", "points", "family travel"], "Accessible points education and practical travel planning."],
  ["IHG Insiders", "https://www.facebook.com/groups/459680967849314", "facebook", ["ihg", "hotels"], "IHG rewards, hotel tools, and member news."],
  ["World of Hyatt Insider", "https://www.facebook.com/groups/WorldofHyattInsider/", "facebook", ["hyatt", "hotels"], "World of Hyatt rewards and hotel updates."],
  ["Marriott Bonvoy Elite Uncensored", "https://www.facebook.com/groups/marriottbonvoyelitesuncensored", "facebook", ["marriott", "bonvoy", "hotels"], "Marriott Bonvoy changes, elite benefits, and hotel tools."],
  ["Southwest Airline Fans", "https://www.facebook.com/groups/southwestairlinesfans", "facebook", ["southwest", "rapid rewards"], "Southwest news with practical passenger or rewards value."],
  ["r/chasesapphire", "https://www.reddit.com/r/chasesapphire/", "reddit", ["chase", "sapphire", "csr", "csp"], "Chase Sapphire-specific news and explanations."],
  ["r/sapphirereserve", "https://www.reddit.com/r/sapphirereserve/", "reddit", ["chase", "sapphire", "csr"], "Direct value for Sapphire Reserve cardholders."],
  ["r/chasesapphirereserve", "https://www.reddit.com/r/chasesapphirereserve/", "reddit", ["chase", "sapphire", "csr"], "Direct value for Sapphire Reserve cardholders; verify current link rules."],
  ["r/capitalone", "https://www.reddit.com/r/capitalone/", "reddit", ["capital one", "venture", "venture x"], "Capital One news and cardholder implications."],
  ["r/amex", "https://www.reddit.com/r/amex/", "reddit", ["amex", "membership rewards", "platinum", "gold"], "Amex-specific news, offers, and analysis."],
  ["Frequent Miler — editorial outreach", "https://frequentmiler.com/", "outreach", ["general", "points", "original research", "tools"], "A specific news tip, original finding, or useful tool with a clear editorial angle."],
  ["Doctor of Credit — editorial outreach", "https://www.doctorofcredit.com/contact-us/", "outreach", ["general", "credit cards", "offers", "original research", "tools"], "A precise news tip or original finding backed by a source. Add your known contact privately."],
  ["NextCard — website / existing tool", "", "owned", ["general", "tools"], "The canonical story or affected NextCard tool. Add the destination URL."],
  ["r/nextcard", "https://www.reddit.com/r/nextcard/", "owned", ["general", "tools"], "Meaningful NextCard tools, product releases, and original work."],
  ["TikTok — findyournextcard", "https://www.tiktok.com/@findyournextcard", "owned", ["general", "video"], "Timely news that has a clear visual explanation."],
  ["Instagram — findyournextcard", "https://www.instagram.com/findyournextcard/", "owned", ["general", "video"], "Saveable summaries, visual findings, and useful tool demonstrations."],
  ["Threads — NextCard", "", "owned", ["general"], "A concise, useful takeaway. Add the account URL."],
  ["Threads — John Ta", "", "owned", ["general"], "An expert or founder perspective. Add the account URL."],
  ["LinkedIn — John Ta", "", "owned", ["original research", "tools"], "Substantive original research or a meaningful product launch. Add the account URL."],
  ["NextCard — email newsletter", "", "owned", ["general"], "A useful explanation for existing readers. Add the newsletter workspace URL."],
];
export const launchChannelSeeds = entries.map(([name, url, kind, tags, fit], index) => ({
  key: `seed-${index + 1}`,
  value: { name, url, kind, tags, fit, rules: "", ruleStatus: "unverified" as const, verifiedDate: "", linkPolicy: "unknown" as const, approval: "unknown" as const, relationship: "", notes: "Imported as a candidate. Confirm the destination, account access, and current rules before using it.", archived: false },
}));
