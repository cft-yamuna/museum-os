import { useState, useCallback, useRef } from 'react';
import {
  useFieldHelpers, IdleScreenToggle, useConfigData,
  ConfigSection, ConfigPageLayout, type ConfigPanelProps, type SectionDef,
  LABEL_CLS, INPUT_CLS,
} from './SharedConfigFields';

// ── Helpers (duplicated from display — admin can't import display code) ──

function hexToGlow(hex: string, alpha = 0.4): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function yearToDecade(year: number): string {
  const base = Math.floor(year / 10) * 10;
  const decade = base + (year % 10 >= 5 ? 5 : -5);
  return String(decade < 1945 ? 1945 : decade);
}

// ── Types ──

interface DandelionConfig {
  sector: { id: string; label: string; color: string; glowColor: string };
  placement: { x: number; y: number; size: number; delay: number };
}

interface TimelineMilestone {
  id: string;
  year: number;
  description: string;
  sectorId: string;
  decade: string;
}

interface TimelineData {
  dandelions: DandelionConfig[];
  milestones: TimelineMilestone[];
}

// ── Animation mode definitions ──

const ANIMATION_MODES = [
  { id: 'breathing', label: 'Breathing' },
  { id: 'waveRipple', label: 'Wave Ripple' },
  { id: 'shimmer', label: 'Shimmer' },
] as const;

interface ParamDef {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
}

const MODE_PARAMS: Record<string, ParamDef[]> = {
  breathing: [
    { key: 'scale', label: 'Scale', min: 1.01, max: 1.3, step: 0.01, default: 1.05 },
    { key: 'duration', label: 'Duration (s)', min: 1, max: 6, step: 0.5, default: 3 },
    { key: 'delaySpread', label: 'Delay Spread (s)', min: 0, max: 5, step: 0.5, default: 3 },
  ],
  waveRipple: [
    { key: 'scale', label: 'Scale', min: 1.01, max: 1.3, step: 0.01, default: 1.08 },
    { key: 'speed', label: 'Wave Speed (s)', min: 1, max: 8, step: 0.5, default: 3 },
  ],
  shimmer: [
    { key: 'minOpacity', label: 'Min Opacity', min: 0.1, max: 0.9, step: 0.05, default: 0.3 },
    { key: 'speed', label: 'Speed (s)', min: 0.5, max: 4, step: 0.25, default: 1.5 },
    { key: 'delaySpread', label: 'Delay Spread (s)', min: 0, max: 3, step: 0.25, default: 2 },
  ],
};

function getDefaultParams(modeId: string): Record<string, number> {
  const params = MODE_PARAMS[modeId] || [];
  const defaults: Record<string, number> = {};
  for (const p of params) defaults[p.key] = p.default;
  return defaults;
}

// ── Sections ──

const SECTIONS: SectionDef[] = [
  { id: 'settings', title: 'Settings', color: '#6366f1' },
  { id: 'animation', title: 'Dandelion Animation', color: '#8b5cf6' },
  { id: 'scale', title: 'Dandelion Scale', color: '#06b6d4' },
  { id: 'timeline-data', title: 'Sectors & Milestones', color: '#f59e0b' },
  { id: 'idle', title: 'Idle Screen', color: '#0891b2' },
];

// ── Compact styles ──

const COMPACT_INPUT = 'h-8 w-full px-2.5 rounded-lg border border-surface-200 bg-white text-[13px] text-surface-800 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400 transition-all';
const COMPACT_LABEL = 'block text-xs font-medium text-surface-500 mb-1 uppercase tracking-wide';
const COMPACT_BTN = 'h-7 px-3 text-xs font-medium rounded-lg border border-surface-200 bg-white text-surface-700 hover:bg-surface-50 transition-colors cursor-pointer inline-flex items-center gap-1.5';
const COMPACT_BTN_PRIMARY = 'h-7 px-3 text-xs font-medium rounded-lg border-0 bg-primary-600 text-white hover:bg-primary-700 transition-colors cursor-pointer inline-flex items-center gap-1.5';
const COMPACT_BTN_DANGER = 'h-7 px-3 text-xs font-medium rounded-lg border-0 bg-red-50 text-red-600 hover:bg-red-100 transition-colors cursor-pointer inline-flex items-center gap-1.5';

