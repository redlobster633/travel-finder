import { NextRequest, NextResponse } from "next/server";

// GET /api/photo?name=places/XXX/photos/YYY
// Fetches the photo on the server so the API key never reaches the browser.
export async function GET(request: NextRequest) {
  const name = request.nextUrl.searchParams.get("name");
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!name || !apiKey || !/^places\/[^/]+\/photos\/[^/]+$/.test(name)) {
    return new NextResponse("Bad request", { status: 400 });
  }
  const res = await fetch(
    `https://places.googleapis.com/v1/${name}/media?maxWidthPx=600&key=${apiKey}`
  );
  if (!res.ok) {
    return new NextResponse("Photo not found", { status: 404 });
  }
  return new NextResponse(res.body, {
    headers: {
      "Content-Type": res.headers.get("Content-Type") ?? "image/jpeg",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
