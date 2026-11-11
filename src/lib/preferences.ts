// Optional diet and activity choices. With nothing selected, every query
// below matches the original city-only search, so cached responses stay valid.

export type Preferences = {
  diets: string[];
  interests: string[];
};

export type PreferenceKind = "diet" | "interest";

export const DIET_PRESETS = [
  { id: "vegetarian", label: "Vegetarian" },
  { id: "vegan", label: "Vegan" },
  { id: "halal", label: "Halal" },
  { id: "kosher", label: "Kosher" },
  { id: "gluten-free", label: "Gluten-free" },
  { id: "dairy-free", label: "Dairy-free" },
  { id: "nut-free", label: "Nut-free" },
] as const;

export const INTEREST_PRESETS = [
  { id: "sports", label: "Sports" },
  { id: "cafe-hopping", label: "Cafe hopping" },
  { id: "museums", label: "Museums" },
  { id: "outdoors", label: "Outdoors" },
  { id: "nightlife", label: "Nightlife" },
  { id: "shopping", label: "Shopping" },
] as const;

export const EMPTY_PREFERENCES: Preferences = { diets: [], interests: [] };

export const PREFERENCE_STORAGE_KEY = "travel-finder-preferences";

const MAX_PREFERENCES = 8;
const MAX_TOKEN_LENGTH = 40;

export type GuideBrief = {
  id: string;
  name: string;
  rating: number | null;
  reviews: number;
  summary: string | null;
};

export type ApiName = "guide" | "places" | "videos" | "youtube";

const PRESETS: Record<PreferenceKind, readonly { id: string; label: string }[]> = {
  diet: DIET_PRESETS,
  interest: INTEREST_PRESETS,
};

// "gluten free" and "cafe hopping" select the same chip as the preset.
const ALIASES: Record<PreferenceKind, Map<string, string>> = {
  diet: aliasMap(DIET_PRESETS),
  interest: aliasMap(INTEREST_PRESETS),
};

function aliasMap(presets: readonly { id: string; label: string }[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const preset of presets) {
    map.set(preset.id, preset.id);
    map.set(preset.label.toLowerCase(), preset.id);
    map.set(preset.id.replace(/-/g, " "), preset.id);
    map.set(preset.label.toLowerCase().replace(/-/g, " "), preset.id);
  }
  return map;
}

export function preferenceLabel(kind: PreferenceKind, id: string): string {
  const preset = PRESETS[kind].find((item) => item.id === id);
  if (preset) return preset.label;
  return id.replace(/\b[\p{L}\p{N}]/gu, (char) => char.toUpperCase());
}

function phrase(kind: PreferenceKind, id: string): string {
  return preferenceLabel(kind, id).toLowerCase();
}

