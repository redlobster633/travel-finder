"use client";

import type { FoodVideo } from "@/app/api/videos/route";

// Official TikTok player. A new video id remounts the frame when the city or list changes.
function embedSrc(videoId: string) {
  return `https://www.tiktok.com/embed/v2/${encodeURIComponent(videoId)}`;
}

export default function TikTokFoodVideos({ videos }: { videos: FoodVideo[] }) {
  return (
    <div className="mt-3 grid gap-5 sm:grid-cols-2">
      {videos.map((video) => (
        <article
          key={video.videoId}
          className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-stone-200"
        >
          <iframe
            key={video.videoId}
            src={embedSrc(video.videoId)}
            title={video.title || "TikTok food video"}
            className="mx-auto block h-[780px] w-full max-w-[325px] bg-stone-100"
            allow="fullscreen; autoplay; encrypted-media; picture-in-picture; accelerometer; gyroscope"
            allowFullScreen
            loading="lazy"
          />
          <div className="p-4">
            <h4 className="font-semibold leading-snug line-clamp-2">
              {video.title || "TikTok video"}
            </h4>
            {video.snippet && (
              <p className="mt-1 text-sm text-stone-600 line-clamp-3">{video.snippet}</p>
            )}
            <a
              href={video.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block text-sm font-medium text-orange-700"
            >
              Watch on TikTok
            </a>
          </div>
        </article>
      ))}
    </div>
  );
}
