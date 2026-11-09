import { NextRequest, NextResponse } from "next/server";
import type { Place } from "@/app/api/places/route";

// GET /api/guide?city=Tokyo
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

function brief(places: Place[]) {
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

  try {
    // Reuse our own places endpoint so both pages see the same list.
    const placesRes = await fetch(new URL(`/api/places?city=${encodeURIComponent(city)}`, request.url));
    if (!placesRes.ok) throw new Error(`places ${placesRes.status}`);
    const places: { thingsToDo: Place[]; food: Place[] } = await placesRes.json();

    const prompt = `You are a friendly local travel expert writing a short guide to ${city}.
Below are popular attractions and restaurants from Google, with ratings and review counts.

1. intro: one or two warm sentences on what makes ${city} special for a visitor.
2. dishes: 6 local dishes or drinks a visitor must try in ${city}, each with one short line on why.
3. topThingsToDo: pick the 8 best attractions from the list (balance famous sights with variety), each with one short, specific line on why it's worth it.
4. topFood: pick the 8 best food spots from the list, each with one short line on what to order or why to go.
Only use ids from the lists. Keep every "why" under 20 words.

Attractions: ${JSON.stringify(brief(places.thingsToDo))}
Restaurants: ${JSON.stringify(brief(places.food))}`;

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
