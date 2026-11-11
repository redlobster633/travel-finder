// Turns a YouTube Data API search response into cards the page can play.
// Search results also include channels and playlists; only real videos stay.

export type YouTubeVideo = {
  videoId: string;
  title: string;
  channel: string;
};

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

export function isYouTubeVideoId(value: unknown): value is string {
  return typeof value === "string" && VIDEO_ID.test(value);
}

export function queriesForCity(city: string) {
  return {
    food: `${city} food recommendations`,
    places: `${city} things to do`,
  };
}

// Error text from Google sometimes echoes the request, which contains the key.
export function redactSecret(message: string, secret: string) {
  if (!secret) return message;
  const encoded = encodeURIComponent(secret);
  const stripped = message.split(secret).join("[redacted]");
  return encoded === secret ? stripped : stripped.split(encoded).join("[redacted]");
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

type SearchItem = {
  id?: { kind?: unknown; videoId?: unknown } | null;
  snippet?: { title?: unknown; channelTitle?: unknown; liveBroadcastContent?: unknown } | null;
};

export function pickYouTubeVideos(payload: unknown, limit: number): YouTubeVideo[] {
  const items = (payload as { items?: unknown } | null)?.items;
  if (!Array.isArray(items)) return [];

  const videos: YouTubeVideo[] = [];
  const seen = new Set<string>();
  for (const item of items as SearchItem[]) {
    const id = item?.id;
    if (!id || (typeof id.kind === "string" && id.kind !== "youtube#video")) continue;
    if (!isYouTubeVideoId(id.videoId) || seen.has(id.videoId)) continue;
    const live = item.snippet?.liveBroadcastContent;
    if (live === "live" || live === "upcoming") continue;
    seen.add(id.videoId);
    videos.push({
      videoId: id.videoId,
      title: cleanText(item.snippet?.title),
      channel: cleanText(item.snippet?.channelTitle),
    });
    if (videos.length >= limit) break;
  }
  return videos;
}
