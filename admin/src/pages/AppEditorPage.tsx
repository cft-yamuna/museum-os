import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { useSiteStore } from '../stores/site';
import { useToastStore } from '../stores/toast';
import { useDeviceSyncStore } from '../stores/deviceSync';
import { api } from '../lib/api';
import { adminWs } from '../lib/ws';
import { Spinner } from '../components/ui/Spinner';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { TemplateConfigPanel } from '../components/TemplateConfigPanel';
import { DeviceSyncBadge } from '../components/DeviceSyncBadge';
import { useDeviceSyncTracking } from '../hooks/useDeviceSyncTracking';
import type { App, Device, PlaylistItem } from '../lib/types';
import {
  AppWindow,
  ChevronRight,
  ChevronLeft,
  Save,
  Trash2,
  Volume2,
  Video,
  Image,
  PlayCircle,
  Map as MapIcon,
  FolderOpen,
  Radio,
  Layers,
  LayoutGrid,
  Wrench,
  Sparkles,
  Clock,
  Navigation,
} from 'lucide-react';
import clsx from 'clsx';

// ---------------------------------------------------------------------------
// Template metadata
// ---------------------------------------------------------------------------

const TEMPLATE_META: Record<string, {
  label: string;
  shortLabel: string;
  icon: typeof AppWindow;
  color: string;
  gradientFrom: string;
  gradientTo: string;
  description: string;
}> = {
  'app01-monophone-audio': {
    label: 'APP 01',
    shortLabel: 'Monophone Audio',
    icon: Volume2,
    color: '#ec4899',
    gradientFrom: 'from-pink-500',
    gradientTo: 'to-purple-600',
    description: 'Handset triggers audio. Single or multi-button.',
  },
  'app01-monophone-audio-multi': {
    label: 'APP 01+',
    shortLabel: 'Audio Multi-Button',
    icon: Volume2,
    color: '#ec4899',
    gradientFrom: 'from-pink-500',
    gradientTo: 'to-purple-600',
    description: 'Multi-button audio with welcome message.',
  },
  'app02-monophone-video': {
    label: 'APP 02',
    shortLabel: 'Monophone Video',
    icon: Video,
    color: '#3b82f6',
    gradientFrom: 'from-blue-500',
    gradientTo: 'to-cyan-500',
    description: 'Handset triggers video playback.',
  },
  'app03-touch-carousel': {
    label: 'APP 03',
    shortLabel: 'Touch Carousel',
    icon: Image,
    color: '#10b981',
    gradientFrom: 'from-emerald-500',
    gradientTo: 'to-teal-500',
    description: 'Auto-playing slideshow with touch navigation.',
  },
  'app04-media-loop': {
    label: 'APP 04',
    shortLabel: 'Media Loop',
    icon: PlayCircle,
    color: '#f59e0b',
    gradientFrom: 'from-amber-500',
    gradientTo: 'to-orange-500',
    description: 'Zero-interaction looping video or slideshow.',
  },
  'app05-interactive-map': {
    label: 'APP 05',
    shortLabel: 'Interactive Map',
    icon: MapIcon,
    color: '#06b6d4',
    gradientFrom: 'from-cyan-500',
    gradientTo: 'to-blue-500',
    description: 'Touch-enabled map with POI markers.',
  },
  'app06-media-browser': {
    label: 'APP 06',
    shortLabel: 'Media Browser',
    icon: FolderOpen,
    color: '#f43f5e',
    gradientFrom: 'from-pink-500',
    gradientTo: 'to-rose-500',
    description: 'Browsable PDFs, photos, and videos.',
  },
  proximity: {
    label: 'PROX',
    shortLabel: 'Proximity',
    icon: Radio,
    color: '#f97316',
    gradientFrom: 'from-orange-500',
    gradientTo: 'to-red-500',
    description: 'Sensor-triggered content playback.',
  },
  'touch-scroll': {
    label: 'SCROLL',
    shortLabel: 'Touch Scroll',
    icon: Layers,
    color: '#14b8a6',
    gradientFrom: 'from-teal-500',
    gradientTo: 'to-emerald-500',
    description: 'Scrollable touch content with reset.',
  },
  'multi-screen': {
    label: 'MULTI',
    shortLabel: 'Multi-Screen',
    icon: LayoutGrid,
    color: '#6366f1',
    gradientFrom: 'from-indigo-500',
    gradientTo: 'to-pink-500',
    description: 'Synced multi-display content.',
  },
  diagnostics: {
    label: 'DIAG',
    shortLabel: 'Diagnostics',
    icon: Wrench,
    color: '#64748b',
    gradientFrom: 'from-slate-500',
    gradientTo: 'to-slate-600',
    description: 'Device health monitoring tool.',
  },
  'custom06-reception-program': {
    label: 'A-AV02',
    shortLabel: 'Reception Program',
    icon: Sparkles,
    color: '#6366f1',
    gradientFrom: 'from-indigo-500',
    gradientTo: 'to-violet-600',
    description: 'CMS-driven 3-screen reception signage with welcome & visitor info.',
  },
  'custom07-osc': {
    label: 'OSC',
    shortLabel: 'OSC Trigger',
    icon: Radio,
    color: '#d97706',
    gradientFrom: 'from-amber-500',
    gradientTo: 'to-orange-500',
    description: 'OSC-triggered video playback with idle image.',
  },
  'custom01-hilight-timeline': {
    label: 'A-AV03',
    shortLabel: 'Museum OS Timeline',
    icon: Clock,
    color: '#5072b6',
    gradientFrom: 'from-blue-500',
    gradientTo: 'to-indigo-600',
    description: 'Animated interactive timeline with sector dandelions.',
  },
  'custom01-wipro-timeline': {
    label: 'A-AV03',
    shortLabel: 'Museum OS Timeline',
    icon: Clock,
    color: '#5072b6',
    gradientFrom: 'from-blue-500',
    gradientTo: 'to-indigo-600',
    description: 'Animated interactive timeline with sector dandelions.',
  },
  'custom08-museum-kiosk': {
    label: 'A-AV01',
    shortLabel: 'Museum Kiosk',
    icon: Navigation,
    color: '#059669',
    gradientFrom: 'from-emerald-500',
    gradientTo: 'to-teal-600',
    description: 'Interactive SVG map navigation with categories & galleries.',
  },
  'custom-builder': {
    label: 'BUILDER',
    shortLabel: 'Visual Builder',
    icon: LayoutGrid,
    color: '#8b5cf6',
    gradientFrom: 'from-violet-500',
    gradientTo: 'to-purple-600',
    description: 'Design a custom layout visually — text, media, slideshows, clock. No coding.',
  },
};

