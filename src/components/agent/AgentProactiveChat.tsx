import { useState, useEffect, useRef } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Bot, TrendingUp, Megaphone, AlertCircle, FileText, X, RefreshCw, Loader2,
  CheckCircle2, XCircle, ChevronDown, ChevronRight, Sparkles, Lightbulb, 
  Zap, Clock, Pause, User, MessageSquare
} from 'lucide-react';
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
  actions: Array<{ tool: string; success: boolean; message: string }>;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

type TimelineItem = 
  | { type: 'report'; data: ProactiveMessage; date: Date }
  | { type: 'execution'; data: ExecutionReport; date: Date }
  | { type: 'action'; data: ChatAction; date: Date }
  | { type: 'chat'; data: ChatMessage; date: Date };

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
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'reports' | 'actions' | 'chat'>('all');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && currentWorkspace && user) {
      loadAll();
    }
  }, [isOpen, currentWorkspace, user]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        if (scrollRef.current) {
          const viewport = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
          if (viewport) {
            // For chat filter, scroll to bottom; for others, scroll to top
            if (filter === 'chat') {
              viewport.scrollTop = viewport.scrollHeight;
            } else {
              viewport.scrollTop = 0;
            }
          }
        }
      }, 150);
    }
  }, [isOpen, filter]);

  const loadAll = async () => {
    if (!currentWorkspace || !user) return;
    setIsLoading(true);
    try {
      // Fetch proactive messages (reports) — last 10
      const { data: messages } = await supabase
        .from('agent_proactive_messages')
        .select('*')
        .eq('workspace_id', currentWorkspace.id)
        .order('created_at', { ascending: false })
        .limit(10);

      // Fetch execution reports — last 10
      const { data: execReports } = await supabase
        .from('agent_execution_reports')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10);

      // Fetch chat actions — last 10
      const { data: chatData } = await supabase
        .from('agent_chat_messages')
        .select('*')
        .eq('workspace_id', currentWorkspace.id)
        .eq('role', 'assistant')
        .not('actions', 'is', null)
        .order('created_at', { ascending: false })
        .limit(10);

      // Fetch chat messages (for history tab) — last 20 (10 conversations ~= 20 msgs)
      const { data: allChatMsgs } = await supabase
        .from('agent_chat_messages')
        .select('id, role, content, created_at')
        .eq('workspace_id', currentWorkspace.id)
        .order('created_at', { ascending: false })
        .limit(20);

      const items: TimelineItem[] = [];

      (messages || []).forEach((m: any) => {
        items.push({ type: 'report', data: m, date: new Date(m.created_at) });
      });

      (execReports || []).forEach((r: any) => {
        items.push({ type: 'execution', data: r, date: new Date(r.created_at) });
      });

      (chatData || [])
        .filter((m: any) => Array.isArray(m.actions) && m.actions.length > 0)
        .forEach((m: any) => {
          items.push({
            type: 'action',
            data: { id: m.id, created_at: m.created_at, content: m.content, actions: m.actions },
            date: new Date(m.created_at),
          });
        });

      // Add chat messages as timeline items
      (allChatMsgs || []).forEach((m: any) => {
        items.push({
          type: 'chat',
          data: { id: m.id, role: m.role, content: m.content, created_at: m.created_at },
          date: new Date(m.created_at),
        });
      });

      items.sort((a, b) => b.date.getTime() - a.date.getTime());
      setTimeline(items);
    } catch (err) {
      console.error('Error loading agent timeline:', err);
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
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true, locale: ptBR });
  };

  const getDecisionIcon = (decision: string | null, status?: string) => {
    if (status === 'timed_out') return <Clock className="h-3.5 w-3.5 text-orange-500" />;
    switch (decision) {
      case 'POST': return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
      case 'NO_POST': return <XCircle className="h-3.5 w-3.5 text-amber-500" />;
      case 'WAIT': return <Pause className="h-3.5 w-3.5 text-blue-500" />;
      default: return <Loader2 className="h-3.5 w-3.5 animate-spin" />;
    }
  };

  const getDecisionLabel = (decision: string | null, status?: string) => {
    if (status === 'timed_out') return 'Timeout';
    switch (decision) {
      case 'POST': return 'Publicou';
      case 'NO_POST': return 'Não Publicou';
      case 'WAIT': return 'Aguardou';
      default: return status === 'running' ? 'Processando...' : 'Processando';
    }
  };

  const filteredTimeline = timeline.filter(item => {
    if (filter === 'all') return item.type !== 'chat';
    if (filter === 'reports') return item.type === 'report';
    if (filter === 'actions') return item.type === 'execution' || item.type === 'action';
    if (filter === 'chat') return item.type === 'chat';
    return true;
  });

  const renderItem = (item: TimelineItem) => {
    const isExpanded = expandedId === item.data.id;

    if (item.type === 'report') {
      const msg = item.data as ProactiveMessage;
      const Icon = TYPE_ICONS[msg.message_type] || FileText;
      return (
        <motion.div
          key={`r-${msg.id}`}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex gap-3"
        >
          <Avatar className="h-7 w-7 shrink-0 mt-1">
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
    }

    if (item.type === 'execution') {
      const report = item.data as ExecutionReport;
      return (
        <motion.div
          key={`e-${report.id}`}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="border rounded-xl overflow-hidden border-border/50 hover:border-primary/30 transition-colors"
        >
          <button
            onClick={() => setExpandedId(isExpanded ? null : report.id)}
            className="w-full p-3 flex items-center justify-between bg-card hover:bg-muted/30 transition-colors"
          >
            <div className="flex items-center gap-3">
              {getDecisionIcon(report.decision, report.status)}
              <div className="text-left">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    {getDecisionLabel(report.decision, report.status)}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    {report.trigger === 'cron' ? '⏰ Auto' : '🖐️ Manual'}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{formatTime(report.created_at)}</p>
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
    }

    if (item.type === 'action') {
      const action = item.data as ChatAction;
      const successCount = action.actions.filter(a => a.success).length;
      const totalCount = action.actions.length;
      return (
        <motion.div
          key={`a-${action.id}`}
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
                <Zap className="h-3.5 w-3.5 text-primary" />
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
                      <span className="flex-1 text-sm truncate">{act.message}</span>
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

    if (item.type === 'chat') {
      const msg = item.data as ChatMessage;
      return (
        <motion.div
          key={`chat-${msg.id}`}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn("flex gap-3", msg.role === 'user' ? "flex-row-reverse" : "")}
        >
          <Avatar className="h-7 w-7 shrink-0">
            {msg.role === 'assistant' ? (
              <>
                <AvatarImage src={agentAvatar || undefined} />
                <AvatarFallback className="neural-gradient text-primary-foreground text-xs">
                  <Bot className="h-3 w-3" />
                </AvatarFallback>
              </>
            ) : (
              <AvatarFallback className="bg-secondary text-secondary-foreground text-xs">
                <User className="h-3 w-3" />
              </AvatarFallback>
            )}
          </Avatar>
          <div className={cn(
            "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm",
            msg.role === 'user'
              ? "bg-primary text-primary-foreground rounded-br-sm"
              : "bg-muted rounded-bl-sm"
          )}>
            {msg.role === 'assistant' ? renderMarkdown(msg.content) : msg.content}
          </div>
        </motion.div>
      );
    }

    return null;
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, x: -300 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -300 }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          className="fixed left-2 sm:left-4 top-4 bottom-24 w-[calc(100vw-1rem)] sm:w-[420px] sm:max-w-[calc(100vw-2rem)] z-30 flex flex-col bg-card/95 backdrop-blur-xl rounded-2xl border border-border/50 shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-3 border-b border-border/50">
            <div className="flex items-center gap-3">
              <Avatar className="h-9 w-9 border border-primary/30">
                <AvatarImage src={agentAvatar || undefined} />
                <AvatarFallback className="neural-gradient text-primary-foreground">
                  <Bot className="h-4 w-4" />
                </AvatarFallback>
              </Avatar>
              <div>
                <h2 className="font-semibold text-sm">{agentName}</h2>
                <p className="text-xs text-muted-foreground">Relatórios, Decisões & Ações</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" onClick={loadAll} className="h-8 w-8">
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center gap-1 px-3 py-2 border-b border-border/30">
            {(['all', 'reports', 'actions', 'chat'] as const).map((f) => (
              <Button
                key={f}
                variant={filter === f ? "default" : "ghost"}
                size="sm"
                className={cn(
                  "h-6 text-[11px] px-2",
                  filter === f && "neural-gradient border-0"
                )}
                onClick={() => setFilter(f)}
              >
                {f === 'all' ? 'Tudo' : f === 'reports' ? '📊 Relatórios' : f === 'actions' ? '⚡ Ações' : '💬 Histórico'}
              </Button>
            ))}
            <span className="text-[10px] text-muted-foreground ml-auto">
              {filteredTimeline.length} itens
            </span>
          </div>

          {/* Timeline */}
          {isLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : filteredTimeline.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-4 text-center">
              <Clock className="h-12 w-12 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">Nenhuma atividade registrada</p>
              <p className="text-xs text-muted-foreground mt-1">
                O agente reporta automaticamente 4x ao dia
              </p>
            </div>
          ) : (
            <ScrollArea ref={scrollRef} className="flex-1 p-3">
              <div className="space-y-3">
                {filteredTimeline.map(renderItem)}
              </div>
            </ScrollArea>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
