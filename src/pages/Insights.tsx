import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Brain, TrendingUp, Sparkles, Calendar } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { getLearningSummary, learnFromMetrics } from "@/lib/agent-context";
import { findTopPerformingTopics, suggestBestHashtags, predictBestPostTime, analyzeAudienceSentiment } from "@/lib/agent-analytics";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const Insights = () => {
  const navigate = useNavigate();
  const learningSummary = getLearningSummary();
  const topTopics = findTopPerformingTopics();
  const bestHashtags = suggestBestHashtags();
  const bestTimes = predictBestPostTime();
  const sentiment = analyzeAudienceSentiment();

  const handleLearnFromData = () => {
    learnFromMetrics();
    toast.success("Agente atualizado com novos aprendizados!");
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Brain className="h-6 w-6 text-primary" />
                Insights do Agente
              </h1>
              <p className="text-sm text-muted-foreground">
                Aprendizados e recomendações baseadas em IA
              </p>
            </div>
          </div>
          <Button onClick={handleLearnFromData}>
            <Sparkles className="mr-2 h-4 w-4" />
            Atualizar Aprendizados
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Learning Status */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="h-5 w-5 text-primary" />
                Status do Agente
              </CardTitle>
              <CardDescription>Informações sobre o sistema de aprendizado</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Total de aprendizados</span>
                <Badge variant="secondary" className="text-lg">
                  {learningSummary.totalLearnings}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Última atualização</span>
                <span className="text-sm">
                  {format(new Date(learningSummary.lastUpdate), "dd/MM/yyyy HH:mm", {
                    locale: ptBR,
                  })}
                </span>
              </div>
              <div className="pt-4 space-y-2">
                <p className="text-sm font-medium">Principais Insights:</p>
                <ul className="space-y-2">
                  {learningSummary.topInsights.map((insight, index) => (
                    <li key={index} className="text-sm text-muted-foreground flex items-start gap-2">
                      <span className="text-primary">•</span>
                      {insight}
                    </li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>

          {/* Audience Profile */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                Perfil da Audiência
              </CardTitle>
              <CardDescription>Análise comportamental dos seus seguidores</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="p-4 rounded-lg border bg-card">
                  <p className="font-medium text-sm mb-2">Comportamento identificado:</p>
                  <p className="text-sm text-muted-foreground">{sentiment}</p>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-3 rounded-lg bg-primary/5">
                    <p className="text-xs text-muted-foreground">Curtidas</p>
                    <p className="text-lg font-bold text-primary">Alta</p>
                  </div>
                  <div className="p-3 rounded-lg bg-primary/5">
                    <p className="text-xs text-muted-foreground">Comentários</p>
                    <p className="text-lg font-bold text-primary">
                      {sentiment.includes("altamente") ? "Alta" : "Média"}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-primary/5">
                    <p className="text-xs text-muted-foreground">Salvamentos</p>
                    <p className="text-lg font-bold text-primary">
                      {sentiment.includes("salvar") ? "Alta" : "Média"}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Top Topics */}
          <Card>
            <CardHeader>
              <CardTitle>Tipos de Posts com Melhor Performance</CardTitle>
              <CardDescription>Baseado em análise de engajamento</CardDescription>
            </CardHeader>
            <CardContent>
              {topTopics.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Adicione métricas aos posts para ver recomendações
                </p>
              ) : (
                <div className="space-y-2">
                  {topTopics.map((topic, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-3 rounded-lg border bg-card"
                    >
                      <div className="flex items-center gap-3">
                        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-sm font-bold">
                          {index + 1}
                        </span>
                        <span className="font-medium capitalize">{topic}</span>
                      </div>
                      <Badge variant="outline">Recomendado</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Best Hashtags */}
          <Card>
            <CardHeader>
              <CardTitle>Hashtags de Alto Desempenho</CardTitle>
              <CardDescription>Use estas para maximizar alcance</CardDescription>
            </CardHeader>
            <CardContent>
              {bestHashtags.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Adicione métricas aos posts para ver recomendações
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {bestHashtags.map((tag, index) => (
                    <Badge
                      key={index}
                      variant="secondary"
                      className="text-sm px-3 py-1"
                    >
                      #{tag}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Best Posting Times */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-primary" />
                Melhores Horários para Postar
              </CardTitle>
              <CardDescription>Baseado em padrões de engajamento do Instagram</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                {bestTimes.map((time, index) => (
                  <div
                    key={index}
                    className="p-6 rounded-lg border bg-card text-center hover:bg-accent/50 transition-colors"
                  >
                    <p className="text-3xl font-bold text-primary mb-2">{time}</p>
                    <p className="text-xs text-muted-foreground">
                      {index === 0 && "Manhã"}
                      {index === 1 && "Tarde"}
                      {index === 2 && "Noite"}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default Insights;
