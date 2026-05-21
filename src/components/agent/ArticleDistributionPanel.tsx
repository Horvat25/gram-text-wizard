import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from '@/hooks/useWorkspace';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import {
  Loader2, RefreshCw, Sparkles, Video, FileText, Copy,
  CheckCircle2, XCircle, Clock, ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type Format = 'carousel' | 'reels' | 'snippet';
type Status = 'pending' | 'generating' | 'ready' | 'failed' | 'published';

interface Article {
  id: string;
  title: string;
  link: string;
  image_url: string | null;
  source_name: string;
  published_at: string | null;
}

interface Distribution {
  id: string;
  rss_item_id: string;
  format: Format;
  status: Status;
  post_id: string | null;
  payload: any;
  cta_url: string | null;
  cta_clicks: number;
  error_message: string | null;
}

const FORMATS: { key: Format; label: string; icon: any }[] = [
  { key: 'carousel', label: 'Carrossel', icon: Sparkles },
  { key: 'reels', label: 'Reels', icon: Video },
  { key: 'snippet', label: 'Snippets', icon: FileText },
];

export default function ArticleDistributionPanel() {
  const { currentWorkspace } = useWorkspace();
  const [articles, setArticles] = useState<Article[]>([]);
  const [distributions, setDistributions] = useState<Distribution[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<Record<string, Format | 'all' | undefined>>({});
  const [openSnippets, setOpenSnippets] = useState<string | null>(null);

  const load = async () => {
    if (!currentWorkspace) return;
    setLoading(true);
    const { data: arts } = await supabase
      .from('rss_items')
      .select('id,title,link,image_url,source_name,published_at')
      .eq('source_name', 'Atualização Neural')
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(50);
    const { data: dists } = await supabase
      .from('article_distributions')
      .select('*')
      .eq('workspace_id', currentWorkspace.id);
    setArticles((arts || []) as any);
    setDistributions((dists || []) as any);
    setLoading(false);
  };

  useEffect(() => { load(); }, [currentWorkspace?.id]);

  // realtime
  useEffect(() => {
    if (!currentWorkspace) return;
    const ch = supabase
      .channel('article_distributions_changes')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'article_distributions',
        filter: `workspace_id=eq.${currentWorkspace.id}`,
      }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [currentWorkspace?.id]);

  const generate = async (rssId: string, formats: Format[] | 'all') => {
    const formatsArr = formats === 'all' ? ['carousel', 'reels', 'snippet'] : formats;
    const key = formats === 'all' ? 'all' : formats[0];
    setRunning(prev => ({ ...prev, [rssId]: key }));
    try {
      const { data, error } = await supabase.functions.invoke('article-to-instagram', {
        body: { rss_item_id: rssId, formats: formatsArr },
      });
      if (error) throw error;
      toast.success('Geração iniciada', {
        description: formatsArr.join(', '),
      });
      await load();
    } catch (e: any) {
      toast.error('Falha ao gerar', { description: e.message });
    } finally {
      setRunning(prev => ({ ...prev, [rssId]: undefined }));
    }
  };

  const distFor = (rssId: string, fmt: Format) =>
    distributions.find(d => d.rss_item_id === rssId && d.format === fmt);

  const copyText = (txt: string) => {
    navigator.clipboard.writeText(txt);
    toast.success('Copiado!');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Artigos → Instagram</h3>
          <p className="text-xs text-muted-foreground">
            Cada artigo do Neural Update vira carrossel, reels e snippets.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={load} className="h-7 gap-1">
          <RefreshCw className="h-3 w-3" /> Atualizar
        </Button>
      </div>

      {articles.length === 0 && (
        <Card className="p-6 text-center text-xs text-muted-foreground">
          Nenhum artigo do Neural Update encontrado. Aguarde o próximo fetch RSS (08h / 14h).
        </Card>
      )}

      <ScrollArea className="max-h-[70vh]">
        <div className="space-y-3 pr-2">
          {articles.map(art => {
            const distMap = Object.fromEntries(
              FORMATS.map(f => [f.key, distFor(art.id, f.key)]),
            ) as Record<Format, Distribution | undefined>;
            const isRunningAll = running[art.id] === 'all';
            const snippetData = distMap.snippet?.payload;
            const isSnippetOpen = openSnippets === art.id && snippetData;

            return (
              <Card key={art.id} className="p-3 bg-card/50 border-border/60">
                <div className="flex gap-3">
                  {art.image_url && (
                    <img
                      src={art.image_url}
                      className="w-16 h-16 rounded object-cover shrink-0"
                      alt=""
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <a
                      href={art.link}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm font-medium leading-tight line-clamp-2 hover:underline flex items-start gap-1"
                    >
                      {art.title}
                      <ExternalLink className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground" />
                    </a>
                    {art.published_at && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {new Date(art.published_at).toLocaleDateString('pt-BR', {
                          day: '2-digit', month: 'short', year: 'numeric',
                        })}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 mt-3">
                  {FORMATS.map(({ key, label, icon: Icon }) => {
                    const d = distMap[key];
                    const status = d?.status || 'pending';
                    const isRunning = running[art.id] === key || status === 'generating';
                    return (
                      <Button
                        key={key}
                        variant={status === 'ready' || status === 'published' ? 'secondary' : 'outline'}
                        size="sm"
                        className={cn(
                          'h-7 gap-1 text-[11px]',
                          status === 'ready' && 'border-green-500/40 text-green-600 dark:text-green-400',
                          status === 'failed' && 'border-red-500/40 text-red-600 dark:text-red-400',
                        )}
                        disabled={isRunning || isRunningAll}
                        onClick={() => {
                          if (key === 'snippet' && (status === 'ready' || status === 'published')) {
                            setOpenSnippets(isSnippetOpen ? null : art.id);
                          } else {
                            generate(art.id, [key]);
                          }
                        }}
                        title={d?.error_message || label}
                      >
                        {isRunning ? <Loader2 className="h-3 w-3 animate-spin" /> :
                          status === 'ready' || status === 'published' ? <CheckCircle2 className="h-3 w-3" /> :
                          status === 'failed' ? <XCircle className="h-3 w-3" /> :
                          status === 'generating' ? <Clock className="h-3 w-3" /> :
                          <Icon className="h-3 w-3" />}
                        {label}
                      </Button>
                    );
                  })}

                  <div className="flex-1" />

                  <Button
                    variant="default"
                    size="sm"
                    className="h-7 gap-1 text-[11px] neural-gradient"
                    disabled={isRunningAll}
                    onClick={() => generate(art.id, 'all')}
                  >
                    {isRunningAll ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                    Gerar tudo
                  </Button>
                </div>

                {isSnippetOpen && snippetData && (
                  <div className="mt-3 p-3 rounded bg-muted/40 border border-border/40 space-y-2 text-xs">
                    {snippetData.tldr && (
                      <SnippetBlock label="TL;DR" items={[snippetData.tldr]} onCopy={copyText} />
                    )}
                    {Array.isArray(snippetData.stories) && (
                      <SnippetBlock label="Stories" items={snippetData.stories} onCopy={copyText} />
                    )}
                    {Array.isArray(snippetData.tweets) && (
                      <SnippetBlock label="Tweets" items={snippetData.tweets} onCopy={copyText} />
                    )}
                    {Array.isArray(snippetData.hooks) && (
                      <SnippetBlock label="Hooks" items={snippetData.hooks} onCopy={copyText} />
                    )}
                  </div>
                )}

                {distMap.carousel?.status === 'ready' && distMap.carousel.post_id && (
                  <p className="text-[10px] text-muted-foreground mt-2">
                    ✓ Carrossel rascunho criado — revise na Fila
                  </p>
                )}
                {distMap.reels?.status === 'ready' && distMap.reels.post_id && (
                  <p className="text-[10px] text-muted-foreground">
                    ✓ Reels renderizado — agendado na Fila
                  </p>
                )}
              </Card>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}

function SnippetBlock({
  label, items, onCopy,
}: { label: string; items: string[]; onCopy: (t: string) => void }) {
  return (
    <div>
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
        {label}
      </p>
      <ul className="space-y-1">
        {items.map((it, i) => (
          <li key={i} className="flex items-start gap-2 group">
            <span className="flex-1 leading-snug">{it}</span>
            <button
              onClick={() => onCopy(it)}
              className="opacity-0 group-hover:opacity-100 transition shrink-0"
              title="Copiar"
            >
              <Copy className="h-3 w-3" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
