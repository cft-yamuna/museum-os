import { useState } from 'react';
import {
  useFieldHelpers, IdleScreenToggle, useConfigData,
  LABEL_CLS, INPUT_CLS, SegmentedControl, ContentPicker,
  ConfigSection, ConfigPageLayout, type ConfigPanelProps, type SectionDef,
} from './SharedConfigFields';
import type { Content } from '../../lib/types';
import { Plus, Minus, Trash2, GripVertical, ChevronDown, ChevronUp } from 'lucide-react';

// ==========================================
// Constants
// ==========================================

const TRANSITION_OPTIONS = [
  { value: 'fade', label: 'Fade' },
  { value: 'slide-left', label: 'Slide Left' },
  { value: 'dissolve', label: 'Dissolve' },
  { value: 'none', label: 'None' },
];

const DATE_FORMAT_OPTIONS = [
  { value: 'long', label: 'Long (Monday, 25 March 2026)' },
  { value: 'short', label: 'Short (25 Mar 2026)' },
];

const INFO_TYPE_OPTIONS = [
  { value: 'pre-info', label: 'Pre-Journey Info' },
  { value: 'timeline', label: 'Journey Timeline' },
];

const DEFAULT_GUEST_NAME_FONT_SIZE_REM = 3.5;
const MIN_GUEST_NAME_FONT_SIZE_REM = 2;
const MAX_GUEST_NAME_FONT_SIZE_REM = 12;

const SECTIONS: SectionDef[] = [
  { id: 'general', title: 'General', color: '#2563eb' },
  { id: 'screens', title: 'Screen Content', color: '#7c3aed' },
  { id: 'timing', title: 'Timing', color: '#4f46e5' },
  { id: 'appearance', title: 'Appearance', color: '#059669' },
  { id: 'idle', title: 'Idle Screen', color: '#0891b2' },
];

// ==========================================
// Welcome Slide Editor
// ==========================================

interface WelcomeSlide {
  id: string;
  greeting: string;
  subtitle?: string;
  logoUrl?: string;
  backgroundImageUrl?: string;
  backgroundColor?: string;
  textColor?: string;
}

