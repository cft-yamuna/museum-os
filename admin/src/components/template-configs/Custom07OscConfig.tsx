import {
  useConfigData, contentPicker, IdleScreenToggle, InputSourceConfig,
  ConfigSection, ConfigPageLayout, type ConfigPanelProps, type SectionDef,
} from './SharedConfigFields';

const SECTIONS: SectionDef[] = [
  { id: 'input', title: 'Input Source', color: '#d97706' },
  { id: 'content', title: 'Content', color: '#c2185b' },
  { id: 'idle', title: 'Idle Screen', color: '#0891b2' },
];

export function Custom07OscConfig({ config, onChange, siteId }: ConfigPanelProps) {
  const { images, videos } = useConfigData(siteId);

  return (
    <ConfigPageLayout sections={SECTIONS}>

      {/* Input Source */}
      <ConfigSection id="input" title="Input Source" accentColor="#d97706"
        description="Choose how this app receives trigger signals — via COM (serial) or OSC (Open Sound Control)">
        <InputSourceConfig config={config} onChange={onChange} />
      </ConfigSection>

      {/* Content */}
      <ConfigSection id="content" title="Content" accentColor="#c2185b"
        description="Video to play on trigger and idle image">
        <div className="space-y-4">
          {contentPicker('videoUrl', 'Trigger Video', videos, 'Select video...', config, onChange, siteId, 'video/*')}
          {contentPicker('idleImageUrl', 'Idle Image', images, 'Select idle image...', config, onChange, siteId, 'image/*')}
        </div>
      </ConfigSection>

      {/* Idle Screen */}
      <ConfigSection id="idle" title="Idle Screen" accentColor="#0891b2"
        description="Fallback attract screen when no idle image is set">
        <IdleScreenToggle config={config} onChange={onChange} images={images} videos={videos} siteId={siteId} />
      </ConfigSection>

    </ConfigPageLayout>
  );
}
