/**
 * GOOGLE MAPS FRONTEND INTEGRATION - ESSENTIAL GUIDE
 *
 * USAGE FROM PARENT COMPONENT:
 * ======
 *
 * const mapRef = useRef<google.maps.Map | null>(null);
 *
 * <MapView
 *   initialCenter={{ lat: 40.7128, lng: -74.0060 }}
 *   initialZoom={15}
 *   onMapReady={(map) => {
 *     mapRef.current = map; // Store to control map from parent anytime, google map itself is in charge of the re-rendering, not react state.
 * </MapView>
 *
 * ======
 * Available Libraries and Core Features:
 * -------------------------------
 * 📍 MARKER (from `marker` library)
 * - Attaches to map using { map, position }
 * new google.maps.marker.AdvancedMarkerElement({
 *   map,
 *   position: { lat: 37.7749, lng: -122.4194 },
 *   title: "San Francisco",
 * });
 *
 * -------------------------------
 * 🏢 PLACES (from `places` library)
 * - Does not attach directly to map; use data with your map manually.
 * const place = new google.maps.places.Place({ id: PLACE_ID });
 * await place.fetchFields({ fields: ["displayName", "location"] });
 * map.setCenter(place.location);
 * new google.maps.marker.AdvancedMarkerElement({ map, position: place.location });
 *
 * -------------------------------
 * 🧭 GEOCODER (from `geocoding` library)
 * - Standalone service; manually apply results to map.
 * const geocoder = new google.maps.Geocoder();
 * geocoder.geocode({ address: "New York" }, (results, status) => {
 *   if (status === "OK" && results[0]) {
 *     map.setCenter(results[0].geometry.location);
 *     new google.maps.marker.AdvancedMarkerElement({
 *       map,
 *       position: results[0].geometry.location,
 *     });
 *   }
 * });
 *
 * -------------------------------
 * 📐 GEOMETRY (from `geometry` library)
 * - Pure utility functions; not attached to map.
 * const dist = google.maps.geometry.spherical.computeDistanceBetween(p1, p2);
 *
 * -------------------------------
 * 🛣️ ROUTES (from `routes` library)
 * - Combines DirectionsService (standalone) + DirectionsRenderer (map-attached)
 * const directionsService = new google.maps.DirectionsService();
 * const directionsRenderer = new google.maps.DirectionsRenderer({ map });
 * directionsService.route(
 *   { origin, destination, travelMode: "DRIVING" },
 *   (res, status) => status === "OK" && directionsRenderer.setDirections(res)
 * );
 *
 * -------------------------------
 * 🌦️ MAP LAYERS (attach directly to map)
 * - new google.maps.TrafficLayer().setMap(map);
 * - new google.maps.TransitLayer().setMap(map);
 * - new google.maps.BicyclingLayer().setMap(map);
 *
 * -------------------------------
 * ✅ SUMMARY
 * - “map-attached” → AdvancedMarkerElement, DirectionsRenderer, Layers.
 * - “standalone” → Geocoder, DirectionsService, DistanceMatrixService, ElevationService.
 * - “data-only” → Place, Geometry utilities.
 */

/// <reference types="@types/google.maps" />

import { useEffect, useRef, useState } from "react";
import { publicMapFallbackCopy } from "@/lib/publicLocation";
import { cn } from "@/lib/utils";

declare global {
  interface Window {
    google?: typeof google;
  }
}

const API_KEY = import.meta.env.VITE_FRONTEND_FORGE_API_KEY;
const FORGE_BASE_URL =
  import.meta.env.VITE_FRONTEND_FORGE_API_URL ||
  "https://forge.butterfly-effect.dev";
const MAPS_PROXY_URL = `${FORGE_BASE_URL}/v1/maps/proxy`;
const MAP_SCRIPT_ID = "sakeno-google-maps-proxy";
const MAP_LOAD_TIMEOUT_MS = 15_000;
let mapScriptPromise: Promise<void> | null = null;

