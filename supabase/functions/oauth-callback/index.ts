import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const FACEBOOK_APP_SECRET = Deno.env.get('FACEBOOK_APP_SECRET');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!FACEBOOK_APP_ID || !FACEBOOK_APP_SECRET) {
      throw new Error('Facebook credentials not configured');
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Supabase credentials not configured');
    }

    const { code, redirectUri } = await req.json();

    if (!code) {
      throw new Error('Authorization code is required');
    }

    if (!redirectUri) {
      throw new Error('Redirect URI is required');
    }

    console.log('Processing OAuth callback with code:', code.substring(0, 10) + '...');

    // Step 1: Exchange code for short-lived access token
    const tokenUrl = new URL('https://graph.facebook.com/v18.0/oauth/access_token');
    tokenUrl.searchParams.set('client_id', FACEBOOK_APP_ID);
    tokenUrl.searchParams.set('client_secret', FACEBOOK_APP_SECRET);
    tokenUrl.searchParams.set('redirect_uri', redirectUri);
    tokenUrl.searchParams.set('code', code);

    const tokenResponse = await fetch(tokenUrl.toString());
    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      console.error('Token exchange error:', tokenData.error);
      throw new Error(tokenData.error.message || 'Failed to exchange code for token');
    }

    console.log('Got short-lived token, exchanging for long-lived token...');

    // Step 2: Exchange for long-lived token (60 days)
    const longLivedUrl = new URL('https://graph.facebook.com/v18.0/oauth/access_token');
    longLivedUrl.searchParams.set('grant_type', 'fb_exchange_token');
    longLivedUrl.searchParams.set('client_id', FACEBOOK_APP_ID);
    longLivedUrl.searchParams.set('client_secret', FACEBOOK_APP_SECRET);
    longLivedUrl.searchParams.set('fb_exchange_token', tokenData.access_token);

    const longLivedResponse = await fetch(longLivedUrl.toString());
    const longLivedData = await longLivedResponse.json();

    if (longLivedData.error) {
      console.error('Long-lived token error:', longLivedData.error);
      throw new Error(longLivedData.error.message || 'Failed to get long-lived token');
    }

    const accessToken = longLivedData.access_token;
    const expiresIn = longLivedData.expires_in || 5184000; // Default 60 days

    console.log('Got long-lived token, fetching pages...');

    // First, check what permissions were granted
    const debugTokenUrl = `https://graph.facebook.com/v18.0/debug_token?input_token=${accessToken}&access_token=${FACEBOOK_APP_ID}|${FACEBOOK_APP_SECRET}`;
    const debugResponse = await fetch(debugTokenUrl);
    const debugData = await debugResponse.json();
    console.log('Token debug info:', JSON.stringify(debugData, null, 2));

    // Step 3: Get user's Facebook pages
    const pagesResponse = await fetch(
      `https://graph.facebook.com/v18.0/me/accounts?access_token=${accessToken}`
    );
    const pagesData = await pagesResponse.json();

    console.log('Pages API response:', JSON.stringify(pagesData, null, 2));

    if (pagesData.error) {
      console.error('Pages fetch error:', pagesData.error);
      throw new Error(pagesData.error.message || 'Failed to fetch pages');
    }

    // Check if pages data is empty
    if (!pagesData.data || pagesData.data.length === 0) {
      console.log('No pages from /me/accounts, checking granular_scopes target_ids...');
      
      // Try to get page IDs from the granular_scopes in debug data
      const pageIds = debugData.data?.granular_scopes?.find(
        (s: any) => s.scope === 'pages_show_list'
      )?.target_ids || [];
      
      console.log('Found page IDs from granular_scopes:', pageIds);
      
      if (pageIds.length > 0) {
        // Fetch each page directly using the page ID
        for (const pageId of pageIds) {
          console.log(`Fetching page ${pageId} directly...`);
          
          // Get page access token
          const pageTokenUrl = `https://graph.facebook.com/v18.0/${pageId}?fields=id,name,access_token,instagram_business_account&access_token=${accessToken}`;
          const pageResponse = await fetch(pageTokenUrl);
          const pageData = await pageResponse.json();
          
          console.log('Direct page response:', JSON.stringify(pageData, null, 2));
          
          if (pageData.id && !pageData.error) {
            pagesData.data = pagesData.data || [];
            pagesData.data.push(pageData);
          }
        }
      }
      
      if (!pagesData.data || pagesData.data.length === 0) {
        throw new Error('Nenhuma página do Facebook encontrada. Verifique se: 1) Você tem uma Página do Facebook, 2) A permissão pages_show_list foi concedida, 3) Você é administrador da Página.');
      }
    }

    console.log(`Found ${pagesData.data.length} pages, looking for Instagram accounts...`);

    // Step 4: Get Instagram Business Account for each page
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const connectedAccounts = [];

    for (const page of pagesData.data) {
      const pageAccessToken = page.access_token;
      
      // Get Instagram Business Account ID
      const igResponse = await fetch(
        `https://graph.facebook.com/v18.0/${page.id}?fields=instagram_business_account&access_token=${pageAccessToken}`
      );
      const igData = await igResponse.json();

      if (igData.instagram_business_account) {
        const igAccountId = igData.instagram_business_account.id;

        // Get Instagram account details
        const igDetailsResponse = await fetch(
          `https://graph.facebook.com/v18.0/${igAccountId}?fields=id,username,profile_picture_url&access_token=${pageAccessToken}`
        );
        const igDetails = await igDetailsResponse.json();

        console.log(`Found Instagram account: @${igDetails.username}`);

        // Calculate expiration date
        const expiresAt = new Date();
        expiresAt.setSeconds(expiresAt.getSeconds() + expiresIn);

        // Save to database (upsert based on instagram_user_id)
        const { data, error } = await supabase
          .from('instagram_accounts')
          .upsert({
            page_id: page.id,
            instagram_user_id: igAccountId,
            username: igDetails.username,
            access_token: pageAccessToken, // Use page token for Instagram API
            expires_at: expiresAt.toISOString(),
            connected_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }, {
            onConflict: 'instagram_user_id'
          })
          .select()
          .single();

        if (error) {
          console.error('Database error:', error);
          throw new Error('Failed to save account to database');
        }

        connectedAccounts.push({
          id: data.id,
          username: igDetails.username,
          instagram_user_id: igAccountId
        });
      }
    }

    if (connectedAccounts.length === 0) {
      throw new Error('No Instagram Business Accounts found. Make sure your Facebook Page is connected to an Instagram Business Account.');
    }

    console.log(`Successfully connected ${connectedAccounts.length} Instagram account(s)`);

    return new Response(
      JSON.stringify({ 
        success: true,
        accounts: connectedAccounts
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  } catch (error: any) {
    console.error('Error in oauth-callback:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message 
      }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
