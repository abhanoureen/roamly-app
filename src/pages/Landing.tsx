import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plane, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const INTERESTS = [
  "Culture",
  "Food",
  "Nature",
  "Nightlife",
  "Shopping",
  "Adventure",
  "Relaxation",
  "Art",
];

const DURATIONS = [3, 4, 5, 6, 7];

const Landing = () => {
  const navigate = useNavigate();
  const [destination, setDestination] = useState("");
  const [durationDays, setDurationDays] = useState(5);
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [budget, setBudget] = useState("");

  const toggleInterest = (interest: string) => {
    setSelectedInterests((prev) =>
      prev.includes(interest)
        ? prev.filter((i) => i !== interest)
        : [...prev, interest]
    );
  };

  const handleGenerate = () => {
    if (!destination.trim()) return;
    localStorage.setItem(
      "roamly_trip_input",
      JSON.stringify({
        destination: destination.trim(),
        duration_days: durationDays,
        interests: selectedInterests,
        budget: budget.trim() || null,
      })
    );
    navigate("/loading");
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background">
      {/* Hero */}
      <section className="flex flex-col items-center pt-16 pb-10 px-4 text-center">
        <div className="flex items-center gap-2 mb-4">
          <MapPin className="h-10 w-10 text-primary" />
          <h1 className="text-5xl font-extrabold tracking-tight text-foreground">
            Roam<span className="text-primary">ly</span>
          </h1>
        </div>
        <p className="max-w-md text-lg text-muted-foreground leading-relaxed">
          Your AI travel planner.
          <br />
          Plan a trip in minutes.
        </p>
      </section>

      {/* Form Card */}
      <section className="flex justify-center px-4 pb-20">
        <div className="w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-lg space-y-6">
          {/* Destination */}
          <div className="space-y-2">
            <Label htmlFor="destination">Destination</Label>
            <Input
              id="destination"
              placeholder="Paris, Tokyo, Bali…"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
            />
          </div>

          {/* Duration */}
          <div className="space-y-2">
            <Label>Duration (days)</Label>
            <div className="flex gap-1">
              {DURATIONS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDurationDays(d)}
                  className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
                    durationDays === d
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          {/* Interests */}
          <div className="space-y-2">
            <Label>Interests</Label>
            <div className="flex flex-wrap gap-2">
              {INTERESTS.map((interest) => {
                const active = selectedInterests.includes(interest);
                return (
                  <button
                    key={interest}
                    type="button"
                    onClick={() => toggleInterest(interest)}
                    className={`rounded-full px-3.5 py-1.5 text-sm font-medium border transition-colors ${
                      active
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-card text-muted-foreground border-border hover:border-primary/50"
                    }`}
                  >
                    {interest}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Budget */}
          <div className="space-y-2">
            <Label htmlFor="budget">Budget (optional)</Label>
            <Input
              id="budget"
              placeholder="e.g. $1500 or leave blank"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
            />
          </div>

          {/* Generate */}
          <Button
            className="w-full"
            size="lg"
            disabled={!destination.trim()}
            onClick={handleGenerate}
          >
            <Plane className="mr-2 h-5 w-5" />
            Generate Trip
          </Button>
        </div>
      </section>
    </div>
  );
};

export default Landing;
