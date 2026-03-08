import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspace } from '@/hooks/useWorkspace';

export interface InstagramAccount {
  id: string;
  instagram_user_id: string;
  username: string | null;
  access_token: string;
  page_id: string | null;
  profile_picture_url: string | null;
  connected_at: string | null;
  expires_at: string | null;
  workspace_id: string | null;
}

export function useInstagramAccounts() {
  const { user } = useAuth();
  const { currentWorkspace } = useWorkspace();
  const [accounts, setAccounts] = useState<InstagramAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAccounts = useCallback(async () => {
    if (!user || !currentWorkspace) {
      setLoading(false);
      return;
    }
    
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('instagram_accounts')
        .select('*')
        .eq('workspace_id', currentWorkspace.id);

      if (fetchError) throw fetchError;
      setAccounts(data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [user, currentWorkspace]);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const disconnectAccount = async (accountId: string) => {
    try {
      const { error } = await supabase
        .from('instagram_accounts')
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

  return { accounts, loading, error, fetchAccounts, disconnectAccount, getTokenStatus, getDaysUntilExpiry };
}
