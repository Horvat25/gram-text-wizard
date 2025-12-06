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
    const FACEBOOK_CONFIG_ID = Deno.env.get('FACEBOOK_CONFIG_ID');
    
    if (!FACEBOOK_APP_ID) {
      throw new Error('FACEBOOK_APP_ID not configured');
    }

    const { redirectUri } = await req.json();
    
    if (!redirectUri) {
      throw new Error('redirectUri is required');
    }

    // Generate state for CSRF protection
    const state = crypto.randomUUID();

    // Build OAuth URL with explicit scopes
    // Even with config_id, we add scopes explicitly for better compatibility
    const authUrl = new URL('https://www.facebook.com/v18.0/dialog/oauth');
    authUrl.searchParams.set('client_id', FACEBOOK_APP_ID);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('state', state);
    
    // CRITICAL: Add explicit scopes for Instagram Business
    // These are the required permissions for Instagram Content Publishing
    const scopes = [
      'pages_show_list',
      'pages_read_engagement',
      'instagram_basic',
      'instagram_content_publish',
      'instagram_manage_insights',
      'instagram_manage_comments',
      'business_management'
    ].join(',');
    
    authUrl.searchParams.set('scope', scopes);
    
    // Add config_id if available (for Facebook Login for Business)
    if (FACEBOOK_CONFIG_ID) {
      authUrl.searchParams.set('config_id', FACEBOOK_CONFIG_ID);
    }

    console.log('Generated OAuth URL with explicit scopes');
    console.log('Scopes requested:', scopes);
    console.log('Config ID:', FACEBOOK_CONFIG_ID || 'not set');
    console.log('Redirect URI:', redirectUri);

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
