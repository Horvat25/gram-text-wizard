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

    const { code, redirectUri, userId } = await req.json();

    if (!code) {
      throw new Error('Authorization code is required');
    }

    if (!redirectUri) {
      throw new Error('Redirect URI is required');
    }

    if (!userId) {
      throw new Error('User ID is required for authentication');
    }

    console.log('Processing OAuth callback with code:', code.substring(0, 10) + '... userId:', userId);

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

    console.log('Got long-lived token, fetching debug info and pages...');

    // Check what permissions were granted
    const debugTokenUrl = `https://graph.facebook.com/v18.0/debug_token?input_token=${accessToken}&access_token=${FACEBOOK_APP_ID}|${FACEBOOK_APP_SECRET}`;
    const debugResponse = await fetch(debugTokenUrl);
    const debugData = await debugResponse.json();
    console.log('Token debug info:', JSON.stringify(debugData, null, 2));

    // Check for required Instagram scopes
    const grantedScopes = debugData.data?.scopes || [];
    const instagramScopes = grantedScopes.filter((s: string) => s.startsWith('instagram_'));
    const hasInstagramBasic = grantedScopes.includes('instagram_basic');
    const hasInstagramContentPublish = grantedScopes.includes('instagram_content_publish');
    
    console.log('Granted scopes:', grantedScopes);
    console.log('Instagram scopes:', instagramScopes);
    console.log('Has instagram_basic:', hasInstagramBasic);
    console.log('Has instagram_content_publish:', hasInstagramContentPublish);

    // If no Instagram permissions, give clear error
    if (instagramScopes.length === 0) {
      console.error('No Instagram permissions granted!');
      throw new Error(
        'PERMISSÕES NÃO CONCEDIDAS: Você precisa selecionar sua conta do Instagram durante a autorização. ' +
        'Por favor, tente novamente e certifique-se de: ' +
        '1) Selecionar sua CONTA DO INSTAGRAM na lista, ' +
        '2) Manter TODAS as permissões marcadas, ' +
        '3) Clicar em "Permitir" ou "Continuar".'
      );
    }

    // Step 3: Get user's Facebook pages
    const pagesResponse = await fetch(
      `https://graph.facebook.com/v18.0/me/accounts?fields=id,name,access_token,instagram_business_account&access_token=${accessToken}`
    );
    const pagesData = await pagesResponse.json();

    console.log('Pages API response:', JSON.stringify(pagesData, null, 2));

    if (pagesData.error) {
      console.error('Pages fetch error:', pagesData.error);
      throw new Error(pagesData.error.message || 'Failed to fetch pages');
    }

    // Check if pages data is empty - try granular_scopes
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
          
          // Get page access token with instagram_business_account
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
        throw new Error(
          'PÁGINA NÃO ENCONTRADA: Não foi possível acessar sua Página do Facebook. ' +
          'Certifique-se de: ' +
          '1) Ter uma Página do Facebook, ' +
          '2) Ser administrador da Página, ' +
          '3) Selecionar a Página durante a autorização.'
        );
      }
    }

    // Try to get Instagram account IDs from granular_scopes
    const instagramAccountIds = debugData.data?.granular_scopes?.find(
      (s: any) => s.scope === 'instagram_basic' || s.scope === 'instagram_content_publish'
    )?.target_ids || [];
    
    console.log('Instagram account IDs from granular_scopes:', instagramAccountIds);
    console.log(`Found ${pagesData.data.length} pages, looking for Instagram accounts...`);

    // Step 4: Get Instagram Business Account for each page
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const connectedAccounts = [];
    let foundInstagramButNoPermissions = false;

    // First, check if user already has an account (for reconnection scenarios)
    const { data: existingAccounts, error: existingError } = await supabase
      .from('instagram_accounts')
      .select('*')
      .eq('user_id', userId);
    
    if (existingError) {
      console.log('Error checking existing accounts:', existingError);
    } else {
      console.log(`Found ${existingAccounts?.length || 0} existing accounts for user ${userId}`);
    }

    for (const page of pagesData.data) {
      const pageAccessToken = page.access_token;
      let igAccountId = null;
      
      // First check if page already has instagram_business_account from earlier fetch
      if (page.instagram_business_account) {
        igAccountId = page.instagram_business_account.id;
        console.log(`Page ${page.id} (${page.name}) has instagram_business_account: ${igAccountId}`);
      } else {
        // Try to get Instagram Business Account ID from page
        console.log(`Checking page ${page.id} (${page.name}) for Instagram...`);
        const igResponse = await fetch(
          `https://graph.facebook.com/v18.0/${page.id}?fields=instagram_business_account&access_token=${pageAccessToken}`
        );
        const igData = await igResponse.json();
        
        console.log(`Instagram account check for page ${page.id}:`, JSON.stringify(igData));
        
        if (igData.instagram_business_account) {
          igAccountId = igData.instagram_business_account.id;
        }
      }
      
      // If still no Instagram account, try using the ID from granular_scopes
      if (!igAccountId && instagramAccountIds.length > 0) {
        console.log('Trying Instagram account IDs from granular_scopes...');
        igAccountId = instagramAccountIds[0];
      }

      if (igAccountId) {
        // Get Instagram account details using page access token
        console.log(`Fetching Instagram details for account ${igAccountId}...`);
        const igDetailsResponse = await fetch(
          `https://graph.facebook.com/v18.0/${igAccountId}?fields=id,username,profile_picture_url&access_token=${pageAccessToken}`
        );
        const igDetails = await igDetailsResponse.json();
        
        console.log('Instagram details response:', JSON.stringify(igDetails));

        if (igDetails.error) {
          console.error('Error fetching Instagram details:', igDetails.error);
          foundInstagramButNoPermissions = true;
          continue;
        }

        console.log(`Found Instagram account: @${igDetails.username} (ID: ${igAccountId})`);

        // Calculate expiration date
        const expiresAt = new Date();
        expiresAt.setSeconds(expiresAt.getSeconds() + expiresIn);

        // Check if there's an existing account with this instagram_user_id or for this user
        const existingByInstagramId = existingAccounts?.find(a => a.instagram_user_id === igAccountId);
        const existingByUserId = existingAccounts?.find(a => a.user_id === userId);
        
        console.log(`Existing by instagram_id: ${existingByInstagramId?.id || 'none'}`);
        console.log(`Existing by user_id: ${existingByUserId?.id || 'none'}`);

        let result;
        
        if (existingByInstagramId) {
          // Update existing account by instagram_user_id
          console.log(`Updating existing account ${existingByInstagramId.id} for instagram_user_id ${igAccountId}`);
          const { data, error } = await supabase
            .from('instagram_accounts')
            .update({
              page_id: page.id,
              username: igDetails.username,
              profile_picture_url: igDetails.profile_picture_url || null,
              access_token: pageAccessToken,
              expires_at: expiresAt.toISOString(),
              connected_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              user_id: userId
            })
            .eq('instagram_user_id', igAccountId)
            .select()
            .single();
          
          result = { data, error };
        } else if (existingByUserId) {
          // Update existing account for this user (reconnecting with different IG account)
          console.log(`Updating existing account ${existingByUserId.id} for user ${userId} with new instagram_user_id ${igAccountId}`);
          const { data, error } = await supabase
            .from('instagram_accounts')
            .update({
              page_id: page.id,
              instagram_user_id: igAccountId,
              username: igDetails.username,
              profile_picture_url: igDetails.profile_picture_url || null,
              access_token: pageAccessToken,
              expires_at: expiresAt.toISOString(),
              connected_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq('id', existingByUserId.id)
            .select()
            .single();
          
          result = { data, error };
        } else {
          // Insert new account
          console.log(`Creating new account for user ${userId} with instagram_user_id ${igAccountId}`);
          const { data, error } = await supabase
            .from('instagram_accounts')
            .insert({
              page_id: page.id,
              instagram_user_id: igAccountId,
              username: igDetails.username,
              profile_picture_url: igDetails.profile_picture_url || null,
              access_token: pageAccessToken,
              expires_at: expiresAt.toISOString(),
              connected_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              user_id: userId
            })
            .select()
            .single();
          
          result = { data, error };
        }

        if (result.error) {
          console.error('Database error:', result.error);
          throw new Error(`Failed to save account to database: ${result.error.message}`);
        }

        console.log('Successfully saved to database:', result.data.id);

        connectedAccounts.push({
          id: result.data.id,
          username: igDetails.username,
          instagram_user_id: igAccountId
        });
      }
    }

    if (connectedAccounts.length === 0) {
      if (foundInstagramButNoPermissions) {
        throw new Error(
          'CONTA ENCONTRADA MAS SEM ACESSO: Encontramos sua conta do Instagram, mas não conseguimos acessá-la. ' +
          'Isso geralmente acontece quando as permissões do Instagram não foram concedidas. ' +
          'Por favor, desconecte e conecte novamente, selecionando sua conta do Instagram na tela de autorização.'
        );
      }
      
      if (instagramScopes.length === 0) {
        throw new Error(
          'PERMISSÕES DO INSTAGRAM NÃO FORAM SELECIONADAS: ' +
          'Durante a autorização, você precisa selecionar sua conta do Instagram. ' +
          'Clique em "Conectar Instagram" novamente e certifique-se de marcar sua conta Instagram na lista.'
        );
      }
      
      throw new Error(
        'INSTAGRAM NÃO VINCULADO À PÁGINA: ' +
        'Não encontramos uma conta Instagram Business vinculada à sua Página do Facebook. ' +
        'Para vincular: 1) Acesse as configurações do Instagram, 2) Vá em "Conta" > "Compartilhamento em outros apps", ' +
        '3) Selecione "Facebook" e vincule à sua Página.'
      );
    }

    console.log(`Successfully connected ${connectedAccounts.length} Instagram account(s) for user ${userId}`);

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
