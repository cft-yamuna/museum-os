import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Minus, Monitor, Plus, Save, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import type { App, Device } from '../lib/types';
import { useToastStore } from '../stores/toast';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';

interface AppSaveResponse extends App {
  cache_refresh_device_ids?: string[];
  cache_refresh_request_id?: string | null;
}

interface ReceptionScreenConfig {
  screenIndex: number;
  screenLabel?: string;
  mode?: string;
  videoUrl?: string;
  guestNames?: string[];
  guestNameFontSizeRem?: number;
  welcomeSlides?: unknown[];
  infoSlides?: unknown[];
}

const DEFAULT_GUEST_NAME_FONT_SIZE_REM = 3.5;
const MIN_GUEST_NAME_FONT_SIZE_REM = 2;
const MAX_GUEST_NAME_FONT_SIZE_REM = 12;

const DEFAULT_RECEPTION_CONFIG: Record<string, unknown> = {
  screens: [
    { screenIndex: 0, screenLabel: 'Left Screen', mode: 'slides', videoUrl: '', guestNames: [], guestNameFontSizeRem: DEFAULT_GUEST_NAME_FONT_SIZE_REM, welcomeSlides: [], infoSlides: [] },
    { screenIndex: 1, screenLabel: 'Center Screen', mode: 'slides', videoUrl: '', guestNames: [], guestNameFontSizeRem: DEFAULT_GUEST_NAME_FONT_SIZE_REM, welcomeSlides: [], infoSlides: [] },
    { screenIndex: 2, screenLabel: 'Right Screen', mode: 'slides', videoUrl: '', guestNames: [], guestNameFontSizeRem: DEFAULT_GUEST_NAME_FONT_SIZE_REM, welcomeSlides: [], infoSlides: [] },
  ],
};

function createSnapshot(config: Record<string, unknown>) {
  return JSON.stringify(config);
}

function cleanReceptionConfig(config: Record<string, unknown>) {
  const next = { ...config };
  delete next._appName;
  if (next.idle === null) delete next.idle;
  if (next.schedule === null) delete next.schedule;
  return next;
}

function getReceptionScreens(config: Record<string, unknown>): ReceptionScreenConfig[] {
  return (config.screens as ReceptionScreenConfig[] | undefined) || (DEFAULT_RECEPTION_CONFIG.screens as ReceptionScreenConfig[]);
}

function getRightScreen(config: Record<string, unknown>): ReceptionScreenConfig {
  const screens = getReceptionScreens(config);
  return screens.find((screen) => screen.screenIndex === 2) || screens[2] || {
    screenIndex: 2,
    screenLabel: 'Right Screen',
    mode: 'slides',
    videoUrl: '',
    guestNames: [],
    guestNameFontSizeRem: DEFAULT_GUEST_NAME_FONT_SIZE_REM,
    welcomeSlides: [],
    infoSlides: [],
  };
}

function clampGuestNameFontSizeRem(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_GUEST_NAME_FONT_SIZE_REM;
  return Math.round(Math.min(MAX_GUEST_NAME_FONT_SIZE_REM, Math.max(MIN_GUEST_NAME_FONT_SIZE_REM, parsed)) * 10) / 10;
}

