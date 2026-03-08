import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('[AUTO-RSS] Starting daily auto-fetch for all workspaces...');

    // Get all workspaces with their owners
    const { data: workspaces, error: wsError } = await supabase
      .from('workspace_members')
      .select('workspace_id, user_id')
      .eq('role', 'owner');

    if (wsError) throw wsError;
    if (!workspaces || workspaces.length === 0) {
      console.log('[AUTO-RSS] No workspaces found');
      return new Response(JSON.stringify({ success: true, message: 'No workspaces' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[AUTO-RSS] Found ${workspaces.length} workspaces to process`);

    const results: any[] = [];

    for (const ws of workspaces) {
      try {
        // Call fetch-rss for each workspace
        const fetchUrl = `${supabaseUrl}/functions/v1/fetch-rss`;
        const response = await fetch(fetchUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            userId: ws.user_id,
            workspaceId: ws.workspace_id,
            saveToDb: true,
            limit: 8, // Only top 8 per feed to keep lean
          }),
        });

        const data = await response.json();
        console.log(`[AUTO-RSS] Workspace ${ws.workspace_id}: ${data.stats?.savedToDb || 0} new items saved`);
        results.push({
          workspaceId: ws.workspace_id,
          saved: data.stats?.savedToDb || 0,
          cleaned: data.stats?.cleaned || 0,
        });
      } catch (wsErr: any) {
        console.error(`[AUTO-RSS] Error for workspace ${ws.workspace_id}:`, wsErr.message);
        results.push({ workspaceId: ws.workspace_id, error: wsErr.message });
      }
    }

    console.log('[AUTO-RSS] Completed for all workspaces');

    return new Response(
      JSON.stringify({ success: true, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('[AUTO-RSS] Fatal error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