function getTemplateMeta(type: string) {
  return TEMPLATE_META[type] || {
    label: type,
    shortLabel: type,
    icon: AppWindow,
    color: '#64748b',
    gradientFrom: 'from-slate-500',
    gradientTo: 'to-slate-600',
    description: '',
  };
}

// Template groups for the visual picker
const TEMPLATE_GROUPS = [
  {
    group: 'Standard Apps',
    items: [
      'app01-monophone-audio',
      'app01-monophone-audio-multi',
      'app02-monophone-video',
      'app03-touch-carousel',
      'app04-media-loop',
      'app05-interactive-map',
      'app06-media-browser',
    ],
  },
  {
    group: 'Utility',
    items: ['proximity', 'touch-scroll', 'multi-screen'],
  },
  {
    group: 'Custom',
    items: ['custom01-hilight-timeline', 'custom06-reception-program', 'custom07-osc', 'custom08-museum-kiosk', 'custom-builder'],
  },
  {
    group: 'System',
    items: ['diagnostics'],
  },
];

// Default appConfig values per template
const TEMPLATE_DEFAULTS: Record<string, Record<string, unknown>> = {
  'app01-monophone-audio': { mode: 'single', controllerId: '', audioUrl: '', idleImageUrl: '', idleVideoUrl: '', delay: 1, loop: false, fadeOutDuration: 1000, audioOutput: 'monophone', resetDelay: 0 },
  'app01-monophone-audio-multi': { mode: 'multi', controllerId: '', buttons: [], welcomeMessage: '', delay: 1, loop: false, fadeOutDuration: 1000, silenceGap: 3, audioOutput: 'monophone', resetDelay: 0 },
  'app02-monophone-video': { controllerId: '', videoUrl: '', idleType: 'image', idleImageUrl: '', idleVideoUrl: '', transition: 'fade-black', transitionDuration: 600, fadeOutDuration: 1000, delay: 1, fit: 'cover', backgroundColor: '#000000', triggerMode: 'touch', titleText: '', audioOutput: 'monophone', resetDelay: 0 },
  'app03-touch-carousel': { _timelineItems: [], defaultDuration: 8, transition: 'dissolve', transitionDuration: 500, fit: 'cover', backgroundColor: '#000000', shuffle: false, loop: true, displayMode: 'carousel', carouselTimeout: 5, inactivityTimeout: 30, carouselHeight: 100, showCaptions: false, captionPosition: 'bottom', audioOutput: 'none', controllerId: '', idle: null, schedule: null },
  'app04-media-loop': { videoUrl: '', mode: 'video-loop', muted: false, volume: 100, fit: 'cover', backgroundColor: '#000000', fadeType: 'fade-black', pauseDuration: 0, slideInterval: 8, audioOutput: 'screen', subtitlesEnabled: false, subtitlesUrl: '', idle: null, schedule: null },
  'app05-interactive-map': { mapImageUrl: '', inactivityTimeout: 60, hotspots: [], sections: [], showYouAreHere: true, youAreHereLabel: 'You Are Here', youAreHereX: 50, youAreHereY: 50, showTimeEstimates: true, showAnimatedPathways: false, idle: null },
  'app06-media-browser': { _selectedContentIds: [], inactivityTimeout: 30, layout: 'grid', searchEnabled: false, audioEnabled: false, pdfEnabled: false, videoEnabled: true, audioOutput: 'none', controllerId: '', idle: null },
  'proximity': { controllerId: '', activationDistance: 100, deactivationDelay: 3000, contentType: 'video', videoUrl: '', imageUrl: '', fit: 'cover', backgroundColor: '#000000', triggerMode: 'touch', idle: null },
  'touch-scroll': { _timelineItems: [], autoScroll: true, autoScrollSpeed: 30, inactivityTimeout: 30, fit: 'contain', backgroundColor: '#000000', idle: null },
  'multi-screen': { exhibitId: '', screenIndex: 0, totalScreens: 2, contentType: 'video', videoUrl: '', fit: 'cover', backgroundColor: '#000000' },
  'custom06-reception-program': {
    screenIndex: 0,
    screens: [
      { screenIndex: 0, screenLabel: 'Left Screen', mode: 'slides', videoUrl: '', guestNames: [], guestNameFontSizeRem: 3.5, welcomeSlides: [{ id: 'w-default-0', greeting: 'Welcome to Museum OS', subtitle: 'We are glad to have you' }], infoSlides: [] },
      { screenIndex: 1, screenLabel: 'Center Screen', mode: 'slides', videoUrl: '', guestNames: [], guestNameFontSizeRem: 3.5, welcomeSlides: [{ id: 'w-default-1', greeting: 'Welcome', subtitle: '' }], infoSlides: [] },
      { screenIndex: 2, screenLabel: 'Right Screen', mode: 'slides', videoUrl: '', guestNames: [], guestNameFontSizeRem: 3.5, welcomeSlides: [{ id: 'w-default-2', greeting: 'Welcome', subtitle: '' }], infoSlides: [] },
    ],
    welcomeSlideDuration: 8,
    infoSlideDuration: 10,
    stateCycleDuration: 30,
    transition: 'fade',
    transitionDuration: 800,
    backgroundColor: '#0f172a',
    accentColor: '#3b82f6',
    textColor: '#ffffff',
    logoUrl: '',
    footerText: 'Museum OS',
    hideHeader: true,
    hideCenterLine: true,
    disableOpacity: true,
    showClock: true,
    showDate: true,
    dateFormat: 'long',
    idle: null,
    schedule: null,
  },
  'custom07-osc': { inputSource: 'osc', oscAddress: '/b-av02', oscPort: 9000, oscHost: '0.0.0.0', videoUrl: '', idleImageUrl: '', idle: null },
  'custom01-hilight-timeline': { inactivityTimeoutSec: 15, idle: null, dandelionAnimationMode: 'breathing', dandelionAnimationParams: { scale: 1.05, duration: 3, delaySpread: 3 }, dandelionScaleMin: 0.8, dandelionScaleMax: 1.5, timelineData: null },
  'custom01-wipro-timeline': { inactivityTimeoutSec: 15, idle: null, dandelionAnimationMode: 'breathing', dandelionAnimationParams: { scale: 1.05, duration: 3, delaySpread: 3 }, dandelionScaleMin: 0.8, dandelionScaleMax: 1.5, timelineData: null },
  'custom08-museum-kiosk': { idleTimeoutMs: 60000, idle: null, poiImageOverrides: {} },
  'custom-builder': { background: { color: '#000000' }, regions: [] },
  'diagnostics': {},
};

