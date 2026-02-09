import AgentGenieView from '@/components/agent/AgentGenieView';

interface AgentTabProps {
  onNavigate?: (tab: string) => void;
}

export default function AgentTab({ onNavigate }: AgentTabProps) {
  return (
    <div className="h-full">
      <AgentGenieView onNavigate={onNavigate} />
    </div>
  );
}
