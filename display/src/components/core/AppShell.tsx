import React, { useState, useEffect, useCallback, useRef, createContext, useContext } from 'react';
import type { AnyAppConfig, DeviceConfig, FallbackContent, WSEvent, WSConfigUpdated } from '@/lib/types';
import type { ConnectionState } from '@/lib/ws';
import { config } from '@/lib/config';
import { getDeviceConfig } from '@/lib/api';
import { localEventManager } from '@/lib/localEvents';
import { useFullscreen } from '@/hooks/useFullscreen';
import { useLogger } from '@/hooks/useLogger';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useWatchdog } from '@/hooks/useWatchdog';
import { LoadingScreen } from './LoadingScreen';
import { ErrorScreen } from './ErrorScreen';
import { FallbackPlaylist, type FallbackActiveInfo } from './FallbackPlaylist';

// ==========================================
// Types
// ==========================================

interface AppShellProps {
  children: (config: AnyAppConfig, templateType: string, instanceId: string, revision: string) => React.ReactNode;
}

interface AppShellContextValue {
  instanceId: string;
  templateType: string;
  config: AnyAppConfig | null;
  isIdle: boolean;
  connectionState: ConnectionState;
  send: (event: string, payload: unknown) => void;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  onError?: (error: Error) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  retryCount: number;
  errorCount: number;
  lastErrorTime: number;
  countdown: number;
}

interface PendingRenderAck {
  instanceId: string;
  requestId: string;
  revision: string;
  templateType: string;
}

// ==========================================
// Context
// ==========================================

const AppShellContext = createContext<AppShellContextValue | null>(null);

function useAppShell(): AppShellContextValue {
  const ctx = useContext(AppShellContext);
  if (!ctx) {
    throw new Error('useAppShell must be used within AppShell');
  }
  return ctx;
}

// ==========================================
// Error Boundary (Class Component)
// ==========================================

const MAX_ERROR_RETRIES = 3;
const ERROR_RETRY_DELAY = 10; // seconds
const RAPID_ERROR_THRESHOLD = 3;
const RAPID_ERROR_WINDOW_MS = 60000;

class AppErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  private retryTimer: ReturnType<typeof setTimeout> | null;
  private countdownTimer: ReturnType<typeof setInterval> | null;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      retryCount: 0,
      errorCount: 0,
      lastErrorTime: 0,
      countdown: 0,
    };
    this.retryTimer = null;
    this.countdownTimer = null;
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);

    this.props.onError?.(error);

    const now = Date.now();
    const timeSinceLastError = now - this.state.lastErrorTime;
    let newErrorCount = this.state.errorCount;

    if (timeSinceLastError < RAPID_ERROR_WINDOW_MS) {
      newErrorCount = newErrorCount + 1;
    } else {
      newErrorCount = 1;
    }

    this.setState({
      errorCount: newErrorCount,
      lastErrorTime: now,
    }, () => {
      if (newErrorCount >= RAPID_ERROR_THRESHOLD) {
        console.warn(`[ErrorBoundary] Rapid errors detected (${newErrorCount} in ${RAPID_ERROR_WINDOW_MS}ms), reloading page`);
        try {
          window.location.reload();
        } catch (_e) {
          // Fall through to normal retry
        }
        return;
      }

      if (this.state.retryCount < MAX_ERROR_RETRIES) {
        this.scheduleRetry();
      }
    });
  }

  componentWillUnmount(): void {
    if (this.retryTimer !== null) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    if (this.countdownTimer !== null) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
  }

  scheduleRetry = (): void => {
    if (this.retryTimer !== null) {
      clearTimeout(this.retryTimer);
    }
    if (this.countdownTimer !== null) {
      clearInterval(this.countdownTimer);
    }

    this.setState({ countdown: ERROR_RETRY_DELAY });

    this.countdownTimer = setInterval(() => {
      this.setState((prev: ErrorBoundaryState) => {
        const next = prev.countdown - 1;
        if (next <= 0) {
          if (this.countdownTimer !== null) {
            clearInterval(this.countdownTimer);
            this.countdownTimer = null;
          }
          return { countdown: 0 };
        }
        return { countdown: next };
      });
    }, 1000);

    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (this.countdownTimer !== null) {
        clearInterval(this.countdownTimer);
        this.countdownTimer = null;
      }
      this.handleRetry();
    }, ERROR_RETRY_DELAY * 1000);
  };

  handleRetry = (): void => {
    this.setState((prev: ErrorBoundaryState) => ({
      hasError: false,
      error: null,
      retryCount: prev.retryCount + 1,
      countdown: 0,
    }));
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      const errorMessage = this.state.error?.message ?? 'An unexpected error occurred';

      const isPermanent = this.state.retryCount >= MAX_ERROR_RETRIES;
      let deviceId = '';
      try {
        deviceId = config().deviceId;
      } catch (_e) {
        deviceId = 'unknown';
      }

      const detailParts: string[] = [];
      detailParts.push(errorMessage);
      if (deviceId) {
        detailParts.push(`Device: ${deviceId}`);
      }
      detailParts.push(`Retry ${this.state.retryCount + 1}/${MAX_ERROR_RETRIES}`);
      const detailMessage = detailParts.join('\n');

      if (isPermanent) {
        return React.createElement(ErrorScreen, {
          message: `A persistent error has occurred. Please contact support.\n\n${errorMessage}\n\nDevice: ${deviceId}`,
          onRetry: this.handleRetry,
        });
      }

      return React.createElement(ErrorScreen, {
        message: detailMessage,
        retryIn: this.state.countdown > 0 ? this.state.countdown : ERROR_RETRY_DELAY,
        onRetry: this.handleRetry,
      });
    }

    return this.props.children;
  }
}

