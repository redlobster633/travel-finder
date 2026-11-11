import { NextRequest, NextResponse } from "next/server";
import { preferencesFromSearchParams } from "@/lib/preferences";
import {
  pickYouTubeVideos,
  queriesForCity,
  redactSecret,
  type YouTubeVideo,
} from "@/lib/youtube";

// GET /api/youtube?city=Tokyo
// Optional diet changes the food search. Optional interest changes things to do,
// and food-related interests such as cafe hopping change the food search too.
// The full URL is the 3-day cache key.
// One search for food and one for things to do. Each search costs 100 units
// of YouTube's free daily quota, so a full response is cached for 3 days
// (same as /api/videos). Thumbnails are public i.ytimg.com links, built later
// from the video id, so this response never includes a picture URL.

export type { YouTubeVideo };

const CACHE = "public, s-maxage=259200, stale-while-revalidate=86400";
const MAX_RESULTS = 4;

function empty(city: string) {
  return NextResponse.json(
    { city, food: [], places: [] },
    { headers: { "Cache-Control": "no-store" } }
  );
}

async function searchYouTube(apiKey: string, query: string): Promise<YouTubeVideo[]> {
  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("type", "video");
  url.searchParams.set("q", query);
  url.searchParams.set("maxResults", String(MAX_RESULTS));
  url.searchParams.set("videoEmbeddable", "true");
  url.searchParams.set("safeSearch", "moderate");
  url.searchParams.set("key", apiKey);

  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`YouTube request failed: ${redactSecret(message, apiKey)}`);
  }

  if (!res.ok) {
    const detail = redactSecret((await res.text()).slice(0, 300), apiKey);
    throw new Error(`YouTube ${res.status}: ${detail}`);
  }

  try {
    return pickYouTubeVideos(await res.json(), MAX_RESULTS);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`YouTube response: ${redactSecret(message, apiKey)}`);
  }
}

export async function GET(request: NextRequest) {
  const city = request.nextUrl.searchParams.get("city")?.trim();
  if (!city) return NextResponse.json({ error: "Add ?city=..." }, { status: 400 });

  const apiKey = process.env.YOUTUBE_API_KEY?.trim() ?? "";
  // The key is optional. Hide YouTube and leave the rest of the page alone.
  if (!apiKey) return empty(city);

  const queries = queriesForCity(city, preferencesFromSearchParams(request.nextUrl.searchParams));
  const [foodResult, placesResult] = await Promise.allSettled([
    searchYouTube(apiKey, queries.food),
    searchYouTube(apiKey, queries.places),
  ]);

  for (const result of [foodResult, placesResult]) {
    if (result.status === "rejected") {
      const message = result.reason instanceof Error ? result.reason.message : String(result.reason);
      console.error(redactSecret(message, apiKey));
    }
  }

  const food = foodResult.status === "fulfilled" ? foodResult.value : [];
  const places = placesResult.status === "fulfilled" ? placesResult.value : [];
  // Only remember a complete answer. A failed search stays uncached so the next visit can retry.
  const cacheable = foodResult.status === "fulfilled" && placesResult.status === "fulfilled";
  return NextResponse.json(
    { city, food, places },
    { headers: { "Cache-Control": cacheable ? CACHE : "no-store" } }
  );
}
