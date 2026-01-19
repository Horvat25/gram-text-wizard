import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Clock, 
  Brain, 
  Search, 
  Sparkles, 
  Send, 
  BarChart3, 
  BookOpen,
  Zap,
  CheckCircle2,
  Circle,
  Timer,
  Settings2,
  Calendar,
  Play
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { format, addHours, setHours, setMinutes, isAfter, isBefore, differenceInMinutes } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ScheduleTask {
  id: string;
  time: string;
  action: 'analyze' | 'plan' | 'create' | 'post' | 'feedback';
  title: string;
  description: string;
  icon: React.ReactNode;
  status: 'pending' | 'completed' | 'running' | 'upcoming';
  enabled: boolean;
}

interface AgentRoutineSchedulerProps {
  context: any;
  onUpdate: (updates: any) => Promise<void>;
  onRunAgent: () => void;
  isRunning: boolean;
}

const DEFAULT_SCHEDULE: Omit<ScheduleTask, 'status'>[] = [
  {
    id: 'morning-analyze',
    time: '07:00',
    action: 'analyze',
    title: 'Análise Matinal',
    description: 'Analisar métricas das últimas 24h e tendências',
    icon: <BarChart3 className="h-4 w-4" />,
    enabled: true,
  },
  {
    id: 'morning-plan',
    time: '08:00',
    action: 'plan',
    title: 'Planejamento de Conteúdo',
    description: 'Pesquisar notícias e definir temas do dia',
    icon: <Search className="h-4 w-4" />,
    enabled: true,
  },
  {
    id: 'afternoon-create',
    time: '12:00',
    action: 'create',
    title: 'Criação de Conteúdo',
    description: 'Gerar legendas e imagens para posts',
    icon: <Sparkles className="h-4 w-4" />,
    enabled: true,
  },
  {
    id: 'afternoon-post',
    time: '14:00',
    action: 'post',
    title: 'Publicação Estratégica',
    description: 'Publicar conteúdo no melhor horário',
    icon: <Send className="h-4 w-4" />,
    enabled: true,
  },
  {
    id: 'evening-analyze',
    time: '18:00',
    action: 'analyze',
    title: 'Análise Vespertina',
    description: 'Revisar performance dos posts do dia',
    icon: <Brain className="h-4 w-4" />,
    enabled: true,
  },
  {
    id: 'evening-feedback',
    time: '21:00',
    action: 'feedback',
    title: 'Loop de Aprendizado',
    description: 'Processar feedback e ajustar estratégia',
    icon: <BookOpen className="h-4 w-4" />,
    enabled: true,
  },
];

const CRON_FREQUENCIES = [
  { value: '1', label: 'A cada 1 hora', cronExp: '0 * * * *' },
  { value: '2', label: 'A cada 2 horas', cronExp: '0 */2 * * *' },
  { value: '3', label: 'A cada 3 horas', cronExp: '0 */3 * * *' },
  { value: '4', label: 'A cada 4 horas', cronExp: '0 */4 * * *' },
  { value: '6', label: 'A cada 6 horas', cronExp: '0 */6 * * *' },
  { value: '8', label: 'A cada 8 horas', cronExp: '0 */8 * * *' },
  { value: '12', label: 'A cada 12 horas', cronExp: '0 */12 * * *' },
  { value: '24', label: '1x por dia', cronExp: '0 9 * * *' },
];

