import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DIET_PRESETS,
  EMPTY_PREFERENCES,
  INTEREST_PRESETS,
  addPreference,
  apiPath,
  buildGuidePrompt,
  foodVideoHeading,
  foodVideoQuery,
  pageSearch,
  webArticleQuery,
  webPickNotes,
  parseStoredPreferences,
  placesSearchText,
  placesVideoHeading,
  placesVideoQuery,
  preferencesFromSearchParams,
  serializePreferences,
} from "./preferences.ts";

const TOKYO = "Tokyo";

test("starting chips include everyday diets plus sports and cafe hopping", () => {
  for (const id of ["vegetarian", "vegan", "halal", "kosher", "gluten-free", "dairy-free", "nut-free"]) {
    assert.ok(DIET_PRESETS.some((item) => item.id === id));
  }
  for (const id of ["sports", "cafe-hopping"]) {
    assert.ok(INTEREST_PRESETS.some((item) => item.id === id));
  }
});

test("no preferences keep the original request paths and search text", () => {
  assert.equal(pageSearch(TOKYO, EMPTY_PREFERENCES), "?q=Tokyo");
  assert.equal(pageSearch("New York", EMPTY_PREFERENCES), "?q=New%20York");
  assert.equal(pageSearch("São Paulo", EMPTY_PREFERENCES), `?q=${encodeURIComponent("São Paulo")}`);
  assert.equal(apiPath("guide", TOKYO, EMPTY_PREFERENCES), "/api/guide?city=Tokyo");
  assert.equal(apiPath("places", TOKYO, EMPTY_PREFERENCES), "/api/places?city=Tokyo");
  assert.equal(apiPath("videos", TOKYO, EMPTY_PREFERENCES), "/api/videos?city=Tokyo");
  assert.equal(apiPath("youtube", TOKYO, EMPTY_PREFERENCES), "/api/youtube?city=Tokyo");
  assert.equal(apiPath("web", TOKYO, EMPTY_PREFERENCES), "/api/web?city=Tokyo");
  assert.equal(webArticleQuery(TOKYO, EMPTY_PREFERENCES), "best things to do and where to eat in Tokyo");
  assert.equal(webPickNotes(EMPTY_PREFERENCES), "");
  assert.deepEqual(placesSearchText(TOKYO, EMPTY_PREFERENCES), {
    thingsToDo: "top things to do in Tokyo",
    food: "best local restaurants in Tokyo",
  });
  assert.equal(foodVideoQuery(TOKYO, EMPTY_PREFERENCES), "Tokyo food recommendations");
  assert.equal(placesVideoQuery(TOKYO, EMPTY_PREFERENCES), "Tokyo things to do");
  assert.equal(foodVideoHeading("TikTok", EMPTY_PREFERENCES), "Food videos from TikTok");
  assert.equal(foodVideoHeading("YouTube", EMPTY_PREFERENCES), "Food videos from YouTube");
  assert.equal(placesVideoHeading(EMPTY_PREFERENCES), "Things to do on YouTube");
});

test("a guide with no preferences uses the original prompt", () => {
  const attractions = [
    { id: "a", name: "Senso-ji", rating: 4.6, reviews: 12, summary: "Old temple" },
  ];
  const prompt = buildGuidePrompt(TOKYO, attractions, [], EMPTY_PREFERENCES);
  assert.equal(
    prompt,
    `You are a friendly local travel expert writing a short guide to Tokyo.
Below are popular attractions and restaurants from Google, with ratings and review counts.

1. intro: one or two warm sentences on what makes Tokyo special for a visitor.
2. dishes: 6 local dishes or drinks a visitor must try in Tokyo, each with one short line on why.
3. topThingsToDo: pick the 8 best attractions from the list (balance famous sights with variety), each with one short, specific line on why it's worth it.
4. topFood: pick the 8 best food spots from the list, each with one short line on what to order or why to go.
Only use ids from the lists. Keep every "why" under 20 words.

Attractions: [{"id":"a","name":"Senso-ji","rating":4.6,"reviews":12,"summary":"Old temple"}]
Restaurants: []`
  );
});

