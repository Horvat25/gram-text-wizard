import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { 
  Clock, 
  Brain, 
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
  Play,
  Video,
  Image,
  Newspaper,
  Target,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { format, setHours, setMinutes, isBefore, differenceInMinutes } from 'date-fns';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

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

interface WeeklyGoals {
  totalPosts: number;
  videos: number;
  carousels: number;
  news: number;
  images: number;
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
    description: 'Métricas das últimas 24h',
    icon: <BarChart3 className="h-4 w-4" />,
    enabled: true,
  },
  {
    id: 'afternoon-create',
    time: '12:00',
    action: 'create',
    title: 'Criação',
    description: 'Gerar conteúdo',
    icon: <Sparkles className="h-4 w-4" />,
    enabled: true,
  },
  {
    id: 'afternoon-post',
    time: '14:00',
    action: 'post',
    title: 'Publicação',
    description: 'Postar no horário ideal',
    icon: <Send className="h-4 w-4" />,
    enabled: true,
  },
  {
    id: 'evening-feedback',
    time: '21:00',
    action: 'feedback',
    title: 'Aprendizado',
    description: 'Ajustar estratégia',
    icon: <BookOpen className="h-4 w-4" />,
    enabled: true,
  },
];

const CRON_FREQUENCIES = [
  { value: '1', label: '1h' },
  { value: '2', label: '2h' },
  { value: '3', label: '3h' },
  { value: '4', label: '4h' },
  { value: '6', label: '6h' },
  { value: '12', label: '12h' },
  { value: '24', label: '24h' },
];

const DEFAULT_GOALS: WeeklyGoals = {
  totalPosts: 14,
  videos: 3,
  carousels: 2,
  news: 4,
  images: 5
};

