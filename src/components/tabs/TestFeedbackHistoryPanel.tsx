import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from '@/hooks/useWorkspace';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Copy, MessageSquare, ThumbsUp, ThumbsDown, RefreshCw, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface FeedbackEntry {
  id: string;
  decision: string;
  decision_reason: string | null;
  learning: string | null;
  expected_engagement: number | null;
  created_at: string;
  post_id: string | null;
}

const decisionConfig: Record<
  string,
  { label: string; icon: typeof ThumbsUp; cls: string }
> = {
  test_approved: { label: 'Aprovado', icon: ThumbsUp, cls: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30' },
  test_rejected: { label: 'Rejeitado', icon: ThumbsDown, cls: 'bg-destructive/10 text-destructive border-destructive/30' },
  test_regenerated: { label: 'Refeito', icon: RefreshCw, cls: 'bg-amber-500/10 text-amber-600 border-amber-500/30' },
};

export default function TestFeedbackHistoryPanel() {
  const { currentWorkspace } = useWorkspace();
  const [entries, setEntries] = useState<FeedbackEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const load = async () => {
    if (!currentWorkspace?.id) return;
    setLoading(true);
    const { data } = await supabase
      .from('agent_decisions')
      .select('id, decision, decision_reason, learning, expected_engagement, created_at, post_id')
      .eq('workspace_id', currentWorkspace.id)
      .in('decision', ['test_approved', 'test_rejected', 'test_regenerated'])
      .order('created_at', { ascending: false })
      .limit(20);
    setEntries((data as FeedbackEntry[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWorkspace?.id]);

  const formatForCopy = (e: FeedbackEntry) => {
    const cfg = decisionConfig[e.decision];
    const date = new Date(e.created_at).toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    const stars = e.expected_engagement ? `${e.expected_engagement}/5 ⭐` : 'sem nota';
    const reason = e.decision_reason || '(sem texto)';
    return `[${date}] ${cfg?.label || e.decision} (${stars})\nFeedback: ${reason}`;
  };

  const copyOne = async (e: FeedbackEntry) => {
    await navigator.clipboard.writeText(formatForCopy(e));
    toast.success('Copiado! Cole no chat do Lovable.');
  };

  const copyAll = async () => {
    if (entries.length === 0) return;
    const all = entries.map(formatForCopy).join('\n\n---\n\n');
    await navigator.clipboard.writeText(all);
    toast.success(`${entries.length} feedbacks copiados!`);
  };

  const clearAll = async () => {
    if (!currentWorkspace?.id || entries.length === 0) return;
    if (!confirm(`Apagar os ${entries.length} feedbacks salvos?`)) return;
    await supabase
      .from('agent_decisions')
      .delete()
      .eq('workspace_id', currentWorkspace.id)
      .in('decision', ['test_approved', 'test_rejected', 'test_regenerated']);
    toast.success('Feedbacks limpos');
    load();
  };

  return (
    <Card className="border-primary/20">
      <CardContent className="p-3 space-y-2">
        <button
          onClick={() => setOpen(!open)}
          className="w-full flex items-center justify-between gap-2"
        >
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-primary" />
            <p className="text-xs font-semibold">📋 Feedbacks dos Testes</p>
            <Badge variant="secondary" className="text-[10px]">
              {entries.length}
            </Badge>
          </div>
          <span className="text-[10px] text-muted-foreground">
            {open ? 'fechar' : 'abrir'}
          </span>
        </button>

        {open && (
          <>
            <p className="text-[10px] text-muted-foreground">
              Cole no chat do Lovable para que eu (a IA) ajuste o código de geração baseado no que você testou.
            </p>

            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-[11px] flex-1"
                onClick={copyAll}
                disabled={entries.length === 0}
              >
                <Copy className="h-3 w-3 mr-1" />
                Copiar todos
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-[11px]"
                onClick={load}
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <RefreshCw className="h-3 w-3" />
                )}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-[11px] text-destructive"
                onClick={clearAll}
                disabled={entries.length === 0}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>

            {entries.length === 0 ? (
              <p className="text-[11px] text-muted-foreground text-center py-3">
                Nenhum feedback ainda. Aprove ou rejeite testes acima para começar.
              </p>
            ) : (
              <div className="max-h-[300px] overflow-y-auto space-y-1.5">
                {entries.map((e) => {
                  const cfg = decisionConfig[e.decision] || decisionConfig.test_rejected;
                  const Icon = cfg.icon;
                  const date = new Date(e.created_at).toLocaleString('pt-BR', {
                    timeZone: 'America/Sao_Paulo',
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  });
                  return (
                    <div
                      key={e.id}
                      className={cn(
                        'rounded-md border p-2 text-[11px] space-y-1',
                        cfg.cls
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <Icon className="h-3 w-3" />
                          <span className="font-semibold">{cfg.label}</span>
                          {e.expected_engagement ? (
                            <span className="text-[10px] opacity-70">
                              {e.expected_engagement}/5⭐
                            </span>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] opacity-70">{date}</span>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-5 w-5 p-0"
                            onClick={() => copyOne(e)}
                          >
                            <Copy className="h-2.5 w-2.5" />
                          </Button>
                        </div>
                      </div>
                      <p className="text-foreground/80 leading-snug">
                        {e.decision_reason || <span className="opacity-50 italic">sem texto</span>}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
