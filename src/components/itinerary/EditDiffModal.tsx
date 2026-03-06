import { useEffect } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface DiffEntry {
  type: "added" | "removed" | "updated";
  title: string;
  dayNumber: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  changes: DiffEntry[];
}

const ICONS: Record<DiffEntry["type"], string> = {
  added: "✓",
  removed: "✗",
  updated: "✎",
};

const LABELS: Record<DiffEntry["type"], string> = {
  added: "Added",
  removed: "Removed",
  updated: "Updated",
};

const STYLES: Record<DiffEntry["type"], string> = {
  added: "text-primary",
  removed: "text-destructive",
  updated: "text-accent-foreground bg-accent/20",
};

const LINE_STYLES: Record<DiffEntry["type"], string> = {
  added: "border-l-4 border-primary bg-primary/5",
  removed: "border-l-4 border-destructive bg-destructive/5",
  updated: "border-l-4 border-accent bg-accent/5",
};

export default function EditDiffModal({ open, onClose, changes }: Props) {
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(onClose, 8000);
    return () => clearTimeout(timer);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-50" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
          <div className="flex items-center justify-between p-5 border-b border-border">
            <h2 className="text-lg font-bold text-foreground">Itinerary Updated</h2>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-2">
            {changes.length === 0 && (
              <p className="text-muted-foreground text-sm text-center py-4">No changes detected.</p>
            )}
            {changes.map((c, i) => (
              <div key={i} className={`rounded-lg px-4 py-3 ${LINE_STYLES[c.type]}`}>
                <span className={`font-semibold text-sm ${STYLES[c.type]}`}>
                  {ICONS[c.type]} {LABELS[c.type]}:
                </span>{" "}
                <span className="text-sm text-foreground">{c.title}</span>
                <span className="text-xs text-muted-foreground ml-2">— Day {c.dayNumber}</span>
              </div>
            ))}
          </div>

          <div className="p-5 border-t border-border">
            <Button onClick={onClose} className="w-full">
              Got it
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
