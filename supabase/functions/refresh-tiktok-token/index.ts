import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const clientKey = Deno.env.get('TIKTOK_CLIENT_KEY');
    const clientSecret = Deno.env.get('TIKTOK_CLIENT_SECRET');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!clientKey || !clientSecret) {
      return new Response(
        JSON.stringify({ error: 'TikTok credentials not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { accountId } = await req.json();
    if (!accountId) {
      return new Response(
        JSON.stringify({ error: 'Missing accountId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl!, supabaseServiceKey!);

    // Fetch account
    const { data: account, error: fetchErr } = await supabase
      .from('tiktok_accounts')
      .select('*')
      .eq('id', accountId)
      .single();

    if (fetchErr || !account) {
      return new Response(
        JSON.stringify({ error: 'Account not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!account.refresh_token) {
      return new Response(
        JSON.stringify({ error: 'No refresh token available. Please reconnect your TikTok account.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Refresh token
    const response = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: clientKey,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: account.refresh_token,
      }),
    });

    const data = await response.json();
    console.log('Refresh response status:', response.status);

    if (data.error || !data.access_token) {
      console.error('Failed to refresh:', data);
      return new Response(
        JSON.stringify({ error: data.error_description || 'Failed to refresh token. Please reconnect.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();

    // Update in DB
    const { error: updateErr } = await supabase
      .from('tiktok_accounts')
      .update({
        access_token: data.access_token,
        refresh_token: data.refresh_token || account.refresh_token,
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq('id', accountId);

    if (updateErr) {
      console.error('Failed to update account:', updateErr);
      return new Response(
        JSON.stringify({ error: 'Failed to save refreshed token' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, expires_at: expiresAt }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error in refresh-tiktok-token:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
