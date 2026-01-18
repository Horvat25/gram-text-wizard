import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Lightbulb, 
  CheckCircle, 
  Clock, 
  Hash,
  Flame,
  BookOpen
} from 'lucide-react';
import { motion } from 'framer-motion';
import { AgentContext } from '@/hooks/useAgentContext';

interface AgentLearningsProps {
  context: AgentContext | null;
}

export default function AgentLearnings({ context }: AgentLearningsProps) {
  const hasLearnings = (
    (context?.success_patterns && context.success_patterns.length > 0) ||
    (context?.best_posting_times && context.best_posting_times.length > 0) ||
    (context?.best_hashtags && context.best_hashtags.length > 0) ||
    (context?.top_topics && context.top_topics.length > 0)
  );

  return (
    <Card className="border-primary/20 h-full">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <div className="p-1.5 rounded-lg bg-yellow-500/10">
            <Lightbulb className="h-4 w-4 text-yellow-500" />
          </div>
          Aprendizados do Agente
        </CardTitle>
        <CardDescription>
          O que o agente descobriu sobre sua audiência
        </CardDescription>
      </CardHeader>
      
      <CardContent>
        <ScrollArea className="h-[280px] pr-2">
          {!hasLearnings ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-8">
              <div className="p-4 rounded-full bg-muted mb-4">
                <BookOpen className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">
                O agente ainda está coletando dados...
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Execute o agente para começar a aprender!
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Success Patterns */}
              {context?.success_patterns && context.success_patterns.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="space-y-2"
                >
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span>Padrões de Sucesso</span>
                  </div>
                  <div className="space-y-1.5 pl-6">
                    {context.success_patterns.slice(0, 5).map((pattern, i) => (
                      <div 
                        key={i} 
                        className="text-xs p-2 bg-green-500/10 rounded-lg border border-green-500/20"
                      >
                        {pattern}
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* Best Posting Times */}
              {context?.best_posting_times && context.best_posting_times.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 }}
                  className="space-y-2"
                >
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Clock className="h-4 w-4 text-blue-500" />
                    <span>Melhores Horários</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 pl-6">
                    {context.best_posting_times.map((time, i) => (
                      <Badge key={i} variant="outline" className="bg-blue-500/5 border-blue-500/20">
                        {time}
                      </Badge>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* Best Hashtags */}
              {context?.best_hashtags && context.best_hashtags.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 }}
                  className="space-y-2"
                >
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Hash className="h-4 w-4 text-purple-500" />
                    <span>Hashtags de Alto Desempenho</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 pl-6">
                    {context.best_hashtags.slice(0, 8).map((tag, i) => (
                      <Badge key={i} variant="secondary" className="bg-purple-500/10 text-purple-700 dark:text-purple-300">
                        #{tag}
                      </Badge>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* Top Topics */}
              {context?.top_topics && context.top_topics.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 }}
                  className="space-y-2"
                >
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Flame className="h-4 w-4 text-orange-500" />
                    <span>Tópicos Fortes</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 pl-6">
                    {context.top_topics.map((topic, i) => (
                      <Badge key={i} className="bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/20">
                        {topic}
                      </Badge>
                    ))}
                  </div>
                </motion.div>
              )}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
