import {
  useFieldHelpers, useConfigData, contentPicker,
  FIT_OPTIONS, LABEL_CLS, INPUT_CLS, SegmentedControl,
  ConfigSection, ConfigPageLayout, type ConfigPanelProps, type SectionDef,
} from './SharedConfigFields';

const TRIGGER_OPTIONS = [
  { value: 'hardware', label: 'Hardware' },
  { value: 'touch', label: 'Touch' },
  { value: 'both', label: 'Both' },
];

const IDLE_TYPE_OPTIONS = [
  { value: 'image', label: 'Still Image' },
  { value: 'video', label: 'Looping Video' },
];

const AUDIO_OUTPUT_OPTIONS = [
  { value: 'monophone', label: 'Monophone (handset)' },
  { value: 'screen', label: 'Screen Speakers' },
  { value: 'directional-speaker', label: 'Directional Speaker' },
  { value: 'muted', label: 'Muted' },
];

export function App02VideoConfig({ config, onChange, siteId }: ConfigPanelProps) {
  const { numberField, selectField, note } = useFieldHelpers(config, onChange);
  const { videos, images } = useConfigData(siteId);

  const set = (key: string, value: unknown) => onChange({ ...config, [key]: value });
  const triggerMode = (config.triggerMode as string) || 'touch';
  const idleType = (config.idleType as string) || 'image';

  const sections: SectionDef[] = [
    { id: 'trigger', title: 'Trigger', color: '#d97706' },
    { id: 'idle-content', title: 'Idle Content', color: '#7c3aed' },
    { id: 'active-content', title: 'Active Content', color: '#c2185b' },
    { id: 'audio', title: 'Audio', color: '#059669' },
    { id: 'display', title: 'Display & Reset', color: '#475569' },
  ];

  return (
    <ConfigPageLayout sections={sections}>

      {/* Trigger */}
      <ConfigSection id="trigger" title="Trigger" accentColor="#d97706"
        description="How the video is activated">
        <div className="space-y-4">
          <SegmentedControl
            label="Trigger Mode"
            value={triggerMode}
            options={TRIGGER_OPTIONS}
            onChange={(v) => set('triggerMode', v)}
          />
          <div className="max-w-[200px]">
            {numberField('delay', 'Startup Delay (sec)', { min: 0, max: 10 })}
          </div>
          {triggerMode === 'touch' && note('Video will play on screen tap — no hardware required.')}
        </div>
      </ConfigSection>

      {/* Idle Content */}
      <ConfigSection id="idle-content" title="Idle Content" accentColor="#7c3aed"
        description="Shown before the video is triggered">
        <div className="space-y-4">
          <SegmentedControl
            label="Idle Content Type"
            value={idleType}
            options={IDLE_TYPE_OPTIONS}
            onChange={(v) => set('idleType', v)}
          />
          {idleType === 'image'
            ? contentPicker('idleImageUrl', 'Idle Image / Poster Frame', images, 'Select poster image...', config, onChange, siteId, 'image/*')
            : contentPicker('idleVideoUrl', 'Idle Video (loops)', videos, 'Select idle video...', config, onChange, siteId, 'video/*')
          }
          <div>
            <label className={LABEL_CLS}>Title / Text Overlay <span className="font-normal text-surface-400">(optional)</span></label>
            <input type="text" value={(config.titleText as string) || ''}
              onChange={(e) => set('titleText', e.target.value)}
              placeholder="e.g. Chairman's Welcome Note"
              className={INPUT_CLS} />
          </div>
          {idleType === 'image' && note('Tip: Use the first frame of the video as the poster for a seamless transition.')}
          {idleType === 'video' && note('This video loops continuously until the user triggers the main video.')}
        </div>
      </ConfigSection>

      {/* Active Content */}
      <ConfigSection id="active-content" title="Active Content" accentColor="#c2185b"
        description="The main video that plays after triggering">
        {contentPicker('videoUrl', 'Main Video', videos, 'Select main video...', config, onChange, siteId, 'video/*')}
      </ConfigSection>

      {/* Audio */}
      <ConfigSection id="audio" title="Audio Output" accentColor="#059669"
        description="How audio is routed during playback">
        <div className="space-y-4">
          {selectField('audioOutput', 'Audio Output', AUDIO_OUTPUT_OPTIONS)}
          {(config.audioOutput as string) === 'monophone' && note('Audio will play through the connected monophone handset.')}
          {(config.audioOutput as string) === 'directional-speaker' && note('Audio will play through overhead directional/shower speaker.')}
          {(config.audioOutput as string) === 'muted' && note('Video plays silently — use for video-only displays.')}
        </div>
      </ConfigSection>

      {/* Display & Reset */}
      <ConfigSection id="display" title="Display & Reset" accentColor="#475569"
        description="Transition style, fit, colors and reset timing">
        <div className="space-y-4">
          {selectField('transition', 'Transition Style', [
            { value: 'fade-color', label: 'Fade through Color / Exposure' },
            { value: 'fade-black', label: 'Fade to Black' },
            { value: 'dissolve', label: 'Dissolve' },
          ])}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {numberField('transitionDuration', 'Transition (ms)', { min: 100, max: 3000 })}
            {numberField('fadeOutDuration', 'Fade Out (ms)', { min: 0, max: 5000 })}
            {numberField('resetDelay', 'Reset Delay (sec)', { min: 0, max: 60 })}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {selectField('fit', 'Fit', FIT_OPTIONS)}
            <div>
              <label className={LABEL_CLS}>Background Color</label>
              <div className="flex items-center gap-2">
                <input type="color" value={(config.backgroundColor as string) || '#000000'}
                  onChange={(e) => set('backgroundColor', e.target.value)}
                  className="h-10 w-10 rounded-xl border border-surface-200 cursor-pointer p-0.5" />
                <input type="text" value={(config.backgroundColor as string) || '#000000'}
                  onChange={(e) => set('backgroundColor', e.target.value)}
                  className={`${INPUT_CLS} max-w-[130px] font-mono`} placeholder="#000000" />
              </div>
            </div>
          </div>
          {note('Fade Out: how long the video dissolves to black after playback ends before returning to idle.')}
          {note('Reset Delay: time to wait after video ends before accepting the next trigger.')}
        </div>
      </ConfigSection>

    </ConfigPageLayout>
  );
}