type SaveStatePhase = 'idle' | 'dirty' | 'saving' | 'updating' | 'waiting' | 'updated' | 'failed';

interface AppSaveResponse extends App {
  cache_refresh_device_ids?: string[];
  cache_refresh_request_id?: string | null;
}

interface SaveState {
  ackedDeviceIds: string[];
  message: string;
  phase: SaveStatePhase;
  requestId: string | null;
  targetDeviceIds: string[];
}

interface BufferedAgentRefreshResult {
  changed: boolean;
  error?: string;
  success: boolean;
}

function createIdleSaveState(): SaveState {
  return {
    ackedDeviceIds: [],
    message: '',
    phase: 'idle',
    requestId: null,
    targetDeviceIds: [],
  };
}

function createEditorSnapshot(
  name: string,
  templateType: string,
  appConfig: Record<string, unknown>
): string {
  return JSON.stringify({
    name,
    templateType,
    appConfig,
  });
}

function getSyncStatusMessage(targetCount: number): string {
  return targetCount <= 1 ? 'Syncing device' : `Syncing devices (${targetCount})`;
}

function getRenderStatusMessage(ackedCount: number, targetCount: number): string {
  return targetCount <= 1
    ? 'Rendering screen'
    : `Rendering screens (${ackedCount}/${targetCount})`;
}

