import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const MESSAGES = [
  "Mapping your days…",
  "Finding the best spots…",
  "Grouping by neighborhood…",
  "Building your itinerary…",
  "Almost ready…",
];

const Loading = () => {
  const navigate = useNavigate();
  const [msgIndex, setMsgIndex] = useState(0);
  const [error, setError] = useState(false);
  const called = useRef(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setMsgIndex((i) => (i + 1) % MESSAGES.length);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (called.current) return;
    called.current = true;

    const raw = localStorage.getItem("roamly_trip_input");
    if (!raw) {
      navigate("/");
      return;
    }

    const input = JSON.parse(raw);

    supabase.functions
      .invoke("generate-trip", { body: input })
      .then(({ data, error: fnError }) => {
        if (fnError || !data?.trip_id) {
          console.error("generate-trip error:", fnError, data);
          setError(true);
          return;
        }
        localStorage.removeItem("roamly_trip_input");
        navigate(`/itinerary/${data.trip_id}`);
      })
      .catch((err) => {
        console.error("generate-trip exception:", err);
        setError(true);
      });
  }, [navigate]);

  if (error) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center gap-4 bg-background px-4">
        <p className="text-lg font-medium text-destructive">Something went wrong</p>
        <Button variant="outline" onClick={() => navigate("/")}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center gap-6 bg-background px-4">
      <Loader2 className="h-14 w-14 animate-spin text-primary" />
      <p className="text-lg font-medium text-muted-foreground animate-pulse">
        {MESSAGES[msgIndex]}
      </p>
    </div>
  );
};

export default Loading;
