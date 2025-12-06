import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const FACEBOOK_APP_ID = Deno.env.get('FACEBOOK_APP_ID');
    
    if (!FACEBOOK_APP_ID) {
      throw new Error('FACEBOOK_APP_ID not configured');
    }

    const { redirectUri } = await req.json();
    
    if (!redirectUri) {
      throw new Error('redirectUri is required');
    }

    // Facebook Login for Business OAuth scopes for Instagram Business Account
    const scopes = [
      'instagram_basic',
      'instagram_content_publish',
      'instagram_manage_insights',
      'pages_show_list',
      'pages_read_engagement',
      'business_management'
    ].join(',');

    // Generate state for CSRF protection
    const state = crypto.randomUUID();

    // Extras parameter for Instagram API onboarding
    const extras = JSON.stringify({ setup: { channel: "IG_API_ONBOARDING" } });

    // Build Facebook Login for Business OAuth URL
    const authUrl = new URL('https://www.facebook.com/v18.0/dialog/oauth');
    authUrl.searchParams.set('client_id', FACEBOOK_APP_ID);
    authUrl.searchParams.set('display', 'page');
    authUrl.searchParams.set('extras', extras);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'token');
    authUrl.searchParams.set('scope', scopes);
    authUrl.searchParams.set('state', state);

    console.log('Generated Facebook Login for Business OAuth URL:', authUrl.toString());

    return new Response(
      JSON.stringify({ 
        authUrl: authUrl.toString(),
        state 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  } catch (error: any) {
    console.error('Error in start-oauth:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
