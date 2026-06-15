import { useEffect, useRef } from 'react';
import {
  useFieldHelpers, useConfigData, ContentMultiSelect, IdleScreenToggle,
  LABEL_CLS, INPUT_CLS, ConfigSection, ConfigPageLayout, type ConfigPanelProps, type SectionDef,
} from './SharedConfigFields';

const LAYOUT_OPTIONS = [
  { value: 'grid', label: 'Grid' },
  { value: 'list', label: 'List' },
];

const AUDIO_OUTPUT_OPTIONS = [
  { value: 'none', label: 'No Audio Output' },
  { value: 'monophone', label: 'Monophone (handset)' },
  { value: 'screen', label: 'Screen Speakers' },
  { value: 'directional-speaker', label: 'Directional Speaker' },
];

const SECTIONS: SectionDef[] = [
  { id: 'general', title: 'General', color: '#2563eb' },
  { id: 'content', title: 'Content', color: '#c2185b' },
  { id: 'media-types', title: 'Media Types', color: '#4f46e5' },
  { id: 'audio', title: 'Audio', color: '#059669' },
  { id: 'idle', title: 'Idle Screen', color: '#0891b2' },
];

export function App06BrowserConfig({ config, onChange, siteId }: ConfigPanelProps) {
  const { numberField, selectField, checkboxField, note } = useFieldHelpers(config, onChange);
  const { contentItems, images, videos, playlistDetail } = useConfigData(siteId, 'app06-media-browser', config);

  // One-time sync: seed _selectedContentIds from existing playlist
  const seededRef = useRef(false);
  useEffect(() => {
    if (playlistDetail && !seededRef.current && !(config._selectedContentIds as string[] | undefined)?.length) {
      const ids = playlistDetail.items.map((item: { contentId: string }) => item.contentId);
      if (ids.length > 0) {
        onChange({ ...config, _selectedContentIds: ids });
        seededRef.current = true;
      }
    }
  }, [playlistDetail]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (key: string, value: unknown) => onChange({ ...config, [key]: value });

  return (
    <ConfigPageLayout sections={SECTIONS}>

      {/* General */}
      <ConfigSection id="general" title="General" accentColor="#2563eb"
        description="Layout and inactivity settings">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {selectField('layout', 'Layout', LAYOUT_OPTIONS)}
          {numberField('inactivityTimeout', 'Idle Timeout (sec)', { min: 5, max: 120 })}
        </div>
      </ConfigSection>

      {/* Content */}
      <ConfigSection id="content" title="Content" accentColor="#c2185b"
        description="Select the media items available for browsing">
        <ContentMultiSelect label="Content" contentItems={contentItems} config={config} onChange={onChange} />
      </ConfigSection>

      {/* Media Types */}
      <ConfigSection id="media-types" title="Media Types" accentColor="#4f46e5"
        description="Enable or disable specific media type playback">
        <div className="space-y-3">
          {checkboxField('searchEnabled', 'Enable Search / Filter')}
          {checkboxField('audioEnabled', 'Enable Audio Playback')}
          {checkboxField('pdfEnabled', 'Enable PDF Viewing')}
          {checkboxField('videoEnabled', 'Enable Video Playback')}
          {note('Videos and audio will play through the selected audio output below.')}
        </div>
      </ConfigSection>

      {/* Audio Output */}
      <ConfigSection id="audio" title="Audio Output" accentColor="#059669"
        description="For installations with monophone or speaker">
        <div className="space-y-4">
          {selectField('audioOutput', 'Audio Output', AUDIO_OUTPUT_OPTIONS)}
          {(config.audioOutput as string) === 'monophone' && (
            <>
              <div>
                <label className={LABEL_CLS}>Controller ID</label>
                <input type="text" value={(config.controllerId as string) || ''}
                  onChange={(e) => set('controllerId', e.target.value)}
                  placeholder="e.g. ESP32-001" className={INPUT_CLS} />
              </div>
              {note('Audio from videos and audio files will be routed to the monophone handset.')}
            </>
          )}
          {(config.audioOutput as string) === 'directional-speaker' &&
            note('Audio plays through overhead directional/shower speaker.')}
        </div>
      </ConfigSection>

      {/* Idle Screen */}
      <ConfigSection id="idle" title="Idle Screen" accentColor="#0891b2"
        description="Attract screen shown during inactivity">
        <IdleScreenToggle config={config} onChange={onChange} images={images} videos={videos} siteId={siteId} />
      </ConfigSection>

    </ConfigPageLayout>
  );
}
