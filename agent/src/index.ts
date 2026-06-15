import { readFileSync, existsSync, copyFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { loadConfig } from './lib/config.js';
import { Logger } from './lib/logger.js';
import { provision } from './services/provisioning.js';
import { WsClient } from './services/websocket.js';
import { HealthMonitor } from './services/health.js';
import { CommandExecutor } from './services/commands.js';
import { KioskManager } from './services/kiosk.js';
import { registerPowerCommands } from './commands/power.js';
import { registerKioskCommands, registerMultiScreenKioskCommands } from './commands/kiosk.js';
import { registerScreenshotCommands } from './commands/screenshot.js';
import { MultiScreenKioskManager } from './services/multiScreenKiosk.js';
import { detectScreens } from './lib/screens.js';
import type { DetectedScreen } from './lib/screens.js';
import { resolveScreenMap } from './lib/screenMap.js';
import { registerDisplayCommands } from './commands/display.js';
import { registerNetworkCommands } from './commands/network.js';
import { Updater } from './services/updater.js';
import { registerUpdateCommands } from './commands/update.js';
import { AutoUpdater } from './services/autoUpdater.js';
import { Watchdog } from './services/watchdog.js';
import { registerMaintenanceCommands } from './commands/maintenance.js';
import { LogForwarder } from './services/logForwarder.js';
import { registerRpiCommands } from './commands/rpi.js';
import { registerSerialCommands } from './commands/serial.js';
import { isRaspberryPi } from './lib/rpi.js';
import { ServiceLauncher } from './services/serviceLauncher.js';
import { StaticServer } from './services/staticServer.js';
import { PowerScheduler } from './services/powerScheduler.js';
import { SerialBridge } from './services/serialBridge.js';
import { OscBridge } from './services/oscBridge.js';
import { LocalEventServer } from './services/localEvents.js';
import { PresenceSensor } from './services/presenceSensor.js';
import { DisplayRevisionCache } from './services/displayRevisionCache.js';
import { isPresenceEnabledTemplate } from './lib/templateTypes.js';
import type { WsMessage, KioskConfig, PowerScheduleConfig, Identity, ScreenMapping } from './lib/types.js';

function getAgentVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf-8'));
    return pkg.version || '1.0.0';
  } catch {
    return '1.0.0';
  }
}

/** Copy scripts/lightman-shell.bat → lightman-shell.bat (agent root) if they differ.
 *  Covers the OTA chicken-and-egg: old agent code runs install(), so the bat
 *  only gets synced once the NEW agent starts up. */
function syncShellBat(logger: Logger): void {
  if (process.platform !== 'win32') return;
  try {
    const src = resolve(process.cwd(), 'scripts', 'lightman-shell.bat');
    const dst = resolve(process.cwd(), 'lightman-shell.bat');
    if (!existsSync(src)) return;
    const srcBuf = readFileSync(src);
    if (existsSync(dst)) {
      const dstBuf = readFileSync(dst);
      if (srcBuf.equals(dstBuf)) return;
    }
    copyFileSync(src, dst);
    logger.info('Synced lightman-shell.bat to install root');
  } catch (err) {
    logger.warn('Failed to sync shell bat:', err);
  }
}

interface DisplayCacheRefreshRequest {
  appId?: string;
  reason: string;
  requestId?: string;
}

