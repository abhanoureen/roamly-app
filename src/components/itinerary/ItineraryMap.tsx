import { useEffect, useMemo, useRef, useCallback } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Tables } from "@/integrations/supabase/types";

type Item = Tables<"itinerary_items">;

const DAY_COLORS: Record<number, string> = {
  1: "#0d9488",
  2: "#6366f1",
  3: "#f97316",
  4: "#ec4899",
};
const DEFAULT_COLOR = "#22c55e";

function markerColor(day: number) {
  return DAY_COLORS[day] ?? DEFAULT_COLOR;
}

function createIcon(day: number, highlighted: boolean) {
  const color = markerColor(day);
  const size = highlighted ? 44 : 36;
  return L.divIcon({
    className: "",
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.35);${highlighted ? "transform:scale(1.15);" : ""}display:flex;align-items:center;justify-content:center;"><span style="color:white;font-weight:bold;font-size:${highlighted ? 15 : 13}px;">${day}</span></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function hasValidCoords(item: Item): boolean {
  return item.lat != null && item.lng != null && !(item.lat === 0 && item.lng === 0);
}

function formatTime(timeSlot: string): string {
  if (!/^\d{1,2}:\d{2}/.test(timeSlot)) return timeSlot;
  const [hStr, mStr] = timeSlot.split(":");
  let h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  const period = h >= 12 ? "PM" : "AM";
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${m.toString().padStart(2, "0")} ${period}`;
}

function formatDuration(mins: number | null): string {
  if (!mins) return "";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return h === 1 ? "1 hr" : `${h} hrs`;
  return h === 1 ? `1 hr ${m} min` : `${h} hrs ${m} min`;
}

interface FitBoundsProps {
  items: Item[];
}

function FitBounds({ items }: FitBoundsProps) {
  const map = useMap();
  const fitted = useRef(false);

  useEffect(() => {
    if (fitted.current || items.length === 0) return;
    const bounds = L.latLngBounds(items.map((i) => [i.lat, i.lng]));
    map.fitBounds(bounds, { padding: [40, 40] });
    fitted.current = true;
  }, [items, map]);

  return null;
}

interface FlyToProps {
  lat: number | null;
  lng: number | null;
}

function FlyToMarker({ lat, lng }: FlyToProps) {
  const map = useMap();
  useEffect(() => {
    if (lat != null && lng != null) {
      map.flyTo([lat, lng], 15, { duration: 1 });
    }
  }, [lat, lng, map]);
  return null;
}

interface Props {
  items: Item[];
  activeDay: number;
  highlightedItemId: string | null;
  onMarkerClick: (id: string) => void;
  flyToTarget: { lat: number; lng: number } | null;
}

export default function ItineraryMap({ items, activeDay, highlightedItemId, onMarkerClick, flyToTarget }: Props) {
  const validItems = useMemo(() => items.filter(hasValidCoords), [items]);

  const center = useMemo(() => {
    if (validItems.length === 0) return [48.8566, 2.3522] as [number, number];
    const avg = (vals: number[]) => vals.reduce((a, b) => a + b, 0) / vals.length;
    return [avg(validItems.map((i) => i.lat)), avg(validItems.map((i) => i.lng))] as [number, number];
  }, [validItems]);

  const handleMarkerClick = useCallback(
    (item: Item) => {
      onMarkerClick(item.id);
    },
    [onMarkerClick]
  );

  return (
    <MapContainer
      center={center}
      zoom={13}
      className="h-full w-full z-0"
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds items={validItems} />
      <FlyToMarker lat={flyToTarget?.lat ?? null} lng={flyToTarget?.lng ?? null} />
      {validItems.map((item) => (
        <Marker
          key={item.id}
          position={[item.lat, item.lng]}
          icon={createIcon(item.day_number, item.id === highlightedItemId)}
          eventHandlers={{ click: () => handleMarkerClick(item) }}
        >
          <Popup>
            <div className="text-sm">
              <p className="font-semibold">{item.title}</p>
              <p className="text-muted-foreground">{formatTime(item.time_slot)}</p>
              {item.estimated_duration_mins && (
                <p className="text-muted-foreground">{formatDuration(item.estimated_duration_mins)}</p>
              )}
              <p className="mt-1">{item.description}</p>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
