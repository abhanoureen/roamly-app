import { useState } from "react";
import { X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";

const QUICK_ACTIONS = [
  "Add more food spots",
  "Remove museums",
  "Make day 2 more relaxed",
  "Add a morning walk",
  "Focus on local experiences",
  "Add a hidden gem",
  "Add a sunset activity",
  "Add a local market visit",
  "Add a coffee shop stop",
  "Replace expensive activities",
  "Add free activities only",
  "Add outdoor activities",
];

const ACTIVITY_TYPES = [
  { emoji: "🍽️", label: "Food & Dining" },
  { emoji: "🏛️", label: "Culture & History" },
  { emoji: "🌿", label: "Nature & Outdoors" },
  { emoji: "🎨", label: "Art & Museums" },
  { emoji: "🛍️", label: "Shopping" },
  { emoji: "🎉", label: "Nightlife" },
  { emoji: "🧘", label: "Relaxation" },
  { emoji: "⚡", label: "Adventure" },
  { emoji: "☕", label: "Cafes" },
  { emoji: "🎭", label: "Entertainment" },
];

const VIBES = [
  { emoji: "🌅", label: "Slow & relaxed" },
  { emoji: "🔥", label: "Action packed" },
  { emoji: "💰", label: "Budget friendly" },
  { emoji: "💎", label: "Luxury" },
  { emoji: "👨‍👩‍👧", label: "Family friendly" },
  { emoji: "🧍", label: "Solo explorer" },
  { emoji: "👫", label: "Romantic" },
  { emoji: "🥾", label: "Off the beaten path" },
];

interface Props {
  tripId: string;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function EditPanel({ tripId, open, onClose, onSuccess }: Props) {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
  const [selectedVibes, setSelectedVibes] = useState<Set<string>>(new Set());

  if (!open) return null;

  const toggleSet = (set: Set<string>, value: string, setter: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    setter(next);
  };

  const handleApply = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setError(null);

    // Assemble final prompt
    let finalPrompt = prompt.trim();
    if (selectedTypes.size > 0) {
      finalPrompt += `. Focus on: ${Array.from(selectedTypes).join(", ")}`;
    }
    if (selectedVibes.size > 0) {
      finalPrompt += `. Vibe: ${Array.from(selectedVibes).join(", ")}`;
    }

    try {
      const { data, error: fnErr } = await supabase.functions.invoke("edit-trip", {
        body: { trip_id: tripId, edit_prompt: finalPrompt },
      });

      if (fnErr) throw fnErr;
      if (data?.error) throw new Error(data.error);

      setPrompt("");
      setSelectedTypes(new Set());
      setSelectedVibes(new Set());
      onSuccess();
    } catch (e: any) {
      setError(e?.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />

      {/* Panel */}
      <div className="fixed right-0 top-0 h-full w-full max-w-md bg-card border-l border-border z-50 flex flex-col shadow-xl animate-in slide-in-from-right duration-300">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">Edit your itinerary</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          <Textarea
            placeholder="What would you like to change?"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="min-h-[100px] resize-none"
          />

          {/* Section A — Quick actions */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Quick actions</p>
            <div className="flex flex-wrap gap-2">
              {QUICK_ACTIONS.map((chip) => (
                <button
                  key={chip}
                  onClick={() => setPrompt(chip)}
                  className="px-3 py-1.5 text-xs rounded-full border border-border bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>

          {/* Section B — Activity type */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Type of activity</p>
            <div className="flex flex-wrap gap-2">
              {ACTIVITY_TYPES.map(({ emoji, label }) => (
                <button
                  key={label}
                  onClick={() => toggleSet(selectedTypes, label, setSelectedTypes)}
                  className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                    selectedTypes.has(label)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  }`}
                >
                  {emoji} {label}
                </button>
              ))}
            </div>
          </div>

          {/* Section C — Vibe */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Vibe</p>
            <div className="flex flex-wrap gap-2">
              {VIBES.map(({ emoji, label }) => (
                <button
                  key={label}
                  onClick={() => toggleSet(selectedVibes, label, setSelectedVibes)}
                  className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                    selectedVibes.has(label)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  }`}
                >
                  {emoji} {label}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <p className="text-sm text-destructive bg-destructive/10 rounded-md p-3">{error}</p>
          )}
        </div>

        <div className="p-4 border-t border-border">
          <Button
            onClick={handleApply}
            disabled={loading || !prompt.trim()}
            className="w-full bg-primary hover:bg-primary/90"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Updating…
              </>
            ) : (
              "Apply"
            )}
          </Button>
        </div>
      </div>
    </>
  );
}
