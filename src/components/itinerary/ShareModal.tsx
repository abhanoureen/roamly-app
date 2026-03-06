import { X, Copy, Check } from "lucide-react";
import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";

interface Props {
  open: boolean;
  onClose: () => void;
  shareUrl: string;
}

export default function ShareModal({ open, onClose, shareUrl }: Props) {
  const [copied, setCopied] = useState(false);

  if (!open) return null;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-50" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md flex flex-col animate-in fade-in zoom-in-95 duration-200">
          <div className="flex items-center justify-between p-5 border-b border-border">
            <h2 className="text-lg font-bold text-foreground">Share Trip</h2>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="p-5 space-y-5">
            <div className="flex gap-2">
              <input
                readOnly
                value={shareUrl}
                className="flex-1 rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground truncate"
              />
              <Button variant="outline" size="sm" onClick={handleCopy} className="shrink-0">
                {copied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>

            <div className="flex justify-center">
              <div className="bg-white p-4 rounded-lg">
                <QRCodeSVG value={shareUrl} size={180} />
              </div>
            </div>
          </div>

          <div className="p-5 border-t border-border">
            <Button onClick={onClose} variant="outline" className="w-full">
              Close
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
