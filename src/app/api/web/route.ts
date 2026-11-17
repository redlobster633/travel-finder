import { NextRequest, NextResponse } from "next/server";
import { gatherArticlePages } from "@/lib/read-web";
import {
  buildWebPicksPrompt,
  filterWebPicks,
  type WebPick,
} from "@/lib/web-articles";
import { preferencesFromSearchParams, webArticleQuery, webPickNotes } from "@/lib/preferences";

// GET /api/web?city=Tokyo
// Optional &diet=vegan&interest=museums. The full URL is the 3-day cache key,
// same as /api/guide. With no preferences the URL stays ?city=Tokyo.
// Reads a few public articles and asks Gemini for food and things-to-do picks.
// Every pick has to name a place that was in a page we fetched.

export type { WebPick };

export const maxDuration = 60;

const MODEL = process.env.GEMINI_MODEL ?? "gemini-flash-lite-latest";
const CACHE = "public, s-maxage=259200, stale-while-revalidate=86400";

const SCHEMA = {
  type: "OBJECT",
  properties: {
    picks: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          why: { type: "STRING" },
          category: { type: "STRING" },
          area: { type: "STRING" },
          priceHint: { type: "STRING" },
          sourceUrl: { type: "STRING" },
        },
        required: ["name", "why", "category", "area", "priceHint", "sourceUrl"],
      },
    },
  },
  required: ["picks"],
};

function hidden(city: string) {
  return NextResponse.json({ city, picks: [] }, { headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: NextRequest) {
  const city = (request.nextUrl.searchParams.get("city") ?? "").trim().replace(/[\u0000-\u001f\u007f]/g, "");
  if (!city) return NextResponse.json({ error: "Add ?city=..." }, { status: 400 });
  if (city.length > 80) return NextResponse.json({ error: "That place name is too long." }, { status: 400 });

  const apiKey = process.env.GEMINI_API_KEY?.trim() ?? "";
  // The guide already needs this key. Hide the section when it is missing.
  if (!apiKey) return hidden(city);

  const prefs = preferencesFromSearchParams(request.nextUrl.searchParams);

  try {
    const pages = await gatherArticlePages(city, webArticleQuery(city, prefs));
    if (!pages.length) return hidden(city);

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        cache: "no-store",
        signal: AbortSignal.timeout(20000),
        body: JSON.stringify({
          contents: [{ parts: [{ text: buildWebPicksPrompt(city, pages, webPickNotes(prefs)) }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: SCHEMA,
            maxOutputTokens: 2048,
          },
        }),
      }
    );
    if (!res.ok) {
      const detail = redact((await res.text()).slice(0, 200), apiKey);
      throw new Error(`Gemini ${res.status}: ${detail}`);
    }
    const data = await res.json();
    const parts: { text?: string; thought?: boolean }[] = data?.candidates?.[0]?.content?.parts ?? [];
    const text = parts.find((part) => part.text && !part.thought)?.text;
    if (!text) throw new Error("Gemini returned no text");
    const picks = filterWebPicks(JSON.parse(text), pages, city);
    if (!picks.length) return hidden(city);
    return NextResponse.json({ city, picks }, { headers: { "Cache-Control": CACHE } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(redact(message, apiKey));
    return hidden(city);
  }
}

function redact(message: string, secret: string): string {
  return secret ? message.split(secret).join("[redacted]") : message;
}
