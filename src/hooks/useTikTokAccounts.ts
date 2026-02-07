import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useWorkspace } from "./useWorkspace";

export interface TikTokAccount {
  id: string;
  user_id: string;
  open_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  access_token: string;
  refresh_token: string | null;
  expires_at: string | null;
  connected_at: string | null;
  updated_at: string | null;
  workspace_id: string | null;
}

export const useTikTokAccounts = () => {
  const { currentWorkspace } = useWorkspace();
  const [accounts, setAccounts] = useState<TikTokAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAccounts = useCallback(async () => {
    if (!currentWorkspace) {
      setAccounts([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setAccounts([]);
        setIsLoading(false);
        return;
      }

      const { data, error: fetchError } = await supabase
        .from("tiktok_accounts")
        .select("*")
        .eq("workspace_id", currentWorkspace.id)
        .order("connected_at", { ascending: false });

      if (fetchError) {
        console.error("Error fetching TikTok accounts:", fetchError);
        setError(fetchError.message);
        return;
      }

      setAccounts((data as TikTokAccount[]) || []);
    } catch (err: any) {
      console.error("Error in fetchAccounts:", err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [currentWorkspace]);

  const disconnectAccount = async (accountId: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from("tiktok_accounts")
        .delete()
        .eq("id", accountId);

      if (error) throw error;

      setAccounts((prev) => prev.filter((acc) => acc.id !== accountId));
      toast.success("Conta TikTok desconectada");
      return true;
    } catch (err: any) {
      console.error("Error disconnecting TikTok account:", err);
      toast.error("Erro ao desconectar conta");
      return false;
    }
  };

  const getTokenStatus = (account: TikTokAccount): "active" | "expiring" | "expired" => {
    if (!account.expires_at) return "active";
    
    const now = new Date();
    const expiresAt = new Date(account.expires_at);
    const daysUntilExpiry = (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);

    if (daysUntilExpiry <= 0) return "expired";
    if (daysUntilExpiry <= 7) return "expiring";
    return "active";
  };

  const getDaysUntilExpiry = (account: TikTokAccount): number => {
    if (!account.expires_at) return 999;
    
    const now = new Date();
    const expiresAt = new Date(account.expires_at);
    return Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  };

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  return {
    accounts,
    isLoading,
    error,
    fetchAccounts,
    disconnectAccount,
    getTokenStatus,
    getDaysUntilExpiry,
  };
};
