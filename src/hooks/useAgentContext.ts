import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useWorkspace } from './useWorkspace';
import { toast } from 'sonner';

export interface AgentContext {
  id: string;
  user_id: string;
  updated_at: string;
  brand_voice: string;
  success_patterns: string[];
  top_topics: string[];
  best_hashtags: string[];
  best_posting_times: string[];
  audience_preferences: string[];
  performance_history: number[];
  auto_post_enabled: boolean;
  preferred_platforms: string[];
  daily_post_limit: number;
  min_hours_between_posts: number;
  workspace_id: string | null;
  // Extended fields
  agent_name: string | null;
  agent_avatar_url: string | null;
  personality_traits: string[] | null;
  response_style: string | null;
  language_formality: string | null;
  emoji_usage: string | null;
  content_focus: string[] | null;
  target_audience: string | null;
  industry_niche: string | null;
  avoid_topics: string[] | null;
  hashtag_strategy: string | null;
  posting_style: string | null;
  system_prompt_template: string | null;
  // Content distribution
  content_distribution_videos: number | null;
  content_distribution_carousels: number | null;
  content_distribution_news: number | null;
  content_distribution_news_video: number | null;
  content_distribution_images: number | null;
  content_distribution_marketing: number | null;
  // Macro objectives
  goal_type: string | null;
  goal_weekly_views: number | null;
  goal_weekly_followers: number | null;
  goal_weekly_engagement: number | null;
  current_weekly_views: number | null;
  current_weekly_followers: number | null;
  current_weekly_engagement: number | null;
}

export interface AgentDecision {
  id: string;
  user_id: string;
  created_at: string;
  metrics_snapshot: any;
  decision: 'POST' | 'NO_POST' | 'WAIT';
  decision_reason: string;
  content_plan: any;
  hypothesis: string;
  expected_engagement: number;
  post_id: string | null;
  actual_engagement: number | null;
  hypothesis_confirmed: boolean | null;
  learning: string | null;
  workspace_id: string | null;
}

export function useAgentContext() {
  const { user } = useAuth();
  const { currentWorkspace } = useWorkspace();
  const [context, setContext] = useState<AgentContext | null>(null);
  const [decisions, setDecisions] = useState<AgentDecision[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRunning, setIsRunning] = useState(false);

  const fetchContext = useCallback(async () => {
    if (!user || !currentWorkspace) {
      setContext(null);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('agent_context')
        .select('*')
        .eq('workspace_id', currentWorkspace.id)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        // Create initial context for this workspace
        const { data: newContext, error: createError } = await supabase
          .from('agent_context')
          .insert({ 
            user_id: user.id,
            workspace_id: currentWorkspace.id
          })
          .select()
          .single();

        if (createError) throw createError;
        setContext(newContext as AgentContext);
      } else {
        setContext(data as AgentContext);
      }
    } catch (error) {
      console.error('Error fetching agent context:', error);
    }
  }, [user, currentWorkspace]);

  const fetchDecisions = useCallback(async () => {
    if (!user || !currentWorkspace) {
      setDecisions([]);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('agent_decisions')
        .select('*')
        .eq('workspace_id', currentWorkspace.id)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      setDecisions((data || []) as AgentDecision[]);
    } catch (error) {
      console.error('Error fetching agent decisions:', error);
    }
  }, [user, currentWorkspace]);

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      await Promise.all([fetchContext(), fetchDecisions()]);
      setIsLoading(false);
    };

    if (user) {
      loadData();
    }
  }, [user, fetchContext, fetchDecisions]);

  const updateContext = async (updates: Partial<AgentContext>) => {
    if (!user || !context || !currentWorkspace) return;

    try {
      const { error } = await supabase
        .from('agent_context')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('workspace_id', currentWorkspace.id);

      if (error) throw error;

      setContext(prev => prev ? { ...prev, ...updates } : null);
      toast.success('Configurações do agente atualizadas');
    } catch (error) {
      console.error('Error updating agent context:', error);
      toast.error('Erro ao atualizar configurações');
    }
  };

  const runAgent = async () => {
    if (!user || !currentWorkspace) return;

    setIsRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-agent-core', {
        body: { 
          userId: user.id, 
          workspaceId: currentWorkspace.id,
          trigger: 'manual' 
        }
      });

      if (error) throw error;

      toast.success(`Agente executado: ${data.decision}`);
      
      // Refresh decisions
      await fetchDecisions();
      
      return data;
    } catch (error) {
      console.error('Error running agent:', error);
      toast.error('Erro ao executar agente');
    } finally {
      setIsRunning(false);
    }
  };

  const runFeedbackLoop = async () => {
    if (!user || !currentWorkspace) return;

    try {
      const { data, error } = await supabase.functions.invoke('ai-agent-feedback', {
        body: { 
          userId: user.id, 
          workspaceId: currentWorkspace.id,
          processAll: true 
        }
      });

      if (error) throw error;

      toast.success(`Feedback processado: ${data.processed} posts`);
      
      // Refresh data
      await Promise.all([fetchContext(), fetchDecisions()]);
      
      return data;
    } catch (error) {
      console.error('Error running feedback loop:', error);
      toast.error('Erro ao processar feedback');
    }
  };

  // Calculate stats
  const stats = {
    totalDecisions: decisions.length,
    postsCreated: decisions.filter(d => d.decision === 'POST').length,
    hypothesesConfirmed: decisions.filter(d => d.hypothesis_confirmed === true).length,
    hypothesesTotal: decisions.filter(d => d.hypothesis_confirmed !== null).length,
    avgExpectedEngagement: decisions
      .filter(d => d.expected_engagement)
      .reduce((acc, d) => acc + (d.expected_engagement || 0), 0) / 
      (decisions.filter(d => d.expected_engagement).length || 1),
    avgActualEngagement: decisions
      .filter(d => d.actual_engagement)
      .reduce((acc, d) => acc + (d.actual_engagement || 0), 0) / 
      (decisions.filter(d => d.actual_engagement).length || 1),
  };

  return {
    context,
    decisions,
    isLoading,
    isRunning,
    stats,
    updateContext,
    runAgent,
    runFeedbackLoop,
    refetch: () => Promise.all([fetchContext(), fetchDecisions()])
  };
}
