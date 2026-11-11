"use client";

import { useState } from "react";
import type { FoodVideo } from "@/app/api/videos/route";

// One TikTok player at a time. Loading every embed on the page makes TikTok
// answer with a black "overload-protect" box, so each card stays a still
// preview until it is tapped. Opening another card replaces the player.
function playerSrc(videoId: string) {
  return `https://www.tiktok.com/embed/v2/${encodeURIComponent(videoId)}`;
}

function posterSrc(url: string) {
  return `/api/videos/poster?url=${encodeURIComponent(url)}`;
}

const previewClass = "relative mx-auto block aspect-[9/16] w-full max-w-[325px] bg-stone-100";
const playerClass = "mx-auto block h-[780px] w-full max-w-[325px] bg-stone-100";

export default function TikTokFoodVideos({ videos }: { videos: FoodVideo[] }) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hiddenPosters, setHiddenPosters] = useState<string[]>([]);

  return (
    <div className="mt-3 grid gap-5 sm:grid-cols-2">
      {videos.map((video) => {
        const playing = activeId === video.videoId;
        const showPoster = !hiddenPosters.includes(video.videoId);
        const label = video.title || "TikTok food video";
        return (
          <article
            key={video.videoId}
            className={`overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ${playing ? "ring-orange-300" : "ring-stone-200"}`}
          >
            {playing ? (
              <iframe
                src={playerSrc(video.videoId)}
                title={label}
                className={playerClass}
                allow="fullscreen; autoplay; encrypted-media; picture-in-picture; accelerometer; gyroscope"
                allowFullScreen
              />
            ) : (
              <button
                type="button"
                onClick={() => setActiveId(video.videoId)}
                className={`group ${previewClass} cursor-pointer focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-400`}
                aria-label={`Play ${label}`}
              >
                <span aria-hidden className="absolute inset-0 bg-gradient-to-br from-orange-400 to-rose-500" />
                {showPoster && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={posterSrc(video.url)}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    referrerPolicy="no-referrer"
                    onError={() =>
                      setHiddenPosters((current) =>
                        current.includes(video.videoId) ? current : [...current, video.videoId]
                      )
                    }
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                )}
                <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/45 via-black/10 to-black/25" />
                <span
                  aria-hidden
                  className="absolute left-1/2 top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-orange-600 shadow-lg transition group-hover:scale-105 group-active:scale-95"
                >
                  <svg viewBox="0 0 24 24" className="ml-1 h-7 w-7 fill-current">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </span>
              </button>
            )}
            <div className="p-4">
              <h4 className="font-semibold leading-snug line-clamp-2">{video.title || "TikTok video"}</h4>
              {video.snippet && <p className="mt-1 text-sm text-stone-600 line-clamp-3">{video.snippet}</p>}
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                {playing && (
                  <button
                    type="button"
                    onClick={() => setActiveId(null)}
                    className="text-sm font-medium text-stone-500"
                  >
                    Close player
                  </button>
                )}
                <a
                  href={video.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-orange-700"
                >
                  Watch on TikTok
                </a>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
