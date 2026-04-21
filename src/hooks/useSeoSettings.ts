import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface SeoSettings {
  id: string;
  workspace_id: string;
  site_url: string | null;
  ga4_measurement_id: string | null;
  gsc_verification_code: string | null;
  enable_internal_analytics: boolean;
}

export function useSeoSettings(workspaceId?: string | null) {
  const [settings, setSettings] = useState<SeoSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      let query = supabase.from("seo_settings").select("*").limit(1);
      if (workspaceId) query = query.eq("workspace_id", workspaceId);
      const { data } = await query.maybeSingle();
      if (active) {
        setSettings((data as SeoSettings) || null);
        setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [workspaceId]);

  return { settings, loading, refresh: () => setSettings(null) };
}
