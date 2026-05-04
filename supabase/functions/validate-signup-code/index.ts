import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// In-memory IP rate limiter (per isolate). 5 attempts per 15 min.
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const attempts = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || entry.resetAt < now) {
    attempts.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true };
  }
  if (entry.count >= RATE_LIMIT_MAX) {
    return { allowed: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
  }
  entry.count += 1;
  return { allowed: true };
}

// Constant-time string comparison to mitigate timing attacks
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Always take ~300ms to slow down brute force regardless of outcome
  const startedAt = Date.now();
  const minDelayMs = 300;

  try {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
      req.headers.get("cf-connecting-ip") ||
      "unknown";

    const rl = checkRateLimit(ip);
    if (!rl.allowed) {
      const elapsed = Date.now() - startedAt;
      if (elapsed < minDelayMs) await new Promise(r => setTimeout(r, minDelayMs - elapsed));
      return new Response(
        JSON.stringify({ valid: false, error: "Muitas tentativas. Tente novamente mais tarde." }),
        {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": String(rl.retryAfter ?? 60) },
        }
      );
    }

    const { code } = await req.json();
    const SIGNUP_ACCESS_CODE = Deno.env.get("SIGNUP_ACCESS_CODE");

    if (!SIGNUP_ACCESS_CODE) {
      console.error("SIGNUP_ACCESS_CODE not configured");
      const elapsed = Date.now() - startedAt;
      if (elapsed < minDelayMs) await new Promise(r => setTimeout(r, minDelayMs - elapsed));
      return new Response(
        JSON.stringify({ valid: false, error: "Código de acesso não configurado" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const submitted = typeof code === "string" ? code : "";
    const isValid = timingSafeEqual(submitted, SIGNUP_ACCESS_CODE);

    const elapsed = Date.now() - startedAt;
    if (elapsed < minDelayMs) await new Promise(r => setTimeout(r, minDelayMs - elapsed));

    return new Response(
      JSON.stringify({ valid: isValid }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error validating code:", error);
    const elapsed = Date.now() - startedAt;
    if (elapsed < minDelayMs) await new Promise(r => setTimeout(r, minDelayMs - elapsed));
    return new Response(
      JSON.stringify({ valid: false, error: "Erro ao validar código" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
