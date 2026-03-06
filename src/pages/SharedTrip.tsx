import { useEffect, useState, useMemo, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { MapPin, Loader2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import ItineraryMap from "@/components/itinerary/ItineraryMap";
import DayCards from "@/components/itinerary/DayCards";
import type { Tables } from "@/integrations/supabase/types";

type Trip = Tables<"trips">;
type Item = Tables<"itinerary_items">;

function hasValidCoords(item: Item) {
  return item.lat != null && item.lng != null && !(item.lat === 0 && item.lng === 0);
}

const SharedTrip = () => {
  const { shareId } = useParams<{ shareId: string }>();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [activeDay, setActiveDay] = useState(1);
  const [highlightedItemId, setHighlightedItemId] = useState<string | null>(null);
  const [flyToTarget, setFlyToTarget] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (!shareId) return;
    (async () => {
      const { data: tripData, error: tripErr } = await supabase
        .from("trips")
        .select("*")
        .eq("share_id", shareId)
        .eq("is_public", true)
        .single();

      if (tripErr || !tripData) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      const { data: itemsData } = await supabase
        .from("itinerary_items")
        .select("*")
        .eq("trip_id", tripData.id)
        .order("day_number", { ascending: true })
        .order("time_slot", { ascending: true });

      setTrip(tripData);
      setItems(itemsData ?? []);
      setLoading(false);
    })();
  }, [shareId]);

  const handleItemClick = useCallback((id: string) => {
    setHighlightedItemId(id);
    const item = items.find((i) => i.id === id);
    if (item && hasValidCoords(item)) {
      setFlyToTarget({ lat: item.lat, lng: item.lng });
    }
  }, [items]);

  const handleMarkerClick = useCallback((id: string) => {
    setHighlightedItemId(id);
    const item = items.find((i) => i.id === id);
    if (item && hasValidCoords(item)) {
      setFlyToTarget({ lat: item.lat, lng: item.lng });
    }
  }, [items]);

  const dayNumbers = useMemo(() => {
    const set = new Set(items.map((i) => i.day_number));
    return Array.from(set).sort((a, b) => a - b);
  }, [items]);

  const activeDayItems = useMemo(
    () => items.filter((i) => i.day_number === activeDay),
    [items, activeDay]
  );

  if (loading) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  if (notFound || !trip) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center gap-4">
        <p className="text-lg font-medium text-destructive">This trip is not available</p>
        <Button asChild>
          <Link to="/">
            Plan your own trip <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Sticky teal banner */}
      <header className="flex items-center justify-between bg-primary px-4 py-2.5 shrink-0">
        <p className="text-primary-foreground text-sm font-medium flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5" />
          Viewing {trip.destination} trip · {trip.duration_days} days
        </p>
        <Button size="sm" variant="secondary" asChild>
          <Link to="/">
            Plan your own <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
          </Link>
        </Button>
      </header>

      <div className="flex flex-1 flex-col md:flex-row overflow-hidden">
        <div className="order-1 md:order-2 md:w-1/2 overflow-y-auto border-l border-border bg-background">
          <DayCards
            dayNumbers={dayNumbers}
            activeDay={activeDay}
            onDayChange={setActiveDay}
            items={activeDayItems}
            allItems={items}
            highlightedItemId={highlightedItemId}
            onItemClick={handleItemClick}
            readOnly
            budget={trip.raw_itinerary_json ? (trip.raw_itinerary_json as any).budget : null}
          />
        </div>

        <div className="order-2 md:order-1 md:w-1/2 h-64 md:h-full">
          <ItineraryMap
            items={items}
            activeDay={activeDay}
            highlightedItemId={highlightedItemId}
            onMarkerClick={handleMarkerClick}
            flyToTarget={flyToTarget}
          />
        </div>
      </div>
    </div>
  );
};

export default SharedTrip;
