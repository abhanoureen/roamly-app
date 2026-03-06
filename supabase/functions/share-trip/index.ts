import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { trip_id } = await req.json();
    if (!trip_id) {
      return new Response(JSON.stringify({ error: "trip_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Fetch current trip
    const { data: trip, error: tripErr } = await supabase
      .from("trips")
      .select("id, share_id, is_public")
      .eq("id", trip_id)
      .single();

    if (tripErr || !trip) throw new Error("Trip not found");

    // Generate share_id if not present
    let shareId = trip.share_id;
    if (!shareId) {
      shareId = crypto.randomUUID().slice(0, 8);
    }

    // Update trip to public with share_id
    await supabase
      .from("trips")
      .update({ is_public: true, share_id: shareId })
      .eq("id", trip_id);

    // Build share URL using origin from request or fallback
    const origin = req.headers.get("origin") || req.headers.get("referer")?.replace(/\/$/, "") || "https://roamly.app";
    const shareUrl = `${origin}/trip/${shareId}`;

    return new Response(JSON.stringify({ share_url: shareUrl, share_id: shareId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("share-trip error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