function WelcomeSlideEditor({ slide, onChange, onRemove, images, siteId }: {
  slide: WelcomeSlide;
  onChange: (updated: WelcomeSlide) => void;
  onRemove: () => void;
  images: Content[];
  siteId?: string;
}) {
  const [expanded, setExpanded] = useState(true);
  const set = (key: string, value: string) => onChange({ ...slide, [key]: value });

  return (
    <div className="border border-surface-200 rounded-xl card-bg overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 bg-surface-50 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <GripVertical className="h-4 w-4 text-surface-300" />
        <span className="flex-1 text-sm font-medium text-surface-700 truncate">
          {slide.greeting || 'Welcome Slide'}
        </span>
        <button onClick={(e) => { e.stopPropagation(); onRemove(); }} className="p-1 text-red-400 hover:text-red-600">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
        {expanded ? <ChevronUp className="h-4 w-4 text-surface-400" /> : <ChevronDown className="h-4 w-4 text-surface-400" />}
      </div>
      {expanded && (
        <div className="p-4 space-y-3">
          <div>
            <label className={LABEL_CLS}>Greeting Text</label>
            <input type="text" value={slide.greeting || ''} onChange={(e) => set('greeting', e.target.value)}
              placeholder='e.g. "Welcome to Museum OS Heritage Museum"' className={INPUT_CLS} />
          </div>
          <div>
            <label className={LABEL_CLS}>Subtitle</label>
            <input type="text" value={slide.subtitle || ''} onChange={(e) => set('subtitle', e.target.value)}
              placeholder="Optional subtitle text" className={INPUT_CLS} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <ContentPicker
              configKey="logoUrl" label="Guest/Company Logo" items={images}
              emptyLabel="Select or upload logo..." config={slide as unknown as Record<string, unknown>}
              onChange={(updated) => onChange({ ...slide, logoUrl: updated.logoUrl as string })}
              siteId={siteId} accept="image/*"
            />
            <ContentPicker
              configKey="backgroundImageUrl" label="Background Image" items={images}
              emptyLabel="Select or upload background..." config={slide as unknown as Record<string, unknown>}
              onChange={(updated) => onChange({ ...slide, backgroundImageUrl: updated.backgroundImageUrl as string })}
              siteId={siteId} accept="image/*"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// Info Slide Editor
// ==========================================

interface InfoSlide {
  id: string;
  type: 'pre-info' | 'timeline';
  title?: string;
  body?: string;
  imageUrl?: string;
  timelineItems?: TimelineItem[];
}

interface TimelineItem {
  section: string;
  duration: string;
  description?: string;
  color?: string;
}

function InfoSlideEditor({ slide, onChange, onRemove, images, siteId }: {
  slide: InfoSlide;
  onChange: (updated: InfoSlide) => void;
  onRemove: () => void;
  images: Content[];
  siteId?: string;
}) {
  const [expanded, setExpanded] = useState(true);
  const set = (key: string, value: unknown) => onChange({ ...slide, [key]: value });

  const addTimelineItem = () => {
    const items = [...(slide.timelineItems || [])];
    items.push({ section: '', duration: '', description: '', color: '#3b82f6' });
    set('timelineItems', items);
  };

  const updateTimelineItem = (idx: number, key: string, value: string) => {
    const items = [...(slide.timelineItems || [])];
    items[idx] = { ...items[idx], [key]: value };
    set('timelineItems', items);
  };

  const removeTimelineItem = (idx: number) => {
    const items = [...(slide.timelineItems || [])];
    items.splice(idx, 1);
    set('timelineItems', items);
  };

  return (
    <div className="border border-surface-200 rounded-xl card-bg overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 bg-surface-50 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <GripVertical className="h-4 w-4 text-surface-300" />
        <span className="flex-1 text-sm font-medium text-surface-700 truncate">
          {slide.title || (slide.type === 'timeline' ? 'Journey Timeline' : 'Pre-Journey Info')}
        </span>
        <span className="text-[10px] font-bold uppercase tracking-wider text-surface-400">
          {slide.type === 'timeline' ? 'Timeline' : 'Info'}
        </span>
        <button onClick={(e) => { e.stopPropagation(); onRemove(); }} className="p-1 text-red-400 hover:text-red-600">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
        {expanded ? <ChevronUp className="h-4 w-4 text-surface-400" /> : <ChevronDown className="h-4 w-4 text-surface-400" />}
      </div>
      {expanded && (
        <div className="p-4 space-y-3">
          <SegmentedControl
            label="Slide Type"
            value={slide.type || 'pre-info'}
            options={INFO_TYPE_OPTIONS}
            onChange={(v) => set('type', v)}
          />
          <div>
            <label className={LABEL_CLS}>Title</label>
            <input type="text" value={slide.title || ''} onChange={(e) => set('title', e.target.value)}
              placeholder="Slide title" className={INPUT_CLS} />
          </div>
          {slide.type !== 'timeline' && (
            <>
              <div>
                <label className={LABEL_CLS}>Body Text</label>
                <textarea value={slide.body || ''} onChange={(e) => set('body', e.target.value)}
                  placeholder="Pre-journey information for visitors..."
                  rows={4}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-surface-200 card-bg text-sm text-surface-800 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400 transition-all resize-y" />
              </div>
              <ContentPicker
                configKey="imageUrl" label="Image" items={images}
                emptyLabel="Select or upload image..." config={slide as unknown as Record<string, unknown>}
                onChange={(updated) => onChange({ ...slide, imageUrl: updated.imageUrl as string })}
                siteId={siteId} accept="image/*"
              />
            </>
          )}
          {slide.type === 'timeline' && (
            <div className="space-y-2">
              <label className={LABEL_CLS}>Journey Sections (syncs with A-AV01 Navigation Map)</label>
              {(slide.timelineItems || []).map((item, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input type="color" value={item.color || '#3b82f6'} onChange={(e) => updateTimelineItem(idx, 'color', e.target.value)}
                    className="h-8 w-8 rounded-lg border border-surface-200 cursor-pointer p-0.5 shrink-0" />
                  <input type="text" value={item.section} onChange={(e) => updateTimelineItem(idx, 'section', e.target.value)}
                    placeholder="Section name" className={`${INPUT_CLS} flex-1`} />
                  <input type="text" value={item.duration} onChange={(e) => updateTimelineItem(idx, 'duration', e.target.value)}
                    placeholder="e.g. 15 min" className={`${INPUT_CLS} w-24`} />
                  <input type="text" value={item.description || ''} onChange={(e) => updateTimelineItem(idx, 'description', e.target.value)}
                    placeholder="Description" className={`${INPUT_CLS} flex-1`} />
                  <button onClick={() => removeTimelineItem(idx)} className="p-1 text-red-400 hover:text-red-600 shrink-0">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              <button onClick={addTimelineItem}
                className="flex items-center gap-1.5 text-sm font-medium text-primary-600 hover:text-primary-700">
                <Plus className="h-3.5 w-3.5" /> Add Section
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ==========================================
// Per-Screen Editor
// ==========================================

interface ScreenContent {
  screenIndex: number;
  screenLabel?: string;
  mode?: 'slides' | 'video';
  videoUrl?: string;
  guestNames?: string[];
  guestNameFontSizeRem?: number;
  welcomeSlides: WelcomeSlide[];
  infoSlides: InfoSlide[];
}

function ScreenEditor({ screen, onChange, images, videos, siteId }: {
  screen: ScreenContent;
  onChange: (updated: ScreenContent) => void;
  images: Content[];
  videos: Content[];
  siteId?: string;
}) {
  const [tab, setTab] = useState<'welcome' | 'info'>('welcome');
  const mode = screen.mode === 'video' ? 'video' : 'slides';
  const guestNames = screen.guestNames || [];
  const guestNameFontSizeRem = Math.round(Math.min(
    MAX_GUEST_NAME_FONT_SIZE_REM,
    Math.max(MIN_GUEST_NAME_FONT_SIZE_REM, Number(screen.guestNameFontSizeRem) || DEFAULT_GUEST_NAME_FONT_SIZE_REM)
  ) * 10) / 10;

  const addWelcomeSlide = () => {
    const slides = [...screen.welcomeSlides];
    slides.push({ id: 'w-' + Date.now(), greeting: 'Welcome', subtitle: '' });
    onChange({ ...screen, welcomeSlides: slides });
  };

  const addInfoSlide = (type: 'pre-info' | 'timeline') => {
    const slides = [...screen.infoSlides];
    slides.push({
      id: 'i-' + Date.now(),
      type,
      title: type === 'timeline' ? 'Your Journey' : '',
      timelineItems: type === 'timeline' ? [
        { section: 'Origin', duration: '15 min', color: '#f59e0b' },
        { section: 'Business', duration: '20 min', color: '#3b82f6' },
        { section: 'Culture', duration: '15 min', color: '#10b981' },
        { section: 'Philanthropy', duration: '10 min', color: '#8b5cf6' },
      ] : undefined,
    });
    onChange({ ...screen, infoSlides: slides });
  };

  const updateGuestName = (idx: number, value: string) => {
    const names = [...guestNames];
    names[idx] = value;
    onChange({ ...screen, guestNames: names });
  };

  const addGuestName = () => {
    onChange({ ...screen, guestNames: [...guestNames, ''] });
  };

  const removeGuestName = (idx: number) => {
    const names = [...guestNames];
    names.splice(idx, 1);
    onChange({ ...screen, guestNames: names });
  };

  const updateGuestNameFontSize = (value: number) => {
    const nextSize = Math.round(Math.min(MAX_GUEST_NAME_FONT_SIZE_REM, Math.max(MIN_GUEST_NAME_FONT_SIZE_REM, value)) * 10) / 10;
    onChange({ ...screen, guestNameFontSizeRem: nextSize });
  };

  return (
    <div className="border border-surface-200 rounded-2xl bg-surface-50/50 overflow-hidden">
      <div className="px-5 py-3 border-b border-surface-200 card-bg">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-purple-100 dark:bg-purple-500/15 flex items-center justify-center text-purple-600 dark:text-purple-300 text-xs font-bold">
            {screen.screenIndex + 1}
          </div>
          <input type="text" value={screen.screenLabel || ''} onChange={(e) => onChange({ ...screen, screenLabel: e.target.value })}
            placeholder={`Screen ${screen.screenIndex + 1}`}
            className="text-sm font-semibold text-surface-800 bg-transparent border-none focus:outline-none placeholder:text-surface-400 flex-1" />
        </div>
      </div>

      <div className="px-4 pt-4">
        <SegmentedControl
          label="Screen Mode"
          value={mode}
          options={[
            { value: 'slides', label: 'Slides (Welcome + Info)' },
            { value: 'video', label: 'Video Only' },
          ]}
          onChange={(value) => onChange({ ...screen, mode: value as 'slides' | 'video' })}
        />
      </div>

      {screen.screenIndex === 2 && (
        <div className="px-4 pt-4">
          <div className="rounded-2xl border border-surface-200 card-bg p-4 space-y-3">
            <div>
              <div className="text-sm font-semibold text-surface-800">Right Screen Name List</div>
              <p className="mt-1 text-xs text-surface-500">
                Add names. The display centers one name, then expands into centered two-name rows.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-surface-200 bg-surface-50 px-3 py-2">
              <div className="mr-auto text-xs font-semibold text-surface-700">Font size</div>
              <button
                type="button"
                onClick={() => updateGuestNameFontSize(guestNameFontSizeRem - 0.2)}
                disabled={guestNameFontSizeRem <= MIN_GUEST_NAME_FONT_SIZE_REM}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-surface-200 card-bg text-surface-600 hover:text-primary-600 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Decrease guest name font size"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <div className="min-w-[72px] rounded-lg border border-surface-200 card-bg px-2 py-1 text-center text-xs font-bold text-surface-800">
                {guestNameFontSizeRem.toFixed(1)}rem
              </div>
              <button
                type="button"
                onClick={() => updateGuestNameFontSize(guestNameFontSizeRem + 0.2)}
                disabled={guestNameFontSizeRem >= MAX_GUEST_NAME_FONT_SIZE_REM}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-surface-200 card-bg text-surface-600 hover:text-primary-600 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Increase guest name font size"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="space-y-2">
              {guestNames.map((name, idx) => (
                <div key={`guest-name-${idx}`} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => updateGuestName(idx, e.target.value)}
                    placeholder={`Name ${idx + 1}`}
                    className={`${INPUT_CLS} flex-1`}
                  />
                  <button
                    onClick={() => removeGuestName(idx)}
                    className="p-1 text-red-400 hover:text-red-600 shrink-0"
                    aria-label={`Remove name ${idx + 1}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              <button
                onClick={addGuestName}
                className="flex items-center gap-1.5 text-sm font-medium text-primary-600 hover:text-primary-700"
              >
                <Plus className="h-3.5 w-3.5" /> Add Name
              </button>
            </div>
          </div>
        </div>
      )}

      {mode === 'video' ? (
        <div className="p-4 space-y-3">
          <ContentPicker
            configKey="videoUrl"
            label="Screen Video"
            items={videos}
            emptyLabel="Select or upload video..."
            config={screen as unknown as Record<string, unknown>}
            onChange={(updated) => onChange({ ...screen, videoUrl: updated.videoUrl as string })}
            siteId={siteId}
            accept="video/*"
          />
          <p className="text-xs text-surface-500 bg-surface-50 border border-surface-100 rounded-lg px-3 py-2 leading-relaxed">
            This screen will play only the selected video in a loop.
          </p>
        </div>
      ) : (
        <>
          {/* Tab switcher */}
          <div className="flex border-y border-surface-200 card-bg mt-4">
            <button
              className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-wider transition-colors ${tab === 'welcome' ? 'text-primary-600 border-b-2 border-primary-500' : 'text-surface-400 hover:text-surface-600'}`}
              onClick={() => setTab('welcome')}
            >
              State 1: Welcome ({screen.welcomeSlides.length})
            </button>
            <button
              className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-wider transition-colors ${tab === 'info' ? 'text-primary-600 border-b-2 border-primary-500' : 'text-surface-400 hover:text-surface-600'}`}
              onClick={() => setTab('info')}
            >
              State 2: Visitor Info ({screen.infoSlides.length})
            </button>
          </div>
          <div className="p-4 space-y-3">
            {tab === 'welcome' && (
              <>
                {screen.welcomeSlides.map((slide, idx) => (
                  <WelcomeSlideEditor
                    key={slide.id}
                    slide={slide}
                    images={images}
                    siteId={siteId}
                    onChange={(updated) => {
                      const slides = [...screen.welcomeSlides];
                      slides[idx] = updated;
                      onChange({ ...screen, welcomeSlides: slides });
                    }}
                    onRemove={() => {
                      const slides = [...screen.welcomeSlides];
                      slides.splice(idx, 1);
                      onChange({ ...screen, welcomeSlides: slides });
                    }}
                  />
                ))}
                <button onClick={addWelcomeSlide}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-surface-200 text-sm font-medium text-surface-400 hover:text-primary-600 hover:border-primary-300 transition-colors">
                  <Plus className="h-4 w-4" /> Add Welcome Slide
                </button>
              </>
            )}
            {tab === 'info' && (
              <>
                {screen.infoSlides.map((slide, idx) => (
                  <InfoSlideEditor
                    key={slide.id}
                    slide={slide}
                    images={images}
                    siteId={siteId}
                    onChange={(updated) => {
                      const slides = [...screen.infoSlides];
                      slides[idx] = updated as InfoSlide;
                      onChange({ ...screen, infoSlides: slides });
                    }}
                    onRemove={() => {
                      const slides = [...screen.infoSlides];
                      slides.splice(idx, 1);
                      onChange({ ...screen, infoSlides: slides });
                    }}
                  />
                ))}
                <div className="flex gap-2">
                  <button onClick={() => addInfoSlide('pre-info')}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-surface-200 text-sm font-medium text-surface-400 hover:text-primary-600 hover:border-primary-300 transition-colors">
                    <Plus className="h-4 w-4" /> Add Pre-Info Slide
                  </button>
                  <button onClick={() => addInfoSlide('timeline')}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-surface-200 text-sm font-medium text-surface-400 hover:text-teal-600 hover:border-teal-300 transition-colors">
                    <Plus className="h-4 w-4" /> Add Timeline Slide
                  </button>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ==========================================
// Main Config Panel
// ==========================================

function getReceptionScreens(config: Record<string, unknown>): ScreenContent[] {
  return (config.screens as ScreenContent[]) || [
    { screenIndex: 0, screenLabel: 'Left Screen', mode: 'slides', videoUrl: '', guestNames: [], guestNameFontSizeRem: DEFAULT_GUEST_NAME_FONT_SIZE_REM, welcomeSlides: [], infoSlides: [] },
    { screenIndex: 1, screenLabel: 'Center Screen', mode: 'slides', videoUrl: '', guestNames: [], guestNameFontSizeRem: DEFAULT_GUEST_NAME_FONT_SIZE_REM, welcomeSlides: [], infoSlides: [] },
    { screenIndex: 2, screenLabel: 'Right Screen', mode: 'slides', videoUrl: '', guestNames: [], guestNameFontSizeRem: DEFAULT_GUEST_NAME_FONT_SIZE_REM, welcomeSlides: [], infoSlides: [] },
  ];
}

export function Custom06ReceptionContentConfig({ config, onChange, siteId }: ConfigPanelProps) {
  const { images, videos } = useConfigData(siteId);

  const set = (key: string, value: unknown) => onChange({ ...config, [key]: value });
  const screens = getReceptionScreens(config);

  const updateScreen = (idx: number, updated: ScreenContent) => {
    const newScreens = [...screens];
    newScreens[idx] = updated;
    set('screens', newScreens);
  };

  return (
    <ConfigSection id="screens" title="Screen Content" accentColor="#7c3aed"
      description="Configure each of the 3 reception screens as welcome content, visitor information, guest names, or full-screen video.">
      <div className="space-y-5">
        {screens.map((screen, idx) => (
          <ScreenEditor key={idx} screen={screen} onChange={(updated) => updateScreen(idx, updated)} images={images} videos={videos} siteId={siteId} />
        ))}
      </div>
    </ConfigSection>
  );
}

export function Custom06ReceptionConfig({ config, onChange, siteId }: ConfigPanelProps) {
  const { numberField, selectField, checkboxField } = useFieldHelpers(config, onChange);
  const { images, videos } = useConfigData(siteId);

  const set = (key: string, value: unknown) => onChange({ ...config, [key]: value });

  // Ensure screens array exists with 3 entries
  const screens: ScreenContent[] = getReceptionScreens(config);

  const updateScreen = (idx: number, updated: ScreenContent) => {
    const newScreens = [...screens];
    newScreens[idx] = updated;
    set('screens', newScreens);
  };

  return (
    <ConfigPageLayout sections={SECTIONS}>

      {/* General */}
      <ConfigSection id="general" title="General" accentColor="#2563eb"
        description="Screen assignment and branding">
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={LABEL_CLS}>This Device's Screen Index</label>
              <select value={(config.screenIndex as number) ?? 0}
                onChange={(e) => set('screenIndex', parseInt(e.target.value))}
                className={INPUT_CLS}>
                <option value={0}>Screen 1 (Left)</option>
                <option value={1}>Screen 2 (Center)</option>
                <option value={2}>Screen 3 (Right)</option>
              </select>
            </div>
            {selectField('transition', 'Transition', TRANSITION_OPTIONS)}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <ContentPicker
              configKey="logoUrl" label="Museum Logo" items={images}
              emptyLabel="Select or upload museum logo..." config={config}
              onChange={onChange} siteId={siteId} accept="image/*"
            />
            <div>
              <label className={LABEL_CLS}>Footer Text</label>
              <input type="text" value={(config.footerText as string) || ''} onChange={(e) => set('footerText', e.target.value)}
                placeholder="e.g. Museum OS Heritage Museum" className={INPUT_CLS} />
            </div>
          </div>
          <div className="flex gap-6">
            {checkboxField('showClock', 'Show Clock')}
            {checkboxField('showDate', 'Show Date')}
          </div>
          {!!(config.showDate) && (
            <SegmentedControl label="Date Format" value={(config.dateFormat as string) || 'long'} options={DATE_FORMAT_OPTIONS} onChange={(v) => set('dateFormat', v)} />
          )}
          <div className="pt-2 border-t border-surface-100">
            <div className="text-xs font-semibold uppercase tracking-wider text-surface-500 mb-2">Display Cleanup</div>
            <p className="text-xs text-surface-400 mb-2">
              Use these to show only full-screen background content on the welcome slide.
            </p>
            <div className="flex flex-wrap gap-6">
              {checkboxField('hideHeader', 'Remove Header')}
              {checkboxField('hideCenterLine', 'Remove Center Line')}
              {checkboxField('disableOpacity', 'Remove Opacity Overlay')}
            </div>
          </div>
        </div>
      </ConfigSection>

      {/* Screen Content */}
      <ConfigSection id="screens" title="Screen Content" accentColor="#7c3aed"
        description="Configure each of the 3 screens as either slide mode (Welcome + Visitor Info) or full-screen video mode.">
        <div className="space-y-5">
          {screens.map((screen, idx) => (
            <ScreenEditor key={idx} screen={screen} onChange={(updated) => updateScreen(idx, updated)} images={images} videos={videos} siteId={siteId} />
          ))}
        </div>
      </ConfigSection>

      {/* Timing */}
      <ConfigSection id="timing" title="Timing" accentColor="#4f46e5"
        description="Control slide durations and state cycling">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {numberField('welcomeSlideDuration', 'Welcome Slide (sec)', { min: 3, max: 60 })}
          {numberField('infoSlideDuration', 'Info Slide (sec)', { min: 3, max: 60 })}
          {numberField('stateCycleDuration', 'State Cycle (sec)', { min: 10, max: 300 })}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
          {numberField('transitionDuration', 'Transition (ms)', { min: 0, max: 3000 })}
        </div>
      </ConfigSection>

      {/* Appearance */}
      <ConfigSection id="appearance" title="Appearance" accentColor="#059669"
        description="Colors and visual style">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className={LABEL_CLS}>Background Color</label>
            <div className="flex items-center gap-2">
              <input type="color" value={(config.backgroundColor as string) || '#0f172a'}
                onChange={(e) => set('backgroundColor', e.target.value)}
                className="h-10 w-10 rounded-xl border border-surface-200 cursor-pointer p-0.5" />
              <input type="text" value={(config.backgroundColor as string) || '#0f172a'}
                onChange={(e) => set('backgroundColor', e.target.value)}
                className={`${INPUT_CLS} max-w-[130px] font-mono`} />
            </div>
          </div>
          <div>
            <label className={LABEL_CLS}>Accent Color</label>
            <div className="flex items-center gap-2">
              <input type="color" value={(config.accentColor as string) || '#3b82f6'}
                onChange={(e) => set('accentColor', e.target.value)}
                className="h-10 w-10 rounded-xl border border-surface-200 cursor-pointer p-0.5" />
              <input type="text" value={(config.accentColor as string) || '#3b82f6'}
                onChange={(e) => set('accentColor', e.target.value)}
                className={`${INPUT_CLS} max-w-[130px] font-mono`} />
            </div>
          </div>
          <div>
            <label className={LABEL_CLS}>Text Color</label>
            <div className="flex items-center gap-2">
              <input type="color" value={(config.textColor as string) || '#ffffff'}
                onChange={(e) => set('textColor', e.target.value)}
                className="h-10 w-10 rounded-xl border border-surface-200 cursor-pointer p-0.5" />
              <input type="text" value={(config.textColor as string) || '#ffffff'}
                onChange={(e) => set('textColor', e.target.value)}
                className={`${INPUT_CLS} max-w-[130px] font-mono`} />
            </div>
          </div>
        </div>
      </ConfigSection>

      {/* Idle Screen */}
      <ConfigSection id="idle" title="Idle Screen" accentColor="#0891b2"
        description="Attract screen when not in use">
        <IdleScreenToggle config={config} onChange={onChange} images={images} videos={videos} siteId={siteId} />
      </ConfigSection>

    </ConfigPageLayout>
  );
}
