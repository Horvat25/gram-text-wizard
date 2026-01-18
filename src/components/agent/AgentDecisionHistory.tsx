import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  History, 
  CheckCircle, 
  XCircle,
  Lightbulb,
  Bot,
  ArrowRight,
  Clock
} from 'lucide-react';
import { motion } from 'framer-motion';
import { AgentDecision } from '@/hooks/useAgentContext';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface AgentDecisionHistoryProps {
  decisions: AgentDecision[];
}

function DecisionCard({ decision, index }: { decision: AgentDecision; index: number }) {
  const getBadgeStyles = (d: string) => {
    switch (d) {
      case 'POST':
        return 'bg-green-500/10 text-green-700 dark:text-green-300 border-green-500/30';
      case 'NO_POST':
        return 'bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/30';
      case 'WAIT':
        return 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-300 border-yellow-500/30';
      default:
        return '';
    }
  };

  const getDecisionIcon = (d: string) => {
    switch (d) {
      case 'POST': return '✅';
      case 'NO_POST': return '⏸️';
      case 'WAIT': return '⏳';
      default: return '🤖';
    }
  };

  const getDecisionLabel = (d: string) => {
    switch (d) {
      case 'POST': return 'Publicou';
      case 'NO_POST': return 'Não Publicou';
      case 'WAIT': return 'Aguardou';
      default: return d;
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05 }}
      className="relative pl-8 pb-6 last:pb-0"
    >
      {/* Timeline line */}
      <div className="absolute left-3 top-6 bottom-0 w-px bg-border last:hidden" />
      
      {/* Timeline dot */}
      <div className={`absolute left-0 top-1 w-6 h-6 rounded-full flex items-center justify-center text-xs
        ${decision.hypothesis_confirmed === true ? 'bg-green-500/20' : 
          decision.hypothesis_confirmed === false ? 'bg-red-500/20' : 'bg-muted'}`}
      >
        {getDecisionIcon(decision.decision)}
      </div>

      <div className="bg-card border border-border/50 rounded-xl p-4 hover:border-primary/30 transition-colors">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={getBadgeStyles(decision.decision)}>
              {getDecisionLabel(decision.decision)}
            </Badge>
            {decision.hypothesis_confirmed !== null && (
              <Badge variant="outline" className={decision.hypothesis_confirmed 
                ? 'bg-green-500/10 border-green-500/30' 
                : 'bg-red-500/10 border-red-500/30'
              }>
                {decision.hypothesis_confirmed ? (
                  <><CheckCircle className="h-3 w-3 mr-1" /> Confirmada</>
                ) : (
                  <><XCircle className="h-3 w-3 mr-1" /> Não Confirmada</>
                )}
              </Badge>
            )}
          </div>
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatDistanceToNow(new Date(decision.created_at), { 
              addSuffix: true, 
              locale: ptBR 
            })}
          </span>
        </div>
        
        <p className="text-sm mb-3">{decision.decision_reason}</p>
        
        {decision.hypothesis && (
          <div className="text-xs bg-muted/50 p-2.5 rounded-lg mb-3 border border-border/50">
            <span className="font-medium text-muted-foreground">💡 Hipótese: </span>
            {decision.hypothesis}
          </div>
        )}
        
        {decision.content_plan && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {decision.content_plan.format && (
              <Badge variant="outline" className="text-xs">
                {decision.content_plan.format}
              </Badge>
            )}
            {decision.content_plan.mediaType && (
              <Badge variant="outline" className="text-xs">
                {decision.content_plan.mediaType}
              </Badge>
            )}
            {decision.content_plan.platforms?.map((p: string) => (
              <Badge key={p} variant="outline" className="text-xs">
                {p}
              </Badge>
            ))}
          </div>
        )}
        
        {(decision.expected_engagement || decision.actual_engagement !== null) && (
          <div className="flex items-center gap-3 text-xs">
            {decision.expected_engagement && (
              <span className="text-muted-foreground">
                Esperado: <strong>{decision.expected_engagement.toFixed(1)}%</strong>
              </span>
            )}
            {decision.expected_engagement && decision.actual_engagement !== null && (
              <ArrowRight className="h-3 w-3 text-muted-foreground" />
            )}
            {decision.actual_engagement !== null && (
              <span className={decision.hypothesis_confirmed ? 'text-green-600' : 'text-red-600'}>
                Real: <strong>{decision.actual_engagement.toFixed(1)}%</strong>
              </span>
            )}
          </div>
        )}
        
        {decision.learning && (
          <div className="mt-3 text-xs bg-primary/5 p-2.5 rounded-lg flex items-start gap-2 border border-primary/20">
            <Lightbulb className="h-3.5 w-3.5 mt-0.5 text-primary shrink-0" />
            <span>{decision.learning}</span>
          </div>
        )}
      </div>
    </motion.div>
  );
}

export default function AgentDecisionHistory({ decisions }: AgentDecisionHistoryProps) {
  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <div className="p-1.5 rounded-lg bg-primary/10">
            <History className="h-4 w-4 text-primary" />
          </div>
          Histórico de Decisões
        </CardTitle>
        <CardDescription>
          As últimas {decisions.length} decisões do agente
        </CardDescription>
      </CardHeader>
      
      <CardContent>
        <ScrollArea className="h-[450px] pr-4">
          {decisions.length > 0 ? (
            <div className="space-y-0">
              {decisions.map((decision, index) => (
                <DecisionCard key={decision.id} decision={decision} index={index} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center py-12">
              <div className="p-4 rounded-full bg-muted mb-4">
                <Bot className="h-10 w-10 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground">Nenhuma decisão registrada ainda</p>
              <p className="text-sm text-muted-foreground mt-1">
                Execute o agente para começar!
              </p>
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