export function canonicalPreference(value: string, kind: PreferenceKind): string | null {
  if (/[\u0000-\u001f\u007f]/.test(value)) return null;
  const cleaned = value.trim().replace(/\s+/g, " ");
  if (!cleaned || cleaned.length > MAX_TOKEN_LENGTH) return null;
  // Short phrases only, so a custom note can't rewrite the guide prompt.
  if (!/^[\p{L}\p{N}][\p{L}\p{N} '&./+-]*$/u.test(cleaned)) return null;
  const key = cleaned.toLowerCase();
  return ALIASES[kind].get(key) ?? ALIASES[kind].get(key.replace(/-/g, " ")) ?? key;
}

export function normalizePreferences(input: {
  diets?: readonly string[];
  interests?: readonly string[];
}): Preferences {
  return {
    diets: normalizeList(input.diets ?? [], "diet"),
    interests: normalizeList(input.interests ?? [], "interest"),
  };
}

function normalizeList(values: readonly string[], kind: PreferenceKind): string[] {
  const seen = new Set<string>();
  for (const value of values) {
    const id = canonicalPreference(value, kind);
    if (id) seen.add(id);
  }
  return [...seen].sort((a, b) => a.localeCompare(b)).slice(0, MAX_PREFERENCES);
}

export function hasPreferences(prefs: Preferences): boolean {
  return prefs.diets.length > 0 || prefs.interests.length > 0;
}

export function togglePreference(prefs: Preferences, kind: PreferenceKind, id: string): Preferences {
  const key = kind === "diet" ? "diets" : "interests";
  const next = prefs[key].includes(id)
    ? prefs[key].filter((item) => item !== id)
    : [...prefs[key], id];
  return normalizePreferences({ ...prefs, [key]: next });
}

export function addPreference(
  prefs: Preferences,
  kind: PreferenceKind,
  raw: string
): { ok: true; preferences: Preferences } | { ok: false; reason: "invalid" | "full" } {
  const id = canonicalPreference(raw, kind);
  if (!id) return { ok: false, reason: "invalid" };
  const key = kind === "diet" ? "diets" : "interests";
  if (prefs[key].includes(id)) return { ok: true, preferences: prefs };
  if (prefs[key].length >= MAX_PREFERENCES) return { ok: false, reason: "full" };
  return { ok: true, preferences: normalizePreferences({ ...prefs, [key]: [...prefs[key], id] }) };
}

const FOOD_INTEREST =
  /\b(cafes?|coffee|tea|food|eats?|eating|restaurants?|dining|markets?|bars?|wine|beer|baker(?:y|ies)|desserts?|sweets|pastry|pastries|brunch|noodles?|ramen|sushi|pizza|steak|seafood|bbq|barbecue|curry|tacos?|burgers?|izakaya|pubs?|cocktails?|brewer(?:y|ies)|foodie)\b/i;

export function isCafeInterest(id: string): boolean {
  if (id === "cafe-hopping") return true;
  return /\b(cafes?|coffee)\b/i.test(id.replace(/-/g, " "));
}

// Sports changes things-to-do videos. Cafe hopping also changes food videos.
export function isFoodInterest(id: string): boolean {
  if (id === "cafe-hopping") return true;
  return FOOD_INTEREST.test(id.replace(/-/g, " "));
}

export function humanList(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

export function preferenceSummary(prefs: Preferences): string {
  const normalized = normalizePreferences(prefs);
  const diets = normalized.diets.map((id) => preferenceLabel("diet", id));
  const interests = normalized.interests.map((id) => preferenceLabel("interest", id));
  if (diets.length && interests.length) return `${humanList(diets)} · ${humanList(interests)}`;
  return humanList(diets.length ? diets : interests);
}

export function preferencesFromSearchParams(params: URLSearchParams): Preferences {
  return normalizePreferences({
    diets: splitParam(params, "diet"),
    interests: splitParam(params, "interest"),
  });
}

function splitParam(params: URLSearchParams, key: string): string[] {
  const pieces: string[] = [];
  for (const value of params.getAll(key)) {
    for (const part of value.split(",")) pieces.push(part);
  }
  return pieces;
}

function appendPreferences(params: URLSearchParams, prefs: Preferences) {
  for (const diet of prefs.diets) params.append("diet", diet);
  for (const interest of prefs.interests) params.append("interest", interest);
}

function encodeQuery(params: URLSearchParams): string {
  return params.toString().replace(/\+/g, "%20");
}

// Videos only search food, so a sports-only visit can reuse the generic cache.
function scopedPreferences(api: ApiName, prefs: Preferences): Preferences {
  if (api === "videos") {
    return { diets: prefs.diets, interests: prefs.interests.filter(isFoodInterest) };
  }
  return prefs;
}

export function apiPath(api: ApiName, city: string, prefs: Preferences): string {
  const params = new URLSearchParams();
  params.set("city", city);
  appendPreferences(params, scopedPreferences(api, normalizePreferences(prefs)));
  return `/api/${api}?${encodeQuery(params)}`;
}

export function pageSearch(city: string, prefs: Preferences): string {
  const params = new URLSearchParams();
  params.set("q", city);
  appendPreferences(params, normalizePreferences(prefs));
  return `?${encodeQuery(params)}`;
}

export function placesSearchText(city: string, prefs: Preferences): { thingsToDo: string; food: string } {
  const normalized = normalizePreferences(prefs);
  const interests = normalized.interests.map((id) => phrase("interest", id));
  const thingsToDo = interests.length
    ? `top things to do in ${city} for ${humanList(interests)}`
    : `top things to do in ${city}`;
  return { thingsToDo, food: foodSearchText(city, normalized) };
}

function foodSearchText(city: string, prefs: Preferences): string {
  const diets = prefs.diets.map((id) => phrase("diet", id));
  const foodInterests = prefs.interests.filter(isFoodInterest);
  if (!diets.length && !foodInterests.length) return `best local restaurants in ${city}`;

  const cafe = foodInterests.some(isCafeInterest);
  const other = foodInterests.filter((id) => !isCafeInterest(id)).map((id) => phrase("interest", id));

  if (cafe && !other.length) {
    const diet = diets.length ? `${humanList(diets)} ` : "";
    return `best ${diet}cafes in ${city}`;
  }
  if (!diets.length && !cafe) return `best ${humanList(other)} in ${city}`;

  const venue = cafe ? "cafes and restaurants" : "restaurants";
  const diet = diets.length ? `${humanList(diets)} ` : "";
  const extra = other.length ? ` for ${humanList(other)}` : "";
  return `best ${diet}${venue} in ${city}${extra}`;
}

export function foodVideoQuery(city: string, prefs: Preferences): string {
  const normalized = normalizePreferences(prefs);
  const words = [
    ...normalized.diets.map((id) => phrase("diet", id)),
    ...normalized.interests.filter(isFoodInterest).map((id) => phrase("interest", id)),
  ];
  if (!words.length) return `${city} food recommendations`;
  return `${city} ${words.join(" ")} food recommendations`;
}

export function placesVideoQuery(city: string, prefs: Preferences): string {
  const normalized = normalizePreferences(prefs);
  if (!normalized.interests.length) return `${city} things to do`;
  return `${city} ${normalized.interests.map((id) => phrase("interest", id)).join(" ")} things to do`;
}

export function foodVideoHeading(source: "TikTok" | "YouTube", prefs: Preferences): string {
  const normalized = normalizePreferences(prefs);
  const bits = [
    ...normalized.diets.map((id) => preferenceLabel("diet", id)),
    ...normalized.interests.filter(isFoodInterest).map((id) => preferenceLabel("interest", id)),
  ];
  if (!bits.length) {
    return source === "TikTok" ? "Food videos from TikTok" : "Food videos from YouTube";
  }
  return `${humanList(bits)} food videos from ${source}`;
}

export function placesVideoHeading(prefs: Preferences): string {
  const normalized = normalizePreferences(prefs);
  if (!normalized.interests.length) return "Things to do on YouTube";
  return `${humanList(normalized.interests.map((id) => preferenceLabel("interest", id)))} on YouTube`;
}

function baseGuideRules(city: string): string {
  return `You are a friendly local travel expert writing a short guide to ${city}.
Below are popular attractions and restaurants from Google, with ratings and review counts.

1. intro: one or two warm sentences on what makes ${city} special for a visitor.
2. dishes: 6 local dishes or drinks a visitor must try in ${city}, each with one short line on why.
3. topThingsToDo: pick the 8 best attractions from the list (balance famous sights with variety), each with one short, specific line on why it's worth it.
4. topFood: pick the 8 best food spots from the list, each with one short line on what to order or why to go.
Only use ids from the lists. Keep every "why" under 20 words.`;
}

function guideRules(city: string, prefs: Preferences): string {
  if (!hasPreferences(prefs)) return baseGuideRules(city);

  const diets = prefs.diets.map((id) => preferenceLabel("diet", id));
  const interests = prefs.interests.map((id) => preferenceLabel("interest", id));
  const foodInterests = prefs.interests.filter(isFoodInterest);
  const dishLine = diets.length
    ? `2. dishes: 6 local dishes or drinks in ${city} that fit every dietary restriction below, each with one short line on why.`
    : `2. dishes: 6 local dishes or drinks a visitor must try in ${city}, each with one short line on why.`;
  const sightsLine = interests.length
    ? `3. topThingsToDo: pick the 8 attractions from the list that best match the interests below, each with one short, specific line on why it fits.`
    : `3. topThingsToDo: pick the 8 best attractions from the list (balance famous sights with variety), each with one short, specific line on why it's worth it.`;
  const foodLine =
    diets.length || foodInterests.length
      ? `4. topFood: pick the 8 food spots from the list that best fit the preferences below, each with one short line on what to order or why to go.`
      : `4. topFood: pick the 8 best food spots from the list, each with one short line on what to order or why to go.`;

  const notes: string[] = [];
  if (diets.length) {
    notes.push(
      `Dietary restrictions (every dish and every food spot must fit all of them): ${humanList(diets)}. Skip anything that conflicts, even if it is famous, and say how the pick fits.`
    );
  }
  if (interests.length) {
    notes.push(
      `Interests to lean toward: ${humanList(interests)}. Prefer matching sights. Prefer matching food spots when an interest is about food or cafes, such as cafe hopping.`
    );
  }

  return `You are a friendly local travel expert writing a short guide to ${city} for one visitor.
Below are popular attractions and restaurants from Google, with ratings and review counts.

1. intro: one or two warm sentences on what makes ${city} special for this visitor. Mention their preferences.
${dishLine}
${sightsLine}
${foodLine}
Only use ids from the lists. Keep every "why" under 20 words.

${notes.join("\n")}`;
}

export function buildGuidePrompt(
  city: string,
  attractions: GuideBrief[],
  restaurants: GuideBrief[],
  prefs: Preferences
): string {
  return `${guideRules(city, normalizePreferences(prefs))}

Attractions: ${JSON.stringify(attractions)}
Restaurants: ${JSON.stringify(restaurants)}`;
}

export function serializePreferences(prefs: Preferences): string {
  const normalized = normalizePreferences(prefs);
  return JSON.stringify({ diets: normalized.diets, interests: normalized.interests });
}

export function parseStoredPreferences(raw: string | null): Preferences {
  if (!raw) return EMPTY_PREFERENCES;
  try {
    const data = JSON.parse(raw) as { diets?: unknown; interests?: unknown };
    return normalizePreferences({
      diets: stringList(data.diets),
      interests: stringList(data.interests),
    });
  } catch {
    return EMPTY_PREFERENCES;
  }
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

export function readStoredPreferences(): Preferences {
  try {
    return parseStoredPreferences(localStorage.getItem(PREFERENCE_STORAGE_KEY));
  } catch {
    return EMPTY_PREFERENCES;
  }
}

export function writeStoredPreferences(prefs: Preferences) {
  try {
    localStorage.setItem(PREFERENCE_STORAGE_KEY, serializePreferences(prefs));
  } catch {
    // Private mode can block storage. The page link still keeps this search.
  }
}
