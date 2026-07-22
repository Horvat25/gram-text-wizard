import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const { sourceUrl, bucket, path } = await req.json();
    if (!sourceUrl || !bucket || !path) throw new Error("sourceUrl, bucket, path required");

    const res = await fetch(sourceUrl);
    if (!res.ok) throw new Error(`fetch failed ${res.status}`);
    const buf = new Uint8Array(await res.arrayBuffer());

    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { error } = await supa.storage.from(bucket).upload(path, buf, {
      contentType: "video/mp4",
      upsert: true,
    });
    if (error) throw error;
    const { data } = supa.storage.from(bucket).getPublicUrl(path);
    return new Response(JSON.stringify({ ok: true, url: data.publicUrl, bytes: buf.length }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
