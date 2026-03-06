import { useState, useMemo } from "react";
import { Clock, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";

type Item = Tables<"itinerary_items">;

const TIME_SLOT_STYLES: Record<string, string> = {
  morning: "bg-blue-100 text-blue-700",
  afternoon: "bg-orange-100 text-orange-700",
  evening: "bg-purple-100 text-purple-700",
};

function slotStyle(slot: string) {
  const key = slot.toLowerCase();
  for (const [k, v] of Object.entries(TIME_SLOT_STYLES)) {
    if (key.includes(k)) return v;
  }
  return "bg-muted text-muted-foreground";
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

export function parseCostValue(costStr: string | null | undefined): number {
  if (!costStr || costStr.trim() === "" || costStr.toLowerCase() === "free") return 0;
  const cleaned = costStr
    .replace(/[₹$€£¥฿₩]/gi, "")
    .replace(/kr/gi, "")
    .replace(/,/g, "")
    .trim();
  // Handle ranges like "100-200" — take average
  if (cleaned.includes("-")) {
    const parts = cleaned.split("-");
    const low = parseFloat(parts[0].trim());
    const high = parseFloat(parts[1].trim());
    if (!isNaN(low) && !isNaN(high)) return (low + high) / 2;
  }
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

export function detectCurrencySymbol(items: any[]): string {
  for (const item of items) {
    const cost = (item as any).estimated_cost;
    if (cost && cost.toLowerCase() !== "free" && cost.trim() !== "") {
      const match = cost.match(/[₹$€£¥฿₩]/);
      if (match) return match[0];
    }
  }
  return "$";
}

interface Props {
  dayNumbers: number[];
  activeDay: number;
  onDayChange: (day: number) => void;
  items: Item[];
  allItems?: Item[];
  highlightedItemId: string | null;
  onItemClick: (id: string) => void;
  readOnly?: boolean;
  onItemDeleted?: (id: string) => void;
  budget?: string | null;
}

export default function DayCards({
  dayNumbers,
  activeDay,
  onDayChange,
  items,
  allItems,
  highlightedItemId,
  onItemClick,
  readOnly = false,
  onItemDeleted,
  budget,
}: Props) {
  const visibleItems = items;
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const budgetSummary = useMemo(() => {
    const source = allItems ?? items;
    console.log("All items count:", source.length);
    console.log("Items with costs:", source.map(i => i.estimated_cost));
    const totalCost = source.reduce((sum, i) => sum + parseCostValue(i.estimated_cost), 0);
    const currency = detectCurrencySymbol(source);
    console.log("Total calculated:", totalCost);
    console.log("Currency detected:", currency);
    const budgetNum = budget ? parseCostValue(budget) : NaN;
    const hasBudget = !isNaN(budgetNum) && budgetNum > 0;
    const remaining = hasBudget ? budgetNum - totalCost : 0;
    const totalDisplay = totalCost > 0 ? `${currency}${Math.round(totalCost).toLocaleString()}` : "calculating...";

    return { totalCost, currency, hasBudget, budgetNum, remaining, budgetRaw: budget, totalDisplay };
  }, [allItems, items, budget]);

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    console.log("Deleting item with id:", id);
    try {
      const { error } = await supabase
        .from("itinerary_items")
        .delete()
        .eq("id", id)
        .select("id");

      if (error) {
        console.error("Delete error:", error);
        toast.error(`Failed to remove: ${error.message}`);
        return;
      }

      toast.success("Activity removed");
      onItemDeleted?.(id);
    } catch (e: any) {
      console.error("Delete exception:", e);
      toast.error(`Failed to remove: ${e?.message}`);
    } finally {
      setDeletingId(null);
      setConfirmingId(null);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Day tabs */}
      <div className="flex gap-1 border-b border-border px-4 pt-3 pb-2 overflow-x-auto shrink-0">
        {dayNumbers.map((d) => (
          <button
            key={d}
            onClick={() => onDayChange(d)}
            className={`whitespace-nowrap rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
              activeDay === d
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            }`}
          >
            Day {d}
          </button>
        ))}
      </div>

      {/* Budget summary bar */}
      <div className="flex items-center justify-between gap-4 px-4 py-2 border-b border-border bg-muted/50 text-xs shrink-0 flex-wrap">
        {budgetSummary.hasBudget && (
          <span className="font-medium text-foreground">
            Budget: <strong className="text-primary">{budgetSummary.budgetRaw}</strong>
          </span>
        )}
        <span className="font-medium text-foreground">
          Estimated:{" "}
          <strong className="text-primary">{budgetSummary.totalDisplay}</strong>
        </span>
        {budgetSummary.hasBudget && budgetSummary.totalCost > 0 && (
          <span className={`font-medium ${budgetSummary.remaining >= 0 ? "text-emerald-600" : "text-destructive"}`}>
            Remaining: {budgetSummary.currency}{Math.abs(Math.round(budgetSummary.remaining)).toLocaleString()}
            {budgetSummary.remaining >= 0 ? " ✓" : " (over budget)"}
          </span>
        )}
      </div>

      {/* Activity cards */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {visibleItems.length === 0 && (
          <p className="text-center text-muted-foreground py-8">No activities for this day.</p>
        )}
        {visibleItems.map((item) => {
          console.log("Card cost:", item.estimated_cost);
          return (
            <div key={item.id} className="relative">
              <button
                onClick={() => onItemClick(item.id)}
                className={`w-full text-left rounded-lg border p-4 pb-10 transition-all ${
                  highlightedItemId === item.id
                    ? "border-primary bg-primary/5 shadow-md"
                    : "border-border bg-card hover:border-primary/30 hover:shadow-sm"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span
                        className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${slotStyle(item.time_slot)}`}
                      >
                        {formatTime(item.time_slot)}
                      </span>
                      {item.estimated_duration_mins && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {formatDuration(item.estimated_duration_mins)}
                        </span>
                      )}
                    </div>
                    <h3 className="font-semibold text-foreground leading-tight">{item.title}</h3>
                    <p className="text-sm text-muted-foreground mt-0.5">{item.place_name}</p>
                    <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                      {item.description}
                    </p>
                  </div>
                </div>
                {/* Cost badge */}
                {item.estimated_cost && (
                  <span
                    className={`absolute bottom-3 right-3 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                      item.estimated_cost.toLowerCase() === "free"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-teal-100 text-teal-700"
                    }`}
                  >
                    {item.estimated_cost}
                  </span>
                )}
              </button>

              {/* Trash icon — only on editable view */}
              {!readOnly && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmingId(confirmingId === item.id ? null : item.id);
                  }}
                  className="absolute top-3 right-3 p-1 rounded text-muted-foreground hover:text-destructive transition-colors z-10"
                  title="Remove activity"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}

              {/* Inline confirmation */}
              {confirmingId === item.id && (
                <div className="absolute top-3 right-3 z-20 bg-card border border-border rounded-lg shadow-lg p-3 flex flex-col items-center gap-2">
                  <p className="text-xs font-medium text-foreground whitespace-nowrap">Remove this activity?</p>
                  <div className="flex gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(item.id);
                      }}
                      disabled={deletingId === item.id}
                      className="px-3 py-1 text-xs font-medium rounded bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors disabled:opacity-50"
                    >
                      Yes
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmingId(null);
                      }}
                      className="px-3 py-1 text-xs font-medium rounded bg-muted text-muted-foreground hover:bg-accent transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
