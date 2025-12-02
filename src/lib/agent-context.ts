// Agent Context Manager - Learning and memory system

import { AgentContext, loadAgentContext, saveAgentContext } from "./local-storage";
import { findTopPerformingTopics, suggestBestHashtags, analyzeAudienceSentiment, getPerformanceSummary } from "./agent-analytics";

// Load current agent context
export const getContext = (): AgentContext => {
  return loadAgentContext();
};

// Update brand voice based on feedback
export const updateBrandVoice = (newVoice: string) => {
  saveAgentContext({ brandVoice: newVoice });
};

// Track performance patterns and update context
export const learnFromMetrics = () => {
  const topTopics = findTopPerformingTopics();
  const bestHashtags = suggestBestHashtags();
  const sentiment = analyzeAudienceSentiment();
  const summary = getPerformanceSummary();

  const successPatterns: string[] = [];

  // Analyze patterns
  if (summary.avgEngagement > 5) {
    successPatterns.push("High engagement posts use strong CTAs");
  }
  if (topTopics.length > 0) {
    successPatterns.push(`"${topTopics[0]}" type performs best`);
  }
  if (sentiment.includes("altamente engajada")) {
    successPatterns.push("Audience responds well to questions and discussions");
  }

  const performanceHistory = getContext().performanceHistory;
  performanceHistory.push(summary.avgEngagement);

  saveAgentContext({
    topTopics,
    bestHashtags,
    audiencePreferences: [sentiment],
    successPatterns,
    performanceHistory: performanceHistory.slice(-20), // Keep last 20 records
  });
};

// Generate contextual prompt for AI based on learnings
export const generateContextualPrompt = (baseTopic: string, postType: string): string => {
  const context = getContext();
  
  let additionalContext = `\n\n=== CONTEXTO DO AGENTE (Aprendizados) ===\n`;
  additionalContext += `Tom de voz da marca: ${context.brandVoice}\n`;

  if (context.successPatterns.length > 0) {
    additionalContext += `\nPadrões de sucesso identificados:\n`;
    context.successPatterns.forEach((pattern) => {
      additionalContext += `- ${pattern}\n`;
    });
  }

  if (context.bestHashtags.length > 0) {
    additionalContext += `\nHashtags de alto desempenho: #${context.bestHashtags.slice(0, 8).join(", #")}\n`;
    additionalContext += `(Considere usar 3-5 dessas hashtags)\n`;
  }

  if (context.audiencePreferences.length > 0) {
    additionalContext += `\nPerfil da audiência: ${context.audiencePreferences[0]}\n`;
  }

  additionalContext += `\n=== FIM DO CONTEXTO ===\n\n`;
  additionalContext += `Agora crie um post de tipo "${postType}" sobre: "${baseTopic}"`;

  return additionalContext;
};

// Get summary of agent learnings for display
export const getLearningSummary = (): {
  totalLearnings: number;
  lastUpdate: string;
  topInsights: string[];
} => {
  const context = getContext();
  
  return {
    totalLearnings: context.successPatterns.length + context.bestHashtags.length,
    lastUpdate: context.lastUpdated,
    topInsights: [
      ...context.successPatterns.slice(0, 3),
      context.audiencePreferences[0] || "Coletando dados da audiência...",
    ],
  };
};

// Reset agent context (for testing or fresh start)
export const resetContext = () => {
  saveAgentContext({
    brandVoice: "professional and engaging",
    successPatterns: [],
    topTopics: [],
    bestHashtags: [],
    audiencePreferences: [],
    performanceHistory: [],
  });
};
