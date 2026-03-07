import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { toast } from 'sonner';

/**
 * Listens for new/updated posts via Supabase Realtime
 * and triggers push notifications + toast alerts.
 */
export function RealtimeNotifications() {
  const { user } = useAuth();
  const { isEnabled, requestPermission, sendNotification } = usePushNotifications();
  const hasRequestedPermission = useRef(false);

  // Request notification permission after login
  useEffect(() => {
    if (user && !hasRequestedPermission.current) {
      hasRequestedPermission.current = true;
      const timer = setTimeout(() => {
        if (Notification.permission === 'default') {
          requestPermission();
        }
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [user, requestPermission]);

  // Subscribe to posts table changes
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('posts-notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'posts',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const post = payload.new as any;
          const isReels = post.media_type === 'reels' || post.media_type === 'reel';
          const title = isReels
            ? '🎬 Novo Reels Criado!'
            : '📝 Novo Post Criado!';
          const body = (post.caption || '').split('\n')[0].substring(0, 80);

          toast.info(title, { description: body || 'O agente criou novo conteúdo.' });

          if (isEnabled) {
            sendNotification({
              title,
              body: body || 'O agente criou novo conteúdo. Abra o app para revisar.',
              tag: 'agent-new-post',
              requireInteraction: true,
            });
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'posts',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const post = payload.new as any;
          const old = payload.old as any;

          // Only notify on actual status change to published (not metric syncs)
          if (old.status !== 'published' && post.status === 'published') {
            // Debounce: don't show if published_at is older than 2 minutes
            const publishedAt = post.published_at ? new Date(post.published_at).getTime() : Date.now();
            const now = Date.now();
            if (now - publishedAt > 2 * 60 * 1000) return;

            const title = '✅ Post Publicado!';
            const body = (post.caption || '').split('\n')[0].substring(0, 80);

            toast.success(title, { description: body });

            if (isEnabled) {
              sendNotification({
                title,
                body: body || 'Seu conteúdo foi publicado com sucesso.',
                tag: 'post-published',
              });
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, isEnabled, sendNotification]);

  return null;
}
