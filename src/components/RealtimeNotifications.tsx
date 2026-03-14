import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { toast } from 'sonner';

/**
 * Listens for new/updated posts via Supabase Realtime
 * and triggers push notifications + toast alerts.
 * Also handles notification permission more aggressively for PWA.
 */
export function RealtimeNotifications() {
  const { user } = useAuth();
  const { isEnabled, isSupported, permission, requestPermission, sendNotification } = usePushNotifications();
  const hasRequestedPermission = useRef(false);

  // Request notification permission after login - retry on page visibility
  useEffect(() => {
    if (!user || !isSupported) return;

    const tryRequest = () => {
      if (Notification.permission === 'default' && !hasRequestedPermission.current) {
        hasRequestedPermission.current = true;
        requestPermission().then(granted => {
          if (granted) {
            console.log('[Notifications] ✅ Permission granted');
            // Send a test notification to confirm it works
            sendNotification({
              title: '🔔 Notificações Ativas!',
              body: 'Você receberá alertas quando o agente criar ou publicar conteúdo.',
              tag: 'welcome-notification',
            });
          } else {
            console.log('[Notifications] ❌ Permission denied');
            // Allow retry on next visibility change
            hasRequestedPermission.current = false;
          }
        });
      }
    };

    // Try after 3 seconds
    const timer = setTimeout(tryRequest, 3000);

    // Also try when page becomes visible (user returns to app)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        tryRequest();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [user, isSupported, requestPermission, sendNotification]);

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

          // Notify on status change to published
          if (old.status !== 'published' && post.status === 'published') {
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

          // Notify when video is rendered (draft/null -> scheduled with video_url)
          if (!old.video_url && post.video_url && post.status === 'scheduled') {
            const scheduledTime = post.scheduled_for
              ? new Intl.DateTimeFormat('pt-BR', {
                  timeZone: 'America/Sao_Paulo',
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: false,
                }).format(new Date(post.scheduled_for))
              : '';

            const title = '🎬 Vídeo Pronto!';
            const body = scheduledTime
              ? `Renderizado e agendado para ${scheduledTime} (BRT)`
              : 'Vídeo renderizado com sucesso!';

            toast.success(title, { description: body });

            if (isEnabled) {
              sendNotification({
                title,
                body,
                tag: 'video-rendered',
                requireInteraction: true,
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