export default function AgentRoutineScheduler({ 
  context, 
  onUpdate, 
  onRunAgent,
  isRunning 
}: AgentRoutineSchedulerProps) {
  const [schedule, setSchedule] = useState<ScheduleTask[]>([]);
  const [cronFrequency, setCronFrequency] = useState('6');
  const [nextExecution, setNextExecution] = useState<Date | null>(null);
  const [countdown, setCountdown] = useState<string>('');

  // Initialize schedule with status based on current time
  useEffect(() => {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinutes = now.getMinutes();

    const scheduledTasks = DEFAULT_SCHEDULE.map(task => {
      const [taskHour, taskMinute] = task.time.split(':').map(Number);
      const taskTime = setMinutes(setHours(new Date(), taskHour), taskMinute);
      
      let status: ScheduleTask['status'] = 'pending';
      
      if (isBefore(taskTime, now)) {
        status = 'completed';
      } else if (differenceInMinutes(taskTime, now) <= 30) {
        status = 'upcoming';
      }

      return { ...task, status };
    });

    setSchedule(scheduledTasks);
  }, []);

  // Calculate next execution and countdown
  useEffect(() => {
    const frequency = parseInt(cronFrequency);
    const now = new Date();
    const currentHour = now.getHours();
    const nextHour = Math.ceil(currentHour / frequency) * frequency;
    const next = setMinutes(setHours(new Date(), nextHour >= 24 ? nextHour - 24 : nextHour), 0);
    
    if (isBefore(next, now)) {
      next.setDate(next.getDate() + 1);
    }
    
    setNextExecution(next);

    const interval = setInterval(() => {
      const now = new Date();
      const diff = differenceInMinutes(next, now);
      
      if (diff <= 0) {
        setCountdown('Executando...');
      } else if (diff < 60) {
        setCountdown(`${diff} min`);
      } else {
        const hours = Math.floor(diff / 60);
        const mins = diff % 60;
        setCountdown(`${hours}h ${mins}m`);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [cronFrequency]);

  const toggleTask = (taskId: string) => {
    setSchedule(prev => 
      prev.map(task => 
        task.id === taskId 
          ? { ...task, enabled: !task.enabled }
          : task
      )
    );
  };

  const getStatusColor = (status: ScheduleTask['status']) => {
    switch (status) {
      case 'completed': return 'text-green-500 bg-green-500/10';
      case 'running': return 'text-yellow-500 bg-yellow-500/10 animate-pulse';
      case 'upcoming': return 'text-blue-500 bg-blue-500/10';
      default: return 'text-muted-foreground bg-muted/50';
    }
  };

  const getActionColor = (action: ScheduleTask['action']) => {
    switch (action) {
      case 'analyze': return 'bg-purple-500/10 text-purple-500 border-purple-500/20';
      case 'plan': return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
      case 'create': return 'bg-pink-500/10 text-pink-500 border-pink-500/20';
      case 'post': return 'bg-green-500/10 text-green-500 border-green-500/20';
      case 'feedback': return 'bg-orange-500/10 text-orange-500 border-orange-500/20';
    }
  };

  const getActionLabel = (action: ScheduleTask['action']) => {
    switch (action) {
      case 'analyze': return 'Análise';
      case 'plan': return 'Planejamento';
      case 'create': return 'Criação';
      case 'post': return 'Publicação';
      case 'feedback': return 'Feedback';
    }
  };

  return (
    <Card className="border-primary/10">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10">
              <Calendar className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">Rotina do Agente</CardTitle>
              <CardDescription>
                Cronograma automático de tarefas diárias
              </CardDescription>
            </div>
          </div>
          
          {/* Next Execution Countdown */}
          <div className="flex items-center gap-2 text-sm">
            <Timer className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Próxima execução:</span>
            <Badge variant="outline" className="font-mono">
              {countdown || 'Calculando...'}
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Automation Controls */}
        <div className="flex flex-col sm:flex-row gap-4 p-4 rounded-xl bg-muted/30 border">
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-yellow-500" />
              <span className="font-medium text-sm">Modo Automático</span>
              <Switch 
                checked={context?.auto_post_enabled || false}
                onCheckedChange={(checked) => onUpdate({ auto_post_enabled: checked })}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Quando ativo, o agente executa automaticamente sem precisar de comandos manuais
            </p>
          </div>
          
          <Separator orientation="vertical" className="hidden sm:block h-auto" />
          
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium text-sm">Frequência de Execução</span>
            </div>
            <Select value={cronFrequency} onValueChange={setCronFrequency}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CRON_FREQUENCIES.map(freq => (
                  <SelectItem key={freq.value} value={freq.value}>
                    {freq.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <Separator orientation="vertical" className="hidden sm:block h-auto" />
          
          <div className="flex items-center">
            <Button 
              onClick={onRunAgent} 
              disabled={isRunning}
              className="gap-2 neural-gradient border-0"
            >
              <Play className="h-4 w-4" />
              Executar Agora
            </Button>
          </div>
        </div>

        {/* Timeline */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Cronograma Diário
          </h4>
          
          <ScrollArea className="h-[340px] pr-4">
            <div className="relative">
              {/* Timeline line */}
              <div className="absolute left-[27px] top-0 bottom-0 w-0.5 bg-border" />
              
              <AnimatePresence>
                {schedule.map((task, index) => (
                  <motion.div
                    key={task.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className={`relative flex items-start gap-4 pb-6 ${!task.enabled ? 'opacity-50' : ''}`}
                  >
                    {/* Time indicator */}
                    <div className={`relative z-10 flex items-center justify-center w-14 h-8 rounded-lg text-xs font-mono font-bold ${getStatusColor(task.status)}`}>
                      {task.time}
                    </div>
                    
                    {/* Status dot */}
                    <div className={`absolute left-[52px] top-1.5 z-20 ${
                      task.status === 'completed' ? 'text-green-500' : 
                      task.status === 'running' ? 'text-yellow-500' : 
                      task.status === 'upcoming' ? 'text-blue-500' : 
                      'text-muted-foreground'
                    }`}>
                      {task.status === 'completed' ? (
                        <CheckCircle2 className="h-4 w-4 fill-current" />
                      ) : task.status === 'running' ? (
                        <div className="h-4 w-4 rounded-full bg-yellow-500 animate-ping" />
                      ) : (
                        <Circle className="h-4 w-4" />
                      )}
                    </div>
                    
                    {/* Task card */}
                    <div className="flex-1 ml-4">
                      <div className="flex items-center justify-between p-3 rounded-lg bg-card border hover:border-primary/30 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg ${getActionColor(task.action)}`}>
                            {task.icon}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">{task.title}</span>
                              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${getActionColor(task.action)}`}>
                                {getActionLabel(task.action)}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {task.description}
                            </p>
                          </div>
                        </div>
                        
                        <Switch 
                          checked={task.enabled}
                          onCheckedChange={() => toggleTask(task.id)}
                          className="ml-4"
                        />
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </ScrollArea>
        </div>

        {/* Info Box */}
        <div className="p-4 rounded-xl bg-gradient-to-r from-primary/5 to-accent/5 border border-primary/10">
          <div className="flex items-start gap-3">
            <Brain className="h-5 w-5 text-primary mt-0.5" />
            <div className="text-sm">
              <p className="font-medium mb-1">Como funciona a automação?</p>
              <ul className="text-muted-foreground space-y-1 text-xs">
                <li>• O agente é executado automaticamente a cada <strong>{cronFrequency}h</strong></li>
                <li>• Em cada execução, ele analisa métricas, decide se deve postar, e executa o plano</li>
                <li>• As tarefas do cronograma são executadas dentro de cada ciclo do agente</li>
                <li>• Você pode executar manualmente a qualquer momento clicando em "Executar Agora"</li>
              </ul>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
