import { useState, useCallback, useRef } from 'react';
import {
  useFieldHelpers, useConfigData, SlideshowTimeline, IdleScreenToggle,
  FIT_OPTIONS, TRANSITION_OPTIONS, LABEL_CLS, INPUT_CLS, SegmentedControl,
  ConfigSection, ConfigPageLayout, type ConfigPanelProps, type SectionDef,
} from './SharedConfigFields';
import { Plus, Trash2, ChevronDown, ChevronUp, FileText, Upload, Loader2 } from 'lucide-react';
import { SearchableContentMultiPicker } from '../SearchableContentPicker';
import { useAuthStore } from '../../stores/auth';
import { useQueryClient } from '@tanstack/react-query';
import type { Content } from '../../lib/types';

const DISPLAY_MODE_OPTIONS = [
  { value: 'carousel', label: 'Carousel' },
  { value: 'slideshow', label: 'Slideshow' },
  { value: 'document-viewer', label: 'Document Viewer' },
];

const AUDIO_OUTPUT_OPTIONS = [
  { value: 'none', label: 'No Audio' },
  { value: 'monophone', label: 'Monophone' },
  { value: 'screen', label: 'Screen Speakers' },
  { value: 'directional-speaker', label: 'Directional Speaker' },
];

const CAPTION_POSITION_OPTIONS = [
  { value: 'bottom', label: 'Bottom' },
  { value: 'top', label: 'Top' },
  { value: 'overlay', label: 'Overlay' },
];

const BOLD_HINT_TEXT = 'Use *text* to show that part in bold on display.';

// ==========================================
// Document Builder Types
// ==========================================

interface DocPage {
  contentId: string;
  contentName: string;
  contentType: 'image' | 'video';
  thumbnailUrl?: string;
}

interface DocDef {
  id: string;
  label: string;
  caption: string;
  sourceLabel: string;
  pages: DocPage[];
}

// ==========================================
// Single Document Editor
// ==========================================

