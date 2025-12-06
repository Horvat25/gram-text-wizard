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

    console.log('Processing token, fetching user info and pages...');

    // First, get user info to understand the token type
    const meUrl = new URL('https://graph.facebook.com/v18.0/me');
    meUrl.searchParams.set('fields', 'id,name');
    meUrl.searchParams.set('access_token', tokenToUse);

    const meResponse = await fetch(meUrl.toString());
    const meData = await meResponse.json();
    
    console.log('User info response:', JSON.stringify(meData));

    if (meData.error) {
      console.error('Error getting user info:', meData.error);
      throw new Error(meData.error.message || 'Failed to get user info');
    }

    const userId = meData.id;

    // Try multiple approaches to get pages
    let pagesData: any = { data: [] };

    // Approach 1: Try /me/accounts (standard Facebook Login)
    console.log('Trying /me/accounts endpoint...');
    const pagesUrl = new URL('https://graph.facebook.com/v18.0/me/accounts');
    pagesUrl.searchParams.set('fields', 'id,name,access_token,instagram_business_account');
    pagesUrl.searchParams.set('access_token', tokenToUse);

    const pagesResponse = await fetch(pagesUrl.toString());
    pagesData = await pagesResponse.json();
    console.log('Pages API response (/me/accounts):', JSON.stringify(pagesData));

    // Approach 2: If /me/accounts returns empty, try getting pages directly using user ID
    if (!pagesData.data || pagesData.data.length === 0) {
      console.log('Trying /{user_id}/accounts endpoint...');
      const userPagesUrl = new URL(`https://graph.facebook.com/v18.0/${userId}/accounts`);
      userPagesUrl.searchParams.set('fields', 'id,name,access_token,instagram_business_account');
      userPagesUrl.searchParams.set('access_token', tokenToUse);

      const userPagesResponse = await fetch(userPagesUrl.toString());
      pagesData = await userPagesResponse.json();
      console.log('Pages API response (/{user_id}/accounts):', JSON.stringify(pagesData));
    }

    // Approach 3: Try to get businesses and their owned pages
    if (!pagesData.data || pagesData.data.length === 0) {
      console.log('Trying /me/businesses endpoint...');
      const businessUrl = new URL('https://graph.facebook.com/v18.0/me/businesses');
      businessUrl.searchParams.set('fields', 'id,name,owned_pages{id,name,access_token,instagram_business_account}');
      businessUrl.searchParams.set('access_token', tokenToUse);

      const businessResponse = await fetch(businessUrl.toString());
      const businessData = await businessResponse.json();
      console.log('Business API response:', JSON.stringify(businessData));

      if (businessData.data && businessData.data.length > 0) {
        // Extract pages from businesses
        const allPages: any[] = [];
        for (const business of businessData.data) {
          if (business.owned_pages && business.owned_pages.data) {
            allPages.push(...business.owned_pages.data);
          }
        }
        pagesData = { data: allPages };
        console.log('Pages extracted from businesses:', JSON.stringify(pagesData));
      }
    }

    // Approach 4: Try /me/instagram_accounts for direct Instagram access
    if (!pagesData.data || pagesData.data.length === 0) {
      console.log('Trying direct Instagram accounts access...');
      
      // First check what permissions we have
      const permissionsUrl = new URL('https://graph.facebook.com/v18.0/me/permissions');
      permissionsUrl.searchParams.set('access_token', tokenToUse);
      const permissionsResponse = await fetch(permissionsUrl.toString());
      const permissionsData = await permissionsResponse.json();
      console.log('Permissions:', JSON.stringify(permissionsData));
    }

    // If still no pages found, check if we have direct Instagram account access via the Config
    if (!pagesData.data || pagesData.data.length === 0) {
      // Last resort: Debug the token to understand what we have
      const debugUrl = new URL('https://graph.facebook.com/v18.0/debug_token');
      debugUrl.searchParams.set('input_token', tokenToUse);
      debugUrl.searchParams.set('access_token', tokenToUse);
      
      const debugResponse = await fetch(debugUrl.toString());
      const debugData = await debugResponse.json();
      console.log('Token debug info:', JSON.stringify(debugData));

      // Check if this is a page token or user token
      if (debugData.data && debugData.data.granular_scopes) {
        console.log('Granular scopes:', JSON.stringify(debugData.data.granular_scopes));
        
        // If we have instagram_basic scope with specific targets, we can get those accounts
        const igScope = debugData.data.granular_scopes.find((s: any) => 
          s.scope === 'instagram_basic' || s.scope === 'instagram_content_publish'
        );
        
        if (igScope && igScope.target_ids && igScope.target_ids.length > 0) {
          console.log('Found Instagram target IDs:', igScope.target_ids);
          
          // Try to get Instagram account info directly
          const instagramAccounts: any[] = [];
          
          for (const targetId of igScope.target_ids) {
            const igUrl = new URL(`https://graph.facebook.com/v18.0/${targetId}`);
            igUrl.searchParams.set('fields', 'id,username,profile_picture_url,followers_count');
            igUrl.searchParams.set('access_token', tokenToUse);
            
            const igResponse = await fetch(igUrl.toString());
            const igData = await igResponse.json();
            console.log('Direct Instagram account data:', JSON.stringify(igData));
            
            if (!igData.error && igData.id) {
              instagramAccounts.push({
                id: igData.id,
                instagram_business_account: { id: igData.id },
                name: igData.username || 'Instagram Account',
                access_token: tokenToUse,
                igUsername: igData.username
              });
            }
          }
          
          if (instagramAccounts.length > 0) {
            pagesData = { data: instagramAccounts, directInstagram: true };
          }
        }
      }
    }

    if (pagesData.error) {
      throw new Error(pagesData.error.message || 'Failed to fetch Facebook pages');
    }

    if (!pagesData.data || pagesData.data.length === 0) {
      throw new Error('Nenhuma Página do Facebook encontrada com acesso concedido. Verifique se você selecionou a Página correta durante a autorização e se ela tem uma conta Instagram Business vinculada.');
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const savedAccounts: any[] = [];

    // Process each page/account
    for (const page of pagesData.data) {
      let instagramAccountId: string;
      let pageAccessToken: string;
      let igUsername: string | null = null;

      if (pagesData.directInstagram) {
        // Direct Instagram access (from granular scopes)
        instagramAccountId = page.id;
        pageAccessToken = page.access_token;
        igUsername = page.igUsername;
      } else {
        // Standard page with Instagram Business Account
        if (!page.instagram_business_account) {
          console.log(`Page ${page.name} has no Instagram Business Account connected`);
          continue;
        }
        instagramAccountId = page.instagram_business_account.id;
        pageAccessToken = page.access_token;
      }

      // Get Instagram account details if we don't have them
      if (!igUsername) {
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
        igUsername = igData.username;
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

      // Upsert to instagram_accounts table
      const { data: savedAccount, error: upsertError } = await supabase
        .from('instagram_accounts')
        .upsert({
          instagram_user_id: instagramAccountId,
          page_id: page.id || null,
          username: igUsername || null,
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
        username: igUsername,
        instagramUserId: instagramAccountId,
        pageId: page.id,
        pageName: page.name
      });

      console.log(`Successfully saved Instagram account: ${igUsername || instagramAccountId}`);
    }

    if (savedAccounts.length === 0) {
      throw new Error('Nenhuma conta do Instagram Business encontrada. Certifique-se de que sua conta Instagram Business está conectada a uma Página do Facebook e que você autorizou o acesso.');
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
