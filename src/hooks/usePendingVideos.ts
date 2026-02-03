import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

interface PendingVideo {
  id: string;
  caption: string;
  created_at: string;
  image_url: string | null;
  overlay_metadata: {
    type: string;
    script: any;
    topic: string;
    needs_processing: boolean;
    created_by_agent: boolean;
    publish_after_render?: boolean;
  };
}

export function usePendingVideos() {
  const { user } = useAuth();
  const [pendingVideos, setPendingVideos] = useState<PendingVideo[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchPendingVideos = useCallback(async () => {
    if (!user) return;

    setIsLoading(true);
    try {
      // Query for draft reels that have overlay_metadata with needs_processing = true
      const { data, error } = await supabase
        .from('posts')
        .select('id, caption, created_at, image_url, overlay_metadata')
        .eq('user_id', user.id)
        .eq('status', 'draft')
        .eq('media_type', 'reels')
        .is('video_url', null)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;

      // Filter to only those with needs_processing flag
      const pending = (data || []).filter((post: any) => {
        const metadata = post.overlay_metadata;
        return metadata && 
               typeof metadata === 'object' && 
               'needs_processing' in metadata &&
               metadata.needs_processing === true;
      }) as PendingVideo[];

      setPendingVideos(pending);
    } catch (error) {
      console.error('Error fetching pending videos:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchPendingVideos();
    
    // Refresh every 30 seconds
    const interval = setInterval(fetchPendingVideos, 30000);
    return () => clearInterval(interval);
  }, [fetchPendingVideos]);

  return {
    pendingVideos,
    isLoading,
    refetch: fetchPendingVideos,
    count: pendingVideos.length
  };
}
