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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get all Instagram accounts
    const { data: accounts, error: fetchError } = await supabase
      .from('instagram_accounts')
      .select('*');

    if (fetchError) {
      throw new Error(`Failed to fetch accounts: ${fetchError.message}`);
    }

    if (!accounts || accounts.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No accounts to update' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const updatedAccounts: any[] = [];

    for (const account of accounts) {
      try {
        // Fetch profile picture from Instagram Graph API
        const igUrl = new URL(`https://graph.facebook.com/v18.0/${account.instagram_user_id}`);
        igUrl.searchParams.set('fields', 'id,username,profile_picture_url');
        igUrl.searchParams.set('access_token', account.access_token);

        const igResponse = await fetch(igUrl.toString());
        const igData = await igResponse.json();

        console.log(`Profile data for ${account.username}:`, JSON.stringify(igData));

        if (igData.error) {
          console.error(`Error fetching profile for ${account.username}:`, igData.error);
          continue;
        }

        if (igData.profile_picture_url) {
          // Update the account with profile picture
          const { error: updateError } = await supabase
            .from('instagram_accounts')
            .update({
              profile_picture_url: igData.profile_picture_url,
              updated_at: new Date().toISOString()
            })
            .eq('id', account.id);

          if (updateError) {
            console.error(`Error updating account ${account.username}:`, updateError);
            continue;
          }

          updatedAccounts.push({
            username: account.username,
            profilePictureUrl: igData.profile_picture_url
          });

          console.log(`Updated profile picture for ${account.username}`);
        }
      } catch (err) {
        console.error(`Error processing account ${account.username}:`, err);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Updated ${updatedAccounts.length} account(s)`,
        accounts: updatedAccounts
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error in sync-profile-picture:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});