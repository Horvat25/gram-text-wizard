import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { 
  Bot, 
  Power, 
  Wifi, 
  WifiOff,
  Clock,
  Zap
} from 'lucide-react';
import { motion } from 'framer-motion';
import { AgentContext } from '@/hooks/useAgentContext';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface AgentStatusCardProps {
  context: AgentContext | null;
  isRunning: boolean;
  onToggleAutoPost: (enabled: boolean) => void;
}

export default function AgentStatusCard({ context, isRunning, onToggleAutoPost }: AgentStatusCardProps) {
  const isAutoEnabled = context?.auto_post_enabled || false;
  
  return (
    <Card className="overflow-hidden border-primary/20 relative">
      {/* Background glow when active */}
      {isAutoEnabled && (
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5 pointer-events-none" />
      )}
      
      <CardContent className="p-6 relative">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            {/* Animated Bot Icon */}
            <div className="relative">
              <motion.div 
                className={`p-4 rounded-2xl ${isAutoEnabled ? 'neural-gradient glow-primary' : 'bg-muted'}`}
                animate={isAutoEnabled ? { 
                  boxShadow: [
                    '0 0 20px hsl(192 85% 45% / 0.3)',
                    '0 0 40px hsl(192 85% 45% / 0.5)',
                    '0 0 20px hsl(192 85% 45% / 0.3)'
                  ]
                } : {}}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <Bot className={`h-8 w-8 ${isAutoEnabled ? 'text-white' : 'text-muted-foreground'}`} />
              </motion.div>
              
              {/* Status indicator */}
              <motion.span 
                className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-background ${
                  isAutoEnabled ? 'bg-green-500' : 'bg-muted-foreground'
                }`}
                animate={isAutoEnabled ? { scale: [1, 1.2, 1] } : {}}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
            </div>
            
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-bold">Agente Autônomo</h3>
                <Badge 
                  variant={isAutoEnabled ? 'default' : 'secondary'}
                  className={isAutoEnabled ? 'neural-gradient border-0 text-white' : ''}
                >
                  {isAutoEnabled ? (
                    <><Wifi className="h-3 w-3 mr-1" /> Ativo</>
                  ) : (
                    <><WifiOff className="h-3 w-3 mr-1" /> Inativo</>
                  )}
                </Badge>
              </div>
              
              <p className="text-sm text-muted-foreground mt-1">
                {isAutoEnabled 
                  ? 'Monitorando e decidindo automaticamente' 
                  : 'Ative para publicações automáticas'}
              </p>
              
              {context?.updated_at && (
                <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Última atividade: {formatDistanceToNow(new Date(context.updated_at), { 
                    addSuffix: true, 
                    locale: ptBR 
                  })}
                </p>
              )}
            </div>
          </div>
          
          {/* Power Toggle */}
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center gap-2">
              <Power className={`h-4 w-4 ${isAutoEnabled ? 'text-primary' : 'text-muted-foreground'}`} />
              <Switch
                checked={isAutoEnabled}
                onCheckedChange={onToggleAutoPost}
                className="data-[state=checked]:bg-primary"
              />
            </div>
            <span className="text-xs text-muted-foreground">
              {isAutoEnabled ? 'Desligar' : 'Ligar'}
            </span>
          </div>
        </div>
        
        {/* Quick Stats */}
        <div className="grid grid-cols-3 gap-4 mt-6 pt-4 border-t border-border/50">
          <div className="text-center">
            <p className="text-2xl font-bold text-primary">{context?.daily_post_limit || 2}</p>
            <p className="text-xs text-muted-foreground">Posts/dia</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-primary">{context?.min_hours_between_posts || 4}h</p>
            <p className="text-xs text-muted-foreground">Intervalo</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-primary">
              {context?.preferred_platforms?.length || 1}
            </p>
            <p className="text-xs text-muted-foreground">Plataformas</p>
          </div>
        </div>
        
        {/* Running indicator */}
        {isRunning && (
          <motion.div 
            className="absolute inset-x-0 bottom-0 h-1 neural-gradient"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 2, repeat: Infinity }}
          />
        )}
      </CardContent>
    </Card>
  );
}
