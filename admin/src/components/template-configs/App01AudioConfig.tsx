import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useFieldHelpers, useConfigData, contentPicker, IdleScreenToggle,
  INPUT_CLS, LABEL_CLS, ConfigSection, ConfigPageLayout, type ConfigPanelProps, type SectionDef,
} from './SharedConfigFields';
import { SearchableContentPicker } from '../SearchableContentPicker';
import { Plus, Trash2, GripVertical, Upload, Loader2, Check } from 'lucide-react';
import { useAuthStore } from '../../stores/auth';
import type { Content } from '../../lib/types';

interface ButtonEntry {
  buttonId: number;
  label: string;
  audioUrl: string;
  imageUrl?: string;
  videoUrl?: string;
}

// Inline upload for a single audio file per button
function InlineAudioUpload({ buttonId, siteId, appName, onUploaded }: {
  buttonId: number;
  siteId: string;
  appName?: string;
  onUploaded: (url: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);
  const token = useAuthStore((s) => s.token);
  const queryClient = useQueryClient();

  const handleFile = async (file: File) => {
    setUploading(true);
    try {
      const baseName = file.name.replace(/\.[^.]+$/, '');
      const prefix = appName ? `${appName}-` : '';
      const autoName = `${prefix}btn${buttonId}-${baseName}`;

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
            try { const json = JSON.parse(xhr.responseText); reject(new Error(json.error || 'Upload failed')); }
            catch { reject(new Error('Upload failed')); }
          }
        });
        xhr.addEventListener('error', () => reject(new Error('Network error')));
        xhr.send(formData);
      });

      onUploaded(result.url);
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
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={uploading}
        onClick={() => fileRef.current?.click()}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary-600 hover:text-primary-700 border border-primary-200 rounded-lg hover:border-primary-300 transition-colors disabled:opacity-50"
      >
        {uploading ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading...</>
          : done ? <><Check className="h-3.5 w-3.5 text-emerald-500" /> Uploaded</>
          : <><Upload className="h-3.5 w-3.5" /> Upload</>}
      </button>
      <input ref={fileRef} type="file" className="hidden" accept="audio/*"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
    </div>
  );
}

function ButtonEditor({ buttons, contentItems, siteId, appName, onChange }: {
  buttons: ButtonEntry[];
  contentItems: Content[];
  siteId: string;
  appName?: string;
  onChange: (buttons: ButtonEntry[]) => void;
}) {
  const addButton = () => {
    const nextId = buttons.length > 0 ? Math.max(...buttons.map(b => b.buttonId)) + 1 : 1;
    onChange([...buttons, { buttonId: nextId, label: '', audioUrl: '' }]);
  };
  const removeButton = (index: number) => onChange(buttons.filter((_, i) => i !== index));
  const updateButton = (index: number, field: keyof ButtonEntry, value: string | number) => {
    onChange(buttons.map((b, i) => i === index ? { ...b, [field]: value } : b));
  };

  return (
    <div>
      <label className={LABEL_CLS}>Buttons</label>
      <div className="space-y-3">
        {buttons.map((btn, index) => (
          <div key={index} className="border border-surface-200 rounded-xl p-4 bg-surface-50/50 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <GripVertical className="h-4 w-4 text-surface-300" />
                <span className="text-sm font-semibold text-surface-700">Button {btn.buttonId}</span>
              </div>
              <button type="button" onClick={() => removeButton(index)}
                className="p-1.5 text-surface-300 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-surface-500 font-medium mb-1">Button ID</label>
                <input type="number" value={btn.buttonId}
                  onChange={(e) => updateButton(index, 'buttonId', Number(e.target.value))}
                  min={1} className={`${INPUT_CLS} !h-9`} />
              </div>
              <div>
                <label className="block text-xs text-surface-500 font-medium mb-1">Label</label>
                <input type="text" value={btn.label}
                  onChange={(e) => updateButton(index, 'label', e.target.value)}
                  placeholder="e.g. Story A" className={`${INPUT_CLS} !h-9`} />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs text-surface-500 font-medium">Audio File</label>
                <InlineAudioUpload buttonId={btn.buttonId} siteId={siteId} appName={appName}
                  onUploaded={(url) => updateButton(index, 'audioUrl', url)} />
              </div>
              <SearchableContentPicker label="" value={btn.audioUrl}
                onChange={(url) => updateButton(index, 'audioUrl', url)}
                items={contentItems} placeholder="Select audio..." />
            </div>
          </div>
        ))}
        <button type="button" onClick={addButton}
          className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-primary-600 hover:text-primary-700 border-2 border-dashed border-primary-200 rounded-xl hover:border-primary-400 transition-colors w-full justify-center">
          <Plus className="h-4 w-4" />
          Add Button
        </button>
      </div>
    </div>
  );
}

