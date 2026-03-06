import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Pencil, Download, Share2, MapPin, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import ItineraryMap from "@/components/itinerary/ItineraryMap";
import DayCards from "@/components/itinerary/DayCards";
import EditPanel from "@/components/itinerary/EditPanel";
import EditDiffModal, { type DiffEntry } from "@/components/itinerary/EditDiffModal";
import ShareModal from "@/components/itinerary/ShareModal";
import type { Tables } from "@/integrations/supabase/types";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

type Trip = Tables<"trips">;
type Item = Tables<"itinerary_items">;

function hasValidCoords(item: Item) {
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

function computeDiff(oldItems: Item[], newItems: Item[]): DiffEntry[] {
  const changes: DiffEntry[] = [];
  const oldSet = new Map(oldItems.map((i) => [`${i.title}::${i.day_number}`, i]));
  const newSet = new Map(newItems.map((i) => [`${i.title}::${i.day_number}`, i]));

  for (const [key, item] of newSet) {
    if (!oldSet.has(key)) {
      changes.push({ type: "added", title: item.title, dayNumber: item.day_number });
    } else {
      const old = oldSet.get(key)!;
      if (old.description !== item.description || old.time_slot !== item.time_slot || old.place_name !== item.place_name) {
        changes.push({ type: "updated", title: item.title, dayNumber: item.day_number });
      }
    }
  }

  for (const [key, item] of oldSet) {
    if (!newSet.has(key)) {
      changes.push({ type: "removed", title: item.title, dayNumber: item.day_number });
    }
  }

  return changes;
}

const Itinerary = () => {
  const { tripId } = useParams<{ tripId: string }>();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeDay, setActiveDay] = useState(1);
  const [highlightedItemId, setHighlightedItemId] = useState<string | null>(null);
  const [flyToTarget, setFlyToTarget] = useState<{ lat: number; lng: number } | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const pdfRef = useRef<HTMLDivElement>(null);

  // Diff modal state
  const [diffChanges, setDiffChanges] = useState<DiffEntry[]>([]);
  const [diffOpen, setDiffOpen] = useState(false);
  const itemsBeforeEditRef = useRef<Item[]>([]);

  // Share modal state
  const [shareOpen, setShareOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState("");

  const fetchData = useCallback(async () => {
    if (!tripId) return;
    const [tripRes, itemsRes] = await Promise.all([
      supabase.from("trips").select("*").eq("id", tripId).single(),
      supabase
        .from("itinerary_items")
        .select("*")
        .eq("trip_id", tripId)
        .order("day_number", { ascending: true })
        .order("time_slot", { ascending: true }),
    ]);

    if (tripRes.error || !tripRes.data) {
      console.error("Trip fetch error:", tripRes.error);
      setLoading(false);
      return;
    }

    setTrip(tripRes.data);
    setItems(itemsRes.data ?? []);
    setLoading(false);
    return itemsRes.data ?? [];
  }, [tripId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleItemClick = (id: string) => {
    setHighlightedItemId(id);
    const item = items.find((i) => i.id === id);
    if (item && hasValidCoords(item)) {
      setFlyToTarget({ lat: item.lat, lng: item.lng });
    }
  };

  const handleMarkerClick = (id: string) => {
    setHighlightedItemId(id);
    const item = items.find((i) => i.id === id);
    if (item && hasValidCoords(item)) {
      setFlyToTarget({ lat: item.lat, lng: item.lng });
    }
  };

  const handleEditStart = () => {
    itemsBeforeEditRef.current = [...items];
    setEditOpen(true);
  };

  const handleEditSuccess = async () => {
    setEditOpen(false);
    toast.success("Itinerary updated ✓");
    setLoading(true);
    const newItems = await fetchData();
    if (newItems) {
      const diff = computeDiff(itemsBeforeEditRef.current, newItems);
      if (diff.length > 0) {
        setDiffChanges(diff);
        setDiffOpen(true);
      }
    }
  };

  const handleShare = async () => {
    if (!tripId) return;
    try {
      const { data, error } = await supabase.functions.invoke("share-trip", {
        body: { trip_id: tripId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const url = data.share_url;
      await navigator.clipboard.writeText(url);
      toast.success("Link copied! Anyone with this link can view your trip.");
      setShareUrl(url);
      setShareOpen(true);
    } catch (e: any) {
      toast.error(`Failed to share: ${e?.message}`);
    }
  };

  const dayNumbers = useMemo(() => {
    const set = new Set(items.map((i) => i.day_number));
    return Array.from(set).sort((a, b) => a - b);
  }, [items]);

  const activeDayItems = useMemo(
    () => items.filter((i) => i.day_number === activeDay),
    [items, activeDay]
  );

  const itemsByDay = useMemo(() => {
    const map = new Map<number, Item[]>();
    for (const item of items) {
      if (!hasValidCoords(item)) continue;
      const list = map.get(item.day_number) ?? [];
      list.push(item);
      map.set(item.day_number, list);
    }
    return map;
  }, [items]);

  const handleExportPdf = async () => {
    if (!pdfRef.current || !trip) return;
    setExporting(true);
    try {
      const canvas = await html2canvas(pdfRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
      });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pageWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft > 0) {
        position -= pageHeight;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      const filename = `roamly-${trip.destination.toLowerCase().replace(/\s+/g, "-")}-itinerary.pdf`;
      pdf.save(filename);
      toast.success("PDF downloaded ✓");
    } catch (e) {
      console.error("PDF export error:", e);
      toast.error("Failed to export PDF");
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center gap-4">
        <p className="text-lg font-medium text-destructive">Trip not found</p>
        <Button variant="outline" asChild>
          <Link to="/">Go home</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      <header className="flex items-center justify-between border-b border-border bg-card px-4 py-3 shrink-0">
        <div>
          <h1 className="text-xl font-bold text-foreground">{trip.name}</h1>
          <p className="text-sm text-muted-foreground flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" />
            {trip.destination} · {trip.duration_days} days
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleEditStart}>
            <Pencil className="mr-1.5 h-4 w-4" />
            <span className="hidden sm:inline">Edit with AI</span>
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportPdf} disabled={exporting}>
            {exporting ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                <span className="hidden sm:inline">Generating…</span>
              </>
            ) : (
              <>
                <Download className="mr-1.5 h-4 w-4" />
                <span className="hidden sm:inline">Export PDF</span>
              </>
            )}
          </Button>
          <Button variant="outline" size="sm" onClick={handleShare}>
            <Share2 className="mr-1.5 h-4 w-4" />
            <span className="hidden sm:inline">Share Link</span>
          </Button>
        </div>
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
            onItemDeleted={(id) => setItems((prev) => prev.filter((i) => i.id !== id))}
            budget={trip.raw_itinerary_json ? (trip.raw_itinerary_json as any).budget ?? (trip as any).budget : null}
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

      {/* Hidden PDF export target */}
      {(() => {
        const allCosts = items.reduce((sum, i) => {
          const c = i.estimated_cost;
          if (!c || c.toLowerCase() === "free") return sum;
          const cleaned = c.replace(/[₹$€£¥฿₩]/g, "").replace(/[a-zA-Z]/g, "").replace(/,/g, "").trim();
          const num = parseFloat(cleaned);
          return sum + (isNaN(num) ? 0 : num);
        }, 0);
        const currency = items.find(i => {
          const c = i.estimated_cost;
          return c && c.toLowerCase() !== "free";
        });
        const sym = currency ? (currency.estimated_cost?.match(/[₹$€£¥฿₩]/)?.[0] ?? "$") : "$";
        const rawBudget = trip.raw_itinerary_json ? (trip.raw_itinerary_json as any).budget : null;
        return (
      <div
        ref={pdfRef}
        style={{
          position: "absolute",
          left: "-9999px",
          top: 0,
          width: "800px",
          backgroundColor: "#ffffff",
          padding: "40px",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        <div style={{ marginBottom: "24px" }}>
          <h1 style={{ fontSize: "28px", fontWeight: "bold", color: "#0d9488", margin: 0 }}>
            Roamly
          </h1>
          <p style={{ fontSize: "16px", color: "#374151", marginTop: "8px" }}>
            {trip.name} · {trip.destination} · {trip.duration_days} days
          </p>
        </div>
        <div style={{ marginBottom: "20px", padding: "12px 16px", backgroundColor: "#f0fdfa", borderRadius: "8px", display: "flex", gap: "24px", fontSize: "14px" }}>
          {rawBudget && (
            <span style={{ color: "#0d9488", fontWeight: 600 }}>Budget: {rawBudget}</span>
          )}
          <span style={{ color: "#0d9488", fontWeight: 600 }}>Estimated Cost: {sym}{allCosts.toLocaleString()}</span>
        </div>
        {Array.from(itemsByDay.entries())
          .sort(([a], [b]) => a - b)
          .map(([day, dayItems]) => {
            const raw = trip.raw_itinerary_json as any;
            const theme = raw?.days?.find((d: any) => d.day === day)?.theme;
            return (
              <div key={day} style={{ marginBottom: "28px" }}>
                <h2
                  style={{
                    fontSize: "18px",
                    fontWeight: "bold",
                    color: "#0d9488",
                    borderBottom: "2px solid #0d9488",
                    paddingBottom: "6px",
                    marginBottom: "12px",
                  }}
                >
                  Day {day}{theme ? ` — ${theme}` : ""}
                </h2>
                {dayItems.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      display: "flex",
                      gap: "16px",
                      padding: "8px 0",
                      borderBottom: "1px solid #e5e7eb",
                      fontSize: "14px",
                    }}
                  >
                    <span style={{ color: "#0d9488", fontWeight: 600, minWidth: "80px" }}>
                      {formatTime(item.time_slot)}
                    </span>
                    <span style={{ fontWeight: 600, minWidth: "180px" }}>{item.title}</span>
                    <span style={{ color: "#6b7280", flex: 1 }}>
                      {item.description}
                      {item.estimated_duration_mins
                        ? ` (${formatDuration(item.estimated_duration_mins)})`
                        : ""}
                    </span>
                    {item.estimated_cost && (
                      <span style={{ color: "#0d9488", fontWeight: 600, minWidth: "60px", textAlign: "right" }}>
                        {item.estimated_cost}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            );
          })}
      </div>
        );
      })()}

      <EditPanel
        tripId={tripId!}
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onSuccess={handleEditSuccess}
      />

      <EditDiffModal
        open={diffOpen}
        onClose={() => setDiffOpen(false)}
        changes={diffChanges}
      />

      <ShareModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        shareUrl={shareUrl}
      />
    </div>
  );
};

export default Itinerary;
