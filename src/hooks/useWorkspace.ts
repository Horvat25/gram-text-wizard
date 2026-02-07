import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

import { Json } from '@/integrations/supabase/types';

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  settings: Json;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface WorkspaceMember {
  id: string;
  workspace_id: string;
  user_id: string;
  role: 'owner' | 'editor' | 'viewer';
  created_at: string;
}

export interface UserGlobalRole {
  role: 'super_admin' | 'admin' | 'user';
}

interface WorkspaceContextType {
  // State
  workspaces: Workspace[];
  currentWorkspace: Workspace | null;
  currentWorkspaceRole: 'owner' | 'editor' | 'viewer' | null;
  globalRole: 'super_admin' | 'admin' | 'user' | null;
  isLoading: boolean;
  
  // Derived
  isSuperAdmin: boolean;
  isAdmin: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canManageWorkspaces: boolean;
  
  // Actions
  setCurrentWorkspace: (workspace: Workspace | null) => void;
  selectWorkspaceById: (id: string) => void;
  createWorkspace: (name: string) => Promise<Workspace | null>;
  updateWorkspace: (id: string, updates: Partial<Workspace>) => Promise<boolean>;
  deleteWorkspace: (id: string) => Promise<boolean>;
  addMember: (workspaceId: string, email: string, role: 'owner' | 'editor' | 'viewer') => Promise<boolean>;
  removeMember: (workspaceId: string, userId: string) => Promise<boolean>;
  refetch: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextType | null>(null);

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return context;
}

