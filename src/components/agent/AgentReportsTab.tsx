import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
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
  Sparkles
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
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

interface ReportCardProps {
  report: ExecutionReport;
  isExpanded: boolean;
  onToggle: () => void;
}

function ReportCard({ report, isExpanded, onToggle }: ReportCardProps) {
  const getDecisionColor = (decision: string | null) => {
    switch (decision) {
      case 'POST':
        return 'bg-green-500/10 text-green-700 dark:text-green-300 border-green-500/30';
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
      case 'POST': return <CheckCircle2 className="h-4 w-4 text-green-500" />;
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
      className="border rounded-xl overflow-hidden transition-colors border-primary/20 hover:border-primary/40"
    >
      {/* Header - Always visible */}
      <button
        onClick={onToggle}
        className="w-full p-4 flex items-center justify-between transition-colors bg-primary/5 hover:bg-primary/10"
      >
        <div className="flex items-center gap-3">
          {getDecisionIcon(report.decision)}
          <div className="text-left">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={`text-xs ${getDecisionColor(report.decision)}`}>
                {getDecisionLabel(report.decision)}
              </Badge>
              <Badge variant="outline" className="text-xs">
                {report.trigger === 'cron' ? '⏰ CRON' : '🖐️ Manual'}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {formatDistanceToNow(new Date(report.created_at), { 
                addSuffix: true, 
                locale: ptBR 
              })}
              {' • '}
              {format(new Date(report.created_at), "HH:mm 'de' dd/MM", { locale: ptBR })}
            </p>
          </div>
        </div>
        {isExpanded ? (
          <ChevronDown className="h-5 w-5 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-5 w-5 text-muted-foreground" />
        )}
      </button>

      {/* Expanded Content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-border/50"
          >
            <div className="p-4 space-y-4 bg-muted/10">
              {/* Summary/Message from Agent */}
              {report.summary && (
                <div className="p-3 rounded-lg border bg-primary/5 border-primary/20">
                  <div className="flex items-start gap-2">
                    <Sparkles className="h-4 w-4 mt-0.5 text-primary" />
                    <div>
                      <p className="text-xs font-medium mb-1 text-primary">
                        Mensagem do Agente
                      </p>
                      <p className="text-sm">{report.summary}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Decision Reason */}
              {report.decision_reason && (
                <div className="text-sm">
                  <p className="font-medium mb-1">💭 Raciocínio:</p>
                  <p className="text-muted-foreground">{report.decision_reason}</p>
                </div>
              )}

              {/* Metrics Snapshot */}
              {report.metrics_snapshot && (
                <div className="p-3 rounded-lg bg-muted/30 border">
                  <p className="text-xs font-medium mb-2 flex items-center gap-1">
                    <TrendingUp className="h-3 w-3" />
                    Métricas no momento
                  </p>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <span className="text-muted-foreground">Engajamento:</span>
                      <span className="ml-1 font-medium">
                        {report.metrics_snapshot.avgEngagement?.toFixed(1) || '0'}%
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Último post:</span>
                      <span className="ml-1 font-medium">
                        {Math.round(report.metrics_snapshot.lastPostHours || 0)}h atrás
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Posts hoje:</span>
                      <span className="ml-1 font-medium">
                        {report.metrics_snapshot.postsToday || 0}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Content Plan */}
              {report.content_plan && (
                <div className="text-sm">
                  <p className="font-medium mb-1">📝 Plano de Conteúdo:</p>
                  <div className="flex flex-wrap gap-1">
                    {report.content_plan.format && (
                      <Badge variant="outline" className="text-xs">
                        {report.content_plan.format}
                      </Badge>
                    )}
                    {report.content_plan.theme && (
                      <Badge variant="outline" className="text-xs">
                        {report.content_plan.theme}
                      </Badge>
                    )}
                    {report.content_plan.mediaType && (
                      <Badge variant="outline" className="text-xs">
                        {report.content_plan.mediaType}
                      </Badge>
                    )}
                  </div>
                </div>
              )}

              {/* Hypothesis */}
              {report.hypothesis && (
                <div className="text-sm p-3 rounded-lg bg-yellow-500/5 border border-yellow-500/20">
                  <p className="font-medium mb-1 flex items-center gap-1">
                    <Lightbulb className="h-3 w-3 text-yellow-500" />
                    Hipótese testada:
                  </p>
                  <p className="text-muted-foreground">{report.hypothesis}</p>
                </div>
              )}

              {/* Learning */}
              {report.learning && (
                <div className="text-sm p-3 rounded-lg bg-green-500/5 border border-green-500/20">
                  <p className="font-medium mb-1">🎓 Aprendizado:</p>
                  <p className="text-muted-foreground">{report.learning}</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function AgentReportsTab() {
  const { user } = useAuth();
  const [reports, setReports] = useState<ExecutionReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchReports = async () => {
    if (!user) return;
    
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('agent_execution_reports')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setReports((data as ExecutionReport[]) || []);
      
      // Auto-expand the first report
      if (data && data.length > 0 && !expandedId) {
        setExpandedId(data[0].id);
      }
    } catch (error) {
      console.error('Error fetching reports:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, [user]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Card className="border border-primary/20 bg-gradient-to-br from-primary/5 to-violet-500/5">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10">
              <Bot className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">Relatórios do Agente</CardTitle>
              <CardDescription>
                Histórico de execuções e decisões
              </CardDescription>
            </div>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={fetchReports}
            className="gap-1 border-primary/30 hover:border-primary/50"
          >
            <RefreshCw className="h-3 w-3" />
            Atualizar
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[500px] pr-2">
          {reports.length > 0 ? (
            <div className="space-y-3">
              {reports.map((report) => (
                <ReportCard
                  key={report.id}
                  report={report}
                  isExpanded={expandedId === report.id}
                  onToggle={() => setExpandedId(
                    expandedId === report.id ? null : report.id
                  )}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <div className="p-4 rounded-full mb-4 bg-primary/10">
                <Clock className="h-10 w-10 text-primary" />
              </div>
              <p className="text-muted-foreground font-medium">Nenhuma execução registrada</p>
              <p className="text-sm text-muted-foreground mt-1">
                Ative o modo automático ou execute o agente manualmente
              </p>
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
