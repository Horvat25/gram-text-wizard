// Re-export the new settings panel for backwards compatibility
import AgentSettingsPanel from './AgentSettingsPanel';

interface AgentConfigPanelProps {
  trigger?: React.ReactNode;
  onConfigChange?: (config: any) => void;
  onClearChat?: () => void;
}

export default function AgentConfigPanel(props: AgentConfigPanelProps) {
  return <AgentSettingsPanel {...props} />;
}
