export const artistId = (name: string) => 'artist:' + encodeURIComponent(name.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' '));
// Derive artist credits without changing the saved performance label. Keep
// ambiguous act names (Above & Beyond, Chase & Status, aliases) intact.
const descriptor = '(?:[0-9]+(?:\\.[0-9]+)?\\s*(?:hour|hr)|detox|throwback|classics|dj|live|sunset|sunrise|extended|vinyl|acoustic|dnb|drum\\s*(?:&|and)\\s*bass|house|techno|tech house|hardstyle|dubstep|melodic)';
const bracketed = new RegExp(`\\s*[([]\\s*${descriptor}(?:\\s+set)?\\s*[)\\]]\\s*$`, 'i');
const suffix = new RegExp(`\\s+(?:${descriptor}\\s+set|detox(?:\\s+set)?)\\s*$`, 'i');
function coreName(label: string) {
  const cleaned = label.trim().replace(/^fresh meat:\s*/i, '').replace(/\s+(?:presents|pres\.)\s*:?.*$/i, '').replace(bracketed, '').replace(suffix, '').replace(/\s*[-–—:]\s*$/, '').trim();
  return cleaned || label.trim();
}
export function artistsForSet(label: string): string[] {
  const seen = new Set<string>();
  // An explicitly billed collaboration inside an alias is usable evidence;
  // the alias alone is not. Protect established acts whose name contains “x”.
  const billed = label.match(/\(([^()]*\s+(?:b2b(?:2b)*|x|×)\s+[^()]*)\)\s*$/i)?.[1] || coreName(label);
  const parts = billed.split(/\s+b2b(?:2b)*\s+/i).flatMap(part => /^bonnie\s+x\s+clyde$/i.test(coreName(part)) ? [part] : part.split(/\s+(?:x|×)\s+/i));
  return parts.map(coreName).filter(name => {
    const key = artistId(name);
    if (!key || seen.has(key)) return false;
    seen.add(key); return true;
  });
}
export function artistsForRave(rave: {artists: string[]}): string[] {
  const names = new Map<string, string>();
  for (const label of rave.artists) for (const name of artistsForSet(label)) {
    if (!names.has(artistId(name))) names.set(artistId(name), name);
  }
  return [...names.values()];
}
export function creditDescription(label: string): string {
  const credits = artistsForSet(label);
  return credits.length === 1 && credits[0] === label.trim() ? '' : `Counts toward ${credits.join(' + ')}`;
}
export const setCreditsArtist = (label: string, artist: string) => artistsForSet(label).some(name => name.toLocaleLowerCase() === artist.toLocaleLowerCase());

// Match spelling variants of a known set descriptor while retaining the set
// identity: an artist’s standard, Detox, and B2B performances remain distinct.
export function performanceKey(label: string): string {
  return label.normalize('NFKC').trim().toLocaleLowerCase().replace(/\s+/g, ' ')
    .replace(new RegExp(`\\s*[([]\\s*(${descriptor})(?:\\s+set)?\\s*[)\\]]\\s*$`, 'i'), ' $1')
    .replace(new RegExp(`\\s+(${descriptor})\\s+set$`, 'i'), ' $1').trim();
}
