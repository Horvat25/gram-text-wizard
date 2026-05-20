import { useState, useEffect, useRef, useMemo } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Bot, TrendingUp, Megaphone, AlertCircle, FileText, X, RefreshCw, Loader2,
  CheckCircle2, XCircle, ChevronDown, ChevronRight, Sparkles, Lightbulb,
  Zap, Clock, Pause, User, MessageSquare, Newspaper, Instagram, Search,
  Activity, LayoutGrid, Trash2
} from 'lucide-react';
import { toast } from 'sonner';
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
  report: Instagram,
  decision: FileText,
  strategy: Megaphone,
  alert: AlertCircle,
  daily_blog_report: Newspaper,
};

const TYPE_LABELS: Record<string, string> = {
  report: '📱 Instagram',
  decision: 'Decisão',
  strategy: 'Estratégia',
  alert: 'Alerta',
  daily_blog_report: '📰 Blog Neural Update',
};

const TYPE_BADGE_CLASS: Record<string, string> = {
  report: 'bg-pink-500/10 text-pink-600 dark:text-pink-400 border-pink-500/30',
  daily_blog_report: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30',
};

export default function AgentProactiveChat({ isOpen, onClose, agentName, agentAvatar }: AgentProactiveChatProps) {
  const { user } = useAuth();
  const { currentWorkspace } = useWorkspace();
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'reports' | 'actions' | 'chat'>('all');
  const [isClearing, setIsClearing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const handleExpand = (id: string) => {
    const next = expandedId === id ? null : id;
    setExpandedId(next);
    if (next) {
      setTimeout(() => {
        const viewport = scrollRef.current?.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement | null;
        const el = itemRefs.current[id];
        if (viewport && el) {
          viewport.scrollTo({ top: el.offsetTop - 8, behavior: 'smooth' });
        }
      }, 80);
    }
  };

  const handleClearHistory = async () => {
    if (!currentWorkspace || !user) return;
    const labels: Record<typeof filter, string> = {
      all: 'todos os relatórios e ações',
      reports: 'todos os relatórios',
      actions: 'todas as ações',
      chat: 'todo o histórico do chat',
    } as any;
    if (!confirm(`Limpar ${labels[filter]}? Esta ação não pode ser desfeita.`)) return;
    setIsClearing(true);
    try {
      const ops: Promise<any>[] = [];
      if (filter === 'all' || filter === 'reports') {
        ops.push(supabase.from('agent_proactive_messages').delete().eq('workspace_id', currentWorkspace.id));
      }
      if (filter === 'all' || filter === 'actions') {
        ops.push(supabase.from('agent_execution_reports').delete().eq('user_id', user.id));
        // Clear action-bearing assistant messages
        ops.push(
          supabase
            .from('agent_chat_messages')
            .delete()
            .eq('workspace_id', currentWorkspace.id)
            .eq('role', 'assistant')
            .not('actions', 'is', null)
        );
      }
      if (filter === 'chat') {
        ops.push(supabase.from('agent_chat_messages').delete().eq('workspace_id', currentWorkspace.id));
      }
      await Promise.all(ops);
      toast.success('Histórico limpo');
      await loadAll();
    } catch (e: any) {
      console.error(e);
      toast.error('Falha ao limpar histórico');
    } finally {
      setIsClearing(false);
    }
  };


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

  const [searchQuery, setSearchQuery] = useState('');

  const counts = useMemo(() => ({
    all: timeline.filter(i => i.type !== 'chat').length,
    reports: timeline.filter(i => i.type === 'report').length,
    actions: timeline.filter(i => i.type === 'execution' || i.type === 'action').length,
    chat: timeline.filter(i => i.type === 'chat').length,
  }), [timeline]);

  const filteredTimeline = (() => {
    const filtered = timeline.filter(item => {
      // Filter by tab
      let matchesFilter = true;
      if (filter === 'all') matchesFilter = item.type !== 'chat';
      else if (filter === 'reports') matchesFilter = item.type === 'report';
      else if (filter === 'actions') matchesFilter = item.type === 'execution' || item.type === 'action';
      else if (filter === 'chat') matchesFilter = item.type === 'chat';
      if (!matchesFilter) return false;

      // Filter by search
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const text = (item.type === 'report' ? item.data.content
        : item.type === 'execution' ? `${item.data.summary || ''} ${item.data.decision_reason || ''} ${item.data.learning || ''}`
        : item.type === 'action' ? item.data.content
        : item.data.content) || '';
      return text.toLowerCase().includes(q);
    });
    if (filter === 'chat') filtered.reverse();
    return filtered;
  })();


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
              <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 gap-1 font-semibold", TYPE_BADGE_CLASS[msg.message_type])}>
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

  const FILTER_META = [
    { key: 'all' as const, label: 'Tudo', Icon: LayoutGrid },
    { key: 'reports' as const, label: 'Relatórios', Icon: FileText },
    { key: 'actions' as const, label: 'Ações', Icon: Zap },
    { key: 'chat' as const, label: 'Histórico', Icon: MessageSquare },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, x: -300 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -300 }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          className="fixed left-2 sm:left-4 top-4 bottom-24 w-[calc(100vw-1rem)] sm:w-[440px] sm:max-w-[calc(100vw-2rem)] z-30 flex flex-col bg-card/95 backdrop-blur-xl rounded-2xl border border-border/60 shadow-2xl overflow-hidden"
        >
          {/* Subtle gradient glow on top */}
          <div className="pointer-events-none absolute inset-x-0 -top-px h-24 [background:radial-gradient(ellipse_at_top,hsl(var(--portal-cyan)/0.18),transparent_70%)]" />

          {/* Header */}
          <div className="relative flex items-center justify-between p-3 border-b border-border/40">
            <div className="flex items-center gap-3 min-w-0">
              <div className="relative">
                <Avatar className="h-10 w-10 border border-primary/40 ring-2 ring-primary/10">
                  <AvatarImage src={agentAvatar || undefined} />
                  <AvatarFallback className="neural-gradient text-primary-foreground">
                    <Bot className="h-4 w-4" />
                  </AvatarFallback>
                </Avatar>
                <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500 border-2 border-card" />
                </span>
              </div>
              <div className="min-w-0">
                <h2 className="font-semibold text-sm truncate flex items-center gap-1.5">
                  {agentName}
                  <Sparkles className="h-3 w-3 text-primary shrink-0" />
                </h2>
                <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <Activity className="h-2.5 w-2.5" />
                  Auto-reporta 4×/dia · {counts.all + counts.chat} eventos
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button variant="ghost" size="icon" onClick={loadAll} className="h-8 w-8" disabled={isLoading}>
                <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
              </Button>
              <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Filter Pills with counts */}
          <div className="px-3 pt-2 pb-2 border-b border-border/30 space-y-2">
            <div className="grid grid-cols-4 gap-1">
              {FILTER_META.map(({ key, label, Icon }) => {
                const active = filter === key;
                const count = counts[key];
                return (
                  <button
                    key={key}
                    onClick={() => setFilter(key)}
                    className={cn(
                      'group relative flex flex-col items-center gap-0.5 py-1.5 px-1 rounded-lg transition-all',
                      active
                        ? 'bg-primary/10 border border-primary/40 shadow-[0_0_0_1px_hsl(var(--primary)/0.2),0_4px_16px_-4px_hsl(var(--primary)/0.4)]'
                        : 'border border-transparent hover:bg-muted/50'
                    )}
                  >
                    <Icon className={cn('h-3.5 w-3.5 transition-colors', active ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground')} />
                    <span className={cn('text-[10px] font-medium', active ? 'text-foreground' : 'text-muted-foreground')}>
                      {label}
                    </span>
                    <span className={cn(
                      'text-[9px] tabular-nums px-1 rounded-full leading-tight',
                      active ? 'bg-primary/20 text-primary font-semibold' : 'text-muted-foreground/70'
                    )}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/60" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar nos relatórios e ações…"
                className="h-7 pl-7 pr-7 text-[11px] bg-muted/40 border-border/40 focus-visible:ring-1 focus-visible:ring-primary/40"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>

          {/* Timeline */}
          {isLoading ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <p className="text-xs text-muted-foreground">Carregando timeline…</p>
            </div>
          ) : filteredTimeline.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
              <div className="relative mb-3">
                <div className="absolute inset-0 bg-primary/20 blur-2xl rounded-full" />
                <Clock className="relative h-12 w-12 text-primary/60" />
              </div>
              <p className="text-sm font-medium">
                {searchQuery ? 'Nada encontrado' : 'Nenhuma atividade ainda'}
              </p>
              <p className="text-xs text-muted-foreground mt-1 max-w-[240px]">
                {searchQuery
                  ? 'Tente outro termo ou troque o filtro acima.'
                  : 'O agente reporta automaticamente 4× ao dia. Você também verá aqui cada ação executada pelo chat.'}
              </p>
            </div>
          ) : (
            <ScrollArea ref={scrollRef} className="flex-1 p-3">
              <div className="space-y-3 pb-2">
                {filteredTimeline.map(renderItem)}
              </div>
              <div className="text-center text-[10px] text-muted-foreground/60 pt-2 pb-1">
                · fim do feed ·
              </div>
            </ScrollArea>
          )}
        </motion.div>
      )}
    </AnimatePresence>

  );
}