function DocumentEditor({ doc, index, contentItems, siteId, onChange, onRemove }: {
  doc: DocDef;
  index: number;
  contentItems: Content[];
  siteId: string;
  onChange: (updated: DocDef) => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null);
  const token = useAuthStore((s) => s.token);
  const queryClient = useQueryClient();

  const addPages = (contentIds: string[]) => {
    const newPages: DocPage[] = contentIds.map((cId) => {
      const content = contentItems.find((c) => c.id === cId);
      return {
        contentId: cId,
        contentName: content?.name || 'Unknown',
        contentType: (content?.type === 'video' ? 'video' : 'image') as 'image' | 'video',
        thumbnailUrl: content?.url,
      };
    });
    onChange({ ...doc, pages: [...doc.pages, ...newPages] });
  };

  const removePage = (pageIndex: number) => {
    const pages = [...doc.pages];
    pages.splice(pageIndex, 1);
    onChange({ ...doc, pages });
  };

  const movePage = (from: number, to: number) => {
    if (to < 0 || to >= doc.pages.length) return;
    const pages = [...doc.pages];
    const [moved] = pages.splice(from, 1);
    pages.splice(to, 0, moved);
    onChange({ ...doc, pages });
  };

  const handleUploadFiles = async (files: FileList) => {
    if (!siteId || files.length === 0) return;
    setUploading(true);
    const newPages: DocPage[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const baseName = file.name.replace(/\.[^.]+$/, '');
        const formData = new FormData();
        formData.append('file', file);
        formData.append('name', `${doc.label}-page${doc.pages.length + i + 1}-${baseName}`);
        formData.append('site_id', siteId);

        const result = await new Promise<{ id: string; url: string; type: string; name: string }>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('POST', '/api/content?skip_app_refresh=true');
          if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
          xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) resolve(JSON.parse(xhr.responseText).data);
            else reject(new Error('Upload failed'));
          });
          xhr.addEventListener('error', () => reject(new Error('Network error')));
          xhr.send(formData);
        });

        newPages.push({
          contentId: result.id,
          contentName: result.name,
          contentType: (result.type === 'video' ? 'video' : 'image') as 'image' | 'video',
          thumbnailUrl: result.url,
        });
      } catch { /* skip failed */ }
    }

    if (newPages.length > 0) {
      onChange({ ...doc, pages: [...doc.pages, ...newPages] });
      queryClient.invalidateQueries({ queryKey: ['content', siteId] });
    }
    setUploading(false);
    if (uploadRef.current) uploadRef.current.value = '';
  };

  return (
    <div className="border border-surface-200 rounded-2xl bg-white overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 bg-surface-50 cursor-pointer hover:bg-surface-100 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="h-8 w-8 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
          <FileText className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-surface-800 truncate">
            {doc.label || `Document ${index + 1}`}
          </div>
          <div className="text-xs text-surface-400">
            {doc.pages.length} {doc.pages.length === 1 ? 'page' : 'pages'}
          </div>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="p-1.5 text-red-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
        {expanded
          ? <ChevronUp className="h-4 w-4 text-surface-400" />
          : <ChevronDown className="h-4 w-4 text-surface-400" />}
      </div>

      {/* Body */}
      {expanded && (
        <div className="p-4 space-y-4">
          {/* Doc label */}
          <div>
            <label className={LABEL_CLS}>Document Name</label>
            <input
              type="text"
              value={doc.label}
              onChange={(e) => onChange({ ...doc, label: e.target.value })}
              placeholder={`Document ${index + 1}`}
              className={INPUT_CLS}
            />
            <p className="text-xs text-surface-500 mt-1">{BOLD_HINT_TEXT}</p>
          </div>

          {/* Caption (shown below thumbnail on homepage and in reading view) */}
          <div>
            <label className={LABEL_CLS}>Caption</label>
            <textarea
              value={doc.caption || ''}
              onChange={(e) => onChange({ ...doc, caption: e.target.value })}
              placeholder="Description shown below the document thumbnail..."
              rows={2}
              className={INPUT_CLS}
              style={{ resize: 'vertical' }}
            />
            <p className="text-xs text-surface-500 mt-1">{BOLD_HINT_TEXT}</p>
          </div>

          {/* Source label (shown above the overview thumbnail in reading view) */}
          <div>
            <label className={LABEL_CLS}>Source Label <span className="text-surface-400 font-normal">(optional)</span></label>
            <input
              type="text"
              value={doc.sourceLabel || ''}
              onChange={(e) => onChange({ ...doc, sourceLabel: e.target.value })}
              placeholder="e.g. National Library of Australia"
              className={INPUT_CLS}
            />
            <p className="text-xs text-surface-500 mt-1">{BOLD_HINT_TEXT}</p>
          </div>

          {/* Pages list */}
          <div>
            <label className={LABEL_CLS}>Pages</label>
            {doc.pages.length === 0 ? (
              <div className="text-sm text-surface-400 bg-surface-50 rounded-xl p-4 text-center border border-dashed border-surface-200">
                No pages yet. Add images below.
              </div>
            ) : (
              <div className="space-y-1.5">
                {doc.pages.map((page, pi) => (
                  <div key={page.contentId + '-' + pi}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface-50 border border-surface-100 group">
                    {/* Thumbnail */}
                    <div className="h-10 w-10 rounded-lg bg-surface-200 overflow-hidden shrink-0">
                      {page.thumbnailUrl && (
                        <img src={page.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                      )}
                    </div>
                    {/* Name */}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-surface-700 truncate">{page.contentName}</div>
                      <div className="text-[10px] text-surface-400 uppercase tracking-wider">
                        Page {pi + 1} of {doc.pages.length}
                      </div>
                    </div>
                    {/* Move up/down */}
                    <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        disabled={pi === 0}
                        onClick={() => movePage(pi, pi - 1)}
                        className="p-0.5 text-surface-400 hover:text-surface-700 disabled:opacity-20"
                      >
                        <ChevronUp className="h-3 w-3" />
                      </button>
                      <button
                        disabled={pi === doc.pages.length - 1}
                        onClick={() => movePage(pi, pi + 1)}
                        className="p-0.5 text-surface-400 hover:text-surface-700 disabled:opacity-20"
                      >
                        <ChevronDown className="h-3 w-3" />
                      </button>
                    </div>
                    {/* Remove */}
                    <button
                      onClick={() => removePage(pi)}
                      className="p-1 text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add pages buttons */}
          <div className="flex gap-2">
            <button
              onClick={() => setPickerOpen(true)}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-surface-200 text-sm font-medium text-surface-400 hover:text-primary-600 hover:border-primary-300 transition-colors"
            >
              <Plus className="h-4 w-4" /> Add from Library
            </button>
            <button
              onClick={() => uploadRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 border-dashed border-surface-200 text-sm font-medium text-surface-400 hover:text-emerald-600 hover:border-emerald-300 transition-colors disabled:opacity-50"
            >
              {uploading
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Uploading...</>
                : <><Upload className="h-4 w-4" /> Upload</>}
            </button>
            <input
              ref={uploadRef}
              type="file"
              multiple
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                if (e.target.files) handleUploadFiles(e.target.files);
              }}
            />
          </div>

          {/* Content picker modal */}
          {pickerOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setPickerOpen(false)}>
              <div className="bg-white rounded-2xl shadow-2xl w-[500px] max-h-[70vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
                <div className="px-5 py-4 border-b border-surface-200">
                  <h3 className="font-semibold text-surface-800">Add Pages to "{doc.label}"</h3>
                  <p className="text-xs text-surface-400 mt-1">Select images to add as pages</p>
                </div>
                <SearchableContentMultiPicker
                  selectedIds={doc.pages.map((p) => p.contentId)}
                  onChange={(ids) => {
                    // Find newly added IDs
                    const existing = new Set(doc.pages.map((p) => p.contentId));
                    const newIds = ids.filter((id) => !existing.has(id));
                    if (newIds.length > 0) addPages(newIds);
                    setPickerOpen(false);
                  }}
                  contentItems={contentItems.filter((c) => c.type === 'image')}
                  label=""
                />
                <div className="px-5 py-3 border-t border-surface-200 flex justify-end">
                  <button
                    onClick={() => setPickerOpen(false)}
                    className="px-4 py-2 text-sm font-medium text-surface-600 hover:text-surface-800 transition-colors"
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ==========================================
// Document Builder — replaces Timeline for document-viewer mode
// ==========================================

function DocumentBuilder({ config, onChange, contentItems, siteId }: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
  contentItems: Content[];
  siteId: string;
}) {
  const docs: DocDef[] = (config._documents as DocDef[]) || [];

  const setDocs = useCallback((newDocs: DocDef[]) => {
    // Also build _timelineItems from documents so the playlist save logic works
    // Each page gets metadata.documentIndex set to its document position
    interface TimelineItem {
      contentId: string;
      contentName: string;
      contentType: 'image' | 'video';
      thumbnailUrl?: string;
      duration: number;
      transition: string;
      documentIndex: number;
      documentCaption: string;
      documentSourceLabel: string;
    }
    const timelineItems: TimelineItem[] = [];
    newDocs.forEach((doc, docIdx) => {
      doc.pages.forEach((page) => {
        timelineItems.push({
          contentId: page.contentId,
          contentName: page.contentName,
          contentType: page.contentType,
          thumbnailUrl: page.thumbnailUrl,
          duration: 999, // not auto-advancing in document mode
          transition: 'none',
          documentIndex: docIdx,
          documentCaption: doc.caption || '',
          documentSourceLabel: doc.sourceLabel || '',
        });
      });
    });
    onChange({ ...config, _documents: newDocs, _timelineItems: timelineItems });
  }, [config, onChange]);

  const addDocument = () => {
    const newDoc: DocDef = {
      id: 'doc-' + Date.now(),
      label: `Document ${docs.length + 1}`,
      caption: '',
      sourceLabel: '',
      pages: [],
    };
    setDocs([...docs, newDoc]);
  };

  const updateDoc = (index: number, updated: DocDef) => {
    const newDocs = [...docs];
    newDocs[index] = updated;
    setDocs(newDocs);
  };

  const removeDoc = (index: number) => {
    const newDocs = [...docs];
    newDocs.splice(index, 1);
    setDocs(newDocs);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-indigo-50 border border-indigo-100 p-3 text-sm text-indigo-700">
        Create documents and add pages (images) to each. The <strong>homepage</strong> shows document thumbnails
        side by side. Tap to open the <strong>splitscreen reader</strong> with zoomed content on the left and a
        page overview on the right.
      </div>

      {docs.length === 0 ? (
        <div className="text-center py-8 text-surface-400 bg-surface-50 rounded-2xl border-2 border-dashed border-surface-200">
          <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <div className="text-sm font-medium">No documents yet</div>
          <div className="text-xs mt-1">Add your first document below</div>
        </div>
      ) : (
        <div className="space-y-3">
          {docs.map((doc, idx) => (
            <DocumentEditor
              key={doc.id}
              doc={doc}
              index={idx}
              contentItems={contentItems}
              siteId={siteId}
              onChange={(updated) => updateDoc(idx, updated)}
              onRemove={() => removeDoc(idx)}
            />
          ))}
        </div>
      )}

      <button
        onClick={addDocument}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-surface-200 text-sm font-medium text-surface-500 hover:text-indigo-600 hover:border-indigo-300 transition-colors"
      >
        <Plus className="h-4 w-4" /> Add Document
      </button>
    </div>
  );
}

// ==========================================
// Sections
// ==========================================

function getSections(isDocViewer: boolean): SectionDef[] {
  const base: SectionDef[] = [
    { id: 'general', title: 'General', color: '#2563eb' },
  ];
  if (isDocViewer) {
    base.push({ id: 'documents', title: 'Documents', color: '#4f46e5' });
  } else {
    base.push({ id: 'timeline', title: 'Timeline', color: '#4f46e5' });
  }
  base.push(
    { id: 'display', title: 'Display', color: '#7c3aed' },
    { id: 'captions', title: 'Captions', color: '#475569' },
    { id: 'audio', title: 'Audio', color: '#059669' },
    { id: 'idle', title: 'Idle Screen', color: '#0891b2' },
  );
  return base;
}

// ==========================================
// Main Config Panel
// ==========================================

export function App03CarouselConfig({ config, onChange, siteId }: ConfigPanelProps) {
  const { numberField, selectField, checkboxField } = useFieldHelpers(config, onChange);
  const { contentItems, videos, images } = useConfigData(siteId);

  const set = (key: string, value: unknown) => onChange({ ...config, [key]: value });
  const displayMode = (config.displayMode as string) || 'carousel';
  const isCarousel = displayMode === 'carousel';
  const isDocViewer = displayMode === 'document-viewer';

  const sections = getSections(isDocViewer);

  return (
    <ConfigPageLayout sections={sections}>

      {/* General */}
      <ConfigSection id="general" title="General" accentColor="#2563eb"
        description="Display mode and default timing">
        <div className="space-y-4">
          <SegmentedControl
            label="Display Mode"
            value={displayMode}
            options={DISPLAY_MODE_OPTIONS}
            onChange={(v) => set('displayMode', v)}
          />
          {!isDocViewer && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {numberField('defaultDuration', 'Default Duration (sec)')}
              {selectField('transition', 'Default Transition', TRANSITION_OPTIONS)}
              {numberField('transitionDuration', 'Transition (ms)')}
            </div>
          )}
        </div>
      </ConfigSection>

      {/* Documents (document-viewer mode) */}
      {isDocViewer && (
        <ConfigSection id="documents" title="Documents" accentColor="#4f46e5"
          description="Add documents and assign pages to each">
          <DocumentBuilder config={config} onChange={onChange} contentItems={contentItems} siteId={siteId} />
        </ConfigSection>
      )}

      {/* Timeline (carousel / slideshow mode) */}
      {!isDocViewer && (
        <ConfigSection id="timeline" title="Timeline" accentColor="#4f46e5"
          description="Add and order media items">
          <SlideshowTimeline config={config} onChange={onChange} contentItems={contentItems} siteId={siteId} />
        </ConfigSection>
      )}

      {/* Display */}
      <ConfigSection id="display" title="Display" accentColor="#7c3aed"
        description="Fit, colors and carousel behavior">
        <div className="space-y-4">
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
          {isCarousel && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {numberField('carouselHeight', 'Thumb Size (px)', { min: 60, max: 200 })}
              {numberField('carouselTimeout', 'Carousel Auto-Hide (sec)', { min: 1, max: 30 })}
              {numberField('inactivityTimeout', 'Resume Auto-Play (sec)', { min: 5, max: 120 })}
            </div>
          )}
          {isDocViewer && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {numberField('documentHomeTimeoutSec', 'Return Home Timeout (sec)', { min: 5, max: 300 })}
            </div>
          )}
          {!isDocViewer && (
            <div className="flex gap-6">
              {checkboxField('shuffle', 'Shuffle order')}
              {checkboxField('loop', 'Loop')}
            </div>
          )}
        </div>
      </ConfigSection>

      {/* Captions */}
      {!isDocViewer && (
        <ConfigSection id="captions" title="Captions" accentColor="#475569"
          description="Display captions or titles below media">
          <div className="space-y-4">
            {checkboxField('showCaptions', 'Show Captions / Titles')}
            {!!(config.showCaptions) && (
              <SegmentedControl
                label="Caption Position"
                value={(config.captionPosition as string) || 'bottom'}
                options={CAPTION_POSITION_OPTIONS}
                onChange={(v) => set('captionPosition', v)}
              />
            )}
          </div>
        </ConfigSection>
      )}

      {/* Audio */}
      <ConfigSection id="audio" title="Audio" accentColor="#059669"
        description="For installations with monophone or speaker">
        <div className="space-y-4">
          {selectField('audioOutput', 'Audio Output', AUDIO_OUTPUT_OPTIONS)}
          {(config.audioOutput as string) === 'monophone' && (
            <div>
              <label className={LABEL_CLS}>Controller ID</label>
              <input type="text" value={(config.controllerId as string) || ''}
                onChange={(e) => set('controllerId', e.target.value)}
                placeholder="e.g. ESP32-001" className={INPUT_CLS} />
            </div>
          )}
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
