import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface InstagramAccount {
  id: string;
  page_id: string | null;
  instagram_user_id: string;
  username: string | null;
  profile_picture_url: string | null;
  access_token: string;
  expires_at: string | null;
  connected_at: string | null;
  updated_at: string | null;
}

export function useInstagramAccounts() {
  const [accounts, setAccounts] = useState<InstagramAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchAccounts = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const { data, error } = await supabase
        .from('instagram_accounts')
        .select('*')
        .order('connected_at', { ascending: false });

      if (error) throw error;
      setAccounts(data || []);
    } catch (err: any) {
      console.error('Error fetching accounts:', err);
      const errorMessage = err.message?.includes('Failed to fetch') 
        ? 'Erro de conexão com o servidor. Verifique sua internet.'
        : err.message || 'Erro ao carregar contas';
      
      setError(errorMessage);
      toast({
        title: 'Erro ao carregar contas',
        description: errorMessage,
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const disconnectAccount = async (accountId: string) => {
    try {
      const { error } = await supabase
        .from('instagram_accounts')
        .delete()
        .eq('id', accountId);

      if (error) throw error;

      setAccounts(prev => prev.filter(acc => acc.id !== accountId));
      
      toast({
        title: 'Conta desconectada',
        description: 'A conta do Instagram foi removida com sucesso.'
      });
    } catch (error: any) {
      console.error('Error disconnecting account:', error);
      toast({
        title: 'Erro ao desconectar',
        description: error.message,
        variant: 'destructive'
      });
    }
  };

  const getTokenStatus = (expiresAt: string | null): 'active' | 'expiring' | 'expired' => {
    if (!expiresAt) return 'expired';
    
    const now = new Date();
    const expiry = new Date(expiresAt);
    const daysUntilExpiry = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysUntilExpiry <= 0) return 'expired';
    if (daysUntilExpiry <= 7) return 'expiring';
    return 'active';
  };

  const getDaysUntilExpiry = (expiresAt: string | null): number => {
    if (!expiresAt) return 0;
    
    const now = new Date();
    const expiry = new Date(expiresAt);
    return Math.max(0, Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
  };

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  return {
    accounts,
    loading,
    error,
    fetchAccounts,
    disconnectAccount,
    getTokenStatus,
    getDaysUntilExpiry
  };
}
