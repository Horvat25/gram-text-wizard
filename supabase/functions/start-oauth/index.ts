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

    // Generate state for CSRF protection
    const state = crypto.randomUUID();

    // Use standard Facebook Login (not Login for Business)
    // This requires the user to have admin access to a Facebook Page with Instagram Business connected
    const scopes = [
      'pages_show_list',           // Required to list Facebook Pages
      'pages_read_engagement',     // Required to read page info
      'instagram_basic',           // Basic Instagram access
      'instagram_content_publish', // Publish to Instagram
      'instagram_manage_insights', // Read Instagram insights
      'instagram_manage_comments'  // Manage comments
    ].join(',');

    // Build standard Facebook OAuth URL
    const authUrl = new URL('https://www.facebook.com/v18.0/dialog/oauth');
    authUrl.searchParams.set('client_id', FACEBOOK_APP_ID);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code'); // Use code flow for better security
    authUrl.searchParams.set('scope', scopes);
    authUrl.searchParams.set('state', state);

    console.log('Generated Facebook OAuth URL:', authUrl.toString());

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