async function main(): Promise<void> {
  // 1. Load config
  const config = loadConfig();
  const logger = new Logger(config.logLevel, config.logFile);

  logger.info('Museum OS Agent starting...');

  // Sync shell bat file on startup (belt-and-suspenders for OTA updates)
  syncShellBat(logger);
  logger.info(`Server: ${config.serverUrl}`);
  logger.info(`Device slug: ${config.deviceSlug}`);

  // 1b. Start local server & display services (dev mode only)
  let serviceLauncher: ServiceLauncher | null = null;
  if (config.localServices) {
    const projectRoot = resolve(process.cwd(), '..');
    serviceLauncher = new ServiceLauncher(logger, projectRoot);
    try {
      await serviceLauncher.startAll();
    } catch (err) {
      logger.error('Failed to start services:', err);
      process.exit(1);
    }
  } else {
    logger.info('Local services disabled (kiosk-only mode)');
  }

  // 2. Provision (get identity)
  // Provision with retry â€” never crash, just keep trying.
  // This prevents NSSM restart loops that kill Chrome (blinking screen).
  let identity: Identity | null = null;
  const MAX_PROVISION_ATTEMPTS = 999;
  for (let attempt = 1; attempt <= MAX_PROVISION_ATTEMPTS; attempt++) {
    try {
      const result = await provision(config, logger);
      identity = result.identity;
      logger.info(
        `Device ID: ${identity.deviceId} (${result.fromCache ? 'cached' : 'new'})`
      );
      break;
    } catch (err) {
      logger.error(`Provisioning attempt ${attempt} failed:`, err);
      if (attempt < MAX_PROVISION_ATTEMPTS) {
        const waitSec = Math.min(30, attempt * 5);
        logger.info(`Retrying provisioning in ${waitSec}s...`);
        await new Promise((r) => setTimeout(r, waitSec * 1000));
      } else {
        logger.error('All provisioning attempts exhausted. Exiting.');
        process.exit(1);
      }
    }
  }

  if (!identity) {
    logger.error('Provisioning failed â€” no identity. Exiting.');
    process.exit(1);
  }

  const displayCache = new DisplayRevisionCache(config.serverUrl, identity, logger);

  // 2b. Start built-in display static server once identity is available so
  // cache-backed API/storage fallbacks can serve the running Chrome instances.
  const displayDistPath = resolve(process.cwd(), 'public');
  const staticServer = new StaticServer(3403, displayDistPath, config.serverUrl, logger, displayCache);
  staticServer.start();

  const localEventServer = new LocalEventServer(config.localEventsPort || 3402, logger);
  localEventServer.start();

  let wsClient: WsClient | null = null;

  const runSingleDisplayCacheRefresh = async (request: DisplayCacheRefreshRequest) => {
    try {
      const result = await displayCache.refreshFromServer(request.reason);
      const activeManifest = result.manifest || displayCache.getCurrentManifest();
      const activeDeviceConfig = result.deviceConfig || displayCache.getCurrentDeviceConfig();

      if (result.changed && activeDeviceConfig) {
        const assignedApp = activeDeviceConfig.assignedApp || null;
        const device = activeDeviceConfig.device || {};
        const revision = activeManifest?.revision || '';
        const templateType = activeManifest?.templateType || '';
        const appId = activeManifest?.appId || request.appId || '';
        const timestamp = Date.now();

        if (activeManifest) {
          localEventServer.broadcast({
            type: 'cache:activated',
            payload: {
              revision,
              appId,
              templateType,
              requestId: request.requestId || '',
            },
            timestamp,
          });
        }

        localEventServer.broadcast({
          type: 'config:updated',
          payload: {
            revision,
            assignedApp,
            device,
            requestId: request.requestId || '',
          },
          timestamp,
        });

        if (activeManifest) {
          for (const playlistId of activeManifest.playlistIds) {
            localEventServer.broadcast({
              type: 'playlist:updated',
              payload: { revision, playlistId },
              timestamp,
            });
          }

          for (const contentId of activeManifest.contentIds) {
            localEventServer.broadcast({
              type: 'content:updated',
              payload: { revision, contentId },
              timestamp,
            });
          }
        }
      }

      if (wsClient) {
        wsClient.send({
          type: 'agent:cache-refresh-result',
          payload: {
            appId: activeManifest?.appId || request.appId || '',
            changed: result.changed,
            reason: request.reason,
            requestId: request.requestId || '',
            revision: activeManifest?.revision || '',
            success: true,
            templateType: activeManifest?.templateType || '',
            updatedAt: activeManifest?.updatedAt || null,
          },
          timestamp: Date.now(),
        });
      }

      if (!result.changed || !result.manifest || !result.deviceConfig) {
        return result;
      }

      return result;
    } catch (err) {
      logger.error(`[DisplayCache] Refresh failed for reason=${request.reason}:`, err);
      if (wsClient) {
        wsClient.send({
          type: 'agent:cache-refresh-result',
          payload: {
            appId: request.appId || '',
            error: err instanceof Error ? err.message : String(err),
            reason: request.reason,
            requestId: request.requestId || '',
            success: false,
          },
          timestamp: Date.now(),
        });
      }
      return null;
    }
  };

  let pendingDisplayCacheRequest: DisplayCacheRefreshRequest | null = null;
  let displayCacheRefreshPromise: Promise<unknown> | null = null;

  const refreshDisplayCache = async (requestOrReason: DisplayCacheRefreshRequest | string) => {
    const request = typeof requestOrReason === 'string'
      ? { reason: requestOrReason }
      : requestOrReason;

    pendingDisplayCacheRequest = request;

    if (displayCacheRefreshPromise) {
      return displayCacheRefreshPromise;
    }

    displayCacheRefreshPromise = (async () => {
      let lastResult: unknown = null;

      while (pendingDisplayCacheRequest) {
        const currentRequest = pendingDisplayCacheRequest;
        pendingDisplayCacheRequest = null;

        // Coalesce rapid save bursts so the agent stages the final settled app state.
        if (currentRequest.reason !== 'startup-sync') {
          await new Promise((resolvePromise) => setTimeout(resolvePromise, 150));
        }

        lastResult = await runSingleDisplayCacheRefresh(currentRequest);
      }

      return lastResult;
    })().finally(() => {
      const trailingRequest = pendingDisplayCacheRequest;
      displayCacheRefreshPromise = null;
      if (trailingRequest) {
        void refreshDisplayCache(trailingRequest);
      }
    });

    return displayCacheRefreshPromise;
  };

  // 3. Create WebSocket client
  let commandExecutor: CommandExecutor;
  let powerScheduler: PowerScheduler;

  const liveWsClient = new WsClient({
    serverUrl: config.serverUrl,
    identity,
    logger,
    onMessage: (msg: WsMessage) => {
      handleServerMessage(
        msg,
        commandExecutor,
        logger,
        powerScheduler,
        startSerialBridge,
        stopSerialBridge,
        startOscBridge,
        stopOscBridge,
        multiScreenKiosk,
        getIdentity,
        kioskManager,
        watchdog,
        startPresenceSensor,
        stopPresenceSensor,
        () => lastKnownTotalScreens,
        refreshDisplayCache
      );
    },
  });
  wsClient = liveWsClient;

  // 4. Start health monitor
  const healthMonitor = new HealthMonitor(
    liveWsClient,
    logger,
    config.healthIntervalMs,
    config.serverUrl
  );

  // 4b. Start log forwarder
  const logForwarder = new LogForwarder(liveWsClient, logger);
  logger.onLog((entry) => logForwarder.onLog(entry));
  logForwarder.start();

  // 5. Create command executor and register built-in commands
  commandExecutor = new CommandExecutor(liveWsClient, logger);

  // Register Phase 15 system management commands
  registerPowerCommands(commandExecutor.register.bind(commandExecutor), logger);
  registerDisplayCommands(commandExecutor.register.bind(commandExecutor), logger);
  registerScreenshotCommands(commandExecutor.register.bind(commandExecutor), logger, config.serverUrl, identity.deviceId, identity.apiKey);

  // Create KioskManager if kiosk config is present
  const baseKioskConfig: KioskConfig = config.kiosk || {
    browserPath: 'chromium-browser',
    defaultUrl: `${config.serverUrl.replace(/:\d+$/, ':3401')}/display`,
    extraArgs: [],
    pollIntervalMs: 10_000,
    maxCrashesInWindow: 10,
    crashWindowMs: 300_000,
  };
  // Enforce unmuted autoplay in kiosk mode for video templates with audio tracks.
  const normalizedExtraArgs = (baseKioskConfig.extraArgs || []).filter((arg) => arg !== '--mute-audio');
  if (!normalizedExtraArgs.some((arg) => arg.startsWith('--autoplay-policy='))) {
    normalizedExtraArgs.push('--autoplay-policy=no-user-gesture-required');
  }
  if (!normalizedExtraArgs.some((arg) => arg.startsWith('--proxy-server='))) {
    normalizedExtraArgs.push('--proxy-server=direct://');
  }
  if (!normalizedExtraArgs.some((arg) => arg.startsWith('--proxy-bypass-list='))) {
    normalizedExtraArgs.push('--proxy-bypass-list=*');
  }
  // Inject credentials into the kiosk URL so Chrome auto-provisions without pairing
  const kioskUrl = new URL(baseKioskConfig.defaultUrl);
  kioskUrl.searchParams.set('deviceId', identity.deviceId);
  kioskUrl.searchParams.set('apiKey', identity.apiKey);
  const kioskConfig: KioskConfig = {
    ...baseKioskConfig,
    extraArgs: normalizedExtraArgs,
    defaultUrl: kioskUrl.toString(),
  };
  const kioskManager = new KioskManager(kioskConfig, logger);
  registerKioskCommands(commandExecutor.register.bind(commandExecutor), kioskManager, logger);

  // Multi-screen kiosk manager â€” handles multiple Chrome instances on multi-display devices
  const multiScreenKiosk = new MultiScreenKioskManager(kioskConfig, logger);
  const getIdentity = () => identity!;
  registerMultiScreenKioskCommands(commandExecutor.register.bind(commandExecutor), multiScreenKiosk, getIdentity, logger);

  // Detect physical screens and keep them fresh (multi-display setups can change after boot).
  let lastKnownTotalScreens = 0;
  let detectedScreens = detectScreens(logger);
  multiScreenKiosk.setDetectedScreens(detectedScreens);
  healthMonitor.setScreens(detectedScreens);

  const toScreenPayload = (screens: DetectedScreen[]) => (
    screens.map((s) => ({
      hardwareId: s.hardwareId,
      name: s.name,
      index: s.index,
      width: s.width,
      height: s.height,
      x: s.x,
      y: s.y,
      primary: s.primary,
    }))
  );

  const sendAgentRegister = () => {
      liveWsClient.send({
      type: 'agent:register',
      payload: {
        agentVersion: getAgentVersion(),
        screens: toScreenPayload(detectedScreens),
      },
      timestamp: Date.now(),
    });
  };

  const refreshDetectedScreens = async (reason: string) => {
    const latest = detectScreens(logger);
    if (!haveScreensChanged(detectedScreens, latest)) return;

    logger.info(`[Screens] Topology changed (${reason}): ${detectedScreens.length} -> ${latest.length}`);
    detectedScreens = latest;
    multiScreenKiosk.setDetectedScreens(detectedScreens);
    healthMonitor.setScreens(detectedScreens);

    if (liveWsClient.isConnected()) {
      sendAgentRegister();
    }

    if (multiScreenKiosk.hasDesiredScreenMap()) {
      try {
        await multiScreenKiosk.reapplyDesiredMap(identity);
      } catch (err) {
        logger.error('[MultiKiosk] Failed to reapply desired screen map after topology change:', err);
      }
    }
  };

  const screenRefreshInterval = setInterval(() => {
    refreshDetectedScreens('periodic-refresh').catch((err) => {
      logger.error('[Screens] Periodic refresh failed:', err);
    });
  }, 20_000);

  // Create Watchdog (Phase 20)
  const watchdog = new Watchdog(
    kioskManager,
    liveWsClient,
    healthMonitor,
    logger,
    config.serverUrl,
    identity,
    undefined,
    config.kiosk?.shellMode
  );
  registerMaintenanceCommands(commandExecutor.register.bind(commandExecutor), watchdog, logger);

  // Register Phase 20 network commands
  registerNetworkCommands(commandExecutor.register.bind(commandExecutor), logger, config.serverUrl);

  // Create Updater and register OTA update commands (Phase 20)
  const updater = new Updater(logger);
  registerUpdateCommands(commandExecutor.register.bind(commandExecutor), updater, liveWsClient, logger, config.serverUrl, identity);

  // Auto-updater: polls server every 5 minutes for new agent versions
  const autoUpdater = new AutoUpdater({
    logger,
    updater,
    wsClient: liveWsClient,
    serverUrl: config.serverUrl,
    identity,
    currentVersion: getAgentVersion(),
  });
  autoUpdater.start();

  // Register RPi-specific commands when running on Raspberry Pi
  if (isRaspberryPi()) {
    registerRpiCommands(commandExecutor.register.bind(commandExecutor), logger);
    logger.info('Raspberry Pi detected, RPi commands registered');
  }

  // Register serial/COM port commands (works on all platforms)
  registerSerialCommands(commandExecutor.register.bind(commandExecutor), logger);

  // OSC bridge â€” listens on UDP for OSC messages and forwards triggers to display
  let oscBridge: OscBridge | null = null;

  const startOscBridge = (oscPort: number, oscAddress: string, oscHost?: string) => {
    if (oscBridge) {
      logger.info('[OSC] Stopping existing bridge before restart');
      oscBridge.stop();
      oscBridge = null;
    }
    logger.info(`[OSC] Starting bridge â€” UDP ${oscHost || '0.0.0.0'}:${oscPort} address: ${oscAddress}`);
    oscBridge = new OscBridge({
      wsClient: liveWsClient,
      logger,
      port: oscPort,
      host: oscHost || '0.0.0.0',
      address: oscAddress,
      onEvent: (event) => localEventServer.broadcast({ type: 'hardware:event', payload: event }),
    });
    oscBridge.start();
  };

  const stopOscBridge = () => {
    if (oscBridge) { oscBridge.stop(); oscBridge = null; }
  };

  // Serial bridge â€” reads COM port chars (* â†’ pickup, # â†’ hangup) and forwards to server
  let serialBridge: SerialBridge | null = null;

  /** Start or restart the serial bridge with given COM port and controllerId */
  const startSerialBridge = (comPort: string, controllerId: string, baudRate?: number) => {
    if (serialBridge) {
      logger.info(`[SERIAL] Stopping existing bridge before restart`);
      serialBridge.stop();
      serialBridge = null;
    }
    const baud = baudRate || 115200;
    logger.info(`[SERIAL] Opening ${comPort} @ ${baud} baud (controllerId: ${controllerId})`);
    serialBridge = new SerialBridge({
      wsClient: liveWsClient,
      logger,
      port: comPort,
      baudRate: baud,
      controllerId,
      onEvent: (event) => localEventServer.broadcast({ type: 'hardware:event', payload: event }),
    });
    serialBridge.start();
    logger.info(`[SERIAL] Bridge started â€” waiting for hardware events on ${comPort}`);
  };

  const stopSerialBridge = () => {
    if (serialBridge) { serialBridge.stop(); serialBridge = null; }
  };

  // Presence sensor â€” auto-detects HLK-LD2410B via USB serial
  let presenceSensor: PresenceSensor | null = null;

  const startPresenceSensor = (port?: string) => {
    // If the serial bridge is already running, it handles sensor words
    // ("Present"/"Clear") from the combined board — no separate sensor needed
    if (!port && serialBridge?.isRunning()) {
      logger.info('[Presence] Serial bridge is active — sensor words handled via bridge, skipping standalone sensor');
      return;
    }
    if (presenceSensor) {
      logger.info('[Presence] Stopping existing sensor before restart');
      presenceSensor.stop();
      presenceSensor = null;
    }
    logger.info(`[Presence] Starting sensor (port: ${port || 'auto-detect'})`);
    presenceSensor = new PresenceSensor({
      wsClient: liveWsClient,
      logger,
      port: port || 'auto',
      onEvent: (event) => localEventServer.broadcast({ type: 'hardware:event', payload: event }),
    });
    presenceSensor.start();
  };

  const stopPresenceSensor = () => {
    if (presenceSensor) { presenceSensor.stop(); presenceSensor = null; }
  };

  // Register sensor commands
  commandExecutor.register('sensor:status', async () => {
    return presenceSensor?.getState() || { state: 'unknown', connected: false, port: null, running: false };
  });

  commandExecutor.register('sensor:enable', async (args) => {
    const port = args?.port as string | undefined;
    startPresenceSensor(port);
    return { started: true, port: port || 'auto' };
  });

  commandExecutor.register('sensor:disable', async () => {
    if (presenceSensor) {
      presenceSensor.stop();
      presenceSensor = null;
      return { stopped: true };
    }
    return { stopped: false, message: 'No sensor running' };
  });

  // Register serial bridge commands
  commandExecutor.register('serial:bridge-start', async (args) => {
    const comPort = args?.comPort as string || args?.port as string;
    const controllerId = args?.controllerId as string;
    const baudRate = args?.baudRate as number;
    if (!comPort) throw new Error('comPort is required');
    if (!controllerId) throw new Error('controllerId is required');
    startSerialBridge(comPort, controllerId, baudRate);
    return { started: true, comPort, controllerId };
  });

  commandExecutor.register('serial:bridge-stop', async () => {
    if (serialBridge) {
      serialBridge.stop();
      serialBridge = null;
      return { stopped: true };
    }
    return { stopped: false, message: 'No bridge running' };
  });

  commandExecutor.register('serial:bridge-status', async () => {
    return { running: serialBridge?.isRunning() || false };
  });

  // OSC bridge commands
  commandExecutor.register('osc:bridge-start', async (args) => {
    const oscPort = args?.oscPort as number || args?.port as number;
    const oscAddress = args?.oscAddress as string || args?.address as string;
    const oscHost = args?.oscHost as string;
    if (!oscPort) throw new Error('oscPort is required');
    if (!oscAddress) throw new Error('oscAddress is required');
    startOscBridge(oscPort, oscAddress, oscHost);
    return { started: true, oscPort, oscAddress };
  });

  commandExecutor.register('osc:bridge-stop', async () => {
    if (oscBridge) {
      oscBridge.stop();
      oscBridge = null;
      return { stopped: true };
    }
    return { stopped: false, message: 'No OSC bridge running' };
  });

  commandExecutor.register('osc:bridge-status', async () => {
    return { running: oscBridge?.isRunning() || false };
  });

  // Create PowerScheduler for local cron-based shutdown + server-pushed power commands
  const powerScheduleConfig: PowerScheduleConfig = config.powerSchedule || {
    enableLocalCron: false,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    shutdownWarningSeconds: 60,
  };
  powerScheduler = new PowerScheduler(powerScheduleConfig, logger, liveWsClient);

  // Register power schedule commands (server can trigger/cancel shutdown and update schedule)
  commandExecutor.register('power:shutdown-now', async (args) => {
    const reason = (args?.reason as string) || 'admin-command';
    powerScheduler.triggerShutdown(reason);
    return { shutdownTriggered: true, reason };
  });

  commandExecutor.register('power:cancel-shutdown', async () => {
    const cancelled = powerScheduler.cancelShutdown();
    return { cancelled };
  });

  commandExecutor.register('power:update-schedule', async (args) => {
    if (args) {
      powerScheduler.updateSchedule(args as Partial<PowerScheduleConfig>);
    }
    return { updated: true };
  });

  // Register built-in commands
  commandExecutor.register('ping', async () => {
    return { pong: true, timestamp: Date.now() };
  });

  commandExecutor.register('status', async () => {
    const health = await healthMonitor.collect();
    return {
      connected: liveWsClient.isConnected(),
      health,
    };
  });

  commandExecutor.register('restart-agent', async () => {
    logger.warn('Restart command received, exiting (systemd will restart)...');
    // Delay to allow result to be sent
    setTimeout(() => process.exit(0), 1000);
    return { restarting: true };
  });

  // 5b. Start OSC/serial bridges immediately from cache (don't wait for WebSocket)
  const cachedCfg = loadCachedDeviceConfig(logger);
  if (cachedCfg) {
    const cOscPort = cachedCfg.oscPort as number;
    const cOscAddress = cachedCfg.oscAddress as string;
    const cOscHost = cachedCfg.oscHost as string;
    if (cOscPort && cOscAddress) {
      logger.info(`[OSC] Starting from cache: port=${cOscPort} address=${cOscAddress}`);
      startOscBridge(cOscPort, cOscAddress, cOscHost);
    }
    const cComPort = cachedCfg.comPort as string;
    if (cComPort) {
      const cControllerId = (cachedCfg.controllerId as string) || cComPort;
      const cBaudRate = (cachedCfg.baudRate as number) || 115200;
      logger.info(`[SERIAL] Starting from cache: ${cComPort}`);
      startSerialBridge(cComPort, cControllerId, cBaudRate);
    }
  }

  const cachedDisplayManifest = displayCache.getCurrentManifest();
  if (cachedDisplayManifest && cachedDisplayManifest.totalScreens > 1) {
    const cachedTotalScreens = Math.max(cachedDisplayManifest.totalScreens, cachedDisplayManifest.screenMap.length);
    const cachedScreenMap = normalizeScreenMapForTotalScreens(
      cachedDisplayManifest.screenMap,
      cachedTotalScreens
    );

    if (cachedTotalScreens > 1 && detectedScreens.length < cachedTotalScreens) {
      logger.warn(
        `[MultiKiosk] Cached revision expects ${cachedTotalScreens} screen(s) but agent detected ${detectedScreens.length}. ` +
        'The agent will still resume the last good multi-screen layout from cache.'
      );
    }

    if (cachedScreenMap.length > 0) {
      lastKnownTotalScreens = cachedTotalScreens;
      watchdog.setMultiScreenActive(true);
      multiScreenKiosk.applyScreenMap(cachedScreenMap, identity).then(() => {
        logger.info(
          `[MultiKiosk] Resumed cached multi-screen revision ${cachedDisplayManifest.revision} ` +
          `(${cachedDisplayManifest.templateType}) before server sync`
        );
      }).catch((err) => {
        logger.error('[MultiKiosk] Failed to resume cached multi-screen revision:', err);
        watchdog.setMultiScreenActive(false);
      });
    }
  }

  // 6. Connect and start
  liveWsClient.connect();
  healthMonitor.start();
  watchdog.start();
  powerScheduler.start();

  // Send registration message once connected, then auto-launch kiosk
  const registerInterval = setInterval(() => {
    if (liveWsClient.isConnected()) {
      sendAgentRegister();
      clearInterval(registerInterval);

      // Fetch device config first to decide single vs multi-screen kiosk
      fetchDeviceConfig(config.serverUrl, identity, logger).then((deviceCfg) => {
        refreshDisplayCache('startup-sync').catch(() => null);

        // Serial bridge
        if (deviceCfg && deviceCfg.comPort) {
          const comPort = deviceCfg.comPort;
          const controllerId = deviceCfg.controllerId || comPort;
          const bridgeBaud = deviceCfg.baudRate || 115200;
          logger.info(`[SERIAL] com_port found: ${comPort} | controllerId: ${controllerId} | baud: ${bridgeBaud}`);
          logger.info(`[SERIAL] Starting serial bridge â€” listening on ${comPort}...`);
          startSerialBridge(comPort, controllerId, bridgeBaud);
        } else {
          logger.info('[SERIAL] No com_port configured on this device â€” serial bridge not started');
        }

        // OSC bridge â€” auto-start if app config has inputSource === 'osc'
        if (deviceCfg && deviceCfg.oscPort && deviceCfg.oscAddress) {
          logger.info(`[OSC] Config found: port=${deviceCfg.oscPort} address=${deviceCfg.oscAddress}`);
          startOscBridge(deviceCfg.oscPort, deviceCfg.oscAddress, deviceCfg.oscHost);
        } else {
          logger.info('[OSC] No OSC config on this device â€” OSC bridge not started');
        }

        // Display orientation — rotate if device is configured as portrait
        if (deviceCfg && deviceCfg.orientation === 'portrait') {
          logger.info('[Display] Device configured as portrait — rotating display');
          commandExecutor.execute('display:rotate', { rotation: 'left' }).then(() => {
            logger.info('[Display] Portrait rotation applied');
          }).catch((err: unknown) => {
            logger.warn('[Display] Failed to apply portrait rotation:', err);
          });
        }

        // Presence sensor - auto-start if template is presence-enabled.
        if (deviceCfg && isPresenceEnabledTemplate(deviceCfg.templateType)) {
          logger.info(`[Presence] Template is ${deviceCfg.templateType} - auto-starting presence sensor`);
          startPresenceSensor();
        } else {
          logger.info('[Presence] Template is not presence-enabled - sensor not started');
        }
        // Multi-screen handling:
        // 1) Use explicit screenMap when present.
        // 2) For multi-screen apps without a saved map, auto-create placeholders.
        const requestedScreenMap = deviceCfg?.screenMap || [];
        const totalScreens = Math.max(deviceCfg?.totalScreens || 0, requestedScreenMap.length);
        lastKnownTotalScreens = totalScreens;
        const effectiveRequestedMap = normalizeScreenMapForTotalScreens(requestedScreenMap, totalScreens);

        if (totalScreens > 1 && detectedScreens.length < totalScreens) {
          logger.warn(
            `[MultiKiosk] App expects ${totalScreens} screen(s) but agent detected ${detectedScreens.length}. ` +
            'Remaining screens may stay black until Windows reports all displays.'
          );
        }

        if (effectiveRequestedMap.length > 0) {
          const resolved = resolveScreenMap({
            requestedScreenMap: effectiveRequestedMap,
            detectedScreens,
            totalScreens,
          });
          logger.info(
            `[MultiKiosk] Effective map ready: requested=${requestedScreenMap.length}, effective=${effectiveRequestedMap.length}, mode=${resolved.mode}, totalScreens=${totalScreens}`
          );
          watchdog.setMultiScreenActive(true);
          multiScreenKiosk.applyScreenMap(effectiveRequestedMap, identity).catch((err) => {
            logger.error('[MultiKiosk] Failed to apply effective screenMap from config:', err);
          });
          return;
        }

        // No effective multi-screen map - launch single-screen kiosk as before
        if (config.kiosk) {
          if (config.kiosk.shellMode) {
            logger.info('Shell mode: skipping Chrome launch (managed by Windows shell)');
            kioskManager.launch().catch((err) => {
              logger.error('Failed to update kiosk URL sidecar:', err);
            });
          } else {
            logger.info('Auto-launching single kiosk browser...');
            kioskManager.launch().catch((err) => {
              logger.error('Failed to auto-launch kiosk:', err);
            });
          }
        }
      }).catch((err) => {
        logger.warn('Could not fetch device config:', err);
        if (displayCache.hasCurrentMultiScreenState()) {
          logger.info('Keeping cached multi-screen revision active after config fetch failure');
          return;
        }
        // Fallback: launch single kiosk if we can't reach server and no cached multi-screen exists
        if (config.kiosk && !config.kiosk.shellMode) {
          logger.info('Fallback: launching single kiosk browser...');
          kioskManager.launch().catch((e) => {
            logger.error('Failed to auto-launch kiosk:', e);
          });
        }
      });
    }
  }, 1000);

  // 7. Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`${signal} received. Shutting down...`);
    clearInterval(registerInterval);
    clearInterval(screenRefreshInterval);

    // Wait for updater to finish if it's busy (max 60s)
    if (updater.isBusy()) {
      logger.warn('Updater is busy, waiting for it to finish before exit...');
      const maxWaitMs = 60_000;
      const pollMs = 500;
      let waited = 0;
      while (updater.isBusy() && waited < maxWaitMs) {
        await new Promise((r) => setTimeout(r, pollMs));
        waited += pollMs;
      }
      if (updater.isBusy()) {
        logger.error('Updater still busy after 60s, forcing shutdown');
      } else {
        logger.info('Updater finished, proceeding with shutdown');
      }
    }

    autoUpdater.stop();
    logForwarder.stop();
    powerScheduler.stop();
    if (presenceSensor) presenceSensor.stop();
    if (serialBridge) serialBridge.stop();
    if (oscBridge) oscBridge.stop();
    watchdog.stop();
    healthMonitor.stop();
    multiScreenKiosk.destroy();
    kioskManager.destroy();
    liveWsClient.close();
    localEventServer.stop();
    staticServer.stop();
    serviceLauncher?.stopAll();
    logger.info('Agent stopped.');
    process.exit(0);
  };

  process.on('SIGTERM', () => { shutdown('SIGTERM'); });
  process.on('SIGINT', () => { shutdown('SIGINT'); });

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection:', reason);
  });

  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception:', err);
    process.exit(1);
  });

  logger.info('Museum OS Agent running.');
}