// ── Sub-components ──

function MilestoneRow({ m, onUpdate, onDelete }: {
  m: TimelineMilestone;
  onUpdate: (field: keyof TimelineMilestone, value: string | number) => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-start gap-2 py-1.5">
      <input
        type="number"
        className={`${COMPACT_INPUT} !w-16 flex-shrink-0`}
        value={m.year}
        onChange={(e) => onUpdate('year', Number(e.target.value))}
        min={1900}
        max={2100}
      />
      <input
        className={`${COMPACT_INPUT} flex-1 min-w-0`}
        value={m.description}
        onChange={(e) => onUpdate('description', e.target.value)}
        placeholder="Description"
      />
      <span className="flex-shrink-0 w-10 h-8 flex items-center justify-center text-[11px] text-surface-400 bg-surface-50 rounded-lg border border-surface-100">
        {m.decade}
      </span>
      <button
        type="button"
        className="flex-shrink-0 w-7 h-8 flex items-center justify-center text-surface-400 hover:text-red-500 transition-colors cursor-pointer"
        onClick={onDelete}
        title="Remove milestone"
      >
        &times;
      </button>
    </div>
  );
}

function SectorCard({ config: d, milestones, onUpdateSector, onUpdateSectorId, onUpdatePlacement, onRemove, onUpdateMilestone, onDeleteMilestone, onAddMilestone }: {
  config: DandelionConfig;
  milestones: TimelineMilestone[];
  onUpdateSector: (field: string, value: string) => void;
  onUpdateSectorId: (newId: string) => void;
  onUpdatePlacement: (field: string, value: number) => void;
  onRemove: () => void;
  onUpdateMilestone: (id: string, field: keyof TimelineMilestone, value: string | number) => void;
  onDeleteMilestone: (id: string) => void;
  onAddMilestone: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const milestoneCount = milestones.length;

  return (
    <div className="border border-surface-200 rounded-lg bg-white overflow-hidden">
      {/* Header */}
      <button
        type="button"
        className="flex items-center gap-2.5 w-full px-3 py-2.5 text-left hover:bg-surface-50 transition-colors cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <span
          className="w-3 h-3 rounded-full flex-shrink-0 border border-surface-200"
          style={{ background: d.sector.color }}
        />
        <span className="flex-1 text-[13px] font-semibold text-surface-800 truncate">
          {d.sector.label.replace(/\n/g, ' ')}
        </span>
        <span className="text-[11px] text-surface-400 bg-surface-50 px-1.5 py-0.5 rounded">
          {d.sector.id}
        </span>
        <span className="text-[11px] text-surface-400">
          {milestoneCount} milestone{milestoneCount !== 1 ? 's' : ''}
        </span>
        <span
          className="text-surface-400 hover:text-red-500 transition-colors px-1"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          title="Delete sector"
        >
          &times;
        </span>
        <span className={`text-[11px] text-surface-400 transition-transform ${expanded ? 'rotate-180' : ''}`}>
          &#9660;
        </span>
      </button>

      {/* Expanded */}
      {expanded && (
        <div className="border-t border-surface-100">
          {/* Sector fields */}
          <div className="p-3 space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className={COMPACT_LABEL}>Sector ID</label>
                <input className={COMPACT_INPUT} value={d.sector.id} onChange={(e) => onUpdateSectorId(e.target.value)} />
              </div>
              <div>
                <label className={COMPACT_LABEL}>Label</label>
                <input
                  className={COMPACT_INPUT}
                  value={d.sector.label.replace(/\n/g, '\\n')}
                  onChange={(e) => onUpdateSector('label', e.target.value.replace(/\\n/g, '\n'))}
                  placeholder="Use \n for line breaks"
                />
              </div>
              <div>
                <label className={COMPACT_LABEL}>Color</label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="color"
                    value={d.sector.color}
                    onChange={(e) => onUpdateSector('color', e.target.value)}
                    className="w-8 h-8 border-0 p-0 cursor-pointer bg-transparent"
                  />
                  <input
                    className={`${COMPACT_INPUT} !w-20`}
                    value={d.sector.color}
                    onChange={(e) => onUpdateSector('color', e.target.value)}
                    maxLength={7}
                  />
                </div>
              </div>
            </div>

            {/* Placement */}
            <div>
              <label className={COMPACT_LABEL}>Placement</label>
              <div className="grid grid-cols-4 gap-2">
                {(['x', 'y', 'size', 'delay'] as const).map((field) => (
                  <div key={field}>
                    <span className="block text-[10px] text-surface-400 uppercase mb-0.5">{field}</span>
                    <input
                      type="number"
                      className={COMPACT_INPUT}
                      value={d.placement[field]}
                      onChange={(e) => onUpdatePlacement(field, Number(e.target.value))}
                      step={field === 'delay' ? 0.1 : 10}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Glow preview */}
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-surface-400">Glow:</span>
              <span
                className="w-4 h-4 rounded-full border border-surface-200"
                style={{ background: d.sector.glowColor }}
              />
              <span className="text-[11px] text-surface-400 font-mono">{d.sector.glowColor}</span>
            </div>
          </div>

          {/* Milestones */}
          <div className="border-t border-surface-100 p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-surface-600">
                Milestones ({milestoneCount})
              </span>
              <button type="button" className={COMPACT_BTN_PRIMARY} onClick={onAddMilestone}>
                + Add
              </button>
            </div>

            {milestoneCount > 0 && (
              <div>
                <div className="flex gap-2 pb-1 mb-1 border-b border-surface-100">
                  <span className="text-[10px] text-surface-400 uppercase w-16 flex-shrink-0">Year</span>
                  <span className="text-[10px] text-surface-400 uppercase flex-1">Description</span>
                  <span className="text-[10px] text-surface-400 uppercase w-10 flex-shrink-0">Dec</span>
                  <span className="w-7 flex-shrink-0" />
                </div>
                {milestones.map((m) => (
                  <MilestoneRow
                    key={m.id}
                    m={m}
                    onUpdate={(field, value) => onUpdateMilestone(m.id, field, value)}
                    onDelete={() => onDeleteMilestone(m.id)}
                  />
                ))}
              </div>
            )}
            {milestoneCount === 0 && (
              <p className="text-xs text-surface-400 py-2">No milestones for this sector.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Config Component ──

export function Custom01TimelineConfig({ config, onChange, siteId }: ConfigPanelProps) {
  const { set } = useFieldHelpers(config, onChange);
  const { images, videos } = useConfigData(siteId);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Timeline data helpers ──
  const timelineData = (config.timelineData as TimelineData | null) ?? null;
  const hasTimelineData = timelineData !== null;

  const setTimelineData = useCallback((updater: (prev: TimelineData) => TimelineData) => {
    const current = (config.timelineData as TimelineData | null) ?? getDefaultTimelineData();
    const next = updater(current);
    onChange({ ...config, timelineData: next });
  }, [config, onChange]);

  const handleUpdateSector = useCallback((index: number, field: string, value: string) => {
    setTimelineData((prev) => ({
      ...prev,
      dandelions: prev.dandelions.map((d, i) =>
        i === index
          ? {
              ...d,
              sector: {
                ...d.sector,
                [field]: value,
                ...(field === 'color' ? { glowColor: hexToGlow(value) } : {}),
              },
            }
          : d,
      ),
    }));
  }, [setTimelineData]);

  const handleUpdateSectorId = useCallback((index: number, newId: string) => {
    setTimelineData((prev) => {
      const oldId = prev.dandelions[index].sector.id;
      return {
        ...prev,
        dandelions: prev.dandelions.map((d, i) =>
          i === index ? { ...d, sector: { ...d.sector, id: newId } } : d,
        ),
        milestones: prev.milestones.map((m) =>
          m.sectorId === oldId ? { ...m, sectorId: newId } : m,
        ),
      };
    });
  }, [setTimelineData]);

  const handleUpdatePlacement = useCallback((index: number, field: string, value: number) => {
    setTimelineData((prev) => ({
      ...prev,
      dandelions: prev.dandelions.map((d, i) =>
        i === index ? { ...d, placement: { ...d.placement, [field]: value } } : d,
      ),
    }));
  }, [setTimelineData]);

  const handleRemoveSector = useCallback((index: number) => {
    const data = (config.timelineData as TimelineData | null) ?? getDefaultTimelineData();
    const sectorId = data.dandelions[index].sector.id;
    const milestoneCount = data.milestones.filter((m) => m.sectorId === sectorId).length;
    const msg = milestoneCount > 0
      ? `Delete "${sectorId}" and its ${milestoneCount} milestone(s)?`
      : `Delete sector "${sectorId}"?`;
    if (!confirm(msg)) return;

    setTimelineData((prev) => ({
      ...prev,
      dandelions: prev.dandelions.filter((_, i) => i !== index),
      milestones: prev.milestones.filter((m) => m.sectorId !== sectorId),
    }));
  }, [config.timelineData, setTimelineData]);

  const handleAddSector = useCallback(() => {
    const newId = `Sector_${Date.now()}`;
    const defaultColor = '#6b7280';
    setTimelineData((prev) => ({
      ...prev,
      dandelions: [
        ...prev.dandelions,
        {
          sector: { id: newId, label: 'New Sector', color: defaultColor, glowColor: hexToGlow(defaultColor) },
          placement: { x: 200, y: 500, size: 300, delay: 1.0 },
        },
      ],
    }));
  }, [setTimelineData]);

  const handleUpdateMilestone = useCallback((milestoneId: string, field: keyof TimelineMilestone, value: string | number) => {
    setTimelineData((prev) => ({
      ...prev,
      milestones: prev.milestones.map((m) =>
        m.id === milestoneId
          ? { ...m, [field]: value, ...(field === 'year' ? { decade: yearToDecade(value as number) } : {}) }
          : m,
      ),
    }));
  }, [setTimelineData]);

  const handleDeleteMilestone = useCallback((milestoneId: string) => {
    setTimelineData((prev) => ({
      ...prev,
      milestones: prev.milestones.filter((m) => m.id !== milestoneId),
    }));
  }, [setTimelineData]);

  const handleAddMilestone = useCallback((sectorId: string) => {
    const data = (config.timelineData as TimelineData | null) ?? getDefaultTimelineData();
    const sectorMilestones = data.milestones.filter((m) => m.sectorId === sectorId).sort((a, b) => a.year - b.year);
    const defaultYear = sectorMilestones.length > 0 ? sectorMilestones[sectorMilestones.length - 1].year + 1 : 2000;
    setTimelineData((prev) => ({
      ...prev,
      milestones: [
        ...prev.milestones,
        { id: `m_${Date.now()}`, year: defaultYear, description: '', sectorId, decade: yearToDecade(defaultYear) },
      ],
    }));
  }, [config.timelineData, setTimelineData]);

  // ── Import / Export / Reset ──
  const handleExport = useCallback(() => {
    const data = (config.timelineData as TimelineData | null) ?? getDefaultTimelineData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'museum-os-timeline-data.json';
    a.click();
    URL.revokeObjectURL(url);
  }, [config.timelineData]);

  const handleImport = useCallback(() => {
    fileRef.current?.click();
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string) as TimelineData;
        if (!Array.isArray(parsed.dandelions) || !Array.isArray(parsed.milestones)) {
          alert('Invalid timeline data format.');
          return;
        }
        onChange({ ...config, timelineData: parsed });
      } catch {
        alert('Invalid JSON file.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }, [config, onChange]);

  const handleReset = useCallback(() => {
    if (!confirm('Reset all timeline data to defaults? This cannot be undone.')) return;
    onChange({ ...config, timelineData: null });
  }, [config, onChange]);

  // ── Animation mode ──
  const animMode = (config.dandelionAnimationMode as string) || 'breathing';
  const animParams = (config.dandelionAnimationParams as Record<string, number>) || getDefaultParams(animMode);
  const currentModeParams = MODE_PARAMS[animMode] || [];

  const handleModeChange = useCallback((newMode: string) => {
    onChange({
      ...config,
      dandelionAnimationMode: newMode,
      dandelionAnimationParams: getDefaultParams(newMode),
    });
  }, [config, onChange]);

  const handleParamChange = useCallback((key: string, value: number) => {
    onChange({
      ...config,
      dandelionAnimationParams: { ...animParams, [key]: value },
    });
  }, [config, onChange, animParams]);

  // ── Resolve data for rendering ──
  const displayData = timelineData ?? getDefaultTimelineData();

  return (
    <ConfigPageLayout sections={SECTIONS}>

      {/* Settings */}
      <ConfigSection id="settings" title="Settings" accentColor="#6366f1"
        description="Inactivity timeout before returning to idle state">
        <div className="space-y-4">
          <div>
            <label className={LABEL_CLS}>Inactivity Timeout (seconds)</label>
            <input
              type="number"
              min={5}
              max={300}
              className={INPUT_CLS}
              value={(config.inactivityTimeoutSec as number) ?? 15}
              onChange={(e) => set('inactivityTimeoutSec', Number(e.target.value))}
            />
          </div>
        </div>
      </ConfigSection>

      {/* Dandelion Animation */}
      <ConfigSection id="animation" title="Dandelion Animation" accentColor="#8b5cf6"
        description="Animation mode applied to dandelion strands">
        <div className="space-y-4">
          <div>
            <label className={LABEL_CLS}>Animation Mode</label>
            <select
              className={INPUT_CLS}
              value={animMode}
              onChange={(e) => handleModeChange(e.target.value)}
            >
              {ANIMATION_MODES.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
          </div>

          {currentModeParams.length > 0 && (
            <div className="space-y-3">
              {currentModeParams.map((p) => (
                <div key={p.key}>
                  <div className="flex items-center justify-between mb-1">
                    <label className={LABEL_CLS + ' !mb-0'}>{p.label}</label>
                    <span className="text-xs text-surface-500 font-mono tabular-nums">
                      {(animParams[p.key] ?? p.default).toFixed(2)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={p.min}
                    max={p.max}
                    step={p.step}
                    value={animParams[p.key] ?? p.default}
                    onChange={(e) => handleParamChange(p.key, Number(e.target.value))}
                    className="w-full accent-primary-600"
                  />
                  <div className="flex justify-between text-[10px] text-surface-400">
                    <span>{p.min}</span>
                    <span>{p.max}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </ConfigSection>

      {/* Dandelion Scale */}
      <ConfigSection id="scale" title="Dandelion Scale" accentColor="#06b6d4"
        description="Depth scale range for floating dandelions">
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className={LABEL_CLS + ' !mb-0'}>Min Scale</label>
              <span className="text-xs text-surface-500 font-mono tabular-nums">
                {((config.dandelionScaleMin as number) ?? 0.8).toFixed(2)}
              </span>
            </div>
            <input
              type="range"
              min={0.3}
              max={1.0}
              step={0.05}
              value={(config.dandelionScaleMin as number) ?? 0.8}
              onChange={(e) => set('dandelionScaleMin', Number(e.target.value))}
              className="w-full accent-primary-600"
            />
            <div className="flex justify-between text-[10px] text-surface-400">
              <span>0.3</span>
              <span>1.0</span>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className={LABEL_CLS + ' !mb-0'}>Max Scale</label>
              <span className="text-xs text-surface-500 font-mono tabular-nums">
                {((config.dandelionScaleMax as number) ?? 1.5).toFixed(2)}
              </span>
            </div>
            <input
              type="range"
              min={1.0}
              max={2.5}
              step={0.05}
              value={(config.dandelionScaleMax as number) ?? 1.5}
              onChange={(e) => set('dandelionScaleMax', Number(e.target.value))}
              className="w-full accent-primary-600"
            />
            <div className="flex justify-between text-[10px] text-surface-400">
              <span>1.0</span>
              <span>2.5</span>
            </div>
          </div>
        </div>
      </ConfigSection>

      {/* Sectors & Milestones */}
      <ConfigSection id="timeline-data" title="Sectors & Milestones" accentColor="#f59e0b"
        description={hasTimelineData ? 'Custom timeline data' : 'Using built-in defaults (save to customize)'}>
        <div className="space-y-3">
          {/* Toolbar */}
          <div className="flex items-center gap-2 flex-wrap">
            <button type="button" className={COMPACT_BTN_PRIMARY} onClick={handleAddSector}>
              + Add Sector
            </button>
            <button type="button" className={COMPACT_BTN} onClick={handleExport}>
              Export JSON
            </button>
            <button type="button" className={COMPACT_BTN} onClick={handleImport}>
              Import JSON
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".json"
              onChange={handleFileChange}
              className="hidden"
            />
            <button type="button" className={COMPACT_BTN_DANGER} onClick={handleReset}>
              Reset Defaults
            </button>
            <span className="text-[11px] text-surface-400 ml-auto">
              {displayData.dandelions.length} sectors, {displayData.milestones.length} milestones
            </span>
          </div>

          {/* Sector list */}
          <div className="space-y-2">
            {displayData.dandelions.map((d, i) => {
              const sectorMilestones = displayData.milestones
                .filter((m) => m.sectorId === d.sector.id)
                .sort((a, b) => a.year - b.year);

              return (
                <SectorCard
                  key={`${d.sector.id}-${i}`}
                  config={d}
                  milestones={sectorMilestones}
                  onUpdateSector={(field, value) => handleUpdateSector(i, field, value)}
                  onUpdateSectorId={(newId) => handleUpdateSectorId(i, newId)}
                  onUpdatePlacement={(field, value) => handleUpdatePlacement(i, field, value)}
                  onRemove={() => handleRemoveSector(i)}
                  onUpdateMilestone={handleUpdateMilestone}
                  onDeleteMilestone={handleDeleteMilestone}
                  onAddMilestone={() => handleAddMilestone(d.sector.id)}
                />
              );
            })}
          </div>
        </div>
      </ConfigSection>

      {/* Idle Screen */}
      <ConfigSection id="idle" title="Idle Screen" accentColor="#0891b2"
        description="Fallback screen when idle state is not the built-in dandelion animation">
        <IdleScreenToggle config={config} onChange={onChange} images={images} videos={videos} siteId={siteId} />
      </ConfigSection>

    </ConfigPageLayout>
  );
}

// ── Default data factory (must match display defaults) ──

function getDefaultTimelineData(): TimelineData {
  return {
    dandelions: [
      { sector: { id: 'Sustainability', label: 'Sustainability', color: '#70a363', glowColor: 'rgba(112, 163, 99, 0.4)' }, placement: { x: 360, y: 720, size: 380, delay: 0.8 } },
      { sector: { id: 'ConsumerCare', label: 'Consumer\nCare', color: '#f58d53', glowColor: 'rgba(245, 141, 83, 0.4)' }, placement: { x: 300, y: 1100, size: 330, delay: 1.6 } },
      { sector: { id: 'WiN', label: 'WIN', color: '#7676b3', glowColor: 'rgba(118, 118, 179, 0.4)' }, placement: { x: 80, y: 860, size: 310, delay: 1.2 } },
      { sector: { id: 'Foundation', label: 'Foundation', color: '#349bb3', glowColor: 'rgba(52, 155, 179, 0.4)' }, placement: { x: 680, y: 830, size: 280, delay: 2.0 } },
      { sector: { id: 'General', label: 'General\nCompany\nEvents', color: '#f48182', glowColor: 'rgba(244, 129, 130, 0.4)' }, placement: { x: 30, y: 160, size: 540, delay: 0.3 } },
    ],
    milestones: [],
  };
}
