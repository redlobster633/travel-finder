import { NextRequest, NextResponse } from "next/server";
import { pickTikTokVideos, type FoodVideo, type VideoSearchHit } from "@/lib/food-videos";

// GET /api/videos?city=Tokyo
// Food videos from TikTok via Google Agent Search (Discovery Engine searchLite).

export type { FoodVideo };

const DEFAULT_PROJECT_ID = "travel-finder-514211";
const DEFAULT_ENGINE_ID = "travel-finder-tiktok_1794272988352";
// Cache each city's videos on Vercel's edge for 3 days, same as /api/guide.
const CACHE = "public, s-maxage=259200, stale-while-revalidate=86400";
const PAGE_SIZE = 25;
const MAX_VIDEOS = 8;
const MAX_PAGES = 4;
// Stable anonymous id. Do not send personal data.
const USER_PSEUDO_ID = "travel-finder";

type SearchResponse = {
  results?: VideoSearchHit[];
  nextPageToken?: string;
};

function servingConfig(projectId: string, engineId: string) {
  return `projects/${projectId}/locations/global/collections/default_collection/engines/${engineId}/servingConfigs/default_search`;
}

function redact(message: string, secret: string) {
  return secret ? message.split(secret).join("[redacted]") : message;
}

async function searchLite(
  apiKey: string,
  config: string,
  city: string,
  pageToken: string
): Promise<SearchResponse> {
  const endpoint = `https://discoveryengine.googleapis.com/v1/${config}:searchLite?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({
      servingConfig: config,
      query: `${city} food recommendations`,
      pageSize: PAGE_SIZE,
      userPseudoId: USER_PSEUDO_ID,
      contentSearchSpec: { snippetSpec: { returnSnippet: true } },
      ...(pageToken ? { pageToken } : {}),
    }),
  });
  if (!res.ok) {
    const detail = redact((await res.text()).slice(0, 200), apiKey);
    throw new Error(`Agent Search ${res.status}: ${detail}`);
  }
  return (await res.json()) as SearchResponse;
}

export async function GET(request: NextRequest) {
  const city = request.nextUrl.searchParams.get("city")?.trim();
  if (!city) return NextResponse.json({ error: "Add ?city=..." }, { status: 400 });

  const apiKey = process.env.AGENT_SEARCH_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "AGENT_SEARCH_API_KEY is not set." }, { status: 500 });
  }

  const projectId = process.env.AGENT_SEARCH_PROJECT_ID?.trim() || DEFAULT_PROJECT_ID;
  const engineId = process.env.AGENT_SEARCH_ENGINE_ID?.trim() || DEFAULT_ENGINE_ID;
  const config = servingConfig(projectId, engineId);

  const videos: FoodVideo[] = [];
  const seen = new Set<string>();
  let pageToken = "";
  let sawSuccess = false;

  try {
    for (let page = 0; page < MAX_PAGES && videos.length < MAX_VIDEOS; page++) {
      const data = await searchLite(apiKey, config, city, pageToken);
      sawSuccess = true;
      for (const video of pickTikTokVideos(data.results, MAX_VIDEOS)) {
        if (seen.has(video.videoId)) continue;
        seen.add(video.videoId);
        videos.push(video);
        if (videos.length >= MAX_VIDEOS) break;
      }
      const next = data.nextPageToken;
      if (!next || next === pageToken) break;
      pageToken = next;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(redact(message, apiKey));
    if (!sawSuccess) {
      return NextResponse.json({ error: "Couldn't find food videos right now." }, { status: 502 });
    }
  }

  return NextResponse.json({ city, videos }, { headers: { "Cache-Control": CACHE } });
}
