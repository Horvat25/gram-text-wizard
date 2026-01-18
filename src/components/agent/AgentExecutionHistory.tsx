import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { 
  History, 
  ChevronRight, 
  ChevronDown,
  CheckCircle2, 
  XCircle,
  Brain,
  Zap,
  Clock,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface ExecutedAction {
  tool: string;
  success: boolean;
  message: string;
  posts?: any[];
  data?: any;
}

interface ExecutionStep {
  id: string;
  timestamp: Date;
  userRequest: string;
  thinking?: string;
  actions: ExecutedAction[];
  response: string;
}

interface AgentExecutionHistoryProps {
  executions: ExecutionStep[];
  isOpen: boolean;
  onClose: () => void;
}

const TOOL_LABELS: Record<string, { label: string; emoji: string }> = {
  'create_posts': { label: 'Criar Posts', emoji: '✍️' },
  'generate_image_for_post': { label: 'Gerar Imagem', emoji: '🎨' },
  'schedule_post': { label: 'Agendar Post', emoji: '📅' },
  'get_performance_data': { label: 'Buscar Analytics', emoji: '📊' },
  'get_detailed_analytics': { label: 'Analytics Detalhados', emoji: '📈' },
  'run_autonomous_agent': { label: 'Rodar Agente', emoji: '🤖' },
  'list_posts': { label: 'Listar Posts', emoji: '📋' },
  'delete_post': { label: 'Deletar Post', emoji: '🗑️' },
  'update_agent_settings': { label: 'Atualizar Config', emoji: '⚙️' },
};

export default function AgentExecutionHistory({ executions, isOpen, onClose }: AgentExecutionHistoryProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0, x: 300 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 300 }}
      className="fixed right-0 top-0 h-full w-[400px] max-w-[90vw] bg-background border-l border-border shadow-2xl z-50 flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <History className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">Histórico de Execuções</h2>
          <Badge variant="secondary" className="text-xs">
            {executions.length}
          </Badge>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-3">
          {executions.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Brain className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p className="text-sm">Nenhuma execução ainda</p>
              <p className="text-xs mt-1">Peça algo ao agente para ver o histórico</p>
            </div>
          ) : (
            executions.map((execution) => {
              const isExpanded = expandedId === execution.id;
              const successCount = execution.actions.filter(a => a.success).length;
              const totalActions = execution.actions.length;

              return (
                <motion.div
                  key={execution.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="border rounded-lg bg-card overflow-hidden"
                >
                  {/* Execution Header */}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : execution.id)}
                    className="w-full p-3 flex items-start gap-3 hover:bg-muted/50 transition-colors text-left"
                  >
                    <div className="mt-1">
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium line-clamp-2">
                        {execution.userRequest}
                      </p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {execution.timestamp.toLocaleTimeString('pt-BR', { 
                            hour: '2-digit', 
                            minute: '2-digit' 
                          })}
                        </span>
                        {totalActions > 0 && (
                          <Badge 
                            variant={successCount === totalActions ? 'default' : 'secondary'}
                            className="text-[10px] h-5"
                          >
                            <Zap className="h-2.5 w-2.5 mr-1" />
                            {successCount}/{totalActions} ações
                          </Badge>
                        )}
                      </div>
                    </div>
                  </button>

                  {/* Expanded Content */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="border-t"
                      >
                        <div className="p-3 space-y-3">
                          {/* Thinking Section */}
                          {execution.thinking && (
                            <div className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
                              <div className="flex items-center gap-2 mb-2">
                                <Brain className="h-4 w-4 text-purple-500" />
                                <span className="text-xs font-medium text-purple-600 dark:text-purple-400">
                                  Pensamento
                                </span>
                              </div>
                              <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                                {execution.thinking}
                              </p>
                            </div>
                          )}

                          {/* Actions */}
                          {execution.actions.length > 0 && (
                            <div className="space-y-2">
                              <div className="flex items-center gap-2">
                                <Zap className="h-4 w-4 text-primary" />
                                <span className="text-xs font-medium">Ações Executadas</span>
                              </div>
                              
                              {execution.actions.map((action, idx) => {
                                const toolInfo = TOOL_LABELS[action.tool] || { label: action.tool, emoji: '🔧' };
                                
                                return (
                                  <div
                                    key={idx}
                                    className={`p-2.5 rounded-lg border text-xs ${
                                      action.success
                                        ? 'bg-green-500/5 border-green-500/20'
                                        : 'bg-red-500/5 border-red-500/20'
                                    }`}
                                  >
                                    <div className="flex items-center gap-2">
                                      {action.success ? (
                                        <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                                      ) : (
                                        <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                                      )}
                                      <span className="font-medium">
                                        {toolInfo.emoji} {toolInfo.label}
                                      </span>
                                    </div>
                                    <p className="text-muted-foreground mt-1.5 pl-5">
                                      {action.message}
                                    </p>
                                    
                                    {/* Show data summary if available */}
                                    {action.data && (
                                      <details className="mt-2 pl-5">
                                        <summary className="text-[10px] text-muted-foreground cursor-pointer hover:text-foreground">
                                          Ver dados retornados
                                        </summary>
                                        <pre className="mt-1 p-2 rounded bg-muted/50 text-[10px] overflow-x-auto max-h-32">
                                          {JSON.stringify(action.data, null, 2)}
                                        </pre>
                                      </details>
                                    )}
                                    
                                    {/* Show created posts if available */}
                                    {action.posts && action.posts.length > 0 && (
                                      <div className="mt-2 pl-5 space-y-1">
                                        <span className="text-[10px] text-muted-foreground">
                                          Posts criados:
                                        </span>
                                        {action.posts.map((post, i) => (
                                          <div key={i} className="p-1.5 rounded bg-muted/50 text-[10px]">
                                            <span className="font-mono text-muted-foreground">
                                              {post.id?.slice(0, 8)}...
                                            </span>
                                            <span className="ml-2">{post.caption}</span>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {/* Response Preview */}
                          <div className="p-3 rounded-lg bg-muted/30 border">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-xs font-medium">Resposta Final</span>
                            </div>
                            <p className="text-xs text-muted-foreground line-clamp-4">
                              {execution.response}
                            </p>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })
          )}
        </div>
      </ScrollArea>
    </motion.div>
  );
}
