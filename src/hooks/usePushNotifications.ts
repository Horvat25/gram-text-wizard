import { useState, useEffect, useCallback } from 'react';

interface NotificationOptions {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  requireInteraction?: boolean;
  data?: any;
}

export function usePushNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
    // Check if notifications are supported
    const supported = 'Notification' in window && 'serviceWorker' in navigator;
    setIsSupported(supported);

    if (supported) {
      setPermission(Notification.permission);
    }
  }, []);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!isSupported) return false;

    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      return result === 'granted';
    } catch (error) {
      console.error('Error requesting notification permission:', error);
      return false;
    }
  }, [isSupported]);

  const sendNotification = useCallback(async (options: NotificationOptions): Promise<boolean> => {
    if (!isSupported) {
      console.warn('Notifications not supported');
      return false;
    }

    if (permission !== 'granted') {
      console.warn('Notification permission not granted');
      return false;
    }

    try {
      // Check if we're in a service worker context (PWA installed)
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.ready;
        
        await registration.showNotification(options.title, {
          body: options.body,
          icon: options.icon || '/pwa-192x192.png',
          badge: options.badge || '/pwa-192x192.png',
          tag: options.tag,
          requireInteraction: options.requireInteraction ?? false,
          data: options.data
        });
        
        return true;
      } else {
        // Fallback to regular notification
        new Notification(options.title, {
          body: options.body,
          icon: options.icon || '/pwa-192x192.png',
          tag: options.tag,
        });
        return true;
      }
    } catch (error) {
      console.error('Error sending notification:', error);
      return false;
    }
  }, [isSupported, permission]);

  // Convenience methods for common notifications
  const notifyVideoReady = useCallback((videoTitle: string) => {
    return sendNotification({
      title: '🎬 Vídeo Pronto para Renderizar!',
      body: `O agente criou um novo vídeo: "${videoTitle.slice(0, 50)}...". Abra o app para renderizar.`,
      tag: 'video-ready',
      requireInteraction: true
    });
  }, [sendNotification]);

  const notifyPostPublished = useCallback((platform: string) => {
    return sendNotification({
      title: '✅ Post Publicado!',
      body: `Seu conteúdo foi publicado no ${platform} com sucesso.`,
      tag: 'post-published'
    });
  }, [sendNotification]);

  const notifyAgentAction = useCallback((action: string, details: string) => {
    return sendNotification({
      title: `🤖 Agente: ${action}`,
      body: details,
      tag: 'agent-action'
    });
  }, [sendNotification]);

  return {
    isSupported,
    permission,
    isEnabled: permission === 'granted',
    requestPermission,
    sendNotification,
    notifyVideoReady,
    notifyPostPublished,
    notifyAgentAction
  };
}
