import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, useRef, useCallback, useEffect, memo, type ReactNode } from 'react';
import { Upload, Loader2, Check } from 'lucide-react';
import clsx from 'clsx';
import { api } from '../../lib/api';
import { ContentPickerModal } from '../ContentPickerModal';
import { SearchableContentPicker, SearchableContentMultiPicker } from '../SearchableContentPicker';
import { useAuthStore } from '../../stores/auth';
import type { Content } from '../../lib/types';

// ==========================================
// Styles
// ==========================================

export const INPUT_CLS =
  'h-10 w-full px-3.5 rounded-xl border border-surface-200 card-bg text-sm text-surface-800 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400 transition-all';
export const LABEL_CLS = 'block text-sm font-semibold text-surface-700 mb-1.5';

// ==========================================
// Shared props for all template config panels
// ==========================================

export interface ConfigPanelProps {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
  siteId: string;
}

// ==========================================
// Data hooks — shared across all config panels
// ==========================================

export function useConfigData(siteId: string, template?: string, config?: Record<string, unknown>) {
  const { data: contentItems = [] } = useQuery({
    queryKey: ['content', siteId],
    queryFn: () => api.get<Content[]>(`/content?site_id=${siteId}`),
    enabled: !!siteId,
  });

  const existingPlaylistId = (config?.playlistId as string) || '';
  const { data: playlistDetail } = useQuery({
    queryKey: ['playlist-detail', existingPlaylistId],
    queryFn: () => api.get<{ items: Array<{ contentId: string }> }>(`/playlists/${existingPlaylistId}`),
    enabled: !!existingPlaylistId && !!template && ['media-explorer', 'app06-media-browser'].includes(template),
  });

  const videos = contentItems.filter((c) => c.type === 'video');
  const images = contentItems.filter((c) => c.type === 'image');

  return { contentItems, videos, images, playlistDetail };
}

// ==========================================
// Field builder helpers
// ==========================================