function WelcomeUpload({ siteId, contentItems, appName, config, onChange }: {
  siteId: string;
  contentItems: Content[];
  appName?: string;
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);
  const token = useAuthStore((s) => s.token);
  const queryClient = useQueryClient();

  const handleFile = async (file: File) => {
    setUploading(true);
    try {
      const baseName = file.name.replace(/\.[^.]+$/, '');
      const prefix = appName ? `${appName}-` : '';
      const autoName = `${prefix}welcome-${baseName}`;
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
            const json = JSON.parse(xhr.responseText); resolve(json.data);
          } else {
            try { const json = JSON.parse(xhr.responseText); reject(new Error(json.error || 'Upload failed')); }
            catch { reject(new Error('Upload failed')); }
          }
        });
        xhr.addEventListener('error', () => reject(new Error('Network error')));
        xhr.send(formData);
      });
      onChange({ ...config, welcomeMessage: result.url });
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
      <div className="flex items-center justify-between mb-1.5">
        <label className={LABEL_CLS + ' !mb-0'}>Welcome Message Audio <span className="font-normal text-surface-400">(optional)</span></label>
        <div className="flex items-center gap-2">
          <button type="button" disabled={uploading} onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary-600 hover:text-primary-700 border border-primary-200 rounded-lg hover:border-primary-300 transition-colors disabled:opacity-50">
            {uploading ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading...</>
              : done ? <><Check className="h-3.5 w-3.5 text-emerald-500" /> Uploaded</>
              : <><Upload className="h-3.5 w-3.5" /> Upload</>}
          </button>
          <input ref={fileRef} type="file" className="hidden" accept="audio/*"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
        </div>
      </div>
      <SearchableContentPicker label="" value={(config.welcomeMessage as string) || ''}
        onChange={(url) => onChange({ ...config, welcomeMessage: url })}
        items={contentItems} placeholder="Select welcome audio..." />
    </div>
  );
}

const AUDIO_OUTPUT_OPTIONS = [
  { value: 'monophone', label: 'Monophone (handset)' },
  { value: 'screen', label: 'Screen Speakers' },
  { value: 'directional-speaker', label: 'Directional Speaker' },
];

export function App01AudioConfig({ config, onChange, siteId }: ConfigPanelProps) {
  const { numberField, selectField, checkboxField } = useFieldHelpers(config, onChange);
  const { contentItems, videos, images } = useConfigData(siteId);
  const audioMode = (config.mode as string) || 'single';
  const buttons = (config.buttons as ButtonEntry[]) || [];
  const appName = (config._appName as string) || '';

  const sections: SectionDef[] = [
    { id: 'content', title: audioMode === 'multi' ? 'Multi-Button Content' : 'Content', color: '#c2185b' },
    { id: 'settings', title: 'Settings', color: '#2563eb' },
    { id: 'idle', title: 'Idle Screen', color: '#0891b2' },
  ];

  return (
    <ConfigPageLayout sections={sections}>

      {/* Content */}
      {audioMode === 'single' ? (
        <ConfigSection id="content" title="Content" accentColor="#c2185b"
          description="Select the audio file and optional idle media">
          <div className="space-y-4">
            {contentPicker('audioUrl', 'Audio File', contentItems, 'Select audio...', config, onChange, siteId, 'audio/*')}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {contentPicker('idleImageUrl', 'Idle Image', images, 'Select an image...', config, onChange, siteId, 'image/*')}
              {contentPicker('idleVideoUrl', 'Idle Video (optional)', videos, 'Select a video...', config, onChange, siteId, 'video/*')}
            </div>
          </div>
        </ConfigSection>
      ) : (
        <ConfigSection id="content" title="Multi-Button Content" accentColor="#c2185b"
          description="Configure buttons, welcome message and silence gap">
          <div className="space-y-5">
            <div className="max-w-[200px]">
              {numberField('silenceGap', 'Silence Gap (sec)', { min: 0, max: 30 })}
            </div>
            <WelcomeUpload siteId={siteId} contentItems={contentItems} appName={appName}
              config={config} onChange={onChange} />
            <ButtonEditor buttons={buttons} contentItems={contentItems} siteId={siteId}
              appName={appName} onChange={(newButtons) => onChange({ ...config, buttons: newButtons })} />
          </div>
        </ConfigSection>
      )}

      {/* Settings */}
      <ConfigSection id="settings" title="Settings" accentColor="#2563eb"
        description="Mode, audio routing, timing and hardware">
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {selectField('mode', 'Mode', [
              { value: 'single', label: 'Single Story' },
              { value: 'multi', label: 'Multi-Button' },
            ])}
            {selectField('audioOutput', 'Audio Output', AUDIO_OUTPUT_OPTIONS)}
            {numberField('delay', 'Startup Delay (sec)', { min: 0, max: 10 })}
            {numberField('fadeOutDuration', 'Fade Out (ms)', { min: 0, max: 5000 })}
            {numberField('resetDelay', 'Reset Delay (sec)', { min: 0, max: 60 })}
          </div>
          {checkboxField('loop', 'Auto-replay when story ends')}
        </div>
      </ConfigSection>

      {/* Idle Screen */}
      <ConfigSection id="idle" title="Idle Screen" accentColor="#0891b2"
        description="Attract screen shown when no interaction is detected">
        <IdleScreenToggle config={config} onChange={onChange} images={images} videos={videos} siteId={siteId} />
      </ConfigSection>

    </ConfigPageLayout>
  );
}
