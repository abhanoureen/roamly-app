import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function randomShareId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < 8; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

async function callAI(prompt: string, apiKey: string): Promise<string> {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`AI gateway error ${res.status}: ${t}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

function buildPrompt(destination: string, duration_days: number, interests: string[], budget: string | null): string {
  const perDay = budget && budget !== "none" ? ` Per day budget: approximately ${budget} / ${duration_days} days.` : "";
  const budgetRule = budget && budget !== "none"
    ? `BUDGET RULE: The user's total budget for this trip is ${budget}.${perDay} The total of all estimated_cost values across all days must NOT exceed ${budget}. Include at least 2 Free activities per day. Use real local price ranges for ${destination}. Prefer budget-friendly options if budget is low. Include premium experiences if budget is high.`
    : `BUDGET RULE: No specific budget. Suggest a balanced mix of free and paid activities. Use real local price ranges for ${destination}. Include at least 2 Free activities per day.`;

  return `You are an expert travel planner.
Destination: ${destination}
Days: ${duration_days}
Interests: ${interests.join(", ")}
Budget: ${budget || "none"}

${budgetRule}

STRICT LOCATION RULE: Every single activity, place_name, and restaurant must be physically located within the city limits of ${destination} only. Do NOT suggest places in nearby cities, neighboring states, or surrounding regions. Prioritize well-known neighborhoods and landmarks that are reachable within the same day. Never suggest activities that require overnight travel or are in a different city.

Return ONLY raw valid JSON, no markdown, no explanation, no code fences.
Every field is mandatory. Do not skip any field.
{
  "trip_name": "...",
  "destination": "...",
  "duration_days": ${duration_days},
  "budget": "${budget || "none"}",
  "days": [{
    "day": 1,
    "theme": "...",
    "activities": [{
      "time_slot": "09:00",
      "title": "...",
      "place_name": "...",
      "description": "... (max 30 words)",
      "estimated_duration_mins": 60,
      "estimated_cost": "REQUIRED string - use local currency e.g. 'Free', '₹500', '$15', '€10', '฿200'. NEVER null. NEVER empty. If free write 'Free'. If unsure give a realistic estimate."
    }]
  }]
}
3-6 activities per day. Descriptions under 30 words. Prefer geographic grouping by neighborhood.
IMPORTANT: Every activity MUST have a non-empty estimated_cost string. Never omit it.`;
}

function parseJSON(raw: string): any {
  let cleaned = raw.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/, "").replace(/```\s*$/, "").trim();
  }
  return JSON.parse(cleaned);
}

function isValidCoord(lat: number, lng: number): boolean {
  if (lat === 0 && lng === 0) return false;
  if (Math.abs(lat) < 1 && Math.abs(lng) < 1) return false;
  return true;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function geocodeDestinationCenter(destination: string): Promise<{ lat: number; lng: number } | null> {
  const q = encodeURIComponent(destination);
  const url = `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "roamly-app" } });
    const data = await res.json();
    if (data.length > 0) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    }
  } catch (e) {
    console.error("Destination center geocode error:", e);
  }
  return null;
}

async function detectCountryCode(destination: string): Promise<string | null> {
  const q = encodeURIComponent(destination);
  const url = `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1&addressdetails=1`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "roamly-app" } });
    const data = await res.json();
    if (data.length > 0) {
      return data[0].address?.country_code || null;
    }
  } catch (e) {
    console.error("Country code detection error:", e);
  }
  return null;
}

async function nominatimSearch(query: string, countryCode: string | null): Promise<{ lat: number; lng: number } | null> {
  const q = encodeURIComponent(query);
  let url = `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`;
  if (countryCode) url += `&countrycodes=${countryCode}`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "roamly-app" } });
    const data = await res.json();
    if (data.length > 0) {
      const lat = parseFloat(data[0].lat);
      const lng = parseFloat(data[0].lon);
      if (isValidCoord(lat, lng)) return { lat, lng };
    }
  } catch (e) {
    console.error("Geocode error for", query, e);
  }
  return null;
}

