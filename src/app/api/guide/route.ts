import { NextRequest, NextResponse } from "next/server";
import type { Place } from "@/app/api/places/route";
import { apiPath, buildGuidePrompt, preferencesFromSearchParams, type GuideBrief } from "@/lib/preferences";

// GET /api/guide?city=Tokyo
// Optional &diet=vegan&interest=cafe-hopping. The full URL is the 3-day cache key,
// so a vegan Tokyo guide is never reused for a generic Tokyo search.
// Asks Gemini to turn the raw Google Places lists into a short curated guide.

export type Pick = { id: string; why: string };
export type Dish = { name: string; why: string };
export type Guide = {
  city: string;
  intro: string;
  dishes: Dish[];
  topThingsToDo: Pick[];
  topFood: Pick[];
};

const MODEL = process.env.GEMINI_MODEL ?? "gemini-flash-lite-latest";
// Cache each city's guide on Vercel's edge for 3 days, so repeat searches are instant and free.
const CACHE = "public, s-maxage=259200, stale-while-revalidate=86400";

const pickList = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: { id: { type: "STRING" }, why: { type: "STRING" } },
    required: ["id", "why"],
  },
};

const SCHEMA = {
  type: "OBJECT",
  properties: {
    intro: { type: "STRING" },
    dishes: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { name: { type: "STRING" }, why: { type: "STRING" } },
        required: ["name", "why"],
      },
    },
    topThingsToDo: pickList,
    topFood: pickList,
  },
  required: ["intro", "dishes", "topThingsToDo", "topFood"],
};

function brief(places: Place[]): GuideBrief[] {
  return places.map((p) => ({
    id: p.id,
    name: p.name,
    rating: p.rating,
    reviews: p.reviews,
    summary: p.summary,
  }));
}

export async function GET(request: NextRequest) {
  const city = request.nextUrl.searchParams.get("city")?.trim();
  if (!city) return NextResponse.json({ error: "Add ?city=..." }, { status: 400 });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "GEMINI_API_KEY is not set." }, { status: 500 });

  const prefs = preferencesFromSearchParams(request.nextUrl.searchParams);

  try {
    // Reuse our own places endpoint so both pages see the same list.
    const placesRes = await fetch(new URL(apiPath("places", city, prefs), request.url));
    if (!placesRes.ok) throw new Error(`places ${placesRes.status}`);
    const places: { thingsToDo: Place[]; food: Place[] } = await placesRes.json();

    const prompt = buildGuidePrompt(city, brief(places.thingsToDo), brief(places.food), prefs);

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json", responseSchema: SCHEMA },
        }),
      }
    );
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    const parts: { text?: string; thought?: boolean }[] = data?.candidates?.[0]?.content?.parts ?? [];
    const text = parts.find((p) => p.text && !p.thought)?.text;
    if (!text) throw new Error("Gemini returned no text");
    const ai = JSON.parse(text) as Omit<Guide, "city">;

    // Drop any ids the model made up.
    const doIds = new Set(places.thingsToDo.map((p) => p.id));
    const foodIds = new Set(places.food.map((p) => p.id));
    const guide: Guide = {
      city,
      intro: ai.intro,
      dishes: ai.dishes.slice(0, 8),
      topThingsToDo: ai.topThingsToDo.filter((p) => doIds.has(p.id)).slice(0, 8),
      topFood: ai.topFood.filter((p) => foodIds.has(p.id)).slice(0, 8),
    };
    return NextResponse.json(guide, { headers: { "Cache-Control": CACHE } });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Couldn't build the guide right now." }, { status: 502 });
  }
}
