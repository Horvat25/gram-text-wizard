import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

const SESSION_KEY = "nu_session_id";

function getSessionId(): string {
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = `s_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return `s_${Date.now()}`;
  }
}

interface Options {
  workspaceId?: string | null;
  enabled?: boolean;
  pageType?: string;
  articleSlug?: string;
}

/**
 * Tracks pageviews to the internal analytics database.
 * Should be called inside the public portal layout.
 */
export function usePageTracking(opts: Options = {}) {
  const { pathname } = useLocation();
  const { workspaceId, enabled = true, pageType, articleSlug } = opts;

  useEffect(() => {
    if (!enabled) return;
    const sessionId = getSessionId();
    const referrer = document.referrer || "";

    // Fire-and-forget
    supabase.functions.invoke("track-pageview", {
      body: {
        workspace_id: workspaceId,
        page_path: pathname,
        page_type: pageType || (pathname.startsWith("/artigo/") ? "article" : "page"),
        article_slug: articleSlug || (pathname.startsWith("/artigo/") ? pathname.replace("/artigo/", "") : null),
        referrer,
        session_id: sessionId,
      },
    }).catch(() => {
      /* never break the site */
    });
  }, [pathname, enabled, workspaceId, pageType, articleSlug]);
}
