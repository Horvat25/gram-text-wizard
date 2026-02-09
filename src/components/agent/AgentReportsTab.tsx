import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  FileText, 
  Bot, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  Pause,
  TrendingUp,
  Lightbulb,
  RefreshCw,
  Loader2,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Zap,
  Play
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspace } from '@/hooks/useWorkspace';
import { motion, AnimatePresence } from 'framer-motion';
import { formatDistanceToNow, format } from 'date-fns';
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

interface ReportCardProps {
  report: ExecutionReport;
  isExpanded: boolean;
  onToggle: () => void;
}

function ReportCard({ report, isExpanded, onToggle }: ReportCardProps) {
  const getDecisionColor = (decision: string | null) => {
    switch (decision) {
      case 'POST':
        return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30';
      case 'NO_POST':
        return 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-300 border-yellow-500/30';
      case 'WAIT':
        return 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30';
      default:
        return 'bg-muted';
    }
  };

  const getDecisionIcon = (decision: string | null) => {
    switch (decision) {
      case 'POST': return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
      case 'NO_POST': return <XCircle className="h-4 w-4 text-yellow-500" />;
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

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="border rounded-xl overflow-hidden transition-colors border-border hover:border-primary/30"
    >
      <button
        onClick={onToggle}
        className="w-full p-3 flex items-center justify-between transition-colors bg-card hover:bg-muted/30"
      >
        <div className="flex items-center gap-3">
          {getDecisionIcon(report.decision)}
          <div className="text-left">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={cn("text-xs", getDecisionColor(report.decision))}>
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
        {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-border/50"
          >
            <div className="p-3 space-y-3 bg-muted/10">
              {report.summary && (
                <div className="p-2.5 rounded-lg border bg-primary/5 border-primary/20">
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
                <div className="p-2.5 rounded-lg bg-muted/30 border">
                  <p className="text-xs font-medium mb-2 flex items-center gap-1 text-muted-foreground">
                    <TrendingUp className="h-3 w-3" />
                    Métricas
                  </p>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="text-center p-1.5 rounded bg-background/50">
                      <div className="font-medium">{report.metrics_snapshot.avgEngagement?.toFixed(1) || '0'}%</div>
                      <div className="text-muted-foreground text-[10px]">Engajamento</div>
                    </div>
                    <div className="text-center p-1.5 rounded bg-background/50">
                      <div className="font-medium">{Math.round(report.metrics_snapshot.lastPostHours || 0)}h</div>
                      <div className="text-muted-foreground text-[10px]">Último post</div>
                    </div>
                    <div className="text-center p-1.5 rounded bg-background/50">
                      <div className="font-medium">{report.metrics_snapshot.postsToday || 0}</div>
                      <div className="text-muted-foreground text-[10px]">Hoje</div>
                    </div>
                  </div>
                </div>
              )}

              {report.hypothesis && (
                <div className="text-sm p-2.5 rounded-lg bg-yellow-500/5 border border-yellow-500/20">
                  <p className="text-xs font-medium mb-1 flex items-center gap-1 text-yellow-600 dark:text-yellow-400">
                    <Lightbulb className="h-3 w-3" />
                    Hipótese
                  </p>
                  <p className="text-sm">{report.hypothesis}</p>
                </div>
              )}

              {report.learning && (
                <div className="text-sm p-2.5 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                  <p className="text-xs font-medium mb-1 text-emerald-600 dark:text-emerald-400">🎓 Aprendizado</p>
                  <p className="text-sm">{report.learning}</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function ActionCard({ action, isExpanded, onToggle }: { action: ChatAction; isExpanded: boolean; onToggle: () => void }) {
  const successCount = action.actions.filter(a => a.success).length;
  const totalCount = action.actions.length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="border rounded-xl overflow-hidden transition-colors border-border hover:border-primary/30"
    >
      <button
        onClick={onToggle}
        className="w-full p-3 flex items-center justify-between transition-colors bg-card hover:bg-muted/30"
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
                  ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
                  : "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30"
              )}>
                {successCount}/{totalCount} ações
              </Badge>
              <Badge variant="outline" className="text-xs">💬 Chat</Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
              {action.content.slice(0, 50)}...
            </p>
          </div>
        </div>
        {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-border/50"
          >
            <div className="p-3 space-y-2 bg-muted/10">
              {action.actions.map((act, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className={cn(
                    "flex items-center gap-2 p-2.5 rounded-lg border",
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
                  <span className={cn(
                    "flex-1 text-sm",
                    act.success ? "text-emerald-700 dark:text-emerald-300" : "text-destructive"
                  )}>
                    {act.message}
                  </span>
                  <Badge variant="outline" className="text-[10px] shrink-0">
                    {act.tool.replace(/_/g, ' ')}
                  </Badge>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function AgentReportsTab() {
  const { user } = useAuth();
  const { currentWorkspace } = useWorkspace();
  const [reports, setReports] = useState<ExecutionReport[]>([]);
  const [chatActions, setChatActions] = useState<ChatAction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('all');

  const fetchData = async () => {
    if (!user || !currentWorkspace) return;
    
    setIsLoading(true);
    try {
      // Fetch execution reports
      const { data: reportsData, error: reportsError } = await supabase
        .from('agent_execution_reports')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(30);

      if (reportsError) throw reportsError;
      setReports((reportsData as ExecutionReport[]) || []);

      // Fetch chat messages with actions
      const { data: chatData, error: chatError } = await supabase
        .from('agent_chat_messages')
        .select('*')
        .eq('workspace_id', currentWorkspace.id)
        .eq('role', 'assistant')
        .not('actions', 'is', null)
        .order('created_at', { ascending: false })
        .limit(30);

      if (chatError) throw chatError;
      
      const actionsData = (chatData || [])
        .filter((m: any) => Array.isArray(m.actions) && m.actions.length > 0)
        .map((m: any) => ({
          id: m.id,
          created_at: m.created_at,
          content: m.content,
          actions: m.actions as ChatAction['actions']
        }));
      
      setChatActions(actionsData);

      // Auto-expand first item
      if (!expandedId) {
        if (reportsData && reportsData.length > 0) {
          setExpandedId(reportsData[0].id);
        } else if (actionsData.length > 0) {
          setExpandedId(actionsData[0].id);
        }
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [user, currentWorkspace]);

  const allItems = [
    ...reports.map(r => ({ type: 'report' as const, data: r, date: new Date(r.created_at) })),
    ...chatActions.map(a => ({ type: 'action' as const, data: a, date: new Date(a.created_at) }))
  ].sort((a, b) => b.date.getTime() - a.date.getTime());

  const filteredItems = activeTab === 'all' 
    ? allItems 
    : activeTab === 'reports' 
      ? allItems.filter(i => i.type === 'report')
      : allItems.filter(i => i.type === 'action');

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Card className="border border-border bg-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">Atividades do Agente</CardTitle>
              <CardDescription>Ações executadas e relatórios automáticos</CardDescription>
            </div>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={fetchData}
            className="gap-1"
          >
            <RefreshCw className="h-3 w-3" />
            Atualizar
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* Filter Tabs */}
        <div className="flex gap-1 p-1 rounded-lg bg-muted/50 mb-4">
          {[
            { id: 'all', label: 'Tudo', count: allItems.length },
            { id: 'actions', label: 'Ações', count: chatActions.length },
            { id: 'reports', label: 'Relatórios', count: reports.length },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-all",
                activeTab === tab.id 
                  ? "bg-background shadow-sm" 
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
              <Badge variant="secondary" className="ml-1.5 text-[10px] h-4 px-1">
                {tab.count}
              </Badge>
            </button>
          ))}
        </div>

        <ScrollArea className="h-[450px] pr-2">
          {filteredItems.length > 0 ? (
            <div className="space-y-2">
              {filteredItems.map((item) => (
                item.type === 'report' ? (
                  <ReportCard
                    key={item.data.id}
                    report={item.data as ExecutionReport}
                    isExpanded={expandedId === item.data.id}
                    onToggle={() => setExpandedId(expandedId === item.data.id ? null : item.data.id)}
                  />
                ) : (
                  <ActionCard
                    key={item.data.id}
                    action={item.data as ChatAction}
                    isExpanded={expandedId === item.data.id}
                    onToggle={() => setExpandedId(expandedId === item.data.id ? null : item.data.id)}
                  />
                )
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <div className="p-4 rounded-full mb-4 bg-muted">
                <Clock className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground font-medium">Nenhuma atividade registrada</p>
              <p className="text-sm text-muted-foreground mt-1">
                Use o chat para executar ações ou ative o modo automático
              </p>
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
