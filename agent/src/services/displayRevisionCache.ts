import { createHash } from 'crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { dirname, join, resolve } from 'path';
import type { Logger } from '../lib/logger.js';
import type { Identity, ScreenMapping } from '../lib/types.js';

interface ApiEnvelope<T> {
  success?: boolean;
  data?: T;
}

export interface CachedDisplayConfig {
  device: Record<string, unknown>;
  assignedApp?: Record<string, unknown>;
}

export interface CachedDisplayRevisionManifest {
  appId: string;
  instanceId: string;
  templateType: string;
  revision: string;
  updatedAt: string | null;
  sourceConfigHash: string;
  resourceSignature: string;
  totalScreens: number;
  screenMap: ScreenMapping[];
  playlistIds: string[];
  contentIds: string[];
  assetPaths: string[];
  activatedAt: string;
}

export interface CacheRefreshResult {
  changed: boolean;
  manifest: CachedDisplayRevisionManifest | null;
  deviceConfig: CachedDisplayConfig | null;
}

interface StageContext {
  deviceConfig: CachedDisplayConfig;
  assignedApp: Record<string, unknown>;
  revision: string;
  updatedAt: string | null;
  sourceConfigHash: string;
  resourceSignature: string;
  playlistIds: string[];
  contentIds: string[];
  assetPaths: string[];
  totalScreens: number;
  screenMap: ScreenMapping[];
  stageDir: string;
}

const DEFAULT_CACHE_ROOT = resolve(process.cwd(), 'display-cache');

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function normalizeScreenMap(value: unknown): ScreenMapping[] {
  if (!Array.isArray(value)) return [];

  return value.map((entry) => {
    const record = asRecord(entry);
    return {
      hardwareId: typeof record.hardwareId === 'string' ? record.hardwareId : '',
      url: typeof record.url === 'string' ? record.url : '',
      ...(typeof record.label === 'string' ? { label: record.label } : {}),
    };
  });
}

function normalizeScreenMapForTotalScreens(screenMap: ScreenMapping[], totalScreens: number): ScreenMapping[] {
  const normalized = screenMap.map((entry) => ({
    hardwareId: String(entry.hardwareId || ''),
    url: String(entry.url || ''),
    ...(entry.label ? { label: String(entry.label) } : {}),
  }));

  const targetCount = Math.max(normalized.length, Math.max(0, Math.floor(totalScreens || 0)));
  while (normalized.length < targetCount) {
    normalized.push({ hardwareId: '', url: '' });
  }

  return normalized;
}

function hashValue(value: unknown): string {
  return createHash('sha1').update(JSON.stringify(value)).digest('hex');
}

function fileSafeRevision(revision: string): string {
  return createHash('sha1').update(revision).digest('hex');
}

function extractPlaylistIds(value: unknown, result: Set<string>, keyHint?: string): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      extractPlaylistIds(item, result, keyHint);
    }
    return;
  }

  if (!value || typeof value !== 'object') {
    if (
      typeof value === 'string'
      && keyHint
      && /playlistid|playlist_id/i.test(keyHint)
      && value.trim().length > 0
    ) {
      result.add(value.trim());
    }
    return;
  }

  for (const [key, next] of Object.entries(value as Record<string, unknown>)) {
    extractPlaylistIds(next, result, key);
  }
}

function normalizeStoragePath(rawUrl: string): string | null {
  try {
    if (rawUrl.startsWith('/storage/')) {
      return rawUrl;
    }

    if (/^https?:\/\//i.test(rawUrl)) {
      const parsed = new URL(rawUrl);
      if (parsed.pathname.startsWith('/storage/')) {
        return parsed.pathname;
      }
    }
  } catch {
    return null;
  }

  return null;
}

function collectStorageAssetPaths(value: unknown, result: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectStorageAssetPaths(item, result);
    }
    return;
  }

  if (!value || typeof value !== 'object') {
    if (typeof value === 'string') {
      const normalized = normalizeStoragePath(value);
      if (normalized) {
        result.add(normalized);
      }
    }
    return;
  }

  for (const next of Object.values(value as Record<string, unknown>)) {
    collectStorageAssetPaths(next, result);
  }
}