test("diet and interest order does not change cache keys", () => {
  const left = { diets: ["vegan", "halal"], interests: ["sports", "cafe-hopping"] };
  const right = { diets: ["halal", "vegan"], interests: ["cafe hopping", "Sports"] };
  assert.equal(apiPath("guide", TOKYO, left), apiPath("guide", TOKYO, right));
  assert.equal(
    apiPath("guide", TOKYO, left),
    "/api/guide?city=Tokyo&diet=halal&diet=vegan&interest=cafe-hopping&interest=sports"
  );
  assert.notEqual(apiPath("guide", TOKYO, left), apiPath("guide", TOKYO, EMPTY_PREFERENCES));
});

test("page links and API cache keys share the same preference params", () => {
  const prefs = { diets: ["vegan", "halal"], interests: ["sports", "cafe-hopping"] };
  const page = new URL(`http://local/${pageSearch(TOKYO, prefs)}`);
  const guide = new URL(`http://local${apiPath("guide", TOKYO, prefs)}`);
  assert.deepEqual(page.searchParams.getAll("diet"), guide.searchParams.getAll("diet"));
  assert.deepEqual(page.searchParams.getAll("interest"), guide.searchParams.getAll("interest"));
  assert.equal(page.searchParams.get("q"), TOKYO);
  assert.equal(guide.searchParams.get("city"), TOKYO);
});

test("sports does not change food searches, and cafe hopping does", () => {
  const sports = { diets: [], interests: ["sports"] };
  const cafes = { diets: [], interests: ["cafe-hopping"] };
  assert.equal(apiPath("videos", TOKYO, sports), "/api/videos?city=Tokyo");
  assert.equal(foodVideoQuery(TOKYO, sports), "Tokyo food recommendations");
  assert.equal(placesVideoQuery(TOKYO, sports), "Tokyo sports things to do");
  assert.equal(apiPath("youtube", TOKYO, sports), "/api/youtube?city=Tokyo&interest=sports");
  assert.deepEqual(placesSearchText(TOKYO, sports), {
    thingsToDo: "top things to do in Tokyo for sports",
    food: "best local restaurants in Tokyo",
  });

  assert.equal(apiPath("videos", TOKYO, cafes), "/api/videos?city=Tokyo&interest=cafe-hopping");
  assert.equal(foodVideoQuery(TOKYO, cafes), "Tokyo cafe hopping food recommendations");
  assert.equal(placesVideoQuery(TOKYO, cafes), "Tokyo cafe hopping things to do");
  assert.deepEqual(placesSearchText(TOKYO, cafes).food, "best cafes in Tokyo");
});

test("a diet changes food results and leaves things-to-do queries alone", () => {
  const vegan = { diets: ["vegan"], interests: [] };
  assert.equal(apiPath("videos", TOKYO, vegan), "/api/videos?city=Tokyo&diet=vegan");
  assert.equal(apiPath("youtube", TOKYO, vegan), "/api/youtube?city=Tokyo&diet=vegan");
  assert.equal(foodVideoQuery(TOKYO, vegan), "Tokyo vegan food recommendations");
  assert.equal(placesVideoQuery(TOKYO, vegan), "Tokyo things to do");
  assert.deepEqual(placesSearchText(TOKYO, vegan), {
    thingsToDo: "top things to do in Tokyo",
    food: "best vegan restaurants in Tokyo",
  });
  assert.equal(foodVideoHeading("TikTok", vegan), "Vegan food videos from TikTok");
  assert.equal(placesVideoHeading(vegan), "Things to do on YouTube");
});

