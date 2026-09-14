import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { publicMapFallbackCopy } from "@/lib/publicLocation";
import { cn } from "@/lib/utils";

export interface MapHandle {
  leafletMap: L.Map;
  setView: (center: { lat: number; lng: number }, zoom?: number) => void;
  addCircle: (center: { lat: number; lng: number }, radiusMeters: number) => L.Circle;
  addMarker: (latlng: { lat: number; lng: number }, title?: string) => L.Marker;
  onMapClick: (handler: (latlng: { lat: number; lng: number }) => void) => void;
  fitBoundsAround: (center: { lat: number; lng: number }, radiusMeters: number, padding?: number) => void;
}

interface MapViewProps {
  className?: string;
  initialCenter?: { lat: number; lng: number };
  initialZoom?: number;
  onMapReady?: (handle: MapHandle) => void;
}

export function MapView({
  className,
  initialCenter = { lat: 37.7749, lng: -122.4194 },
  initialZoom = 12,
  onMapReady,
}: MapViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const onMapReadyRef = useRef(onMapReady);
  const [mapState, setMapState] = useState<"loading" | "ready" | "unavailable">("loading");
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    onMapReadyRef.current = onMapReady;
  }, [onMapReady]);

  useEffect(() => {
    let active = true;
    setMapState("loading");

    if (!mapContainer.current) return;

    try {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }

      const map = L.map(mapContainer.current, {
        center: L.latLng(initialCenter.lat, initialCenter.lng),
        zoom: initialZoom,
        zoomControl: true,
        attributionControl: true,
      });

      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);

      mapRef.current = map;

      const handle: MapHandle = {
        leafletMap: map,
        setView: (center, zoom) => map.setView(L.latLng(center.lat, center.lng), zoom ?? map.getZoom()),
        addCircle: (center, radiusMeters) =>
          L.circle(L.latLng(center.lat, center.lng), {
            radius: radiusMeters,
            fillColor: "#2563eb",
            fillOpacity: 0.16,
            color: "#2563eb",
            opacity: 0.72,
            weight: 2,
            interactive: false,
          }).addTo(map),
        addMarker: (latlng, title) =>
          L.marker(L.latLng(latlng.lat, latlng.lng), { title: title ?? "" }).addTo(map),
        onMapClick: handler => {
          map.on("click", (event: L.LeafletMouseEvent) => {
            handler({ lat: event.latlng.lat, lng: event.latlng.lng });
          });
        },
        fitBoundsAround: (center, radiusMeters, padding) => {
          const latLng = L.latLng(center.lat, center.lng);
          const southWest = L.latLng(latLng.lat - 0.003, latLng.lng - 0.003);
          const northEast = L.latLng(latLng.lat + 0.003, latLng.lng + 0.003);
          const bounds = L.latLngBounds(southWest, northEast);
          map.fitBounds(bounds, { padding: [padding ?? 42, padding ?? 42] });
        },
      };

      if (active) {
        setMapState("ready");
        onMapReadyRef.current?.(handle);
      }
    } catch {
      if (active) setMapState("unavailable");
    }

    return () => {
      active = false;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [initialCenter.lat, initialCenter.lng, initialZoom, retryToken]);

  return (
    <div className={cn("relative overflow-hidden bg-[#e9eff3]", className)}>
      <div ref={mapContainer} dir="ltr" className="h-full w-full" />
      {mapState !== "ready" && (
        <div className="absolute inset-0 grid place-items-center bg-[radial-gradient(circle_at_20%_20%,#ffffff_0,transparent_28%),linear-gradient(135deg,#f1f5f9,#dce8ed)] p-6 text-center">
          <div className="max-w-xs rounded-2xl border border-white/80 bg-white/90 p-4 shadow-sm">
            <span className="mx-auto mb-2 grid h-8 w-8 place-items-center rounded-full bg-[#eff6ff] text-xs font-black text-[#2563eb]">⌖</span>
            <b className="block text-sm text-[#0f172a]">{mapState === "loading" ? publicMapFallbackCopy.loadingTitle : publicMapFallbackCopy.unavailableTitle}</b>
            <small className="mt-1 block leading-5 text-[#475569]">{mapState === "loading" ? "لا تظهر أي إحداثيات دقيقة أثناء تجهيز الخريطة." : publicMapFallbackCopy.unavailableDescription}</small>
            {mapState === "unavailable" && (
              <button type="button" onClick={() => setRetryToken(value => value + 1)} className="mt-3 rounded-lg border border-[#d7e1e9] bg-white px-3 py-1.5 text-xs font-extrabold text-[#0f172a] hover:bg-[#f8fafc]">إعادة المحاولة</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
