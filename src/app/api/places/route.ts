import { NextRequest, NextResponse } from "next/server";
import { placesSearchText, preferencesFromSearchParams } from "@/lib/preferences";

type GooglePlace = {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  rating?: number;
  userRatingCount?: number;
  location?: { latitude: number; longitude: number };
  photos?: { name: string }[];
  googleMapsUri?: string;
  editorialSummary?: { text: string };
};

export type Place = {
  id: string;
  name: string;
  address: string;
  rating: number | null;
  reviews: number;
  lat: number | null;
  lng: number | null;
  photo: string | null;
  mapsUrl: string | null;
  summary: string | null;
};

const FIELDS = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.rating",
  "places.userRatingCount",
  "places.location",
  "places.photos",
  "places.googleMapsUri",
  "places.editorialSummary",
].join(",");

async function searchPlaces(query: string, apiKey: string): Promise<Place[]> {
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": FIELDS,
    },
    body: JSON.stringify({ textQuery: query, pageSize: 20 }),
  });
  if (!res.ok) {
    throw new Error(`Google Places error ${res.status}: ${await res.text()}`);
  }
  const data: { places?: GooglePlace[] } = await res.json();
  return (data.places ?? []).map((p) => ({
    id: p.id,
    name: p.displayName?.text ?? "Unknown",
    address: p.formattedAddress ?? "",
    rating: p.rating ?? null,
    reviews: p.userRatingCount ?? 0,
    lat: p.location?.latitude ?? null,
    lng: p.location?.longitude ?? null,
    photo: p.photos?.[0]?.name
      ? `/api/photo?name=${encodeURIComponent(p.photos[0].name)}`
      : null,
    mapsUrl: p.googleMapsUri ?? null,
    summary: p.editorialSummary?.text ?? null,
  }));
}

const WIKI_HEADERS = { "User-Agent": "travel-finder/0.1 (hobby project)" };

type WikiPage = { title: string; thumbnail?: { source: string } };

// Google doesn't return photos for every project, so fall back to Wikipedia.
// One batched request looks up every place name as an article title at once,
// which keeps us well under Wikipedia's rate limits.
async function wikipediaPhotosByTitle(names: string[]): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  if (!names.length) return found;
  const params = new URLSearchParams({
    action: "query",
    titles: names.slice(0, 50).join("|"),
    redirects: "1",
    prop: "pageimages",
    piprop: "thumbnail",
    pithumbsize: "600",
    format: "json",
  });
  try {
    const res = await fetch(`https://en.wikipedia.org/w/api.php?${params}`, { headers: WIKI_HEADERS });
    if (!res.ok) return found;
    const data = await res.json();
    // Map each original name to its final article title (after normalizing and redirects).
    const toFinal = new Map<string, string>();
    for (const n of names) toFinal.set(n, n);
    for (const step of [...(data?.query?.normalized ?? []), ...(data?.query?.redirects ?? [])] as {
      from: string;
      to: string;
    }[]) {
      for (const [orig, cur] of toFinal) if (cur === step.from) toFinal.set(orig, step.to);
    }
    const thumbs = new Map<string, string>();
    for (const page of Object.values(data?.query?.pages ?? {}) as WikiPage[]) {
      if (page.thumbnail) thumbs.set(page.title, page.thumbnail.source);
    }
    for (const [orig, title] of toFinal) {
      const src = thumbs.get(title);
      if (src) found.set(orig, src);
    }
  } catch {
    // No photos is fine; the cards show a placeholder.
  }
  return found;
}

// For sights, the nearest Wikipedia article within 150 m is usually the place itself.
async function nearbyWikipediaPhoto(lat: number, lng: number): Promise<string | null> {
  const params = new URLSearchParams({
    action: "query",
    generator: "geosearch",
    ggscoord: `${lat}|${lng}`,
    ggsradius: "150",
    ggslimit: "1",
    prop: "pageimages",
    piprop: "thumbnail",
    pithumbsize: "600",
    format: "json",
  });
  try {
    const res = await fetch(`https://en.wikipedia.org/w/api.php?${params}`, { headers: WIKI_HEADERS });
    if (!res.ok) return null;
    const data = await res.json();
    const page = Object.values(data?.query?.pages ?? {})[0] as WikiPage | undefined;
    return page?.thumbnail?.source ?? null;
  } catch {
    return null;
  }
}

async function addMissingPhotos(places: Place[], useNearby = false): Promise<Place[]> {
  const missing = places.filter((p) => !p.photo).map((p) => p.name);
  const byTitle = await wikipediaPhotosByTitle(missing);
  const out: Place[] = [];
  // Look up nearby articles one at a time (a few at most) to stay polite.
  let nearbyLookups = 0;
  for (const p of places) {
    let photo = p.photo ?? byTitle.get(p.name) ?? null;
    if (!photo && useNearby && nearbyLookups < 10 && p.lat != null && p.lng != null) {
      nearbyLookups++;
      photo = await nearbyWikipediaPhoto(p.lat, p.lng);
    }
    out.push({ ...p, photo });
  }
  return out;
}
// GET /api/places?city=Tokyo
// Optional diet and interest params narrow the text search. With neither set,
// the queries stay "top things to do" and "best local restaurants".
export async function GET(request: NextRequest) {
  const city = request.nextUrl.searchParams.get("city")?.trim();
  if (!city) {
    return NextResponse.json({ error: "Please provide a city." }, { status: 400 });
  }
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "GOOGLE_PLACES_API_KEY is not set." }, { status: 500 });
  }
  const queries = placesSearchText(city, preferencesFromSearchParams(request.nextUrl.searchParams));
  try {
    const [thingsToDo, food] = await Promise.all([
      searchPlaces(queries.thingsToDo, apiKey),
      searchPlaces(queries.food, apiKey),
    ]);
    const [doWithPhotos, foodWithPhotos] = await Promise.all([
      addMissingPhotos(thingsToDo, true),
      addMissingPhotos(food),
    ]);
    return NextResponse.json({ city, thingsToDo: doWithPhotos, food: foodWithPhotos });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Could not load places right now." }, { status: 502 });
  }
}
