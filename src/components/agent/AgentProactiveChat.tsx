import { useState, useEffect, useRef } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Bot, TrendingUp, Megaphone, AlertCircle, FileText, X, RefreshCw, Loader2, CheckCircle2, XCircle, Clock, ChevronDown, ChevronRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspace } from '@/hooks/useWorkspace';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ProactiveMessage {
  id: string;
  content: string;
  message_type: string;
  metadata: any;
  created_at: string;
}

interface ExecutionReport {
  id: string;
  trigger: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  decision: string | null;
  decision_reason: string | null;
  summary: string | null;
  hypothesis: string | null;
  learning: string | null;
  created_at: string;
}

interface AgentProactiveChatProps {
  isOpen: boolean;
  onClose: () => void;
  agentName: string;
  agentAvatar?: string | null;
}

const TYPE_ICONS: Record<string, typeof TrendingUp> = {
  report: TrendingUp,
  decision: FileText,
  strategy: Megaphone,
  alert: AlertCircle,
};

const TYPE_LABELS: Record<string, string> = {
  report: 'Relatório',
  decision: 'Decisão',
  strategy: 'Estratégia',
  alert: 'Alerta',
};

export default function AgentProactiveChat({ isOpen, onClose, agentName, agentAvatar }: AgentProactiveChatProps) {
  const { user } = useAuth();
  const { currentWorkspace } = useWorkspace();
  const [messages, setMessages] = useState<ProactiveMessage[]>([]);
  const [reports, setReports] = useState<ExecutionReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeView, setActiveView] = useState<'messages' | 'reports'>('messages');
  const [expandedReportId, setExpandedReportId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && currentWorkspace) {
      loadData();
    }
  }, [isOpen, currentWorkspace]);

  useEffect(() => {
    if (isOpen && activeView === 'messages') {
      setTimeout(() => {
        if (scrollRef.current) {
          const viewport = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
          if (viewport) viewport.scrollTop = viewport.scrollHeight;
        }
      }, 100);
    }
  }, [isOpen, messages, activeView]);

  const loadData = async () => {
    if (!currentWorkspace || !user) return;
    setIsLoading(true);
    try {
      const [messagesRes, reportsRes] = await Promise.all([
        supabase
          .from('agent_proactive_messages')
          .select('*')
          .eq('workspace_id', currentWorkspace.id)
          .order('created_at', { ascending: true })
          .limit(50),
        supabase
          .from('agent_execution_reports')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(30)
      ]);

      setMessages((messagesRes.data as ProactiveMessage[]) || []);
      setReports((reportsRes.data as ExecutionReport[]) || []);
    } catch (err) {
      console.error('Error loading agent data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const renderMarkdown = (text: string) => {
    return text.split('\n').map((line, i) => {
      let formatted = line;
      if (formatted.startsWith('# ')) return <h1 key={i} className="text-lg font-bold mb-2">{formatted.slice(2)}</h1>;
      if (formatted.startsWith('## ')) return <h2 key={i} className="text-base font-semibold mt-2 mb-1">{formatted.slice(3)}</h2>;
      formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      formatted = formatted.replace(/_(.*?)_/g, '<em>$1</em>');
      if (formatted.startsWith('• ') || formatted.startsWith('- ')) {
        return <span key={i} className="flex gap-2 ml-2 py-0.5"><span className="text-primary">•</span><span dangerouslySetInnerHTML={{ __html: formatted.slice(2) }} /></span>;
      }
      if (formatted.trim() === '') return <div key={i} className="h-1" />;
      return <span key={i} className="block" dangerouslySetInnerHTML={{ __html: formatted }} />;
    });
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffH = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffH < 1) return 'Agora';
    if (diffH < 24) return `${diffH}h atrás`;
    const diffD = Math.floor(diffH / 24);
    if (diffD === 1) return 'Ontem';
    return `${diffD} dias atrás`;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle2 className="h-3 w-3 text-green-500" />;
      case 'error': return <XCircle className="h-3 w-3 text-destructive" />;
      default: return <Clock className="h-3 w-3 text-muted-foreground" />;
    }
  };

  const getDecisionBadge = (decision: string | null) => {
    if (!decision) return null;
    const colors: Record<string, string> = {
      POST: 'bg-green-500/10 text-green-500 border-green-500/20',
      NO_POST: 'bg-muted text-muted-foreground',
      WAIT: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
    };
    return (
      <Badge variant="outline" className={cn("text-[10px] px-1.5", colors[decision])}>
        {decision}
      </Badge>
    );
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, x: -300 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -300 }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          className="fixed left-4 top-4 bottom-24 w-[380px] max-w-[calc(100vw-2rem)] z-30 flex flex-col bg-card/95 backdrop-blur-xl rounded-2xl border border-border/50 shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border/50">
            <div className="flex items-center gap-3">
              <Avatar className="h-9 w-9 border border-primary/30">
                <AvatarImage src={agentAvatar || undefined} />
                <AvatarFallback className="neural-gradient text-primary-foreground">
                  <Bot className="h-4 w-4" />
                </AvatarFallback>
              </Avatar>
              <div>
                <h2 className="font-semibold text-sm">{agentName}</h2>
                <p className="text-xs text-muted-foreground">Relatórios & Execuções</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" onClick={loadData} className="h-8 w-8">
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* View Toggle */}
          <div className="flex border-b border-border/50">
            <button
              onClick={() => setActiveView('messages')}
              className={cn(
                "flex-1 py-2 text-xs font-medium transition-colors",
                activeView === 'messages' 
                  ? "text-primary border-b-2 border-primary" 
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Mensagens
            </button>
            <button
              onClick={() => setActiveView('reports')}
              className={cn(
                "flex-1 py-2 text-xs font-medium transition-colors",
                activeView === 'reports' 
                  ? "text-primary border-b-2 border-primary" 
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Execuções ({reports.length})
            </button>
          </div>

          {/* Content */}
          <ScrollArea ref={scrollRef} className="flex-1 p-4">
            {isLoading ? (
              <div className="text-center py-8">
                <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
                <p className="text-xs text-muted-foreground mt-2">Carregando...</p>
              </div>
            ) : activeView === 'messages' ? (
              /* Proactive Messages */
              <div className="space-y-4">
                {messages.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    <Bot className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>Nenhum relatório ainda.</p>
                    <p className="text-xs mt-1">O agente vai reportar aqui automaticamente.</p>
                  </div>
                ) : (
                  messages.map((msg) => {
                    const Icon = TYPE_ICONS[msg.message_type] || FileText;
                    return (
                      <motion.div
                        key={msg.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex gap-3"
                      >
                        <Avatar className="h-7 w-7 shrink-0">
                          <AvatarImage src={agentAvatar || undefined} />
                          <AvatarFallback className="neural-gradient text-primary-foreground text-xs">
                            <Bot className="h-3 w-3" />
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-1">
                              <Icon className="h-2.5 w-2.5" />
                              {TYPE_LABELS[msg.message_type] || msg.message_type}
                            </Badge>
                            <span className="text-[10px] text-muted-foreground">{formatTime(msg.created_at)}</span>
                          </div>
                          <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm">
                            {renderMarkdown(msg.content)}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })
                )}
              </div>
            ) : (
              /* Execution Reports */
              <div className="space-y-2">
                {reports.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>Nenhuma execução registrada.</p>
                  </div>
                ) : (
                  reports.map((report) => {
                    const isExpanded = expandedReportId === report.id;
                    return (
                      <motion.div
                        key={report.id}
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="border border-border/50 rounded-lg overflow-hidden"
                      >
                        <button
                          onClick={() => setExpandedReportId(isExpanded ? null : report.id)}
                          className="w-full flex items-center gap-2 p-3 text-left hover:bg-muted/50 transition-colors"
                        >
                          {getStatusIcon(report.status)}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium truncate">
                                {report.summary?.slice(0, 50) || report.decision_reason?.slice(0, 50) || 'Execução'}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[10px] text-muted-foreground">
                                {formatDistanceToNow(new Date(report.created_at), { addSuffix: true, locale: ptBR })}
                              </span>
                              <Badge variant="outline" className="text-[9px] px-1 py-0">
                                {report.trigger}
                              </Badge>
                              {getDecisionBadge(report.decision)}
                            </div>
                          </div>
                          {isExpanded ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
                        </button>
                        
                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="border-t border-border/30"
                            >
                              <div className="p-3 space-y-2 text-xs">
                                {report.summary && (
                                  <div>
                                    <span className="font-medium text-muted-foreground">Resumo:</span>
                                    <p className="mt-0.5">{report.summary}</p>
                                  </div>
                                )}
                                {report.decision_reason && (
                                  <div>
                                    <span className="font-medium text-muted-foreground">Razão:</span>
                                    <p className="mt-0.5">{report.decision_reason}</p>
                                  </div>
                                )}
                                {report.hypothesis && (
                                  <div>
                                    <span className="font-medium text-muted-foreground">Hipótese:</span>
                                    <p className="mt-0.5">{report.hypothesis}</p>
                                  </div>
                                )}
                                {report.learning && (
                                  <div>
                                    <span className="font-medium text-muted-foreground">Aprendizado:</span>
                                    <p className="mt-0.5">{report.learning}</p>
                                  </div>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.div>
                    );
                  })
                )}
              </div>
            )}
          </ScrollArea>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
