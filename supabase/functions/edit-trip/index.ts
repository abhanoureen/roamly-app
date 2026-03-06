import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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
    if (data.length > 0) return data[0].address?.country_code || null;
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

function detectDayNumber(prompt: string): number | null {
  const match = prompt.match(/\bday\s*(\d+)\b/i);
  return match ? parseInt(match[1], 10) : null;
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
    const { trip_id, edit_prompt } = await req.json();

    if (!trip_id || !edit_prompt) {
      return new Response(JSON.stringify({ error: "trip_id and edit_prompt are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: trip, error: tripErr } = await supabase
      .from("trips")
      .select("*")
      .eq("id", trip_id)
      .single();

    if (tripErr || !trip) throw new Error("Trip not found");

    const countryCode = await detectCountryCode(trip.destination);
    console.log("Detected country code:", countryCode, "for", trip.destination);
    await sleep(1100);

    const destCenter = await geocodeDestinationCenter(trip.destination);
    console.log("Destination center:", destCenter);
    await sleep(1100);

    const { data: currentItems } = await supabase
      .from("itinerary_items")
      .select("*")
      .eq("trip_id", trip_id)
      .order("day_number")
      .order("time_slot");

    const targetDay = detectDayNumber(edit_prompt);
    console.log("Target day detected:", targetDay);

    const contextItems = targetDay
      ? (currentItems ?? []).filter((i: any) => i.day_number === targetDay)
      : (currentItems ?? []);

    const currentJson = JSON.stringify(
      contextItems.map((i: any) => ({
        day: i.day_number,
        time_slot: i.time_slot,
        title: i.title,
        place_name: i.place_name,
        description: i.description,
        estimated_duration_mins: i.estimated_duration_mins,
        estimated_cost: i.estimated_cost,
      }))
    );

    const dayInstruction = targetDay
      ? `Only return activities for day ${targetDay}. Return the "days" array with a single entry for day ${targetDay}.`
      : `Return ALL days in the itinerary.`;

    const budgetInfo = trip.raw_itinerary_json ? (trip.raw_itinerary_json as any).budget : null;
    const budgetRule = budgetInfo && budgetInfo !== "none"
      ? `BUDGET RULE: The user's total budget is ${budgetInfo}. Keep activities within this budget. For each activity, estimate a realistic cost in local currency.`
      : `For each activity, estimate a realistic cost in local currency. Use "Free" for free activities.`;

    const prompt = `You are an expert travel planner. Here is the current itinerary for a trip to ${trip.destination} (${trip.duration_days} days):

${currentJson}

The user wants this change: "${edit_prompt}"

${dayInstruction}

${budgetRule}

STRICT LOCATION RULE: Every single activity, place_name, and restaurant must be physically located within the city limits of ${trip.destination} only. Do NOT suggest places in nearby cities, neighboring states, or surrounding regions. Prioritize well-known neighborhoods and landmarks that are reachable within the same day. Never suggest activities that require overnight travel or are in a different city.

Return ONLY raw valid JSON, no markdown, no explanation:
{
  "days": [{
    "day": ${targetDay || 1},
    "activities": [{
      "time_slot": "09:00",
      "title": "...",
      "place_name": "...",
      "description": "...",
      "estimated_duration_mins": 60,
      "estimated_cost": "Free" or "$15" etc.
    }]
  }]
}
Keep all unchanged activities. Only modify what the user asked for. Descriptions under 30 words.`;

    let rawText = await callAI(prompt, LOVABLE_API_KEY);
    let updated: any;

    try {
      updated = parseJSON(rawText);
    } catch {
      rawText = await callAI("Return ONLY the raw JSON object, nothing else.\n\n" + prompt, LOVABLE_API_KEY);
      updated = parseJSON(rawText);
    }

    if (targetDay) {
      await supabase
        .from("itinerary_items")
        .delete()
        .eq("trip_id", trip_id)
        .eq("day_number", targetDay);
    } else {
      await supabase.from("itinerary_items").delete().eq("trip_id", trip_id);
    }

    // Validate estimated_cost
    for (const day of updated.days ?? []) {
      for (const act of day.activities ?? []) {
        if (!act.estimated_cost || 
            String(act.estimated_cost).trim() === "" ||
            act.estimated_cost === "null" ||
            act.estimated_cost === "undefined") {
          act.estimated_cost = "Free";
        }
      }
    }

    const newItems: any[] = [];
    for (const day of updated.days ?? []) {
      for (const act of day.activities ?? []) {
        newItems.push({
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

    const { data: inserted, error: insertErr } = await supabase
      .from("itinerary_items")
      .insert(newItems)
      .select("id, place_name, title");

    if (insertErr) throw new Error(`Insert error: ${insertErr.message}`);

    for (const item of inserted ?? []) {
      const coords = await geocodeWithFallback(item.place_name, item.title, trip.destination, countryCode);
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

    const tripInterests = Array.isArray(trip.interests) ? trip.interests : [];
    await replaceFailedGeocodes(supabase, trip_id, trip.destination, tripInterests, countryCode, destCenter, LOVABLE_API_KEY);

    let finalJson = updated;
    if (targetDay && trip.raw_itinerary_json) {
      const existing = trip.raw_itinerary_json as any;
      const otherDays = (existing.days ?? []).filter((d: any) => d.day !== targetDay);
      finalJson = { ...existing, days: [...otherDays, ...(updated.days ?? [])].sort((a: any, b: any) => a.day - b.day) };
    }

    await supabase
      .from("trips")
      .update({ raw_itinerary_json: finalJson })
      .eq("id", trip_id);

    return new Response(JSON.stringify({ success: true, itinerary: finalJson }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("edit-trip error:", e);
    const status = e instanceof Error && e.message.includes("429") ? 429 :
                   e instanceof Error && e.message.includes("402") ? 402 : 500;
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