test("diet plus activities shape each request only where that preference applies", () => {
  const prefs = { diets: ["vegan", "gluten-free"], interests: ["sports", "cafe-hopping"] };
  assert.equal(
    apiPath("guide", TOKYO, prefs),
    "/api/guide?city=Tokyo&diet=gluten-free&diet=vegan&interest=cafe-hopping&interest=sports"
  );
  assert.equal(
    apiPath("places", TOKYO, prefs),
    "/api/places?city=Tokyo&diet=gluten-free&diet=vegan&interest=cafe-hopping&interest=sports"
  );
  assert.equal(
    apiPath("videos", TOKYO, prefs),
    "/api/videos?city=Tokyo&diet=gluten-free&diet=vegan&interest=cafe-hopping"
  );
  assert.equal(
    apiPath("youtube", TOKYO, prefs),
    "/api/youtube?city=Tokyo&diet=gluten-free&diet=vegan&interest=cafe-hopping&interest=sports"
  );
  assert.equal(
    apiPath("web", TOKYO, prefs),
    "/api/web?city=Tokyo&diet=gluten-free&diet=vegan&interest=cafe-hopping&interest=sports"
  );
  assert.equal(webArticleQuery(TOKYO, prefs), "best gluten-free vegan cafe hopping food and sports in Tokyo");
  const notes = webPickNotes(prefs);
  assert.match(notes, /Dietary restrictions \(every food pick must fit all of them\): Gluten-free and Vegan/);
  assert.match(notes, /Interests to lean toward: Cafe hopping and Sports/);
  assert.deepEqual(placesSearchText(TOKYO, prefs), {
    thingsToDo: "top things to do in Tokyo for cafe hopping and sports",
    food: "best gluten-free and vegan cafes in Tokyo",
  });
  assert.equal(
    foodVideoQuery(TOKYO, prefs),
    "Tokyo gluten-free vegan cafe hopping food recommendations"
  );
  assert.equal(placesVideoQuery(TOKYO, prefs), "Tokyo cafe hopping sports things to do");

  const prompt = buildGuidePrompt(TOKYO, [], [], prefs);
  assert.match(prompt, /Dietary restrictions \(every dish and every food spot must fit all of them\): Gluten-free and Vegan/);
  assert.match(prompt, /Interests to lean toward: Cafe hopping and Sports/);
  assert.match(prompt, /Only use ids from the lists/);
  assert.doesNotMatch(prompt, /balance famous sights with variety/);
});

test("custom food interests affect food search and custom other interests do not", () => {
  const street = { diets: ["halal"], interests: ["street food"] };
  assert.equal(placesSearchText("Penang", street).food, "best halal restaurants in Penang for street food");
  assert.equal(foodVideoQuery("Penang", street), "Penang halal street food food recommendations");
  assert.equal(apiPath("videos", "Penang", { diets: [], interests: ["temples"] }), "/api/videos?city=Penang");
  assert.equal(placesVideoQuery("Penang", { diets: [], interests: ["temples"] }), "Penang temples things to do");
});

test("preference params round-trip from a cache URL", () => {
  const prefs = { diets: ["nut-free", "dairy-free"], interests: ["live music", "museums"] };
  const guide = new URL(`http://local${apiPath("guide", "Osaka", prefs)}`);
  assert.deepEqual(preferencesFromSearchParams(guide.searchParams), {
    diets: ["dairy-free", "nut-free"],
    interests: ["live music", "museums"],
  });
  const comma = new URLSearchParams("diet=vegan,halal&interest=sports");
  assert.deepEqual(preferencesFromSearchParams(comma), {
    diets: ["halal", "vegan"],
    interests: ["sports"],
  });
});

test("stored preferences ignore junk and match the cache key", () => {
  const raw = serializePreferences({ diets: [" Vegan ", "nope<script>"], interests: ["SPORTS"] });
  const parsed = parseStoredPreferences(raw);
  assert.deepEqual(parsed, { diets: ["vegan"], interests: ["sports"] });
  assert.equal(parseStoredPreferences("not json"), EMPTY_PREFERENCES);
  assert.equal(parseStoredPreferences(null), EMPTY_PREFERENCES);
  const tooLong = "a".repeat(41);
  assert.equal(addPreference(EMPTY_PREFERENCES, "diet", tooLong).ok, false);
  assert.equal(addPreference(EMPTY_PREFERENCES, "interest", "live\nmusic").ok, false);
});