// Hook for the provider to use internally
export function useWorkspaceState() {
  const { user } = useAuth();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(null);
  const [currentWorkspaceRole, setCurrentWorkspaceRole] = useState<'owner' | 'editor' | 'viewer' | null>(null);
  const [globalRole, setGlobalRole] = useState<'super_admin' | 'admin' | 'user' | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch global role
  const fetchGlobalRole = useCallback(async () => {
    if (!user) {
      setGlobalRole(null);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching global role:', error);
      }

      setGlobalRole((data?.role as 'super_admin' | 'admin' | 'user') || 'user');
    } catch (err) {
      console.error('Error in fetchGlobalRole:', err);
      setGlobalRole('user');
    }
  }, [user]);

  // Fetch workspaces user has access to
  const fetchWorkspaces = useCallback(async () => {
    if (!user) {
      setWorkspaces([]);
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('workspaces')
        .select('*')
        .order('name', { ascending: true });

      if (error) throw error;

      setWorkspaces(data || []);

      // If no current workspace selected, select the first one
      if (!currentWorkspace && data && data.length > 0) {
        // Try to restore from localStorage
        const savedWorkspaceId = localStorage.getItem('currentWorkspaceId');
        const savedWorkspace = data.find(w => w.id === savedWorkspaceId);
        setCurrentWorkspace(savedWorkspace || data[0]);
      }
    } catch (err) {
      console.error('Error fetching workspaces:', err);
    } finally {
      setIsLoading(false);
    }
  }, [user, currentWorkspace]);

  // Fetch current workspace role
  const fetchCurrentWorkspaceRole = useCallback(async () => {
    if (!user || !currentWorkspace) {
      setCurrentWorkspaceRole(null);
      return;
    }

    // Super admin has full access
    if (globalRole === 'super_admin') {
      setCurrentWorkspaceRole('owner');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('workspace_members')
        .select('role')
        .eq('workspace_id', currentWorkspace.id)
        .eq('user_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching workspace role:', error);
      }

      setCurrentWorkspaceRole((data?.role as 'owner' | 'editor' | 'viewer') || null);
    } catch (err) {
      console.error('Error in fetchCurrentWorkspaceRole:', err);
    }
  }, [user, currentWorkspace, globalRole]);

  // Initial fetch
  useEffect(() => {
    if (user) {
      fetchGlobalRole();
      fetchWorkspaces();
    } else {
      setWorkspaces([]);
      setCurrentWorkspace(null);
      setGlobalRole(null);
      setCurrentWorkspaceRole(null);
      setIsLoading(false);
    }
  }, [user, fetchGlobalRole, fetchWorkspaces]);

  // Fetch workspace role when workspace changes
  useEffect(() => {
    if (currentWorkspace) {
      localStorage.setItem('currentWorkspaceId', currentWorkspace.id);
      fetchCurrentWorkspaceRole();
    }
  }, [currentWorkspace, fetchCurrentWorkspaceRole]);

  // Derived permissions
  const isSuperAdmin = globalRole === 'super_admin';
  const isAdmin = globalRole === 'super_admin' || globalRole === 'admin';
  const canEdit = isSuperAdmin || currentWorkspaceRole === 'owner' || currentWorkspaceRole === 'editor';
  const canDelete = isSuperAdmin || currentWorkspaceRole === 'owner';
  const canManageWorkspaces = isAdmin;

  // Actions
  const selectWorkspaceById = useCallback((id: string) => {
    const workspace = workspaces.find(w => w.id === id);
    if (workspace) {
      setCurrentWorkspace(workspace);
    }
  }, [workspaces]);

  const createWorkspace = useCallback(async (name: string): Promise<Workspace | null> => {
    if (!user || !isAdmin) return null;

    const slug = name.toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    try {
      const { data, error } = await supabase
        .from('workspaces')
        .insert({
          name,
          slug: `${slug}-${Date.now()}`,
          created_by: user.id,
          settings: {}
        })
        .select()
        .single();

      if (error) throw error;

      // Add creator as owner
      await supabase
        .from('workspace_members')
        .insert({
          workspace_id: data.id,
          user_id: user.id,
          role: 'owner'
        });

      await fetchWorkspaces();
      return data;
    } catch (err) {
      console.error('Error creating workspace:', err);
      return null;
    }
  }, [user, isAdmin, fetchWorkspaces]);

  const updateWorkspace = useCallback(async (id: string, updates: Partial<Workspace>): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('workspaces')
        .update(updates)
        .eq('id', id);

      if (error) throw error;
      await fetchWorkspaces();
      return true;
    } catch (err) {
      console.error('Error updating workspace:', err);
      return false;
    }
  }, [fetchWorkspaces]);

  const deleteWorkspace = useCallback(async (id: string): Promise<boolean> => {
    if (!isSuperAdmin) return false;

    try {
      const { error } = await supabase
        .from('workspaces')
        .delete()
        .eq('id', id);

      if (error) throw error;

      if (currentWorkspace?.id === id) {
        const remaining = workspaces.filter(w => w.id !== id);
        setCurrentWorkspace(remaining[0] || null);
      }

      await fetchWorkspaces();
      return true;
    } catch (err) {
      console.error('Error deleting workspace:', err);
      return false;
    }
  }, [isSuperAdmin, currentWorkspace, workspaces, fetchWorkspaces]);

  const addMember = useCallback(async (
    workspaceId: string, 
    email: string, 
    role: 'owner' | 'editor' | 'viewer'
  ): Promise<boolean> => {
    // Note: This would need a lookup by email - simplified for now
    console.log('addMember not fully implemented - needs email lookup');
    return false;
  }, []);

  const removeMember = useCallback(async (workspaceId: string, userId: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('workspace_members')
        .delete()
        .eq('workspace_id', workspaceId)
        .eq('user_id', userId);

      if (error) throw error;
      return true;
    } catch (err) {
      console.error('Error removing member:', err);
      return false;
    }
  }, []);

  const refetch = useCallback(async () => {
    await Promise.all([fetchGlobalRole(), fetchWorkspaces()]);
  }, [fetchGlobalRole, fetchWorkspaces]);

  return {
    workspaces,
    currentWorkspace,
    currentWorkspaceRole,
    globalRole,
    isLoading,
    isSuperAdmin,
    isAdmin,
    canEdit,
    canDelete,
    canManageWorkspaces,
    setCurrentWorkspace,
    selectWorkspaceById,
    createWorkspace,
    updateWorkspace,
    deleteWorkspace,
    addMember,
    removeMember,
    refetch,
  };
}

export { WorkspaceContext };