function createPlaceholderScreenMap(totalScreens: number): ScreenMapping[] {
  const count = Math.max(0, Math.floor(totalScreens || 0));
  return Array.from({ length: count }, () => ({ hardwareId: '', url: '' }));
}

function normalizeScreenMapForTotalScreens(
  screenMap: ScreenMapping[] | undefined,
  totalScreens: number
): ScreenMapping[] {
  const requested = Array.isArray(screenMap)
    ? screenMap.map((m) => ({
      hardwareId: String(m.hardwareId || ''),
      url: String(m.url || ''),
      ...(m.label ? { label: String(m.label) } : {}),
    }))
    : [];

  const targetCount = Math.max(requested.length, Math.max(0, Math.floor(totalScreens || 0)));
  if (targetCount === 0) return [];

  if (requested.length >= targetCount) return requested;

  return [
    ...requested,
    ...createPlaceholderScreenMap(targetCount - requested.length),
  ];
}

function haveScreensChanged(prev: DetectedScreen[], next: DetectedScreen[]): boolean {
  if (prev.length !== next.length) return true;
  for (let i = 0; i < prev.length; i++) {
    const a = prev[i];
    const b = next[i];
    if (
      a.hardwareId !== b.hardwareId
      || a.index !== b.index
      || a.x !== b.x
      || a.y !== b.y
      || a.width !== b.width
      || a.height !== b.height
      || a.primary !== b.primary
    ) {
      return true;
    }
  }
  return false;
}