function loadMapScript() {
  if (window.google?.maps) return Promise.resolve();
  if (mapScriptPromise) return mapScriptPromise;
  if (!API_KEY) return Promise.reject(new Error("browser_map_proxy_configuration_missing"));

  mapScriptPromise = new Promise<void>((resolve, reject) => {
    document.getElementById(MAP_SCRIPT_ID)?.remove();
    const script = document.createElement("script");
    script.id = MAP_SCRIPT_ID;
    script.src = `${MAPS_PROXY_URL}/maps/api/js?key=${API_KEY}&v=weekly&libraries=geocoding,geometry`;
    script.async = true;
    script.crossOrigin = "anonymous";
    const timeout = window.setTimeout(() => {
      script.remove();
      reject(new Error("browser_map_proxy_timeout"));
    }, MAP_LOAD_TIMEOUT_MS);
    script.onload = () => {
      window.clearTimeout(timeout);
      if (window.google?.maps) resolve();
      else reject(new Error("browser_map_proxy_loaded_without_google_maps"));
    };
    script.onerror = () => {
      window.clearTimeout(timeout);
      script.remove();
      reject(new Error("browser_map_proxy_request_failed"));
    };
    document.head.appendChild(script);
  }).catch(error => {
    mapScriptPromise = null;
    throw error;
  });

  return mapScriptPromise;
}

interface MapViewProps {
  className?: string;
  initialCenter?: google.maps.LatLngLiteral;
  initialZoom?: number;
  onMapReady?: (map: google.maps.Map) => void;
}

export function MapView({
  className,
  initialCenter = { lat: 37.7749, lng: -122.4194 },
  initialZoom = 12,
  onMapReady,
}: MapViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const onMapReadyRef = useRef(onMapReady);
  const [mapState, setMapState] = useState<"loading" | "ready" | "unavailable">("loading");
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    onMapReadyRef.current = onMapReady;
  }, [onMapReady]);

  useEffect(() => {
    let active = true;
    setMapState("loading");
    void (async () => {
      try {
        await loadMapScript();
        if (!active || !mapContainer.current || !window.google?.maps) return;
        map.current = new window.google.maps.Map(mapContainer.current, {
          zoom: initialZoom,
          center: initialCenter,
          mapTypeControl: true,
          fullscreenControl: true,
          zoomControl: true,
          streetViewControl: false,
          gestureHandling: "cooperative",
        });
        onMapReadyRef.current?.(map.current);
        if (active) setMapState("ready");
      } catch {
        if (active) setMapState("unavailable");
      }
    })();
    return () => {
      active = false;
      map.current = null;
    };
  }, [initialCenter.lat, initialCenter.lng, initialZoom, retryToken]);

  return <div className={cn("relative overflow-hidden bg-[#e9eff3]", className)}>
    <div ref={mapContainer} className="h-full w-full" />
    {mapState !== "ready" && <div className="absolute inset-0 grid place-items-center bg-[radial-gradient(circle_at_20%_20%,#ffffff_0,transparent_28%),linear-gradient(135deg,#f1f5f9,#dce8ed)] p-6 text-center"><div className="max-w-xs rounded-2xl border border-white/80 bg-white/90 p-4 shadow-sm"><span className="mx-auto mb-2 grid h-8 w-8 place-items-center rounded-full bg-[#eff6ff] text-xs font-black text-[#2563eb]">⌖</span><b className="block text-sm text-[#0f172a]">{mapState === "loading" ? publicMapFallbackCopy.loadingTitle : publicMapFallbackCopy.unavailableTitle}</b><small className="mt-1 block leading-5 text-[#475569]">{mapState === "loading" ? "لا تظهر أي إحداثيات دقيقة أثناء تجهيز الخريطة." : publicMapFallbackCopy.unavailableDescription}</small>{mapState === "unavailable" && <button type="button" onClick={() => setRetryToken(value => value + 1)} className="mt-3 rounded-lg border border-[#d7e1e9] bg-white px-3 py-1.5 text-xs font-extrabold text-[#0f172a] hover:bg-[#f8fafc]">إعادة المحاولة</button>}</div></div>}
  </div>;
}