export function useFieldHelpers(config: Record<string, unknown>, onChange: (config: Record<string, unknown>) => void) {
  const set = (key: string, value: unknown) => onChange({ ...config, [key]: value });

  const textField = (key: string, label: string, opts?: { mono?: boolean; placeholder?: string }) => (
    <div key={key}>
      <label className={LABEL_CLS}>{label}</label>
      <input
        type="text"
        value={(config[key] as string) || ''}
        onChange={(e) => set(key, e.target.value)}
        placeholder={opts?.placeholder}
        className={`${INPUT_CLS} ${opts?.mono ? 'font-mono' : ''}`}
      />
    </div>
  );

  const numberField = (key: string, label: string, opts?: { min?: number; max?: number }) => (
    <div key={key}>
      <label className={LABEL_CLS}>{label}</label>
      <input
        type="number"
        value={config[key] as number ?? ''}
        onChange={(e) => set(key, e.target.value === '' ? '' : Number(e.target.value))}
        min={opts?.min}
        max={opts?.max}
        className={`${INPUT_CLS} max-w-[220px]`}
      />
    </div>
  );

  const selectField = (key: string, label: string, options: { value: string; label: string }[]) => (
    <div key={key}>
      <label className={LABEL_CLS}>{label}</label>
      <select
        value={(config[key] as string) || ''}
        onChange={(e) => set(key, e.target.value)}
        className={INPUT_CLS}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );

  const checkboxField = (key: string, label: string) => (
    <label key={key} className="flex items-center gap-3 cursor-pointer group py-0.5">
      <div className={clsx(
        'h-5 w-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all',
        config[key]
          ? 'bg-primary-600 border-primary-600'
          : 'border-surface-300 group-hover:border-primary-400',
      )}>
        <input
          type="checkbox"
          checked={!!config[key]}
          onChange={(e) => set(key, e.target.checked)}
          className="sr-only"
        />
        {!!config[key] && (
          <svg className="h-3 w-3 text-white" viewBox="0 0 12 12" fill="none">
            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>
      <span className="text-sm font-medium text-surface-700 group-hover:text-surface-900 transition-colors">{label}</span>
    </label>
  );

  const note = (text: string) => (
    <p className="text-xs text-surface-500 bg-surface-50 border border-surface-100 rounded-lg px-3 py-2 leading-relaxed">{text}</p>
  );

  return { set, textField, numberField, selectField, checkboxField, note };
}

// ==========================================
// Content picker — select from uploaded media
// ==========================================

export function ContentPicker({ configKey, label, items, emptyLabel, config, onChange, siteId, accept }: {
  configKey: string;
  label: string;
  items: Content[];
  emptyLabel: string;
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
  siteId?: string;
  accept?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);
  const token = useAuthStore((s) => s.token);
  const queryClient = useQueryClient();

  const handleUpload = async (file: File) => {
    if (!siteId) return;
    setUploading(true);
    try {
      const baseName = file.name.replace(/\.[^.]+$/, '');
      const appName = (config._appName as string) || '';
      const prefix = appName ? `${appName}-` : '';
      const autoName = `${prefix}${baseName}`;

      const formData = new FormData();
      formData.append('file', file);
      formData.append('name', autoName);
      formData.append('site_id', siteId);

      const result = await new Promise<{ url: string }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/content?skip_app_refresh=true');
        if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            const json = JSON.parse(xhr.responseText);
            resolve(json.data);
          } else {
            try {
              const json = JSON.parse(xhr.responseText);
              reject(new Error(json.error || 'Upload failed'));
            } catch {
              reject(new Error('Upload failed'));
            }
          }
        });
        xhr.addEventListener('error', () => reject(new Error('Network error')));
        xhr.send(formData);
      });

      onChange({ ...config, [configKey]: result.url });
      queryClient.invalidateQueries({ queryKey: ['content', siteId] });
      setDone(true);
      setTimeout(() => setDone(false), 2000);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className={LABEL_CLS + ' !mb-0'}>{label}</label>
        {siteId && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-primary-600 hover:text-primary-700 border border-primary-200 rounded-lg hover:border-primary-300 transition-colors disabled:opacity-50"
            >
              {uploading ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Uploading...</>
              ) : done ? (
                <><Check className="h-4 w-4 text-emerald-500" /> Uploaded</>
              ) : (
                <><Upload className="h-4 w-4" /> Upload</>
              )}
            </button>
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              accept={accept || 'audio/*,video/*,image/*'}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleUpload(f);
              }}
            />
          </div>
        )}
      </div>
      <SearchableContentPicker
        label=""
        value={(config[configKey] as string) || ''}
        onChange={(url) => onChange({ ...config, [configKey]: url })}
        items={items}
        placeholder={emptyLabel}
      />
    </div>
  );
}

// Inline function version for quick use
export function contentPicker(
  key: string, label: string, items: Content[], emptyLabel: string,
  config: Record<string, unknown>, onChange: (c: Record<string, unknown>) => void,
  siteId?: string, accept?: string,
) {
  return (
    <ContentPicker
      configKey={key} label={label} items={items}
      emptyLabel={emptyLabel} config={config} onChange={onChange}
      siteId={siteId} accept={accept}
    />
  );
}

// ==========================================
// Content multi-select checklist
// ==========================================