function handleServerMessage(
  msg: WsMessage,
  commandExecutor: CommandExecutor,
  logger: Logger,
  powerScheduler?: PowerScheduler,
  startSerialBridge?: (comPort: string, controllerId: string, baudRate?: number) => void,
  stopSerialBridge?: () => void,
  startOscBridgeFn?: (oscPort: number, oscAddress: string, oscHost?: string) => void,
  stopOscBridgeFn?: () => void,
  multiScreenKiosk?: MultiScreenKioskManager,
  getIdentity?: () => Identity,
  kioskManager?: KioskManager,
  watchdog?: Watchdog,
  startPresenceSensorFn?: (port?: string) => void,
  stopPresenceSensorFn?: () => void,
  getTotalScreensHint?: () => number,
  refreshDisplayCacheFn?: (request: DisplayCacheRefreshRequest | string) => Promise<unknown>
): void {
  switch (msg.type) {
    case 'connected':
      logger.info('Server acknowledged connection');
      break;
    case 'command':
      commandExecutor.handleCommand(msg);
      break;
    case 'agent:config':
      if (msg.payload) {
        const logLevel = msg.payload.log_level as string | undefined;
        if (logLevel && ['debug', 'info', 'warn', 'error'].includes(logLevel)) {
          logger.setLevel(logLevel as 'debug' | 'info' | 'warn' | 'error');
          logger.info(`Log level changed to: ${logLevel}`);
        }

        // Admin pushed updated com_port via save
        const comPort = msg.payload.com_port as string | undefined;
        if (comPort && startSerialBridge) {
          const controllerId = (msg.payload.controllerId as string) || comPort;
          logger.info(`[SERIAL] Admin updated com_port â†’ ${comPort} | Restarting serial bridge...`);
          startSerialBridge(comPort, controllerId);
          logger.info(`[SERIAL] Serial bridge now listening on ${comPort}`);
        } else if (comPort === '' && stopSerialBridge) {
          logger.info('[SERIAL] Admin cleared com_port â€” stopping serial bridge');
          stopSerialBridge();
        }

        // Admin pushed orientation change
        const orientation = msg.payload.orientation as string | undefined;
        if (orientation) {
          const rotation = orientation === 'portrait' ? 'left' : 'normal';
          logger.info(`[Display] Admin updated orientation → ${orientation} — rotating display to ${rotation}`);
          commandExecutor.execute('display:rotate', { rotation }).then(() => {
            // Restart kiosk after rotation so Chrome relaunches in the new resolution
            if (kioskManager) {
              logger.info('[Display] Rotation applied — restarting kiosk browser');
              kioskManager.kill().then(() => {
                setTimeout(() => kioskManager.launch().catch((e: unknown) => {
                  logger.error('[Display] Failed to relaunch kiosk after rotation:', e);
                }), 2000);
              }).catch(() => {
                kioskManager.launch().catch((e: unknown) => {
                  logger.error('[Display] Failed to relaunch kiosk after rotation:', e);
                });
              });
            }
          }).catch((err: unknown) => {
            logger.warn('[Display] Failed to apply rotation:', err);
          });
        }

        // Admin pushed OSC config via app config save
        const oscPort = msg.payload.oscPort as number | undefined;
        const oscAddress = msg.payload.oscAddress as string | undefined;
        const inputSource = msg.payload.inputSource as string | undefined;
        if (inputSource === 'osc' && oscPort && oscAddress && startOscBridgeFn) {
          const oscHost = (msg.payload.oscHost as string) || '0.0.0.0';
          logger.info(`[OSC] Admin updated OSC config â†’ port=${oscPort} address=${oscAddress} â€” restarting bridge...`);
          startOscBridgeFn(oscPort, oscAddress, oscHost);
        } else if (inputSource === 'com' && stopOscBridgeFn) {
          logger.info('[OSC] Admin switched to COM input â€” stopping OSC bridge');
          stopOscBridgeFn();
        }

        // Presence sensor - auto-start/stop based on template type change
        const templateType = msg.payload.templateType as string | undefined;
        if (isPresenceEnabledTemplate(templateType) && startPresenceSensorFn) {
          logger.info(`[Presence] Template changed to ${templateType} - starting sensor`);
          startPresenceSensorFn();
        } else if (templateType && !isPresenceEnabledTemplate(templateType) && stopPresenceSensorFn) {
          logger.info('[Presence] Template changed away from presence-enabled template - stopping sensor');
          stopPresenceSensorFn();
        }

        // Admin pushed updated screenMap via device config save
        const screenMap = msg.payload.screenMap as ScreenMapping[] | undefined;
        if (screenMap && Array.isArray(screenMap) && multiScreenKiosk && getIdentity) {
          const payloadTotalScreens = Number(msg.payload.totalScreens || 0);
          const hintTotalScreens = Math.max(
            Number.isFinite(payloadTotalScreens) ? payloadTotalScreens : 0,
            getTotalScreensHint ? getTotalScreensHint() : 0
          );
          const effectiveScreenMap = screenMap.length > 0
            ? normalizeScreenMapForTotalScreens(screenMap, hintTotalScreens)
            : screenMap;

          if (screenMap.length > 0) {
            logger.info(`[MultiKiosk] Received screenMap update: requested=${screenMap.length}, effective=${effectiveScreenMap.length}, totalScreens=${hintTotalScreens} â€” killing single kiosk`);
            if (kioskManager) kioskManager.kill().catch(() => {});
            if (watchdog) watchdog.setMultiScreenActive(true);
            multiScreenKiosk.applyScreenMap(effectiveScreenMap, getIdentity()).catch((err) => {
              logger.error('[MultiKiosk] Failed to apply screenMap:', err);
            });
          } else {
            // Empty screenMap â€” deactivate multi-screen, resume single kiosk
            logger.info('[MultiKiosk] Empty screenMap received â€” deactivating multi-screen');
            multiScreenKiosk.killAll().catch(() => {});
            if (watchdog) watchdog.setMultiScreenActive(false);
          }
        }
      }
      break;
    case 'agent:screenMap':
      // Direct screenMap push from server
      if (msg.payload && multiScreenKiosk && getIdentity) {
        const screenMap = msg.payload.screenMap as ScreenMapping[] | undefined;
        if (screenMap && Array.isArray(screenMap)) {
          const payloadTotalScreens = Number(msg.payload.totalScreens || 0);
          const hintTotalScreens = Math.max(
            Number.isFinite(payloadTotalScreens) ? payloadTotalScreens : 0,
            getTotalScreensHint ? getTotalScreensHint() : 0
          );
          const effectiveScreenMap = screenMap.length > 0
            ? normalizeScreenMapForTotalScreens(screenMap, hintTotalScreens)
            : screenMap;

          if (screenMap.length > 0) {
            logger.info(`[MultiKiosk] Received agent:screenMap: requested=${screenMap.length}, effective=${effectiveScreenMap.length}, totalScreens=${hintTotalScreens} â€” killing single kiosk`);
            if (kioskManager) kioskManager.kill().catch(() => {});
            if (watchdog) watchdog.setMultiScreenActive(true);
            multiScreenKiosk.applyScreenMap(effectiveScreenMap, getIdentity()).catch((err) => {
              logger.error('[MultiKiosk] Failed to apply screenMap:', err);
            });
          } else {
            logger.info('[MultiKiosk] Empty agent:screenMap â€” deactivating multi-screen');
            multiScreenKiosk.killAll().catch(() => {});
            if (watchdog) watchdog.setMultiScreenActive(false);
          }
        }
      }
      break;
    case 'agent:power-schedule':
      // Server pushes updated power schedule
      if (msg.payload && powerScheduler) {
        logger.info('Received power schedule update from server');
        powerScheduler.updateSchedule(msg.payload as Partial<PowerScheduleConfig>);
      }
      break;
    case 'agent:cache-refresh':
      if (refreshDisplayCacheFn) {
        const reason = typeof msg.payload?.reason === 'string'
          ? msg.payload.reason
          : 'server-refresh';
        const requestId = typeof msg.payload?.requestId === 'string'
          ? msg.payload.requestId
          : undefined;
        const appId = typeof msg.payload?.appId === 'string'
          ? msg.payload.appId
          : undefined;
        logger.info(`[DisplayCache] Received cache refresh request: ${reason}`);
        refreshDisplayCacheFn({ reason, requestId, appId }).catch((err) => {
          logger.error(`[DisplayCache] Cache refresh failed for reason=${reason}:`, err);
        });
      }
      break;
    default:
      logger.debug(`Unknown message type: ${msg.type}`, msg);
  }
}

