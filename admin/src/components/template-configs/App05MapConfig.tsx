import {
  useFieldHelpers, useConfigData, contentPicker, IdleScreenToggle,
  INPUT_CLS, ConfigSection, ConfigPageLayout, type ConfigPanelProps, type SectionDef,
} from './SharedConfigFields';
import { Plus, Trash2 } from 'lucide-react';

const SECTIONS: SectionDef[] = [
  { id: 'map', title: 'Map Content', color: '#0f766e' },
  { id: 'marker', title: 'You Are Here', color: '#2563eb' },
  { id: 'sections', title: 'Nav Sections', color: '#4f46e5' },
  { id: 'settings', title: 'Settings', color: '#475569' },
  { id: 'idle', title: 'Idle Screen', color: '#0891b2' },
];

export function App05MapConfig({ config, onChange, siteId }: ConfigPanelProps) {
  const { numberField, textField, checkboxField, note } = useFieldHelpers(config, onChange);
  const { images, videos } = useConfigData(siteId);
  const set = (key: string, value: unknown) => onChange({ ...config, [key]: value });

  return (
    <ConfigPageLayout sections={SECTIONS}>

      {/* Map Content */}
      <ConfigSection id="map" title="Map Content" accentColor="#0f766e"
        description="Background map image for the interactive floor plan">
        {contentPicker('mapImageUrl', 'Map Image', images, 'Select a map image...', config, onChange, siteId, 'image/*')}
      </ConfigSection>

      {/* You Are Here Marker */}
      <ConfigSection id="marker" title="You Are Here Marker" accentColor="#2563eb"
        description="Position and label for the current-location indicator">
        <div className="space-y-4">
          {checkboxField('showYouAreHere', 'Show "You Are Here" marker')}
          {!!(config.showYouAreHere) && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {textField('youAreHereLabel', 'Marker Label', { placeholder: 'You Are Here' })}
              {numberField('youAreHereX', 'X Position (%)', { min: 0, max: 100 })}
              {numberField('youAreHereY', 'Y Position (%)', { min: 0, max: 100 })}
            </div>
          )}
        </div>
      </ConfigSection>

      {/* Navigation Sections */}
      <ConfigSection id="sections" title="Navigation Sections" accentColor="#4f46e5"
        description="Clickable section buttons that highlight areas on the map">
        <div className="space-y-4">
          <SectionEditor
            sections={(config.sections as SectionEntry[]) || []}
            onChange={(sections) => set('sections', sections)}
          />
          {note('Each section creates a navigation button. Clicking it highlights its area on the map and shows its POIs.')}
        </div>
      </ConfigSection>

      {/* Settings */}
      <ConfigSection id="settings" title="Settings" accentColor="#475569"
        description="Interaction behavior and pathways">
        <div className="space-y-4">
          <div className="max-w-[220px]">
            {numberField('inactivityTimeout', 'Inactivity Timeout (sec)', { min: 5, max: 120 })}
          </div>
          <div className="space-y-2">
            {checkboxField('showTimeEstimates', 'Show time estimates per section')}
            {checkboxField('showAnimatedPathways', 'Show animated pathways to POIs')}
          </div>
          {note('For detailed POI popup content and hotspot coordinates, use the Advanced Configuration JSON editor (config.hotspots[], config.youAreHere, config.timeEstimates).')}
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

// ---- Section Editor ----
interface SectionEntry {
  id: string;
  label: string;
  color: string;
  timeEstimate: string;
}

function SectionEditor({ sections, onChange }: { sections: SectionEntry[]; onChange: (s: SectionEntry[]) => void }) {
  const addSection = () => {
    onChange([...sections, { id: 'section-' + Date.now(), label: '', color: '#3b82f6', timeEstimate: '' }]);
  };
  const removeSection = (index: number) => onChange(sections.filter((_, i) => i !== index));
  const updateSection = (index: number, field: keyof SectionEntry, value: string) => {
    onChange(sections.map((s, i) => i === index ? { ...s, [field]: value } : s));
  };

  return (
    <div className="space-y-2">
      {sections.map((section, index) => (
        <div key={section.id} className="border border-surface-200 rounded-xl p-4 bg-surface-50/50 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-surface-500 uppercase tracking-wider">Section {index + 1}</span>
            <button type="button" onClick={() => removeSection(index)}
              className="p-1.5 text-surface-300 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-surface-500 mb-1">Label</label>
              <input type="text" value={section.label}
                onChange={(e) => updateSection(index, 'label', e.target.value)}
                placeholder="e.g. Origin" className={`${INPUT_CLS} !h-9`} />
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-500 mb-1">Color</label>
              <input type="color" value={section.color}
                onChange={(e) => updateSection(index, 'color', e.target.value)}
                className="h-9 w-full rounded-xl border border-surface-200 cursor-pointer p-0.5" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-surface-500 mb-1">Time Estimate</label>
            <input type="text" value={section.timeEstimate}
              onChange={(e) => updateSection(index, 'timeEstimate', e.target.value)}
              placeholder="e.g. 15 min" className={`${INPUT_CLS} !h-9`} />
          </div>
        </div>
      ))}
      <button type="button" onClick={addSection}
        className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-primary-600 hover:text-primary-700 border-2 border-dashed border-primary-200 rounded-xl hover:border-primary-400 transition-colors w-full justify-center">
        <Plus className="h-4 w-4" />
        Add Section
      </button>
    </div>
  );
}
