import { NextRequest, NextResponse } from "next/server";
import { videoFromLink } from "@/lib/food-videos";
import { loadPoster } from "@/lib/tiktok-poster";

// GET /api/videos/poster?url=https://www.tiktok.com/@name/video/123
// One cover image for a food video. The bytes are cached here so the browser
// never talks to TikTok just to draw a preview, and so TikTok's short-lived
// cover links cannot expire in the page.

const CACHE = "public, max-age=86400, s-maxage=259200, stale-while-revalidate=86400";
// A miss is remembered briefly so a bad video does not get requested on every page view.
const MISS = "public, max-age=60, s-maxage=600";

export async function GET(request: NextRequest) {
  const pageUrl = request.nextUrl.searchParams.get("url")?.trim() ?? "";
  if (!videoFromLink(pageUrl)) {
    return new NextResponse("Bad request", { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const poster = await loadPoster(pageUrl);
    if (!poster) {
      return new NextResponse(null, { status: 404, headers: { "Cache-Control": MISS } });
    }
    return new NextResponse(Buffer.from(poster.bytes), {
      headers: {
        "Content-Type": poster.contentType,
        "Cache-Control": CACHE,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return new NextResponse(null, { status: 404, headers: { "Cache-Control": MISS } });
  }
}
