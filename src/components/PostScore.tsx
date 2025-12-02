import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, AlertCircle, XCircle } from "lucide-react";
import { useEffect, useState } from "react";

interface PostScoreProps {
  caption: string;
  hashtags: string[];
}

interface ScoreResult {
  score: number;
  suggestions: {
    type: "success" | "warning" | "error";
    message: string;
  }[];
}

const PostScore = ({ caption, hashtags }: PostScoreProps) => {
  const [result, setResult] = useState<ScoreResult>({ score: 0, suggestions: [] });

  useEffect(() => {
    if (!caption) {
      setResult({ score: 0, suggestions: [] });
      return;
    }

    const suggestions: ScoreResult["suggestions"] = [];
    let score = 0;

    // 1. Tamanho da legenda (30 pontos)
    const length = caption.length;
    if (length >= 800 && length <= 1500) {
      score += 30;
      suggestions.push({
        type: "success",
        message: "✓ Tamanho ideal de legenda (800-1500 caracteres)",
      });
    } else if (length >= 500 && length < 800) {
      score += 20;
      suggestions.push({
        type: "warning",
        message: "⚠ Legenda um pouco curta. Tente 800+ caracteres para melhor performance",
      });
    } else if (length < 500) {
      score += 10;
      suggestions.push({
        type: "error",
        message: "✗ Legenda muito curta. O algoritmo favorece 800+ caracteres",
      });
    } else {
      score += 15;
      suggestions.push({
        type: "warning",
        message: "⚠ Legenda muito longa. Considere reduzir para 1500 caracteres",
      });
    }

    // 2. Hook forte (20 pontos)
    const firstLines = caption.split("\n").slice(0, 3).join(" ").toLowerCase();
    const hasQuestion = firstLines.includes("?");
    const hasStrongWords = /\b(você|descubra|imagine|atenção|cuidado|segredo|nunca)\b/.test(firstLines);
    
    if (hasQuestion || hasStrongWords) {
      score += 20;
      suggestions.push({
        type: "success",
        message: "✓ Hook forte detectado nas primeiras linhas",
      });
    } else {
      suggestions.push({
        type: "error",
        message: "✗ Hook fraco. Comece com uma pergunta ou afirmação impactante",
      });
    }

    // 3. CTA claro (15 pontos)
    const ctaWords = /\b(salva|marca|comenta|compartilha|clica|manda|deixa|conta)\b/i.test(caption);
    if (ctaWords) {
      score += 15;
      suggestions.push({
        type: "success",
        message: "✓ CTA (call-to-action) identificado",
      });
    } else {
      suggestions.push({
        type: "warning",
        message: "⚠ Adicione um CTA: 'Salva', 'Marca alguém', 'Comenta'",
      });
    }

    // 4. Emojis balanceados (10 pontos)
    const emojiCount = (caption.match(/[\p{Emoji}]/gu) || []).length;
    if (emojiCount >= 2 && emojiCount <= 6) {
      score += 10;
      suggestions.push({
        type: "success",
        message: "✓ Quantidade ideal de emojis",
      });
    } else if (emojiCount === 0) {
      suggestions.push({
        type: "warning",
        message: "⚠ Adicione 2-4 emojis para aumentar engajamento",
      });
    } else if (emojiCount > 10) {
      score += 3;
      suggestions.push({
        type: "error",
        message: "✗ Muitos emojis. Reduza para 4-6",
      });
    } else {
      score += 7;
    }

    // 5. Hashtags corretas (15 pontos)
    const hashtagCount = hashtags.length;
    if (hashtagCount >= 8 && hashtagCount <= 15) {
      score += 15;
      suggestions.push({
        type: "success",
        message: `✓ Quantidade ideal de hashtags (${hashtagCount})`,
      });
    } else if (hashtagCount < 8) {
      score += 5;
      suggestions.push({
        type: "warning",
        message: `⚠ Poucas hashtags (${hashtagCount}). Use 8-15 para melhor alcance`,
      });
    } else {
      score += 8;
      suggestions.push({
        type: "warning",
        message: "⚠ Muitas hashtags. Instagram pode marcar como spam",
      });
    }

    // 6. Parágrafos curtos (10 pontos)
    const paragraphs = caption.split("\n\n");
    const longParagraphs = paragraphs.filter(p => p.split("\n").length > 4).length;
    
    if (longParagraphs === 0 && paragraphs.length > 1) {
      score += 10;
      suggestions.push({
        type: "success",
        message: "✓ Boa quebra de parágrafos para facilitar leitura",
      });
    } else if (longParagraphs > 0) {
      score += 5;
      suggestions.push({
        type: "warning",
        message: "⚠ Divida parágrafos longos para melhorar leitura",
      });
    }

    setResult({ score: Math.min(score, 100), suggestions });
  }, [caption, hashtags]);

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600 dark:text-green-400";
    if (score >= 60) return "text-yellow-600 dark:text-yellow-400";
    return "text-red-600 dark:text-red-400";
  };

  const getScoreLabel = (score: number) => {
    if (score >= 90) return "Excelente! 🔥";
    if (score >= 80) return "Muito Bom! ✨";
    if (score >= 70) return "Bom";
    if (score >= 60) return "Regular";
    return "Precisa Melhorar";
  };

  if (!caption) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Análise de Performance</CardTitle>
        <CardDescription>
          Score preditivo baseado em técnicas de growth
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Score Display */}
        <div className="text-center space-y-2">
          <div className={`text-5xl font-bold ${getScoreColor(result.score)}`}>
            {result.score}
          </div>
          <div className="text-sm text-muted-foreground">
            {getScoreLabel(result.score)}
          </div>
          <Progress value={result.score} className="h-2" />
        </div>

        {/* Suggestions */}
        <div className="space-y-2">
          <h4 className="font-semibold text-sm">Sugestões:</h4>
          {result.suggestions.map((suggestion, index) => {
            const Icon =
              suggestion.type === "success"
                ? CheckCircle2
                : suggestion.type === "warning"
                ? AlertCircle
                : XCircle;

            const colorClass =
              suggestion.type === "success"
                ? "text-green-600 dark:text-green-400"
                : suggestion.type === "warning"
                ? "text-yellow-600 dark:text-yellow-400"
                : "text-red-600 dark:text-red-400";

            return (
              <div key={index} className="flex items-start gap-2 text-sm">
                <Icon className={`h-4 w-4 mt-0.5 flex-shrink-0 ${colorClass}`} />
                <span className="text-muted-foreground">{suggestion.message}</span>
              </div>
            );
          })}
        </div>

        {/* Quick Tips */}
        {result.score < 80 && (
          <div className="mt-4 p-3 bg-muted rounded-lg">
            <h4 className="font-semibold text-sm mb-2">💡 Dicas rápidas:</h4>
            <ul className="text-xs space-y-1 text-muted-foreground">
              <li>• Posts de 800-1500 caracteres têm 34% mais engajamento</li>
              <li>• Perguntas no início aumentam comentários em 56%</li>
              <li>• CTAs claros geram 2x mais ações</li>
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default PostScore;