export default function AgentRoutineScheduler({ 
  context, 
  onUpdate, 
  onRunAgent,
  isRunning 
}: AgentRoutineSchedulerProps) {
  const [schedule, setSchedule] = useState<ScheduleTask[]>([]);
  const [cronFrequency, setCronFrequency] = useState('6');
  const [countdown, setCountdown] = useState<string>('');
  const [goals, setGoals] = useState<WeeklyGoals>(DEFAULT_GOALS);
  const [showSchedule, setShowSchedule] = useState(false);
  const [showGoals, setShowGoals] = useState(true);

  // Initialize schedule with status based on current time
  useEffect(() => {
    const now = new Date();

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

    const interval = setInterval(() => {
      const now = new Date();
      const diff = differenceInMinutes(next, now);
      
      if (diff <= 0) {
        setCountdown('Agora');
      } else if (diff < 60) {
        setCountdown(`${diff}min`);
      } else {
        const hours = Math.floor(diff / 60);
        const mins = diff % 60;
        setCountdown(`${hours}h${mins > 0 ? ` ${mins}m` : ''}`);
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
      case 'completed': return 'bg-green-500/20 text-green-500';
      case 'running': return 'bg-yellow-500/20 text-yellow-500 animate-pulse';
      case 'upcoming': return 'bg-blue-500/20 text-blue-500';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getActionColor = (action: ScheduleTask['action']) => {
    switch (action) {
      case 'analyze': return 'bg-purple-500/10 text-purple-500';
      case 'plan': return 'bg-blue-500/10 text-blue-500';
      case 'create': return 'bg-pink-500/10 text-pink-500';
      case 'post': return 'bg-green-500/10 text-green-500';
      case 'feedback': return 'bg-orange-500/10 text-orange-500';
    }
  };

  const handleGoalChange = (key: keyof WeeklyGoals, value: number) => {
    setGoals(prev => ({ ...prev, [key]: value }));
    // TODO: Save to context when backend supports it
  };

  return (
    <div className="space-y-4">
      {/* Main Controls Card - Mobile Optimized */}
      <Card className="border-primary/10">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="p-2 rounded-xl bg-primary/10 shrink-0">
                <Calendar className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0">
                <CardTitle className="text-base truncate">Rotina do Agente</CardTitle>
                <CardDescription className="text-xs">
                  Automação diária
                </CardDescription>
              </div>
            </div>
            
            {/* Countdown Badge */}
            <Badge variant="outline" className="shrink-0 font-mono text-xs gap-1">
              <Timer className="h-3 w-3" />
              {countdown || '...'}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-4 pt-0">
          {/* Automation Toggle - Full Width on Mobile */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border flex-1">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-yellow-500" />
                <span className="text-sm font-medium">Automático</span>
              </div>
              <Switch 
                checked={context?.auto_post_enabled || false}
                onCheckedChange={(checked) => onUpdate({ auto_post_enabled: checked })}
              />
            </div>
            
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/30 border flex-1">
              <Settings2 className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm shrink-0">A cada</span>
              <Select value={cronFrequency} onValueChange={setCronFrequency}>
                <SelectTrigger className="w-20 h-8">
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
          </div>

          {/* Run Now Button */}
          <Button 
            onClick={onRunAgent} 
            disabled={isRunning}
            className="w-full gap-2 neural-gradient border-0"
            size="lg"
          >
            <Play className="h-4 w-4" />
            {isRunning ? 'Executando...' : 'Executar Agora'}
          </Button>
        </CardContent>
      </Card>

      {/* Weekly Goals Card */}
      <Collapsible open={showGoals} onOpenChange={setShowGoals}>
        <Card className="border-primary/10">
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-green-500/10 shrink-0">
                    <Target className="h-4 w-4 text-green-500" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Metas Semanais</CardTitle>
                    <CardDescription className="text-xs">
                      O que o agente deve criar
                    </CardDescription>
                  </div>
                </div>
                {showGoals ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          
          <CollapsibleContent>
            <CardContent className="pt-0 space-y-4">
              {/* Total Posts */}
              <div className="p-3 rounded-lg bg-muted/30 border space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium flex items-center gap-2">
                    <Send className="h-4 w-4 text-primary" />
                    Total de posts/semana
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      max={50}
                      value={goals.totalPosts}
                      onChange={(e) => handleGoalChange('totalPosts', parseInt(e.target.value) || 1)}
                      className="w-16 h-8 text-center"
                    />
                    <span className="text-xs text-muted-foreground">posts</span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  ≈ {Math.round(goals.totalPosts / 7)} posts/dia
                </p>
              </div>

              {/* Content Type Distribution */}
              <div className="grid grid-cols-2 gap-2">
                <div className="p-3 rounded-lg bg-muted/30 border space-y-2">
                  <Label className="text-xs font-medium flex items-center gap-1.5">
                    <Video className="h-3.5 w-3.5 text-pink-500" />
                    Vídeos/Reels
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    max={20}
                    value={goals.videos}
                    onChange={(e) => handleGoalChange('videos', parseInt(e.target.value) || 0)}
                    className="h-8 text-center"
                  />
                </div>
                
                <div className="p-3 rounded-lg bg-muted/30 border space-y-2">
                  <Label className="text-xs font-medium flex items-center gap-1.5">
                    <Image className="h-3.5 w-3.5 text-blue-500" />
                    Carrosséis
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    max={20}
                    value={goals.carousels}
                    onChange={(e) => handleGoalChange('carousels', parseInt(e.target.value) || 0)}
                    className="h-8 text-center"
                  />
                </div>
                
                <div className="p-3 rounded-lg bg-muted/30 border space-y-2">
                  <Label className="text-xs font-medium flex items-center gap-1.5">
                    <Newspaper className="h-3.5 w-3.5 text-orange-500" />
                    Notícias
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    max={20}
                    value={goals.news}
                    onChange={(e) => handleGoalChange('news', parseInt(e.target.value) || 0)}
                    className="h-8 text-center"
                  />
                </div>
                
                <div className="p-3 rounded-lg bg-muted/30 border space-y-2">
                  <Label className="text-xs font-medium flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-purple-500" />
                    Imagens
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    max={20}
                    value={goals.images}
                    onChange={(e) => handleGoalChange('images', parseInt(e.target.value) || 0)}
                    className="h-8 text-center"
                  />
                </div>
              </div>

              <p className="text-xs text-muted-foreground text-center">
                O agente irá distribuir automaticamente ao longo da semana
              </p>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Daily Schedule Card - Collapsible */}
      <Collapsible open={showSchedule} onOpenChange={setShowSchedule}>
        <Card className="border-primary/10">
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-blue-500/10 shrink-0">
                    <Clock className="h-4 w-4 text-blue-500" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Cronograma Diário</CardTitle>
                    <CardDescription className="text-xs">
                      Tarefas automáticas do dia
                    </CardDescription>
                  </div>
                </div>
                {showSchedule ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          
          <CollapsibleContent>
            <CardContent className="pt-0">
              <div className="space-y-2">
                <AnimatePresence>
                  {schedule.map((task, index) => (
                    <motion.div
                      key={task.id}
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                        task.enabled ? 'bg-card' : 'opacity-50 bg-muted/20'
                      }`}
                    >
                      {/* Time */}
                      <div className={`px-2 py-1 rounded text-xs font-mono font-bold shrink-0 ${getStatusColor(task.status)}`}>
                        {task.time}
                      </div>
                      
                      {/* Status dot */}
                      <div className="shrink-0">
                        {task.status === 'completed' ? (
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                        ) : task.status === 'running' ? (
                          <div className="h-4 w-4 rounded-full bg-yellow-500 animate-ping" />
                        ) : (
                          <Circle className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                      
                      {/* Icon */}
                      <div className={`p-1.5 rounded-lg shrink-0 ${getActionColor(task.action)}`}>
                        {task.icon}
                      </div>
                      
                      {/* Text */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{task.title}</p>
                        <p className="text-xs text-muted-foreground truncate">{task.description}</p>
                      </div>
                      
                      {/* Toggle */}
                      <Switch 
                        checked={task.enabled}
                        onCheckedChange={() => toggleTask(task.id)}
                        className="shrink-0"
                      />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Info Box */}
      <Card className="border-primary/10 bg-gradient-to-r from-primary/5 to-accent/5">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Brain className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <div className="text-sm space-y-1">
              <p className="font-medium">Como funciona?</p>
              <ul className="text-muted-foreground text-xs space-y-0.5">
                <li>• O agente roda a cada <strong>{cronFrequency}h</strong> automaticamente</li>
                <li>• Analisa métricas → Decide → Cria → Posta</li>
                <li>• Segue as metas semanais que você definir</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
