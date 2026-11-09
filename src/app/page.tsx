"use client";

import { useEffect, useState, type KeyboardEvent } from "react";
import PlacesMap from "@/components/PlacesMap";
import type { Place } from "@/app/api/places/route";

type Results = { city: string; thingsToDo: Place[]; food: Place[] };
type Tab = "do" | "eat";

const SUGGESTIONS = ["Tokyo", "Bangkok", "Seoul", "Bali", "Paris"];

export default function Home() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Results | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("do");

  async function search(city: string) {
    const trimmed = city.trim();
    if (!trimmed) return;
    setQuery(trimmed);
    setLoading(true);
    setError(null);
    window.history.replaceState(null, "", `?q=${encodeURIComponent(trimmed)}`);
    try {
      const res = await fetch(`/api/places?city=${encodeURIComponent(trimmed)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      if (!data.thingsToDo.length && !data.food.length) {
        throw new Error(`We couldn't find anything for "${trimmed}". Try another place.`);
      }
      setResults(data);
      setTab("do");
    } catch (err) {
      setResults(null);
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
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

  const places = results ? (tab === "do" ? results.thingsToDo : results.food) : [];

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
            <div className="mt-4 flex flex-wrap gap-2">
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
              {places.map((p) => (
                <a
                  key={p.id}
                  href={p.mapsUrl ?? "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-stone-200 hover:shadow-md transition"
                >
                  <div className="h-44 bg-gradient-to-br from-orange-100 to-rose-100 flex items-center justify-center text-5xl">
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
                  </div>
                  <div className="p-4">
                    <h3 className="font-semibold leading-snug">{p.name}</h3>
                    {p.rating != null && (
                      <p className="mt-1 text-sm text-stone-600">
                        <span className="text-orange-500">&#9733;</span> {p.rating.toFixed(1)}{" "}
                        <span className="text-stone-400">({p.reviews.toLocaleString()} reviews)</span>
                      </p>
                    )}
                    {p.summary && (
                      <p className="mt-2 text-sm text-stone-700 line-clamp-3">{p.summary}</p>
                    )}
                    <p className="mt-2 text-sm text-stone-500 line-clamp-2">{p.address}</p>
                  </div>
                </a>
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
