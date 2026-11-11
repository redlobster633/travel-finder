"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import PlacesMap from "@/components/PlacesMap";
import TikTokFoodVideos from "@/components/TikTokFoodVideos";
import YouTubeVideos from "@/components/YouTubeVideos";
import type { Place } from "@/app/api/places/route";
import type { Guide } from "@/app/api/guide/route";
import type { FoodVideo } from "@/app/api/videos/route";
import type { YouTubeVideo } from "@/app/api/youtube/route";

type Results = { city: string; thingsToDo: Place[]; food: Place[] };
type Tab = "do" | "eat";

const SUGGESTIONS = ["Tokyo", "Bangkok", "Seoul", "Bali", "Paris"];

export default function Home() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Results | null>(null);
  const [guide, setGuide] = useState<Guide | null>(null);
  const [guideLoading, setGuideLoading] = useState(false);
  const [videos, setVideos] = useState<FoodVideo[] | null>(null);
  const [videosLoading, setVideosLoading] = useState(false);
  const [youTube, setYouTube] = useState<{ food: YouTubeVideo[]; places: YouTubeVideo[] } | null>(null);
  const [youTubeLoading, setYouTubeLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const searchId = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("do");

  async function loadGuide(city: string, id: number) {
    setGuideLoading(true);
    try {
      const res = await fetch(`/api/guide?city=${encodeURIComponent(city)}`);
      if (id !== searchId.current) return;
      if (res.ok) setGuide(await res.json());
    } catch {
      // The plain lists still work without the AI guide.
    } finally {
      if (id === searchId.current) setGuideLoading(false);
    }
  }

  async function loadVideos(city: string, id: number) {
    setVideosLoading(true);
    try {
      const res = await fetch(`/api/videos?city=${encodeURIComponent(city)}`);
      if (id !== searchId.current) return;
      if (!res.ok) return;
      const data: { videos?: FoodVideo[] } = await res.json();
      setVideos(Array.isArray(data.videos) ? data.videos : []);
    } catch {
      // Places and the guide still work without videos.
    } finally {
      if (id === searchId.current) setVideosLoading(false);
    }
  }

  async function loadYouTube(city: string, id: number) {
    setYouTubeLoading(true);
    try {
      const res = await fetch(`/api/youtube?city=${encodeURIComponent(city)}`);
      if (id !== searchId.current) return;
      if (!res.ok) return;
      const data: { food?: YouTubeVideo[]; places?: YouTubeVideo[] } = await res.json();
      setYouTube({
        food: Array.isArray(data.food) ? data.food : [],
        places: Array.isArray(data.places) ? data.places : [],
      });
    } catch {
      // Places, the guide, and TikTok still work without YouTube.
    } finally {
      if (id === searchId.current) setYouTubeLoading(false);
    }
  }

  async function search(city: string) {
    const trimmed = city.trim();
    if (!trimmed) return;
    const id = ++searchId.current;
    setQuery(trimmed);
    setLoading(true);
    setError(null);
    setGuide(null);
    setVideos(null);
    setVideosLoading(false);
    setYouTube(null);
    setYouTubeLoading(false);
    window.history.replaceState(null, "", `?q=${encodeURIComponent(trimmed)}`);
    try {
      const res = await fetch(`/api/places?city=${encodeURIComponent(trimmed)}`);
      const data = await res.json();
      if (id !== searchId.current) return;
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      if (!data.thingsToDo.length && !data.food.length) {
        throw new Error(`We couldn't find anything for "${trimmed}". Try another place.`);
      }
      setResults(data);
      setTab("do");
      loadGuide(trimmed, id);
      loadVideos(trimmed, id);
      loadYouTube(trimmed, id);
    } catch (err) {
      if (id !== searchId.current) return;
      setResults(null);
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      if (id === searchId.current) setLoading(false);
    }
  }

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("q");
    if (!q) return;
    // Run after the first render so a shared ?q= link loads its results.
    const timer = setTimeout(() => search(q), 0);
    return () => clearTimeout(timer);
  }, []);

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") search(query);
  }

  const allPlaces = results ? (tab === "do" ? results.thingsToDo : results.food) : [];
  const picks = guide ? (tab === "do" ? guide.topThingsToDo : guide.topFood) : [];
  const whyById = new Map(picks.map((p) => [p.id, p.why]));
  // AI top picks first, in the order the AI ranked them, then everything else.
  const places = [
    ...picks.map((pick) => allPlaces.find((p) => p.id === pick.id)).filter((p): p is Place => !!p),
    ...allPlaces.filter((p) => !whyById.has(p.id)),
  ];

  return (
    <main className="min-h-screen bg-stone-50 text-stone-900">
      <section className="bg-gradient-to-br from-orange-500 to-rose-500 text-white">
        <div className="mx-auto max-w-5xl px-5 py-14 sm:py-20">
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">Where are you going?</h1>
          <p className="mt-3 text-lg text-white/90">
            Type a place and get the best things to do and food to eat there.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Try Tokyo, Bali or Paris"
              className="flex-1 rounded-xl px-5 py-4 text-lg text-stone-900 bg-white outline-none focus:ring-4 focus:ring-white/40"
            />
            <button
              onClick={() => search(query)}
              disabled={loading}
              className="rounded-xl bg-stone-900 px-8 py-4 text-lg font-semibold hover:bg-stone-800 disabled:opacity-60"
            >
              {loading ? "Searching..." : "Search"}
            </button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => search(s)}
                className="rounded-full bg-white/20 px-4 py-1.5 text-sm hover:bg-white/30"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-5 py-10">
        {error && (
          <p className="rounded-xl bg-rose-100 px-5 py-4 text-rose-800">{error}</p>
        )}

        {loading && (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-72 animate-pulse rounded-2xl bg-stone-200" />
            ))}
          </div>
        )}

        {results && !loading && (
          <>
            <h2 className="text-2xl font-bold">{results.city}</h2>

            {guideLoading && (
              <div className="mt-4 space-y-3">
                <p className="text-sm text-stone-500">&#10024; Picking the highlights for you...</p>
                <div className="h-4 w-3/4 animate-pulse rounded bg-stone-200" />
                <div className="h-20 animate-pulse rounded-2xl bg-stone-200" />
              </div>
            )}

            {guide && (
              <>
                <p className="mt-2 text-lg text-stone-700">{guide.intro}</p>
                {guide.dishes.length > 0 && (
                  <div className="mt-6">
                    <h3 className="text-lg font-semibold">What to eat in {results.city}</h3>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {guide.dishes.map((d) => (
                        <div key={d.name} className="rounded-xl bg-orange-50 px-4 py-3 ring-1 ring-orange-100">
                          <p className="font-semibold">{d.name}</p>
                          <p className="mt-1 text-sm text-stone-600">{d.why}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {videosLoading && (
              <p className="mt-4 text-sm text-stone-500">&#10024; Finding food videos for you...</p>
            )}

            {videos && videos.length > 0 && (
              <div className="mt-6">
                <h3 className="text-lg font-semibold">Food videos from TikTok</h3>
                <TikTokFoodVideos videos={videos} />
              </div>
            )}

            {youTubeLoading && (
              <p className="mt-4 text-sm text-stone-500">&#10024; Finding YouTube videos for you...</p>
            )}

            {youTube && <YouTubeVideos food={youTube.food} places={youTube.places} />}

            <div className="mt-8 flex flex-wrap gap-2">
              <button
                onClick={() => setTab("do")}
                className={`rounded-full px-5 py-2 font-medium ${tab === "do" ? "bg-stone-900 text-white" : "bg-white border border-stone-300"}`}
              >
                Things to do ({results.thingsToDo.length})
              </button>
              <button
                onClick={() => setTab("eat")}
                className={`rounded-full px-5 py-2 font-medium ${tab === "eat" ? "bg-stone-900 text-white" : "bg-white border border-stone-300"}`}
              >
                Food ({results.food.length})
              </button>
            </div>

            <div className="mt-6">
              <PlacesMap places={places} />
            </div>

            <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {places.map((p) => {
                const why = whyById.get(p.id);
                return (
                  <a
                    key={p.id}
                    href={p.mapsUrl ?? "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`group overflow-hidden rounded-2xl bg-white shadow-sm ring-1 hover:shadow-md transition ${why ? "ring-orange-300" : "ring-stone-200"}`}
                  >
                    <div className="relative h-44 bg-gradient-to-br from-orange-100 to-rose-100 flex items-center justify-center text-5xl">
                      {!p.photo && <span aria-hidden>{tab === "do" ? "\u{1F5FA}\uFE0F" : "\u{1F35C}"}</span>}
                      {p.photo && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.photo}
                          alt={p.name}
                          loading="lazy"
                          className="h-full w-full object-cover group-hover:scale-105 transition"
                        />
                      )}
                      {why && (
                        <span className="absolute left-3 top-3 rounded-full bg-orange-500 px-3 py-1 text-xs font-semibold text-white shadow">
                          Top pick
                        </span>
                      )}
                    </div>
                    <div className="p-4">
                      <h3 className="font-semibold leading-snug">{p.name}</h3>
                      {p.rating != null && (
                        <p className="mt-1 text-sm text-stone-600">
                          <span className="text-orange-500">&#9733;</span> {p.rating.toFixed(1)}{" "}
                          <span className="text-stone-400">({p.reviews.toLocaleString()} reviews)</span>
                        </p>
                      )}
                      {why && <p className="mt-2 text-sm font-medium text-orange-700">{why}</p>}
                      {!why && p.summary && (
                        <p className="mt-2 text-sm text-stone-700 line-clamp-3">{p.summary}</p>
                      )}
                      <p className="mt-2 text-sm text-stone-500 line-clamp-2">{p.address}</p>
                    </div>
                  </a>
                );
              })}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
