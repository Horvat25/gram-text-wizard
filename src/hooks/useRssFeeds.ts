import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useWorkspace } from './useWorkspace';
import { toast } from 'sonner';

export interface RssItem {
  id?: string;
  title: string;
  description: string;
  link: string;
  imageUrl: string | null;
  publishedAt: string | null;
  sourceName: string;
  sourceUrl: string;
  hasImage: boolean;
  isUsed?: boolean;
}

export interface RssFeed {
  name: string;
  url: string;
}

export interface RssStats {
  totalItems: number;
  withImages: number;
  withoutImages: number;
  savedToDb: number;
  skippedDuplicates: number;
  sources: number;
  errors: number;
}

// Feeds padrão de tecnologia brasileira - EXPANDIDO para mais fontes
export const DEFAULT_FEEDS: RssFeed[] = [
  { name: 'Olhar Digital', url: 'https://olhardigital.com.br/feed/' },
  { name: 'TecMundo', url: 'https://rss.tecmundo.com.br/feed' },
  { name: 'Canaltech', url: 'https://canaltech.com.br/rss/' },
  { name: 'Tecnoblog', url: 'https://tecnoblog.net/feed/' },
  { name: 'Gizmodo Brasil', url: 'https://gizmodo.uol.com.br/feed/' },
  { name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml' },
  { name: 'Ars Technica', url: 'https://feeds.arstechnica.com/arstechnica/index' },
  { name: 'Wired', url: 'https://www.wired.com/feed/rss' },
  { name: 'TechCrunch', url: 'https://techcrunch.com/feed/' },
  { name: 'Engadget', url: 'https://www.engadget.com/rss.xml' },
];

export function useRssFeeds() {
  const { user } = useAuth();
  const { currentWorkspace } = useWorkspace();
  const [items, setItems] = useState<RssItem[]>([]);
  const [stats, setStats] = useState<RssStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Buscar feeds RSS e salvar no banco
  const fetchFeeds = useCallback(async (feeds?: RssFeed[], limit = 10) => {
    if (!user?.id || !currentWorkspace) {
      toast.error('Faça login e selecione um workspace para buscar notícias');
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('fetch-rss', {
        body: {
          userId: user.id,
          workspaceId: currentWorkspace.id,
          feeds: feeds || DEFAULT_FEEDS,
          saveToDb: true,
          limit,
        },
      });

      if (fnError) throw fnError;

      if (data?.success) {
        // Converter formato da API para formato do hook
        const mappedItems: RssItem[] = (data.items || []).map((item: any) => ({
          title: item.title,
          description: item.description,
          link: item.link,
          imageUrl: item.imageUrl,
          publishedAt: item.publishedAt,
          sourceName: item.sourceName,
          sourceUrl: item.sourceUrl,
          hasImage: !!item.imageUrl,
        }));

        setItems(mappedItems);
        setStats(data.stats);

        toast.success(`${data.stats.totalItems} notícias encontradas! (${data.stats.withImages} com imagem)`);
        return data;
      } else {
        throw new Error(data?.error || 'Erro ao buscar feeds');
      }
    } catch (err: any) {
      console.error('Error fetching RSS:', err);
      setError(err.message);
      toast.error(err.message || 'Erro ao buscar feeds RSS');
      return null;
    } finally {
      setLoading(false);
    }
  }, [user?.id, currentWorkspace]);

  // Carregar itens salvos do banco
  const loadSavedItems = useCallback(async (onlyWithImages = false, onlyUnused = true) => {
    if (!user?.id || !currentWorkspace) return null;

    setLoading(true);
    try {
      let query = supabase
        .from('rss_items')
        .select('*')
        .eq('workspace_id', currentWorkspace.id)
        .order('fetched_at', { ascending: false })
        .limit(50);

      if (onlyWithImages) {
        query = query.eq('has_image', true);
      }
      if (onlyUnused) {
        query = query.eq('is_used', false);
      }

      const { data, error: dbError } = await query;

      if (dbError) throw dbError;

      const mappedItems: RssItem[] = (data || []).map((item: any) => ({
        id: item.id,
        title: item.title,
        description: item.description,
        link: item.link,
        imageUrl: item.image_url,
        publishedAt: item.published_at,
        sourceName: item.source_name,
        sourceUrl: item.source_url,
        hasImage: item.has_image,
        isUsed: item.is_used,
      }));

      setItems(mappedItems);
      return mappedItems;
    } catch (err: any) {
      console.error('Error loading saved RSS items:', err);
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [user?.id, currentWorkspace]);

  // Marcar item como usado (vinculado a um post)
  const markAsUsed = useCallback(async (itemId: string, postId: string) => {
    if (!user?.id || !currentWorkspace) return false;

    try {
      const { error: updateError } = await supabase
        .from('rss_items')
        .update({
          is_used: true,
          used_in_post_id: postId,
        })
        .eq('id', itemId)
        .eq('workspace_id', currentWorkspace.id);

      if (updateError) throw updateError;

      // Atualizar estado local
      setItems(prev => prev.map(item => 
        item.id === itemId ? { ...item, isUsed: true } : item
      ));

      return true;
    } catch (err: any) {
      console.error('Error marking RSS item as used:', err);
      return false;
    }
  }, [user?.id, currentWorkspace]);

  // Deletar itens antigos (limpeza)
  const cleanupOldItems = useCallback(async (daysOld = 7) => {
    if (!user?.id || !currentWorkspace) return 0;

    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      const { data, error: deleteError } = await supabase
        .from('rss_items')
        .delete()
        .eq('workspace_id', currentWorkspace.id)
        .eq('is_used', false)
        .lt('fetched_at', cutoffDate.toISOString())
        .select('id');

      if (deleteError) throw deleteError;

      const deletedCount = data?.length || 0;
      if (deletedCount > 0) {
        toast.success(`${deletedCount} notícias antigas removidas`);
      }
      return deletedCount;
    } catch (err: any) {
      console.error('Error cleaning up RSS items:', err);
      return 0;
    }
  }, [user?.id, currentWorkspace]);

  return {
    items,
    stats,
    loading,
    error,
    fetchFeeds,
    loadSavedItems,
    markAsUsed,
    cleanupOldItems,
    DEFAULT_FEEDS,
  };
}