// ==========================================
// AppShellInner (Functional Component)
// ==========================================

const CONFIG_FETCH_MAX_RETRIES = 3;
const CONFIG_FETCH_RETRY_DELAY = 5000;

function waitForNextPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        resolve();
      });
    });
  });
}

function isVisibleMediaElement(element: HTMLImageElement | HTMLVideoElement): boolean {
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  const style = window.getComputedStyle(element);
  return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
}

// Resolves `true` if the element loaded successfully, `false` if it errored.
function waitForMediaElement(element: HTMLImageElement | HTMLVideoElement): Promise<boolean> {
  if (element instanceof HTMLImageElement) {
    // `complete` is true after BOTH successful and failed loads;
    // naturalWidth === 0 means the image failed to decode/load.
    if (element.complete) {
      return Promise.resolve(element.naturalWidth > 0);
    }

    return new Promise((resolve) => {
      element.addEventListener('load', () => resolve(true), { once: true });
      element.addEventListener('error', () => resolve(false), { once: true });
    });
  }

  if (element.readyState >= 2) {
    return Promise.resolve(true);
  }
  if (!element.currentSrc && !element.src) {
    // No source to load yet — treat as ready so we don't block on an empty slot.
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    element.addEventListener('loadeddata', () => resolve(true), { once: true });
    element.addEventListener('canplay', () => resolve(true), { once: true });
    element.addEventListener('error', () => resolve(false), { once: true });
  });
}

interface MediaReadiness {
  total: number;
  failed: number;
  timedOut: boolean;
}

async function waitForVisibleMedia(timeoutMs = 12000): Promise<MediaReadiness> {
  const media = Array.from(document.querySelectorAll('img, video'))
    .filter((element): element is HTMLImageElement | HTMLVideoElement => {
      return element instanceof HTMLImageElement || element instanceof HTMLVideoElement;
    })
    .filter((element) => isVisibleMediaElement(element));

  if (media.length === 0) return { total: 0, failed: 0, timedOut: false };

  let failed = 0;
  let settled = 0;
  const tracked = media.map((element) =>
    waitForMediaElement(element).then((ok) => {
      settled += 1;
      if (!ok) failed += 1;
    })
  );

  let timer: ReturnType<typeof setTimeout> | null = null;
  await Promise.race([
    Promise.all(tracked).then(() => undefined),
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, timeoutMs);
    }),
  ]);
  if (timer) clearTimeout(timer);

  // Anything that didn't settle before the timeout is treated as not-ready.
  return { total: media.length, failed, timedOut: settled < media.length };
}

