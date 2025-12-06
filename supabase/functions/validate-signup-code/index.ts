import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { code } = await req.json();
    const SIGNUP_ACCESS_CODE = Deno.env.get("SIGNUP_ACCESS_CODE");

    if (!SIGNUP_ACCESS_CODE) {
      console.error("SIGNUP_ACCESS_CODE not configured");
      return new Response(
        JSON.stringify({ valid: false, error: "Código de acesso não configurado" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const isValid = code === SIGNUP_ACCESS_CODE;

    return new Response(
      JSON.stringify({ valid: isValid }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error validating code:", error);
    return new Response(
      JSON.stringify({ valid: false, error: "Erro ao validar código" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