function extractContentIdFromStoragePath(assetPath: string): string | null {
  const match = assetPath.match(/^\/storage\/[^/]+\/[^/]+\/([^/]+)\/v\d+\//);
  return match ? match[1] : null;
}

export class DisplayRevisionCache {
  private readonly serverUrl: string;
  private readonly identity: Identity;
  private readonly logger: Logger;
  private readonly cacheRoot: string;
  private currentManifest: CachedDisplayRevisionManifest | null = null;
  private currentDeviceConfig: CachedDisplayConfig | null = null;

  constructor(serverUrl: string, identity: Identity, logger: Logger, cacheRoot = DEFAULT_CACHE_ROOT) {
    this.serverUrl = serverUrl;
    this.identity = identity;
    this.logger = logger;
    this.cacheRoot = cacheRoot;
    this.loadCurrentState();
  }

  getCurrentManifest(): CachedDisplayRevisionManifest | null {
    return this.currentManifest;
  }

  getCurrentDeviceConfig(): CachedDisplayConfig | null {
    return this.currentDeviceConfig;
  }

  hasCurrentMultiScreenState(): boolean {
    return Boolean(this.currentManifest && this.currentManifest.totalScreens > 1);
  }

  getCachedDeviceConfig(deviceId: string): CachedDisplayConfig | null {
    const cached = this.currentDeviceConfig;
    if (!cached) return null;

    const cachedDevice = asRecord(cached.device);
    if (String(cachedDevice.id || '') !== deviceId) {
      return null;
    }

    return cached;
  }

  getCachedPlaylist(playlistId: string): Record<string, unknown> | null {
    if (!this.currentManifest) return null;

    const filePath = join(this.currentDir(), 'playlists', `${playlistId}.json`);
    if (!existsSync(filePath)) return null;

    try {
      const raw = readFileSync(filePath, 'utf-8');
      return JSON.parse(raw) as Record<string, unknown>;
    } catch (err) {
      this.logger.warn(`[DisplayCache] Failed to read cached playlist ${playlistId}: ${String(err)}`);
      return null;
    }
  }

  getCachedAssetFile(requestPath: string): string | null {
    if (!this.currentManifest) {
      return null;
    }

    if (!requestPath.startsWith('/storage/')) {
      return null;
    }

    const filePath = resolve(join(this.currentDir(), 'assets', requestPath.replace(/^\//, '')));
    const assetsRoot = resolve(join(this.currentDir(), 'assets'));
    if (!filePath.startsWith(assetsRoot)) {
      return null;
    }

    return existsSync(filePath) ? filePath : null;
  }

  async refreshFromServer(reason: string): Promise<CacheRefreshResult> {
    const deviceConfig = await this.fetchDeviceConfig();
    const assignedApp = asRecord(deviceConfig.assignedApp);
    const appId = String(assignedApp.appId || assignedApp.instanceId || '').trim();
    const templateType = String(assignedApp.templateType || '').trim();

    if (!appId || !templateType) {
      return this.clearCurrentState(deviceConfig, reason);
    }

    const revision = String(assignedApp.revision || '').trim() || `${appId}:${Date.now()}`;
    const updatedAt = assignedApp.updatedAt ? String(assignedApp.updatedAt) : null;
    const sourceConfigHash = hashValue(deviceConfig);
    const stageDir = join(this.cacheRoot, 'staging', fileSafeRevision(`${appId}:${revision}:${sourceConfigHash}`));
    const rawScreenMap = normalizeScreenMap(asRecord(deviceConfig.device).screenMap);
    const totalScreens = this.getTotalScreens(assignedApp, rawScreenMap);
    const screenMap = normalizeScreenMapForTotalScreens(rawScreenMap, totalScreens);

    const playlistIds = new Set<string>();
    extractPlaylistIds(assignedApp.config, playlistIds);

    const assetPaths = new Set<string>();
    collectStorageAssetPaths(assignedApp.config, assetPaths);

    const contentIds = new Set<string>();
    const playlistSnapshots: Array<{ id: string; payload: Record<string, unknown> }> = [];
    const playlistDir = join(stageDir, 'playlists');
    mkdirSync(playlistDir, { recursive: true });

    for (const playlistId of playlistIds) {
      const playlist = await this.fetchPlaylist(playlistId);
      playlistSnapshots.push({ id: playlistId, payload: playlist });
      writeFileSync(join(playlistDir, `${playlistId}.json`), JSON.stringify(playlist, null, 2), 'utf-8');

      const playlistItems = Array.isArray(playlist.items) ? playlist.items : [];
      for (const item of playlistItems) {
        const itemRecord = asRecord(item);
        const url = typeof itemRecord.url === 'string' ? itemRecord.url : '';
        const normalized = normalizeStoragePath(url);
        if (normalized) {
          assetPaths.add(normalized);
        }

        const contentId = typeof itemRecord.contentId === 'string' ? itemRecord.contentId : '';
        if (contentId) {
          contentIds.add(contentId);
        }
      }
    }

    for (const assetPath of assetPaths) {
      const contentId = extractContentIdFromStoragePath(assetPath);
      if (contentId) {
        contentIds.add(contentId);
      }
    }

    const playlistSnapshotHash = hashValue(
      playlistSnapshots
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((entry) => ({ id: entry.id, payload: entry.payload }))
    );
    const resourceSignature = hashValue({
      sourceConfigHash,
      playlistSnapshotHash,
      assetPaths: Array.from(assetPaths).sort(),
      contentIds: Array.from(contentIds).sort(),
      totalScreens,
      screenMap,
    });

    const context: StageContext = {
      deviceConfig,
      assignedApp,
      revision,
      updatedAt,
      sourceConfigHash,
      resourceSignature,
      playlistIds: Array.from(playlistIds),
      contentIds: Array.from(contentIds),
      assetPaths: Array.from(assetPaths).sort(),
      totalScreens,
      screenMap,
      stageDir,
    };

    if (this.isCurrentState(context)) {
      this.logger.debug(`[DisplayCache] No revision change detected for reason=${reason}`);
      return { changed: false, manifest: this.currentManifest, deviceConfig: this.currentDeviceConfig };
    }

    await this.stageContext(context);
    const manifest = await this.promoteStage(context);
    this.currentManifest = manifest;
    this.currentDeviceConfig = deviceConfig;

    this.logger.info(
      `[DisplayCache] Activated revision ${manifest.revision} (${manifest.templateType}) for reason=${reason}`
    );

    return { changed: true, manifest, deviceConfig };
  }

  private loadCurrentState(): void {
    const manifestPath = join(this.currentDir(), 'manifest.json');
    const configPath = join(this.currentDir(), 'device-config.json');
    if (!existsSync(configPath)) {
      return;
    }

    try {
      this.currentDeviceConfig = JSON.parse(readFileSync(configPath, 'utf-8')) as CachedDisplayConfig;
      this.currentManifest = existsSync(manifestPath)
        ? JSON.parse(readFileSync(manifestPath, 'utf-8')) as CachedDisplayRevisionManifest
        : null;
    } catch (err) {
      this.logger.warn(`[DisplayCache] Failed to load current state: ${String(err)}`);
      this.currentManifest = null;
      this.currentDeviceConfig = null;
    }
  }

  private currentDir(): string {
    return join(this.cacheRoot, 'current');
  }

  private async fetchDeviceConfig(): Promise<CachedDisplayConfig> {
    return this.fetchJson<CachedDisplayConfig>(`/api/devices/${encodeURIComponent(this.identity.deviceId)}/config`);
  }

  private async fetchPlaylist(playlistId: string): Promise<Record<string, unknown>> {
    return this.fetchJson<Record<string, unknown>>(`/api/playlists/${encodeURIComponent(playlistId)}`);
  }

  private async fetchJson<T>(path: string): Promise<T> {
    const url = new URL(path, this.serverUrl);
    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${this.identity.apiKey}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Request failed for ${path}: ${response.status}`);
    }

    const raw = await response.json() as ApiEnvelope<T> | T;
    if (raw && typeof raw === 'object' && 'data' in raw) {
      return (raw as ApiEnvelope<T>).data as T;
    }
    return raw as T;
  }

  private getTotalScreens(assignedApp: Record<string, unknown>, screenMap: ScreenMapping[]): number {
    const config = asRecord(assignedApp.config);
    const screens = Array.isArray(config.screens) ? config.screens : [];
    const totalFromConfig = screens.length > 0
      ? screens.length
      : Number(config.totalScreens || 0);
    return Math.max(screenMap.length, Number.isFinite(totalFromConfig) ? Math.floor(totalFromConfig) : 0);
  }

  private isCurrentState(context: StageContext): boolean {
    if (!this.currentManifest) return false;

    return (
      this.currentManifest.revision === context.revision
      && this.currentManifest.sourceConfigHash === context.sourceConfigHash
      && this.currentManifest.resourceSignature === context.resourceSignature
    );
  }

  private async stageContext(context: StageContext): Promise<void> {
    rmSync(stageDirRoot(this.cacheRoot), { recursive: true, force: true });
    mkdirSync(context.stageDir, { recursive: true });
    mkdirSync(join(context.stageDir, 'assets'), { recursive: true });

    if (context.totalScreens > 1 && context.screenMap.length < context.totalScreens) {
      throw new Error(
        `Refusing to activate incomplete multi-screen revision: expected ${context.totalScreens}, got ${context.screenMap.length}`
      );
    }

    for (const assetPath of context.assetPaths) {
      const targetPath = resolve(join(context.stageDir, 'assets', assetPath.replace(/^\//, '')));
      const targetDir = dirname(targetPath);
      mkdirSync(targetDir, { recursive: true });

      const response = await fetch(new URL(assetPath, this.serverUrl).toString(), {
        headers: {
          Authorization: `Bearer ${this.identity.apiKey}`,
        },
      });
      if (!response.ok) {
        throw new Error(`Failed to cache asset ${assetPath}: ${response.status}`);
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      writeFileSync(targetPath, buffer);
    }

    writeFileSync(
      join(context.stageDir, 'device-config.json'),
      JSON.stringify(context.deviceConfig, null, 2),
      'utf-8'
    );

    const manifest: CachedDisplayRevisionManifest = {
      appId: String(context.assignedApp.appId || context.assignedApp.instanceId || ''),
      instanceId: String(context.assignedApp.instanceId || context.assignedApp.appId || ''),
      templateType: String(context.assignedApp.templateType || ''),
      revision: context.revision,
      updatedAt: context.updatedAt,
      sourceConfigHash: context.sourceConfigHash,
      resourceSignature: context.resourceSignature,
      totalScreens: context.totalScreens,
      screenMap: context.screenMap,
      playlistIds: context.playlistIds,
      contentIds: context.contentIds,
      assetPaths: context.assetPaths,
      activatedAt: new Date().toISOString(),
    };

    writeFileSync(join(context.stageDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');
  }

  private async promoteStage(context: StageContext): Promise<CachedDisplayRevisionManifest> {
    const manifestPath = join(context.stageDir, 'manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as CachedDisplayRevisionManifest;
    const currentDir = this.currentDir();
    const nextDir = join(this.cacheRoot, 'next-current');

    rmSync(nextDir, { recursive: true, force: true });
    renameSync(context.stageDir, nextDir);
    rmSync(currentDir, { recursive: true, force: true });
    renameSync(nextDir, currentDir);
    rmSync(stageDirRoot(this.cacheRoot), { recursive: true, force: true });

    return manifest;
  }

  private clearCurrentState(deviceConfig: CachedDisplayConfig, reason: string): CacheRefreshResult {
    const currentConfigHash = hashValue(this.currentDeviceConfig || null);
    const nextConfigHash = hashValue(deviceConfig);
    const hadManifest = Boolean(this.currentManifest);
    const changed = hadManifest || currentConfigHash !== nextConfigHash;

    const currentDir = this.currentDir();
    rmSync(currentDir, { recursive: true, force: true });
    mkdirSync(currentDir, { recursive: true });
    writeFileSync(
      join(currentDir, 'device-config.json'),
      JSON.stringify(deviceConfig, null, 2),
      'utf-8'
    );

    this.currentManifest = null;
    this.currentDeviceConfig = deviceConfig;

    if (changed) {
      this.logger.info(`[DisplayCache] Cleared active revision because no app is assigned (reason=${reason})`);
    } else {
      this.logger.debug(`[DisplayCache] No assigned app and no cache state change for reason=${reason}`);
    }

    return { changed, manifest: null, deviceConfig };
  }
}

function stageDirRoot(cacheRoot: string): string {
  return join(cacheRoot, 'staging');
}
