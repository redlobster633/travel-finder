"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import type { Map as LeafletMap, LayerGroup } from "leaflet";
import type { Place } from "@/app/api/places/route";

export default function PlacesMap({ places }: { places: Place[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layerRef = useRef<LayerGroup | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current) return;
      if (!mapRef.current) {
        mapRef.current = L.map(containerRef.current, { scrollWheelZoom: false });
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "&copy; OpenStreetMap contributors",
          maxZoom: 19,
        }).addTo(mapRef.current);
        layerRef.current = L.layerGroup().addTo(mapRef.current);
      }
      const layer = layerRef.current!;
      layer.clearLayers();
      const points: [number, number][] = [];
      for (const p of places) {
        if (p.lat == null || p.lng == null) continue;
        points.push([p.lat, p.lng]);
        L.circleMarker([p.lat, p.lng], {
          radius: 8,
          color: "#ffffff",
          weight: 2,
          fillColor: "#f97316",
          fillOpacity: 1,
        })
          .bindPopup(`<strong>${p.name}</strong><br/>${p.rating ?? ""} &#9733;`)
          .addTo(layer);
      }
      if (points.length) {
        mapRef.current.fitBounds(L.latLngBounds(points), { padding: [30, 30] });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [places]);

  useEffect(() => {
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  return <div ref={containerRef} className="h-80 w-full rounded-2xl overflow-hidden z-0" />;
}