async function geocodeWithFallback(placeName: string, title: string, destination: string, countryCode: string | null): Promise<{ lat: number; lng: number } | null> {
  let result = await nominatimSearch(`${placeName}, ${destination}`, countryCode);
  if (result) return result;
  await sleep(1100);
  result = await nominatimSearch(placeName, countryCode);
  if (result) return result;
  await sleep(1100);
  result = await nominatimSearch(`${title}, ${destination}`, countryCode);
  return result;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function replaceFailedGeocodes(
  supabase: any,
  tripId: string,
  destination: string,
  interests: string[],
  countryCode: string | null,
  destCenter: { lat: number; lng: number } | null,
  apiKey: string
) {
  const { data: failedItems } = await supabase
    .from("itinerary_items")
    .select("*")
    .eq("trip_id", tripId)
    .eq("lat", 0)
    .eq("lng", 0);

  if (!failedItems || failedItems.length === 0) return;

  const failedCount = failedItems.length;
  console.log(`Found ${failedCount} items with failed geocodes, attempting replacement...`);

  const { data: allItems } = await supabase
    .from("itinerary_items")
    .select("title")
    .eq("trip_id", tripId);

  const existingTitles = (allItems ?? []).map((i: any) => i.title);

  const failedByDay = failedItems.map((i: any) => ({
    id: i.id,
    day_number: i.day_number,
    time_slot: i.time_slot,
  }));

  const prompt = `You are an expert travel planner.
The destination is ${destination}.
We need exactly ${failedCount} replacement activities.
The trip interests are: ${interests.join(", ")}.
The existing activities in the itinerary are: ${existingTitles.join(", ")}.

Generate exactly ${failedCount} NEW activities that are different from the existing ones.
Each activity must be a real, well-known place physically located within ${destination} city only.
Use only famous, easily findable landmarks, restaurants, or attractions that geocoding can reliably find.

Here are the day/time slots to fill: ${JSON.stringify(failedByDay.map((f: any) => ({ day_number: f.day_number, time_slot: f.time_slot })))}

Return ONLY raw valid JSON, no markdown:
{
  "activities": [${failedByDay.map((f: any) => `{
    "day_number": ${f.day_number},
    "time_slot": "${f.time_slot}",
    "title": "...",
    "place_name": "...",
    "description": "... (under 30 words)",
    "estimated_duration_mins": 60,
    "estimated_cost": "Free" or "$10" etc.
  }`).join(",")}]
}`;

  try {
    let rawText = await callAI(prompt, apiKey);
    let replacements: any;
    try {
      replacements = parseJSON(rawText);
    } catch {
      rawText = await callAI("Return ONLY the raw JSON object, nothing else.\n\n" + prompt, apiKey);
      replacements = parseJSON(rawText);
    }

    let replacedCount = 0;
    const activities = replacements.activities ?? [];

    for (let i = 0; i < Math.min(activities.length, failedItems.length); i++) {
      const act = activities[i];
      const failedItem = failedItems[i];

      const coords = await geocodeWithFallback(act.place_name, act.title, destination, countryCode);
      await sleep(1100);

      if (coords) {
        if (destCenter && haversineKm(destCenter.lat, destCenter.lng, coords.lat, coords.lng) > 50) {
          console.log(`Replacement ${act.place_name} rejected: too far from center`);
          continue;
        }

        await supabase.from("itinerary_items").delete().eq("id", failedItem.id);
        await supabase.from("itinerary_items").insert({
          trip_id: tripId,
          day_number: act.day_number || failedItem.day_number,
          time_slot: act.time_slot || failedItem.time_slot,
          title: act.title,
          place_name: act.place_name,
          description: act.description,
          estimated_duration_mins: act.estimated_duration_mins ?? 60,
          estimated_cost: act.estimated_cost ?? null,
          activity_type: "sightseeing",
          lat: coords.lat,
          lng: coords.lng,
        });
        replacedCount++;
      }
    }

    console.log(`Replaced ${replacedCount} failed geocodes with valid alternatives`);
  } catch (e) {
    console.error("Failed geocode replacement error:", e);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { destination, duration_days, interests, budget } = await req.json();

    if (!destination || !duration_days) {
      return new Response(JSON.stringify({ error: "destination and duration_days are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const countryCode = await detectCountryCode(destination);
    console.log("Detected country code:", countryCode, "for", destination);
    await sleep(1100);

    const destCenter = await geocodeDestinationCenter(destination);
    console.log("Destination center:", destCenter);
    await sleep(1100);

    const prompt = buildPrompt(destination, duration_days, interests ?? [], budget);
    let rawText = await callAI(prompt, LOVABLE_API_KEY);
    let itinerary: any;

    try {
      itinerary = parseJSON(rawText);
    } catch {
      console.log("First parse failed, retrying...");
      rawText = await callAI("Return ONLY the raw JSON object, nothing else.\n\n" + prompt, LOVABLE_API_KEY);
      itinerary = parseJSON(rawText);
    }

    // Store budget in raw JSON
    if (budget) {
      itinerary.budget = budget;
    }

    // Validate estimated_cost on every activity
    for (const day of itinerary.days ?? []) {
      for (const act of day.activities ?? []) {
        console.log("Activity:", act.title, "Cost:", act.estimated_cost);
        if (!act.estimated_cost || 
            String(act.estimated_cost).trim() === "" ||
            act.estimated_cost === "null" ||
            act.estimated_cost === "undefined") {
          act.estimated_cost = "Free";
        }
      }
    }
    console.log("Validated itinerary costs:", JSON.stringify(itinerary.days?.map((d: any) => d.activities?.map((a: any) => ({ t: a.title, c: a.estimated_cost })))));

    const share_id = randomShareId();

    const { data: tripData, error: tripError } = await supabase
      .from("trips")
      .insert({
        name: itinerary.trip_name || `Trip to ${destination}`,
        destination,
        duration_days,
        interests,
        raw_itinerary_json: itinerary,
        is_public: true,
        share_id,
      })
      .select("id")
      .single();

    if (tripError) throw new Error(`Trip insert error: ${tripError.message}`);
    const trip_id = tripData.id;

    const items: any[] = [];
    for (const day of itinerary.days ?? []) {
      for (const act of day.activities ?? []) {
        items.push({
          trip_id,
          day_number: day.day,
          time_slot: act.time_slot,
          title: act.title,
          place_name: act.place_name,
          description: act.description,
          estimated_duration_mins: act.estimated_duration_mins ?? 60,
          estimated_cost: act.estimated_cost ?? "Free",
          activity_type: "sightseeing",
          lat: 0,
          lng: 0,
        });
      }
    }
    console.log("Inserting items with costs:", items.map(i => ({ title: i.title, cost: i.estimated_cost })));

    const { data: insertedItems, error: itemsError } = await supabase
      .from("itinerary_items")
      .insert(items)
      .select("id, place_name, title");

    if (itemsError) throw new Error(`Items insert error: ${itemsError.message}`);

    for (const item of insertedItems ?? []) {
      const coords = await geocodeWithFallback(item.place_name, item.title, destination, countryCode);
      if (coords) {
        if (destCenter && haversineKm(destCenter.lat, destCenter.lng, coords.lat, coords.lng) > 50) {
          console.log(`Rejected ${item.place_name}: ${haversineKm(destCenter.lat, destCenter.lng, coords.lat, coords.lng).toFixed(1)}km from center`);
        } else {
          await supabase
            .from("itinerary_items")
            .update({ lat: coords.lat, lng: coords.lng })
            .eq("id", item.id);
        }
      }
      await sleep(1100);
    }

    await replaceFailedGeocodes(supabase, trip_id, destination, interests ?? [], countryCode, destCenter, LOVABLE_API_KEY);

    return new Response(JSON.stringify({ trip_id, itinerary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-trip error:", e);
    const status = e instanceof Error && e.message.includes("429") ? 429 : 
                   e instanceof Error && e.message.includes("402") ? 402 : 500;
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
