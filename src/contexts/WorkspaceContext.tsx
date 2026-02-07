import { ReactNode } from 'react';
import { WorkspaceContext, useWorkspaceState } from '@/hooks/useWorkspace';

interface WorkspaceProviderProps {
  children: ReactNode;
}

export function WorkspaceProvider({ children }: WorkspaceProviderProps) {
  const workspaceState = useWorkspaceState();

  return (
    <WorkspaceContext.Provider value={workspaceState}>
      {children}
    </WorkspaceContext.Provider>
  );
}
