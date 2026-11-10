// Cover image for a TikTok food video.
//
// The browser should not ask TikTok for anything until someone presses play.
// This file runs on the server: it asks TikTok once for a cover, downloads
// that image, and the poster route caches the bytes. Signed cover links from
// TikTok expire after a couple of days, so we never hand those links to the browser.

import { videoFromLink } from "@/lib/food-videos";

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const HTML_LIMIT = 1_500_000;
const IMAGE_LIMIT = 1_500_000;

export type PosterImage = {
  bytes: Uint8Array;
  contentType: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function isImageHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  const allowed = ["tiktokcdn.com", "tiktokcdn-us.com", "tiktokcdn-eu.com", "muscdn.com"];
  return allowed.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

// A cover link we are willing to download. Rejects anything that is not an https
// TikTok image, and rejects links that have already expired.
export function isUsableThumbnail(value: string, now = Date.now()): boolean {
  if (value.length > 2000) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password) return false;
  if (!isImageHost(url.hostname)) return false;
  const expires = url.searchParams.get("x-expires");
  if (expires) {
    const seconds = Number(expires);
    if (!Number.isFinite(seconds) || seconds * 1000 < now + 60_000) return false;
  }
  return true;
}

function isTikTokPage(url: URL): boolean {
  if (url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  return host === "tiktok.com" || host === "www.tiktok.com" || host === "m.tiktok.com";
}

export function thumbnailFromOEmbed(body: string, now = Date.now()): string | null {
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    return null;
  }
  const thumbnail = asRecord(data)?.thumbnail_url;
  if (typeof thumbnail !== "string" || !isUsableThumbnail(thumbnail, now)) return null;
  return thumbnail;
}

// TikTok's oEmbed response often has no thumbnail. The public video page still
// includes one inside its embedded JSON.
export function thumbnailCandidatesFromVideoPage(html: string, now = Date.now()): string[] {
  const match = html.match(
    /<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/
  );
  if (!match) return [];
  let data: unknown;
  try {
    data = JSON.parse(match[1]);
  } catch {
    return [];
  }
  const scope = asRecord(asRecord(data)?.__DEFAULT_SCOPE__);
  const detail = asRecord(scope?.["webapp.video-detail"]);
  const item = asRecord(asRecord(detail?.itemInfo)?.itemStruct);
  const video = asRecord(item?.video);
  const zoom = asRecord(video?.zoomCover);
  const ordered = [zoom?.["720"], zoom?.["480"], video?.cover, video?.originCover];
  const urls: string[] = [];
  for (const candidate of ordered) {
    if (typeof candidate !== "string" || !isUsableThumbnail(candidate, now)) continue;
    if (!urls.includes(candidate)) urls.push(candidate);
  }
  return urls;
}

async function fetchAllowed(
  url: string,
  allow: (next: URL) => boolean,
  timeoutMs: number,
  accept: string
): Promise<Response | null> {
  let current = url;
  for (let hop = 0; hop < 3; hop++) {
    let res: Response;
    try {
      res = await fetch(current, {
        redirect: "manual",
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          Accept: accept,
          "Accept-Language": "en-US,en;q=0.9",
          "User-Agent": BROWSER_UA,
        },
      });
    } catch {
      return null;
    }
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) return null;
      let next: URL;
      try {
        next = new URL(location, current);
      } catch {
        return null;
      }
      if (!allow(next)) return null;
      current = next.toString();
      continue;
    }
    if (!res.ok) return null;
    return res;
  }
  return null;
}

async function readLimited(res: Response, max: number): Promise<Uint8Array | null> {
  const declared = Number(res.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > max) return null;
  if (!res.body) return null;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function imageType(bytes: Uint8Array, header: string | null): string | null {
  const declared = header?.split(";")[0]?.trim().toLowerCase() ?? "";
  if (declared.startsWith("image/") && declared !== "image/svg+xml") return declared;
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46
  ) {
    return "image/webp";
  }
  return null;
}

async function downloadImage(url: string): Promise<PosterImage | null> {
  if (!isUsableThumbnail(url)) return null;
  const res = await fetchAllowed(url, (next) => isUsableThumbnail(next.toString()), 4000, "image/avif,image/webp,image/jpeg,image/*;q=0.8");
  if (!res) return null;
  const bytes = await readLimited(res, IMAGE_LIMIT);
  if (!bytes || bytes.byteLength < 500) return null;
  const contentType = imageType(bytes, res.headers.get("content-type"));
  if (!contentType) return null;
  return { bytes, contentType };
}

export async function loadPoster(pageUrl: string): Promise<PosterImage | null> {
  const video = videoFromLink(pageUrl);
  if (!video) return null;

  const candidates: string[] = [];
  const oembed = await fetchAllowed(
    `https://www.tiktok.com/oembed?url=${encodeURIComponent(video.url)}`,
    isTikTokPage,
    2500,
    "application/json"
  );
  if (oembed) {
    const body = await readLimited(oembed, 200_000);
    const thumbnail = body ? thumbnailFromOEmbed(new TextDecoder().decode(body)) : null;
    if (thumbnail) candidates.push(thumbnail);
  }

  if (candidates.length === 0) {
    // TikTok only includes the cover image for a normal browser page load.
    const page = await fetchAllowed(video.url, isTikTokPage, 5000, "text/html");
    if (page) {
      const body = await readLimited(page, HTML_LIMIT);
      if (body) candidates.push(...thumbnailCandidatesFromVideoPage(new TextDecoder().decode(body)));
    }
  }

  for (const candidate of candidates) {
    const image = await downloadImage(candidate);
    if (image) return image;
  }
  return null;
}