/**
 * Fetch the device's own config from the server (uses API-key auth).
 * Returns com_port, controllerId and baudRate from the device config + app config.
 */
const DEVICE_CONFIG_CACHE = resolve(process.cwd(), '.device-config-cache.json');

function loadCachedDeviceConfig(logger: Logger): Record<string, unknown> | null {
  try {
    if (existsSync(DEVICE_CONFIG_CACHE)) {
      return JSON.parse(readFileSync(DEVICE_CONFIG_CACHE, 'utf-8'));
    }
  } catch (err) {
    logger.debug('Failed to load cached device config:', err);
  }
  return null;
}

function saveCachedDeviceConfig(config: Record<string, unknown>, logger: Logger): void {
  try {
    const utf8NoBom = JSON.stringify(config, null, 2);
    writeFileSync(DEVICE_CONFIG_CACHE, utf8NoBom, 'utf-8');
  } catch (err) {
    logger.debug('Failed to save device config cache:', err);
  }
}

async function fetchDeviceConfig(
  serverUrl: string,
  identity: Identity,
  logger: Logger
): Promise<{
  comPort: string;
  controllerId: string;
  baudRate: number;
  screenMap: ScreenMapping[];
  totalScreens: number;
  oscPort: number;
  oscAddress: string;
  oscHost: string;
  templateType: string;
  orientation: string;
} | null> {
  try {
    const url = `${serverUrl}/api/devices/${identity.deviceId}/config`;
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${identity.apiKey}` },
    });
    if (!res.ok) {
      logger.debug(`Fetch device config failed: ${res.status}`);
      return null;
    }
    const json = await res.json() as Record<string, unknown>;
    const data = (json.data || json) as Record<string, unknown>;
    const device = data.device as Record<string, unknown> | undefined;
    const assignedApp = data.assignedApp as Record<string, unknown> | undefined;
    const appConfig = (assignedApp?.config as Record<string, unknown>) || {};

    const comPort = (device?.com_port as string) || '';

    // controllerId comes from app config (MQTT topic identity), defaults to com_port
    const controllerId = (appConfig.controllerId as string) || comPort;
    const baudRate = (device?.baud_rate as number) || 115200;

    // Screen map from device config (set by admin)
    const screenMap = (device?.screenMap as ScreenMapping[]) || [];
    const appScreens = (appConfig.screens as Array<Record<string, unknown>>) || [];
    const totalScreens = appScreens.length > 0
      ? appScreens.length
      : ((appConfig.totalScreens as number) || 0);

    // OSC settings from app config (custom07-osc template)
    const inputSource = appConfig.inputSource as string;
    const oscPort = inputSource === 'osc' ? ((appConfig.oscPort as number) || 0) : 0;
    const oscAddress = inputSource === 'osc' ? ((appConfig.oscAddress as string) || '') : '';
    const oscHost = (appConfig.oscHost as string) || '0.0.0.0';

    const templateType = (assignedApp?.templateType as string) || '';
    const orientation = (device?.orientation as string) || 'landscape';

    const result = { comPort, controllerId, baudRate, screenMap, totalScreens, oscPort, oscAddress, oscHost, templateType, orientation };
    saveCachedDeviceConfig(result as unknown as Record<string, unknown>, logger);
    return result;
  } catch (err) {
    logger.debug('Failed to fetch device config:', err);
    return null;
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