function AppShellInner(props: AppShellProps) {
  const children = props.children;
  const cfg = config();

  // ---- State ----
  const [appConfig, setAppConfig] = useState<AnyAppConfig | null>(null);
  const [templateType, setTemplateType] = useState('');
  const [instanceId, setInstanceId] = useState('');
  const [activeRevision, setActiveRevision] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isIdle, setIsIdle] = useState(false);
  const [orientation, setOrientation] = useState<'landscape' | 'portrait'>('landscape');
  const [pendingRenderAck, setPendingRenderAck] = useState<PendingRenderAck | null>(null);
  // Fallback content (resolved server-side) + whether we've switched to it
  // because the assigned app's media failed to load.
  const [fallback, setFallback] = useState<FallbackContent | null>(null);
  const [fallbackActive, setFallbackActive] = useState(false);

  const mountedRef = useRef(true);
  const fetchRetryCountRef = useRef(0);
  const fetchRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [viewport, setViewport] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));

  // ---- Hooks ----
  useFullscreen({ enabled: true });

  const log = useLogger({
    deviceId: cfg.deviceId,
    templateType: templateType || 'unknown',
  });

  const ws = useWebSocket({
    deviceId: cfg.deviceId,
    instanceId: instanceId || 'pending',
    templateType: templateType || 'unknown',
    enabled: Boolean(cfg.deviceId),
  });

  useWatchdog({ enabled: true });

  const applyDeviceConfigPayload = useCallback((deviceConfig: DeviceConfig) => {
    // Refresh fallback content and give the (re)assigned app a fresh chance to
    // render its own media before we'd switch to the fallback again.
    setFallback(deviceConfig.fallback ?? null);
    setFallbackActive(false);

    const assignedApp = deviceConfig.assignedApp;
    const hasAssignedApp = Boolean(
      assignedApp
      && typeof assignedApp.templateType === 'string'
      && assignedApp.templateType.trim().length > 0
      && typeof assignedApp.instanceId === 'string'
      && assignedApp.instanceId.trim().length > 0
    );

    if (!hasAssignedApp || !assignedApp) {
      setAppConfig(null);
      setTemplateType('');
      setInstanceId('');
      setActiveRevision('');
      setPendingRenderAck(null);
      setLoadError(null);
      setIsLoading(false);
      log.warn('No app assigned to device', { deviceId: cfg.deviceId });
      return;
    }

    let finalConfig = assignedApp.config;
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const screenIndexParam = urlParams.get('screenIndex');
      if (screenIndexParam !== null) {
        const parsedScreenIndex = parseInt(screenIndexParam, 10);
        if (!Number.isNaN(parsedScreenIndex) && parsedScreenIndex >= 0) {
          finalConfig = Object.assign({}, finalConfig, { screenIndex: parsedScreenIndex });
        }
      }
    } catch (_e) {
      // ignore URL parsing errors
    }

    if (deviceConfig.device?.orientation === 'portrait') {
      setOrientation('portrait');
    } else {
      setOrientation('landscape');
    }

    setAppConfig(finalConfig);
    setTemplateType(assignedApp.templateType);
    setInstanceId(assignedApp.instanceId);
    setActiveRevision(assignedApp.revision || '');
    setIsLoading(false);
    setLoadError(null);
    fetchRetryCountRef.current = 0;
    log.info('Config loaded successfully', {
      instanceId: assignedApp.instanceId,
      templateType: assignedApp.templateType,
      revision: assignedApp.revision || 'none',
    });
  }, [cfg.deviceId, log]);

  // ---- Config Fetch ----

  const fetchConfig = useCallback(() => {
    if (!cfg.deviceId) {
      setLoadError('No device credentials found');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setLoadError(null);

    getDeviceConfig(cfg.deviceId).then(
      (deviceConfig) => {
        if (!mountedRef.current) return;
        applyDeviceConfigPayload(deviceConfig);
      },
      (error) => {
        if (!mountedRef.current) return;

        const errorMsg = error instanceof Error ? error.message : String(error);
        log.error('Failed to fetch config', { error: errorMsg });

        if (fetchRetryCountRef.current < CONFIG_FETCH_MAX_RETRIES) {
          fetchRetryCountRef.current = fetchRetryCountRef.current + 1;
          log.info('Retrying config fetch', {
            attempt: fetchRetryCountRef.current,
            maxRetries: CONFIG_FETCH_MAX_RETRIES,
          });

          fetchRetryTimerRef.current = setTimeout(() => {
            fetchRetryTimerRef.current = null;
            if (mountedRef.current) {
              fetchConfig();
            }
          }, CONFIG_FETCH_RETRY_DELAY);
        } else {
          setLoadError(`Failed to load configuration: ${errorMsg}`);
          setIsLoading(false);
        }
      }
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applyDeviceConfigPayload, cfg.deviceId]);

  // ---- Mount: fetch config ----

  useEffect(() => {
    mountedRef.current = true;
    fetchConfig();

    return () => {
      mountedRef.current = false;
      if (fetchRetryTimerRef.current !== null) {
        clearTimeout(fetchRetryTimerRef.current);
        fetchRetryTimerRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchConfig]);

  useEffect(() => {
    localEventManager.connect();
    return () => {
      localEventManager.disconnect();
    };
  }, []);

  useEffect(function () {
    var handleResize = function () {
      setViewport({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    window.addEventListener('resize', handleResize);
    return function () {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // ---- WebSocket Command Handlers ----

  useEffect(() => {
    const handleReload = () => {
      log.info('Received reload command');
      window.location.reload();
    };

    const handleNavigate = () => {
      // In SPA mode, navigate = re-fetch config (no URL changes)
      log.info('Received navigate command, re-fetching config');
      fetchRetryCountRef.current = 0;
      fetchConfig();
    };

    const handleRestart = () => {
      log.info('Received restart command');
      fetchRetryCountRef.current = 0;
      setAppConfig(null);
      setTemplateType('');
      setInstanceId('');
      setActiveRevision('');
      setPendingRenderAck(null);
      setIsLoading(true);
      setLoadError(null);
      setIsIdle(false);
      fetchConfig();
    };

    const handleIdle = () => {
      log.info('Received idle command');
      setIsIdle(true);
    };

    const handleActivate = () => {
      log.info('Received activate command');
      setIsIdle(false);
    };

    const handleConfigUpdated = (event: WSEvent) => {
      const payload = event.payload as WSConfigUpdated;
      if (payload?.config) {
        const rawConfig = payload.config as unknown as Record<string, unknown>;
        const nextTemplateType = typeof rawConfig.templateType === 'string'
          ? rawConfig.templateType
          : '';
        const nextInstanceId = typeof rawConfig.instanceId === 'string'
          ? rawConfig.instanceId
          : '';

        log.info('Received config update', {
          templateType: nextTemplateType || templateType || 'unchanged',
          instanceId: nextInstanceId || instanceId || 'unchanged',
        });

        setAppConfig(payload.config);
        if (nextTemplateType) {
          setTemplateType(nextTemplateType);
        }
        if (nextInstanceId) {
          setInstanceId(nextInstanceId);
        }
        if (typeof rawConfig.revision === 'string') {
          setActiveRevision(rawConfig.revision);
        }
      }
    };

    ws.onEvent('command:reload', handleReload);
    ws.onEvent('command:navigate', handleNavigate);
    ws.onEvent('command:restart', handleRestart);
    ws.onEvent('command:idle', handleIdle);
    ws.onEvent('command:activate', handleActivate);
    ws.onEvent('config:updated', handleConfigUpdated);

    return () => {
      ws.offEvent('command:reload', handleReload);
      ws.offEvent('command:navigate', handleNavigate);
      ws.offEvent('command:restart', handleRestart);
      ws.offEvent('command:idle', handleIdle);
      ws.offEvent('command:activate', handleActivate);
      ws.offEvent('config:updated', handleConfigUpdated);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchConfig]);

  useEffect(() => {
    const handleLocalCacheActivated = (event: { type: string; payload: unknown; timestamp: number }) => {
      const payload = (event.payload || {}) as {
        appId?: string;
        requestId?: string;
        revision?: string;
        templateType?: string;
      };

      if (payload.requestId && payload.revision && payload.templateType) {
        setPendingRenderAck({
          requestId: payload.requestId,
          revision: payload.revision,
          templateType: payload.templateType,
          instanceId: payload.appId || '',
        });
      }

      log.info('Received local cache activation event', {
        requestId: payload.requestId || 'none',
        revision: payload.revision || 'none',
      });
      fetchRetryCountRef.current = 0;
      fetchConfig();
    };

    const handleLocalConfigUpdated = (event: { type: string; payload: unknown; timestamp: number }) => {
      const payload = (event.payload || {}) as {
        assignedApp?: DeviceConfig['assignedApp'];
        device?: DeviceConfig['device'];
        requestId?: string;
        revision?: string;
      };

      if (!payload.device) {
        return;
      }

      log.info('Received local config update', {
        templateType: payload.assignedApp?.templateType || 'unassigned',
        instanceId: payload.assignedApp?.instanceId || 'unassigned',
        revision: payload.assignedApp?.revision || payload.revision || 'none',
      });

      if (
        payload.requestId
        && payload.assignedApp
        && typeof payload.assignedApp.revision === 'string'
        && payload.assignedApp.revision.trim().length > 0
        && typeof payload.assignedApp.templateType === 'string'
      ) {
        setPendingRenderAck({
          requestId: payload.requestId,
          revision: payload.assignedApp.revision,
          templateType: payload.assignedApp.templateType,
          instanceId: payload.assignedApp.instanceId || '',
        });
      }

      applyDeviceConfigPayload({
        device: payload.device,
        assignedApp: payload.assignedApp,
      });
    };

    localEventManager.on('cache:activated', handleLocalCacheActivated);
    localEventManager.on('config:updated', handleLocalConfigUpdated);

    return () => {
      localEventManager.off('cache:activated', handleLocalCacheActivated);
      localEventManager.off('config:updated', handleLocalConfigUpdated);
    };
  }, [applyDeviceConfigPayload, fetchConfig, log]);

  useEffect(() => {
    if (!pendingRenderAck) return;
    if (!appConfig || !templateType || !instanceId) return;
    if (activeRevision !== pendingRenderAck.revision) return;

    let cancelled = false;
    const requestId = pendingRenderAck.requestId;

    const notifyRendered = async () => {
      await waitForNextPaint();

      const documentWithFonts = document as Document & {
        fonts?: { ready?: Promise<unknown> };
      };
      if (documentWithFonts.fonts?.ready) {
        try {
          await documentWithFonts.fonts.ready;
        } catch {
          // Ignore font readiness errors and continue to media readiness.
        }
      }

      const media = await waitForVisibleMedia();
      await waitForNextPaint();

      if (cancelled) return;

      // A revision with broken/timed-out media still renders, but the screen is
      // blank/degraded — report that explicitly so the server doesn't treat it
      // as a healthy render.
      const mediaOk = media.failed === 0 && !media.timedOut;

      ws.send('display:revision-rendered', {
        requestId,
        revision: pendingRenderAck.revision,
        templateType: pendingRenderAck.templateType,
        instanceId: pendingRenderAck.instanceId || instanceId,
        mediaTotal: media.total,
        mediaFailed: media.failed,
        mediaTimedOut: media.timedOut,
        mediaOk,
      });

      if (!mediaOk) {
        ws.send('display:media-error', {
          revision: pendingRenderAck.revision,
          templateType: pendingRenderAck.templateType,
          instanceId: pendingRenderAck.instanceId || instanceId,
          mediaTotal: media.total,
          mediaFailed: media.failed,
          mediaTimedOut: media.timedOut,
        });
        log.warn('Visible media failed to load for revision', {
          requestId,
          revision: pendingRenderAck.revision,
          mediaTotal: media.total,
          mediaFailed: media.failed,
          mediaTimedOut: media.timedOut,
        });

        // Switch to the fallback playlist instead of leaving a blank/broken
        // screen. Resets on the next config update so the real app gets retried.
        if (fallback && fallback.items.length > 0) {
          setFallbackActive(true);
        }
      }

      log.info('Reported rendered revision to server', {
        requestId,
        revision: pendingRenderAck.revision,
        templateType: pendingRenderAck.templateType,
        mediaOk,
      });

      setPendingRenderAck((current) => {
        return current?.requestId === requestId ? null : current;
      });
    };

    notifyRendered().catch((error) => {
      log.warn('Failed to report rendered revision', {
        requestId,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    return () => {
      cancelled = true;
    };
  }, [activeRevision, appConfig, fallback, instanceId, log, pendingRenderAck, templateType, ws]);

  // ---- Fallback reporting ----

  const reportFallbackActive = useCallback((info: FallbackActiveInfo) => {
    const payload: Record<string, unknown> = {
      reason: info.reason,
      playlistId: info.playlistId,
      itemCount: info.itemCount,
    };
    ws.send('display:fallback-active', payload);
    log.warn('Showing fallback content', payload);
  }, [log, ws]);

  const reportFallbackPlay = useCallback((info: { contentUrl: string; title?: string }) => {
    ws.send('display:play', {
      source: 'fallback',
      playlistId: fallback?.playlistId,
      contentUrl: info.contentUrl,
      title: info.title,
    });
  }, [fallback, ws]);

  // ---- Loading state ----

  if (isLoading) {
    return React.createElement(LoadingScreen, {
      message: 'Loading configuration...',
    });
  }

  // ---- Error state ----

  if (loadError) {
    return React.createElement(ErrorScreen, {
      message: loadError,
      retryIn: 10,
      onRetry: () => {
        fetchRetryCountRef.current = 0;
        fetchConfig();
      },
    });
  }

  // ---- Render children ----

  if (!appConfig || !templateType || !instanceId) {
    if (fallback && fallback.items.length > 0) {
      return React.createElement(FallbackPlaylist, {
        content: fallback,
        reason: 'no-app',
        onActive: reportFallbackActive,
        onItemPlay: reportFallbackPlay,
      });
    }
    return React.createElement(LoadingScreen, {
      message: 'Waiting for app assignment...',
    });
  }

  // Assigned app rendered but its media failed to load — show the fallback
  // playlist instead of a blank/broken screen (reset on the next config update).
  if (fallbackActive && fallback && fallback.items.length > 0) {
    return React.createElement(FallbackPlaylist, {
      content: fallback,
      reason: 'media-error',
      onActive: reportFallbackActive,
      onItemPlay: reportFallbackPlay,
    });
  }

  const contextValue: AppShellContextValue = {
    instanceId,
    templateType,
    config: appConfig,
    isIdle,
    connectionState: ws.connectionState,
    send: ws.send,
  };

  const isPortrait = orientation === 'portrait';
  const shouldEmulatePortrait = isPortrait && viewport.width >= viewport.height;

  // For portrait: the physical screen is landscape (e.g. 1024x768) but monitor is rotated.
  // We rotate the container -90deg and swap dimensions so content renders portrait.
  // We set CSS vars --app-width/--app-height so child components use the correct dimensions
  // instead of 100vw/100vh which still refer to the unrotated viewport.
  const shellStyle: React.CSSProperties = shouldEmulatePortrait
    ? ({
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vh',
        height: '100vw',
        overflow: 'hidden',
        backgroundColor: '#000',
        transform: 'rotate(-90deg) translateX(-100vh)',
        transformOrigin: 'top left',
        '--app-width': '100vh',
        '--app-height': '100vw',
      } as React.CSSProperties)
    : ({
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        backgroundColor: '#000',
        '--app-width': '100vw',
        '--app-height': '100vh',
      } as React.CSSProperties);

  return React.createElement(
    AppShellContext.Provider,
    { value: contextValue },
    React.createElement(
      'div',
      { style: shellStyle, 'data-appshell': 'true', 'data-idle': isIdle ? 'true' : 'false' },
      children(appConfig, templateType, instanceId, activeRevision)
    )
  );
}

// ==========================================
// Main AppShell Export
// ==========================================

function AppShell(props: AppShellProps) {
  return React.createElement(
    AppErrorBoundary,
    null,
    React.createElement(AppShellInner, props)
  );
}

// ==========================================
// Exports
// ==========================================

export { AppShell, AppShellContext, useAppShell };
export type { AppShellProps, AppShellContextValue };
