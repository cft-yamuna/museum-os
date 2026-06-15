import { CONFIG_PANELS } from './template-configs';

interface TemplateConfigPanelProps {
  template: string;
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
  siteId: string;
}

export function TemplateConfigPanel({ template, config, onChange, siteId }: TemplateConfigPanelProps) {
  const Panel = CONFIG_PANELS[template];
  if (!Panel) return null;
  return <Panel config={config} onChange={onChange} siteId={siteId} />;
}
