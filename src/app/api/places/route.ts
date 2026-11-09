import { NextRequest, NextResponse } from "next/server";

type GooglePlace = {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  rating?: number;
  userRatingCount?: number;
  location?: { latitude: number; longitude: number };
  photos?: { name: string }[];
  googleMapsUri?: string;
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
  }));
}

// GET /api/places?city=Tokyo
export async function GET(request: NextRequest) {
  const city = request.nextUrl.searchParams.get("city")?.trim();
  if (!city) {
    return NextResponse.json({ error: "Please provide a city." }, { status: 400 });
  }
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "GOOGLE_PLACES_API_KEY is not set." }, { status: 500 });
  }
  try {
    const [thingsToDo, food] = await Promise.all([
      searchPlaces(`top things to do in ${city}`, apiKey),
      searchPlaces(`best local restaurants in ${city}`, apiKey),
    ]);
    return NextResponse.json({ city, thingsToDo, food });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Could not load places right now." }, { status: 502 });
  }
}
