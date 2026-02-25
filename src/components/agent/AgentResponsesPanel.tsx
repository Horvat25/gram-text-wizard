import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { 
  X, 
  FileText,
  Loader2,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronRight,
  Sparkles,
  TrendingUp,
  Lightbulb,
  Zap,
  Clock,
  Bot,
  Pause
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspace } from '@/hooks/useWorkspace';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface ExecutionReport {
  id: string;
  trigger: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  metrics_snapshot: any;
  decision: string | null;
  decision_reason: string | null;
  content_plan: any;
  post_id: string | null;
  summary: string | null;
  hypothesis: string | null;
  learning: string | null;
  created_at: string;
}

interface ChatAction {
  id: string;
  created_at: string;
  content: string;
  actions: Array<{
    tool: string;
    success: boolean;
    message: string;
  }>;
}

interface AgentResponsesPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AgentResponsesPanel({ isOpen, onClose }: AgentResponsesPanelProps) {
  const { user } = useAuth();
  const { currentWorkspace } = useWorkspace();
  const [reports, setReports] = useState<ExecutionReport[]>([]);
  const [chatActions, setChatActions] = useState<ChatAction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchData = async () => {
    if (!user || !currentWorkspace) return;
    
    setIsLoading(true);
    try {
      const { data: reportsData } = await supabase
        .from('agent_execution_reports')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(30);

      setReports((reportsData as ExecutionReport[]) || []);

      const { data: chatData } = await supabase
        .from('agent_chat_messages')
        .select('*')
        .eq('workspace_id', currentWorkspace.id)
        .eq('role', 'assistant')
        .not('actions', 'is', null)
        .order('created_at', { ascending: false })
        .limit(30);

      const actionsData = (chatData || [])
        .filter((m: any) => Array.isArray(m.actions) && m.actions.length > 0)
        .map((m: any) => ({
          id: m.id,
          created_at: m.created_at,
          content: m.content,
          actions: m.actions as ChatAction['actions']
        }));
      
      setChatActions(actionsData);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && user && currentWorkspace) {
      fetchData();
    }
  }, [isOpen, user, currentWorkspace]);

  const getDecisionIcon = (decision: string | null) => {
    switch (decision) {
      case 'POST': return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
      case 'NO_POST': return <XCircle className="h-4 w-4 text-amber-500" />;
      case 'WAIT': return <Pause className="h-4 w-4 text-blue-500" />;
      default: return <Bot className="h-4 w-4" />;
    }
  };

  const getDecisionLabel = (decision: string | null) => {
    switch (decision) {
      case 'POST': return 'Publicou';
      case 'NO_POST': return 'Não Publicou';
      case 'WAIT': return 'Aguardou';
      default: return 'Processando';
    }
  };

  const allItems = [
    ...reports.map(r => ({ type: 'report' as const, data: r, date: new Date(r.created_at) })),
    ...chatActions.map(a => ({ type: 'action' as const, data: a, date: new Date(a.created_at) }))
  ].sort((a, b) => b.date.getTime() - a.date.getTime());

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: 100 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 100 }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          className="fixed left-1/2 -translate-x-1/2 top-2 sm:top-4 bottom-16 sm:bottom-24 w-full sm:w-[500px] max-w-[calc(100vw-1rem)] sm:max-w-[calc(100vw-2rem)] z-30 flex flex-col bg-card/95 backdrop-blur-xl rounded-2xl border border-border/50 shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border/50">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-gradient-to-br from-primary/20 to-violet-500/20">
                <FileText className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="font-semibold text-sm">Respostas & Ações</h2>
                <p className="text-xs text-muted-foreground">
                  Histórico de execuções do agente
                </p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
              <X className="h-4 w-4" />
            </Button>
          </div>
          
          {/* Content */}
          {isLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : allItems.length > 0 ? (
            <ScrollArea className="flex-1 p-3">
              <div className="space-y-2">
                {allItems.map((item) => {
                  const isExpanded = expandedId === item.data.id;
                  
                  if (item.type === 'report') {
                    const report = item.data as ExecutionReport;
                    return (
                      <motion.div
                        key={report.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="border rounded-xl overflow-hidden border-border/50 hover:border-primary/30 transition-colors"
                      >
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : report.id)}
                          className="w-full p-3 flex items-center justify-between bg-card hover:bg-muted/30 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            {getDecisionIcon(report.decision)}
                            <div className="text-left">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-xs">
                                  {getDecisionLabel(report.decision)}
                                </Badge>
                                <Badge variant="outline" className="text-xs">
                                  {report.trigger === 'cron' ? '⏰ Auto' : '🖐️ Manual'}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">
                                {formatDistanceToNow(new Date(report.created_at), { addSuffix: true, locale: ptBR })}
                              </p>
                            </div>
                          </div>
                          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </button>
                        
                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="border-t border-border/30"
                            >
                              <div className="p-3 space-y-3 bg-muted/10">
                                {report.summary && (
                                  <div className="p-2.5 rounded-lg bg-primary/5 border border-primary/20">
                                    <div className="flex items-start gap-2">
                                      <Sparkles className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                                      <p className="text-sm">{report.summary}</p>
                                    </div>
                                  </div>
                                )}
                                
                                {report.decision_reason && (
                                  <div className="text-sm">
                                    <p className="font-medium text-xs mb-1 text-muted-foreground">💭 Raciocínio</p>
                                    <p className="text-sm">{report.decision_reason}</p>
                                  </div>
                                )}
                                
                                {report.metrics_snapshot && (
                                  <div className="p-2.5 rounded-lg bg-muted/30 border border-border/50">
                                    <p className="text-xs font-medium mb-2 flex items-center gap-1 text-muted-foreground">
                                      <TrendingUp className="h-3 w-3" />
                                      Métricas
                                    </p>
                                    <div className="grid grid-cols-3 gap-2 text-xs">
                                      <div className="text-center p-1.5 rounded bg-card/50">
                                        <div className="font-medium">{report.metrics_snapshot.avgEngagement?.toFixed(1) || '0'}%</div>
                                        <div className="text-muted-foreground text-[10px]">Engajamento</div>
                                      </div>
                                      <div className="text-center p-1.5 rounded bg-card/50">
                                        <div className="font-medium">{Math.round(report.metrics_snapshot.lastPostHours || 0)}h</div>
                                        <div className="text-muted-foreground text-[10px]">Último post</div>
                                      </div>
                                      <div className="text-center p-1.5 rounded bg-card/50">
                                        <div className="font-medium">{report.metrics_snapshot.postsToday || 0}</div>
                                        <div className="text-muted-foreground text-[10px]">Hoje</div>
                                      </div>
                                    </div>
                                  </div>
                                )}
                                
                                {report.hypothesis && (
                                  <div className="p-2.5 rounded-lg bg-amber-500/5 border border-amber-500/20">
                                    <p className="text-xs font-medium mb-1 flex items-center gap-1 text-amber-600">
                                      <Lightbulb className="h-3 w-3" />
                                      Hipótese
                                    </p>
                                    <p className="text-sm">{report.hypothesis}</p>
                                  </div>
                                )}
                                
                                {report.learning && (
                                  <div className="p-2.5 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                                    <p className="text-xs font-medium mb-1 text-emerald-600">🎓 Aprendizado</p>
                                    <p className="text-sm">{report.learning}</p>
                                  </div>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.div>
                    );
                  } else {
                    const action = item.data as ChatAction;
                    const successCount = action.actions.filter(a => a.success).length;
                    const totalCount = action.actions.length;
                    
                    return (
                      <motion.div
                        key={action.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="border rounded-xl overflow-hidden border-border/50 hover:border-primary/30 transition-colors"
                      >
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : action.id)}
                          className="w-full p-3 flex items-center justify-between bg-card hover:bg-muted/30 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div className="p-1.5 rounded-lg bg-primary/10">
                              <Zap className="h-4 w-4 text-primary" />
                            </div>
                            <div className="text-left">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className={cn(
                                  "text-xs",
                                  successCount === totalCount 
                                    ? "text-emerald-600 border-emerald-500/30"
                                    : "text-amber-600 border-amber-500/30"
                                )}>
                                  {successCount}/{totalCount} ações
                                </Badge>
                                <Badge variant="outline" className="text-xs">💬 Chat</Badge>
                              </div>
                              <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                                {action.content.slice(0, 40)}...
                              </p>
                            </div>
                          </div>
                          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </button>
                        
                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="border-t border-border/30"
                            >
                              <div className="p-3 space-y-2 bg-muted/10">
                                {action.actions.map((act, idx) => (
                                  <div
                                    key={idx}
                                    className={cn(
                                      "flex items-center gap-2 p-2 rounded-lg border",
                                      act.success 
                                        ? "bg-emerald-500/10 border-emerald-500/30" 
                                        : "bg-destructive/10 border-destructive/30"
                                    )}
                                  >
                                    {act.success ? (
                                      <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                                    ) : (
                                      <XCircle className="h-4 w-4 text-destructive shrink-0" />
                                    )}
                                    <span className="flex-1 text-sm truncate">
                                      {act.message}
                                    </span>
                                    <Badge variant="outline" className="text-[10px] shrink-0">
                                      {act.tool.replace(/_/g, ' ')}
                                    </Badge>
                                  </div>
                                ))}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.div>
                    );
                  }
                })}
              </div>
            </ScrollArea>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-4 text-center">
              <Clock className="h-12 w-12 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">Nenhuma atividade registrada</p>
              <p className="text-xs text-muted-foreground mt-1">
                Use o chat para executar ações
              </p>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
