import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { Logger } from '../lib/logger.js';
import { DisplayRevisionCache } from '../services/displayRevisionCache.js';

const identity = {
  deviceId: 'device-1',
  apiKey: 'api-key-1',
};

function createDeviceConfig(revision: string, assetPath: string) {
  return {
    device: {
      id: identity.deviceId,
      screenMap: [
        { hardwareId: '', url: '/display/lobby' },
        { hardwareId: '', url: '/display/lobby' },
        { hardwareId: '', url: '/display/lobby' },
      ],
    },
    assignedApp: {
      appId: 'app-1',
      instanceId: 'app-1',
      templateType: 'custom06-reception-program',
      revision,
      updatedAt: '2026-04-27T10:00:00.000Z',
      config: {
        screens: [
          { screenIndex: 0, screenLabel: 'Left' },
          { screenIndex: 1, screenLabel: 'Center' },
          { screenIndex: 2, screenLabel: 'Right' },
        ],
        playlistId: 'playlist-1',
        heroVideoUrl: assetPath,
      },
    },
  };
}

describe('DisplayRevisionCache', () => {
  let cacheRoot: string;
  let logger: Logger;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    cacheRoot = mkdtempSync(join(tmpdir(), 'display-cache-test-'));
    logger = new Logger('error');
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    rmSync(cacheRoot, { recursive: true, force: true });
  });

  it('stages and activates a multi-screen revision only after assets are cached', async () => {
    fetchMock.mockImplementation(async (input: string | URL) => {
      const url = String(input);
      if (url.endsWith('/api/devices/device-1/config')) {
        return new Response(JSON.stringify({
          success: true,
          data: createDeviceConfig('rev-1', '/storage/site/video/content-a/v1/a.mp4'),
        }), { status: 200 });
      }
      if (url.endsWith('/api/playlists/playlist-1')) {
        return new Response(JSON.stringify({
          success: true,
          data: {
            id: 'playlist-1',
            items: [
              { id: 'item-1', contentId: 'content-b', url: '/storage/site/image/content-b/v2/b.jpg' },
            ],
          },
        }), { status: 200 });
      }
      if (url.includes('/storage/site/video/content-a/v1/a.mp4')) {
        return new Response('video-a', { status: 200 });
      }
      if (url.includes('/storage/site/image/content-b/v2/b.jpg')) {
        return new Response('image-b', { status: 200 });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const cache = new DisplayRevisionCache('http://example.test', identity, logger, cacheRoot);
    const result = await cache.refreshFromServer('initial-sync');

    expect(result.changed).toBe(true);
    expect(result.manifest?.revision).toBe('rev-1');
    expect(result.manifest?.totalScreens).toBe(3);
    expect(result.manifest?.screenMap).toHaveLength(3);
    expect(typeof result.manifest?.resourceSignature).toBe('string');
    expect(result.manifest?.playlistIds).toEqual(['playlist-1']);
    expect(result.manifest?.contentIds.sort()).toEqual(['content-a', 'content-b']);
    expect(cache.hasCurrentMultiScreenState()).toBe(true);
    expect(existsSync(join(cacheRoot, 'current', 'device-config.json'))).toBe(true);
    expect(existsSync(join(cacheRoot, 'current', 'assets', 'storage', 'site', 'video', 'content-a', 'v1', 'a.mp4'))).toBe(true);
    expect(existsSync(join(cacheRoot, 'current', 'assets', 'storage', 'site', 'image', 'content-b', 'v2', 'b.jpg'))).toBe(true);
  });

  it('keeps the last good revision active when staging a new revision fails', async () => {
    const cache = new DisplayRevisionCache('http://example.test', identity, logger, cacheRoot);

    fetchMock.mockImplementation(async (input: string | URL) => {
      const url = String(input);
      if (url.endsWith('/api/devices/device-1/config')) {
        return new Response(JSON.stringify({
          success: true,
          data: createDeviceConfig('rev-1', '/storage/site/video/content-a/v1/a.mp4'),
        }), { status: 200 });
      }
      if (url.endsWith('/api/playlists/playlist-1')) {
        return new Response(JSON.stringify({
          success: true,
          data: { id: 'playlist-1', items: [] },
        }), { status: 200 });
      }
      if (url.includes('/storage/site/video/content-a/v1/a.mp4')) {
        return new Response('video-a', { status: 200 });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    await cache.refreshFromServer('initial-sync');
    expect(cache.getCurrentManifest()?.revision).toBe('rev-1');

    fetchMock.mockImplementation(async (input: string | URL) => {
      const url = String(input);
      if (url.endsWith('/api/devices/device-1/config')) {
        return new Response(JSON.stringify({
          success: true,
          data: createDeviceConfig('rev-2', '/storage/site/video/content-c/v2/c.mp4'),
        }), { status: 200 });
      }
      if (url.endsWith('/api/playlists/playlist-1')) {
        return new Response(JSON.stringify({
          success: true,
          data: { id: 'playlist-1', items: [] },
        }), { status: 200 });
      }
      if (url.includes('/storage/site/video/content-c/v2/c.mp4')) {
        return new Response('missing', { status: 500 });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    await expect(cache.refreshFromServer('app-save')).rejects.toThrow('Failed to cache asset');
    expect(cache.getCurrentManifest()?.revision).toBe('rev-1');
    expect(existsSync(join(cacheRoot, 'current', 'assets', 'storage', 'site', 'video', 'content-a', 'v1', 'a.mp4'))).toBe(true);
    expect(existsSync(join(cacheRoot, 'current', 'assets', 'storage', 'site', 'video', 'content-c', 'v2', 'c.mp4'))).toBe(false);
  });

  it('clears the active revision when the server says the device is unassigned', async () => {
    const cache = new DisplayRevisionCache('http://example.test', identity, logger, cacheRoot);

    fetchMock.mockImplementation(async (input: string | URL) => {
      const url = String(input);
      if (url.endsWith('/api/devices/device-1/config')) {
        return new Response(JSON.stringify({
          success: true,
          data: createDeviceConfig('rev-1', '/storage/site/video/content-a/v1/a.mp4'),
        }), { status: 200 });
      }
      if (url.endsWith('/api/playlists/playlist-1')) {
        return new Response(JSON.stringify({
          success: true,
          data: { id: 'playlist-1', items: [] },
        }), { status: 200 });
      }
      if (url.includes('/storage/site/video/content-a/v1/a.mp4')) {
        return new Response('video-a', { status: 200 });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    await cache.refreshFromServer('initial-sync');
    expect(cache.getCurrentManifest()?.revision).toBe('rev-1');

    fetchMock.mockImplementation(async (input: string | URL) => {
      const url = String(input);
      if (url.endsWith('/api/devices/device-1/config')) {
        return new Response(JSON.stringify({
          success: true,
          data: {
            device: {
              id: identity.deviceId,
              screenMap: [],
            },
            assignedApp: null,
          },
        }), { status: 200 });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const result = await cache.refreshFromServer('device-app-unassigned');

    expect(result.changed).toBe(true);
    expect(result.manifest).toBeNull();
    expect(cache.getCurrentManifest()).toBeNull();
    expect(cache.getCurrentDeviceConfig()).toEqual({
      device: {
        id: identity.deviceId,
        screenMap: [],
      },
      assignedApp: null,
    });
    expect(existsSync(join(cacheRoot, 'current', 'device-config.json'))).toBe(true);
    expect(existsSync(join(cacheRoot, 'current', 'manifest.json'))).toBe(false);
  });
});
