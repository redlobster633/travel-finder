// Turns Agent Search hits into playable TikTok videos.
// Website search also returns /photo/ posts and profile pages; only /video/ links stay.

export type FoodVideo = {
  url: string;
  videoId: string;
  title: string;
  snippet: string;
};

export type VideoSearchHit = {
  document?: {
    derivedStructData?: {
      link?: unknown;
      title?: unknown;
      snippets?: { snippet?: unknown }[] | null;
    } | null;
  } | null;
};

const VIDEO_PATH = /\/video\/(\d+)\/?$/;

export function videoFromLink(link: string): { url: string; videoId: string } | null {
  let parsed: URL;
  try {
    parsed = new URL(link);
  } catch {
    return null;
  }
  const host = parsed.hostname.toLowerCase();
  if (host !== "tiktok.com" && !host.endsWith(".tiktok.com")) return null;
  const match = parsed.pathname.match(VIDEO_PATH);
  if (!match) return null;
  const path = parsed.pathname.replace(/\/+$/, "") || "/";
  return { url: `https://www.tiktok.com${path}`, videoId: match[1] };
}

function cleanText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export function pickTikTokVideos(results: VideoSearchHit[] | undefined, limit = 8): FoodVideo[] {
  const videos: FoodVideo[] = [];
  const seen = new Set<string>();
  for (const result of results ?? []) {
    const derived = result?.document?.derivedStructData;
    if (!derived || typeof derived.link !== "string") continue;
    const video = videoFromLink(derived.link);
    if (!video || seen.has(video.videoId)) continue;
    seen.add(video.videoId);
    const title = cleanText(derived.title);
    const snippet = cleanText(derived.snippets?.find((item) => typeof item?.snippet === "string")?.snippet);
    videos.push({
      url: video.url,
      videoId: video.videoId,
      title,
      snippet: snippet === title ? "" : snippet,
    });
    if (videos.length >= limit) break;
  }
  return videos;
}
