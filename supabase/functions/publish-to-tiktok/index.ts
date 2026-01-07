import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper function to wait
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

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

    // TikTok Content Posting API v2 - Initialize FILE_UPLOAD (no domain verification needed)
    console.log('Initializing TikTok upload with FILE_UPLOAD method...');
    const initResponse = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${account.access_token}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify({
        post_info: {
          title: caption.substring(0, 2200), // TikTok limit
          privacy_level: 'PUBLIC_TO_EVERYONE',
          disable_duet: false,
          disable_comment: false,
          disable_stitch: false,
          video_cover_timestamp_ms: 1000,
        },
        source_info: {
          source: 'FILE_UPLOAD',
          video_size: videoSize,
          chunk_size: videoSize, // Single chunk upload for simplicity
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
    let attempts = 0;
    const maxAttempts = 30; // 5 minutes max (10 second intervals)
    let publishStatus = null;

    while (attempts < maxAttempts) {
      await sleep(10000); // Wait 10 seconds between checks
      attempts++;

      const statusResponse = await fetch('https://open.tiktokapis.com/v2/post/publish/status/fetch/', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${account.access_token}`,
          'Content-Type': 'application/json; charset=UTF-8',
        },
        body: JSON.stringify({
          publish_id: publishId,
        }),
      });

      const statusData = await statusResponse.json();
      console.log(`TikTok status check ${attempts}:`, JSON.stringify(statusData));

      if (statusData.data?.status === 'PUBLISH_COMPLETE') {
        publishStatus = statusData.data;
        break;
      } else if (statusData.data?.status === 'FAILED') {
        console.error('TikTok publish failed:', statusData);
        
        await supabase
          .from('posts')
          .update({ 
            error_message: statusData.data.fail_reason || 'TikTok publish failed'
          })
          .eq('id', postId);

        return new Response(
          JSON.stringify({ 
            error: statusData.data.fail_reason || 'TikTok publish failed' 
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      // If still processing, continue polling
    }

    if (!publishStatus) {
      console.error('TikTok publish timed out');
      return new Response(
        JSON.stringify({ error: 'TikTok publish timed out - video may still be processing' }),
        { status: 408, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update post with TikTok post ID
    const currentPlatforms = post.platforms || ['instagram'];
    const updatedPlatforms = currentPlatforms.includes('tiktok') 
      ? currentPlatforms 
      : [...currentPlatforms, 'tiktok'];

    const { error: updateError } = await supabase
      .from('posts')
      .update({
        tiktok_post_id: publishStatus.publicaly_available_post_id?.[0] || publishId,
        status: 'published',
        published_at: new Date().toISOString(),
        platforms: updatedPlatforms,
        error_message: null,
      })
      .eq('id', postId);

    if (updateError) {
      console.error('Failed to update post:', updateError);
    }

    console.log('Successfully published to TikTok:', publishStatus);

    return new Response(
      JSON.stringify({ 
        success: true,
        tiktokPostId: publishStatus.publicaly_available_post_id?.[0] || publishId,
        message: 'Post published to TikTok successfully'
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
