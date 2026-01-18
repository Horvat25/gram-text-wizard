import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Bot, 
  Play, 
  RefreshCw, 
  Brain, 
  TrendingUp, 
  Clock, 
  Target, 
  Zap,
  CheckCircle,
  XCircle,
  Loader2,
  Settings,
  History,
  Lightbulb
} from 'lucide-react';
import { useAgentContext, AgentDecision } from '@/hooks/useAgentContext';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

function DecisionCard({ decision }: { decision: AgentDecision }) {
  const getBadgeVariant = (d: string) => {
    switch (d) {
      case 'POST': return 'default';
      case 'NO_POST': return 'secondary';
      case 'WAIT': return 'outline';
      default: return 'outline';
    }
  };

  const getDecisionLabel = (d: string) => {
    switch (d) {
      case 'POST': return 'Postou';
      case 'NO_POST': return 'Não Postou';
      case 'WAIT': return 'Aguardou';
      default: return d;
    }
  };

  return (
    <div className="p-4 border rounded-lg space-y-3 bg-card">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant={getBadgeVariant(decision.decision)}>
            {getDecisionLabel(decision.decision)}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(decision.created_at), { 
              addSuffix: true, 
              locale: ptBR 
            })}
          </span>
        </div>
        {decision.hypothesis_confirmed !== null && (
          decision.hypothesis_confirmed ? (
            <CheckCircle className="h-4 w-4 text-green-500" />
          ) : (
            <XCircle className="h-4 w-4 text-red-500" />
          )
        )}
      </div>
      
      <p className="text-sm">{decision.decision_reason}</p>
      
      {decision.hypothesis && (
        <div className="text-xs text-muted-foreground bg-muted p-2 rounded">
          <strong>Hipótese:</strong> {decision.hypothesis}
        </div>
      )}
      
      {decision.content_plan && (
        <div className="flex flex-wrap gap-1">
          <Badge variant="outline" className="text-xs">
            {decision.content_plan.format}
          </Badge>
          <Badge variant="outline" className="text-xs">
            {decision.content_plan.mediaType}
          </Badge>
          {decision.content_plan.platforms?.map((p: string) => (
            <Badge key={p} variant="outline" className="text-xs">
              {p}
            </Badge>
          ))}
        </div>
      )}
      
      {decision.expected_engagement && (
        <div className="flex items-center gap-4 text-xs">
          <span className="text-muted-foreground">
            Esperado: {decision.expected_engagement.toFixed(1)}%
          </span>
          {decision.actual_engagement !== null && (
            <span className={decision.hypothesis_confirmed ? 'text-green-600' : 'text-red-600'}>
              Real: {decision.actual_engagement.toFixed(1)}%
            </span>
          )}
        </div>
      )}
      
      {decision.learning && (
        <div className="text-xs bg-primary/10 p-2 rounded flex items-start gap-2">
          <Lightbulb className="h-3 w-3 mt-0.5 text-primary shrink-0" />
          <span>{decision.learning}</span>
        </div>
      )}
    </div>
  );
}

