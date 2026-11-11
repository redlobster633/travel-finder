"use client";

import { useState } from "react";
import { isYouTubeVideoId, type YouTubeVideo } from "@/lib/youtube";

// One YouTube player at a time, same idea as the TikTok cards. Every card is a
// still thumbnail until it is tapped, so a city page never loads a stack of players.
function playerSrc(videoId: string) {
  return `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&playsinline=1`;
}

function posterSrc(videoId: string) {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

function safeVideos(value: unknown): YouTubeVideo[] {
  if (!Array.isArray(value)) return [];
  const videos: YouTubeVideo[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    if (!isYouTubeVideoId(record.videoId) || seen.has(record.videoId)) continue;
    seen.add(record.videoId);
    videos.push({
      videoId: record.videoId,
      title: typeof record.title === "string" ? record.title : "",
      channel: typeof record.channel === "string" ? record.channel : "",
    });
  }
  return videos;
}

const previewClass =
  "group relative block aspect-video w-full cursor-pointer bg-stone-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-400";

function YouTubeCard({
  video,
  playing,
  showPoster,
  onPlay,
  onClose,
  onPosterError,
}: {
  video: YouTubeVideo;
  playing: boolean;
  showPoster: boolean;
  onPlay: () => void;
  onClose: () => void;
  onPosterError: () => void;
}) {
  const label = video.title || "YouTube video";
  return (
    <article
      className={`min-w-0 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ${playing ? "ring-orange-300" : "ring-stone-200"}`}
    >
      {playing ? (
        <iframe
          src={playerSrc(video.videoId)}
          title={label}
          className="aspect-video w-full bg-stone-100"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      ) : (
        <button type="button" onClick={onPlay} className={previewClass} aria-label={`Play ${label}`}>
          <span aria-hidden className="absolute inset-0 bg-gradient-to-br from-orange-400 to-rose-500" />
          {showPoster && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={posterSrc(video.videoId)}
              alt=""
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              onError={onPosterError}
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
        <h4 className="font-semibold leading-snug line-clamp-2 break-words">{label}</h4>
        {video.channel && <p className="mt-1 truncate text-sm text-stone-600">{video.channel}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
          {playing && (
            <button type="button" onClick={onClose} className="text-sm font-medium text-stone-500">
              Close player
            </button>
          )}
          <a
            href={`https://www.youtube.com/watch?v=${video.videoId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-orange-700"
          >
            Watch on YouTube
          </a>
        </div>
      </div>
    </article>
  );
}

export default function YouTubeVideos({
  food,
  places,
  foodTitle = "Food videos from YouTube",
  placesTitle = "Things to do on YouTube",
}: {
  food: YouTubeVideo[];
  places: YouTubeVideo[];
  foodTitle?: string;
  placesTitle?: string;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hiddenPosters, setHiddenPosters] = useState<string[]>([]);
  const sections = [
    { id: "food", title: foodTitle, videos: safeVideos(food) },
    { id: "places", title: placesTitle, videos: safeVideos(places) },
  ].filter((section) => section.videos.length > 0);

  if (sections.length === 0) return null;

  return (
    <>
      {sections.map((section) => (
        <div key={section.id} className="mt-6">
          <h3 className="text-lg font-semibold">{section.title}</h3>
          <div className="mt-3 grid grid-cols-1 gap-5 sm:grid-cols-2">
            {section.videos.map((video) => {
              const cardId = `${section.id}:${video.videoId}`;
              return (
                <YouTubeCard
                  key={cardId}
                  video={video}
                  playing={activeId === cardId}
                  showPoster={!hiddenPosters.includes(cardId)}
                  onPlay={() => setActiveId(cardId)}
                  onClose={() => setActiveId(null)}
                  onPosterError={() =>
                    setHiddenPosters((current) => (current.includes(cardId) ? current : [...current, cardId]))
                  }
                />
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}
