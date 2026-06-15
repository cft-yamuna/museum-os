import { useState, useCallback, useRef } from 'react';
import { FileText, Plus, Trash2, Upload, Loader2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useFieldHelpers, useConfigData, contentPicker, ExhibitionPicker, SlideshowTimeline, IdleScreenToggle,
  FIT_OPTIONS, LABEL_CLS, INPUT_CLS, SegmentedControl,
  ConfigSection, ConfigPageLayout, type ConfigPanelProps, type SectionDef,
} from './SharedConfigFields';
import { SearchableContentMultiPicker } from '../SearchableContentPicker';
import { useAuthStore } from '../../stores/auth';
import type { Content } from '../../lib/types';


const TRIGGER_OPTIONS = [
  { value: 'hardware', label: 'Hardware' },
  { value: 'touch', label: 'Touch' },
  { value: 'both', label: 'Both' },
];

const CONTENT_TYPE_OPTIONS = [
  { value: 'video', label: 'Video' },
  { value: 'image', label: 'Image' },
  { value: 'slideshow', label: 'Slideshow' },
];

const BOLD_HINT_TEXT = 'Use *text* to show that part in bold on display.';

// ==========================================
// Proximity Trigger
// ==========================================

const PROX_SECTIONS: SectionDef[] = [
  { id: 'trigger', title: 'Trigger', color: '#d97706' },
  { id: 'content', title: 'Content', color: '#c2185b' },
  { id: 'display', title: 'Display', color: '#7c3aed' },
  { id: 'idle', title: 'Idle Screen', color: '#0891b2' },
];

export function ProximityConfig({ config, onChange, siteId }: ConfigPanelProps) {
  const { textField, numberField, note } = useFieldHelpers(config, onChange);
  const { videos, images } = useConfigData(siteId);

  const set = (key: string, value: unknown) => onChange({ ...config, [key]: value });
  const triggerMode = (config.triggerMode as string) || 'touch';
  const contentType = (config.contentType as string) || 'video';

  return (
    <ConfigPageLayout sections={PROX_SECTIONS}>

      {/* Trigger */}
      <ConfigSection id="trigger" title="Trigger Settings" accentColor="#d97706"
        description="How the content is activated">
        <div className="space-y-4">
          <SegmentedControl
            label="Trigger Mode"
            value={triggerMode}
            options={TRIGGER_OPTIONS}
            onChange={(v) => set('triggerMode', v)}
          />
          {triggerMode !== 'touch' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {textField('controllerId', 'Controller ID', { placeholder: 'e.g. ESP32-001' })}
              {numberField('activationDistance', 'Activation Distance (cm)', { min: 10, max: 500 })}
              {numberField('deactivationDelay', 'Deactivation Delay (ms)', { min: 500, max: 10000 })}
            </div>
          )}
          {triggerMode === 'touch' && note('Content will activate on screen tap — no hardware required.')}
        </div>
      </ConfigSection>

      {/* Content */}
      <ConfigSection id="content" title="Content" accentColor="#c2185b"
        description="Media shown when triggered">
        <div className="space-y-4">
          <SegmentedControl
            label="Content Type"
            value={contentType}
            options={CONTENT_TYPE_OPTIONS}
            onChange={(v) => set('contentType', v)}
          />
          {contentType === 'video' && contentPicker('videoUrl', 'Video', videos, 'Select a video...', config, onChange, siteId, 'video/*')}
          {contentType === 'image' && contentPicker('imageUrl', 'Image', images, 'Select an image...', config, onChange, siteId, 'image/*')}
          {contentType === 'slideshow' && note('Create a playlist via APP 03 or Touch Scroll, then reference the playlist ID.')}
        </div>
      </ConfigSection>

      {/* Display */}
      <ConfigSection id="display" title="Display" accentColor="#7c3aed"
        description="Fit mode and background color">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Reuse selectField via helpers */}
          <div>
            <label className={LABEL_CLS}>Fit</label>
            <select
              value={(config.fit as string) || 'cover'}
              onChange={(e) => set('fit', e.target.value)}
              className={INPUT_CLS}
            >
              {FIT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
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

      {/* Idle */}
      <ConfigSection id="idle" title="Idle Screen" accentColor="#0891b2"
        description="Shown before the trigger fires">
        <IdleScreenToggle config={config} onChange={onChange} images={images} videos={videos} siteId={siteId} />
      </ConfigSection>

    </ConfigPageLayout>
  );
}