function getLiveStatusMessage(targetCount: number): string {
  return targetCount <= 1 ? 'Live on screen' : 'Live on screens';
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function AppEditorPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = !id;
  const navigate = useNavigate();
  const activeSiteId = useSiteStore((s) => s.activeSiteId);
  const addToast = useToastStore((s) => s.addToast);
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [templateType, setTemplateType] = useState('');
  const [appConfig, setAppConfig] = useState<Record<string, unknown>>({});
  const [saveState, setSaveState] = useState<SaveState>(createIdleSaveState);
  const saveStateRef = useRef<SaveState>(createIdleSaveState());
  const lastSavedSnapshotRef = useRef<string | null>(null);
  const bufferedAgentResultsRef = useRef<Map<string, Map<string, BufferedAgentRefreshResult>>>(new Map());
  const bufferedRenderedRef = useRef<Map<string, Set<string>>>(new Map());
  const markDeviceSyncing = useDeviceSyncStore((state) => state.markSyncing);
  const markDeviceAgentOffline = useDeviceSyncStore((state) => state.markAgentOffline);
  const deviceSyncStatuses = useDeviceSyncStore((state) => state.statuses);

  const { data: app, isLoading: appLoading } = useQuery({
    queryKey: ['app', id],
    queryFn: () => api.get<App & { device_count: number }>(`/apps/${id}`),
    enabled: !!id,
  });

  const { data: devices = [] } = useQuery({
    queryKey: ['devices', activeSiteId],
    queryFn: () => api.get<Device[]>(`/devices?site_id=${activeSiteId}`),
    enabled: !!activeSiteId && !!id,
  });

  const assignedDevices = devices
    .filter((device) => device.app_id === id)
    .sort((a, b) => a.display_name.localeCompare(b.display_name));

  const assignedDeviceIds = assignedDevices.map((device) => device.id);

  useDeviceSyncTracking(assignedDeviceIds);

  useEffect(() => {
    saveStateRef.current = saveState;
  }, [saveState]);

  useEffect(() => {
    const nextState = createIdleSaveState();
    lastSavedSnapshotRef.current = null;
    saveStateRef.current = nextState;
    setSaveState(nextState);
  }, [id]);

  const clearBufferedRequest = (requestId: string | null) => {
    if (!requestId) return;
    bufferedAgentResultsRef.current.delete(requestId);
    bufferedRenderedRef.current.delete(requestId);
  };

  const applyBufferedRequestState = (state: SaveState): SaveState => {
    if (state.phase !== 'updating' || !state.requestId || state.targetDeviceIds.length === 0) {
      return state;
    }

    const requestId = state.requestId;
    const bufferedAgentResults = bufferedAgentResultsRef.current.get(requestId);
    const bufferedRendered = bufferedRenderedRef.current.get(requestId) || new Set<string>();

    for (const deviceId of state.targetDeviceIds) {
      const agentResult = bufferedAgentResults?.get(deviceId);
      if (agentResult && !agentResult.success) {
        return {
          ...state,
          message: agentResult.error || 'Agent update failed',
          phase: 'failed',
        };
      }
    }

    const ackedDeviceIds = state.targetDeviceIds.filter((deviceId) => {
      if (bufferedRendered.has(deviceId)) return true;
      const agentResult = bufferedAgentResults?.get(deviceId);
      return Boolean(agentResult && agentResult.success && agentResult.changed === false);
    });

    const finished = ackedDeviceIds.length >= state.targetDeviceIds.length;
    return {
      ...state,
      ackedDeviceIds,
      message: finished
        ? getLiveStatusMessage(state.targetDeviceIds.length)
        : getRenderStatusMessage(ackedDeviceIds.length, state.targetDeviceIds.length),
      phase: finished ? 'updated' : 'updating',
    };
  };

  useEffect(() => {
    const unsubAgent = adminWs.on('agent:cache-refresh-result', (_event, data) => {
      const event = data as { payload?: Record<string, unknown> } & Record<string, unknown>;
      const payload = event.payload && typeof event.payload === 'object'
        ? event.payload
        : event;

      const deviceId = typeof payload.deviceId === 'string' ? payload.deviceId : '';
      const requestId = typeof payload.requestId === 'string' ? payload.requestId : '';
      const success = payload.success !== false;
      const changed = payload.changed !== false;

      if (!deviceId || !requestId) return;

      const bufferedAgentResults = bufferedAgentResultsRef.current.get(requestId) || new Map<string, BufferedAgentRefreshResult>();
      bufferedAgentResults.set(deviceId, {
        changed,
        ...(typeof payload.error === 'string' && payload.error ? { error: payload.error } : {}),
        success,
      });
      bufferedAgentResultsRef.current.set(requestId, bufferedAgentResults);

      const current = saveStateRef.current;
      if (current.phase !== 'updating' || current.requestId !== requestId) {
        return;
      }
      if (!current.targetDeviceIds.includes(deviceId)) {
        return;
      }

      if (!success) {
        const message = typeof payload.error === 'string' && payload.error
          ? payload.error
          : 'Agent update failed';
        const nextState: SaveState = {
          ...current,
          message,
          phase: 'failed',
        };
        saveStateRef.current = nextState;
        setSaveState(nextState);
        addToast('error', message);
        clearBufferedRequest(requestId);
        return;
      }

      const nextState = applyBufferedRequestState({
        ...current,
        ackedDeviceIds: changed
          ? current.ackedDeviceIds
          : current.ackedDeviceIds.includes(deviceId)
            ? current.ackedDeviceIds
            : [...current.ackedDeviceIds, deviceId],
        message: changed
          ? getRenderStatusMessage(current.ackedDeviceIds.length, current.targetDeviceIds.length)
          : getLiveStatusMessage(current.targetDeviceIds.length),
        phase: 'updating',
      });

      saveStateRef.current = nextState;
      setSaveState(nextState);

      if (nextState.phase === 'updated') {
        addToast('success', 'Assigned device updated on screen');
        clearBufferedRequest(requestId);
      }
    });

    const unsubDisplay = adminWs.on('display:revision-rendered', (_event, data) => {
      const event = data as { payload?: Record<string, unknown> } & Record<string, unknown>;
      const payload = event.payload && typeof event.payload === 'object'
        ? event.payload
        : event;

      const deviceId = typeof payload.deviceId === 'string' ? payload.deviceId : '';
      const requestId = typeof payload.requestId === 'string' ? payload.requestId : '';

      if (!deviceId || !requestId) return;

      const bufferedRendered = bufferedRenderedRef.current.get(requestId) || new Set<string>();
      bufferedRendered.add(deviceId);
      bufferedRenderedRef.current.set(requestId, bufferedRendered);

      const current = saveStateRef.current;
      if (current.phase !== 'updating' || current.requestId !== requestId) {
        return;
      }
      if (!current.targetDeviceIds.includes(deviceId)) {
        return;
      }

      const ackedDeviceIds = current.ackedDeviceIds.includes(deviceId)
        ? current.ackedDeviceIds
        : [...current.ackedDeviceIds, deviceId];
      const finished = ackedDeviceIds.length >= current.targetDeviceIds.length;

      const nextState: SaveState = {
        ...current,
        ackedDeviceIds,
        message: finished
          ? getLiveStatusMessage(current.targetDeviceIds.length)
          : getRenderStatusMessage(ackedDeviceIds.length, current.targetDeviceIds.length),
        phase: finished ? 'updated' : 'updating',
      };

      saveStateRef.current = nextState;
      setSaveState(nextState);

      if (finished) {
        addToast('success', 'Assigned device updated on screen');
        clearBufferedRequest(requestId);
      }
    });

    return () => {
      unsubAgent();
      unsubDisplay();
    };
  }, [addToast]);

  useEffect(() => {
    if (!app) return;
    setName(app.name);
    setTemplateType(app.template_type);
    const defaults = TEMPLATE_DEFAULTS[app.template_type] || {};
    const merged = { ...defaults, ...app.config };

    if ((app.template_type === 'slideshow' || app.template_type === 'app03-touch-carousel' || app.template_type === 'touch-scroll') && app.config.playlistId) {
      api.get<{ items: PlaylistItem[] }>(`/playlists/${app.config.playlistId}`)
        .then((playlist) => {
          const sortedItems = (playlist.items || [])
            .sort((a: PlaylistItem, b: PlaylistItem) => a.position - b.position);

          const items = sortedItems.map((pi: PlaylistItem) => ({
              contentId: pi.contentId,
              contentName: pi.content?.name || 'Unknown',
              contentType: pi.content?.type || 'image',
              thumbnailUrl: pi.url || undefined,
              caption: (pi.config as Record<string, unknown>)?.caption as string | undefined,
              duration: pi.duration || (merged.defaultDuration as number) || 8,
              transition: pi.transition || (merged.transition as string) || 'fade',
              documentIndex: (pi.config as Record<string, unknown>)?.documentIndex as number | undefined,
              documentLabel: (pi.config as Record<string, unknown>)?.documentLabel as string | undefined,
              documentCaption: (
                (pi.config as Record<string, unknown>)?.documentCaption
                || (pi.config as Record<string, unknown>)?.caption
              ) as string | undefined,
              documentSourceLabel: (
                (pi.config as Record<string, unknown>)?.documentSourceLabel
                || (pi.config as Record<string, unknown>)?.sourceLabel
              ) as string | undefined,
              documentHasTranslation: (pi.config as Record<string, unknown>)?.documentHasTranslation as boolean | undefined,
              translationDocumentIndex: (pi.config as Record<string, unknown>)?.translationDocumentIndex as number | undefined,
              isTranslationDocument: (pi.config as Record<string, unknown>)?.isTranslationDocument as boolean | undefined,
              translationForDocumentIndex: (pi.config as Record<string, unknown>)?.translationForDocumentIndex as number | undefined,
            }));

          // Reconstruct _documents from playlist items for document-viewer mode
          const isDocMode = (merged.displayMode as string) === 'document-viewer';
          if (isDocMode) {
            const docGroups: Record<number, {
              pages: Array<{ contentId: string; contentName: string; contentType: string; thumbnailUrl?: string }>;
              caption?: string;
              sourceLabel?: string;
            }> = {};
            items.forEach((item: {
              contentId: string;
              contentName: string;
              contentType: string;
              thumbnailUrl?: string;
              documentIndex?: number;
              documentCaption?: string;
              documentSourceLabel?: string;
            }) => {
              const dIdx = item.documentIndex ?? 0;
              if (!docGroups[dIdx]) {
                docGroups[dIdx] = { pages: [] };
              }
              docGroups[dIdx].pages.push({
                contentId: item.contentId,
                contentName: item.contentName,
                contentType: item.contentType,
                thumbnailUrl: item.thumbnailUrl,
              });
              if (!docGroups[dIdx].caption && item.documentCaption) {
                docGroups[dIdx].caption = item.documentCaption;
              }
              if (!docGroups[dIdx].sourceLabel && item.documentSourceLabel) {
                docGroups[dIdx].sourceLabel = item.documentSourceLabel;
              }
            });
            const docs = Object.keys(docGroups).map(Number).sort((a, b) => a - b).map((dIdx) => ({
              id: 'doc-' + dIdx,
              label: `Document ${dIdx + 1}`,
              caption: docGroups[dIdx].caption || '',
              sourceLabel: docGroups[dIdx].sourceLabel || '',
              pages: docGroups[dIdx].pages,
            }));
            const nextConfig = { ...merged, _timelineItems: items, _documents: docs };
            lastSavedSnapshotRef.current = createEditorSnapshot(app.name, app.template_type, nextConfig);
            setAppConfig(nextConfig);
          } else if (app.template_type === 'touch-scroll') {
            interface TouchScrollDocGroup {
              index: number;
              label?: string;
              caption?: string;
              isTranslation?: boolean;
              hasTranslation?: boolean;
              translationForIndex?: number;
              translationDocumentIndex?: number;
              pages: Array<{ contentId: string; contentName: string; contentType: string; thumbnailUrl?: string }>;
            }

            const groups = new Map<number, TouchScrollDocGroup>();
            items.forEach((item: {
              contentId: string;
              contentName: string;
              contentType: string;
              thumbnailUrl?: string;
              documentIndex?: number;
              documentLabel?: string;
              documentCaption?: string;
              documentHasTranslation?: boolean;
              translationDocumentIndex?: number;
              isTranslationDocument?: boolean;
              translationForDocumentIndex?: number;
            }) => {
              if (item.documentIndex === undefined || item.documentIndex === null) return;
              const idx = Number(item.documentIndex);
              const existing = groups.get(idx) || {
                index: idx,
                pages: [],
              };

              existing.pages.push({
                contentId: item.contentId,
                contentName: item.contentName,
                contentType: item.contentType,
                thumbnailUrl: item.thumbnailUrl,
              });
              if (!existing.label && item.documentLabel) existing.label = item.documentLabel;
              if (!existing.caption && item.documentCaption) existing.caption = item.documentCaption;
              if (item.isTranslationDocument !== undefined) existing.isTranslation = Boolean(item.isTranslationDocument);
              if (item.documentHasTranslation !== undefined) existing.hasTranslation = Boolean(item.documentHasTranslation);
              if (item.translationForDocumentIndex !== undefined) existing.translationForIndex = Number(item.translationForDocumentIndex);
              if (item.translationDocumentIndex !== undefined) existing.translationDocumentIndex = Number(item.translationDocumentIndex);

              groups.set(idx, existing);
            });

            const orderedGroups = Array.from(groups.values()).sort((a, b) => a.index - b.index);
            const baseGroups = orderedGroups.filter((group) => !group.isTranslation);
            if (baseGroups.length > 0) {
              const docs = baseGroups.map((group, order) => {
                let translationGroup = group.translationDocumentIndex !== undefined
                  ? groups.get(group.translationDocumentIndex)
                  : undefined;
                if (!translationGroup) {
                  translationGroup = orderedGroups.find((candidate) => {
                    return candidate.isTranslation && candidate.translationForIndex === group.index;
                  });
                }
                const hasTranslation = Boolean(translationGroup && translationGroup.pages.length > 0);
                const baseLabel = group.label || `Document ${order + 1}`;
                return {
                  id: `touch-doc-${group.index}`,
                  label: baseLabel,
                  caption: group.caption || '',
                  pages: group.pages,
                  hasTranslation: hasTranslation || Boolean(group.hasTranslation),
                  translationLabel: translationGroup?.label || `${baseLabel} Translation`,
                  translationCaption: translationGroup?.caption || '',
                  translationPages: translationGroup?.pages || [],
                };
              });
              const nextConfig = { ...merged, _timelineItems: items, _documents: docs, contentMode: 'documents' };
              lastSavedSnapshotRef.current = createEditorSnapshot(app.name, app.template_type, nextConfig);
              setAppConfig(nextConfig);
            } else {
              const nextConfig = { ...merged, _timelineItems: items };
              lastSavedSnapshotRef.current = createEditorSnapshot(app.name, app.template_type, nextConfig);
              setAppConfig(nextConfig);
            }
          } else {
            const nextConfig = { ...merged, _timelineItems: items };
            lastSavedSnapshotRef.current = createEditorSnapshot(app.name, app.template_type, nextConfig);
            setAppConfig(nextConfig);
          }
        })
        .catch(() => {
          lastSavedSnapshotRef.current = createEditorSnapshot(app.name, app.template_type, merged);
          setAppConfig(merged);
        });
    } else {
      lastSavedSnapshotRef.current = createEditorSnapshot(app.name, app.template_type, merged);
      setAppConfig(merged);
    }
  }, [app?.id, app?.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveMutation = useMutation({
    mutationFn: async () => {
      let finalConfig = { ...appConfig };

      interface TimelineItem {
        contentId: string;
        caption?: string;
        duration: number;
        transition: string;
        documentIndex?: number;
        documentLabel?: string;
        documentCaption?: string;
        documentSourceLabel?: string;
        documentHasTranslation?: boolean;
        translationDocumentIndex?: number;
        isTranslationDocument?: boolean;
        translationForDocumentIndex?: number;
      }
      const timelineItems = finalConfig._timelineItems as TimelineItem[] | undefined;

      if ((templateType === 'slideshow' || templateType === 'app03-touch-carousel' || templateType === 'touch-scroll') && timelineItems && timelineItems.length > 0) {
        const batchPlaylistQuery = '?skip_app_refresh=true';
        const existingPlaylistId = finalConfig.playlistId as string | undefined;
        let playlistId: string;
        if (existingPlaylistId) {
          try {
            const existing = await api.get<{ items: Array<{ id: string }> }>(`/playlists/${existingPlaylistId}`);
            for (const item of existing.items) {
              await api.delete(`/playlists/${existingPlaylistId}/items/${item.id}${batchPlaylistQuery}`);
            }
            playlistId = existingPlaylistId;
          } catch {
            const newPlaylist = await api.post<{ id: string }>('/playlists', { site_id: activeSiteId, name: `${name} - slideshow` });
            playlistId = newPlaylist.id;
          }
        } else {
          const newPlaylist = await api.post<{ id: string }>('/playlists', { site_id: activeSiteId, name: `${name} - slideshow` });
          playlistId = newPlaylist.id;
        }
        for (let i = 0; i < timelineItems.length; i++) {
          const item = timelineItems[i];
          const itemPayload: Record<string, unknown> = { content_id: item.contentId, position: i, duration_sec: item.duration, transition: item.transition };
          const normalizedCaption = typeof item.caption === 'string' ? item.caption.trim() : '';
          if (
            normalizedCaption.length > 0
            ||
            item.documentIndex !== undefined
            || item.documentLabel !== undefined
            || item.documentCaption !== undefined
            || item.documentSourceLabel !== undefined
            || item.documentHasTranslation !== undefined
            || item.translationDocumentIndex !== undefined
            || item.isTranslationDocument !== undefined
            || item.translationForDocumentIndex !== undefined
          ) {
            itemPayload.config = {
              ...(normalizedCaption.length > 0 ? { caption: normalizedCaption } : {}),
              ...(item.documentIndex !== undefined ? { documentIndex: item.documentIndex } : {}),
              ...(item.documentLabel !== undefined ? { documentLabel: item.documentLabel } : {}),
              ...(item.documentCaption !== undefined ? { documentCaption: item.documentCaption } : {}),
              ...(item.documentSourceLabel !== undefined ? { documentSourceLabel: item.documentSourceLabel } : {}),
              ...(item.documentHasTranslation !== undefined ? { documentHasTranslation: item.documentHasTranslation } : {}),
              ...(item.translationDocumentIndex !== undefined ? { translationDocumentIndex: item.translationDocumentIndex } : {}),
              ...(item.isTranslationDocument !== undefined ? { isTranslationDocument: item.isTranslationDocument } : {}),
              ...(item.translationForDocumentIndex !== undefined ? { translationForDocumentIndex: item.translationForDocumentIndex } : {}),
            };
          }
          await api.post(`/playlists/${playlistId}/items${batchPlaylistQuery}`, itemPayload);
        }
        finalConfig = { ...finalConfig, playlistId };
        delete (finalConfig as Record<string, unknown>)._timelineItems;
      }

      const selectedContentIds = finalConfig._selectedContentIds as string[] | undefined;
      if ((templateType === 'media-explorer' || templateType === 'app06-media-browser') && selectedContentIds && selectedContentIds.length > 0) {
        const batchPlaylistQuery = '?skip_app_refresh=true';
        const existingPlaylistId = finalConfig.playlistId as string | undefined;
        let playlistId: string;
        if (existingPlaylistId) {
          try {
            const existing = await api.get<{ items: Array<{ id: string }> }>(`/playlists/${existingPlaylistId}`);
            for (const item of existing.items) {
              await api.delete(`/playlists/${existingPlaylistId}/items/${item.id}${batchPlaylistQuery}`);
            }
            playlistId = existingPlaylistId;
          } catch {
            const newPlaylist = await api.post<{ id: string }>('/playlists', { site_id: activeSiteId, name: `${name} - media-explorer` });
            playlistId = newPlaylist.id;
          }
        } else {
          const newPlaylist = await api.post<{ id: string }>('/playlists', { site_id: activeSiteId, name: `${name} - media-explorer` });
          playlistId = newPlaylist.id;
        }
        const duration = (finalConfig.defaultDuration as number) || 8;
        const transition = (finalConfig.transition as string) || 'fade';
        for (let i = 0; i < selectedContentIds.length; i++) {
          await api.post(`/playlists/${playlistId}/items${batchPlaylistQuery}`, { content_id: selectedContentIds[i], position: i, duration_sec: duration, transition });
        }
        finalConfig = { ...finalConfig, playlistId };
        delete (finalConfig as Record<string, unknown>)._selectedContentIds;
      }

      delete (finalConfig as Record<string, unknown>)._appName;
      delete (finalConfig as Record<string, unknown>)._documents;
      if (finalConfig.idle === null) delete (finalConfig as Record<string, unknown>).idle;
      if (finalConfig.schedule === null) delete (finalConfig as Record<string, unknown>).schedule;

      if (isNew) {
        return api.post<AppSaveResponse>('/apps', { site_id: activeSiteId, name, template_type: templateType, config: finalConfig });
      }
      return api.put<AppSaveResponse>(`/apps/${id}`, { name, config: finalConfig });
    },
    onMutate: () => {
      const submittedSnapshot = createEditorSnapshot(name, templateType, appConfig);
      const nextState: SaveState = {
        ackedDeviceIds: [],
        message: 'Saving changes',
        phase: 'saving',
        requestId: null,
        targetDeviceIds: [],
      };
      saveStateRef.current = nextState;
      setSaveState(nextState);
      return { submittedSnapshot };
    },
    onSuccess: (savedApp, _variables, context) => {
      queryClient.invalidateQueries({ queryKey: ['apps', activeSiteId] });
      queryClient.invalidateQueries({ queryKey: ['app', id] });
      queryClient.invalidateQueries({ queryKey: ['devices', activeSiteId] });

      if (!isNew && context?.submittedSnapshot) {
        lastSavedSnapshotRef.current = context.submittedSnapshot;
      }

      if (isNew) {
        const nextState = createIdleSaveState();
        saveStateRef.current = nextState;
        setSaveState(nextState);
        addToast('success', 'App created');
        navigate('/apps', { replace: true });
        return;
      }

      const targetDeviceIds = Array.isArray(savedApp.cache_refresh_device_ids)
        ? savedApp.cache_refresh_device_ids.filter((deviceId): deviceId is string => Boolean(deviceId))
        : [];
      const requestId = typeof savedApp.cache_refresh_request_id === 'string'
        ? savedApp.cache_refresh_request_id
        : null;

      if (targetDeviceIds.length > 0 && requestId) {
        markDeviceSyncing(targetDeviceIds, requestId);

        for (const deviceId of targetDeviceIds) {
          adminWs.send({ type: 'subscribe:device', payload: { deviceId } });
        }

        const nextState = applyBufferedRequestState({
          ackedDeviceIds: [],
          message: getSyncStatusMessage(targetDeviceIds.length),
          phase: 'updating',
          requestId,
          targetDeviceIds,
        });
        saveStateRef.current = nextState;
        setSaveState(nextState);
        if (nextState.phase === 'updated') {
          addToast('success', 'Assigned device updated on screen');
          clearBufferedRequest(requestId);
        } else {
          addToast('info', targetDeviceIds.length === 1
            ? 'App saved. Updating assigned device...'
            : 'App saved. Updating assigned devices...'
          );
        }
        return;
      }

      if ((app?.device_count || 0) > 0 || assignedDeviceIds.length > 0) {
        markDeviceAgentOffline(assignedDeviceIds);
        const nextState: SaveState = {
          ackedDeviceIds: [],
          message: 'Agent offline',
          phase: 'waiting',
          requestId: null,
          targetDeviceIds: [],
        };
      saveStateRef.current = nextState;
      setSaveState(nextState);
      addToast('warning', 'App saved, but no connected agent is available to confirm the update yet');
      return;
      }

      const nextState: SaveState = {
        ackedDeviceIds: [],
        message: 'No device assigned',
        phase: 'updated',
        requestId: null,
        targetDeviceIds: [],
      };
      saveStateRef.current = nextState;
      setSaveState(nextState);
      addToast('info', 'App saved, but no devices are currently assigned to this app');
    },
    onError: (err) => {
      const nextState: SaveState = {
        ackedDeviceIds: [],
        message: err instanceof Error ? err.message : 'Failed to save app',
        phase: 'failed',
        requestId: null,
        targetDeviceIds: [],
      };
      saveStateRef.current = nextState;
      setSaveState(nextState);
      addToast('error', err instanceof Error ? err.message : 'Failed to save app');
      clearBufferedRequest(saveStateRef.current.requestId);
    },
  });

  useEffect(() => {
    if (isNew) return;
    if (!lastSavedSnapshotRef.current) return;
    if (saveMutation.isPending) return;

    const currentSnapshot = createEditorSnapshot(name, templateType, appConfig);
    const matchesSaved = currentSnapshot === lastSavedSnapshotRef.current;
    const current = saveStateRef.current;

    if (matchesSaved) {
      if (current.phase === 'dirty') {
        const nextState = createIdleSaveState();
        saveStateRef.current = nextState;
        setSaveState(nextState);
      }
      return;
    }

    if (current.phase === 'saving') {
      return;
    }

    if (current.phase !== 'dirty') {
      const nextState: SaveState = {
        ackedDeviceIds: [],
        message: 'Unsaved changes',
        phase: 'dirty',
        requestId: null,
        targetDeviceIds: [],
      };
      saveStateRef.current = nextState;
      setSaveState(nextState);
    }
  }, [appConfig, isNew, name, saveMutation.isPending, templateType]);

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/apps/${id}`),
    onSuccess: () => {
      addToast('success', 'Installation deleted');
      queryClient.invalidateQueries({ queryKey: ['apps', activeSiteId] });
      navigate('/apps', { replace: true });
    },
    onError: (err) => addToast('error', err instanceof Error ? err.message : 'Failed to delete'),
  });

  if (!isNew && appLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner size="lg" className="text-surface-400" />
      </div>
    );
  }

  if (!isNew && !app && !appLoading) {
    return (
      <div className="space-y-5">
        <nav className="flex items-center gap-2 text-base">
          <button onClick={() => navigate('/apps')} className="text-surface-500 hover:text-surface-700 transition-colors">
            Apps
          </button>
          <ChevronRight className="h-4 w-4 text-surface-400" />
          <span className="text-surface-900 font-medium">Not Found</span>
        </nav>
        <div className="bryzos-card rounded-3xl p-14 text-center">
          <AppWindow className="h-14 w-14 text-surface-300 mx-auto mb-4" />
          <p className="text-lg text-surface-500">App not found or no longer available.</p>
          <button
            onClick={() => navigate('/apps')}
            className="mt-5 text-base font-medium text-primary-600 hover:text-primary-700 transition-colors"
          >
            Back to Apps
          </button>
        </div>
      </div>
    );
  }

  const canSave = name.trim() && templateType;
  const selectedMeta = templateType ? getTemplateMeta(templateType) : null;
  const showTemplatePicker = isNew && !templateType;
  const showConfigView = templateType && TEMPLATE_DEFAULTS[templateType] !== undefined;
  const isSaving = saveMutation.isPending || saveState.phase === 'saving';
  const hasUnsavedChanges = isNew || saveState.phase === 'dirty' || saveState.phase === 'failed';
  const disableSaveButton = !canSave || isSaving || saveState.phase === 'updating' || saveState.phase === 'waiting' || (!isNew && !hasUnsavedChanges);

  const renderSaveButtonContent = (idleLabel: string) => {
    if (isSaving) {
      return (
        <>
          <Spinner size="sm" />
          Saving...
        </>
      );
    }

    return (
      <>
        <Save className="h-4 w-4" />
        {idleLabel}
      </>
    );
  };

  const renderAssignedDeviceStatus = (device: Device) => {
    const syncStatus = deviceSyncStatuses[device.id];

    if (syncStatus) {
      return <DeviceSyncBadge status={syncStatus} />;
    }

    if (!device.agent_connected) {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          Agent offline
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-surface-200 card-bg px-2.5 py-1 text-xs font-medium text-surface-500">
        Waiting for save
      </span>
    );
  };

  return (
    <div className="space-y-6">

      {/* ── Top bar ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              if (isNew && templateType) {
                setTemplateType('');
                setAppConfig({});
              } else {
                navigate('/apps');
              }
            }}
            className="h-10 w-10 rounded-xl flex items-center justify-center text-surface-500 hover:text-surface-800 hover:bg-surface-200/50 transition-all"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-surface-900 tracking-tight leading-tight">
              {showTemplatePicker ? 'Choose a Template' : isNew ? 'New App' : name || 'Untitled'}
            </h1>
            {!showTemplatePicker && selectedMeta && (
              <p className="text-xs text-surface-400 mt-0.5">{selectedMeta.shortLabel}</p>
            )}
          </div>
        </div>

        {showConfigView && (
          <div className="flex items-center gap-2">
            {!isNew && (
              <button
                onClick={() => setDeleteConfirmOpen(true)}
                className="h-9 w-9 rounded-lg flex items-center justify-center border border-red-200 text-red-400 hover:text-red-600 hover:bg-red-50 dark:border-red-500/30 dark:hover:text-red-300 dark:hover:bg-red-500/10 transition-all"
                title="Delete app"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={disableSaveButton}
              className="h-9 px-5 rounded-xl text-sm"
            >
              {renderSaveButtonContent(isNew ? 'Create App' : 'Save')}
            </Button>
          </div>
        )}
      </div>

      {/* ── STEP 1: Template Picker ── */}
      <AnimatePresence mode="wait">
        {showTemplatePicker && (
          <motion.div
            key="template-picker"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="space-y-8"
          >
            {/* Intro */}
            <div className="bryzos-card rounded-3xl px-8 py-6 flex items-center gap-5">
              <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center shrink-0 shadow-lg shadow-primary-500/20">
                <Sparkles className="h-6 w-6 text-white" />
              </div>
              <div>
                <h2 className="font-bold text-surface-900 text-base">Select a Template</h2>
                <p className="text-sm text-surface-400 mt-0.5">
                  Each template is designed for a specific type of museum exhibit interaction.
                </p>
              </div>
            </div>

            {TEMPLATE_GROUPS.map((group, gi) => (
              <div key={group.group}>
                {/* Group divider */}
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-[11px] font-bold text-surface-400 uppercase tracking-widest whitespace-nowrap">
                    {group.group}
                  </span>
                  <div className="flex-1 h-px bg-surface-200" />
                  <span className="text-[11px] text-surface-400 tabular-nums shrink-0">
                    {group.items.length}
                  </span>
                </div>

                <div className={clsx(
                  'grid gap-4',
                  gi === 0
                    ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
                    : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
                )}>
                  {group.items.map((tplKey) => {
                    const meta = getTemplateMeta(tplKey);
                    const Icon = meta.icon;

                    return (
                      <motion.button
                        key={tplKey}
                        whileHover={{ y: -2, scale: 1.005 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => {
                          setTemplateType(tplKey);
                          setAppConfig({ ...(TEMPLATE_DEFAULTS[tplKey] || {}) });
                        }}
                        className="relative text-left rounded-2xl border border-surface-200 card-bg hover:border-primary-300 hover:shadow-lg hover:shadow-black/5 transition-all duration-200 group overflow-hidden"
                      >
                        {/* Accent top bar using template gradient */}
                        <div className={clsx('h-[3px] w-full bg-gradient-to-r', meta.gradientFrom, meta.gradientTo)} />

                        <div className="p-5">
                          {/* Icon */}
                          <div className={clsx(
                            'h-12 w-12 rounded-xl flex items-center justify-center mb-4 bg-gradient-to-br text-white shadow-md transition-transform duration-200 group-hover:scale-105',
                            meta.gradientFrom, meta.gradientTo
                          )}>
                            <Icon className="h-6 w-6" />
                          </div>

                          {/* Label badge */}
                          <div
                            className="text-[10px] font-bold uppercase tracking-widest mb-1"
                            style={{ color: meta.color, opacity: 0.7 }}
                          >
                            {meta.label}
                          </div>

                          {/* Name */}
                          <div className="text-[15px] font-semibold text-surface-900 leading-snug group-hover:text-primary-700 transition-colors">
                            {meta.shortLabel}
                          </div>

                          {/* Description */}
                          <p className="text-[13px] text-surface-400 mt-1.5 leading-relaxed line-clamp-2">
                            {meta.description}
                          </p>
                        </div>

                        {/* Hover arrow */}
                        <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                          <div
                            className="h-6 w-6 rounded-full flex items-center justify-center"
                            style={{ background: `${meta.color}16` }}
                          >
                            <ChevronRight className="h-3.5 w-3.5" style={{ color: meta.color }} />
                          </div>
                        </div>
                      </motion.button>
                    );
                  })}
                </div>
              </div>
            ))}
          </motion.div>
        )}

        {/* ── STEP 2: Config view ── */}
        {showConfigView && (
          <motion.div
            key="config-view"
            initial={isNew ? { opacity: 0, y: 12 } : false}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="space-y-6"
          >
            {/* App name row */}
            <div className="flex items-center gap-3">
              {selectedMeta && (
                <div className={clsx(
                  'h-10 w-10 rounded-xl flex items-center justify-center bg-gradient-to-br text-white shadow-sm shrink-0',
                  selectedMeta.gradientFrom, selectedMeta.gradientTo
                )}>
                  <selectedMeta.icon className="h-5 w-5" />
                </div>
              )}
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter app name..."
                autoFocus={isNew}
                className="w-72 h-10 px-3 rounded-xl border border-surface-200 card-bg text-sm text-surface-900 placeholder:text-surface-300 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400 transition-all"
              />
              {isNew && selectedMeta && (
                <button
                  onClick={() => { setTemplateType(''); setAppConfig({}); }}
                  className="text-xs text-primary-500 hover:text-primary-700 transition-colors shrink-0 font-medium"
                >
                  Change template
                </button>
              )}
            </div>

            {!isNew && (
              <div className="bryzos-card rounded-2xl border border-surface-200/80 px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-surface-900">Assigned devices</h2>
                    <p className="mt-1 text-xs text-surface-500">
                      Live rollout status stays here for each device assigned to this app.
                    </p>
                  </div>
                  <span className="rounded-full bg-surface-100 px-2.5 py-1 text-xs font-medium text-surface-600">
                    {assignedDevices.length} device{assignedDevices.length === 1 ? '' : 's'}
                  </span>
                </div>

                {assignedDevices.length === 0 ? (
                  <div className="mt-4 rounded-xl border border-dashed border-surface-200 bg-surface-50 px-4 py-3 text-sm text-surface-500">
                    No devices are currently assigned to this app.
                  </div>
                ) : (
                  <div className="mt-4 space-y-2">
                    {assignedDevices.map((device) => (
                      <div
                        key={device.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-surface-100 card-bg px-3 py-3"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-surface-900">
                            {device.display_name}
                          </div>
                          <div className="text-xs text-surface-500">
                            {device.type}
                          </div>
                        </div>
                        <div className="shrink-0">
                          {renderAssignedDeviceStatus(device)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Configuration panel */}
            <TemplateConfigPanel
              template={templateType}
              config={{ ...appConfig, _appName: name }}
              onChange={setAppConfig}
              siteId={activeSiteId || ''}
            />

            {/* Bottom save bar */}
            <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={disableSaveButton}
                className="h-10 px-6 rounded-xl text-sm"
              >
                {renderSaveButtonContent(isNew ? 'Create App' : 'Save Changes')}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={deleteConfirmOpen}
        title="Delete Installation?"
        message={`This will permanently delete "${name}". Any devices assigned to this installation will be unassigned. This action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        loading={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate()}
        onCancel={() => setDeleteConfirmOpen(false)}
      />
    </div>
  );
}