export default function AgentTab() {
  const { 
    context, 
    decisions, 
    isLoading, 
    isRunning,
    stats,
    updateContext, 
    runAgent, 
    runFeedbackLoop 
  } = useAgentContext();

  const [localSettings, setLocalSettings] = useState({
    dailyLimit: context?.daily_post_limit || 2,
    minHours: context?.min_hours_between_posts || 4
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const accuracyRate = stats.hypothesesTotal > 0 
    ? (stats.hypothesesConfirmed / stats.hypothesesTotal * 100).toFixed(0)
    : 'N/A';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Bot className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-bold">Agente Autônomo</h2>
            <p className="text-muted-foreground text-sm">
              O cérebro que analisa, decide e aprende
            </p>
          </div>
        </div>
        
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={runFeedbackLoop}
            disabled={isRunning}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Processar Feedback
          </Button>
          <Button 
            onClick={runAgent}
            disabled={isRunning}
          >
            {isRunning ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Play className="h-4 w-4 mr-2" />
            )}
            Executar Agente
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Brain className="h-5 w-5 text-primary" />
              <div>
                <p className="text-2xl font-bold">{stats.totalDecisions}</p>
                <p className="text-xs text-muted-foreground">Decisões Tomadas</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Target className="h-5 w-5 text-green-500" />
              <div>
                <p className="text-2xl font-bold">{accuracyRate}%</p>
                <p className="text-xs text-muted-foreground">Taxa de Acerto</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <TrendingUp className="h-5 w-5 text-blue-500" />
              <div>
                <p className="text-2xl font-bold">
                  {stats.avgActualEngagement.toFixed(1)}%
                </p>
                <p className="text-xs text-muted-foreground">Eng. Médio Real</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Zap className="h-5 w-5 text-yellow-500" />
              <div>
                <p className="text-2xl font-bold">{stats.postsCreated}</p>
                <p className="text-xs text-muted-foreground">Posts Criados</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Configurações
            </CardTitle>
            <CardDescription>
              Controle o comportamento do agente
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Auto Post Toggle */}
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label htmlFor="auto-post">Publicação Automática</Label>
                <p className="text-xs text-muted-foreground">
                  Permitir que o agente publique automaticamente
                </p>
              </div>
              <Switch
                id="auto-post"
                checked={context?.auto_post_enabled || false}
                onCheckedChange={(checked) => updateContext({ auto_post_enabled: checked })}
              />
            </div>
            
            <Separator />
            
            {/* Daily Limit */}
            <div className="space-y-2">
              <Label htmlFor="daily-limit">Limite Diário de Posts</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="daily-limit"
                  type="number"
                  min={1}
                  max={10}
                  value={localSettings.dailyLimit}
                  onChange={(e) => setLocalSettings(s => ({ ...s, dailyLimit: parseInt(e.target.value) || 2 }))}
                  className="w-20"
                />
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => updateContext({ daily_post_limit: localSettings.dailyLimit })}
                >
                  Salvar
                </Button>
              </div>
            </div>
            
            {/* Min Hours */}
            <div className="space-y-2">
              <Label htmlFor="min-hours">Intervalo Mínimo (horas)</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="min-hours"
                  type="number"
                  min={1}
                  max={24}
                  value={localSettings.minHours}
                  onChange={(e) => setLocalSettings(s => ({ ...s, minHours: parseInt(e.target.value) || 4 }))}
                  className="w-20"
                />
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => updateContext({ min_hours_between_posts: localSettings.minHours })}
                >
                  Salvar
                </Button>
              </div>
            </div>
            
            <Separator />
            
            {/* Platforms */}
            <div className="space-y-2">
              <Label>Plataformas Preferidas</Label>
              <div className="flex gap-2">
                <Button
                  variant={context?.preferred_platforms?.includes('instagram') ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    const current = context?.preferred_platforms || [];
                    const updated = current.includes('instagram')
                      ? current.filter(p => p !== 'instagram')
                      : [...current, 'instagram'];
                    updateContext({ preferred_platforms: updated });
                  }}
                >
                  Instagram
                </Button>
                <Button
                  variant={context?.preferred_platforms?.includes('tiktok') ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    const current = context?.preferred_platforms || [];
                    const updated = current.includes('tiktok')
                      ? current.filter(p => p !== 'tiktok')
                      : [...current, 'tiktok'];
                    updateContext({ preferred_platforms: updated });
                  }}
                >
                  TikTok
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Learnings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5" />
              Aprendizados
            </CardTitle>
            <CardDescription>
              O que o agente aprendeu até agora
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {context?.success_patterns && context.success_patterns.length > 0 ? (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Padrões de Sucesso</Label>
                {context.success_patterns.map((pattern, i) => (
                  <div key={i} className="text-sm p-2 bg-green-500/10 rounded flex items-start gap-2">
                    <CheckCircle className="h-3 w-3 mt-1 text-green-500 shrink-0" />
                    <span>{pattern}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                O agente ainda está coletando dados para aprender...
              </p>
            )}
            
            {context?.best_posting_times && context.best_posting_times.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Melhores Horários
                </Label>
                <div className="flex flex-wrap gap-1">
                  {context.best_posting_times.map((time, i) => (
                    <Badge key={i} variant="outline">{time}</Badge>
                  ))}
                </div>
              </div>
            )}
            
            {context?.best_hashtags && context.best_hashtags.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Melhores Hashtags</Label>
                <div className="flex flex-wrap gap-1">
                  {context.best_hashtags.slice(0, 10).map((tag, i) => (
                    <Badge key={i} variant="secondary">#{tag}</Badge>
                  ))}
                </div>
              </div>
            )}
            
            {context?.top_topics && context.top_topics.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Tópicos Fortes</Label>
                <div className="flex flex-wrap gap-1">
                  {context.top_topics.map((topic, i) => (
                    <Badge key={i}>{topic}</Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Decision History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Histórico de Decisões
          </CardTitle>
          <CardDescription>
            As últimas {decisions.length} decisões do agente
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-3">
              {decisions.length > 0 ? (
                decisions.map((decision) => (
                  <DecisionCard key={decision.id} decision={decision} />
                ))
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Bot className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>Nenhuma decisão registrada ainda.</p>
                  <p className="text-sm">Execute o agente para começar!</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
