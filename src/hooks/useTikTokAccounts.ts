import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspace } from '@/hooks/useWorkspace';

export interface TikTokAccount {
  id: string;
  open_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  access_token: string;
  refresh_token: string | null;
  expires_at: string | null;
  connected_at: string | null;
  workspace_id: string | null;
}

export function useTikTokAccounts() {
  const { user } = useAuth();
  const { currentWorkspace } = useWorkspace();
  const [accounts, setAccounts] = useState<TikTokAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAccounts = useCallback(async () => {
    if (!user || !currentWorkspace) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      // Query by workspace_id first, fallback to user_id for accounts without workspace
      const { data, error: fetchError } = await supabase
        .from('tiktok_accounts')
        .select('*')
        .or(`workspace_id.eq.${currentWorkspace.id},and(workspace_id.is.null,user_id.eq.${user.id})`);

      if (fetchError) throw fetchError;
      setAccounts(data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [user, currentWorkspace]);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const disconnectAccount = async (accountId: string) => {
    try {
      const { error } = await supabase
        .from('tiktok_accounts')
        .delete()
        .eq('id', accountId);
      if (error) throw error;
      setAccounts(prev => prev.filter(a => a.id !== accountId));
    } catch (err: any) {
      setError(err.message);
    }
  };

  const getTokenStatus = (expiresAt: string | null): 'active' | 'expiring' | 'expired' => {
    if (!expiresAt) return 'active';
    const now = new Date();
    const expires = new Date(expiresAt);
    const daysLeft = (expires.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    if (daysLeft <= 0) return 'expired';
    if (daysLeft <= 7) return 'expiring';
    return 'active';
  };

  const getDaysUntilExpiry = (expiresAt: string | null): number => {
    if (!expiresAt) return 999;
    const now = new Date();
    const expires = new Date(expiresAt);
    return Math.max(0, Math.floor((expires.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
  };

  return { accounts, isLoading, error, fetchAccounts, disconnectAccount, getTokenStatus, getDaysUntilExpiry };
}