// ==========================================
// Touch Scroll
// ==========================================

type TouchScrollContentMode = 'timeline' | 'documents';

interface TouchScrollDocPage {
  contentId: string;
  contentName: string;
  contentType: 'image' | 'video';
  thumbnailUrl?: string;
}

interface TouchScrollDocDef {
  id: string;
  label: string;
  caption: string;
  pages: TouchScrollDocPage[];
  hasTranslation: boolean;
  translationLabel: string;
  translationCaption: string;
  translationPages: TouchScrollDocPage[];
}

interface TouchScrollTimelineItem {
  contentId: string;
  contentName: string;
  contentType: 'image' | 'video';
  thumbnailUrl?: string;
  duration: number;
  transition: string;
  documentIndex?: number;
  documentLabel?: string;
  documentCaption?: string;
  documentHasTranslation?: boolean;
  translationDocumentIndex?: number;
  isTranslationDocument?: boolean;
  translationForDocumentIndex?: number;
}

interface TouchScrollDocGroup {
  index: number;
  label: string;
  caption: string;
  pages: TouchScrollDocPage[];
  isTranslation: boolean;
  translationForIndex?: number;
  hasTranslation: boolean;
  translationDocumentIndex?: number;
}

function timelineItemsToDocs(items: TouchScrollTimelineItem[]): TouchScrollDocDef[] {
  const groups = new Map<number, TouchScrollDocGroup>();

  items.forEach((item) => {
    if (item.documentIndex === undefined || item.documentIndex === null) return;
    const docIndex = Number(item.documentIndex);
    if (Number.isNaN(docIndex)) return;

    const existing = groups.get(docIndex) || {
      index: docIndex,
      label: item.documentLabel || `Document ${docIndex + 1}`,
      caption: item.documentCaption || '',
      pages: [],
      isTranslation: Boolean(item.isTranslationDocument),
      translationForIndex: item.translationForDocumentIndex,
      hasTranslation: Boolean(item.documentHasTranslation),
      translationDocumentIndex: item.translationDocumentIndex,
    };

    existing.pages.push({
      contentId: item.contentId,
      contentName: item.contentName || `Page ${existing.pages.length + 1}`,
      contentType: item.contentType || 'image',
      thumbnailUrl: item.thumbnailUrl,
    });

    if (!existing.label && item.documentLabel) existing.label = item.documentLabel;
    if (!existing.caption && item.documentCaption) existing.caption = item.documentCaption;
    if (item.isTranslationDocument !== undefined) existing.isTranslation = Boolean(item.isTranslationDocument);
    if (item.translationForDocumentIndex !== undefined) existing.translationForIndex = Number(item.translationForDocumentIndex);
    if (item.documentHasTranslation !== undefined) existing.hasTranslation = Boolean(item.documentHasTranslation);
    if (item.translationDocumentIndex !== undefined) existing.translationDocumentIndex = Number(item.translationDocumentIndex);

    groups.set(docIndex, existing);
  });

  const orderedGroups = Array.from(groups.values()).sort((a, b) => a.index - b.index);
  const mainGroups = orderedGroups.filter((group) => !group.isTranslation);

  if (mainGroups.length === 0) return [];

  const docs: TouchScrollDocDef[] = [];
  mainGroups.forEach((group, idx) => {
    let translationGroup: TouchScrollDocGroup | undefined;
    if (group.translationDocumentIndex !== undefined) {
      translationGroup = groups.get(group.translationDocumentIndex);
    }
    if (!translationGroup) {
      translationGroup = orderedGroups.find((candidate) => {
        return candidate.isTranslation && candidate.translationForIndex === group.index;
      });
    }
    const hasTranslation = Boolean(translationGroup && translationGroup.pages.length > 0);

    docs.push({
      id: `doc-${group.index}-${idx}`,
      label: group.label || `Document ${idx + 1}`,
      caption: group.caption || '',
      pages: group.pages,
      hasTranslation: hasTranslation || group.hasTranslation,
      translationLabel: translationGroup?.label || `${group.label || `Document ${idx + 1}`} Translation`,
      translationCaption: translationGroup?.caption || '',
      translationPages: translationGroup?.pages || [],
    });
  });

  return docs;
}