export function ReceptionEditorPage() {
  const { deviceId } = useParams<{ deviceId: string }>();
  const queryClient = useQueryClient();
  const addToast = useToastStore((s) => s.addToast);
  const [appConfig, setAppConfig] = useState<Record<string, unknown>>({});
  const [savedSnapshot, setSavedSnapshot] = useState('');

  const { data: device, isLoading: deviceLoading, error: deviceError } = useQuery({
    queryKey: ['reception-device', deviceId],
    queryFn: () => api.get<Device>(`/devices/${deviceId}`),
    enabled: !!deviceId,
  });

  const { data: app, isLoading: appLoading, error: appError } = useQuery({
    queryKey: ['reception-app', device?.app_id],
    queryFn: () => api.get<App>(`/apps/${device?.app_id}`),
    enabled: !!device?.app_id,
  });

  useEffect(() => {
    if (!app) return;
    const merged = {
      ...DEFAULT_RECEPTION_CONFIG,
      ...app.config,
      _appName: app.name,
    };
    setAppConfig(merged);
    setSavedSnapshot(createSnapshot(merged));
  }, [app?.id, app?.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps

  const isReceptionApp = app?.template_type === 'custom06-reception-program';
  const rightScreen = getRightScreen(appConfig);
  const guestNames = rightScreen.guestNames || [];
  const guestNameFontSizeRem = clampGuestNameFontSizeRem(rightScreen.guestNameFontSizeRem);

  const updateRightScreen = (updates: Partial<ReceptionScreenConfig>) => {
    const screens = [...getReceptionScreens(appConfig)];
    const rightIndex = screens.findIndex((screen) => screen.screenIndex === 2);
    const nextRightScreen = {
      ...rightScreen,
      screenIndex: 2,
      ...updates,
    };

    if (rightIndex >= 0) {
      screens[rightIndex] = nextRightScreen;
    } else {
      screens.push(nextRightScreen);
      screens.sort((a, b) => a.screenIndex - b.screenIndex);
    }

    const nextConfig = { ...appConfig, screens };
    setAppConfig(nextConfig);
    return nextConfig;
  };

  const updateGuestNames = (names: string[]) => {
    updateRightScreen({ guestNames: names });
  };

  const updateGuestName = (idx: number, value: string) => {
    const names = [...guestNames];
    names[idx] = value;
    updateGuestNames(names);
  };

  const addGuestName = () => {
    updateGuestNames([...guestNames, '']);
  };

  const removeGuestName = (idx: number) => {
    updateGuestNames(guestNames.filter((_, nameIndex) => nameIndex !== idx));
  };

  const isDirty = useMemo(() => {
    if (!savedSnapshot) return false;
    return createSnapshot(appConfig) !== savedSnapshot;
  }, [appConfig, savedSnapshot]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!app) throw new Error('Reception app is not loaded');
      const finalConfig = cleanReceptionConfig(appConfig);
      return api.put<AppSaveResponse>(`/apps/${app.id}`, { config: finalConfig });
    },
    onSuccess: (savedApp) => {
      const merged = {
        ...DEFAULT_RECEPTION_CONFIG,
        ...savedApp.config,
        _appName: savedApp.name,
      };
      setAppConfig(merged);
      setSavedSnapshot(createSnapshot(merged));
      queryClient.invalidateQueries({ queryKey: ['reception-app', app?.id] });
      queryClient.invalidateQueries({ queryKey: ['app', app?.id] });

      const targetIds = savedApp.cache_refresh_device_ids || [];
      if (device?.id && targetIds.includes(device.id)) {
        addToast('success', 'Reception content saved. Updating this screen...');
      } else {
        addToast('success', 'Reception content saved');
      }
    },
    onError: (err) => {
      addToast('error', err instanceof Error ? err.message : 'Failed to save reception content');
    },
  });

  const fontSizeMutation = useMutation({
    mutationFn: async ({ nextSize, nextConfig, wasDirty }: { nextSize: number; nextConfig: Record<string, unknown>; wasDirty: boolean }) => {
      if (!deviceId) throw new Error('Reception device is not loaded');
      const result = await api.put<{
        guestNames: string[];
        guestNameFontSizeRem: number;
        cache_refresh_device_ids?: string[];
        cache_refresh_request_id?: string | null;
      }>(`/reception/${deviceId}/names`, { guestNameFontSizeRem: nextSize });
      return { result, nextConfig, wasDirty };
    },
    onSuccess: ({ result, nextConfig, wasDirty }) => {
      const savedSize = clampGuestNameFontSizeRem(result.guestNameFontSizeRem);
      const configWithSavedSize = (() => {
        const screens = [...getReceptionScreens(nextConfig)];
        const rightIndex = screens.findIndex((screen) => screen.screenIndex === 2);
        if (rightIndex >= 0) {
          screens[rightIndex] = { ...screens[rightIndex], guestNameFontSizeRem: savedSize };
        }
        return { ...nextConfig, screens };
      })();
      setAppConfig(configWithSavedSize);
      if (!wasDirty) {
        setSavedSnapshot(createSnapshot(configWithSavedSize));
      }
    },
    onError: (err) => {
      addToast('error', err instanceof Error ? err.message : 'Failed to update name font size');
    },
  });

  const updateGuestNameFontSize = (value: number) => {
    const nextSize = clampGuestNameFontSizeRem(value);
    const wasDirty = isDirty;
    const nextConfig = updateRightScreen({ guestNameFontSizeRem: nextSize });
    fontSizeMutation.mutate({ nextSize, nextConfig, wasDirty });
  };

  const isLoading = deviceLoading || (!!device?.app_id && appLoading);
  const error = deviceError || appError;

  if (isLoading) {
    return (
      <div className="min-h-screen page-bg flex items-center justify-center">
        <Spinner size="lg" className="text-surface-400" />
      </div>
    );
  }

  if (error || !device) {
    return (
      <div className="min-h-screen page-bg flex items-center justify-center p-6">
        <div className="max-w-md rounded-2xl border border-surface-200 bg-white p-6 text-center">
          <Monitor className="mx-auto mb-3 h-9 w-9 text-surface-300" />
          <h1 className="text-lg font-bold text-surface-900">Reception device not found</h1>
          <p className="mt-2 text-sm text-surface-500">
            Check the device id in the URL and try again.
          </p>
        </div>
      </div>
    );
  }

  if (!device.app_id) {
    return (
      <div className="min-h-screen page-bg flex items-center justify-center p-6">
        <div className="max-w-md rounded-2xl border border-surface-200 bg-white p-6 text-center">
          <Monitor className="mx-auto mb-3 h-9 w-9 text-surface-300" />
          <h1 className="text-lg font-bold text-surface-900">No app assigned</h1>
          <p className="mt-2 text-sm text-surface-500">
            Assign the reception app to {device.display_name} before editing content here.
          </p>
        </div>
      </div>
    );
  }

  if (!app || !isReceptionApp) {
    return (
      <div className="min-h-screen page-bg flex items-center justify-center p-6">
        <div className="max-w-md rounded-2xl border border-surface-200 bg-white p-6 text-center">
          <Monitor className="mx-auto mb-3 h-9 w-9 text-surface-300" />
          <h1 className="text-lg font-bold text-surface-900">Not a reception app</h1>
          <p className="mt-2 text-sm text-surface-500">
            This device is assigned to {device.app_name || 'another app'}, not Reception Program.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen page-bg">
      <main className="mx-auto max-w-5xl px-5 py-6 lg:px-8 lg:py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-3xl font-bold tracking-tight text-surface-900">Right Screen Names</h1>
            <p className="mt-2 text-lg text-surface-500">
              {device.display_name}
            </p>
          </div>
          <Button
            onClick={() => saveMutation.mutate()}
            loading={saveMutation.isPending}
            disabled={!isDirty || saveMutation.isPending}
            className="h-14 px-7 text-lg"
          >
            <Save className="h-5 w-5" />
            Save
          </Button>
        </div>

        <section className="rounded-2xl border border-surface-200 bg-white shadow-sm">
          <div className="border-b border-surface-100 bg-surface-50/60 px-7 py-6">
            <h2 className="text-2xl font-bold text-surface-900">Guest Name List</h2>
            <p className="mt-2 text-base text-surface-500">
              Add names for the right reception screen.
            </p>
          </div>

          <div className="space-y-6 p-7">
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-surface-200 bg-surface-50 px-4 py-4">
              <div className="mr-auto">
                <div className="text-base font-bold text-surface-900">Name Font Size</div>
                <div className="mt-1 text-sm text-surface-500">Auto-applies to the right screen.</div>
              </div>
              <button
                type="button"
                onClick={() => updateGuestNameFontSize(guestNameFontSizeRem - 0.2)}
                disabled={fontSizeMutation.isPending || guestNameFontSizeRem <= MIN_GUEST_NAME_FONT_SIZE_REM}
                className="flex h-12 w-12 items-center justify-center rounded-xl border border-surface-200 bg-white text-surface-700 transition-colors hover:border-primary-300 hover:text-primary-600 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Decrease name font size"
              >
                <Minus className="h-5 w-5" />
              </button>
              <div className="min-w-[104px] rounded-xl border border-surface-200 bg-white px-4 py-3 text-center text-lg font-bold text-surface-900">
                {guestNameFontSizeRem.toFixed(1)}rem
              </div>
              <button
                type="button"
                onClick={() => updateGuestNameFontSize(guestNameFontSizeRem + 0.2)}
                disabled={fontSizeMutation.isPending || guestNameFontSizeRem >= MAX_GUEST_NAME_FONT_SIZE_REM}
                className="flex h-12 w-12 items-center justify-center rounded-xl border border-surface-200 bg-white text-surface-700 transition-colors hover:border-primary-300 hover:text-primary-600 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Increase name font size"
              >
                <Plus className="h-5 w-5" />
              </button>
            </div>

            {guestNames.length === 0 && (
              <div className="rounded-xl border border-dashed border-surface-200 bg-surface-50 px-5 py-12 text-center text-lg text-surface-500">
                No guest names added.
              </div>
            )}

            {guestNames.map((name, idx) => (
              <div key={`guest-name-${idx}`} className="flex items-center gap-3">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => updateGuestName(idx, e.target.value)}
                  placeholder={`Name ${idx + 1}`}
                  className="h-16 flex-1 rounded-2xl border border-surface-200 bg-white px-5 text-2xl font-semibold text-surface-800 placeholder:text-surface-400 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                />
                <button
                  type="button"
                  onClick={() => removeGuestName(idx)}
                  className="flex h-16 w-16 items-center justify-center rounded-2xl border border-red-200 text-red-400 transition-colors hover:bg-red-50 hover:text-red-600"
                  aria-label={`Remove name ${idx + 1}`}
                >
                  <Trash2 className="h-6 w-6" />
                </button>
              </div>
            ))}

            <button
              type="button"
              onClick={addGuestName}
              className="flex h-16 w-full items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-surface-200 text-xl font-semibold text-surface-500 transition-colors hover:border-primary-300 hover:text-primary-600"
            >
              <Plus className="h-6 w-6" />
              Add Name
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
