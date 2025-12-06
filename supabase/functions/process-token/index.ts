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
    const { accessToken, longLivedToken, expiresIn, dataAccessExpirationTime } = await req.json();

    if (!accessToken && !longLivedToken) {
      throw new Error('Access token is required');
    }

    // Use long-lived token if available, otherwise use short-lived token
    const tokenToUse = longLivedToken || accessToken;

    console.log('Processing token, fetching user pages and Instagram accounts...');

    // Step 1: Get user's Facebook Pages with Instagram Business Accounts
    const pagesUrl = new URL('https://graph.facebook.com/v18.0/me/accounts');
    pagesUrl.searchParams.set('fields', 'id,name,access_token,instagram_business_account');
    pagesUrl.searchParams.set('access_token', tokenToUse);

    const pagesResponse = await fetch(pagesUrl.toString());
    const pagesData = await pagesResponse.json();

    console.log('Pages API response:', JSON.stringify(pagesData));

    if (pagesData.error) {
      throw new Error(pagesData.error.message || 'Failed to fetch Facebook pages');
    }

    if (!pagesData.data || pagesData.data.length === 0) {
      throw new Error('Nenhuma página do Facebook encontrada. Certifique-se de que sua conta Instagram está conectada a uma Página do Facebook.');
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const savedAccounts: any[] = [];

    // Process each page that has an Instagram Business Account
    for (const page of pagesData.data) {
      if (!page.instagram_business_account) {
        console.log(`Page ${page.name} has no Instagram Business Account connected`);
        continue;
      }

      const instagramAccountId = page.instagram_business_account.id;
      const pageAccessToken = page.access_token;

      // Step 2: Get Instagram account details
      const igUrl = new URL(`https://graph.facebook.com/v18.0/${instagramAccountId}`);
      igUrl.searchParams.set('fields', 'id,username,profile_picture_url,followers_count');
      igUrl.searchParams.set('access_token', pageAccessToken);

      const igResponse = await fetch(igUrl.toString());
      const igData = await igResponse.json();

      console.log('Instagram account data:', JSON.stringify(igData));

      if (igData.error) {
        console.error(`Error fetching Instagram account ${instagramAccountId}:`, igData.error);
        continue;
      }

      // Calculate expiration date
      let expiresAt: string | null = null;
      if (dataAccessExpirationTime) {
        expiresAt = new Date(dataAccessExpirationTime * 1000).toISOString();
      } else if (expiresIn) {
        expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
      } else {
        // Default to 60 days for long-lived tokens
        expiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();
      }

      // Step 3: Upsert to instagram_accounts table
      const { data: savedAccount, error: upsertError } = await supabase
        .from('instagram_accounts')
        .upsert({
          instagram_user_id: instagramAccountId,
          page_id: page.id,
          username: igData.username || null,
          access_token: pageAccessToken,
          expires_at: expiresAt,
          connected_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'instagram_user_id'
        })
        .select()
        .single();

      if (upsertError) {
        console.error('Error saving Instagram account:', upsertError);
        throw new Error(`Failed to save Instagram account: ${upsertError.message}`);
      }

      savedAccounts.push({
        id: savedAccount.id,
        username: igData.username,
        instagramUserId: instagramAccountId,
        pageId: page.id,
        pageName: page.name
      });

      console.log(`Successfully saved Instagram account: ${igData.username || instagramAccountId}`);
    }

    if (savedAccounts.length === 0) {
      throw new Error('Nenhuma conta do Instagram Business encontrada. Certifique-se de que sua conta Instagram Business está conectada a uma Página do Facebook.');
    }

    return new Response(
      JSON.stringify({
        success: true,
        accounts: savedAccounts,
        message: `${savedAccounts.length} conta(s) do Instagram conectada(s) com sucesso`
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  } catch (error: any) {
    console.error('Error in process-token:', error);
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