export function ContentMultiSelect({ label, contentItems, config, onChange }: {
  label: string;
  contentItems: Content[];
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const selectedIds = (config._selectedContentIds as string[]) || [];

  return (
    <SearchableContentMultiPicker
      label={label}
      contentItems={contentItems}
      selectedIds={selectedIds}
      onChange={(ids) => onChange({ ...config, _selectedContentIds: ids })}
    />
  );
}

// ==========================================
// Idle screen toggle + picker
// ==========================================

export function IdleScreenToggle({ config, onChange, images, videos, siteId }: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
  images: Content[];
  videos: Content[];
  siteId?: string;
}) {
  const hasIdleEnabled = config.idle !== null && config.idle !== undefined;

  const toggleIdle = (enabled: boolean) => {
    if (enabled) {
      onChange({ ...config, idle: { type: 'image', url: '', transitionDuration: 1000 } });
    } else {
      onChange({ ...config, idle: null });
    }
  };

  return (
    <div>
      <label className="flex items-center gap-3 cursor-pointer mb-4 group">
        <div className={clsx(
          'h-5 w-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all',
          hasIdleEnabled
            ? 'bg-primary-600 border-primary-600'
            : 'border-surface-300 group-hover:border-primary-400',
        )}>
          <input
            type="checkbox"
            checked={hasIdleEnabled}
            onChange={(e) => toggleIdle(e.target.checked)}
            className="sr-only"
          />
          {hasIdleEnabled && (
            <svg className="h-3 w-3 text-white" viewBox="0 0 12 12" fill="none">
              <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </div>
        <span className="text-sm font-semibold text-surface-700 group-hover:text-surface-900 transition-colors">Enable Idle / Attract Screen</span>
      </label>
      {hasIdleEnabled && (
        <IdleScreenPicker config={config} onChange={onChange} images={images} videos={videos} siteId={siteId} />
      )}
    </div>
  );
}

function IdleScreenPicker({ config, onChange, images, videos, siteId }: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
  images: Content[];
  videos: Content[];
  siteId?: string;
}) {
  const idleConfig = (config.idle as { type?: string; url?: string } | undefined) || {};
  const idleUrl = idleConfig.url || '';
  const allMedia = [...images, ...videos];

  const setIdle = (url: string) => {
    const type = url.endsWith('.mp4') || url.endsWith('.webm') ? 'video' : 'image';
    onChange({ ...config, idle: { type, url, transitionDuration: 1000 } });
  };

  // Wrap in a config-like object so ContentPicker can set it
  const idleAsConfig = { ...config, _idle_url: idleUrl } as Record<string, unknown>;

  return (
    <div className="space-y-3 mt-1">
      <p className="text-xs text-surface-500 bg-surface-50 border border-surface-100 rounded-lg px-3 py-2 leading-relaxed">
        Shown when nobody is interacting. Click or touch to dismiss.
      </p>
      <ContentPicker
        configKey="_idle_url"
        label="Idle / Attract Screen"
        items={allMedia}
        emptyLabel="Select an attract image or video..."
        config={idleAsConfig}
        onChange={(newCfg) => {
          const newUrl = (newCfg._idle_url as string) || '';
          setIdle(newUrl);
        }}
        siteId={siteId}
        accept="image/*,video/*"
      />
    </div>
  );
}

// ==========================================
// Slideshow timeline editor
// ==========================================

interface TimelineItem {
  contentId: string;
  contentName: string;
  contentType: 'image' | 'video';
  thumbnailUrl?: string;
  caption?: string;
  duration: number;
  transition: string;
}

// ==========================================
// Lazy thumbnail with in-memory cache
// ==========================================

const thumbCache = new Map<string, string>(); // src → objectURL or original src

const LazyThumb = memo(function LazyThumb({ src, alt }: { src: string; alt?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(thumbCache.get(src) ?? null);
  const [visible, setVisible] = useState(false);

  // IntersectionObserver — only start loading when scrolled into view
  useEffect(() => {
    const el = containerRef.current;
    if (!el || blobUrl) return;          // already cached, skip
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect(); } },
      { rootMargin: '100px' },           // start 100px before visible
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [blobUrl]);

  // Fetch + cache once visible
  useEffect(() => {
    if (!visible || blobUrl) return;
    let cancelled = false;
    fetch(src)
      .then((r) => r.blob())
      .then((blob) => {
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        thumbCache.set(src, url);
        setBlobUrl(url);
      })
      .catch(() => {
        // fallback: use original src directly
        if (!cancelled) { thumbCache.set(src, src); setBlobUrl(src); }
      });
    return () => { cancelled = true; };
  }, [visible, src, blobUrl]);

  return (
    <div ref={containerRef} className="w-full h-full">
      {blobUrl ? (
        <img src={blobUrl} alt={alt || ''} className="w-full h-full object-cover" decoding="async" />
      ) : (
        <div className="w-full h-full bg-surface-200 animate-pulse" />
      )}
    </div>
  );
});

const TRANS_OPTS = [
  { value: 'fade', label: 'Fade' },
  { value: 'slide-left', label: 'Slide Left' },
  { value: 'slide-right', label: 'Slide Right' },
  { value: 'dissolve', label: 'Dissolve' },
  { value: 'none', label: 'None' },
];

const TimelineRow = memo(function TimelineRow({ item, idx, total, onMove, onUpdate, onRemove, onInsert }: {
  item: TimelineItem;
  idx: number;
  total: number;
  onMove: (from: number, to: number) => void;
  onUpdate: (index: number, field: string, value: unknown) => void;
  onRemove: (index: number) => void;
  onInsert: (index: number) => void;
}) {
  return (
    <div>
      {idx > 0 && (
        <div className="flex justify-center py-1 border-t border-surface-100">
          <button type="button" onClick={() => onInsert(idx)}
            className="text-sm text-surface-400 hover:text-primary-600 px-3 py-0.5" title="Insert item here">
            + insert
          </button>
        </div>
      )}
      <div className="flex items-center gap-3 px-4 py-3 hover:bg-surface-50 border-t border-surface-100 first:border-t-0">
        <div className="flex flex-col gap-1 shrink-0">
          <button type="button" onClick={() => onMove(idx, idx - 1)} disabled={idx === 0}
            className="text-surface-400 hover:text-surface-600 disabled:opacity-30 text-xs leading-none" title="Move up">▲</button>
          <button type="button" onClick={() => onMove(idx, idx + 1)} disabled={idx === total - 1}
            className="text-surface-400 hover:text-surface-600 disabled:opacity-30 text-xs leading-none" title="Move down">▼</button>
        </div>
        <span className="text-sm text-surface-400 w-5 text-center shrink-0">{idx + 1}</span>
        <div className="w-12 h-12 rounded-lg overflow-hidden bg-surface-100 shrink-0 flex items-center justify-center">
          {item.contentType === 'video' ? (
            <div className="w-full h-full bg-surface-200 flex items-center justify-center">
              <svg className="h-4 w-4 text-surface-400" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            </div>
          ) : item.thumbnailUrl ? (
            <LazyThumb src={item.thumbnailUrl} />
          ) : (
            <div className="w-full h-full bg-surface-200 flex items-center justify-center">
              <svg className="h-4 w-4 text-surface-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-base text-surface-700 truncate block">{item.contentName}</span>
          <span className="text-sm text-surface-400">{item.contentType}</span>
          {item.contentType === 'image' && (
            <input
              type="text"
              value={item.caption || ''}
              onChange={(e) => onUpdate(idx, 'caption', e.target.value)}
              placeholder="Add caption (use *text* for bold)"
              className="mt-2 h-8 w-full px-2.5 rounded-lg border border-surface-300 bg-surface-50 text-sm text-surface-700 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
              title="Caption (use *text* for bold)"
            />
          )}
        </div>
        <input type="number" value={item.duration} onChange={(e) => onUpdate(idx, 'duration', Number(e.target.value) || 1)}
          min={1} max={300} className="h-9 w-18 px-2 rounded-lg border border-surface-300 bg-surface-50 text-sm text-surface-700 text-center focus:outline-none focus:ring-2 focus:ring-primary-500/30" title="Duration (sec)" />
        <span className="text-sm text-surface-400 shrink-0">sec</span>
        <select value={item.transition} onChange={(e) => onUpdate(idx, 'transition', e.target.value)}
          className="h-9 w-28 px-2 rounded-lg border border-surface-300 bg-surface-50 text-sm text-surface-600 focus:outline-none focus:ring-2 focus:ring-primary-500/30" title="Transition">
          {TRANS_OPTS.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
        </select>
        <button type="button" onClick={() => onRemove(idx)} className="p-1.5 text-surface-400 hover:text-red-500 transition-colors shrink-0" title="Remove">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>
    </div>
  );
});

export function SlideshowTimeline({ config, onChange, contentItems, siteId }: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
  contentItems: Content[];
  siteId?: string;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerInsertIndex, setPickerInsertIndex] = useState(-1);
  const uploadRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const token = useAuthStore((s) => s.token);
  const queryClient = useQueryClient();

  const items: TimelineItem[] = (config._timelineItems as TimelineItem[]) || [];
  const defaultDur = (config.defaultDuration as number) || 8;
  const defaultTrans = (config.transition as string) || 'fade';

  const setItems = useCallback((newItems: TimelineItem[]) => {
    onChange({ ...config, _timelineItems: newItems });
  }, [config, onChange]);

  const addItems = (contentIds: string[]) => {
    const newItems = contentIds.map((cId) => {
      const content = contentItems.find((c) => c.id === cId);
      return {
        contentId: cId,
        contentName: content ? content.name : 'Unknown',
        contentType: (content ? content.type : 'image') as 'image' | 'video',
        thumbnailUrl: content ? content.url : undefined,
        caption: '',
        duration: defaultDur,
        transition: defaultTrans,
      };
    });
    setItems([...items, ...newItems]);
  };

  const removeItem = useCallback((index: number) => {
    setItems(items.filter((_, i) => i !== index));
  }, [items, setItems]);

  const updateItem = useCallback((index: number, field: string, value: unknown) => {
    setItems(items.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
  }, [items, setItems]);

  const moveItem = useCallback((from: number, to: number) => {
    if (to < 0 || to >= items.length) return;
    const newItems = [...items];
    const [moved] = newItems.splice(from, 1);
    newItems.splice(to, 0, moved);
    setItems(newItems);
  }, [items, setItems]);

  const handleInsert = useCallback((index: number) => {
    setPickerInsertIndex(index);
    setPickerOpen(true);
  }, []);

  // Inline upload handler — uploads files and adds them to timeline
  const handleUploadFiles = async (files: FileList) => {
    if (!siteId || files.length === 0) return;
    setUploading(true);
    const appName = (config._appName as string) || '';
    const newTimelineItems: TimelineItem[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const baseName = file.name.replace(/\.[^.]+$/, '');
        const prefix = appName ? `${appName}-` : '';
        const autoName = `${prefix}${baseName}`;

        const formData = new FormData();
        formData.append('file', file);
        formData.append('name', autoName);
        formData.append('site_id', siteId);

        const result = await new Promise<{ id: string; url: string; type: string; name: string }>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('POST', '/api/content?skip_app_refresh=true');
          if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
          xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              const json = JSON.parse(xhr.responseText);
              resolve(json.data);
            } else {
              try {
                const json = JSON.parse(xhr.responseText);
                reject(new Error(json.error || 'Upload failed'));
              } catch {
                reject(new Error('Upload failed'));
              }
            }
          });
          xhr.addEventListener('error', () => reject(new Error('Network error')));
          xhr.send(formData);
        });

        const contentType = (result.type === 'video' ? 'video' : 'image') as 'image' | 'video';
        newTimelineItems.push({
          contentId: result.id,
          contentName: result.name || autoName,
          contentType,
          thumbnailUrl: result.url,
          caption: '',
          duration: defaultDur,
          transition: defaultTrans,
        });
      } catch (err) {
        alert(`Failed to upload ${file.name}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    if (newTimelineItems.length > 0) {
      setItems([...items, ...newTimelineItems]);
      queryClient.invalidateQueries({ queryKey: ['content', siteId] });
    }
    setUploading(false);
    if (uploadRef.current) uploadRef.current.value = '';
  };

  return (
    <div>
      <label className={LABEL_CLS}>Timeline</label>
      <div className="border border-surface-200 rounded-xl max-h-[420px] overflow-y-auto">
        {items.length === 0 && (
          <div className="px-4 py-8 text-center text-base text-surface-400">
            No items in timeline. Click &quot;Add Content&quot; to pick existing media, or &quot;Upload Files&quot; to upload and add directly.
          </div>
        )}
        {items.map((item, idx) => (
          <TimelineRow
            key={`${item.contentId}-${idx}`}
            item={item}
            idx={idx}
            total={items.length}
            onMove={moveItem}
            onUpdate={updateItem}
            onRemove={removeItem}
            onInsert={handleInsert}
          />
        ))}
      </div>

      <div className="flex items-center gap-3 mt-3">
        <button type="button" onClick={() => { setPickerInsertIndex(-1); setPickerOpen(true); }}
          className="h-9 px-4 rounded-xl border border-surface-300 text-sm font-medium text-surface-600 hover:bg-surface-50 inline-flex items-center gap-1.5">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
          Add Content
        </button>
        {siteId && (
          <>
            <button type="button" disabled={uploading} onClick={() => uploadRef.current?.click()}
              className="h-9 px-4 rounded-xl border border-primary-200 text-sm font-medium text-primary-600 hover:bg-primary-50 hover:border-primary-300 inline-flex items-center gap-1.5 disabled:opacity-50">
              {uploading ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Uploading...</>
              ) : (
                <><Upload className="h-4 w-4" /> Upload Files</>
              )}
            </button>
            <input
              ref={uploadRef}
              type="file"
              multiple
              className="hidden"
              accept="image/*,video/*"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) handleUploadFiles(e.target.files);
              }}
            />
          </>
        )}
      </div>

      {items.length > 0 && (
        <p className="text-sm text-surface-400 mt-2">
          {items.length} item{items.length === 1 ? '' : 's'} — total {items.reduce((s, i) => s + i.duration, 0)}s
        </p>
      )}

      {pickerOpen && (
        <ContentPickerModal
          contentItems={contentItems}
          onConfirm={(ids) => {
            if (pickerInsertIndex >= 0) {
              const newItems = ids.map((cId) => {
                const content = contentItems.find((c) => c.id === cId);
                return {
                  contentId: cId,
                  contentName: content ? content.name : 'Unknown',
                  contentType: (content ? content.type : 'image') as 'image' | 'video',
                  thumbnailUrl: content ? content.url : undefined,
                  caption: '',
                  duration: defaultDur,
                  transition: defaultTrans,
                };
              });
              const arr = [...items];
              arr.splice(pickerInsertIndex, 0, ...newItems);
              setItems(arr);
            } else {
              addItems(ids);
            }
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}


// ==========================================
// Common option sets
// ==========================================

export const FIT_OPTIONS = [
  { value: 'contain', label: 'Contain' },
  { value: 'cover', label: 'Cover' },
  { value: 'fill', label: 'Fill' },
];

export const ORIENTATION_OPTIONS = [
  { value: 'landscape', label: 'Landscape' },
  { value: 'portrait', label: 'Portrait' },
];

export const TRANSITION_OPTIONS = [
  { value: 'fade', label: 'Fade' },
  { value: 'dissolve', label: 'Dissolve' },
  { value: 'slide', label: 'Slide' },
  { value: 'none', label: 'None' },
];

// ==========================================
// Layout: Two-column config page
// ==========================================

export interface SectionDef {
  id: string;
  title: string;
  color?: string;
}

export function ConfigPageLayout({
  sections,
  children,
}: {
  sections: SectionDef[];
  children: ReactNode;
}) {
  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    const y = el.getBoundingClientRect().top + window.scrollY - 84;
    window.scrollTo({ top: y, behavior: 'smooth' });
  };

  return (
    <div className="flex gap-5 items-start">
      {/* Sticky section nav — desktop only */}
      <div className="hidden lg:block w-[168px] shrink-0 sticky top-[80px]">
        <div className="bryzos-card rounded-2xl overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[var(--glass-border)]">
            <p className="text-[10px] font-bold text-surface-400 uppercase tracking-widest leading-none">Sections</p>
          </div>
          <nav className="py-1">
            {sections.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => scrollTo(s.id)}
                className="flex items-center gap-2.5 w-full px-4 py-2.5 text-left text-surface-500 hover:text-surface-900 hover:bg-[var(--glass-bg-hover)] transition-colors"
              >
                <span
                  className="h-2 w-2 rounded-full shrink-0"
                  style={{ background: s.color || '#94a3b8' }}
                />
                <span className="text-[13px] font-medium leading-tight">{s.title}</span>
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Config content */}
      <div className="flex-1 min-w-0 space-y-4">
        {children}
      </div>
    </div>
  );
}

// ==========================================
// Section card with accent border
// ==========================================

export function ConfigSection({
  id,
  title,
  description,
  accentColor,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  accentColor?: string;
  children: ReactNode;
}) {
  const accent = accentColor || '#94a3b8';
  return (
    <div
      id={id}
      className="card-bg rounded-2xl border border-surface-200"
      style={{ borderLeft: `3px solid ${accent}`, scrollMarginTop: '84px' }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-surface-100 bg-surface-50/60">
        <div
          className="h-7 w-7 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: `${accent}14` }}
        >
          <div className="h-2.5 w-2.5 rounded-full" style={{ background: accent }} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-surface-900 leading-tight">{title}</h3>
          {description && (
            <p className="text-[11px] text-surface-400 mt-0.5 leading-tight">{description}</p>
          )}
        </div>
      </div>
      {/* Content */}
      <div className="p-5">
        {children}
      </div>
    </div>
  );
}

// ==========================================
// Segmented control (pill toggle)
// ==========================================

export function SegmentedControl({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className={LABEL_CLS}>{label}</label>
      <div className="flex p-1 bg-surface-100 rounded-xl gap-1">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={clsx(
              'flex-1 h-9 px-3 rounded-lg text-sm font-medium transition-all truncate',
              value === opt.value
                ? 'card-bg shadow-sm text-surface-900 shadow-black/5'
                : 'text-surface-500 hover:text-surface-700',
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ==========================================
// Input Source selector (COM / OSC)
// ==========================================

const INPUT_SOURCE_OPTIONS = [
  { value: 'com', label: 'COM (Serial)' },
  { value: 'osc', label: 'OSC' },
];

export function InputSourceConfig({ config, onChange }: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const inputSource = (config.inputSource as string) || 'com';
  const set = (key: string, value: unknown) => onChange({ ...config, [key]: value });

  return (
    <div className="space-y-4">
      <SegmentedControl
        label="Input Source"
        value={inputSource}
        options={INPUT_SOURCE_OPTIONS}
        onChange={(v) => set('inputSource', v)}
      />
      {inputSource === 'osc' && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className={LABEL_CLS}>OSC Address</label>
            <input
              type="text"
              value={(config.oscAddress as string) || ''}
              onChange={(e) => set('oscAddress', e.target.value)}
              placeholder="e.g. /b-av02"
              className={`${INPUT_CLS} font-mono`}
            />
          </div>
          <div>
            <label className={LABEL_CLS}>OSC Port (UDP)</label>
            <input
              type="number"
              value={(config.oscPort as number) ?? ''}
              onChange={(e) => set('oscPort', e.target.value === '' ? '' : Number(e.target.value))}
              placeholder="e.g. 9000"
              min={1}
              max={65535}
              className={`${INPUT_CLS} max-w-[220px]`}
            />
          </div>
          <div>
            <label className={LABEL_CLS}>Listen Host</label>
            <input
              type="text"
              value={(config.oscHost as string) || ''}
              onChange={(e) => set('oscHost', e.target.value)}
              placeholder="0.0.0.0 (all interfaces)"
              className={`${INPUT_CLS} font-mono`}
            />
          </div>
        </div>
      )}
      {inputSource === 'com' && (
        <p className="text-xs text-surface-500 bg-surface-50 border border-surface-100 rounded-lg px-3 py-2 leading-relaxed">
          Data will be received via COM (serial) port from the connected hardware controller.
        </p>
      )}
    </div>
  );
}
