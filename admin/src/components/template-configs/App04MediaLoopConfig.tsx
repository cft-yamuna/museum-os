import {
  useFieldHelpers, useConfigData, contentPicker, IdleScreenToggle,
  FIT_OPTIONS, LABEL_CLS, INPUT_CLS, SegmentedControl,
  ConfigSection, ConfigPageLayout, type ConfigPanelProps, type SectionDef,
} from './SharedConfigFields';

const MODE_OPTIONS = [
  { value: 'video-loop', label: 'Video Loop' },
  { value: 'slideshow', label: 'Slideshow' },
  { value: 'audio', label: 'Audio Only' },
];

const AUDIO_OUTPUT_OPTIONS = [
  { value: 'screen', label: 'Screen Speakers' },
  { value: 'directional-speaker', label: 'Directional Speaker' },
  { value: 'muted', label: 'Muted' },
];

const FADE_OPTIONS = [
  { value: 'fade-black', label: 'Fade to Black' },
  { value: 'dissolve', label: 'Dissolve' },
  { value: 'matched-frame', label: 'Matched Frame' },
];

const SECTIONS: SectionDef[] = [
  { id: 'general', title: 'General', color: '#2563eb' },
  { id: 'content', title: 'Content', color: '#c2185b' },
  { id: 'display', title: 'Display', color: '#7c3aed' },
  { id: 'playback', title: 'Playback', color: '#ea580c' },
  { id: 'subtitles', title: 'Subtitles', color: '#475569' },
  { id: 'idle', title: 'Idle Screen', color: '#0891b2' },
];

export function App04MediaLoopConfig({ config, onChange, siteId }: ConfigPanelProps) {
  const { numberField, selectField, checkboxField } = useFieldHelpers(config, onChange);
  const { contentItems, videos, images } = useConfigData(siteId);
  const set = (key: string, value: unknown) => onChange({ ...config, [key]: value });
  const mode = (config.mode as string) || 'video-loop';

  return (
    <ConfigPageLayout sections={SECTIONS}>

      {/* General */}
      <ConfigSection id="general" title="General" accentColor="#2563eb"
        description="Mode and audio routing">
        <div className="space-y-4">
          <SegmentedControl
            label="Mode"
            value={mode}
            options={MODE_OPTIONS}
            onChange={(v) => set('mode', v)}
          />
          {selectField('audioOutput', 'Audio Output', AUDIO_OUTPUT_OPTIONS)}
        </div>
      </ConfigSection>

      {/* Content */}
      <ConfigSection id="content" title="Content" accentColor="#c2185b"
        description="Select the media file to loop">
        {contentPicker(
          'videoUrl',
          mode === 'audio' ? 'Audio File' : 'Video / Audio',
          mode === 'audio' ? contentItems : videos,
          'Select media...',
          config, onChange, siteId
        )}
      </ConfigSection>

      {/* Display */}
      <ConfigSection id="display" title="Display" accentColor="#7c3aed"
        description="Fit mode and background color">
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
                className={`${INPUT_CLS} max-w-[130px] font-mono`} />
            </div>
          </div>
        </div>
      </ConfigSection>

      {/* Playback */}
      <ConfigSection id="playback" title="Playback" accentColor="#ea580c"
        description="Loop fade style, pause and volume">
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <SegmentedControl
              label="Fade Type"
              value={(config.fadeType as string) || 'fade-black'}
              options={FADE_OPTIONS}
              onChange={(v) => set('fadeType', v)}
            />
            {numberField('pauseDuration', 'Pause Between Loops (sec)', { min: 0, max: 30 })}
            {mode === 'slideshow' && numberField('slideInterval', 'Slide Interval (sec)', { min: 1, max: 60 })}
          </div>
          <div className="space-y-3">
            {checkboxField('muted', 'Muted (no audio)')}
            {!config.muted && (
              <div className="max-w-[160px]">
                {numberField('volume', 'Volume (0–100)', { min: 0, max: 100 })}
              </div>
            )}
          </div>
        </div>
      </ConfigSection>

      {/* Subtitles */}
      <ConfigSection id="subtitles" title="Subtitles" accentColor="#475569"
        description="VTT or SRT subtitles file">
        <div className="space-y-4">
          {checkboxField('subtitlesEnabled', 'Enable Subtitles')}
          {!!(config.subtitlesEnabled) && contentPicker('subtitlesUrl', 'Subtitles File (VTT/SRT)', contentItems, 'Select subtitles file...', config, onChange, siteId)}
        </div>
      </ConfigSection>

      {/* Idle Screen */}
      <ConfigSection id="idle" title="Idle Screen" accentColor="#0891b2"
        description="Attract screen before looping begins">
        <IdleScreenToggle config={config} onChange={onChange} images={images} videos={videos} siteId={siteId} />
      </ConfigSection>

    </ConfigPageLayout>
  );
}
