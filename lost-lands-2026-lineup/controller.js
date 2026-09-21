// Shared schedule controller: standalone document or native Rally component.
window.createLostLandsLineup = function(root=document, integration=null) {
const surface = root.host || document.documentElement;
const container = root === document ? document.body : root;
const dinoEmpty = '<img src="/tools/rally/assets/dancing-dino.png" alt="" width="56" height="56" style="display:block;margin:0 auto 8px;border-radius:12px">No dinosaurs spotted. Try different filters.';
const lifetime = new AbortController();
let overlayObserver;
let receive = () => {};
const sendToRally = message => integration ? integration.onEvent(message) : window.parent.postMessage(message, location.origin === "null" ? "*" : location.origin);
const CONVEX_URL = "https://dashing-heron-837.convex.cloud";
const LINEUP_EVENT_ID = "lost-lands-2026";
const legacyMainLineup = `
  ADVENTURE CLUB | ÆON:MODE | ALLEYCVT | ARMNHMR | ATLIENS | AUDIOFREQ
  | BARELY ALIVE | BEAR GRILLZ | BENDA | BLOSSOM | BOOGIE T | BORGORE | BOU
  | CALCIUM | CANABLISS | CASPA | CRANKDAT | CRAZE | CULTURE SHOCK | CYCLOPS
  | DELTA HEAVY | DIESELBOY | DION TIMMER | DIRT MONKEY | DIRTYPHONICS
  | DISTINCT MOTIVE | DOCTOR P | DR. FRESCH | DRINKURWATER | EFFIN | EMORFIK
  | EPTIC | EXCISION (2 HOUR SET) | EXCISION (DETOX SET) | EXCISION B2B SPACE LACES
  | FLOSSTRADAMUS | FLUX PAVILION | FUNTCASE | GANJA WHITE NIGHT | GHASTLY | GHENGAR
  | GLADDE PALING | GRABBITZ | HAIRITAGE | HEDEX | HEYZ | HOL! | ILLENIUM | INFEKT
  | IVY LAB | JANTSEN | JESSICA AUDIFFRED | JKYL & HYDE | KAI WACHI | KNOW GOOD
  | KOMPANY | KREWELLA | LAYZ | LEVEL UP | LEVITY | LIL TEXAS | LIQUID STRANGER
  | LYNY | MEFJUS | NGHTMRE | OLIVERSE | PASSPORT | PHASEONE | RAVENSCOON
  | RAY VOLPE | REAPER | THE RESISTANCE | RIOT TEN | SAMPLIFIRE | SEVEN LIONS
  | SIGMA | SIPPY | SLANDER | SMOAKLAND | SODOWN | STUMPI | SUBTRONICS
  | SULLIVAN KING | TAIKI NULIGHT | TRIVECTA | TRUTH | VIRTUAL RIOT | WAX MOTIF
  | WHETHAN | THE WIDDLER | WILLIAM BLACK | WONKYWILLA | WOOLI | YOOKIE | ZINGARA
  | ZOMBOY
`;

const legacySupportLineup = `
  SJ | 2DY4 | ALIENPARK | ALL THE REASON | ARLO | AU5 | AUSTERIA | AVELLO
  | BADKLAAT | BASSTRIPPER | BELLA RENEE | BIG FLORIDA | BRAINRACK | CAPOCHINO
  | CASEY CLUB | CHAMPAGNE DRIP | CHASSI | CHOZEN | CODD DUBZ | CRIZZLY | CRUMB PIT
  | CRYSTAL SKIES | DARKSIDERZ | DEADCROW | DIRTYSNATCHA | DISTANT MATTER
  | DODGE & FUSKI | DR. USHUU | DREAM TAKERS | DUBSCRIBE | FINNUH | FUTURE EXIT
  | GARDELLA | GREEN MATTER | HALIENE | HERSHE | HOSTAGE SITUATION | HURTBOX
  | HVDES | HYDRAULIX | IMANU | IVORY | IZADI | IZZY VADIM | JAENGA | JOSH TEED
  | KILLMATTER | KLIPTIC | KLO | LAZRUS | LEOTRIX | LOWCATION | LUCI | LUMASI
  | MACHAKI | MAD DUBZ | MADGRRL | MILE32 | MINDSET | MODAL NODES | MOZEY | MPORT
  | MUERTE | MYRIAS | MYTHM | NEOTEK | NEUMONIC | NIKITA, THE WICKED | NIMDA
  | NOETIKA | OG NIXIN | ONARA | PAPER SKIES | PEGBOARD NERDS | PHRVA | PONI
  | PRETTY SWEET | PROBCAUSE | PROSECUTE | REMK | RICHARD FINGER | RIOT | ROI*
  | RUSN | RYNS | RZRKT | SAINT MILLER | SETH DAVID | SHLUMP | SISTO | SIKLAH
  | SPACE WIZARD | SPORTMODE | SQISHI | STONED LEVEL | SUBSONIC | SUPER FUTURE
  | TISOKI | TOKYO MACHINE | TWOPERCENT | TYNAN | USAYBFLOW | VAMPA | VKTM
  | WARLORD | WHALES | WILEY | WRAZ | XOTIX | YETEP | YVM3 | ZEN SELEKTA | ZERO
  | ZOEY808
`;

const genreByArtist = {
  "2DY4": "Dubstep",
  "ADVENTURE CLUB": "Melodic Bass",
  "ÆON:MODE": "Drum & Bass",
  "ALLEYCVT": "Dubstep",
  "ARMNHMR": "Melodic Bass",
  "ATLIENS": "Dubstep",
  "AUDIOFREQ": "Hard Dance",
  "AU5": "Melodic Bass",
  "AUSTERIA": "Dubstep",
  "AVELLO": "Dubstep",
  "BADKLAAT": "Dubstep",
  "BARELY ALIVE": "Dubstep",
  "BASSTRIPPER": "Drum & Bass",
  "BEAR GRILLZ": "Dubstep",
  "BENDA": "Dubstep",
  "BLOSSOM": "Bass House",
  "BOOGIE T": "Dubstep",
  "BORGORE": "Dubstep",
  "BOU": "Drum & Bass",
  "CALCIUM": "Dubstep",
  "CANABLISS": "Bass",
  "CASPA": "Dubstep",
  "CHAMPAGNE DRIP": "Bass",
  "CODD DUBZ": "Dubstep",
  "CRANKDAT": "Dubstep",
  "CRAZE": "Trap",
  "CRIZZLY": "Dubstep",
  "CRYSTAL SKIES": "Melodic Bass",
  "CULTURE SHOCK": "Drum & Bass",
  "CYCLOPS": "Dubstep",
  "DARKSIDERZ": "Hard Dance",
  "DEADCROW": "Wave",
  "DELTA HEAVY": "Drum & Bass",
  "DIESELBOY": "Drum & Bass",
  "DION TIMMER": "Dubstep",
  "DIRT MONKEY": "Dubstep",
  "DIRTYPHONICS": "Dubstep",
  "DISTINCT MOTIVE": "Dubstep",
  "DODGE & FUSKI": "Dubstep",
  "DOCTOR P": "Dubstep",
  "DR. FRESCH": "Bass House",
  "DRINKURWATER": "Dubstep",
  "EFFIN": "Dubstep",
  "EMORFIK": "Dubstep",
  "EPTIC": "Dubstep",
  "EXCISION (2 HOUR SET)": "Dubstep",
  "EXCISION (DETOX SET)": "Dubstep",
  "EXCISION B2B SPACE LACES": "Dubstep",
  "FLOSSTRADAMUS": "Trap",
  "FLUX PAVILION": "Dubstep",
  "FUNTCASE": "Dubstep",
  "GANJA WHITE NIGHT": "Dubstep",
  "GHASTLY": "Bass House",
  "GHENGAR": "Dubstep",
  "GLADDE PALING": "Bass",
  "GRABBITZ": "Bass",
  "GREEN MATTER": "Bass",
  "HAIRITAGE": "Dubstep",
  "HALIENE": "Melodic Bass",
  "HEDEX": "Drum & Bass",
  "HEYZ": "Dubstep",
  "HOL!": "Dubstep",
  "ILLENIUM": "Melodic Bass",
  "IMANU": "Drum & Bass",
  "INFEKT": "Dubstep",
  "IVY LAB": "Bass",
  "JANTSEN": "Dubstep",
  "JESSICA AUDIFFRED": "Dubstep",
  "JKYL & HYDE": "Dubstep",
  "KAI WACHI": "Dubstep",
  "KOMPANY": "Dubstep",
  "KREWELLA": "Bass",
  "LAYZ": "Dubstep",
  "LEVEL UP": "Dubstep",
  "LEVITY": "Bass",
  "LIL TEXAS": "Hard Dance",
  "LIQUID STRANGER": "Bass",
  "LYNY": "Bass",
  "MEFJUS": "Drum & Bass",
  "NGHTMRE": "Bass",
  "NIKITA, THE WICKED": "Bass",
  "OLIVERSE": "Dubstep",
  "PASSPORT": "Bass",
  "PEGBOARD NERDS": "Bass",
  "PHASEONE": "Dubstep",
  "RAVENSCOON": "Bass",
  "RAY VOLPE": "Dubstep",
  "REAPER": "Drum & Bass",
  "RIOT": "Dubstep",
  "RIOT TEN": "Dubstep",
  "SAMPLIFIRE": "Dubstep",
  "SEVEN LIONS": "Melodic Bass",
  "SIGMA": "Drum & Bass",
  "SIPPY": "Dubstep",
  "SLANDER": "Melodic Bass",
  "SMOAKLAND": "Bass",
  "SODOWN": "Bass",
  "SPACE WIZARD": "Dubstep",
  "STUMPI": "Bass House",
  "SUBSONIC": "Drum & Bass",
  "SUBTRONICS": "Dubstep",
  "SULLIVAN KING": "Dubstep",
  "TAIKI NULIGHT": "UK Bass",
  "THE RESISTANCE": "Dubstep",
  "THE WIDDLER": "Dubstep",
  "TISOKI": "Dubstep",
  "TOKYO MACHINE": "Bass",
  "TRIVECTA": "Melodic Bass",
  "TRUTH": "Dubstep",
  "TYNAN": "Dubstep",
  "VAMPA": "Dubstep",
  "VIRTUAL RIOT": "Dubstep",
  "WAX MOTIF": "Bass House",
  "WHETHAN": "Bass",
  "WHALES": "Dubstep",
  "WILLIAM BLACK": "Melodic Bass",
  "WONKYWILLA": "Bass",
  "WOOLI": "Dubstep",
  "YOOKIE": "Dubstep",
  "YETEP": "Melodic Bass",
  "YVM3": "Dubstep",
  "ZEN SELEKTA": "Bass",
  "ZINGARA": "Bass",
  "ZOMBOY": "Dubstep"
};

const artistSlug = (artist) =>
  artist
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const parseLegacyLineup = (value, billing) =>
  value
    .split("|")
    .map((artist) => artist.trim().replace(/\s+/g, " "))
    .filter(Boolean)
    .map((artist, index) => ({
      id: `${billing.toLowerCase()}-${artistSlug(artist)}-${index}`,
      artist,
      billing,
      genre: genreByArtist[artist] || "Bass",
      day: "",
      time: "",
      stage: "",
      notes: ""
    }));

const legacyLineup = [
  ...parseLegacyLineup(legacyMainLineup, "Main"),
  ...parseLegacyLineup(legacySupportLineup, "Support")
];
const legacyByArtist = new Map(legacyLineup.map((entry) => [entry.artist, entry]));

const lineupByDay = {
  Wednesday: `
    BARELY ALIVE | CALCIUM B2B MAD DUBZ | CASPA | CHASSI | DISTINCT MOTIVE
    | EMORFIK B2B USAYBFLOW | GARDELLA | HAIRITAGE | HERSHE | HYDRAULIX
    | IZZY VADIM | JAENGA | MILE32 | MPORT | MUERTE | NIKITA, THE WICKED
    | RIOT TEN | SMOAKLAND
  `,
  Thursday: `
    ALIENPARK | DEADCROW | DIRT MONKEY | FUNTCASE | MACHAKI | MINDSET | PHRVA
    | RSUN | RZRKT | SUPER FUTURE | ZEN SELEKTA | MEGA B2B2B2B PRE-PARTY
    | LABEL TAKEOVER
  `,
  Friday: `
    SJ | AUSTERIA | BADKLAAT | BASSTRIPPER | BEAR GRILLZ | BENDA | BORGORE
    | CANABLISS | CASEY CLUB | CRIZZLY | DION TIMMER | DIRTYSNATCHA | DOCTOR P
    | DODGE & FUSKI | DR. USHUU | DRINKURWATER | DUBSCRIBE | EXCISION (2 HOUR SET)
    | FUTURE EXIT | HOL! | INFEKT B2B SAMPLIFIRE | IVY LAB | IZADI | JANTSEN
    | JKYL & HYDE | KLIPTIC | KLO | LAZRUS | LEVITY | LIQUID STRANGER | LUMASI
    | NEUMONIC | NGHTMRE | NIMDA | OLIVERSE | PAPER SKIES | PEGBOARD NERDS
    | PONI | PROBCAUSE | RAVENSCOON | REAPER | RICHARD FINGER | RIOT | SETH DAVID
    | SHLUMP | SIGMA | SIPPY | SUBSONIC | SULLIVAN KING B2B RAY VOLPE
    | THE RESISTANCE | TWOPERCENT | TYNAN | VAMPA | VKTM | THE WIDDLER | WILEY
    | WOOLI (SUNSET SET) | XOTIX | YOOKIE | ZERO
  `,
  Saturday: `
    2DY4 | ÆON:MODE B2B BLOSSOM | ALL THE REASON | AU5 | AUDIOFREQ | BELLA RENEE
    | BIG FLORIDA | BOU | BRAINRACK | CAPOCHINO | CHOZEN | CRAZE B2B DIESELBOY
    | CRUMB PIT | CYCLOPS | DARKSIDERZ B2B MADGRRL | DELTA HEAVY | DIRTYPHONICS
    | DR. FRESCH | EFFIN | FLOSSTRADAMUS | FLUX PAVILION | GANJA WHITE NIGHT
    | GHENGAR | GLADDE PALING | GREEN MATTER | HEDEX | HEYZ | HVDES | ILLENIUM
    | IMANU | IVORY | JESSICA AUDIFFRED | JOSH TEED | KAI WACHI | LAYZ | LEOTRIX
    | LIL TEXAS | LOWCATION | MEFJUS + DAXTA MC | MOZEY | MYRIAS | MYTHM | NEOTEK
    | NOETIKA | PHASEONE | PROSECUTE | SAINT MILLER | SEVEN LIONS (SUNSET SET)
    | SLANDER | SPACE WIZARD | STONED LEVEL | SUBTRONICS B2B LEVEL UP | TISOKI
    | TRUTH | TOKYO MACHINE | WHALES | WHETHAN | WRAZ | ZINGARA | ZOMBOY
  `,
  Sunday: `
    ADVENTURE CLUB (THROWBACK SET) | ARLO | ARMNHMR | ATLIENS | AVELLO | BOOGIE T
    | CHAMPAGNE DRIP | CODD DUBZ | CRANKDAT B2B ALLEYCVT | CRYSTAL SKIES
    | DISTANT MATTER | DREAM TAKERS | EPTIC B2B LYNY | EXCISION (DETOX)
    | EXCISION B2B SPACE LACES | FINNUH | GHASTLY | GRABBITZ | HALIENE
    | HOSTAGE SITUATION | HURTBOX | KILLMATTER | KNOW GOOD | KOMPANY | KREWELLA
    | LUCI | MAD DUBZ | MODAL NODES | OG NIXIN | ONARA | PASSPORT | PRETTY SWEET
    | REMK | ROI* | RYNS | SISTO | SKILAH | SODOWN | SPORTMODE | SQISHI | STUMPI
    | TAIKI NULIGHT | TRIVECTA | USAYBFLOW | VIRTUAL RIOT | WARLORD | WAX MOTIF
    | WILLIAM BLACK | WONKYWILLA | YETEP | YVM3 | ZOEY808
  `
};

const preferenceAliases = {
  "CALCIUM B2B MAD DUBZ": ["CALCIUM", "MAD DUBZ"],
  "EMORFIK B2B USAYBFLOW": ["EMORFIK", "USAYBFLOW"],
  "RSUN": ["RUSN"],
  "INFEKT B2B SAMPLIFIRE": ["INFEKT", "SAMPLIFIRE"],
  "SULLIVAN KING B2B RAY VOLPE": ["SULLIVAN KING", "RAY VOLPE"],
  "WOOLI (SUNSET SET)": ["WOOLI"],
  "ÆON:MODE B2B BLOSSOM": ["ÆON:MODE", "BLOSSOM"],
  "CRAZE B2B DIESELBOY": ["CRAZE", "DIESELBOY"],
  "DARKSIDERZ B2B MADGRRL": ["DARKSIDERZ", "MADGRRL"],
  "MEFJUS + DAXTA MC": ["MEFJUS"],
  "SEVEN LIONS (SUNSET SET)": ["SEVEN LIONS"],
  "SUBTRONICS B2B LEVEL UP": ["SUBTRONICS", "LEVEL UP"],
  "ADVENTURE CLUB (THROWBACK SET)": ["ADVENTURE CLUB"],
  "CRANKDAT B2B ALLEYCVT": ["CRANKDAT", "ALLEYCVT"],
  "EPTIC B2B LYNY": ["EPTIC", "LYNY"],
  "EXCISION (DETOX)": ["EXCISION (DETOX SET)"],
  "SKILAH": ["SIKLAH"]
};

const stageLineups = {
  "Prehistoric Stage": `ATLIENS | AVELLO | CAPOCHINO | CRANKDAT B2B ALLEYCVT | EFFIN | EXCISION (2 HOUR SET) | EXCISION B2B SPACE LACES | FLUX PAVILION | GRABBITZ | HEYZ | HOL! | ILLENIUM | INFEKT B2B SAMPLIFIRE | JESSICA AUDIFFRED | JKYL & HYDE | KAI WACHI | KOMPANY | LEVITY | MAD DUBZ | NEOTEK | RAVENSCOON | SETH DAVID | SLANDER | SULLIVAN KING B2B RAY VOLPE | TYNAN | USAYBFLOW | ZOMBOY`,
  "Wompy Woods": `ADVENTURE CLUB (THROWBACK SET) | ALL THE REASON | ARMNHMR | BENDA | BIG FLORIDA | BOOGIE T | BRAINRACK | CRYSTAL SKIES | DION TIMMER | DREAM TAKERS | DRINKURWATER | EPTIC B2B LYNY | EXCISION (DETOX) | GANJA WHITE NIGHT | GHENGAR | HALIENE | HVDES | IVORY | KNOW GOOD | LIQUID STRANGER | NGHTMRE | OLIVERSE | PAPER SKIES | PHASEONE | RIOT | SEVEN LIONS (SUNSET SET) | SIPPY | SPACE WIZARD | SUBTRONICS B2B LEVEL UP | THE RESISTANCE | TISOKI | VIRTUAL RIOT | VKTM | WONKYWILLA | WOOLI (SUNSET SET) | YETEP | YOOKIE | ZINGARA`,
  "The Crater": `2DY4 | ALIENPARK | BADKLAAT | BARELY ALIVE | BEAR GRILLZ | BORGORE | CALCIUM B2B MAD DUBZ | CHAMPAGNE DRIP | CHASSI | CODD DUBZ | CRIZZLY | CYCLOPS | DEADCROW | DOCTOR P | DIRTYSNATCHA | DR. FRESCH | EMORFIK B2B USAYBFLOW | FLOSSTRADAMUS | FUNTCASE | IZZY VADIM | KREWELLA | LAYZ | LUCI | MACHAKI | MILE32 | MUERTE | PEGBOARD NERDS | PRETTY SWEET | PROSECUTE | RIOT TEN | RZRKT | SODOWN | STONED LEVEL | TRIVECTA | WHALES | WHETHAN | THE WIDDLER | WILLIAM BLACK`,
  "Forest Stage": `ÆON:MODE B2B BLOSSOM | ARLO | AUSTERIA | BELLA RENEE | BOU | CANABLISS | CRAZE B2B DIESELBOY | CRUMB PIT | DELTA HEAVY | DIRTYPHONICS | DISTANT MATTER | DR. USHUU | GHASTLY | HEDEX | IMANU | IVY LAB | JANTSEN | LUMASI | MEFJUS + DAXTA MC | MOZEY | PASSPORT | PROBCAUSE | RICHARD FINGER | RYNS | SHLUMP | SKILAH | STUMPI | TAIKI NULIGHT | TWOPERCENT | WAX MOTIF | WILEY | XOTIX | ZOEY808`,
  "Subsidia Stage": `SJ | AU5 | CASEY CLUB | CHOZEN | DUBSCRIBE | FINNUH | FUTURE EXIT | GREEN MATTER | HOSTAGE SITUATION | HURTBOX | IZADI | JOSH TEED | KLIPTIC | KLO | LAZRUS | LEOTRIX | LOWCATION | MODAL NODES | MYRIAS | MYTHM | NEUMONIC | NIMDA | NOETIKA | OG NIXIN | ONARA | PONI | ROI* | SAINT MILLER | SISTO | SQISHI | TOKYO MACHINE | TRUTH | VAMPA | WARLORD | WRAZ | YVM3 | ZERO`,
  "Raptor Alley": `AUDIOFREQ | BASSTRIPPER | DARKSIDERZ B2B MADGRRL | GLADDE PALING | KILLMATTER | LIL TEXAS | REAPER | REMK | SIGMA | SPORTMODE | SUBSONIC`,
  "Grove Stage": `CASPA | DIRT MONKEY | DISTINCT MOTIVE | GARDELLA | HAIRITAGE | HERSHE | HYDRAULIX | JAENGA | MINDSET | MPORT | NIKITA, THE WICKED | PHRVA | RSUN | SMOAKLAND | SUPER FUTURE | ZEN SELEKTA`
};

const stageByArtist = new Map();
Object.entries(stageLineups).forEach(([stage, artists]) => {
  artists.split("|").map((artist) => artist.trim().replace(/\s+/g, " ")).filter(Boolean)
    .forEach((artist) => stageByArtist.set(artist, stage));
});

function formatClock(value) {
  const [hoursValue, minutes] = String(value || "").slice(11, 16).split(":");
  const hours = Number(hoursValue);
  if (!Number.isInteger(hours) || !minutes) return "Time TBD";
  return `${hours % 12 || 12}:${minutes} ${hours >= 12 ? "PM" : "AM"}`;
}

const lineup = (window.LOST_LANDS_SET_TIMES || []).map((entry, index) => ({
  ...entry,
  time: `${formatClock(entry.start)} – ${formatClock(entry.end)}`,
  startMinutes: (() => {
    const [hours, minutes] = entry.start.slice(11, 16).split(":").map(Number);
    return hours * 60 + minutes + (entry.start.slice(0, 10) > entry.festivalDate ? 24 * 60 : 0);
  })(),
  notes: entry.timeZone,
  posterIndex: index,
}));

const dayOrder = ["Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
let hiddenLineupDays = new Set();
function visibleLineupDays() { return dayOrder.filter(day => !hiddenLineupDays.has(day)); }
const stageOrder = [...new Set(lineup.map((entry) => entry.stage))];
const genreOrder = [...new Set(lineup.map((entry) => entry.genre))].sort((left, right) =>
  left.localeCompare(right, undefined, { sensitivity: "base" })
);
const timeBounds = {
  min: Math.min(...lineup.map((entry) => entry.startMinutes)),
  max: Math.max(...lineup.map((entry) => entry.startMinutes)),
};

const currentIdsByLegacyId = new Map();
const addPreferenceAlias = (fromId, toId) => {
  const currentIds = currentIdsByLegacyId.get(fromId) || new Set();
  currentIds.add(toId);
  currentIdsByLegacyId.set(fromId, currentIds);
};
lineup.forEach((entry) => {
  addPreferenceAlias(entry.id, entry.id);
  (entry.legacyIds || []).forEach((legacyId) => addPreferenceAlias(legacyId, entry.id));
});
// An exact set ID always means that one performance. Historical artist
// aliases may fan out only when they are no longer a current set ID.
// Otherwise "set-secret-takeover" re-selects every slot on each reload.
const canonicalFavoriteIds = new Set(lineup.map((entry) => entry.id));
const currentFavoriteIds = (id) => canonicalFavoriteIds.has(id) ? [id] : [...(currentIdsByLegacyId.get(id) || [id])];

const els = {
  accountButton: root.getElementById("account-button"),
  accountContent: root.getElementById("account-content"),
  accountDialog: root.getElementById("account-dialog"),
  accountDialogClose: root.getElementById("account-dialog-close"),
  accountDialogCopy: root.getElementById("account-dialog-copy"),
  accountDialogTitle: root.getElementById("account-dialog-title"),
  clearFiltersButton: root.getElementById("clear-filters-button"),
  favoriteCount: root.getElementById("favorite-count"),
  favoritesFilterButton: root.getElementById("favorites-filter-button"),
  filterPopovers: [...root.querySelectorAll(".filter-popover")],
  filterToggle: root.getElementById("filter-toggle"),
  filterCount: root.getElementById("filter-count"),
  filterFields: root.getElementById("filter-fields"),
  popularitySort: root.getElementById("popularity-sort"),
  heatViewButton: root.getElementById("heat-view-button"),
  heatView: root.getElementById("heat-view"),
  heatContent: root.getElementById("heat-content"),
  heatScale: root.getElementById("heat-scale"),
  posterContent: root.getElementById("poster-content"),
  posterView: root.getElementById("poster-view"),
  posterViewButton: root.getElementById("poster-view-button"),
  resultCount: root.getElementById("result-count"),
  saveFavoritesButton: root.getElementById("save-favorites-button"),
  search: root.getElementById("search"),
  shareButton: root.getElementById("share-button"),
  tableBody: root.getElementById("table-body"),
  tableView: root.getElementById("table-view"),
  tableViewButton: root.getElementById("table-view-button"),
  timeMax: root.getElementById("time-max"),
  timeMaxText: root.getElementById("time-max-text"),
  timeMin: root.getElementById("time-min"),
  timeMinText: root.getElementById("time-min-text"),
  timeRangeFill: root.getElementById("time-range-fill"),
};

const validFavoriteIds = new Set(lineup.map((entry) => entry.id));
const lineupById = new Map(lineup.map((entry) => [entry.id, entry]));
const mobileViewQuery = window.matchMedia("(max-width: 760px)");
const rallyManagedFavorites = Boolean(integration) || window.parent !== window && new URLSearchParams(window.location.search).get("rally") === "1";
surface.classList.toggle("rally-mode", rallyManagedFavorites);
let favorites = new Set();
let lineupInterests = {};
let currentRallyMember = null;
let cloudAccount = null;
let cloudSaveTimer = null;
let anonymousHintShown = false;
let activeView = "table";
let mostLiked = false;
let sortMode = 'time';
let groupStateLoaded = false;
let favoritesOnly = false;
let crewLikesOnly = false;
let viewingSharedFavorites = false;
let selectedDays = new Set();
let selectedStages = new Set();
let selectedGenres = new Set();
let timeMin = timeBounds.min;
let timeMax = timeBounds.max;

function normalizeText(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getCanonicalUrl() {
  if (integration) return integration.shareUrl;
  const cleanPath = window.location.pathname.replace(/\/index\.html$/, "/");
  return `${window.location.origin}${cleanPath}`;
}

function setCanonicalUrl() {
  const canonical = root.querySelector('link[rel="canonical"]');
  if (canonical) canonical.href = getCanonicalUrl();
}

function getHashParams() {
  if (integration) return new URLSearchParams(integration.params);
  const hash = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;
  return new URLSearchParams(hash);
}

function getIncomingParams() {
  const hashParams = getHashParams();
  if ([...hashParams.keys()].length) return hashParams;
  return new URLSearchParams(window.location.search);
}

function encodeSharedFavorites() {
  const bytes = new Uint8Array(Math.ceil(lineup.length / 8));
  favorites.forEach((id) => {
    const index = lineupById.get(id)?.posterIndex;
    if (Number.isInteger(index)) bytes[Math.floor(index / 8)] |= 1 << (index % 8);
  });

  const binary = [...bytes].map((byte) => String.fromCharCode(byte)).join("");
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeSharedFavorites(value) {
  if (!value) return [];

  try {
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const binary = atob(padded);
    const ids = [];

    [...binary].forEach((character, byteIndex) => {
      const byte = character.charCodeAt(0);
      for (let bit = 0; bit < 8; bit += 1) {
        const index = byteIndex * 8 + bit;
        if ((byte & (1 << bit)) && lineup[index]) ids.push(lineup[index].id);
      }
    });

    return ids;
  } catch (error) {
    return value
      .split(".")
      .map((token) => Number.parseInt(token, 36))
      .filter((index) => Number.isInteger(index) && lineup[index])
      .map((index) => lineup[index].id);
  }
}

function decodeLegacyFavorites(value) {
  if (!value) return [];

  return value
    .split(",")
    .flatMap((id) => currentFavoriteIds(id.trim()))
    .filter((id) => validFavoriteIds.has(id));
}

function readStateFromUrl() {
  const params = getIncomingParams();
  els.search.value = params.get("q") || "";
  const type = params.get("type") || params.get("billing") || "all";
  favoritesOnly = params.get("fav") === "1" || type === "favorites";
  crewLikesOnly = rallyManagedFavorites && params.get('likes')==='crew';
  if(crewLikesOnly)favoritesOnly=false;
  selectedDays = new Set((params.get("days") || params.get("day") || "").split(",").filter((value) => dayOrder.includes(value)));
  selectedStages = new Set((params.get("stages") || params.get("stage") || "").split(",").filter((value) => stageOrder.includes(value)));
  selectedGenres = new Set((params.get("genres") || params.get("genre") || "").split(",").filter((value) => genreOrder.includes(value)));
  const incomingMin = Number(params.get("start"));
  const incomingMax = Number(params.get("end"));
  timeMin = Number.isFinite(incomingMin) && incomingMin >= timeBounds.min && incomingMin <= timeBounds.max ? incomingMin : timeBounds.min;
  timeMax = Number.isFinite(incomingMax) && incomingMax >= timeBounds.min && incomingMax <= timeBounds.max ? incomingMax : timeBounds.max;
  if (timeMin > timeMax) {
    timeMin = timeBounds.min;
    timeMax = timeBounds.max;
  }
  activeView = ["board", "poster"].includes(params.get("view")) ? "board" : "table";
  if (rallyManagedFavorites && params.get("view") === "heat") activeView = "heat";
  if (params.get('view') === 'timeline') activeView = 'timeline';
  mostLiked = rallyManagedFavorites && params.get("sort") === "popular";
  sortMode = mostLiked ? 'popular' : params.get('sort') === 'artist' ? 'artist' : 'time';

  const hasSharedFavorites = params.has("f") || params.has("favorites");
  const sharedFavorites = [
    ...decodeSharedFavorites(params.get("f")),
    ...decodeLegacyFavorites(params.get("favorites"))
  ];

  viewingSharedFavorites = hasSharedFavorites;

  if (hasSharedFavorites) {
    favorites = new Set(sharedFavorites);
  }
}

function writeStateToUrl() {
  const params = new URLSearchParams();
  if (els.search.value.trim()) params.set("q", els.search.value.trim());
  if (selectedDays.size) params.set("days", [...selectedDays].join(","));
  if (selectedStages.size) params.set("stages", [...selectedStages].join(","));
  if (selectedGenres.size) params.set("genres", [...selectedGenres].join(","));
  if (timeMin !== timeBounds.min || timeMax !== timeBounds.max) {
    params.set("start", String(timeMin));
    params.set("end", String(timeMax));
  }
  if (activeView !== "table") params.set("view", activeView);
  if (sortMode !== 'time') params.set("sort", sortMode);
  if (favoritesOnly) params.set("fav", "1");
  if (crewLikesOnly) params.set('likes','crew');
  if (integration) { integration.params=params.toString(); integration.onParams(params); return; }
  const next = `${window.location.pathname}${rallyManagedFavorites ? "?rally=1" : ""}${params.toString() ? `#${params}` : ""}`;
  window.history.replaceState({}, "", next);
}

function getFilteredLineup() {
  const query = normalizeText(els.search.value.trim());

  const filtered = lineup.filter((entry) => {
    if (hiddenLineupDays.has(entry.day)) return false;
    const matchesQuery =
      !query ||
      normalizeText(`${entry.artist} ${entry.day} ${entry.stage} ${entry.billing} ${entry.genre} ${entry.time}`).includes(query);
    const matchesDay = !selectedDays.size || selectedDays.has(entry.day);
    const matchesGenre = !selectedGenres.size || selectedGenres.has(entry.genre);
    const matchesStage = !selectedStages.size || selectedStages.has(entry.stage);
    const matchesTime = entry.startMinutes >= timeMin && entry.startMinutes <= timeMax;
    const matchesFavorite = crewLikesOnly ? groupPeople(entry.id).length>0 : !favoritesOnly || favorites.has(entry.id);

    return matchesQuery && matchesDay && matchesGenre && matchesStage && matchesTime && matchesFavorite;
  });

  return filtered.sort(compareSets);
}

function groupPeople(id) {
  const people = Array.isArray(lineupInterests[id]) ? lineupInterests[id] : [];
  return people.filter((person, index) => person?.id && people.findIndex((other) => other?.id === person.id) === index);
}

function compareSets(left, right) {
  return (mostLiked ? groupPeople(right.id).length - groupPeople(left.id).length : sortMode === 'artist' ? left.artist.localeCompare(right.artist) : 0) || left.posterIndex - right.posterIndex;
}

function renderHeatMap(entries) {
  const maximum = Math.max(0, ...lineup.filter(entry=>!hiddenLineupDays.has(entry.day)).map((entry) => groupPeople(entry.id).length));
  els.heatScale.textContent = maximum ? `0–${maximum} interested · deeper green = more interest` : "No group favorites yet · star a set to get started";
  if (!groupStateLoaded || !entries.length) {
    els.heatContent.innerHTML = `<div class="empty-state">${!groupStateLoaded ? "Loading your crew’s favorites…" : dinoEmpty}</div>`;
    return;
  }
  const days = dayOrder.filter((day) => entries.some((entry) => entry.day === day));
  const stages = stageOrder.filter(stage => entries.some(entry => entry.stage === stage));
  els.heatContent.innerHTML = `<div class="interest-matrix" role="table" aria-label="Set interest by stage and festival day" style="--matrix-days:${days.length}">
    <div class="matrix-row matrix-header" role="row"><div class="matrix-corner" role="columnheader">Stage / Day</div>${days.map(day => {
      const sets=entries.filter(entry=>entry.day===day);
      return `<div class="matrix-day" role="columnheader"><strong>${escapeHtml(day)}</strong><span>${escapeHtml(formatFestivalDate(sets[0].festivalDate))} · ${sets.length} sets</span></div>`;
    }).join('')}</div>
    ${stages.map(stage => `<div class="matrix-row" role="row"><div class="matrix-stage" role="rowheader" style="--stage-color:${boardStageColor(stage)}"><i aria-hidden="true"></i><strong>${escapeHtml(stage)}</strong></div>${days.map(day=>{
      const sets=entries.filter(entry=>entry.day===day&&entry.stage===stage).sort(compareSets);
      return `<div class="matrix-cell" role="cell" aria-label="${escapeHtml(day)} · ${escapeHtml(stage)}">${sets.length?sets.map(entry=>boardSetCard(entry,{maximum,heat:true})).join(''):'<p class="matrix-empty">No matching sets</p>'}</div>`;
    }).join('')}</div>`).join('')}
  </div>`;
}

function boardDayHeader(day, sets) {
  return `<header class="day-column-header"><div><strong>${escapeHtml(day)}</strong><small>${escapeHtml(formatFestivalDate(sets[0].festivalDate))}</small></div><span class="day-set-count">${sets.length} sets</span></header>`;
}

function boardStageColor(stage) {
  const colors = ['#258579','#c56933','#7864b5','#b45376','#467bbc','#7f873b','#995636'];
  return colors[stageOrder.indexOf(stage) % colors.length] || colors[0];
}

function boardSetCard(entry, {maximum = 0, heat = false} = {}) {
  const people = groupPeople(entry.id), count = people.length, saved = favorites.has(entry.id);
  const ratio = maximum ? count / maximum : 0;
  const overnight = entry.start.slice(0,10) > entry.festivalDate ? 'After midnight' : entry.end.slice(0,10) > entry.start.slice(0,10) ? 'Ends next day' : '';
  return `<article class="board-set${heat ? ' board-set-heat' : ''}" style="--stage-color:${boardStageColor(entry.stage)};--heat-tint:${Math.round(ratio*28)}%;--heat-strength:${Math.round(ratio*100)}%">
    <div class="board-set-heading"><div class="board-set-copy">
      <p class="board-set-time">${escapeHtml(formatClock(entry.start))} – ${escapeHtml(formatClock(entry.end))}</p>
      <h3>${escapeHtml(entry.artist)}</h3>
    </div><button class="favorite-button${saved ? ' is-active' : ''}" type="button" data-favorite-id="${escapeHtml(entry.id)}" aria-pressed="${saved}" aria-label="${saved ? 'Remove' : 'Add'} ${escapeHtml(entry.artist)} favorite">★</button></div>
    ${overnight ? `<span class="board-set-overnight">${overnight}</span>` : ''}
    ${rallyManagedFavorites ? `<div class="board-set-crew">${count ? `<details><summary><span class="board-avatars" aria-hidden="true">${people.slice(0,3).map(person=>`<i>${escapeHtml(person.initials || person.name.slice(0,1))}</i>`).join('')}</span><span><strong>${count}</strong> interested</span><span class="board-expand" aria-hidden="true">⌄</span></summary><p>${people.map(person=>escapeHtml(person.name)).join(' · ')}</p></details>` : `<span class="board-no-picks">${groupStateLoaded ? 'No crew favorites yet' : 'Loading crew favorites…'}</span>`}
    ${heat ? `<div class="board-heat-meter" role="img" aria-label="${count} interested; most popular set has ${maximum}"><i></i></div>` : ''}</div>` : ''}
  </article>`;
}

function renderDayBoard(entries) {
  if (!entries.length) {
    els.posterContent.innerHTML = `<div class="empty-state">${dinoEmpty}</div>`;
    return;
  }

  els.posterContent.innerHTML = dayOrder
    .filter((day) => entries.some((entry) => entry.day === day))
    .map((day) => {
      const dayEntries = entries.filter((entry) => entry.day === day);
      const stages = stageOrder.filter((stage) => dayEntries.some((entry) => entry.stage === stage));
      const stageGroups = stages.map((stage) => {
        const stageEntries = dayEntries
          .filter((entry) => entry.stage === stage)
          .sort(compareSets);
        const color = boardStageColor(stage);
        const cards = stageEntries.map(entry => boardSetCard(entry)).join('');
        return `
          <section class="stage-group" style="--stage-color:${color}">
            <header class="stage-group-header"><span>${escapeHtml(stage)}</span><span>${stageEntries.length} set${stageEntries.length === 1 ? "" : "s"}</span></header>
            <div class="day-set-list">${cards}</div>
          </section>
        `;
      }).join("");
      return `
        <section class="day-column">
          ${boardDayHeader(day, dayEntries)}
          <div class="day-column-body">${stageGroups}</div>
        </section>
      `;
    })
    .join("");
}

function easternNow() {
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).map(part=>[part.type,part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
function updateScheduleProgress() {
  const now=easternNow();
  root.querySelectorAll('[data-set-start]').forEach(node=>{
    node.classList.toggle('set-ended',node.dataset.setEnd<=now);
    node.classList.toggle('set-live',node.dataset.setStart<=now&&node.dataset.setEnd>now);
  });
  root.querySelectorAll('.schedule-now').forEach(node=>node.remove());
  if(activeView==='table'&&sortMode==='time'){
    const parent=mobileViewQuery.matches?root.getElementById('mobile-schedule'):els.tableBody;
    const rows=[...parent.querySelectorAll('[data-set-start]')];
    // Use the festival-day window, including its after-midnight sets.
    const dates=[...new Set(rows.map(node=>node.dataset.festivalDate))];
    const relevant=dates.some(date=>now>=date+'T00:00'&&now<new Date(Date.parse(date+'T00:00Z')+28*3600000).toISOString().slice(0,16));
    if(rows.length&&relevant){
      const marker=document.createElement(mobileViewQuery.matches?'div':'tr');marker.className='schedule-now';
      const label=`Now · ${formatClock(now)} ET · ended sets are dimmed`;
      marker.innerHTML=mobileViewQuery.matches?`<span>${label}</span>`:`<td colspan="${rallyManagedFavorites?7:6}">${label}</td>`;
      const next=rows.find(node=>node.dataset.setEnd>now);
      if(next)next.before(marker);else parent.append(marker);
    }
  }
  root.querySelectorAll('.timeline-now').forEach(node=>{
    const minute=Date.parse(now+'Z')/60000,start=Number(node.dataset.start),end=Number(node.dataset.end);
    node.hidden=minute<start||minute>end;node.style.left=((minute-start)*4)+'px';node.title=`Now · ${formatClock(now)} ET`;
  });
}
function renderTable(entries) {
  if (!entries.length) {
    els.tableBody.innerHTML = `
      <tr>
        <td class="empty-state" colspan="${rallyManagedFavorites ? 7 : 6}">${dinoEmpty}</td>
      </tr>
    `;
    return;
  }

  let renderedDay = "";
  els.tableBody.innerHTML = entries
    .map((entry) => {
      const dayEntries = entries.filter((candidate) => candidate.day === entry.day);
      const dayDivider = sortMode !== 'time' || renderedDay === entry.day ? "" : `
        <tr class="day-divider"><td colspan="${rallyManagedFavorites ? 7 : 6}">${escapeHtml(entry.day)} · ${escapeHtml(formatFestivalDate(entry.festivalDate))} · ${dayEntries.length} set${dayEntries.length === 1 ? "" : "s"}</td></tr>
      `;
      renderedDay = entry.day;
      return `${dayDivider}
        <tr data-set-start="${entry.start}" data-set-end="${entry.end}" data-festival-date="${entry.festivalDate}">
          <td>
            <button
              class="favorite-button ${favorites.has(entry.id) ? "is-active" : ""}"
              type="button"
              data-favorite-id="${entry.id}"
              aria-pressed="${favorites.has(entry.id)}"
              aria-label="${favorites.has(entry.id) ? "Remove" : "Add"} ${escapeHtml(entry.artist)} favorite"
            >★</button>
          </td>
          <td class="time-cell"><span class="schedule-time">${escapeHtml(formatClock(entry.start))}</span></td>
          <td class="time-cell"><span class="schedule-time">${escapeHtml(formatClock(entry.end))}</span></td>
          <td class="artist-cell" title="${escapeHtml(entry.artist)}">${escapeHtml(entry.artist)}${mostLiked ? `<small class="rank-day">${escapeHtml(entry.day.slice(0, 3))} · ${escapeHtml(formatFestivalDate(entry.festivalDate))}</small>` : ""}</td>
          <td class="stage-cell">${escapeHtml(entry.stage)}</td>
          <td class="genre-cell genre-column">${escapeHtml(entry.genre)}</td>
          <td class="rally-only">${renderInterest(entry.id)}</td>
        </tr>
      `;
    })
    .join("");
}

function formatFestivalDate(value) {
  const [, month, day] = String(value || "").split("-").map(Number);
  if (!month || !day) return "Date TBD";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(2026, month - 1, day));
}

function renderInterest(artistId) {
  const people = groupPeople(artistId);
  if (!people.length) return `<span class="interest-empty">—</span>`;
  return `<div class="interest-list"><span class="group-count" title="${people.length} crew members interested">${people.length}</span>${people.map((person) => {
    const allowedColors = new Set(["coral", "sky", "purple", "yellow", "green", "pink", "blue", "orange"]);
    const color = allowedColors.has(person.color) ? person.color : "purple";
    return `<span class="interest-person" title="${escapeHtml(person.name)}"><i class="${color}">${escapeHtml(person.initials)}</i><span>${escapeHtml(person.name)}</span></span>`;
  }).join("")}</div>`;
}

function updateCurrentMemberInterest(artistId) {
  if (!rallyManagedFavorites || !currentRallyMember) return;
  const people = Array.isArray(lineupInterests[artistId]) ? lineupInterests[artistId] : [];
  const withoutCurrent = people.filter((person) => person.id !== currentRallyMember.id);
  if (favorites.has(artistId)) withoutCurrent.push(currentRallyMember);
  if (withoutCurrent.length) lineupInterests[artistId] = withoutCurrent;
  else delete lineupInterests[artistId];
}

function updateViewButtons() {
  root.getElementById('timeline-view').hidden=activeView!=='timeline';
  root.getElementById('timeline-view-button').classList.toggle('is-active',activeView==='timeline');
  root.getElementById('timeline-view-button').setAttribute('aria-pressed',String(activeView==='timeline'));
  const isBoard = activeView === "board";
  els.posterView.hidden = !isBoard;
  els.tableView.hidden = activeView !== "table";
  els.heatView.hidden = activeView !== "heat";
  els.heatViewButton.classList.toggle("is-active", activeView === "heat");
  els.popularitySort.hidden = false;
  els.popularitySort.textContent = `Sort: ${{time:'Set time',popular:'Most liked',artist:'Artist A–Z'}[sortMode]} ↓`;
  els.posterViewButton.classList.toggle("is-active", isBoard);
  els.tableViewButton.classList.toggle("is-active", activeView === "table");
  [els.tableViewButton, els.posterViewButton, els.heatViewButton].forEach((button) => button.setAttribute("aria-pressed", String(button.classList.contains("is-active"))));
  els.favoritesFilterButton.setAttribute("aria-pressed", String(favoritesOnly));
  root.querySelectorAll('[data-likes-filter]').forEach(button=>{const selected=button.dataset.likesFilter===(crewLikesOnly?'crew':favoritesOnly?'mine':'all');button.classList.toggle('is-active',selected);button.setAttribute('aria-pressed',String(selected));});
  els.saveFavoritesButton.hidden = !viewingSharedFavorites || favorites.size === 0;
  const mobile = mobileViewQuery.matches;
  root.getElementById('mobile-schedule').hidden = !mobile || activeView==='timeline';
  if (mobile) { els.posterView.hidden = true; els.tableView.hidden = true; els.heatView.hidden = true; }
  els.posterViewButton.textContent = mobile ? 'By stage' : 'Day board';
  els.heatViewButton.textContent = 'Heat map';
  if (!rallyManagedFavorites) {
    els.accountButton.hidden = false;
    els.accountButton.classList.toggle("is-signed-in", Boolean(cloudAccount));
    els.accountButton.textContent = cloudAccount ? `${cloudAccount.name} · Synced` : "Sign in to sync";
  }
}

function render() {
  selectedDays = new Set([...selectedDays].filter(day=>!hiddenLineupDays.has(day)));
  if (mobileViewQuery.matches) {
    if (selectedDays.size !== 1) selectedDays = new Set([[...selectedDays][0] || defaultMobileDay()]);
    renderMobileDays();
  }
  const entries = getFilteredLineup();
  if(activeView==='timeline')renderTimeline(entries);
  const available = lineup.filter(entry=>!hiddenLineupDays.has(entry.day));
  const favoriteTotal = available.filter(entry=>favorites.has(entry.id)).length;
  els.resultCount.textContent = entries.length === available.length ? `${available.length} sets` : `${entries.length} of ${available.length} sets`;
  els.favoriteCount.textContent = String(favoriteTotal);
  els.favoritesFilterButton.setAttribute("aria-label", `Show favorites only (${favoriteTotal} saved)`);
  if (mobileViewQuery.matches) renderMobileSchedule(entries);
  else {
    renderDayBoard(entries);
    renderTable(entries);
    if (rallyManagedFavorites) renderHeatMap(entries);
  }
  updateFilterControls();
  updateViewButtons();
  root.querySelectorAll('.timeline-scroll[data-initial-scroll]').forEach(el=>{el.scrollLeft=Number(el.dataset.initialScroll);delete el.dataset.initialScroll;});
  writeStateToUrl();
  updateScheduleProgress();
}

function defaultMobileDay() {
  const now=easternNow();
  const playing=lineup.find(entry=>entry.start<=now&&entry.end>now&&!hiddenLineupDays.has(entry.day));
  if(playing)return playing.day;
  const today = new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  return lineup.find(entry => entry.festivalDate === today && !hiddenLineupDays.has(entry.day))?.day || (visibleLineupDays().includes('Friday') ? 'Friday' : visibleLineupDays()[0]);
}
function renderMobileDays() {
  const days = root.getElementById('mobile-days');
  const focused = days.contains(root.activeElement) ? root.activeElement?.dataset.day : null;
  days.style.setProperty('--day-count', String(visibleLineupDays().length));
  const html = visibleLineupDays().map(day => {
    const date = lineup.find(entry => entry.day === day)?.festivalDate;
    return `<button type="button" data-day="${day}" aria-pressed="${selectedDays.has(day)}"><span>${day.slice(0,3)}</span><strong>${date ? Number(date.slice(-2)) : '—'}</strong></button>`;
  }).join('');
  if (days.innerHTML !== html) { days.innerHTML = html; if(focused) days.querySelector(`[data-day="${focused}"]`)?.focus({preventScroll:true}); }
}
function placeMobileFilters() {
  const dialog = root.getElementById('filters-dialog');
  if (mobileViewQuery.matches) root.getElementById('mobile-filter-slot').append(els.filterFields);
  else {
    if (dialog.open) dialog.close();
    els.filterToggle.after(els.filterFields);
  }
  closeFilterPopovers();
}
function openMobileFilters() {
  placeMobileFilters(); closeFilterPopovers();
  root.getElementById('filters-dialog').showModal();
  els.filterToggle.setAttribute('aria-expanded','true');
}
function mobileSetCard(entry, maximum = 0, rank = 0, heat = false) {
  const people = groupPeople(entry.id), count = people.length;
  const colors = ['#258579','#c56933','#7864b5','#b45376','#467bbc','#7f873b','#995636'];
  const stageColor = colors[stageOrder.indexOf(entry.stage) % colors.length] || colors[0];
  const overnight = entry.start.slice(0,10) > entry.festivalDate ? 'After midnight' : entry.end.slice(0,10) > entry.start.slice(0,10) ? 'Ends next day' : '';
  return `<article data-set-start="${entry.start}" data-set-end="${entry.end}" data-festival-date="${entry.festivalDate}" class="set-card${favorites.has(entry.id) ? ' is-favorite' : ''}${heat ? ' set-card-heat' : ''}" style="--stage-color:${stageColor};--heat-tint:${maximum ? Math.round(count/maximum*28) : 0}%">
    <div class="set-card-main"><div class="set-card-copy">
      <div class="set-meta"><p class="set-time">${rank ? `<span class="set-rank">${rank}</span>` : ''}${escapeHtml(formatClock(entry.start))} <span>–</span> ${escapeHtml(formatClock(entry.end))}</p><span class="set-stage"><i aria-hidden="true"></i>${escapeHtml(entry.stage)}</span></div>
      <h3>${escapeHtml(entry.artist)}</h3>
      ${overnight ? `<small class="set-overnight">${overnight}</small>` : ''}
    </div><button class="favorite-button${favorites.has(entry.id) ? ' is-active' : ''}" type="button" data-favorite-id="${escapeHtml(entry.id)}" aria-pressed="${favorites.has(entry.id)}" aria-label="${favorites.has(entry.id)?'Remove':'Add'} ${escapeHtml(entry.artist)} favorite">★</button></div>
    ${rallyManagedFavorites ? `<div class="set-crew">${count ? `<details><summary><span class="set-avatars" aria-hidden="true">${people.slice(0,3).map(person=>`<i>${escapeHtml(person.initials || person.name.slice(0,1))}</i>`).join('')}</span><span>${count} ${count===1?'person':'people'} interested</span><span class="crew-expand">⌄</span></summary><p>${people.map(person=>escapeHtml(person.name)).join(' · ')}</p></details>` : '<span class="set-no-interest">No crew favorites yet</span>'}${maximum ? `<div class="interest-meter" aria-label="${count} interested; most popular set has ${maximum}"><i style="width:${Math.round(count/maximum*100)}%"></i></div>` : ''}</div>` : ''}
  </article>`;
}
function renderTimeline(entries) {
  const container=root.getElementById('timeline-view');
  const scrolls=new Map([...container.querySelectorAll('.timeline-scroll')].map(el=>[el.dataset.window,el.scrollLeft]));
  const minutes=value=>Date.parse(value+'Z')/60000;
  container.innerHTML=dayOrder.filter(day=>entries.some(entry=>entry.day===day)).map(day=>{
    const sets=entries.filter(entry=>entry.day===day);
    const start=Math.floor(Math.min(...sets.map(e=>minutes(e.start)))/30)*30;
    const end=Math.ceil(Math.max(...sets.map(e=>minutes(e.end)))/30)*30;
    const scale=4,width=(end-start)*scale;
    const ticks=[];for(let t=start;t<=end;t+=30)ticks.push(`<span style="left:${(t-start)*scale}px">${escapeHtml(formatClock(new Date(t*60000).toISOString().slice(0,16)))}</span>`);
return `<section class="timeline-day"><h3>${escapeHtml(day)}</h3><div class="timeline-scroll" tabindex="0" aria-label="${escapeHtml(day)} set times. Scroll horizontally to explore."><div class="timeline-track" style="width:${width+100}px"><div class="timeline-now" data-start="${start}" data-end="${end}" hidden aria-label="Current Eastern time"></div><div class="timeline-ruler">${ticks.join('')}</div>${stageOrder.filter(stage=>sets.some(e=>e.stage===stage)).map(stage=>{
      const laneEnds=[];
      const cards=sets.filter(e=>e.stage===stage).sort((a,b)=>a.start.localeCompare(b.start)).map(e=>{
        const from=minutes(e.start),to=minutes(e.end);let lane=laneEnds.findIndex(end=>end<=from);if(lane<0)lane=laneEnds.length;laneEnds[lane]=to;
        return `<button type="button" class="timeline-set${favorites.has(e.id)?' is-active':''}" data-favorite-id="${escapeHtml(e.id)}" aria-pressed="${favorites.has(e.id)}" aria-label="${escapeHtml(e.artist+' · '+formatClock(e.start)+' to '+formatClock(e.end)+' · Toggle favorite')}" style="left:${(from-start)*scale}px;width:${Math.max(20,(to-from)*scale-4)}px;top:${38+lane*84}px"><strong>${escapeHtml(e.artist)}</strong><span>${escapeHtml(formatClock(e.start))} – ${escapeHtml(formatClock(e.end))}</span><small>${favorites.has(e.id)?'★ Saved':'☆ Favorite'}</small></button>`;
      }).join('');
      return `<div class="timeline-lane" style="height:${42+laneEnds.length*84}px"><h4>${escapeHtml(stage)}</h4>${cards}</div>`;
    }).join('')}</div></div></section>`;
  }).join('')||`<p class="mobile-empty">${dinoEmpty}</p>`;
  container.querySelectorAll('.timeline-scroll').forEach(el=>{
    const marker=el.querySelector('.timeline-now'),start=Number(marker.dataset.start),end=Number(marker.dataset.end);
    const key=`${start}:${end}`;el.dataset.window=key;
    const now=minutes(easternNow());
    const initial=now>=start&&now<=end?Math.max(0,(now-start)*4-60):0;
    el.dataset.initialScroll=String(scrolls.has(key)?scrolls.get(key):initial);
  });
}
function renderMobileSchedule(entries) {
  const container = root.getElementById('mobile-schedule');
  let html = '';
  if (!entries.length) html = `<div class="mobile-empty">${dinoEmpty}</div>`;
  else if (activeView === 'heat') {
    const maximum = Math.max(0,...lineup.filter(entry=>!hiddenLineupDays.has(entry.day)).map(entry=>groupPeople(entry.id).length));
    const closed = new Set([...container.querySelectorAll('details.mobile-stage:not([open])')].map(node=>node.dataset.stage));
    html = !groupStateLoaded ? '<div class="mobile-empty">Loading crew favorites…</div>' : `<p class="mobile-section-note">${escapeHtml([...selectedDays][0])} · ${maximum ? `0–${maximum} interested · deeper green = more interest` : 'No crew favorites yet. Star a set to get started.'}</p>` + stageOrder.filter(stage=>entries.some(entry=>entry.stage===stage)).map(stage=>{
      const sets=entries.filter(entry=>entry.stage===stage).sort(compareSets);
      return `<details class="mobile-stage mobile-stage-heat" data-stage="${escapeHtml(stage)}" ${closed.has(stage)?'':'open'}><summary>${escapeHtml(stage)}<span>${sets.length} sets</span></summary><div>${sets.map(entry=>mobileSetCard(entry,maximum,0,true)).join('')}</div></details>`;
    }).join('');
  } else if (activeView === 'board') {
    const closed = new Set([...container.querySelectorAll('details.mobile-stage:not([open])')].map(node=>node.dataset.stage));
    html = stageOrder.filter(stage=>entries.some(entry=>entry.stage===stage)).map(stage=>{
      const sets = entries.filter(entry=>entry.stage===stage).sort(compareSets);
      return `<details class="mobile-stage" data-stage="${escapeHtml(stage)}" ${closed.has(stage)?'':'open'}><summary>${escapeHtml(stage)}<span>${sets.length} sets</span></summary><div>${sets.map(entry=>mobileSetCard(entry)).join('')}</div></details>`;
    }).join('');
  } else html = entries.map(entry=>mobileSetCard(entry)).join('');
  if (container.renderedHTML !== html) {
    const focused = container.contains(root.activeElement) ? root.activeElement?.dataset.favoriteId : null;
    container.innerHTML = html; container.renderedHTML = html;
    if (focused) [...container.querySelectorAll('[data-favorite-id]')].find(button=>button.dataset.favoriteId===focused)?.focus({preventScroll:true});
  }
  root.getElementById('apply-filters').textContent = `Show ${entries.length} sets`;
}

function saveFavorites() {
  if (rallyManagedFavorites) {
    sendToRally({ type: "rally-lineup-favorites-changed", artistIds: [...favorites] });
    viewingSharedFavorites = false;
    return;
  }
  viewingSharedFavorites = false;
  if (!cloudAccount) return;
  window.clearTimeout(cloudSaveTimer);
  cloudSaveTimer = window.setTimeout(async () => {
    try {
      await convexMutation("lineupFavorites:saveMine", {
        eventId: LINEUP_EVENT_ID,
        artistIds: [...favorites],
      });
      showToast("Favorites synced.");
    } catch (error) {
      showToast(error.message || "Could not sync favorites.");
    }
  }, 250);
}

function setView(view) {
  activeView = view;
  render();
}

function toggleFavoritesOnly() {
  favoritesOnly = !favoritesOnly;
  render();
}

function saveFavoritesAsMine() {
  if (!rallyManagedFavorites && !cloudAccount) {
    openAccountDialog();
    return;
  }
  saveFavorites();
  render();
  showToast(rallyManagedFavorites ? "Saved to your Rally profile." : "Saving to your account…");
}

function showToast(message) {
  const existing = root.querySelector(".toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.className = "toast";
  toast.setAttribute("role", "status");
  toast.textContent = message;
  container.append(toast);
  window.setTimeout(() => toast.remove(), 2200);
}

async function initializeOptionalAccount() {
  if (rallyManagedFavorites) return;
  try {
    if (!window.Clerk) throw new Error("Clerk did not load");
    await window.Clerk.load({ ui: { ClerkUI: window.__internal_ClerkUICtor } });
    window.Clerk.addListener(({ user }) => {
      if (user && !cloudAccount) void loadCloudFavorites();
      if (!user && cloudAccount) {
        cloudAccount = null;
        favorites = new Set();
        render();
      }
    });
    if (window.Clerk.isSignedIn) await loadCloudFavorites();
    else updateViewButtons();
  } catch (error) {
    console.warn("Optional lineup sign-in could not initialize", error);
    els.accountButton.hidden = false;
    els.accountButton.textContent = "Sign in unavailable";
    els.accountButton.disabled = true;
  }
}

async function loadCloudFavorites() {
  try {
    const result = await convexQuery("lineupFavorites:getMine", { eventId: LINEUP_EVENT_ID });
    cloudAccount = { name: result.name || "Account" };
    if (!viewingSharedFavorites) {
      favorites = new Set((result.artistIds || []).flatMap(currentFavoriteIds).filter((id) => validFavoriteIds.has(id)));
    }
    render();
    if (els.accountDialog.open) renderAccountDialog();
  } catch (error) {
    console.warn("Could not load synced lineup favorites", error);
    showToast("Signed in, but favorites could not load.");
  }
}

function openAccountDialog() {
  if (rallyManagedFavorites || els.accountButton.disabled) return;
  els.accountDialog.showModal();
  renderAccountDialog();
}

function renderAccountDialog() {
  try { window.Clerk?.unmountSignIn(els.accountContent); } catch (error) { /* Not mounted yet. */ }
  if (cloudAccount) {
    els.accountDialogTitle.textContent = "Favorites are synced";
    els.accountDialogCopy.textContent = "Your Lost Lands picks follow this account on any device.";
    els.accountContent.innerHTML = `
      <div class="signed-in-card">
        <div><strong>${escapeHtml(cloudAccount.name)}</strong><span>${favorites.size} saved favorite${favorites.size === 1 ? "" : "s"}</span></div>
        <button class="button" id="account-sign-out" type="button">Sign out</button>
      </div>
    `;
    root.getElementById("account-sign-out").addEventListener("click", async () => {
      await window.Clerk.signOut();
      cloudAccount = null;
      favorites = new Set();
      els.accountDialog.close();
      render();
    });
    return;
  }

  els.accountDialogTitle.textContent = "Save your lineup";
  els.accountDialogCopy.textContent = "Create an account or sign in to keep favorites synced across devices.";
  els.accountContent.innerHTML = "";
  window.Clerk.mountSignIn(els.accountContent, {
    routing: "virtual",
    withSignUp: true,
    appearance: {
      variables: {
        colorPrimary: "#37d38b",
        colorBackground: "#fffef9",
        borderRadius: "9px",
        fontFamily: "Inter, ui-sans-serif, system-ui",
      },
    },
  });
}

async function convexQuery(path, args) {
  return convexCall("query", path, args);
}

async function convexMutation(path, args) {
  return convexCall("mutation", path, args);
}

async function convexCall(kind, path, args) {
  const token = await getConvexToken();
  if (!token) throw new Error("Sign in to sync your favorites.");
  const response = await fetch(`${CONVEX_URL}/api/${kind}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ path, args }),
  });
  const result = await response.json();
  if (!response.ok || result.status !== "success") {
    throw new Error(result.errorMessage || `Convex ${kind} failed`);
  }
  return result.value;
}

async function getConvexToken() {
  const session = window.Clerk?.session;
  if (!session) return null;
  const sessionToken = await session.getToken();
  const audience = readJwtPayload(sessionToken)?.aud;
  if (audience === "convex" || (Array.isArray(audience) && audience.includes("convex"))) return sessionToken;
  try { return await session.getToken({ template: "convex" }); } catch (error) { return sessionToken; }
}

function readJwtPayload(token) {
  if (!token) return null;
  try {
    const encoded = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(decodeURIComponent(escape(atob(encoded))));
  } catch (error) {
    return null;
  }
}

async function shareCurrentView() {
  writeStateToUrl();
  const params = getHashParams();
  if (favorites.size) params.set("f", encodeSharedFavorites());
  const url = `${getCanonicalUrl()}${params.toString() ? `#${params}` : ""}`;
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(url);
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = url;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      container.append(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
    showToast("Lineup link copied.");
  } catch (error) {
    showToast("Could not copy the link.");
  }
}

function filterValues(name) {
  if (name === "days") return dayOrder;
  if (name === "stages") return stageOrder;
  return genreOrder;
}

function selectedFilter(name) {
  if (name === "days") return selectedDays;
  if (name === "stages") return selectedStages;
  return selectedGenres;
}

function summarizeFilter(name, selected) {
  const singular = name === "days" ? "day" : name === "stages" ? "stage" : "genre";
  if (!selected.size) return `All ${name}`;
  if (selected.size === 1) return [...selected][0];
  return `${selected.size} ${singular}s`;
}

function formatFilterTime(value) {
  const normalized = value % (24 * 60);
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return formatClock(`2026-01-01T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`);
}

function parseFilterTime(value) {
  const match = String(value || "").trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2] || 0);
  const meridiem = match[3];
  if (minutes > 59 || hours > 23) return null;
  if (meridiem) {
    if (hours < 1 || hours > 12) return null;
    if (meridiem === "pm" && hours !== 12) hours += 12;
    if (meridiem === "am" && hours === 12) hours = 0;
  }
  return (hours < 12 ? hours + 24 : hours) * 60 + minutes;
}

function closeFilterPopovers(except = null) {
  els.filterPopovers.forEach((popover) => {
    if (popover === except) return;
    popover.querySelector(".filter-trigger").setAttribute("aria-expanded", "false");
    popover.querySelector(".filter-panel").hidden = true;
    const search = popover.querySelector('.filter-search');
    if (search?.value) { search.value=''; search.dispatchEvent(new Event('input')); }
  });
}

function updateFilterControls() {
  root.querySelectorAll('[data-options="days"] .filter-option').forEach(option => {
    const value = option.querySelector('input').value;
    const search = option.closest('.filter-popover').querySelector('.filter-search').value;
    option.hidden = hiddenLineupDays.has(value) || !normalizeText(value).includes(normalizeText(search.trim()));
  });
  const activeCount = (mobileViewQuery.matches ? 0 : selectedDays.size) + selectedStages.size + selectedGenres.size + Number(timeMin !== timeBounds.min || timeMax !== timeBounds.max);
  els.filterCount.textContent = String(activeCount);
  els.filterCount.hidden = !activeCount;
  els.clearFiltersButton.hidden = !activeCount && !els.search.value.trim() && !favoritesOnly && !crewLikesOnly;
  els.filterPopovers.forEach((popover) => {
    const name = popover.dataset.filter;
    const label = popover.querySelector(".filter-trigger-label");
    if (name === "times") {
      const fullRange = timeMin === timeBounds.min && timeMax === timeBounds.max;
      label.textContent = fullRange ? (mobileViewQuery.matches ? "Any start time" : "Set start times") : `${formatFilterTime(timeMin)} – ${formatFilterTime(timeMax)}`;
      return;
    }
    const selected = selectedFilter(name);
    label.textContent = summarizeFilter(name, selected);
    popover.querySelectorAll("input[type=checkbox]").forEach((input) => {
      input.checked = selected.has(input.value);
    });
  });

  els.timeMin.value = String(timeMin);
  els.timeMax.value = String(timeMax);
  els.timeMinText.value = formatFilterTime(timeMin);
  els.timeMaxText.value = formatFilterTime(timeMax);
  const span = timeBounds.max - timeBounds.min || 1;
  els.timeRangeFill.style.left = `${((timeMin - timeBounds.min) / span) * 100}%`;
  els.timeRangeFill.style.right = `${100 - ((timeMax - timeBounds.min) / span) * 100}%`;
}

function setTimeRange(nextMin, nextMax) {
  timeMin = Math.max(timeBounds.min, Math.min(nextMin, nextMax, timeBounds.max));
  timeMax = Math.min(timeBounds.max, Math.max(nextMax, timeMin, timeBounds.min));
  render();
}

function applyTypedTime(input, boundary) {
  const parsed = parseFilterTime(input.value);
  if (parsed === null) {
    updateFilterControls();
    return;
  }
  if (boundary === "min") setTimeRange(Math.min(parsed, timeMax), timeMax);
  else setTimeRange(timeMin, Math.max(parsed, timeMin));
}

function clearScheduleFilters() {
  els.search.value = "";
  if (!mobileViewQuery.matches) selectedDays = new Set();
  selectedStages = new Set();
  selectedGenres = new Set();
  timeMin = timeBounds.min;
  timeMax = timeBounds.max;
  favoritesOnly = false;
  crewLikesOnly = false;
  render();
}

function initFilterControls() {
  els.filterPopovers.forEach((popover) => {
    const name = popover.dataset.filter;
    const trigger = popover.querySelector(".filter-trigger");
    const panel = popover.querySelector(".filter-panel");
    const clear = popover.querySelector(".filter-panel-clear");
    const category = {days:'Days',stages:'Stages',genres:'Genres',times:'Start time'}[name];
    trigger.id=`filter-trigger-${name}`;
    panel.id=`filter-panel-${name}`;
    trigger.setAttribute('aria-controls',panel.id);
    panel.setAttribute('role','region');
    panel.setAttribute('aria-labelledby',trigger.id);
    const label=trigger.querySelector('.filter-trigger-label');
    const copy=document.createElement('span');copy.className='filter-trigger-copy';
    const title=document.createElement('strong');title.className='filter-category';title.textContent=category;
    label.before(copy);copy.append(title,label);

    trigger.addEventListener("click", () => {
      const opening = panel.hidden;
      closeFilterPopovers(opening ? popover : null);
      panel.hidden = !opening;
      trigger.setAttribute("aria-expanded", String(opening));
    });

    clear?.addEventListener("click", () => {
      const search = popover.querySelector(".filter-search");
      if (search) {
        search.value = "";
        search.dispatchEvent(new Event("input"));
      }
      if (name === "times") setTimeRange(timeBounds.min, timeBounds.max);
      else {
        selectedFilter(name).clear();
        render();
      }
    });

    if (name === "times") return;
    const options = popover.querySelector(".filter-options");
    options.innerHTML = filterValues(name).map((value) => `
      <label class="filter-option"><input type="checkbox" value="${escapeHtml(value)}"><span>${escapeHtml(value)}</span></label>
    `).join("");
    const search = popover.querySelector(".filter-search");
    const empty = document.createElement("div");
    empty.className = "filter-empty";
    empty.textContent = "No matches";
    empty.hidden = true;
    options.after(empty);
    search.addEventListener("input", () => {
      const query = normalizeText(search.value.trim());
      let visible = 0;
      options.querySelectorAll(".filter-option").forEach((option) => {
        option.hidden = (name === 'days' && hiddenLineupDays.has(option.querySelector('input').value)) || (Boolean(query) && !normalizeText(option.textContent).includes(query));
        if (!option.hidden) visible += 1;
      });
      empty.hidden = visible > 0;
    });
    options.addEventListener("change", (event) => {
      const input = event.target.closest("input[type=checkbox]");
      if (!input) return;
      const selected = selectedFilter(name);
      if (input.checked) selected.add(input.value);
      else selected.delete(input.value);
      render();
    });
  });

  [els.timeMin, els.timeMax].forEach((input) => {
    input.min = String(timeBounds.min);
    input.max = String(timeBounds.max);
    input.step = "5";
  });
  els.timeMin.addEventListener("input", () => setTimeRange(Math.min(Number(els.timeMin.value), timeMax), timeMax));
  els.timeMax.addEventListener("input", () => setTimeRange(timeMin, Math.max(Number(els.timeMax.value), timeMin)));
  [[els.timeMinText, "min"], [els.timeMaxText, "max"]].forEach(([input, boundary]) => {
    input.addEventListener("blur", () => applyTypedTime(input, boundary));
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        applyTypedTime(input, boundary);
        input.blur();
      }
    });
  });
}

function bindEvents() {
  els.search.addEventListener("input", render);
  els.filterToggle.addEventListener("click", () => {
    if (mobileViewQuery.matches) { openMobileFilters(); return; }
    const expanded = els.filterToggle.getAttribute("aria-expanded") !== "true";
    els.filterToggle.setAttribute("aria-expanded", String(expanded));
    els.filterFields.classList.toggle("is-open", expanded);
    if (!expanded) closeFilterPopovers();
  });

  els.posterViewButton.addEventListener("click", () => setView("board"));
  els.tableViewButton.addEventListener("click", () => setView("table"));
  els.heatViewButton.addEventListener("click", () => setView("heat"));
  const timelineButton=document.createElement('button');timelineButton.id='timeline-view-button';timelineButton.type='button';timelineButton.textContent='Timeline';els.heatViewButton.after(timelineButton);timelineButton.onclick=()=>setView('timeline');
  const timeline=document.createElement('section');timeline.id='timeline-view';timeline.hidden=true;timeline.setAttribute('aria-label','Set time timeline');els.tableView.after(timeline);
  els.popularitySort.addEventListener("click", () => {
    const dialog = document.createElement('dialog');
    dialog.className = 'sort-dialog';
    dialog.setAttribute('aria-label', 'Sort sets');
    const options = [['time','Set time','Earliest sets first'],['popular','Most liked','Your crew’s favorites first'],['artist','Artist A–Z','Alphabetical by artist']].filter(([id])=>id!=='popular'||rallyManagedFavorites);
    dialog.innerHTML = `<header><h2>Sort sets</h2><button type="button" aria-label="Close sort">×</button></header>${options.map(([id,label,description])=>`<button type="button" data-sort="${id}" aria-pressed="${sortMode===id}"><span><strong>${label}</strong><small>${description}</small></span><b>${sortMode===id?'✓':''}</b></button>`).join('')}`;
    container.append(dialog);
    dialog.querySelector('header button').onclick=()=>dialog.close();
    dialog.addEventListener('click', event=>{if(event.target===dialog)dialog.close();});
    dialog.querySelectorAll('[data-sort]').forEach(button=>button.onclick=()=>{sortMode=button.dataset.sort;mostLiked=sortMode==='popular';render();dialog.close();});
    dialog.addEventListener('close',()=>{dialog.remove();els.popularitySort.focus({preventScroll:true});});
    dialog.showModal();
  });
  els.clearFiltersButton.addEventListener("click", clearScheduleFilters);
  els.favoritesFilterButton.addEventListener("click", toggleFavoritesOnly);
  els.favoritesFilterButton.hidden=true;
  const likes=document.createElement('div');likes.className='likes-filter segmented';likes.setAttribute('role','group');likes.setAttribute('aria-label','Filter by likes');
  likes.innerHTML=[['all','All sets'],['mine','My likes'],...(rallyManagedFavorites?[['crew','Crew likes']]:[])].map(([value,label])=>`<button type="button" data-likes-filter="${value}" aria-pressed="false">${label}</button>`).join('');
  els.favoritesFilterButton.after(likes);
  likes.querySelectorAll('button').forEach(button=>button.onclick=()=>{favoritesOnly=button.dataset.likesFilter==='mine';crewLikesOnly=button.dataset.likesFilter==='crew';render();});
  els.saveFavoritesButton.addEventListener("click", saveFavoritesAsMine);
  els.shareButton.addEventListener("click", shareCurrentView);
  els.accountButton.addEventListener("click", openAccountDialog);
  els.accountDialogClose.addEventListener("click", () => els.accountDialog.close());
  els.accountDialog.addEventListener("click", (event) => {
    if (event.target === els.accountDialog) els.accountDialog.close();
  });
  root.addEventListener("pointerdown", (event) => {
    if(mobileViewQuery.matches && event.target.closest('#filters-dialog'))return;
    if (!event.target.closest(".filter-popover")) closeFilterPopovers();
  }, true);
  root.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeFilterPopovers();
  });

  const handleFavoriteClick = (event) => {
    const button = event.target.closest("[data-favorite-id]");
    if (!button) return;

    const id = button.dataset.favoriteId;
    const wasViewingSharedFavorites = viewingSharedFavorites;
    if (favorites.has(id)) {
      favorites.delete(id);
    } else {
      favorites.add(id);
    }

    updateCurrentMemberInterest(id);
    saveFavorites();
    render();
    if (!rallyManagedFavorites && !cloudAccount && !anonymousHintShown) {
      anonymousHintShown = true;
      showToast("Sign in to keep favorites across devices.");
    }
    if (wasViewingSharedFavorites) showToast("Edited list saved as yours.");
  };
  els.tableBody.addEventListener("click", handleFavoriteClick);
  els.posterContent.addEventListener("click", handleFavoriteClick);
  els.heatContent.addEventListener("click", handleFavoriteClick);
  root.getElementById('mobile-schedule').addEventListener('click', handleFavoriteClick);
  timeline.addEventListener('click',handleFavoriteClick);
  root.getElementById('mobile-days').addEventListener('click', event => {
    const button = event.target.closest('[data-day]');
    if (!button) return;
    selectedDays = new Set([button.dataset.day]); render();
  });
  const filtersDialog = root.getElementById('filters-dialog');
  root.getElementById('close-filters').onclick = () => filtersDialog.close();
  root.getElementById('apply-filters').onclick = () => filtersDialog.close();
  filtersDialog.addEventListener('click', event => { if(event.target === filtersDialog) filtersDialog.close(); });
  filtersDialog.addEventListener('close', () => { els.filterToggle.setAttribute('aria-expanded','false'); closeFilterPopovers(); els.filterToggle.focus({preventScroll:true}); });

  if (!integration) window.addEventListener("popstate", () => {
    readStateFromUrl();
    render();
  }, {signal:lifetime.signal});

  if (rallyManagedFavorites) {
    root.getElementById('manage-days').onclick = () => sendToRally({type:'rally-lineup-manage-days'});
    const reportOverlay = () => sendToRally({type:'rally-lineup-overlay',open:Boolean(root.querySelector('dialog[open]'))||Boolean(root.activeElement?.matches('input:not([type=checkbox]):not([type=range]),textarea,[contenteditable=true]'))});
    overlayObserver = new MutationObserver(reportOverlay);
    overlayObserver.observe(container,{subtree:true,attributes:true,attributeFilter:['open']});
    root.addEventListener('focusin',reportOverlay);
    root.addEventListener('focusout',()=>setTimeout(reportOverlay,0));
    receive = (event) => {
      if ((!integration && (event.origin !== window.location.origin || event.source !== window.parent)) || !event.data || typeof event.data !== "object") return;
      if(event.data.type==='rally-lineup-layout'&&Number.isFinite(event.data.bottomInset))surface.style.setProperty('--rally-bottom-clearance',`${Math.max(0,Math.min(240,event.data.bottomInset))}px`);
      if (event.data.type === "rally-lineup-state" && Array.isArray(event.data.artistIds)) {
        hiddenLineupDays = new Set((Array.isArray(event.data.hiddenDays) ? event.data.hiddenDays : []).filter(day=>dayOrder.includes(day)));
        root.getElementById('manage-days').hidden = event.data.canManageDays !== true;
        groupStateLoaded = true;
        favorites = new Set(event.data.artistIds.flatMap(currentFavoriteIds).filter((id) => validFavoriteIds.has(id)));
        lineupInterests = {};
        if (event.data.interests && typeof event.data.interests === "object") {
          Object.entries(event.data.interests).forEach(([artistId, people]) => {
            if (!Array.isArray(people)) return;
            currentFavoriteIds(artistId).forEach((currentId) => {
              if (!validFavoriteIds.has(currentId)) return;
              const existingPeople = lineupInterests[currentId] || [];
              lineupInterests[currentId] = [...existingPeople, ...people].filter((person, index, all) =>
                person?.id && all.findIndex((candidate) => candidate?.id === person.id) === index
              );
            });
          });
        }
        currentRallyMember = event.data.currentMember && typeof event.data.currentMember === "object" ? event.data.currentMember : null;
        viewingSharedFavorites = false;
        render();
      }
      if (event.data.type === "rally-lineup-favorites-saved") showToast(event.data.offline ? "Saved on this device. Will sync when connected." : "Saved to your Rally profile.");
    };
    if (!integration) window.addEventListener("message", receive, {signal:lifetime.signal});
  }

  mobileViewQuery.addEventListener("change", () => { placeMobileFilters(); if(!integration || integration.isActive()) render(); }, {signal:lifetime.signal});
}

initFilterControls();
setCanonicalUrl();
readStateFromUrl();
bindEvents();
placeMobileFilters();
render();
const progressTimer=window.setInterval(()=>{if(!integration||integration.isActive())updateScheduleProgress();},60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&(!integration||integration.isActive()))updateScheduleProgress();},{signal:lifetime.signal});
if (rallyManagedFavorites) sendToRally({ type: "rally-lineup-ready" });
else window.addEventListener("load", initializeOptionalAccount, { once: true });
return {
  receive: message => receive({data:message}),
  route(params) { integration.params=params; readStateFromUrl(); render(); },
  suspend() { root.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close()); root.activeElement?.blur(); closeFilterPopovers(); },
  destroy() { lifetime.abort(); overlayObserver?.disconnect(); window.clearTimeout(cloudSaveTimer); window.clearInterval(progressTimer); }
};
};
