// Derive artist credits without changing the saved performance label. Keep
// ambiguous act names (Above & Beyond, Chase & Status, aliases) intact.
const descriptor = '(?:detox|throwback|classics|dj|live|sunset|sunrise|extended|vinyl|acoustic|dnb|drum\\s*(?:&|and)\\s*bass|house|techno|tech house|hardstyle|dubstep|melodic)';
const bracketed = new RegExp(`\\s*[([]\\s*${descriptor}(?:\\s+set)?\\s*[)\\]]\\s*$`, 'i');
const suffix = new RegExp(`\\s+(?:${descriptor}\\s+set|detox(?:\\s+set)?)\\s*$`, 'i');
function coreName(label: string) {
  const cleaned = label.trim().replace(/^fresh meat:\s*/i, '').replace(bracketed, '').replace(suffix, '').replace(/\s*[-–—:]\s*$/, '').trim();
  return cleaned || label.trim();
}
export function artistsForSet(label: string): string[] {
  const seen = new Set<string>();
  return coreName(label).split(/\s+(?:b2b(?:2b)*|x|×)\s+/i).map(coreName).filter(name => {
    const key = name.toLocaleLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key); return true;
  });
}
export function artistsForRave(rave: {artists: string[]}): string[] {
  const names = new Map<string, string>();
  for (const label of rave.artists) for (const name of artistsForSet(label)) {
    if (!names.has(name.toLocaleLowerCase())) names.set(name.toLocaleLowerCase(), name);
  }
  return [...names.values()];
}
export function creditDescription(label: string): string {
  const credits = artistsForSet(label);
  return credits.length === 1 && credits[0] === label.trim() ? '' : `Counts toward ${credits.join(' + ')}`;
}
export const setCreditsArtist = (label: string, artist: string) => artistsForSet(label).some(name => name.toLocaleLowerCase() === artist.toLocaleLowerCase());
