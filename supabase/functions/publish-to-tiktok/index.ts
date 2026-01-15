import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper function to wait
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Refresh TikTok access token using refresh_token
async function refreshTikTokToken(refreshToken: string, clientKey: string, clientSecret: string) {
  console.log('Refreshing TikTok access token...');
  
  const response = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });

  const data = await response.json();
  
  if (data.error || !data.access_token) {
    console.error('Failed to refresh token:', data);
    throw new Error(data.error_description || 'Failed to refresh TikTok token');
  }

  console.log('Token refreshed successfully, new expiry:', data.expires_in, 'seconds');
  
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_in: data.expires_in,
  };
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const clientKey = Deno.env.get('TIKTOK_CLIENT_KEY');
    const clientSecret = Deno.env.get('TIKTOK_CLIENT_SECRET');

    const { postId, accountId } = await req.json();

    if (!postId) {
      return new Response(
        JSON.stringify({ error: 'Missing postId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl!, supabaseServiceKey!);

    // Fetch the post
    const { data: post, error: postError } = await supabase
      .from('posts')
      .select('*')
      .eq('id', postId)
      .single();

    if (postError || !post) {
      console.error('Post not found:', postError);
      return new Response(
        JSON.stringify({ error: 'Post not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if post has video
    if (!post.video_url) {
      return new Response(
        JSON.stringify({ error: 'TikTok only supports video posts. This post has no video.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch TikTok account
    let accountQuery = supabase
      .from('tiktok_accounts')
      .select('*')
      .eq('user_id', post.user_id);
    
    if (accountId) {
      accountQuery = accountQuery.eq('id', accountId);
    }

    const { data: account, error: accountError } = await accountQuery.limit(1).single();

    if (accountError || !account) {
      console.error('TikTok account not found:', accountError);
      return new Response(
        JSON.stringify({ error: 'TikTok account not connected' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if token is expired or about to expire (within 5 minutes)
    let accessToken = account.access_token;
    const expiresAt = new Date(account.expires_at);
    const now = new Date();
    const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);

    if (expiresAt < fiveMinutesFromNow) {
      console.log('Token expired or expiring soon, refreshing...');
      
      if (!account.refresh_token) {
        return new Response(
          JSON.stringify({ 
            error: 'Token expirado e sem refresh_token. Por favor, reconecte sua conta TikTok nas Configurações.' 
          }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (!clientKey || !clientSecret) {
        return new Response(
          JSON.stringify({ error: 'TikTok credentials not configured for token refresh' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      try {
        const newTokens = await refreshTikTokToken(account.refresh_token, clientKey, clientSecret);
        accessToken = newTokens.access_token;

        // Calculate new expiry - set to 30 days from now (or actual expiry, whichever is less)
        // TikTok access tokens last 24h but we refresh automatically
        const newExpiresAt = new Date(Date.now() + newTokens.expires_in * 1000).toISOString();

        // Update the account with new tokens
        const { error: updateError } = await supabase
          .from('tiktok_accounts')
          .update({
            access_token: newTokens.access_token,
            refresh_token: newTokens.refresh_token,
            expires_at: newExpiresAt,
            updated_at: new Date().toISOString(),
          })
          .eq('id', account.id);

        if (updateError) {
          console.error('Failed to update tokens in database:', updateError);
        } else {
          console.log('Tokens updated in database, new expiry:', newExpiresAt);
        }
      } catch (refreshError) {
        console.error('Token refresh failed:', refreshError);
        return new Response(
          JSON.stringify({ 
            error: 'Falha ao renovar token. Por favor, reconecte sua conta TikTok nas Configurações.',
            details: refreshError instanceof Error ? refreshError.message : 'Unknown error'
          }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    console.log('Publishing to TikTok for account:', account.username || account.open_id);

    // Download the video first
    console.log('Downloading video from:', post.video_url);
    const videoResponse = await fetch(post.video_url);
    if (!videoResponse.ok) {
      throw new Error(`Failed to download video: ${videoResponse.status}`);
    }
    
    const videoBuffer = await videoResponse.arrayBuffer();
    const videoSize = videoBuffer.byteLength;
    console.log('Video downloaded, size:', videoSize, 'bytes');

    // Prepare caption with hashtags
    let caption = post.caption || '';
    if (post.hashtags && post.hashtags.length > 0) {
      const hashtagsString = post.hashtags.map((h: string) => 
        h.startsWith('#') ? h : `#${h}`
      ).join(' ');
      caption = `${caption}\n\n${hashtagsString}`;
    }

    // TikTok Content Posting API v2 - Initialize with Inbox (drafts) for unaudited apps
    // This is required for sandbox apps - videos go to drafts for manual publishing
    console.log('Initializing TikTok upload to INBOX (drafts) for sandbox app...');
    const initResponse = await fetch('https://open.tiktokapis.com/v2/post/publish/inbox/video/init/', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify({
        source_info: {
          source: 'FILE_UPLOAD',
          video_size: videoSize,
          chunk_size: videoSize,
          total_chunk_count: 1,
        },
      }),
    });

    const initData = await initResponse.json();
    console.log('TikTok init response:', JSON.stringify(initData));

    if (initData.error?.code || !initData.data?.publish_id) {
      console.error('Failed to initialize TikTok post:', initData);
      
      await supabase
        .from('posts')
        .update({ 
          error_message: initData.error?.message || 'Failed to publish to TikTok'
        })
        .eq('id', postId);

      return new Response(
        JSON.stringify({ 
          error: initData.error?.message || 'Failed to initialize TikTok post',
          details: initData.error 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const publishId = initData.data.publish_id;
    const uploadUrl = initData.data.upload_url;
    console.log('TikTok publish initiated with ID:', publishId);
    console.log('Upload URL:', uploadUrl);

    // Upload the video file to TikTok
    console.log('Uploading video to TikTok...');
    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': videoSize.toString(),
        'Content-Range': `bytes 0-${videoSize - 1}/${videoSize}`,
      },
      body: videoBuffer,
    });

    console.log('Upload response status:', uploadResponse.status);
    
    if (!uploadResponse.ok && uploadResponse.status !== 201) {
      const uploadError = await uploadResponse.text();
      console.error('Video upload failed:', uploadError);
      
      await supabase
        .from('posts')
        .update({ 
          error_message: `Video upload failed: ${uploadResponse.status}`
        })
        .eq('id', postId);

      return new Response(
        JSON.stringify({ 
          error: `Video upload failed: ${uploadResponse.status}`,
          details: uploadError
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Video uploaded successfully, waiting for processing...');

    // Poll for publish status (TikTok processes the video asynchronously)
    // For Sandbox apps, the status will be SEND_TO_USER_INBOX, not PUBLISH_COMPLETE
    let attempts = 0;
    const maxAttempts = 30; // 5 minutes max (10 second intervals)
    let publishStatus = null;
    let finalStatus = '';

    while (attempts < maxAttempts) {
      await sleep(10000); // Wait 10 seconds between checks
      attempts++;

      const statusResponse = await fetch('https://open.tiktokapis.com/v2/post/publish/status/fetch/', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8',
        },
        body: JSON.stringify({
          publish_id: publishId,
        }),
      });

      const statusData = await statusResponse.json();
      const status = statusData.data?.status;
      console.log(`TikTok status check ${attempts}: ${status}`, JSON.stringify(statusData));

      // For Sandbox apps, SEND_TO_USER_INBOX is the success state
      // Video goes to user's TikTok drafts for manual publishing
      if (status === 'PUBLISH_COMPLETE' || status === 'SEND_TO_USER_INBOX') {
        publishStatus = statusData.data;
        finalStatus = status;
        console.log(`✅ TikTok ${status === 'SEND_TO_USER_INBOX' ? 'sent to drafts (Sandbox mode)' : 'published'}`);
        break;
      } else if (status === 'FAILED') {
        const failReason = statusData.data?.fail_reason || 'Unknown error';
        console.error('❌ TikTok publish failed:', failReason, statusData);
        
        await supabase
          .from('posts')
          .update({ 
            error_message: `TikTok: ${failReason}`
          })
          .eq('id', postId);

        return new Response(
          JSON.stringify({ 
            error: `TikTok falhou: ${failReason}`,
            details: statusData.data
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } else if (status === 'PROCESSING_UPLOAD' || status === 'PROCESSING_DOWNLOAD') {
        console.log(`⏳ TikTok still processing: ${status}`);
        // Continue polling
      }
    }

    if (!publishStatus) {
      console.error('⏰ TikTok publish timed out after', attempts, 'attempts');
      return new Response(
        JSON.stringify({ 
          error: 'TikTok timeout - o vídeo ainda pode estar processando. Verifique sua caixa de entrada no TikTok.',
          timeout: true 
        }),
        { status: 408, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update post with TikTok post ID
    const currentPlatforms = post.platforms || ['instagram'];
    const updatedPlatforms = currentPlatforms.includes('tiktok') 
      ? currentPlatforms 
      : [...currentPlatforms, 'tiktok'];

    // For Sandbox mode, video goes to drafts - this is expected behavior
    const isSandboxMode = finalStatus === 'SEND_TO_USER_INBOX';
    const tiktokPostId = publishStatus.publicaly_available_post_id?.[0] || publishId;

    const { error: updateError } = await supabase
      .from('posts')
      .update({
        tiktok_post_id: tiktokPostId,
        status: 'published',
        published_at: new Date().toISOString(),
        platforms: updatedPlatforms,
        error_message: isSandboxMode 
          ? 'Vídeo enviado para rascunhos do TikTok (modo Sandbox). Publique manualmente no app.' 
          : null,
      })
      .eq('id', postId);

    if (updateError) {
      console.error('Failed to update post:', updateError);
    }

    console.log('✅ Successfully sent to TikTok:', {
      publishId,
      tiktokPostId,
      isSandboxMode,
      finalStatus
    });

    return new Response(
      JSON.stringify({ 
        success: true,
        tiktokPostId,
        sandboxMode: isSandboxMode,
        message: isSandboxMode 
          ? 'Vídeo enviado para sua caixa de entrada do TikTok! Abra o app TikTok para publicar manualmente.'
          : 'Post publicado no TikTok com sucesso!'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error in publish-to-tiktok:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