function TouchScrollDocumentBuilder({
  config,
  onChange,
  contentItems,
  siteId,
}: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
  contentItems: Content[];
  siteId: string;
}) {
  const token = useAuthStore((s) => s.token);
  const queryClient = useQueryClient();
  const [pickerTarget, setPickerTarget] = useState<{ docIndex: number; variant: 'primary' | 'translation' } | null>(null);
  const [uploadTarget, setUploadTarget] = useState<{ docIndex: number; variant: 'primary' | 'translation' } | null>(null);
  const [uploading, setUploading] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null);

  const docsFromConfig = (config._documents as TouchScrollDocDef[] | undefined) || [];
  const timelineItems = ((config._timelineItems as TouchScrollTimelineItem[] | undefined) || []);
  const docs = docsFromConfig.length > 0 ? docsFromConfig : timelineItemsToDocs(timelineItems);

  const imageContent = contentItems.filter((item) => item.type === 'image');

  const setDocs = useCallback((newDocs: TouchScrollDocDef[]) => {
    const timeline: TouchScrollTimelineItem[] = [];
    let nextDocumentIndex = 0;

    newDocs.forEach((doc, docOrder) => {
      const primaryIndex = nextDocumentIndex;
      nextDocumentIndex += 1;

      const hasTranslationPages = Boolean(doc.hasTranslation && doc.translationPages.length > 0);
      const translationIndex = hasTranslationPages ? nextDocumentIndex : undefined;
      if (hasTranslationPages) nextDocumentIndex += 1;

      const primaryLabel = doc.label || `Document ${docOrder + 1}`;
      const primaryCaption = doc.caption || '';
      doc.pages.forEach((page) => {
        timeline.push({
          contentId: page.contentId,
          contentName: page.contentName,
          contentType: page.contentType,
          thumbnailUrl: page.thumbnailUrl,
          duration: 999,
          transition: 'none',
          documentIndex: primaryIndex,
          documentLabel: primaryLabel,
          documentCaption: primaryCaption,
          documentHasTranslation: hasTranslationPages,
          translationDocumentIndex: translationIndex,
          isTranslationDocument: false,
        });
      });

      if (hasTranslationPages && translationIndex !== undefined) {
        const translatedLabel = doc.translationLabel || `${primaryLabel} Translation`;
        const translatedCaption = doc.translationCaption || '';
        doc.translationPages.forEach((page) => {
          timeline.push({
            contentId: page.contentId,
            contentName: page.contentName,
            contentType: page.contentType,
            thumbnailUrl: page.thumbnailUrl,
            duration: 999,
            transition: 'none',
            documentIndex: translationIndex,
            documentLabel: translatedLabel,
            documentCaption: translatedCaption,
            isTranslationDocument: true,
            translationForDocumentIndex: primaryIndex,
          });
        });
      }
    });

    onChange({
      ...config,
      contentMode: 'documents',
      _documents: newDocs,
      _timelineItems: timeline,
    });
  }, [config, onChange]);

  const updateDoc = useCallback((index: number, updated: TouchScrollDocDef) => {
    const next = [...docs];
    next[index] = updated;
    setDocs(next);
  }, [docs, setDocs]);

  const removeDoc = useCallback((index: number) => {
    const next = [...docs];
    next.splice(index, 1);
    setDocs(next);
  }, [docs, setDocs]);

  const addDocument = useCallback(() => {
    const next: TouchScrollDocDef = {
      id: `touch-doc-${Date.now()}`,
      label: `Document ${docs.length + 1}`,
      caption: '',
      pages: [],
      hasTranslation: false,
      translationLabel: `Document ${docs.length + 1} Translation`,
      translationCaption: '',
      translationPages: [],
    };
    setDocs([...docs, next]);
  }, [docs, setDocs]);

  const addPagesToTarget = useCallback((target: { docIndex: number; variant: 'primary' | 'translation' }, pages: TouchScrollDocPage[]) => {
    const next = [...docs];
    const doc = next[target.docIndex];
    if (!doc) return;
    const existingIds = new Set(
      target.variant === 'primary'
        ? doc.pages.map((page) => page.contentId)
        : doc.translationPages.map((page) => page.contentId)
    );
    const uniquePages = pages.filter((page) => { return !existingIds.has(page.contentId); });

    if (target.variant === 'primary') {
      doc.pages = [...doc.pages, ...uniquePages];
    } else {
      doc.hasTranslation = true;
      doc.translationPages = [...doc.translationPages, ...uniquePages];
      if (!doc.translationLabel) {
        doc.translationLabel = `${doc.label || `Document ${target.docIndex + 1}`} Translation`;
      }
    }

    setDocs(next);
  }, [docs, setDocs]);

  const removePage = useCallback((docIndex: number, variant: 'primary' | 'translation', pageIndex: number) => {
    const next = [...docs];
    const doc = next[docIndex];
    if (!doc) return;

    if (variant === 'primary') {
      const pages = [...doc.pages];
      pages.splice(pageIndex, 1);
      doc.pages = pages;
    } else {
      const pages = [...doc.translationPages];
      pages.splice(pageIndex, 1);
      doc.translationPages = pages;
    }

    setDocs(next);
  }, [docs, setDocs]);

  const openUploadDialog = useCallback((docIndex: number, variant: 'primary' | 'translation') => {
    setUploadTarget({ docIndex, variant });
    uploadRef.current?.click();
  }, []);

  const handleUploadFiles = useCallback(async (files: FileList) => {
    if (!siteId || !uploadTarget || files.length === 0) return;
    setUploading(true);

    const uploadedPages: TouchScrollDocPage[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const baseName = file.name.replace(/\.[^.]+$/, '');
        const formData = new FormData();
        formData.append('file', file);
        formData.append('name', baseName);
        formData.append('site_id', siteId);

        const result = await new Promise<{ id: string; url: string; type: string; name: string }>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('POST', '/api/content?skip_app_refresh=true');
          if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
          xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve(JSON.parse(xhr.responseText).data);
            } else {
              reject(new Error('Upload failed'));
            }
          });
          xhr.addEventListener('error', () => reject(new Error('Network error')));
          xhr.send(formData);
        });

        uploadedPages.push({
          contentId: result.id,
          contentName: result.name || baseName,
          contentType: (result.type === 'video' ? 'video' : 'image') as 'image' | 'video',
          thumbnailUrl: result.url,
        });
      } catch {
        // Continue with remaining files.
      }
    }

    if (uploadedPages.length > 0) {
      addPagesToTarget(uploadTarget, uploadedPages);
      queryClient.invalidateQueries({ queryKey: ['content', siteId] });
    }

    setUploading(false);
    setUploadTarget(null);
    if (uploadRef.current) uploadRef.current.value = '';
  }, [siteId, uploadTarget, token, queryClient, addPagesToTarget]);

  const renderPageRows = (
    pages: TouchScrollDocPage[],
    docIndex: number,
    variant: 'primary' | 'translation'
  ) => {
    if (pages.length === 0) {
      return (
        <div className="text-sm text-surface-400 bg-surface-50 rounded-xl p-3 border border-dashed border-surface-200">
          No pages yet.
        </div>
      );
    }

    return (
      <div className="space-y-1.5">
        {pages.map((page, pageIndex) => (
          <div
            key={`${page.contentId}-${pageIndex}`}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface-50 border border-surface-100"
          >
            <div className="h-10 w-10 rounded-lg bg-surface-200 overflow-hidden shrink-0">
              {page.thumbnailUrl && (
                <img src={page.thumbnailUrl} alt="" className="w-full h-full object-cover" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm text-surface-700 truncate">{page.contentName}</div>
              <div className="text-[10px] text-surface-400 uppercase tracking-wider">Page {pageIndex + 1}</div>
            </div>
            <button
              type="button"
              onClick={() => removePage(docIndex, variant, pageIndex)}
              className="p-1 text-red-400 hover:text-red-600 transition-colors"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-indigo-50 border border-indigo-100 p-3 text-sm text-indigo-700">
        Add documents for the touch-scroll screen. For each document, enable
        <strong> translation</strong> if it has a translated version, then add pages for that second document.
      </div>

      {docs.length === 0 ? (
        <div className="text-center py-8 text-surface-400 bg-surface-50 rounded-2xl border-2 border-dashed border-surface-200">
          <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <div className="text-sm font-medium">No documents yet</div>
          <div className="text-xs mt-1">Add your first document below</div>
        </div>
      ) : (
        <div className="space-y-3">
          {docs.map((doc, docIndex) => (
            <div key={doc.id} className="border border-surface-200 rounded-2xl bg-white overflow-hidden">
              <div className="px-4 py-3 bg-surface-50 border-b border-surface-100 flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
                  <FileText className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-surface-800 truncate">{doc.label || `Document ${docIndex + 1}`}</div>
                </div>
                <button
                  type="button"
                  onClick={() => removeDoc(docIndex)}
                  className="p-1.5 text-red-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="p-4 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={LABEL_CLS}>Document Name</label>
                    <input
                      type="text"
                      value={doc.label}
                      onChange={(e) => updateDoc(docIndex, { ...doc, label: e.target.value })}
                      placeholder={`Document ${docIndex + 1}`}
                      className={INPUT_CLS}
                    />
                    <p className="text-xs text-surface-500 mt-1">{BOLD_HINT_TEXT}</p>
                  </div>
                  <div>
                    <label className={LABEL_CLS}>Caption</label>
                    <input
                      type="text"
                      value={doc.caption}
                      onChange={(e) => updateDoc(docIndex, { ...doc, caption: e.target.value })}
                      placeholder="Optional caption"
                      className={INPUT_CLS}
                    />
                    <p className="text-xs text-surface-500 mt-1">{BOLD_HINT_TEXT}</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className={LABEL_CLS}>Pages</label>
                  {renderPageRows(doc.pages, docIndex, 'primary')}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setPickerTarget({ docIndex, variant: 'primary' })}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-surface-200 text-sm font-medium text-surface-500 hover:text-primary-600 hover:border-primary-300 transition-colors"
                    >
                      <Plus className="h-4 w-4" /> Add from Library
                    </button>
                    <button
                      type="button"
                      disabled={uploading}
                      onClick={() => openUploadDialog(docIndex, 'primary')}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 border-dashed border-surface-200 text-sm font-medium text-surface-500 hover:text-emerald-600 hover:border-emerald-300 transition-colors disabled:opacity-50"
                    >
                      {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                      Upload
                    </button>
                  </div>
                </div>

                <div className="pt-1">
                  <label className="inline-flex items-center gap-2 text-sm text-surface-700">
                    <input
                      type="checkbox"
                      checked={doc.hasTranslation}
                      onChange={(e) => updateDoc(docIndex, { ...doc, hasTranslation: e.target.checked })}
                    />
                    This document has translation
                  </label>
                </div>

                {doc.hasTranslation && (
                  <div className="border border-amber-200 rounded-xl bg-amber-50/40 p-3 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className={LABEL_CLS}>Translation Name</label>
                        <input
                          type="text"
                          value={doc.translationLabel}
                          onChange={(e) => updateDoc(docIndex, { ...doc, translationLabel: e.target.value })}
                          placeholder={`${doc.label || `Document ${docIndex + 1}`} Translation`}
                          className={INPUT_CLS}
                        />
                        <p className="text-xs text-surface-500 mt-1">{BOLD_HINT_TEXT}</p>
                      </div>
                      <div>
                        <label className={LABEL_CLS}>Translation Caption</label>
                        <input
                          type="text"
                          value={doc.translationCaption}
                          onChange={(e) => updateDoc(docIndex, { ...doc, translationCaption: e.target.value })}
                          placeholder="Optional translation caption"
                          className={INPUT_CLS}
                        />
                        <p className="text-xs text-surface-500 mt-1">{BOLD_HINT_TEXT}</p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className={LABEL_CLS}>Translation Pages</label>
                      {renderPageRows(doc.translationPages, docIndex, 'translation')}
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setPickerTarget({ docIndex, variant: 'translation' })}
                          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-surface-200 text-sm font-medium text-surface-500 hover:text-primary-600 hover:border-primary-300 transition-colors"
                        >
                          <Plus className="h-4 w-4" /> Add Translation Pages
                        </button>
                        <button
                          type="button"
                          disabled={uploading}
                          onClick={() => openUploadDialog(docIndex, 'translation')}
                          className="flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 border-dashed border-surface-200 text-sm font-medium text-surface-500 hover:text-emerald-600 hover:border-emerald-300 transition-colors disabled:opacity-50"
                        >
                          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                          Upload
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={addDocument}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-surface-200 text-sm font-medium text-surface-500 hover:text-indigo-600 hover:border-indigo-300 transition-colors"
      >
        <Plus className="h-4 w-4" /> Add Document
      </button>

      <input
        ref={uploadRef}
        type="file"
        multiple
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            handleUploadFiles(e.target.files);
          }
        }}
      />

      {pickerTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setPickerTarget(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-[520px] max-h-[70vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-surface-200">
              <h3 className="font-semibold text-surface-800">
                {pickerTarget.variant === 'translation' ? 'Add Translation Pages' : 'Add Pages'}
              </h3>
              <p className="text-xs text-surface-400 mt-1">Select images to add to this document.</p>
            </div>
            <SearchableContentMultiPicker
              selectedIds={[]}
              onChange={(ids) => {
                const selected = ids.map((contentId) => {
                  const content = contentItems.find((item) => item.id === contentId);
                  return {
                    contentId,
                    contentName: content?.name || 'Unknown',
                    contentType: (content?.type === 'video' ? 'video' : 'image') as 'image' | 'video',
                    thumbnailUrl: content?.url,
                  };
                });
                addPagesToTarget(pickerTarget, selected);
                setPickerTarget(null);
              }}
              contentItems={imageContent}
              label=""
            />
            <div className="px-5 py-3 border-t border-surface-200 flex justify-end">
              <button
                type="button"
                onClick={() => setPickerTarget(null)}
                className="px-4 py-2 text-sm font-medium text-surface-600 hover:text-surface-800 transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function getTouchScrollSections(mode: TouchScrollContentMode): SectionDef[] {
  return [
    { id: mode === 'documents' ? 'documents' : 'timeline', title: 'Content', color: '#4f46e5' },
    { id: 'display', title: 'Display', color: '#7c3aed' },
    { id: 'scroll', title: 'Scroll', color: '#2563eb' },
    { id: 'idle', title: 'Idle Screen', color: '#0891b2' },
  ];
}

export function TouchScrollConfig({ config, onChange, siteId }: ConfigPanelProps) {
  const { checkboxField, numberField } = useFieldHelpers(config, onChange);
  const { contentItems, images, videos } = useConfigData(siteId);

  const set = (key: string, value: unknown) => onChange({ ...config, [key]: value });
  const timelineItems = (config._timelineItems as TouchScrollTimelineItem[] | undefined) || [];
  const hasDocumentMetadata = timelineItems.some((item) => {
    return item.documentIndex !== undefined && item.documentIndex !== null;
  });
  const mode = ((config.contentMode as TouchScrollContentMode | undefined)
    || ((config._documents as TouchScrollDocDef[] | undefined)?.length ? 'documents' : undefined)
    || (hasDocumentMetadata ? 'documents' : 'timeline')) as TouchScrollContentMode;
  const sections = getTouchScrollSections(mode);

  return (
    <ConfigPageLayout sections={sections}>

      <ConfigSection
        id={mode === 'documents' ? 'documents' : 'timeline'}
        title="Content"
        accentColor="#4f46e5"
        description="Choose timeline mode or document mode with optional translations"
      >
        <div className="space-y-4">
          <SegmentedControl
            label="Content Mode"
            value={mode}
            options={[
              { value: 'documents', label: 'Documents' },
              { value: 'timeline', label: 'Timeline' },
            ]}
            onChange={(next) => set('contentMode', next)}
          />

          {mode === 'documents' ? (
            <TouchScrollDocumentBuilder
              config={config}
              onChange={onChange}
              contentItems={contentItems}
              siteId={siteId}
            />
          ) : (
            <SlideshowTimeline config={config} onChange={onChange} contentItems={contentItems} siteId={siteId} />
          )}
        </div>
      </ConfigSection>

      {/* Display */}
      <ConfigSection id="display" title="Display" accentColor="#7c3aed"
        description="Fit mode and background color">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={LABEL_CLS}>Fit Mode</label>
            <select
              value={(config.fit as string) || 'contain'}
              onChange={(e) => set('fit', e.target.value)}
              className={INPUT_CLS}
            >
              {FIT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
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

      {/* Scroll Behavior */}
      <ConfigSection id="scroll" title="Scroll Behavior" accentColor="#2563eb"
        description="Auto-scroll and inactivity reset settings">
        <div className="space-y-4">
          {checkboxField('autoScroll', 'Auto Scroll')}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {!!config.autoScroll && numberField('autoScrollSpeed', 'Auto-Scroll Speed (px/sec)')}
            {numberField('inactivityTimeout', 'Inactivity Timeout (sec)')}
          </div>
          {checkboxField('resetToFirstFrame', 'Reset to first frame on inactivity')}
        </div>
      </ConfigSection>

      {/* Idle */}
      <ConfigSection id="idle" title="Idle Screen" accentColor="#0891b2"
        description="Attract screen shown when user stops scrolling">
        <IdleScreenToggle config={config} onChange={onChange} images={images} videos={videos} siteId={siteId} />
      </ConfigSection>

    </ConfigPageLayout>
  );
}

// ==========================================
// Multi-Screen
// ==========================================

const MULTI_SECTIONS: SectionDef[] = [
  { id: 'screen-setup', title: 'Screen Setup', color: '#4f46e5' },
  { id: 'content', title: 'Content', color: '#c2185b' },
  { id: 'display', title: 'Display', color: '#7c3aed' },
];

export function MultiScreenConfig({ config, onChange, siteId }: ConfigPanelProps) {
  const { numberField } = useFieldHelpers(config, onChange);
  const { exhibitions, videos, images } = useConfigData(siteId);

  const set = (key: string, value: unknown) => onChange({ ...config, [key]: value });
  const contentType = (config.contentType as string) || 'video';

  return (
    <ConfigPageLayout sections={MULTI_SECTIONS}>

      {/* Screen Setup */}
      <ConfigSection id="screen-setup" title="Screen Setup" accentColor="#4f46e5"
        description="Exhibition and screen index configuration">
        <div className="space-y-4">
          <ExhibitionPicker configKey="exhibitId" label="Exhibition" exhibitions={exhibitions} config={config} onChange={onChange} />
          <div className="grid grid-cols-2 gap-4">
            {numberField('screenIndex', 'Screen Index')}
            {numberField('totalScreens', 'Total Screens')}
          </div>
        </div>
      </ConfigSection>

      {/* Content */}
      <ConfigSection id="content" title="Content" accentColor="#c2185b"
        description="Media to display on this screen">
        <div className="space-y-4">
          <SegmentedControl
            label="Content Type"
            value={contentType}
            options={CONTENT_TYPE_OPTIONS}
            onChange={(v) => set('contentType', v)}
          />
          {contentType === 'video' && contentPicker('videoUrl', 'Video', videos, 'Select a video...', config, onChange, siteId, 'video/*')}
          {contentType === 'image' && contentPicker('imageUrl', 'Image', images, 'Select an image...', config, onChange, siteId, 'image/*')}
        </div>
      </ConfigSection>

      {/* Display */}
      <ConfigSection id="display" title="Display" accentColor="#7c3aed"
        description="Fit and background color">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={LABEL_CLS}>Fit</label>
            <select
              value={(config.fit as string) || 'cover'}
              onChange={(e) => set('fit', e.target.value)}
              className={INPUT_CLS}
            >
              {FIT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
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

    </ConfigPageLayout>
  );
}

// ==========================================
// Diagnostics
// ==========================================

export function DiagnosticsConfig() {
  return (
    <div className="bg-white rounded-2xl border border-surface-200 p-8 text-center" style={{ borderLeft: '3px solid #475569' }}>
      <div className="h-12 w-12 rounded-xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
        <div className="h-3 w-3 rounded-full bg-slate-400" />
      </div>
      <h3 className="text-sm font-bold text-surface-900 mb-1">Diagnostics Mode</h3>
      <p className="text-sm text-surface-500">No additional configuration required.</p>
      <p className="text-xs text-surface-400 mt-1">This template runs device health monitoring automatically.</p>
    </div>
  );
}
