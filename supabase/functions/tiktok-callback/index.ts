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
    const clientKey = Deno.env.get('TIKTOK_CLIENT_KEY');
    const clientSecret = Deno.env.get('TIKTOK_CLIENT_SECRET');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!clientKey || !clientSecret) {
      console.error('Missing TikTok credentials');
      return new Response(
        JSON.stringify({ error: 'TikTok credentials not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { code, redirectUri, userId, workspaceId } = await req.json();

    if (!code || !redirectUri || !userId) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters: code, redirectUri, userId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Processing TikTok OAuth callback for user:', userId);

    // Exchange code for access token
    const tokenResponse = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_key: clientKey,
        client_secret: clientSecret,
        code: code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }),
    });

    const tokenData = await tokenResponse.json();
    console.log('Token response status:', tokenResponse.status);

    if (tokenData.error || !tokenData.access_token) {
      console.error('Failed to get access token:', tokenData);
      return new Response(
        JSON.stringify({ 
          error: tokenData.error_description || tokenData.error || 'Failed to get access token' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { access_token, refresh_token, open_id, expires_in } = tokenData;

    // Fetch user info
    const userInfoResponse = await fetch(
      'https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name,username',
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${access_token}`,
        },
      }
    );

    const userInfoData = await userInfoResponse.json();
    console.log('User info response:', userInfoData);

    let username = null;
    let displayName = null;
    let avatarUrl = null;

    if (userInfoData.data?.user) {
      username = userInfoData.data.user.username;
      displayName = userInfoData.data.user.display_name;
      avatarUrl = userInfoData.data.user.avatar_url;
    }

    // Calculate token expiry
    const expiresAt = new Date(Date.now() + expires_in * 1000).toISOString();

    // Save to database
    const supabase = createClient(supabaseUrl!, supabaseServiceKey!);

    // Get workspace_id from user's workspace membership if not provided
    let resolvedWorkspaceId = workspaceId;
    if (!resolvedWorkspaceId) {
      const { data: memberData } = await supabase
        .from('workspace_members')
        .select('workspace_id')
        .eq('user_id', userId)
        .limit(1)
        .single();
      resolvedWorkspaceId = memberData?.workspace_id || null;
    }

    const { data, error } = await supabase
      .from('tiktok_accounts')
      .upsert({
        user_id: userId,
        open_id: open_id,
        username: username,
        display_name: displayName,
        avatar_url: avatarUrl,
        access_token: access_token,
        refresh_token: refresh_token,
        expires_at: expiresAt,
        workspace_id: resolvedWorkspaceId,
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'open_id',
      })
      .select()
      .single();

    if (error) {
      console.error('Failed to save TikTok account:', error);
      return new Response(
        JSON.stringify({ error: 'Failed to save TikTok account' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('TikTok account saved successfully:', data.id);

    return new Response(
      JSON.stringify({ 
        success: true,
        account: {
          id: data.id,
          username: username || displayName || open_id,
          displayName,
          avatarUrl,
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error in tiktok-callback:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
